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
import { listingUrl, sampleListings, sampleSourceHost } from "./sampleSource";
import { requireUserKey } from "./session";

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

export const getSourceByDomain = internalQuery({
  args: { domain: v.string() },
  returns: approvedSource,
  handler: async (ctx, args) => {
    const source = await ctx.db
      .query("sources")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain))
      .unique();
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
    isSample: v.optional(v.boolean()),
  },
  returns: v.object({
    listingId: v.id("listings"),
    inserted: v.boolean(),
    score: v.number(),
  }),
  handler: async (ctx, args) => {
    const criteria = await ctx.db
      .query("criteria")
      .withIndex("by_session_and_updated_at", (q) => q.eq("sessionId", args.sessionId))
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
      isSample: args.isSample ?? false,
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

export const scrapeApprovedListingInternal = internalAction({
  args: {
    sourceId: v.id("sources"),
    url: v.string(),
    owner: v.string(),
    isSample: v.optional(v.boolean()),
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
      sessionId: args.owner,
      isSample: args.isSample,
    });
  },
});

export const scrapeApprovedListing = action({
  args: {
    sourceId: v.id("sources"),
    url: v.string(),
  },
  returns: v.object({
    listingId: v.id("listings"),
    inserted: v.boolean(),
    score: v.number(),
  }),
  handler: async (ctx, args): Promise<DiscoveryResult> => {
    const owner = await requireUserKey(ctx);
    if (args.url.length > 2_048) throw new Error("Source URLs must be 2,048 characters or fewer.");
    await ctx.runMutation(internal.rateLimits.reserve, {
      owner,
      capability: "firecrawl",
    });
    return await ctx.runAction(internal.discovery.scrapeApprovedListingInternal, {
      sourceId: args.sourceId,
      url: args.url,
      owner,
      isSample: false,
    });
  },
});

/**
 * Runs Firecrawl across the sample source this deployment operates and permits.
 * Every page goes through the same internal scraper, so the permission and
 * host checks apply here exactly as they do to a one-off scrape.
 */
export const sweepSampleSource = action({
  args: { city: v.string(), areas: v.array(v.string()) },
  returns: v.object({
    attempted: v.number(),
    inserted: v.number(),
    updated: v.number(),
    failed: v.number(),
    durationMs: v.number(),
    firstError: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const owner = await requireUserKey(ctx);
    const site = process.env.CONVEX_SITE_URL;
    const host = sampleSourceHost();
    if (!site || !host) {
      throw new Error("CONVEX_SITE_URL is not available on this deployment.");
    }
    if (!site.startsWith("https://")) {
      throw new Error(
        "The sample source needs a deployed backend. Firecrawl cannot reach a local " +
          "Convex backend, so run this against a convex.site deployment.",
      );
    }
    await ctx.runMutation(internal.sampleSource.register, { city: args.city });
    const source: DiscoverySource | null = await ctx.runQuery(
      internal.discovery.getSourceByDomain,
      { domain: host },
    );
    if (!source) throw new Error("The sample source could not be registered.");
    if (source.permissionStatus !== "approved") {
      throw new Error("Written source permission is required before discovery.");
    }

    if (args.areas.length > 20) {
      throw new Error("Keep the sweep to 20 preferred areas or fewer.");
    }
    const areas = [...new Set(args.areas.map((area) => area.trim()).filter(Boolean))];
    if (areas.length === 0) {
      throw new Error("Add at least one preferred area before sweeping.");
    }
    if (areas.some((area) => area.length > 60)) {
      throw new Error("Area names must be 60 characters or fewer.");
    }
    const targets = sampleListings.map((listing, index) => ({
      listing,
      place: { city: args.city, area: areas[index % areas.length] },
    }));

    await ctx.runMutation(internal.rateLimits.reserve, {
      owner,
      capability: "firecrawl",
      cost: targets.length,
    });

    const startedAt = Date.now();
    let inserted = 0;
    let updated = 0;
    let failed = 0;
    let firstError: string | null = null;

    for (const target of targets) {
      try {
        const result: DiscoveryResult = await ctx.runAction(
          internal.discovery.scrapeApprovedListingInternal,
          {
            sourceId: source._id,
            url: listingUrl(site, target.listing.slug, target.place),
            owner,
            isSample: true,
          },
        );
        if (result.inserted) inserted += 1;
        else updated += 1;
      } catch (error) {
        failed += 1;
        firstError ??= error instanceof Error ? error.message : String(error);
      }
    }

    const durationMs = Date.now() - startedAt;
    await ctx.runMutation(internal.workspace.recordValidationRun, {
      sourceDomain: host,
      permissionStatus: source.permissionStatus,
      attempted: sampleListings.length,
      parsed: inserted + updated,
      deduplicated: updated,
      contactable: inserted + updated,
      durationMs,
      notes: firstError ?? "Sweep completed",
    });

    return {
      attempted: sampleListings.length,
      inserted,
      updated,
      failed,
      durationMs,
      firstError,
    };
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
