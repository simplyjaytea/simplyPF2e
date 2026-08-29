import assert from "node:assert/strict";
import { assertComplete, completionManifest, completionSummary } from "./completion.mjs";

const entry = { packId: "pf2e.test", _id: "a" };
const creature = completionManifest({ mode: "monster", concept: {}, resolved: {
  abilities: [{ ability: { name: "Howl", narrative: true }, entry: null }], spells: [{ spell: { name: "Fear" }, entry }],
  focusSpells: [], feats: [], equipment: [{ name: "Spear", entry }],
  loot: [{ name: "10 gold coins" }, { name: "Gold Pieces" }, { name: "Scroll of Fear", scroll: { rank: 1 }, entry }]
} });
assert.equal(creature.complete, true, "custom narrative abilities and module-built coins/scrolls are valid completion states");
assert.equal(creature.records.find((r) => r.category === "ability").status, "custom-narrative");

const unresolvedAbility = completionManifest({ mode: "monster", concept: {}, resolved: {
  abilities: [{ ability: { name: "Unresolved Glossary Ability" }, entry: null }], spells: [], focusSpells: [], feats: [], equipment: [], loot: []
} });
assert.equal(unresolvedAbility.complete, false, "only explicitly narrative abilities may bypass a missing compendium action");

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

const emptySpellPlan = completionManifest({ mode: "character", concept: {
  spellcasting: { plannedPicks: { 0: 5, 1: 2 } }
}, resolved: {
  ancestryDoc: { name: "Human" }, backgroundDoc: { name: "Scholar" }, classDoc: { name: "Wizard" },
  spells: [], focusSpells: [], feats: [], equipment: [], loot: []
} });
assert.equal(emptySpellPlan.unresolved.filter((record) => record.category === "spell").length, 7,
  "every missing module-owned spell-plan pick must block complete-only creation");

const summary = completionSummary([creature, pc]);
assert.deepEqual(summary, {
  total: creature.records.length + pc.records.length,
  compendium: 2,
  native: 3,
  moduleBuilt: 3,
  customNarrative: 1,
  unresolved: 1
}, "completion presentation must report every manifest status without exposing mutable documents");
console.log("completion.test.mjs: manifest statuses and complete-only boundary passed");
