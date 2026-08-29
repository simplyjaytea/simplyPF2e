import assert from "node:assert/strict";
import { isCompletePCClass, supportedClassCandidates } from "./pc-support.mjs";

const candidates = ["Fighter", "Wizard", "Bard", "Rogue", "Investigator"].map((name) => ({ name }));
assert.deepEqual(supportedClassCandidates(candidates).map((candidate) => candidate.name), ["Fighter", "Wizard", "Rogue", "Investigator"]);
assert.equal(isCompletePCClass("Fighter"), true);
assert.equal(isCompletePCClass("Bard"), false);
console.log("pc-support.test.mjs: complete-only class registry passed");
