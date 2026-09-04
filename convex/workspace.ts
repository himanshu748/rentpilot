import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { isAnonymousSessionId, ownerKey, userKey } from "./session";

const permissionStatus = v.union(
  v.literal("approved"),
  v.literal("review_required"),
  v.literal("blocked"),
);

const sourceType = v.union(
  v.literal("portal"),
  v.literal("community"),
  v.literal("direct"),
);

const criteriaResult = v.union(
  v.object({
    _id: v.id("criteria"),
    _creationTime: v.number(),
    city: v.string(),
    sessionId: v.union(v.string(), v.null()),
    budgetMin: v.number(),
    budgetMax: v.number(),
    localities: v.array(v.string()),
    bedrooms: v.array(v.string()),
    mustHaves: v.array(v.string()),
    contactName: v.string(),
    contactEmail: v.union(v.string(), v.null()),
    updatedAt: v.number(),
  }),
  v.null(),
);

/** Deliberately permissive: enough to catch a typo, not to police valid addresses. */
export function isEmailish(value: string) {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value);
}

export const getCriteria = query({
  args: { sessionId: v.optional(v.string()) },
  returns: criteriaResult,
  handler: async (ctx, args) => {
    const owner = await ownerKey(ctx, args.sessionId);
    const sessionCriteria = owner
      ? await ctx.db
          .query("criteria")
          .withIndex("by_session_and_updated_at", (q) => q.eq("sessionId", owner))
          .order("desc")
          .first()
      : null;
    const criteria =
      sessionCriteria ??
      (await ctx.db
        .query("criteria")
        .withIndex("by_session_and_updated_at", (q) => q.eq("sessionId", undefined))
        .order("desc")
        .first());
    return criteria
      ? {
          ...criteria,
          city: criteria.city ?? "Bengaluru",
          sessionId: criteria.sessionId ?? null,
          contactName: criteria.contactName ?? "",
          contactEmail: criteria.contactEmail ?? null,
        }
      : null;
  },
});

