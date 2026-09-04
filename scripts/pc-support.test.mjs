import assert from "node:assert/strict";
import {
  freeArchetypeNeedsPrerequisiteValidation, isCompletePCClass, supportedClassCandidates
} from "./pc-support.mjs";

const candidates = ["Fighter", "Wizard", "Bard", "Rogue", "Investigator"].map((name) => ({ name }));
assert.deepEqual(supportedClassCandidates(candidates).map((candidate) => candidate.name),
  ["Fighter", "Rogue", "Investigator"]);
assert.equal(isCompletePCClass("Fighter"), true);
assert.equal(isCompletePCClass("Rogue"), true);
assert.equal(isCompletePCClass("Investigator"), true);
assert.equal(isCompletePCClass("Bard"), false);
assert.equal(freeArchetypeNeedsPrerequisiteValidation(1, true), false,
  "Free Archetype has no feat slot at level 1");
assert.equal(freeArchetypeNeedsPrerequisiteValidation(2, true), true,
  "level 2 Free Archetype requires unimplemented prerequisite validation");
assert.equal(freeArchetypeNeedsPrerequisiteValidation(1.5, true), true,
  "the gate uses the same rounded PC level as concept normalization");
assert.equal(freeArchetypeNeedsPrerequisiteValidation(1.49, true), false,
  "a value that normalizes to level 1 remains unaffected");
assert.equal(freeArchetypeNeedsPrerequisiteValidation(20, true), true,
  "higher-level Free Archetype remains blocked until its graph is validated");
assert.equal(freeArchetypeNeedsPrerequisiteValidation(20, false), false,
  "ordinary complete PC requests remain available");
console.log("pc-support.test.mjs: complete-only class registry passed");
