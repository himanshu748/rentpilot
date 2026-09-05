import { FirecrawlClient } from "@firecrawl/firecrawl-convex";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { action, internalAction, internalMutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { searchLead } from "./schema";
import { ownerKey, requireUserKey } from "./session";
import { normalizePlace } from "./location";

const firecrawl = new FirecrawlClient(components.firecrawl);
type Lead = typeof searchLead.type;
const result = v.object({ query: v.string(), results: v.array(searchLead), searchedAt: v.number() });

/** Search engines return leads, NOT verified rent, availability, or amenities. */
export function rentalQuery(brief: { city: string; country: string; currency: string; areas: string[]; bedrooms: string[]; budgetMax: number; mustHaves: string[] }) {
  // Do not include contact details, auth data, or the private session identifier.
  return `${brief.bedrooms.slice(0, 2).join(" or ")} rent ${brief.areas.slice(0, 4).join(" or ")} ${brief.city} ${brief.country} under ${brief.budgetMax} ${brief.currency} per month ${brief.mustHaves.slice(0, 5).join(" ")}`;
}

export function safeLeadUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    // No IP literals or internal hostnames. Scraping still needs registry approval.
    if (!host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":") || /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(host)) return null;
    url.hash = "";
    return url.toString();
  } catch { return null; }
}

export const latest = query({
  args: { sessionId: v.optional(v.string()) },
  returns: v.union(result, v.null()),
  handler: async (ctx, args) => {
    const owner = await ownerKey(ctx, args.sessionId);
    if (!owner) return null;
    const criteria = await ctx.db.query("criteria").withIndex("by_session_and_updated_at", (q) => q.eq("sessionId", owner)).order("desc").first();
    if (!criteria) return null;
    const run = await ctx.db.query("searchRuns").withIndex("by_owner_and_criteria", (q) => q.eq("owner", owner).eq("criteriaId", criteria._id)).order("desc").first();
    return run ? { query: run.query, results: run.results, searchedAt: run.searchedAt } : null;
  },
});

export const save = internalMutation({
  args: { owner: v.string(), criteriaId: v.id("criteria"), query: v.string(), results: v.array(searchLead) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const criteria = await ctx.db.query("criteria").withIndex("by_session_and_updated_at", (q) => q.eq("sessionId", args.owner)).order("desc").first();
    if (!criteria || criteria._id !== args.criteriaId) throw new Error("Your search changed. Search again for the new brief.");
    const previous = await ctx.db.query("searchRuns").withIndex("by_owner_and_criteria", (q) => q.eq("owner", args.owner).eq("criteriaId", args.criteriaId)).first();
    const fields = { ...args, results: args.results.slice(0, 8), searchedAt: Date.now() };
    if (previous) await ctx.db.patch(previous._id, fields);
    else await ctx.db.insert("searchRuns", fields);
    return null;
  },
});

export const searchInternal = internalAction({
  args: { owner: v.string() },
  returns: result,
  handler: async (ctx, args): Promise<typeof result.type> => {
    const brief = await ctx.runQuery(internal.discovery.getSearchForDiscovery, { owner: args.owner });
    const queryText = rentalQuery(brief);
    await ctx.runMutation(internal.rateLimits.reserve, { owner: args.owner, capability: "firecrawl", cost: 2 });
    // Intentionally NO scrapeOptions: unapproved result pages are not scraped.
    const response = await firecrawl.search(ctx, queryText, { sources: ["web"], limit: 8, location: `${brief.city}, ${brief.country}`, timeout: 30000 });
    const results: Lead[] = [];
    const seen = new Set<string>();
    let extractedCount = 0;
    // Prioritize explicit area mentions, without pretending a snippet proves distance.
    const relevance = (item: unknown) => {
      const record = item as Record<string, unknown>;
      return brief.areas.some((area: string) => normalizePlace(`${record.title ?? ""} ${record.description ?? ""}`).includes(normalizePlace(area))) ? 1 : 0;
    };
    const candidates = [...(response.web ?? [])].sort((a, b) => relevance(b) - relevance(a));
    for (const item of candidates) {
      const url = safeLeadUrl(item.url);
      if (!url || seen.has(url) || results.length >= 8) continue;
      seen.add(url);
      const host = new URL(url).hostname;
      if (host === new URL(process.env.CONVEX_SITE_URL ?? "https://example.invalid").hostname) continue;
      const source: { _id: Id<"sources">; domain: string; permissionStatus: "approved" | "review_required" | "blocked" } | null = await ctx.runQuery(internal.discovery.getSourceByDomain, { domain: host.replace(/^www\./, "") });
      const lead: Lead = {
        url,
        title: typeof item.title === "string" ? item.title.slice(0, 220) : host,
        description: typeof item.description === "string" ? item.description.slice(0, 700) : "No search snippet available.",
        status: source?.permissionStatus === "blocked" ? "blocked" : "permission_required",
        note: source?.permissionStatus === "blocked" ? "Source has declined automated extraction. Open manually; no page was scraped." : "Search snippet only. Price, amenities, availability and distance are unverified. Source permission is required for automated extraction.",
      };
      if (source?.permissionStatus === "approved" && extractedCount < 3) {
        extractedCount++;
        await ctx.runMutation(internal.rateLimits.reserve, { owner: args.owner, capability: "firecrawl" });
        try {
          await ctx.runAction(internal.discovery.scrapeApprovedListingInternal, { owner: args.owner, sourceId: source._id, url, isSample: false });
          lead.status = "matched";
          lead.note = "Source evidence meets your hard budget, selected locality, room type and must-haves. Confirm current availability with the lister.";
        } catch (error) {
          lead.status = "excluded";
          lead.note = error instanceof Error ? error.message.slice(0, 900) : "Could not verify this listing. It was not added as a match.";
        }
      } else if (source?.permissionStatus === "approved") {
        lead.note = "Not verified: this search checks at most three approved-source pages. Open the source to review this lead.";
      }
      results.push(lead);
    }
    await ctx.runMutation(internal.webSearch.save, { owner: args.owner, criteriaId: brief.id, query: queryText, results });
    return { query: queryText, results, searchedAt: Date.now() };
  },
});

export const search = action({
  args: {},
  returns: result,
  handler: async (ctx): Promise<typeof result.type> => {
    const owner = await requireUserKey(ctx);
    return await ctx.runAction(internal.webSearch.searchInternal, { owner });
  },
});
