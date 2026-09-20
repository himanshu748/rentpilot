import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function load(name, imports, env = {}) {
 const exports = {};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(`../convex/${name}.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, URL, process: { env }, require: id => { if (id in imports) return imports[id]; throw Error(id); } });
 return exports;
}
const evidence = load("leadEvidence", {});
function setup() {
 let owner = "user:alice", serial = 0;
 const rows = new Map(), sent = [], scheduled = [];
 rows.set("brief", { _id: "brief", table: "criteria", sessionId: owner, city: "Lucknow", country: "India", currency: "INR", budgetMin: 0, budgetMax: 8000, localities: ["Bhitauli"], bedrooms: ["Private room"], mustHaves: ["Bed", "Cooler"] });
 const ctx = { db: {
  get: async id => rows.get(id) ?? null,
  insert: async (table, row) => { const id = `id-${++serial}`; rows.set(id, { ...row, table, _id: id }); return id; },
  patch: async (id, patch) => rows.set(id, { ...rows.get(id), ...patch }),
  query: table => {
   const filters = []; const q = { eq: (key, value) => { filters.push([key,value]); return q; } };
   const selected = () => [...rows.values()].filter(r => r.table === table && filters.every(([k,v]) => r[k] === v));
   const chain = { withIndex: (_, callback) => { callback(q); return chain; }, order: () => chain, take: async n => selected().slice(0,n), first: async () => selected()[0] ?? null, unique: async () => selected()[0] ?? null };
   return chain;
  },
 }, scheduler: { runAfter: async (delay, fn, args) => scheduled.push({ delay, fn, args }) } };
 const imports = {
  "@agentmail/convex": { AgentMail: class { async sendMessage(_ctx, inbox, data) { sent.push({inbox,...data}); return "outbound"; } async status() { return { status: "sent", threadId: "provider-thread", agentmailMessageId: "outbound-message" }; } } },
  "convex/values": { v: new Proxy({}, { get: () => () => ({}) }) },
  "./_generated/server": new Proxy({}, { get: () => value => value }),
  "./_generated/api": { components: {}, internal: { suppliedLeads: { refreshDelivery: "refresh" }, email: { onReplyReceived: "reply" } } },
  "./session": { requireUserKey: async () => owner }, "./leadEvidence": evidence,
  "./sampleSource": { sampleSourceHost: () => "sample.example.com" },
  "./location": { formatMoney: (n,c) => `${c} ${n}` }, "./rateLimits": { reserveIntegrationUse: async () => {} }, "./schema": {}, "./eligibility": {},
 };
 const env = { AGENTMAIL_API_KEY: "fixture-not-a-key", AGENTMAIL_INBOX_ID: "test-inbox@example.com" };
 const handlers = load("suppliedLeads", imports, env), email = load("email", imports, env);
 const input = { title: "Fictional integration fixture", originalText: "Fictional room. Cooler can be arranged. Rent and fees need confirmation.", provenance: "Automated test fixture, never real supply", sourceDate: "2020-01-01", permissionBasis: "Fixture permission for mocked integration only", contentPermission: true, contactPermission: true, recipient: "lister@example.com", isFixture: false };
 const create = async (changes = {}) => handlers.importListing.handler(ctx, {...input,...changes});
 const send = async (id, changes = {}) => handlers.sendInquiry.handler(ctx, { id, recipient: input.recipient, requestId: "approved-request", confirmed: true, reviewedUncertainty: true, ...changes });
 return { rows, sent, scheduled, ctx, handlers, email, create, send, changeOwner: value => { owner = value; } };
}
test("labelled fixture: import, save immutable brief, approve, receipt, reply, reload", async () => {
 const h = setup(), id = await h.create();
 h.rows.get("brief").budgetMax = 2000;
 const lead = (await h.handlers.list.handler(h.ctx, {}))[0];
 assert.match(lead.requirements.join(), /8000/);
 assert.match(lead.draft.body, /mandatory recurring charge/);
 assert.match(lead.draft.body, /2020-01-01/);
 const inquiry = await h.send(id);
 assert.equal(h.sent.length, 1);
 assert.equal(h.rows.get(inquiry).status, "queued");
 const payload = { message: { inbox_id: "test-inbox@example.com", thread_id: "provider-thread", message_id: "reply-1", from: "Lister <lister@example.com>", text: "Fictional test reply: cooler costs extra." }, thread: {}, eventId: "event-1" };
 await h.email.onReplyReceived.handler(h.ctx, payload);
 assert.equal(h.scheduled.at(-1).fn, "reply");
 await h.handlers.refreshDelivery.handler(h.ctx, { id: inquiry, attempt: 0 });
 await h.email.onReplyReceived.handler(h.ctx, payload);
 await h.email.onReplyReceived.handler(h.ctx, {...payload,eventId:"event-2"});
 const reloaded = (await h.handlers.list.handler(h.ctx, {}))[0];
 assert.equal(reloaded.replies.length, 1);
 assert.equal(reloaded.inquiry.status, "sent");
 assert.equal(reloaded.sourceDate, "2020-01-01");
 assert.equal(reloaded.originalText, lead.originalText);
 assert.equal(reloaded.status, undefined); // no promotion into confirmed matches
});
test("duplicate sends remain one provider enqueue", async () => {
 const h = setup(), id = await h.create(); const first = await h.send(id);
 assert.equal(await h.send(id), first);
 await assert.rejects(() => h.send(id, { requestId: "different" }), /already exists/);
 assert.equal(h.sent.length, 1);
});
for (const [label, changes, sendChanges] of [
 ["no recipient", { recipient: "" }, {}], ["no permission", { contactPermission: false }, {}],
 ["fixture", { isFixture: true }, {}], ["no explicit approval", {}, { confirmed: false }],
 ["no evidence review", {}, { reviewedUncertainty: false }], ["recipient substitution", {}, { recipient: "other@example.com" }],
]) test(`${label} cannot send`, async () => { const h = setup(), id = await h.create(changes); await assert.rejects(() => h.send(id, sendChanges)); assert.equal(h.sent.length, 0); });
test("source revocation blocks a prepared inquiry", async () => {
 const h = setup(), id = await h.create(); await h.handlers.revoke.handler(h.ctx,{ id });
 await assert.rejects(() => h.send(id), /permission/); assert.equal(h.sent.length, 0);
});
test("another account cannot read, revoke or send", async () => {
 const h = setup(), id = await h.create(); h.changeOwner("user:bob");
 assert.equal((await h.handlers.list.handler(h.ctx, {})).length, 0);
 await assert.rejects(() => h.send(id), /not found/);
 await assert.rejects(() => h.handlers.revoke.handler(h.ctx,{ id }), /not found/);
});
test("invalid dates and missing content permission fail import", async () => {
 const h = setup(); for (const changes of [{sourceDate:"2026-02-31"},{sourceDate:"bad"},{contentPermission:false}]) await assert.rejects(() => h.create(changes));
 assert.equal(evidence.sourceAge(""), "unknown"); assert.equal(evidence.sourceAge("2020-01-01"), "stale");
});
test("retrying import preserves the first brief and inquiry identity", async () => {
 const h = setup(), id = await h.create(); h.rows.get("brief").budgetMax = 2000;
 assert.equal(await h.create(), id);
 assert.match(h.rows.get(id).requirements.join(), /8000/);
});
test("a shared-inbox message on another project thread never enters this notebook", async () => {
 const h = setup(), id = await h.create(); const inquiry = await h.send(id);
 await h.handlers.refreshDelivery.handler(h.ctx, { id: inquiry, attempt: 0 });
 await h.email.onReplyReceived.handler(h.ctx, { message: { inbox_id: "test-inbox@example.com", thread_id: "scout-thread", message_id: "unrelated", from: "lister@example.com", text: "Other project content" }, eventId: "unrelated-event", thread: {}, attempt: 6 });
 assert.equal((await h.handlers.list.handler(h.ctx, {}))[0].replies.length, 0);
});
