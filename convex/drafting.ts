import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { isListingInSession, ownerKey } from "./session";

/**
 * OpenAI writes the inquiry, never the ranking. Scores stay deterministic in
 * Convex so the same listing and brief always produce the same number; the
 * model only turns that evidence into a message a human then edits and approves.
 */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";

const draftContext = v.union(
  v.object({
    threadId: v.id("threads"),
    title: v.string(),
    locality: v.string(),
    rent: v.number(),
    bedrooms: v.string(),
    city: v.string(),
    missingFields: v.array(v.string()),
    mustHaves: v.array(v.string()),
    budgetMax: v.number(),
    renterName: v.string(),
    renterEmail: v.union(v.string(), v.null()),
    alreadySent: v.boolean(),
  }),
  v.null(),
);

export const getDraftContext = internalQuery({
  args: { listingId: v.id("listings"), sessionId: v.optional(v.string()) },
  returns: draftContext,
  handler: async (ctx, args) => {
    const owner = await ownerKey(ctx, args.sessionId);
    const listing = await ctx.db.get(args.listingId);
    if (!listing) return null;
    if (!isListingInSession(listing, owner)) {
      throw new Error("This pursuit belongs to another search session.");
    }
    const thread = await ctx.db
      .query("threads")
      .withIndex("by_listing", (q) => q.eq("listingId", listing._id))
      .unique();
    if (!thread) return null;

    const criteria = await ctx.db
      .query("criteria")
      .withIndex("by_session_and_updated_at", (q) => q.eq("sessionId", owner))
      .order("desc")
      .first();

    return {
      threadId: thread._id,
      title: listing.title,
      locality: listing.locality,
      rent: listing.rent,
      bedrooms: listing.bedrooms,
      city: listing.city ?? criteria?.city ?? "your city",
      missingFields: listing.missingFields,
      mustHaves: criteria?.mustHaves ?? [],
      budgetMax: criteria?.budgetMax ?? 0,
      renterName: criteria?.contactName ?? "",
      renterEmail: criteria?.contactEmail ?? null,
      alreadySent: thread.sendStatus === "sending" || thread.sendStatus === "sent",
    };
  },
});

export const saveGeneratedDraft = internalMutation({
  args: {
    threadId: v.id("threads"),
    sessionId: v.optional(v.string()),
    subject: v.string(),
    body: v.string(),
    model: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Inquiry thread not found.");
    const listing = await ctx.db.get(thread.listingId);
    if (!listing) throw new Error("Pursuit not found.");
    if (!isListingInSession(listing, await ownerKey(ctx, args.sessionId))) {
      throw new Error("This pursuit belongs to another search session.");
    }
    if (thread.sendStatus === "sending" || thread.sendStatus === "sent") {
      throw new Error("This inquiry has already been sent and can no longer be rewritten.");
    }

    await ctx.db.patch(thread._id, {
      draftSubject: args.subject,
      draftBody: args.body,
      sendStatus: "draft",
    });
    await ctx.db.insert("activity", {
      sessionId: listing.sessionId,
      listingId: listing._id,
      type: "draft",
      message: `${args.model} drafted the inquiry for ${listing.title}. It needs your approval.`,
      createdAt: Date.now(),
      isDemo: false,
    });
    return null;
  },
});

export const writeInquiry = action({
  args: {
    listingId: v.id("listings"),
    sessionId: v.optional(v.string()),
    tone: v.optional(v.union(v.literal("standard"), v.literal("brief"), v.literal("warm"))),
  },
  returns: v.object({ subject: v.string(), body: v.string(), model: v.string() }),
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.drafting.getDraftContext, {
      listingId: args.listingId,
      sessionId: args.sessionId,
    });
    if (!context) throw new Error("This pursuit has no inquiry thread yet.");
    if (context.alreadySent) {
      throw new Error("This inquiry has already been sent and can no longer be rewritten.");
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OpenAI is not configured. Set OPENAI_API_KEY with: npx convex env set OPENAI_API_KEY sk-...",
      );
    }
    const model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;

    const tone =
      args.tone === "brief"
        ? "Keep it to three sentences."
        : args.tone === "warm"
          ? "Sound friendly but still concise."
          : "Keep it businesslike and concise.";

    const facts = [
      `Listing: ${context.title}`,
      `Area: ${context.locality}, ${context.city}`,
      `Type: ${context.bedrooms}`,
      `Advertised rent: INR ${context.rent} per month`,
      context.budgetMax > 0 ? `Renter's ceiling: INR ${context.budgetMax} per month` : null,
      context.mustHaves.length > 0
        ? `Renter's requirements: ${context.mustHaves.join(", ")}`
        : null,
      context.missingFields.length > 0
        ? `Details the listing does not state: ${context.missingFields.join(", ")}`
        : null,
      context.renterName ? `Sender's name: ${context.renterName}` : null,
      context.renterEmail ? `Sender's reply address: ${context.renterEmail}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You write short rental viewing inquiries on behalf of a prospective tenant. " +
              "Use only the facts given. Never invent move-in dates, budgets, employment, " +
              "references or personal details. Never claim to be an agent or to have viewed " +
              "the property. If a detail is listed as missing, ask about it in one clause. " +
              "If a sender name is given, sign off with it. If a reply address is given, state " +
              "it once so the landlord can answer directly. Never invent either. " +
              'Reply as JSON: {"subject": string, "body": string}. The subject is under 70 ' +
              "characters. The body is plain text, no greeting placeholders like [Name], and " +
              "signs off with nothing after the final sentence.",
          },
          {
            role: "user",
            content: `${facts}\n\n${tone} Ask whether it is still available and request a viewing this week.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `OpenAI rejected the request (${response.status}). ${detail.slice(0, 200)}`,
      );
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = payload.choices?.[0]?.message?.content;
    if (!raw) throw new Error("OpenAI returned an empty draft.");

    let parsed: { subject?: unknown; body?: unknown };
    try {
      parsed = JSON.parse(raw) as { subject?: unknown; body?: unknown };
    } catch {
      throw new Error("OpenAI returned a draft that was not valid JSON.");
    }
    const subject = typeof parsed.subject === "string" ? parsed.subject.trim() : "";
    const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
    if (subject.length < 3 || body.length < 20) {
      throw new Error("OpenAI returned a draft that was too short to send.");
    }

    await ctx.runMutation(internal.drafting.saveGeneratedDraft, {
      threadId: context.threadId,
      sessionId: args.sessionId,
      subject,
      body,
      model,
    });
    return { subject, body, model };
  },
});
