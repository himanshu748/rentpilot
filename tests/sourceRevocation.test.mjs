import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
test("source revocation during extraction blocks persistence before any listing write", async () => {
 const exports = {};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../convex/discovery.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, require: id => {
  if(id === "@firecrawl/firecrawl-convex") return { FirecrawlClient: class {} };
  if(id === "convex/values") return { v: new Proxy({}, {get:()=>()=>({})}) };
  if(id === "./_generated/api") return {components:{},internal:{}};
  if(id === "./_generated/server") return new Proxy({}, {get:()=>x=>x});
  if(["./leadEvidence","./sampleSource","./session","./location","./schema","./eligibility"].includes(id)) return {};
  throw Error(id);
 } });
 let writes = 0;
 await assert.rejects(() => exports.persistExtractedListing.handler({db:{get:async()=>({permissionStatus:"blocked"}),insert:async()=>{writes++;}}},{sourceId:"revoked"}),/revoked/);
 assert.equal(writes,0);
});
