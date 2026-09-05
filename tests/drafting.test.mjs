import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Exercise the action handler without credentials or network calls. Convex's
// transport is stubbed; request construction and response validation are real.
function setup({ status = 200, raw, finish = "stop", key = "test-key" } = {}) {
  const calls = [];
  const mutations = [];
  const validators = new Proxy({}, { get: () => () => ({}) });
  const config = {};
  const configSource = fs.readFileSync(new URL("../convex/aiConfig.ts", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(configSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: config });
  const source = fs.readFileSync(new URL("../convex/drafting.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports, AbortSignal,
    process: { env: { AI_GATEWAY_API_KEY: key, OPENAI_API_KEY: "must-not-be-used", OPENAI_MODEL: "must-not-be-used" } },
    require: (id) => {
      if (id === "convex/values") return { v: validators };
      if (id === "./aiConfig") return config;
      if (id === "./location") return { sameMarket: () => true };
      if (id === "./eligibility") return { eligibilityProblems: () => [] };
      if (id === "./session") return { requireUserKey: async () => "user:test" };
      if (id === "./_generated/server") return { action: (x) => x, internalQuery: (x) => x, internalMutation: (x) => x };
      if (id === "./_generated/api") return { internal: { rateLimits: { reserve: "reserve" }, drafting: { getDraftContext: "context", saveGeneratedDraft: "save" } } };
      throw new Error(`Unexpected import: ${id}`);
    },
    fetch: async (url, options) => {
      calls.push({ url, ...options, body: JSON.parse(options.body) });
      return { ok: status === 200, status, json: async () => ({ choices: [{ finish_reason: finish, message: { content: raw ?? JSON.stringify({ subject: "Baner viewing", body: "Is the apartment still available? Could I arrange a viewing?" }) } }] }) };
    },
  });
  const ctx = {
    runMutation: async (name, args) => { mutations.push({ name, args }); },
    runQuery: async () => ({ threadId: "thread-test", title: "Camden studio", locality: "Camden", city: "London", country: "United Kingdom", currency: "GBP", rent: 1500, bedrooms: "Studio", missingFields: [], mustHaves: [], budgetMax: 2000, renterName: "", renterEmail: null, alreadySent: false }),
  };
  return { run: () => exports.writeInquiry.handler(ctx, { listingId: "listing-test" }), calls, mutations };
}

test("uses only the pinned OpenAI provider and stores model provenance", async () => {
  const s = setup();
  const result = await s.run();
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].url, "https://ai-gateway.vercel.sh/v1/chat/completions");
  assert.equal(s.calls[0].body.model, "openai/gpt-4o-mini");
  assert.match(s.calls[0].body.messages[1].content, /GBP 1500 per month/);
  assert.match(s.calls[0].body.messages[1].content, /London, United Kingdom/);
  assert.doesNotMatch(s.calls[0].body.messages[1].content, /INR/);
  assert.deepEqual(s.calls[0].body.providerOptions, { gateway: { only: ["openai"] } });
  assert.equal(s.calls[0].headers.Authorization, "Bearer test-key");
  assert.equal(result.model, "openai/gpt-4o-mini");
  assert.equal(s.mutations.filter((m) => m.name === "save").length, 1);
});

test("missing gateway key never falls back to a direct OpenAI key", async () => {
  const s = setup({ key: "" });
  await assert.rejects(s.run, /AI_GATEWAY_API_KEY/);
  assert.equal(s.calls.length, 0);
});

for (const status of [401, 402, 429, 500]) {
  test(`HTTP ${status} fails without retry, fallback, or saving a draft`, async () => {
    const s = setup({ status });
    await assert.rejects(s.run, /OpenAI drafting/);
    assert.equal(s.calls.length, 1);
    assert.equal(s.mutations.some((m) => m.name === "save"), false);
  });
}

for (const raw of ["not-json", "null", "[]", '{"subject":"x","body":"short"}']) {
  test(`rejects invalid draft ${raw}`, async () => {
    const s = setup({ raw });
    await assert.rejects(s.run, /OpenAI returned/);
    assert.equal(s.mutations.some((m) => m.name === "save"), false);
  });
}

test("truncated output cannot become an approved draft", async () => {
  const s = setup({ finish: "length" });
  await assert.rejects(s.run, /did not complete/);
  assert.equal(s.mutations.some((m) => m.name === "save"), false);
});
