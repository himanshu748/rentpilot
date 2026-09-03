import { FirecrawlClient } from "@firecrawl/firecrawl-convex";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";

const firecrawl = new FirecrawlClient(components.firecrawl);

type DiscoveryResult = {
  listingId: Id<"listings">;
  inserted: boolean;
  score: number;
};

type DiscoverySource = {
  _id: Id<"sources">;
  domain: string;
  permissionStatus: "approved" | "review_required" | "blocked";
};

const extractedListing = v.object({
  title: v.string(),
  rent: v.number(),
  locality: v.string(),
  bedrooms: v.string(),
  contactEmail: v.union(v.string(), v.null()),
  contactPhone: v.union(v.string(), v.null()),
});

const approvedSource = v.union(
  v.object({
    _id: v.id("sources"),
    domain: v.string(),
    permissionStatus: v.union(
      v.literal("approved"),
      v.literal("review_required"),
      v.literal("blocked"),
    ),
  }),
  v.null(),
);

export const getSourceForDiscovery = internalQuery({
  args: { sourceId: v.id("sources") },
  returns: approvedSource,
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    return source
      ? {
          _id: source._id,
          domain: source.domain,
          permissionStatus: source.permissionStatus,
        }
      : null;
  },
});

export const persistExtractedListing = internalMutation({
  args: {
    sourceId: v.id("sources"),
    canonicalUrl: v.string(),
    contentHash: v.string(),
    extracted: extractedListing,
    sessionId: v.optional(v.string()),
  },
  returns: v.object({
    listingId: v.id("listings"),
    inserted: v.boolean(),
    score: v.number(),
  }),
  handler: async (ctx, args) => {
    const criteria = args.sessionId
      ? await ctx.db
          .query("criteria")
          .withIndex("by_session_and_updated_at", (q) => q.eq("sessionId", args.sessionId))
          .order("desc")
          .first()
      : await ctx.db
          .query("criteria")
          .withIndex("by_session_and_updated_at", (q) => q.eq("sessionId", undefined))
          .order("desc")
          .first();
    if (!criteria) throw new Error("Search criteria must exist before discovery.");

    const budgetScore =
      args.extracted.rent >= criteria.budgetMin &&
      args.extracted.rent <= criteria.budgetMax
        ? 30
        : args.extracted.rent <= criteria.budgetMax * 1.2
          ? 15
          : 0;
    const localityScore = criteria.localities.some((locality) =>
      args.extracted.locality.toLowerCase().includes(locality.toLowerCase()),
    )
      ? 30
      : 8;
    const hasContact = Boolean(
      args.extracted.contactEmail || args.extracted.contactPhone,
    );
    const evidenceScore = hasContact ? 25 : 14;
    const freshnessScore = 15;
    const score = budgetScore + localityScore + evidenceScore + freshnessScore;
    const missingFields = [
      ...(hasContact ? [] : ["contact path"]),
      ...(args.extracted.bedrooms.trim() ? [] : ["bedroom type"]),
    ];
    const now = Date.now();
    const existing = await ctx.db
      .query("listings")
      .withIndex("by_session_and_canonical_url", (q) =>
        q.eq("sessionId", args.sessionId).eq("canonicalUrl", args.canonicalUrl),
      )
      .first();

    const listingFields = {
      sessionId: args.sessionId,
      city: criteria.city ?? "Bengaluru",
      sourceId: args.sourceId,
      externalListingId: null,
      canonicalUrl: args.canonicalUrl,
      contentHash: args.contentHash,
      lastSeenAt: now,
      discoveredAt: existing?.discoveredAt ?? now,
      title: args.extracted.title,
      rent: args.extracted.rent,
      locality: args.extracted.locality,
      bedrooms: args.extracted.bedrooms,
      contactEmail: args.extracted.contactEmail,
      contactPhone: args.extracted.contactPhone,
      missingFields,
      score,
      scoreConfidence: missingFields.length === 0 ? 92 : 76,
      scoreBreakdown: [
        {
          label: "Budget",
          value: budgetScore,
          note: budgetScore === 30 ? "Inside selected range" : "Outside ideal range",
        },
        {
          label: "Locality",
          value: localityScore,
          note: localityScore === 30 ? "Preferred neighbourhood" : "Outside preferred areas",
        },
        {
          label: "Evidence",
          value: evidenceScore,
          note: hasContact ? "Public contact path found" : "Contact path missing",
        },
        {
          label: "Freshness",
          value: freshnessScore,
          note: "Fetched in the current sweep",
        },
      ],
      status: existing?.status ?? ("new" as const),
      isDemo: false,
    };

    if (existing) {
      await ctx.db.patch(existing._id, listingFields);
      return { listingId: existing._id, inserted: false, score };
    }

    const listingId = await ctx.db.insert("listings", listingFields);
    await ctx.db.insert("threads", {
      listingId,
      draftSubject: `Viewing request: ${args.extracted.title}`,
      draftBody: `Hi, I found your ${args.extracted.bedrooms.toLowerCase()} in ${args.extracted.locality}. Is it still available? I would like to arrange a viewing this week.`,
      sendStatus: hasContact ? "ready" : "draft",
      sendRequestId: null,
      agentmailOutboundId: null,
      agentMailThreadRef: null,
      sentAt: null,
      lastReplyIntent: null,
      lastReplySummary: null,
    });
    await ctx.db.insert("activity", {
      sessionId: args.sessionId,
      listingId,
      type: "found",
      message: `${args.extracted.title} discovered through Firecrawl`,
      createdAt: now,
      isDemo: false,
    });
    return { listingId, inserted: true, score };
  },
});

