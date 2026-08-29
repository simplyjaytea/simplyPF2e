import assert from "node:assert/strict";
import { assertComplete, completionManifest, completionSummary } from "./completion.mjs";

const entry = { packId: "pf2e.test", _id: "a" };
const creature = completionManifest({ mode: "monster", concept: {}, resolved: {
  abilities: [{ ability: { name: "Howl" }, entry: null }], spells: [{ spell: { name: "Fear" }, entry }],
  focusSpells: [], feats: [], equipment: [{ name: "Spear", entry }],
  loot: [{ name: "10 gold coins" }, { name: "Scroll of Fear", scroll: { rank: 1 }, entry }]
} });
assert.equal(creature.complete, true, "custom narrative abilities and module-built coins/scrolls are valid completion states");
assert.equal(creature.records.find((r) => r.category === "ability").status, "custom-narrative");

const incomplete = completionManifest({ mode: "npc", concept: {}, resolved: {
  equipment: [{ name: "Imaginary Sword", entry: null }], loot: [], spells: [], focusSpells: [], feats: []
} });
assert.equal(incomplete.complete, false);
assert.throws(() => assertComplete(incomplete), /Imaginary Sword/);

const pc = completionManifest({ mode: "character", concept: { heritage: "Versatile Heritage" }, resolved: {
  ancestryDoc: { name: "Human" }, backgroundDoc: { name: "Warrior" }, classDoc: { name: "Fighter" }, heritageDoc: null,
  spells: [], focusSpells: [], feats: [], equipment: [], loot: []
} });
assert.equal(pc.unresolved[0].category, "heritage");

const summary = completionSummary([creature, pc]);
assert.deepEqual(summary, {
  total: creature.records.length + pc.records.length,
  compendium: 2,
  native: 3,
  moduleBuilt: 2,
  customNarrative: 1,
  unresolved: 1
}, "completion presentation must report every manifest status without exposing mutable documents");
console.log("completion.test.mjs: manifest statuses and complete-only boundary passed");
