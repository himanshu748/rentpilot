import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(name, imports = {}) {
  const exports = {};
  const source = fs.readFileSync(new URL(`../convex/${name}.ts`, import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, URL, require: (id) => { if (id in imports) return imports[id]; throw new Error(id); } });
  return exports;
}
const location = load("location");
const { eligibilityProblems, groundedAmenities } = load("eligibility", { "./location": location });
const brief = { city: "Lucknow", country: "India", currency: "INR", budgetMin: 0, budgetMax: 8000, localities: ["Bithauli", "Bhitauli"], bedrooms: ["Private room"], mustHaves: ["Cooler", "Bed", "LPG cooking cylinder"] };
const listing = { ...brief, rent: 8000, locality: "Bhitauli", bedrooms: "Private room", amenityEvidence: brief.mustHaves.map((requirement) => ({ requirement, status: "present", quote: `${requirement} included in rent.` })) };
test("Bithauli room at exactly INR8000 with every inclusion is eligible", () => assert.equal(eligibilityProblems(listing, brief).length, 0));
test("budget is a hard cap, including one paisa over", () => {
  for (const rent of [8000.01, 9600, 20000, NaN]) assert.match(eligibilityProblems({ ...listing, rent }, brief).join(), /hard budget/);
});
test("furnished is not evidence for a bed, cooler or cooking cylinder", () => {
  assert.equal(eligibilityProblems({ ...listing, amenityEvidence: [] }, brief).length, 3);
});
test("absent amenities and changed requirements never count as matches", () => {
  assert.match(eligibilityProblems({ ...listing, amenityEvidence: [{ requirement: "Cooler", status: "absent", quote: "No cooler" }] }, brief).join(), /not provided/);
  assert.match(eligibilityProblems(listing, { ...brief, mustHaves: [...brief.mustHaves, "WiFi"] }).join(), /WiFi/);
});
test("do not match an apartment or an unrelated locality by substring", () => {
  assert.match(eligibilityProblems({ ...listing, bedrooms: "1 BHK" }, brief).join(), /Room type/);
  assert.match(eligibilityProblems({ ...listing, locality: "Not Bithauli" }, brief).join(), /selected locality/);
});
test("fabricated or missing source quotes are unknown", () => {
  const grounded = groundedAmenities([{ requirement: "Bed", status: "present", quote: "Bed included" }], "Unfurnished room", ["Bed", "Cooler"]);
  assert.equal(grounded[0].status, "unknown");
  assert.equal(grounded[1].status, "unknown");
  assert.equal(groundedAmenities([{ requirement: "Bed", status: "present", quote: "Bed included" }], "Bed included in rent", ["Bed"])[0].status, "present");
});
test("old pursuits are re-evaluated against the new lower budget", () => assert.match(eligibilityProblems(listing, { ...brief, budgetMax: 7000 }).join(), /budget/));
test("a real but irrelevant or negative quote cannot prove an amenity", () => {
  for (const quote of ["Fully furnished room", "One bedroom", "Bed not included", "Bed available for extra charge"]) {
    assert.equal(groundedAmenities([{ requirement: "Bed", status: "present", quote }], quote, ["Bed"])[0].status, "unknown");
  }
  assert.equal(groundedAmenities([{ requirement: "LPG cooking cylinder", status: "present", quote: "Kitchen included" }], "Kitchen included", ["LPG cooking cylinder"])[0].status, "unknown");
});
