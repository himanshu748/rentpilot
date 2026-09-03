import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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
    updatedAt: v.number(),
  }),
  v.null(),
);

export const getCriteria = query({
  args: { sessionId: v.optional(v.string()) },
  returns: criteriaResult,
  handler: async (ctx, args) => {
    const sessionCriteria = args.sessionId
      ? await ctx.db
          .query("criteria")
          .withIndex("by_session_and_updated_at", (q) => q.eq("sessionId", args.sessionId))
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
  },
  returns: v.id("criteria"),
  handler: async (ctx, args) => {
    const city = args.city.trim();
    const localities = [...new Set(args.localities.map((area) => area.trim()).filter(Boolean))];
    const bedrooms = [...new Set(args.bedrooms.map((type) => type.trim()).filter(Boolean))];
    const mustHaves = [...new Set(args.mustHaves.map((item) => item.trim()).filter(Boolean))];

    if (city.length < 2) throw new Error("Choose a city for this search.");
    if (localities.length === 0) throw new Error("Add at least one preferred area.");
    if (bedrooms.length === 0) throw new Error("Choose at least one home type.");
    if (args.budgetMin < 0 || args.budgetMax <= args.budgetMin) {
      throw new Error("Maximum budget must be higher than minimum budget.");
    }

    const criteriaId = await ctx.db.insert("criteria", {
      sessionId: args.sessionId,
      city,
      budgetMin: Math.round(args.budgetMin),
      budgetMax: Math.round(args.budgetMax),
      localities,
      bedrooms,
      mustHaves,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("activity", {
      sessionId: args.sessionId,
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
    if (!args.sessionId) {
      return await ctx.db
        .query("activity")
        .withIndex("by_session_and_created_at", (q) => q.eq("sessionId", undefined))
        .order("desc")
        .take(20);
    }
    const [personal, shared] = await Promise.all([
      ctx.db
        .query("activity")
        .withIndex("by_session_and_created_at", (q) => q.eq("sessionId", args.sessionId))
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
      permissionRequestedAt: v.optional(v.number()),
      permissionThreadId: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => await ctx.db.query("sources").withIndex("by_domain").take(20),
});

export const registerSourceCandidate = mutation({
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

export const assignSourceCities = mutation({
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

export const recordPermissionDeliveryFailure = mutation({
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
    inboxId: v.string(),
  }),
  handler: async () => ({
    agentmailConfigured: Boolean(process.env.AGENTMAIL_API_KEY),
    firecrawlConfigured: Boolean(process.env.FIRECRAWL_API_KEY),
    inboxId: process.env.AGENTMAIL_INBOX_ID ?? "rentpilot-himanshu@agentmail.to",
  }),
});

export const recordValidationRun = mutation({
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
