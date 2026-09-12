import { FirecrawlClient } from "@firecrawl/firecrawl-convex";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { action, internalAction, internalMutation, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { savedLeadStage, searchLead, searchPhase } from "./schema";
import { ownerKey, requireUserKey } from "./session";
import { formatMoney, normalizePlace } from "./location";

const firecrawl = new FirecrawlClient(components.firecrawl);
type Lead = typeof searchLead.type;
const result = v.object({ query: v.string(), results: v.array(searchLead), searchedAt: v.number(), phase: v.optional(searchPhase), queries: v.optional(v.array(v.string())), error: v.optional(v.string()), warning: v.optional(v.string()) });

/** Search engines return leads, NOT verified rent, availability, or amenities. */
export function rentalQuery(brief: { city: string; country: string; currency: string; areas: string[]; bedrooms: string[]; budgetMax: number; mustHaves: string[] }) {
  // Do not include contact details, auth data, or the private session identifier.
  return `${brief.bedrooms.slice(0, 2).join(" or ")} rent ${brief.areas.slice(0, 4).join(" or ")} ${brief.city} ${brief.country} under ${brief.budgetMax} ${brief.currency} per month ${brief.mustHaves.slice(0, 5).join(" ")}`.trim();
}

/** Broader discovery only; the eligibility gates still require every must-have. */
export function rentalQueries(brief: Parameters<typeof rentalQuery>[0]) {
  const broad = `${brief.bedrooms.slice(0, 2).join(" or ")} rent ${brief.areas.slice(0, 4).join(" or ")} ${brief.city} ${brief.country} under ${brief.budgetMax} ${brief.currency} per month`;
  return [...new Set([broad, rentalQuery(brief)])];
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
    if (!run) return null;
    const interrupted = (run.phase === "searching" || run.phase === "checking") && Date.now() - run.searchedAt > 5 * 60_000;
    return { query: run.query, results: run.results, searchedAt: run.searchedAt, queries: run.queries,
      phase: interrupted ? "failed" as const : run.phase,
      error: interrupted ? "The search stopped updating. Start a new search; your requirements are unchanged." : run.error, warning: run.warning };
  },
});

export const begin = internalMutation({
  args: { owner: v.string(), criteriaId: v.id("criteria"), query: v.string(), queries: v.array(v.string()) },
  returns: v.id("searchRuns"),
  handler: async (ctx, args) => {
    const criteria = await ctx.db.get(args.criteriaId);
    if (!criteria || criteria.sessionId !== args.owner) throw new Error("Search preferences are not available for this account.");
    const previous = await ctx.db.query("searchRuns").withIndex("by_owner_and_criteria", q => q.eq("owner", args.owner).eq("criteriaId", args.criteriaId)).order("desc").first();
    if (previous && (previous.phase === "searching" || previous.phase === "checking") && Date.now() - previous.searchedAt < 5 * 60_000) throw new Error("A search is already running for this brief. Results will update here.");
    return await ctx.db.insert("searchRuns", { ...args, results: [], searchedAt: Date.now(), phase: "searching" });
  },
});