export const saveCriteria = mutation({
  args: {
    sessionId: v.string(),
    city: v.string(),
    budgetMin: v.number(),
    budgetMax: v.number(),
    localities: v.array(v.string()),
    bedrooms: v.array(v.string()),
    mustHaves: v.array(v.string()),
    contactName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
  },
  returns: v.id("criteria"),
  handler: async (ctx, args) => {
    const city = args.city.trim();
    const contactName = args.contactName?.trim() ?? "";
    const contactEmail = args.contactEmail?.trim() ?? "";
    const userId = await getAuthUserId(ctx);
    if (!userId && !isAnonymousSessionId(args.sessionId)) {
      throw new Error("This anonymous session id is invalid.");
    }
    if (args.localities.length > 20 || args.bedrooms.length > 10 || args.mustHaves.length > 20) {
      throw new Error("Keep the search brief to a focused set of preferences.");
    }
    if (contactEmail && !isEmailish(contactEmail)) {
      throw new Error("Enter an email address a landlord could reply to.");
    }
    if (contactEmail.length > 254 || contactName.length > 80) {
      throw new Error("Contact details are too long.");
    }
    const localities = [...new Set(args.localities.map((area) => area.trim()).filter(Boolean))];
    const bedrooms = [...new Set(args.bedrooms.map((type) => type.trim()).filter(Boolean))];
    const mustHaves = [...new Set(args.mustHaves.map((item) => item.trim()).filter(Boolean))];

    if (city.length < 2 || city.length > 60) {
      throw new Error("Choose a city between 2 and 60 characters.");
    }
    if (
      localities.some((value) => value.length > 80) ||
      bedrooms.some((value) => value.length > 40) ||
      mustHaves.some((value) => value.length > 120)
    ) {
      throw new Error("One or more search preferences are too long.");
    }
    if (localities.length === 0) throw new Error("Add at least one preferred area.");
    if (bedrooms.length === 0) throw new Error("Choose at least one home type.");
    if (
      !Number.isFinite(args.budgetMin) ||
      !Number.isFinite(args.budgetMax) ||
      args.budgetMin < 0 ||
      args.budgetMax > 100_000_000 ||
      args.budgetMax <= args.budgetMin
    ) {
      throw new Error("Maximum budget must be higher than minimum budget.");
    }

    const owner = await ownerKey(ctx, args.sessionId);
    const criteriaId = await ctx.db.insert("criteria", {
      sessionId: owner,
      city,
      budgetMin: Math.round(args.budgetMin),
      budgetMax: Math.round(args.budgetMax),
      localities,
      bedrooms,
      mustHaves,
      contactName: contactName || undefined,
      contactEmail: contactEmail || undefined,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("activity", {
      sessionId: owner,
      listingId: null,
      type: "system",
      message: `Search brief updated for ${city}`,
      createdAt: Date.now(),
      isDemo: false,
    });
    return criteriaId;
  },
});

export const listActivity = query({
  args: { sessionId: v.optional(v.string()) },
  returns: v.array(
    v.object({
      _id: v.id("activity"),
      _creationTime: v.number(),
      sessionId: v.optional(v.string()),
      listingId: v.union(v.id("listings"), v.null()),
      type: v.string(),
      message: v.string(),
      createdAt: v.number(),
      isDemo: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const owner = await ownerKey(ctx, args.sessionId);
    if (!owner) {
      return await ctx.db
        .query("activity")
        .withIndex("by_session_and_created_at", (q) => q.eq("sessionId", undefined))
        .order("desc")
        .take(20);
    }
    const [personal, shared] = await Promise.all([
      ctx.db
        .query("activity")
        .withIndex("by_session_and_created_at", (q) => q.eq("sessionId", owner))
        .order("desc")
        .take(12),
      ctx.db
        .query("activity")
        .withIndex("by_session_and_created_at", (q) => q.eq("sessionId", undefined))
        .order("desc")
        .take(12),
    ]);
    return [...personal, ...shared].sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
  },
});

/**
 * Moves everything an anonymous session created onto the signed-in account, so
 * signing in never costs you the search you already set up. Bounded per table
 * and safe to call repeatedly: a second run finds nothing left to move.
 */
export const claimAnonymousSession = mutation({
  args: { sessionId: v.string() },
  returns: v.object({
    criteria: v.number(),
    listings: v.number(),
    activity: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in before claiming a search.");
    const owner = userKey(userId);
    if (!isAnonymousSessionId(args.sessionId)) {
      throw new Error("This anonymous session id is invalid.");
    }

    const [criteria, listings, activity] = await Promise.all([
      ctx.db
        .query("criteria")
        .withIndex("by_session_and_updated_at", (q) => q.eq("sessionId", args.sessionId))
        .take(50),
      ctx.db
        .query("listings")
        .withIndex("by_session_and_last_seen_at", (q) => q.eq("sessionId", args.sessionId))
        .take(200),
      ctx.db
        .query("activity")
        .withIndex("by_session_and_created_at", (q) => q.eq("sessionId", args.sessionId))
        .take(200),
    ]);

    for (const row of criteria) await ctx.db.patch(row._id, { sessionId: owner });
    for (const row of listings) await ctx.db.patch(row._id, { sessionId: owner });
    for (const row of activity) await ctx.db.patch(row._id, { sessionId: owner });

    if (criteria.length + listings.length > 0) {
      await ctx.db.insert("activity", {
        sessionId: owner,
        listingId: null,
        type: "system",
        message: `Search saved to your account with ${listings.length} ${listings.length === 1 ? "pursuit" : "pursuits"}`,
        createdAt: Date.now(),
        isDemo: false,
      });
    }
    return {
      criteria: criteria.length,
      listings: listings.length,
      activity: activity.length,
    };
  },
});

export const viewer = query({
  args: {},
  returns: v.union(
    v.object({ email: v.union(v.string(), v.null()), name: v.union(v.string(), v.null()) }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    return user ? { email: user.email ?? null, name: user.name ?? null } : null;
  },
});

export const listSources = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("sources"),
      _creationTime: v.number(),
      domain: v.string(),
      name: v.string(),
      type: sourceType,
      permissionStatus,
      notes: v.string(),
      isDemo: v.boolean(),
      cities: v.optional(v.array(v.string())),
    }),
  ),
  handler: async (ctx) => {
    const sources = await ctx.db.query("sources").withIndex("by_domain").take(20);
    return sources.map((source) => ({
      _id: source._id,
      _creationTime: source._creationTime,
      domain: source.domain,
      name: source.name,
      type: source.type,
      permissionStatus: source.permissionStatus,
      notes: source.notes,
      isDemo: source.isDemo,
      cities: source.cities,
    }));
  },
});

export const registerSourceCandidate = internalMutation({
  args: {
    domain: v.string(),
    name: v.string(),
    type: sourceType,
    permissionStatus,
    notes: v.string(),
    cities: v.optional(v.array(v.string())),
    permissionThreadId: v.optional(v.string()),
  },
  returns: v.id("sources"),
  handler: async (ctx, args) => {
    const domain = args.domain.trim().toLowerCase();
    const existing = await ctx.db
      .query("sources")
      .withIndex("by_domain", (q) => q.eq("domain", domain))
      .unique();
    const permissionFields = args.permissionThreadId
      ? {
          permissionRequestedAt: Date.now(),
          permissionThreadId: args.permissionThreadId,
        }
      : {};
    const sourceFields = {
      domain,
      name: args.name.trim(),
      type: args.type,
      permissionStatus: args.permissionStatus,
      notes: args.notes.trim(),
      cities: args.cities?.map((city) => city.trim()).filter(Boolean),
      isDemo: false,
      ...permissionFields,
    };

    const sourceId = existing
      ? (await ctx.db.patch(existing._id, sourceFields), existing._id)
      : await ctx.db.insert("sources", sourceFields);

    await ctx.db.insert("activity", {
      listingId: null,
      type: "system",
      message:
        args.permissionStatus === "approved"
          ? `${args.name} approved for discovery`
          : `Written permission requested from ${args.name}`,
      createdAt: Date.now(),
      isDemo: false,
    });
    return sourceId;
  },
});

export const assignSourceCities = internalMutation({
  args: {
    domain: v.string(),
    cities: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const source = await ctx.db
      .query("sources")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain.trim().toLowerCase()))
      .unique();
    if (!source) throw new Error("Source not found.");
    const cities = [...new Set(args.cities.map((city) => city.trim()).filter(Boolean))];
    if (cities.length === 0) throw new Error("Assign at least one city.");
    await ctx.db.patch(source._id, { cities });
    return null;
  },
});

