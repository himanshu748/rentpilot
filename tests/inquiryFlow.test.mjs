import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL("../src/components/rentpilot-cockpit.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness(overrides = {}, saveError = false) {
  const state = [], refs = [];
  let cursor = 0, refCursor = 0;
  const calls = { saved: [], sent: [] };
  const pursuit = { title: "Test room", caseId: "TEST", status: "drafted", score: 90, confidence: 80, scoreBreakdown: [], source: "Permitted sample", sourceNote: "Test only", contact: "lister@example.com", missing: [], draftSubject: "Room inquiry", draftBody: "Please confirm the rent, cooler, bed and cooking cylinder.", draftedByModel: "openai/test", sendStatus: "draft", threadId: "test-thread", ...overrides };
  const exports = {};
  const react = require("react");
  vm.runInNewContext(`${compiled}\nexports.TestPanel = EvidencePanel;`, {
    exports, crypto: { randomUUID: () => "test-request" },
    require: (name) => {
      if (name === "react") return { ...react, useState: (initial) => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; }, useRef: initial => { const i = refCursor++; return refs[i] ??= { current: initial }; }, useEffect: () => {} };
      if (name === "convex/react") return { useQuery: () => null };
      if (name === "sonner") return { toast: { success() {}, error() {} } };
      if (name === "@/lib/utils") return { cn: (...values) => values.filter(Boolean).join(" ") };
      if (name === "@/lib/pursuit") return {};
      if (name.includes("_generated/api")) return { api: { email: { deliveryStatus: {} } } };
      if (name.startsWith("@/") || name.startsWith("../../") || name === "animejs" || name === "@convex-dev/auth/react") return {};
      return require(name);
    },
  });
  function render() {
    cursor = 0; refCursor = 0;
    return exports.TestPanel({ pursuit, inDialog: false, agentmailConfigured: true, openaiConfigured: true,
      onSaveDraft: async (_, subject, body) => { if (saveError) throw Error("Save unavailable"); calls.saved.push({ subject, body }); pursuit.sendStatus = "ready"; },
      onSend: async (_, requestId) => { calls.sent.push(requestId); }, onSyncDelivery: async () => {}, onWriteDraft: async () => ({ subject: "New inquiry", body: "Please confirm all listed amenities are included in the rent.", model: "openai/test" }),
    });
  }
  return { render, calls };
}
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (tree == null || typeof tree === "boolean") return "";
  if (typeof tree !== "object") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join("");
  return text(tree.props?.children);
}
function button(tree, label) { return nodes(tree).find(n => n.type === "button" && text(n) === label); }
async function click(tree, label) {
  button(tree, label).props.onClick();
  await new Promise(resolve => setImmediate(resolve));
}

test("review saves first; only explicit confirmation sends", async () => {
  const h = harness();
  await click(h.render(), "Review & send");
  assert.equal(h.calls.saved.length, 1);
  assert.equal(h.calls.sent.length, 0);
  assert.match(text(h.render()), /Ready to send to lister@example.com/);
  await click(h.render(), "Confirm & send email");
  assert.deepEqual(h.calls.sent, ["test-request"]);
});
test("failed save preserves the draft and never opens send confirmation", async () => {
  const h = harness({}, true);
  await click(h.render(), "Review & send");
  assert.equal(button(h.render(), "Confirm & send email"), undefined);
  assert.equal(h.calls.sent.length, 0);
  assert.match(text(h.render()), /cooler, bed and cooking cylinder/);
});
test("back to editing cancels approval and saves updated text before review", async () => {
  const h = harness();
  await click(h.render(), "Review & send");
  button(h.render(), "Back to editing").props.onClick();
  assert.equal(button(h.render(), "Confirm & send email"), undefined);
  nodes(h.render()).find(n => n.type === "textarea").props.onChange({ target: { value: "Please confirm the cooler and LPG cylinder are included, with no extra fee." } });
  await click(h.render(), "Review & send");
  assert.match(h.calls.saved.at(-1).body, /no extra fee/);
  assert.equal(h.calls.sent.length, 0);
});
for (const [label, overrides] of [["missing email", { contact: null }], ["demo", { isDemo: true }], ["no AI draft", { draftedByModel: null }], ["already sent", { sendStatus: "sent" }], ["pending send", { sendStatus: "sending" }]]) {
  test(`${label} disables the email action`, () => {
    const h = harness(overrides);
    const action = nodes(h.render()).find(n => n.type === "button" && n.props.className.includes("send-action"));
    assert.equal(action.props.disabled, true);
  });
}
