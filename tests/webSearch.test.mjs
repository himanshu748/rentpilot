import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(name, imports, extra = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(`../convex/${name}.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, URL, Error, process: { env: { CONVEX_SITE_URL: "https://app.example.com" } }, require: (id) => { if (id in imports) return imports[id]; throw new Error(id); }, ...extra });
  return exports;
}
const brief = { id: "criteria", city: "Lucknow", country: "India", currency: "INR", areas: ["Bithauli", "Bhitauli"], bedrooms: ["Private room"], budgetMax: 8000, mustHaves: ["Cooler", "Bed", "LPG cooking cylinder"], contactEmail: "private@example.com" };
function setup({ web = [], permission = null, signedIn = true, extractionError = null, searchError = null } = {}) {
  const calls = [], writes = [], scrapes = [];
  const definitions = new Proxy({}, { get: () => (x) => x });
  const session = { requireUserKey: async () => { if (!signedIn) throw new Error("Sign in"); return "user:me"; }, ownerKey: async (_ctx, owner) => owner };
  const webSearch = load("webSearch", {
    "@firecrawl/firecrawl-convex": { FirecrawlClient: class { async search(_ctx, query, options) { calls.push({ query, options }); if (searchError) throw new Error(searchError); return { web }; } } },
    "convex/values": { v: new Proxy({}, { get: () => () => ({}) }) },
    "./_generated/server": definitions,
    "./_generated/api": { components: {}, internal: { discovery: { getSearchForDiscovery: "brief", getSourceByDomain: "source", scrapeApprovedListingInternal: "scrape" }, rateLimits: { reserve: "reserve" }, webSearch: { searchInternal: "search", save: "save", begin: "begin" } } },
    "./schema": { searchLead: {}, searchPhase: {} }, "./session": session, "./location": { normalizePlace: (s) => s.trim().toLowerCase() },
  });
  const ctx = {
    runQuery: async (name) => name === "brief" ? brief : permission ? { _id: "source", permissionStatus: permission } : null,
    runMutation: async (name, args) => { writes.push({ name, args: structuredClone(args) }); return name === "begin" ? "run" : null; },
    runAction: async (name, args) => { if (name === "search") return webSearch.searchInternal.handler(ctx, args); scrapes.push(args); if (extractionError) throw new Error(extractionError); return {}; },
  };
  return { webSearch, calls, writes, scrapes, run: () => webSearch.search.handler(ctx, {}) };
}
const lead = { url: "https://homes.example.com/room", title: "Room", description: "A search snippet" };
test("live discovery uses the brief, excludes email, and never scrapes unapproved sources", async () => {
  const s = setup({ web: [lead] });
  const result = await s.run();
  assert.equal(s.calls.length, 2);
  assert.match(s.calls[0].query, /Bithauli.*Lucknow.*8000 INR/);
  assert.doesNotMatch(s.calls[0].query, /Cooler/);
  assert.match(s.calls[1].query, /Bithauli.*Lucknow.*8000 INR.*Cooler Bed LPG/);
  assert.doesNotMatch(s.calls[0].query, /private@example/);
  assert.equal(s.calls[0].options.scrapeOptions, undefined);
  assert.equal(s.scrapes.length, 0);
  assert.equal(result.results[0].status, "permission_required");
});
test("source links are published before checks and only successful extraction promotes a lead", async () => {
  const s = setup({ web: [lead], permission: "approved" });
  await s.run();
  const saves = s.writes.filter(write => write.name === "save");
  assert.equal(s.writes[0].name, "begin");
  assert.equal(saves[0].args.phase, "checking");
  assert.equal(saves[0].args.results[0].status, "permission_required");
  assert.equal(saves.at(-1).args.phase, "complete");
  assert.equal(saves.at(-1).args.results[0].status, "matched");
  assert.ok(saves.every(write => write.args.runId === "run"));
});
test("provider failures record a failed run without invented results", async () => {
  const s = setup({ searchError: "Provider unavailable" });
  await assert.rejects(s.run, /Provider unavailable/);
  assert.equal(s.writes.at(-1).args.phase, "failed");
  assert.equal(s.writes.at(-1).args.results.length, 0);
});
test("a brief without amenities sends one unique query", () => {
  const s = setup();
  assert.equal(s.webSearch.rentalQueries({ ...brief, mustHaves: [] }).length, 1);
});
test("search output is bounded and approved checks stop at three pages", async () => {
  const s = setup({ web: Array.from({ length: 20 }, (_, i) => ({ ...lead, url: `https://homes.example.com/${i}` })), permission: "approved" });
  assert.equal((await s.run()).results.length, 12);
  assert.equal(s.scrapes.length, 3);
});
test("begin refuses another owner's brief and concurrent runs", async () => {
  const s = setup();
  const db = { get: async () => ({ sessionId: "user:other" }) };
  await assert.rejects(() => s.webSearch.begin.handler({ db }, { owner: "user:me", criteriaId: "criteria" }), /not available/);
  db.get = async () => ({ sessionId: "user:me" });
  db.query = () => ({ withIndex: () => ({ order: () => ({ first: async () => ({ phase: "checking", searchedAt: Date.now() }) }) }) });
  await assert.rejects(() => s.webSearch.begin.handler({ db }, { owner: "user:me", criteriaId: "criteria" }), /already running/);
});
test("save rejects a stale brief or another run's owner", async () => {
  const s = setup();
  const db = { query: () => ({ withIndex: () => ({ order: () => ({ first: async () => ({ _id: "new-criteria" }) }) }) }) };
  await assert.rejects(() => s.webSearch.save.handler({ db }, { owner: "user:me", criteriaId: "criteria", runId: "run" }), /search changed/);
  db.query = () => ({ withIndex: () => ({ order: () => ({ first: async () => ({ _id: "criteria" }) }) }) });
  db.get = async () => ({ owner: "user:other", criteriaId: "criteria" });
  await assert.rejects(() => s.webSearch.save.handler({ db }, { owner: "user:me", criteriaId: "criteria", runId: "run" }), /does not belong/);
});
test("blocked sources remain manual-only links", async () => {
  const s = setup({ web: [lead], permission: "blocked" });
  assert.equal((await s.run()).results[0].status, "blocked");
  assert.equal(s.scrapes.length, 0);
});
test("approved sources use strict extractor and failures never become matches", async () => {
  const s = setup({ web: [lead], permission: "approved", extractionError: "Bed: not confirmed" });
  const result = await s.run();
  assert.equal(s.scrapes.length, 1);
  assert.equal(result.results[0].status, "excluded");
  assert.match(result.results[0].note, /Bed/);
});
test("empty results stay empty; duplicates and unsafe URL schemes are discarded", async () => {
  assert.equal((await setup().run()).results.length, 0);
  const s = setup({ web: [lead, lead, { url: "javascript:alert(1)" }, { url: "https://127.0.0.1/" }, { url: "https://app.example.com/sample" }] });
  assert.equal((await s.run()).results.length, 1);
});
test("unauthenticated callers cannot spend integration credits", async () => {
  const s = setup({ signedIn: false });
  await assert.rejects(s.run, /Sign in/);
  assert.equal(s.calls.length, 0);
});
test("anonymous identity cannot impersonate user keys", async () => {
  const session = load("session", { "@convex-dev/auth/server": { getAuthUserId: async (ctx) => ctx.userId } });
  assert.equal(await session.ownerKey({}, "user:victim"), undefined);
  assert.equal(await session.ownerKey({}, "not-a-uuid"), undefined);
  assert.equal(await session.ownerKey({}, "72a96f34-3f26-4d76-9389-e93d7600d18e"), "72a96f34-3f26-4d76-9389-e93d7600d18e");
  assert.equal(await session.ownerKey({ userId: "me" }, "user:victim"), "user:me");
});
