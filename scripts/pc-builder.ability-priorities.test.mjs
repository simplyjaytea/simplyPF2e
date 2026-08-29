import assert from "node:assert/strict";
import { normalizePCConcept } from "./pc-builder.mjs";

const concept = normalizePCConcept({ abilityPriorities: ["dex", "int", "dex", "bad", "wis"] }, { level: 5 });
assert.deepEqual(concept.abilityPriorities, ["dex", "int", "wis"]);
assert.deepEqual(normalizePCConcept({}, { level: 1 }).abilityPriorities, []);
console.log("pc-builder.ability-priorities.test.mjs: validated concept ability preferences passed");
