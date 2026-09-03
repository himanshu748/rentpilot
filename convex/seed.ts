import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const demo = mutation({
  args: {},
  returns: v.object({ inserted: v.boolean() }),
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("sources")
      .withIndex("by_domain", (q) => q.eq("domain", "demo.rentpilot.local"))
      .unique();
    if (existing) return { inserted: false };

    const now = Date.now();
    const sourceId = await ctx.db.insert("sources", {
      domain: "demo.rentpilot.local",
      name: "Curated demo feed",
      type: "community",
      permissionStatus: "approved",
      notes: "Synthetic records used to demonstrate the pursuit workflow.",
      isDemo: true,
      cities: ["Bengaluru"],
    });

    await ctx.db.insert("criteria", {
      city: "Bengaluru",
      budgetMin: 18000,
      budgetMax: 32000,
      localities: ["HSR Layout", "Koramangala", "Indiranagar"],
      bedrooms: ["Private room", "1 BHK"],
      mustHaves: ["No brokerage", "Move-in before 15 Sep"],
      updatedAt: now,
    });

    const rows = [
      {
        title: "Sunlit room near 27th Main",
        rent: 24500,
        locality: "HSR Layout",
        bedrooms: "Private room",
        score: 94,
        confidence: 91,
        status: "drafted" as const,
        email: "host@example.com",
      },
      {
        title: "Quiet room in a shared 3 BHK",
        rent: 22000,
        locality: "Koramangala",
        bedrooms: "Private room",
        score: 87,
        confidence: 84,
        status: "reviewing" as const,
        email: null,
      },
      {
        title: "Compact 1 BHK by the metro",
        rent: 30500,
        locality: "Indiranagar",
        bedrooms: "1 BHK",
        score: 79,
        confidence: 76,
        status: "new" as const,
        email: "owner@example.com",
      },
    ];

    for (const [index, row] of rows.entries()) {
      const listingId = await ctx.db.insert("listings", {
        sourceId,
        externalListingId: `demo-${index + 1}`,
        canonicalUrl: `https://demo.rentpilot.local/listing/${index + 1}`,
        contentHash: `demo-hash-${index + 1}`,
        lastSeenAt: now - index * 24 * 60 * 60 * 1000,
        discoveredAt: now - index * 27 * 60 * 60 * 1000,
        title: row.title,
        rent: row.rent,
        locality: row.locality,
        bedrooms: row.bedrooms,
        contactEmail: row.email,
        contactPhone: null,
        missingFields: row.email ? [] : ["contact email"],
        score: row.score,
        scoreConfidence: row.confidence,
        scoreBreakdown: [
          { label: "Budget", value: row.rent <= 26000 ? 30 : 22, note: "Within the selected range" },
          { label: "Locality", value: 28, note: "Preferred neighbourhood" },
          { label: "Evidence", value: row.email ? 24 : 14, note: row.email ? "Contact path found" : "Contact path missing" },
          { label: "Freshness", value: 12, note: "Seen recently" },
        ],
        status: row.status,
        isDemo: true,
      });

      await ctx.db.insert("threads", {
        listingId,
        draftSubject: `Viewing request: ${row.title}`,
        draftBody: `Hi, I found your ${row.bedrooms.toLowerCase()} in ${row.locality}. Is it still available? I would like to arrange a viewing this week.`,
        sendStatus: row.email && index === 0 ? "ready" : "draft",
        sendRequestId: null,
        agentmailOutboundId: null,
        agentMailThreadRef: null,
        sentAt: null,
        lastReplyIntent: null,
        lastReplySummary: null,
      });

      await ctx.db.insert("activity", {
        listingId,
        type: "found",
        message: `${row.title} added from the curated demo feed`,
        createdAt: now - index * 18 * 60 * 1000,
        isDemo: true,
      });
    }

    return { inserted: true };
  },
});
