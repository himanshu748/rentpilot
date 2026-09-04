import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";

export type IntegrationCapability = "firecrawl" | "openai" | "agentmail";

const limits: Record<IntegrationCapability, number> = {
  firecrawl: 30,
  openai: 20,
  agentmail: 10,
};

const WINDOW_MS = 60 * 60 * 1000;

/**
 * Reserve paid integration capacity inside a Convex transaction. One document
 * per account/capability keeps concurrent calls from racing past the limit.
 */
export async function reserveIntegrationUse(
  ctx: MutationCtx,
  owner: string,
  capability: IntegrationCapability,
  cost = 1,
) {
  if (!Number.isInteger(cost) || cost < 1) {
    throw new Error("Integration usage cost must be a positive integer.");
  }

  const now = Date.now();
  const existing = await ctx.db
    .query("integrationUsage")
    .withIndex("by_owner_and_capability", (q) =>
      q.eq("owner", owner).eq("capability", capability),
    )
    .unique();
  const inCurrentWindow =
    existing && now - existing.windowStartedAt < WINDOW_MS;
  const nextCount = (inCurrentWindow ? existing.count : 0) + cost;
  if (nextCount > limits[capability]) {
    throw new Error(
      `${capability} usage is paused for this account. Try again after the hourly window resets.`,
    );
  }

  if (existing) {
    await ctx.db.patch(existing._id, {
      windowStartedAt: inCurrentWindow ? existing.windowStartedAt : now,
      count: nextCount,
    });
  } else {
    await ctx.db.insert("integrationUsage", {
      owner,
      capability,
      windowStartedAt: now,
      count: nextCount,
    });
  }
  return nextCount;
}

export const reserve = internalMutation({
  args: {
    owner: v.string(),
    capability: v.union(
      v.literal("firecrawl"),
      v.literal("openai"),
      v.literal("agentmail"),
    ),
    cost: v.optional(v.number()),
  },
  returns: v.number(),
  handler: async (ctx, args) =>
    await reserveIntegrationUse(ctx, args.owner, args.capability, args.cost),
});