export const save = internalMutation({
  args: { owner: v.string(), criteriaId: v.id("criteria"), query: v.string(), results: v.array(searchLead), runId: v.optional(v.id("searchRuns")), phase: v.optional(searchPhase), queries: v.optional(v.array(v.string())), error: v.optional(v.string()), warning: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const criteria = await ctx.db.query("criteria").withIndex("by_session_and_updated_at", (q) => q.eq("sessionId", args.owner)).order("desc").first();
    if (!criteria || criteria._id !== args.criteriaId) throw new Error("Your search changed. Search again for the new brief.");
    const { runId, ...values } = args;
    const previous = runId ? await ctx.db.get(runId) : await ctx.db.query("searchRuns").withIndex("by_owner_and_criteria", (q) => q.eq("owner", args.owner).eq("criteriaId", args.criteriaId)).order("desc").first();
    if (runId && (!previous || previous.owner !== args.owner || previous.criteriaId !== args.criteriaId)) throw new Error("Search run does not belong to this brief.");
    const fields = { ...values, results: args.results.slice(0, 12), searchedAt: Date.now() };
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
    const queries = rentalQueries(brief);
    const runId: Id<"searchRuns"> = await ctx.runMutation(internal.webSearch.begin, { owner: args.owner, criteriaId: brief.id, query: queryText, queries });
    const results: Lead[] = [];
    let warning: string | undefined;
    const save = async (phase: "checking" | "complete" | "failed", error?: string) => {
      await ctx.runMutation(internal.webSearch.save, { owner: args.owner, criteriaId: brief.id, query: queryText, results, queries, runId, phase, ...(error ? { error } : {}), ...(warning ? { warning } : {}) });
    };
    try {
      await ctx.runMutation(internal.rateLimits.reserve, { owner: args.owner, capability: "firecrawl", cost: 2 * queries.length });
      // Intentionally NO scrapeOptions: unapproved result pages are not scraped.
      const settled = await Promise.allSettled(queries.map(query => firecrawl.search(ctx, query, { sources: ["web"], limit: 8, location: `${brief.city}, ${brief.country}`, timeout: 30000 })));
      const responses = settled.flatMap(response => response.status === "fulfilled" ? [response.value] : []);
      if (responses.length === 0) {
        throw new Error("The search provider could not return source links. Try again later.");
      }
      if (responses.length < queries.length) {
        warning = `Only ${responses.length} of ${queries.length} searches completed. These source links are still usable; retry to include the missing search. Your requirements are unchanged.`;
      }
      const seen = new Set<string>();
      let extractedCount = 0;
      // Prioritize explicit area mentions, without pretending a snippet proves distance.
      const relevance = (item: unknown) => {
        const record = item as Record<string, unknown>;
        return brief.areas.some((area: string) => normalizePlace(`${record.title ?? ""} ${record.description ?? ""}`).includes(normalizePlace(area))) ? 1 : 0;
      };
      const candidates = responses.flatMap(response => response.web ?? []).sort((a, b) => relevance(b) - relevance(a));
      const approved: { lead: Lead; sourceId: Id<"sources"> }[] = [];
      for (const item of candidates) {
        const url = safeLeadUrl(item.url);
        if (!url || seen.has(url) || results.length >= 12) continue;
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
        if (source?.permissionStatus === "approved") {
          lead.note = "Waiting for a source-evidence check. This is not a match yet.";
          approved.push({ lead, sourceId: source._id });
        }
        results.push(lead);
      }
      await save("checking");
      for (const { lead, sourceId } of approved) {
        if (extractedCount < 3) {
          extractedCount++;
          await ctx.runMutation(internal.rateLimits.reserve, { owner: args.owner, capability: "firecrawl" });
          try {
            await ctx.runAction(internal.discovery.scrapeApprovedListingInternal, { owner: args.owner, sourceId, url: lead.url, isSample: false });
            lead.status = "matched";
            lead.note = "Source evidence meets your hard budget, selected locality, room type and must-haves. Confirm current availability with the lister.";
          } catch (error) {
            lead.status = "excluded";
            lead.note = error instanceof Error ? error.message.slice(0, 900) : "Could not verify this listing. It was not added as a match.";
          }
        } else {
          lead.note = "Not verified: this search checks at most three approved-source pages. Open the source to review this lead.";
        }
        await save("checking");
      }
      await save("complete");
      return { query: queryText, results, searchedAt: Date.now(), queries, phase: "complete", ...(warning ? { warning } : {}) };
    } catch (error) {
      try { await save("failed", "Search could not finish. Any links below remain available; retry to run all checks."); } catch { /* A changed brief must not receive an old run's result. */ }
      throw error;
    }
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


const savedLeadResult = v.object({
  _id: v.id("savedLeads"), lead: searchLead, city: v.string(),
  requirements: v.array(v.string()), searchedAt: v.number(), savedAt: v.number(),
  updatedAt: v.number(), stage: savedLeadStage, notes: v.string(),
});

/** A private notebook of source snapshots, never an alternate path to a match or email. */
export const savedLeads = query({
  args: {},
  returns: v.array(savedLeadResult),
  handler: async (ctx) => {
    const owner = await ownerKey(ctx, undefined);
    if (!owner) return [];
    const rows = await ctx.db.query("savedLeads")
      .withIndex("by_owner_and_saved_at", q => q.eq("owner", owner)).order("desc").take(50);
    return rows.map(({ _id, lead, city, requirements, searchedAt, savedAt, updatedAt, stage, notes }) =>
      ({ _id, lead, city, requirements, searchedAt, savedAt, updatedAt, stage, notes }));
  },
});

export const saveLead = mutation({
  args: { url: v.string() },
  returns: v.id("savedLeads"),
  handler: async (ctx, args) => {
    const owner = await requireUserKey(ctx);
    const url = safeLeadUrl(args.url);
    if (!url) throw new Error("Choose a valid source link from your search.");
    const existing = await ctx.db.query("savedLeads")
      .withIndex("by_owner_and_url", q => q.eq("owner", owner).eq("lead.url", url)).first();
    if (existing) return existing._id;
    const criteria = await ctx.db.query("criteria").withIndex("by_session_and_updated_at", q => q.eq("sessionId", owner)).order("desc").first();
    if (!criteria) throw new Error("Save your search preferences first.");
    const run = await ctx.db.query("searchRuns")
      .withIndex("by_owner_and_criteria", q => q.eq("owner", owner).eq("criteriaId", criteria._id)).order("desc").first();
    const lead = run?.results.find(item => item.url === url);
    if (!run || !lead) throw new Error("This link is no longer in your current search. Refresh the results before saving it.");
    const count = await ctx.db.query("savedLeads").withIndex("by_owner_and_saved_at", q => q.eq("owner", owner)).take(50);
    if (count.length >= 50) throw new Error("Your notebook holds 50 leads. Remove one before saving another.");
    const currency = criteria.currency ?? "INR";
    const now = Date.now();
    return await ctx.db.insert("savedLeads", {
      owner, lead, city: criteria.city ?? "Bengaluru",
      requirements: [
        `${formatMoney(criteria.budgetMin, currency)}–${formatMoney(criteria.budgetMax, currency)} / month`,
        criteria.localities.join(" / "), criteria.bedrooms.join(" or "), ...criteria.mustHaves,
      ],
      searchedAt: run.searchedAt, savedAt: now, updatedAt: now, stage: "to_check", notes: "",
    });
  },
});

export const updateSavedLead = mutation({
  args: { id: v.id("savedLeads"), stage: savedLeadStage, notes: v.string(), expectedUpdatedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireUserKey(ctx);
    const saved = await ctx.db.get(args.id);
    if (!saved || saved.owner !== owner) throw new Error("Saved lead not found.");
    if (saved.updatedAt !== args.expectedUpdatedAt) throw new Error("This lead changed in another tab. Reopen its notes before saving.");
    if (args.notes.length > 3000) throw new Error("Keep notes within 3,000 characters.");
    await ctx.db.patch(args.id, { stage: args.stage, notes: args.notes.trim(), updatedAt: Math.max(Date.now(), saved.updatedAt + 1) });
    return null;
  },
});

export const removeSavedLead = mutation({
  args: { id: v.id("savedLeads") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireUserKey(ctx);
    const saved = await ctx.db.get(args.id);
    if (!saved || saved.owner !== owner) throw new Error("Saved lead not found.");
    await ctx.db.delete(args.id);
    return null;
  },
});
