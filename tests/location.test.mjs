import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const validators = new Proxy({}, { get: () => () => ({}) });
const server = Object.fromEntries(["query", "mutation", "internalQuery", "internalMutation", "action", "internalAction"].map((name) => [name, (x) => x]));
function load(name, extra = {}) {
  const exports = {};
  const source = fs.readFileSync(new URL(`../convex/${name}.ts`, import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, URL, process: { env: {} },
    require: (id) => {
      if (id in extra) return extra[id];
      if (id === "convex/values") return { v: validators };
      if (id === "./_generated/server") return server;
      if (id === "./location") return location;
      if (id === "./eligibility") return eligibility;
      if (id === "./session") return { ownerKey: async (_ctx, owner) => owner, isAnonymousSessionId: () => true };
      if (id === "./aiConfig") return { INQUIRY_MODEL: "openai/gpt-4o-mini" };
      if (id === "@convex-dev/auth/server") return { getAuthUserId: async () => null };
      if (id === "./schema") return { pursuitStatus: {}, sendStatus: {} };
      throw new Error(`Unexpected import ${id}`);
    },
  });
  return exports;
}
const location = load("location");
const eligibility = load("eligibility");
const workspace = load("workspace");
const pursuits = load("pursuits");
const samples = load("sampleSource");

const london = { city: "London", country: "United Kingdom", currency: "GBP" };
test("same city names in different countries do not mix", () => {
  assert.equal(location.sameMarket(london, { ...london, country: "Canada" }), false);
  assert.equal(location.sameMarket(london, { ...london, currency: "USD" }), false);
  assert.equal(location.sameMarket(london, { ...london, city: " london " }), true);
});
test("non-Latin cities and legacy Indian records remain supported", () => {
  assert.equal(location.sameMarket({ city: "東京", country: "日本", currency: "JPY" }, { city: "東京", country: "日本", currency: "JPY" }), true);
  assert.equal(location.sameMarket({ city: "Bengaluru" }, { city: "Bengaluru", country: "India", currency: "INR" }), true);
});
test("formats and validates currencies without silently converting", () => {
  for (const code of ["GBP", "USD", "EUR", "JPY", "KES", "INR", "BRL", "AED"]) assert.equal(location.validCurrency(code), true);
  assert.equal(location.validCurrency("XYZ"), false);
  assert.match(location.formatMoney(1250.75, "GBP"), /GBP.*1,250.75/);
  assert.match(location.formatMoney(1250, "JPY"), /JPY.*1,250$/);
});

function context({ criteria = null, listings = [] } = {}) {
  const writes = [];
  const db = {
    query: (table) => {
      const q = { withIndex: () => q, order: () => q, first: async () => criteria, take: async () => table === "listings" ? listings : [], unique: async () => null };
      return q;
    },
    get: async () => null,
    insert: async (table, fields) => { writes.push({ table, fields }); return "new-id"; },
  };
  return { db, writes };
}
test("new visitors have no implicit Bengaluru brief or listings", async () => {
  assert.equal(await workspace.getCriteria.handler(context(), { sessionId: "fresh" }), null);
  assert.equal((await pursuits.list.handler(context(), { sessionId: "fresh" })).length, 0);
});
test("global brief saves country, currency and decimal budget", async () => {
  const ctx = context();
  await workspace.saveCriteria.handler(ctx, { sessionId: "test", ...london, budgetMin: 500.5, budgetMax: 1800.75, localities: ["Camden"], bedrooms: ["Studio"], mustHaves: [] });
  const saved = ctx.writes.find((w) => w.table === "criteria").fields;
  assert.equal(saved.country, "United Kingdom");
  assert.equal(saved.currency, "GBP");
  assert.equal(saved.budgetMax, 1800.75);
  await assert.rejects(() => workspace.saveCriteria.handler(ctx, { currency: "XYZ", country: "UK", city: "London" }), /currency code/);
});
test("switching locations hides old pursuits rather than relabelling them", async () => {
  const ctx = context({ criteria: { ...london, budgetMin: 0, budgetMax: 1800, localities: ["Camden"], bedrooms: ["Studio"], mustHaves: [] }, listings: [{ _id: "london", ...london, rent: 1500, locality: "Camden", bedrooms: "Studio" }, { _id: "canada", ...london, country: "Canada" }, { _id: "india", city: "Bengaluru" }] });
  const result = await pursuits.list.handler(ctx, { sessionId: "test" });
  assert.equal(result.length, 1);
  assert.equal(result[0]._id, "london");
});
test("sample pages preserve the country and currency and escape user text", () => {
  const place = { ...london, area: "Camden <script>" };
  const url = new URL(samples.listingUrl("https://example.com", samples.sampleListings[0].slug, place));
  assert.equal(url.searchParams.get("country"), "United Kingdom");
  assert.equal(url.searchParams.get("currency"), "GBP");
  const page = samples.renderListing(samples.sampleListings[0], place);
  assert.match(page, /GBP 23500 per month/);
  assert.match(page, /not local market prices/);
  assert.doesNotMatch(page, /<script>/);
});
