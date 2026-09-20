import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function setup({ matched = true, listing = { _id: "listing", sessionId: "user:owner", title: "Controlled test room", status: "contacted", contactEmail: "tester@example.com" } } = {}) {
  const events = new Set(), writes = [], scheduled = [];
  const thread = { _id: "thread", listingId: "listing" };
  const definitions = new Proxy({}, { get: () => x => x });
  const exports = {};
  const output = ts.transpileModule(fs.readFileSync(new URL("../convex/email.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(output, { exports, process: { env: { AGENTMAIL_INBOX_ID: "rentpilot@example.com" } }, require: id => {
    if (id === "@agentmail/convex") return { AgentMail: class {} };
    if (id === "convex/values") return { v: new Proxy({}, { get: () => () => ({}) }) };
    if (id === "./_generated/server") return definitions;
    if (id === "./_generated/api") return { components: {}, internal: { email: { onReplyReceived: "reply" } } };
    if (id === "./sampleSource") return { sampleSourceHost: () => "sample.example.com" };
    if (id === "./leadEvidence") return { mailbox: value => value.toLowerCase() };
    if (["./rateLimits", "./session", "./schema", "./eligibility"].includes(id)) return {};
    throw Error(id);
  } });
  const ctx = {
    db: {
      query: table => {
        let value;
        const query = {
          withIndex: (_index, cb) => { cb({ eq: (_field, v) => { value = v; } }); return query; },
          unique: async () => events.has(value) ? {} : null,
          first: async () => table === "threads" && matched ? thread : null,
        };
        assert.ok(["agentmailEvents", "threads", "leadInquiries"].includes(table));
        return query;
      },
      insert: async (table, data) => { writes.push({ table, data }); if (table === "agentmailEvents") events.add(data.eventId); },
      get: async () => listing,
      patch: async (id, data) => writes.push({ id, data }),
    },
    scheduler: { runAfter: async (delay, name, args) => scheduled.push({ delay, name, args }) },
  };
  const payload = { eventId: "controlled-event", message: { inbox_id: "rentpilot@example.com", message_id: "message-one", thread_id: "provider-thread", from: "tester@example.com", text: "Controlled reply." }, thread: {} };
  return { writes, scheduled, events, match: () => { matched = true; }, run: args => exports.onReplyReceived.handler(ctx, args ?? payload), payload };
}

test("reply arriving before outbound thread capture is retried and then matched", async () => {
  const s = setup({ matched: false });
  await s.run();
  assert.equal(s.events.size, 0);
  assert.equal(s.scheduled.length, 1);
  assert.equal(s.scheduled[0].delay, 60000);
  s.match();
  await s.run(s.scheduled[0].args);
  assert.equal(s.events.size, 2);
  assert.equal(s.writes.find(w => w.id === "listing").data.status, "replied");
  assert.equal(s.writes.find(w => w.table === "activity").data.sessionId, "user:owner");
});

test("duplicate webhook events cannot create duplicate replies", async () => {
  const s = setup();
  await s.run(); await s.run();
  assert.equal(s.writes.filter(w => w.table === "activity").length, 1);
});

test("unrelated replies stop retrying without entering shared activity", async () => {
  const s = setup({ matched: false });
  await s.run({ ...s.payload, attempt: 6 });
  assert.equal(s.scheduled.length, 0);
  assert.equal(s.events.size, 1);
  assert.equal(s.writes.filter(w => w.table === "activity").length, 0);
});

test("a missing listing cannot expose reply contents in shared activity", async () => {
  const s = setup({ listing: null });
  await s.run();
  assert.equal(s.writes.filter(w => w.table === "activity").length, 0);
  assert.equal(s.writes.filter(w => w.id).length, 0);
});

for (const status of ["viewing", "closed"]) {
  test(`reply does not move a ${status} match backwards`, async () => {
    const s = setup({ listing: { _id: "listing", sessionId: "user:owner", contactEmail: "tester@example.com", status } });
    await s.run();
    assert.equal(s.writes.some(w => w.id === "listing"), false);
    assert.equal(s.writes.find(w => w.id === "thread").data.lastReplySummary, "Controlled reply.");
  });
}

test("same message with a different event ID is still deduplicated", async () => {
 const s = setup(); await s.run(); await s.run({ ...s.payload, eventId: "redelivery" });
 assert.equal(s.writes.filter(w => w.table === "activity").length, 1);
});
for (const message of [{ inbox_id: "other-project@example.com" }, { from: "stranger@example.com" }]) {
 test(`unrelated inbox or sender cannot become lister evidence ${JSON.stringify(message)}`, async () => {
 const s = setup(); await s.run({ ...s.payload, message: { ...s.payload.message, ...message } });
 assert.equal(s.writes.filter(w => w.table === "activity").length, 0);
 });
}
