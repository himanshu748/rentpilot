import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
function harness(changes={}) {
 const state=[],calls=[]; let cursor=0; const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../src/components/supplied-leads-panel.tsx",import.meta.url),"utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{exports,crypto:{randomUUID:()=>"request"},require:name=>{
  if(name==="react")return {...require("react"),useState:initial=>{const i=cursor++;if(!(i in state))state[i]=typeof initial==="function"?initial():initial;return[state[i],value=>{state[i]=value;}];}};
  if(name==="convex/react")return {useMutation:fn=>async args=>calls.push({fn,args})};
  if(name.includes("_generated/api"))return {api:{suppliedLeads:{sendInquiry:"send",revoke:"revoke"}}};
  if(name.endsWith("leadEvidence"))return {sourceAge:()=>"stale"};
  return require(name);
 }});
 const lead={_id:"fixture",title:"Fictional UI test",contactPermission:true,recipient:"fixture@example.com",isFixture:false,requirements:["Bed"],sourceDate:"2020-01-01",originalText:"Fictional incomplete room",draft:{subject:"Questions",body:"Is a bed included?"},replies:[],...changes};
 return {calls,render:()=>{cursor=0;return exports.SuppliedLeadCard({lead});}};
}
const nodes=x=>!x||typeof x!=="object"?[]:Array.isArray(x)?x.flatMap(nodes):[x,...nodes(x.props?.children)];
const text=x=>x==null||typeof x==="boolean"?"":typeof x!=="object"?String(x):Array.isArray(x)?x.map(text).join(""):text(x.props?.children);
const button=(tree,label)=>nodes(tree).find(n=>n.type==="button"&&text(n)===label);
test("Ask to verify reviews first; acknowledgement and explicit confirmation precede send",async()=>{
 const h=harness();button(h.render(),"Ask to verify").props.onClick();
 assert.equal(h.calls.length,0);assert.match(text(h.render()),/fixture@example.com/);
 assert.equal(button(h.render(),"Confirm & send email").props.disabled,true);
 nodes(h.render()).find(n=>n.type==="input").props.onChange({target:{checked:true}});
 assert.equal(button(h.render(),"Confirm & send email").props.disabled,false);
 await button(h.render(),"Confirm & send email").props.onClick();
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].args.confirmed,true);
});
for(const changes of [{isFixture:true},{recipient:""},{contactPermission:false},{revokedAt:1}])test(`ineligible lead disables Ask to verify ${JSON.stringify(changes)}`,()=>{
 assert.equal(button(harness(changes).render(),"Ask to verify").props.disabled,true);
});
