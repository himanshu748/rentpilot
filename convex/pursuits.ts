import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertListingInSession, ownerKey } from "./session";
import { amenityEvidence, pursuitStatus, sendStatus } from "./schema";
import { sameMarket } from "./location";
import { eligibilityProblems } from "./eligibility";

const scorePart = v.object({
  label: v.string(),
  value: v.number(),
  note: v.string(),
});

const pursuit = v.object({
  _id: v.id("listings"),
  _creationTime: v.number(),
  sessionId: v.optional(v.string()),
  city: v.optional(v.string()),
  country: v.optional(v.string()),
  currency: v.optional(v.string()),
  sourceId: v.id("sources"),
  sourceName: v.string(),
  sourceDomain: v.string(),
  externalListingId: v.union(v.string(), v.null()),
  canonicalUrl: v.string(),
  contentHash: v.string(),
  lastSeenAt: v.number(),
  discoveredAt: v.number(),
  title: v.string(),
  rent: v.number(),
  locality: v.string(),
  bedrooms: v.string(),
  amenityEvidence: v.optional(amenityEvidence),
  contactEmail: v.union(v.string(), v.null()),
  contactPhone: v.union(v.string(), v.null()),
  missingFields: v.array(v.string()),
  score: v.union(v.number(), v.null()),
  scoreConfidence: v.union(v.number(), v.null()),
  scoreBreakdown: v.array(scorePart),
  status: pursuitStatus,
  isDemo: v.boolean(),
  isSample: v.boolean(),
  thread: v.union(
    v.object({
      _id: v.id("threads"),
      draftSubject: v.string(),
      draftBody: v.string(),
      draftedByModel: v.union(v.string(), v.null()),
      sendStatus,
      agentmailOutboundId: v.union(v.string(), v.null()),
      lastReplySummary: v.union(v.string(), v.null()),
      lastReplyFrom: v.union(v.string(), v.null()),
      lastReplyAt: v.union(v.number(), v.null()),
    }),
    v.null(),
  ),
});

export const list = query({
  args: { sessionId: v.optional(v.string()) },
  returns: v.array(pursuit),
  handler: async (ctx, args) => {
    const owner = await ownerKey(ctx, args.sessionId);
    if (!owner) return [];
    const criteria = await ctx.db.query("criteria")
      .withIndex("by_session_and_updated_at", (q) => q.eq("sessionId", owner))
      .order("desc").first();
    if (!criteria) return [];
    const listings = await ctx.db
      .query("listings")
      .withIndex("by_session_and_last_seen_at", (q) => q.eq("sessionId", owner))
      .order("desc")
      .take(50);

    return await Promise.all(
      listings.filter((listing) => sameMarket(listing, criteria) && eligibilityProblems(listing, criteria).length === 0).map(async (listing) => {
        const source = await ctx.db.get(listing.sourceId);
        const thread = await ctx.db
          .query("threads")
          .withIndex("by_listing", (q) => q.eq("listingId", listing._id))
          .unique();

        return {
          ...listing,
          isSample: listing.isSample ?? false,
          sourceName: source?.name ?? "Unknown source",
          sourceDomain: source?.domain ?? "unknown",
          thread: thread
            ? {
                _id: thread._id,
                draftSubject: thread.draftSubject,
                draftBody: thread.draftBody,
                draftedByModel: thread.draftedByModel ?? null,
                sendStatus: thread.sendStatus,
                agentmailOutboundId: thread.agentmailOutboundId,
                lastReplySummary: thread.lastReplySummary,
                lastReplyFrom: thread.lastReplyFrom ?? null,
                lastReplyAt: thread.lastReplyAt ?? null,
              }
            : null,
        };
      }),
    );
  },
});

export const updateDraft = mutation({
  args: {
    threadId: v.id("threads"),
    sessionId: v.optional(v.string()),
    subject: v.string(),
    body: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Inquiry thread not found.");
    const listing = await assertListingInSession(
      ctx,
      thread.listingId,
      await ownerKey(ctx, args.sessionId),
    );
    if (thread.sendStatus === "sending" || thread.sendStatus === "sent") {
      throw new Error("This inquiry has already been sent and can no longer be edited.");
    }
    if (!thread.draftedByModel) {
      throw new Error("Generate this inquiry with OpenAI before approving it.");
    }

    const subject = args.subject.trim();
    const body = args.body.trim();
    if (subject.length < 3 || body.length < 20) {
      throw new Error("A useful subject and message are required.");
    }
    if (subject.length > 120 || body.length > 5_000) {
      throw new Error("Keep the subject under 120 characters and the message under 5,000.");
    }
    await ctx.db.patch(args.threadId, {
      draftSubject: subject,
      draftBody: body,
      sendStatus: "ready",
    });
    await ctx.db.patch(listing._id, { status: "drafted" });
    return null;
  },
});

export const transition = mutation({
  args: {
    listingId: v.id("listings"),
    sessionId: v.optional(v.string()),
    status: pursuitStatus,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const listing = await assertListingInSession(ctx, args.listingId, await ownerKey(ctx, args.sessionId));
    await ctx.db.patch(args.listingId, { status: args.status });
    await ctx.db.insert("activity", {
      sessionId: listing.sessionId,
      listingId: args.listingId,
      type: args.status === "viewing" ? "viewing" : "system",
      message:
        args.status === "viewing"
          ? "Viewing marked as booked"
          : `Pursuit moved to ${args.status}`,
      createdAt: Date.now(),
      isDemo: false,
    });
    return null;
  },
});
