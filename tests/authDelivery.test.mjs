import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../convex/authDelivery.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, setTimeout });
const { waitForCodeAcceptance } = exports;
test("queued code is not reported as sent; waits for provider receipt", async () => {
  const states = [{ status: "pending", agentmailMessageId: null }, { status: "sent", agentmailMessageId: "receipt" }];
  let pauses = 0;
  await waitForCodeAcceptance(async () => states.shift(), async () => { pauses++; });
  assert.equal(pauses, 1);
});
for (const status of ["failed", "bounced", "rejected", "complained"]) {
  test(`${status} stops sign-in before code entry`, async () => {
    await assert.rejects(() => waitForCodeAcceptance(async () => ({ status, agentmailMessageId: null }), async () => {}), /could not send/);
  });
}
test("pending and sent-without-receipt time out honestly", async () => {
  for (const status of ["pending", "sent"]) {
    let calls = 0;
    await assert.rejects(() => waitForCodeAcceptance(async () => { calls++; return { status, agentmailMessageId: null }; }, async () => {}, 3), /not confirmed/);
    assert.equal(calls, 3);
  }
});
test("missing queue record is an error, not success", async () => {
  await assert.rejects(() => waitForCodeAcceptance(async () => null), /could not be tracked/);
});
test("delivered receipt is accepted without claiming inbox placement", async () => {
  await waitForCodeAcceptance(async () => ({ status: "delivered", agentmailMessageId: "receipt" }));
});