export const scrapeApprovedListing = action({
  args: {
    sourceId: v.id("sources"),
    url: v.string(),
    sessionId: v.optional(v.string()),
  },
  returns: v.object({
    listingId: v.id("listings"),
    inserted: v.boolean(),
    score: v.number(),
  }),
  handler: async (ctx, args): Promise<DiscoveryResult> => {
    const source: DiscoverySource | null = await ctx.runQuery(
      internal.discovery.getSourceForDiscovery,
      {
        sourceId: args.sourceId,
      },
    );
    if (!source) throw new Error("Source not found.");
    if (source.permissionStatus !== "approved") {
      throw new Error("Written source permission is required before discovery.");
    }

    const parsedUrl = new URL(args.url);
    if (parsedUrl.protocol !== "https:") {
      throw new Error("Only https source URLs can be fetched.");
    }
    const allowedHost =
      parsedUrl.hostname === source.domain ||
      parsedUrl.hostname.endsWith(`.${source.domain}`);
    if (!allowedHost) throw new Error("URL does not belong to the approved source.");

    const page = await firecrawl.scrape(ctx, parsedUrl.toString(), {
      formats: [
        {
          type: "json",
          prompt:
            "Extract one active residential rental listing. Use the advertised monthly rent as a number in INR. Return public contact details only when visibly published by the lister.",
          schema: {
            type: "object",
            required: ["title", "rent", "locality", "bedrooms"],
            properties: {
              title: { type: "string" },
              rent: { type: "number" },
              locality: { type: "string" },
              bedrooms: { type: "string" },
              contactEmail: { type: ["string", "null"] },
              contactPhone: { type: ["string", "null"] },
            },
          },
        },
      ],
      onlyMainContent: true,
      removeBase64Images: true,
      maxAge: 15 * 60 * 1000,
    });
    const raw = page.json;
    if (!raw || typeof raw !== "object") {
      throw new Error("Firecrawl did not return a structured listing.");
    }
    const record = raw as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    const rent = typeof record.rent === "number" ? record.rent : Number.NaN;
    const locality =
      typeof record.locality === "string" ? record.locality.trim() : "";
    const bedrooms =
      typeof record.bedrooms === "string" ? record.bedrooms.trim() : "";
    if (!title || !Number.isFinite(rent) || rent <= 0 || !locality || !bedrooms) {
      throw new Error("The extracted listing is missing required fields.");
    }

    const extracted = {
      title,
      rent,
      locality,
      bedrooms,
      contactEmail:
        typeof record.contactEmail === "string" ? record.contactEmail : null,
      contactPhone:
        typeof record.contactPhone === "string" ? record.contactPhone : null,
    };
    const contentHash = `${title.toLowerCase()}|${rent}|${locality.toLowerCase()}|${bedrooms.toLowerCase()}`;
    return await ctx.runMutation(internal.discovery.persistExtractedListing, {
      sourceId: source._id,
      canonicalUrl: parsedUrl.toString(),
      contentHash,
      extracted,
      sessionId: args.sessionId,
    });
  },
});

export const probeFirecrawl = internalAction({
  args: {},
  returns: v.object({
    ok: v.boolean(),
    statusCode: v.union(v.number(), v.null()),
    title: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const page = await firecrawl.scrape(ctx, "https://example.com", {
      formats: ["summary"],
      onlyMainContent: true,
      maxAge: 60 * 60 * 1000,
    });
    return {
      ok: Boolean(page.summary),
      statusCode:
        typeof page.metadata?.statusCode === "number"
          ? page.metadata.statusCode
          : null,
      title:
        typeof page.metadata?.title === "string" ? page.metadata.title : null,
    };
  },
});
