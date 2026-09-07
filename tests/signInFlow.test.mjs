import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(fs.readFileSync(new URL("../src/components/sign-in-dialog.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(signIn = async () => {}) {
  const state = [], refs = [], calls = [];
  let cursor = 0, refCursor = 0, now = 100_000, signedIn = 0, open = true;
  const exports = {}, react = require("react");
  vm.runInNewContext(compiled, {
    exports, Date: { now: () => now },
    require(name) {
      if (name === "react") return { ...react,
        useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial; return [state[i], value => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; },
        useRef(initial) { return refs[refCursor++] ??= { current: initial }; }, useEffect() {},
      };
      if (name === "@convex-dev/auth/react") return { useAuthActions: () => ({ signIn: async (provider, args) => { calls.push({ provider, ...args }); return signIn(provider, args); } }) };
      return require(name);
    },
  });
  return {
    render() { cursor = 0; refCursor = 0; return exports.SignInDialog({ open, onOpenChange: value => { open = value; }, onSignedIn: async () => { signedIn++; } }); },
    calls, advance(ms) { now += ms; }, get signedIn() { return signedIn; },
  };
}
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (tree == null || typeof tree === "boolean") return "";
  if (typeof tree !== "object") return String(tree);
  return Array.isArray(tree) ? tree.map(text).join("") : text(tree.props?.children);
}
function fill(h, id, value) { nodes(h.render()).find(n => n.props?.id === id).props.onChange({ target: { value } }); }
function click(h, label) { return nodes(h.render()).find(n => n.type === "button" && text(n) === label).props.onClick(); }
function submit(h) { return nodes(h.render()).find(n => n.type === "form").props.onSubmit({ preventDefault() {} }); }
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

test("an existing code can be verified without sending another email", async () => {
  const h = harness();
  fill(h, "signin-email", " renter@example.com ");
  click(h, "I already have a code");
  assert.equal(h.calls.length, 0);
  assert.doesNotMatch(text(h.render()), /provider accepted/);
  fill(h, "signin-code", "123 456");
  await submit(h);
  assert.equal(h.calls[0].code, "123456");
  assert.equal(h.calls[0].email, "renter@example.com");
  assert.equal(h.signedIn, 1);
});
test("existing-code recovery validates the email first", () => {
  const h = harness();
  click(h, "I already have a code");
  assert.match(text(h.render()), /Enter the email address that received/);
  assert.equal(h.calls.length, 0);
});
test("delivery failure still allows entry of a late code", async () => {
  const h = harness(async () => { throw Error("Delivery not confirmed"); });
  fill(h, "signin-email", "renter@example.com");
  await submit(h);
  assert.match(text(h.render()), /If a code arrived/);
  click(h, "I already have a code");
  assert.ok(nodes(h.render()).find(n => n.props?.id === "signin-code"));
  assert.equal(h.calls.length, 1);
});
test("duplicate requests are blocked and resend has a one-minute cooldown", async () => {
  const wait = deferred();
  const h = harness(() => wait.promise);
  fill(h, "signin-email", "renter@example.com");
  const pending = submit(h);
  await submit(h);
  assert.equal(h.calls.length, 1);
  wait.resolve(); await pending;
  const resend = nodes(h.render()).find(n => n.type === "button" && /Resend available/.test(text(n)));
  assert.equal(resend.props.disabled, true);
  await resend.props.onClick();
  assert.equal(h.calls.length, 1);
  h.advance(60_001);
  await resend.props.onClick();
  assert.equal(h.calls.length, 2);
});
test("closing and reopening preserves the code-entry step", async () => {
  const h = harness();
  fill(h, "signin-email", "renter@example.com");
  await submit(h);
  h.render().props.onOpenChange(false);
  h.render().props.onOpenChange(true);
  assert.ok(nodes(h.render()).find(n => n.props?.id === "signin-code"));
  assert.equal(h.calls.length, 1);
});
test("late responses cannot overwrite a reopened dialog for another address", async () => {
  const wait = deferred();
  const h = harness(() => wait.promise);
  fill(h, "signin-email", "first@example.com");
  const pending = submit(h);
  h.render().props.onOpenChange(false);
  h.render().props.onOpenChange(true);
  fill(h, "signin-email", "second@example.com");
  wait.resolve(); await pending;
  assert.ok(nodes(h.render()).find(n => n.props?.id === "signin-email"));
  assert.doesNotMatch(text(h.render()), /provider accepted/);
});
test("manual code recovery ignores the pending delivery result", async () => {
  const wait = deferred();
  const h = harness(() => wait.promise);
  fill(h, "signin-email", "renter@example.com");
  const pending = submit(h);
  click(h, "I already have a code");
  fill(h, "signin-code", "123456");
  wait.reject(Error("Late timeout")); await pending;
  assert.equal(nodes(h.render()).find(n => n.props?.id === "signin-code").props.value, "123456");
  assert.doesNotMatch(text(h.render()), /could not confirm/);
});
test("an invalid code stays editable and never reports sign-in success", async () => {
  const h = harness(async () => { throw Error("Invalid code"); });
  fill(h, "signin-email", "renter@example.com");
  click(h, "I already have a code");
  fill(h, "signin-code", "123456");
  await submit(h);
  assert.equal(h.signedIn, 0);
  assert.match(text(h.render()), /code did not match/);
  assert.equal(nodes(h.render()).find(n => n.props?.id === "signin-code").props.disabled, false);
});
