import assert from "node:assert/strict";
import { normalizeConcept, computeStats } from "./builder.mjs";

const baseline = normalizeConcept({ perceptionScale: "low" }, { level: 3, rarity: "common" });
const warnings = [];
const originalWarn = console.warn;
let concept;
try {
  console.warn = (...args) => warnings.push(args.join(" "));
  concept = normalizeConcept({ perceptionScale: "low", skills: [
    { name: "Perception", scale: "extreme" },
    { name: " PERCEPTION ", scale: "high" },
    { name: "Stealth", scale: "high" },
    { name: "Perception Lore", scale: "moderate" }
  ] }, { level: 3, rarity: "common" });
} finally {
  console.warn = originalWarn;
}
assert.deepEqual(concept.skills.map((skill) => skill.name), ["Stealth", "Perception Lore"],
  "the native Perception statistic cannot also become a conflicting Lore skill");
assert.equal(computeStats(concept).perception, computeStats(baseline).perception,
  "perceptionScale remains the only authority for the Perception modifier");
assert.equal(warnings.length, 2, "invalid reserved skill picks are reported");
console.log("builder.perceptionSkill.test.mjs: Perception stays a single native statistic");
