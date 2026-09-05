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
function setup({ web = [], permission = null, signedIn = true, extractionError = null } = {}) {
  const calls = [], writes = [], scrapes = [];
  const definitions = new Proxy({}, { get: () => (x) => x });
  const session = { requireUserKey: async () => { if (!signedIn) throw new Error("Sign in"); return "user:me"; }, ownerKey: async (_ctx, owner) => owner };
  const webSearch = load("webSearch", {
    "@firecrawl/firecrawl-convex": { FirecrawlClient: class { async search(_ctx, query, options) { calls.push({ query, options }); return { web }; } } },
    "convex/values": { v: new Proxy({}, { get: () => () => ({}) }) },
    "./_generated/server": definitions,
    "./_generated/api": { components: {}, internal: { discovery: { getSearchForDiscovery: "brief", getSourceByDomain: "source", scrapeApprovedListingInternal: "scrape" }, rateLimits: { reserve: "reserve" }, webSearch: { searchInternal: "search", save: "save" } } },
    "./schema": { searchLead: {} }, "./session": session, "./location": { normalizePlace: (s) => s.trim().toLowerCase() },
  });
  const ctx = {
    runQuery: async (name) => name === "brief" ? brief : permission ? { _id: "source", permissionStatus: permission } : null,
    runMutation: async (name, args) => writes.push({ name, args }),
    runAction: async (name, args) => { if (name === "search") return webSearch.searchInternal.handler(ctx, args); scrapes.push(args); if (extractionError) throw new Error(extractionError); return {}; },
  };
  return { webSearch, calls, writes, scrapes, run: () => webSearch.search.handler(ctx, {}) };
}
const lead = { url: "https://homes.example.com/room", title: "Room", description: "A search snippet" };
test("live discovery uses the brief, excludes email, and never scrapes unapproved sources", async () => {
  const s = setup({ web: [lead] });
  const result = await s.run();
  assert.match(s.calls[0].query, /Bithauli.*Lucknow.*8000 INR.*Cooler Bed LPG/);
  assert.doesNotMatch(s.calls[0].query, /private@example/);
  assert.equal(s.calls[0].options.scrapeOptions, undefined);
  assert.equal(s.scrapes.length, 0);
  assert.equal(result.results[0].status, "permission_required");
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