export const recordPermissionDeliveryFailure = internalMutation({
  args: {
    domain: v.string(),
    deliveryThreadId: v.string(),
    notes: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const source = await ctx.db
      .query("sources")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain.trim().toLowerCase()))
      .unique();
    if (!source) throw new Error("Source candidate not found.");

    await ctx.db.patch(source._id, {
      permissionStatus: "review_required",
      notes: args.notes.trim(),
      permissionThreadId: args.deliveryThreadId,
    });
    await ctx.db.insert("activity", {
      listingId: null,
      type: "system",
      message: `Permission email to ${source.name} was undeliverable; a valid contact path is required`,
      createdAt: Date.now(),
      isDemo: false,
    });
    return null;
  },
});

export const integrationStatus = query({
  args: {},
  returns: v.object({
    agentmailConfigured: v.boolean(),
    firecrawlConfigured: v.boolean(),
    openaiConfigured: v.boolean(),
    openaiModel: v.string(),
    sampleContactConfigured: v.boolean(),
  }),
  handler: async () => ({
    agentmailConfigured: Boolean(process.env.AGENTMAIL_API_KEY),
    firecrawlConfigured: Boolean(process.env.FIRECRAWL_API_KEY),
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    sampleContactConfigured: Boolean(process.env.SAMPLE_SOURCE_CONTACT),
  }),
});

export const recordValidationRun = internalMutation({
  args: {
    sourceDomain: v.string(),
    permissionStatus: v.string(),
    attempted: v.number(),
    parsed: v.number(),
    deduplicated: v.number(),
    contactable: v.number(),
    durationMs: v.number(),
    notes: v.string(),
  },
  returns: v.id("validationRuns"),
  handler: async (ctx, args) =>
    await ctx.db.insert("validationRuns", { ...args, createdAt: Date.now() }),
});
