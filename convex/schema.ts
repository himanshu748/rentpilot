import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const pursuitStatus = v.union(
  v.literal("new"),
  v.literal("reviewing"),
  v.literal("drafted"),
  v.literal("contacted"),
  v.literal("replied"),
  v.literal("viewing"),
  v.literal("closed"),
);

export const sendStatus = v.union(
  v.literal("draft"),
  v.literal("ready"),
  v.literal("sending"),
  v.literal("sent"),
  v.literal("failed"),
);

export default defineSchema({
  ...authTables,

  sources: defineTable({
    domain: v.string(),
    name: v.string(),
    type: v.union(v.literal("portal"), v.literal("community"), v.literal("direct")),
    permissionStatus: v.union(
      v.literal("approved"),
      v.literal("review_required"),
      v.literal("blocked"),
    ),
    notes: v.string(),
    isDemo: v.boolean(),
    cities: v.optional(v.array(v.string())),
    permissionRequestedAt: v.optional(v.number()),
    permissionThreadId: v.optional(v.string()),
  })
    .index("by_domain", ["domain"])
    .index("by_permission", ["permissionStatus"]),

  criteria: defineTable({
    sessionId: v.optional(v.string()),
    city: v.optional(v.string()),
    budgetMin: v.number(),
    budgetMax: v.number(),
    localities: v.array(v.string()),
    bedrooms: v.array(v.string()),
    mustHaves: v.array(v.string()),
    contactName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_updated_at", ["updatedAt"])
    .index("by_session_and_updated_at", ["sessionId", "updatedAt"]),

  listings: defineTable({
    sessionId: v.optional(v.string()),
    city: v.optional(v.string()),
    sourceId: v.id("sources"),
    externalListingId: v.union(v.string(), v.null()),
    canonicalUrl: v.string(),
    contentHash: v.string(),
    lastSeenAt: v.number(),
    discoveredAt: v.number(),
    title: v.string(),
    rent: v.number(),
    locality: v.string(),
    bedrooms: v.string(),
    contactEmail: v.union(v.string(), v.null()),
    contactPhone: v.union(v.string(), v.null()),
    missingFields: v.array(v.string()),
    score: v.union(v.number(), v.null()),
    scoreConfidence: v.union(v.number(), v.null()),
    scoreBreakdown: v.array(
      v.object({
        label: v.string(),
        value: v.number(),
        note: v.string(),
      }),
    ),
    status: pursuitStatus,
    isDemo: v.boolean(),
    isSample: v.optional(v.boolean()),
  })
    .index("by_last_seen_at", ["lastSeenAt"])
    .index("by_session_and_last_seen_at", ["sessionId", "lastSeenAt"])
    .index("by_session_and_canonical_url", ["sessionId", "canonicalUrl"])
    .index("by_source_and_external_id", ["sourceId", "externalListingId"])
    .index("by_canonical_url", ["canonicalUrl"])
    .index("by_status_and_last_seen_at", ["status", "lastSeenAt"]),

  threads: defineTable({
    listingId: v.id("listings"),
    draftSubject: v.string(),
    draftBody: v.string(),
    draftedByModel: v.optional(v.string()),
    sendStatus,
    sendRequestId: v.union(v.string(), v.null()),
    agentmailOutboundId: v.union(v.string(), v.null()),
    agentMailThreadRef: v.union(v.string(), v.null()),
    sentAt: v.union(v.number(), v.null()),
    lastReplyIntent: v.union(v.string(), v.null()),
    lastReplySummary: v.union(v.string(), v.null()),
    lastReplyFrom: v.optional(v.string()),
    lastReplyAt: v.optional(v.number()),
  })
    .index("by_listing", ["listingId"])
    .index("by_agentmail_thread", ["agentMailThreadRef"]),

  activity: defineTable({
    sessionId: v.optional(v.string()),
    listingId: v.union(v.id("listings"), v.null()),
    type: v.union(
      v.literal("found"),
      v.literal("evidence"),
      v.literal("draft"),
      v.literal("sent"),
      v.literal("reply"),
      v.literal("viewing"),
      v.literal("system"),
    ),
    message: v.string(),
    createdAt: v.number(),
    isDemo: v.boolean(),
  })
    .index("by_created_at", ["createdAt"])
    .index("by_session_and_created_at", ["sessionId", "createdAt"])
    .index("by_listing_and_created_at", ["listingId", "createdAt"]),

  validationRuns: defineTable({
    sourceDomain: v.string(),
    permissionStatus: v.string(),
    attempted: v.number(),
    parsed: v.number(),
    deduplicated: v.number(),
    contactable: v.number(),
    durationMs: v.number(),
    notes: v.string(),
    createdAt: v.number(),
  }).index("by_created_at", ["createdAt"]),

  integrationUsage: defineTable({
    owner: v.string(),
    capability: v.union(
      v.literal("firecrawl"),
      v.literal("openai"),
      v.literal("agentmail"),
    ),
    windowStartedAt: v.number(),
    count: v.number(),
  }).index("by_owner_and_capability", ["owner", "capability"]),

  agentmailEvents: defineTable({
    eventId: v.string(),
    createdAt: v.number(),
  }).index("by_event_id", ["eventId"]),
});
