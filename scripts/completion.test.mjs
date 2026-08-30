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

const caster = completionManifest({ mode: "npc", concept: { spellcasting: { tradition: "arcane" } }, resolved: {
  spells: [{ spell: { name: "Fear" }, entry }], focusSpells: [{ spell: { name: "Force Bolt" }, entry }],
  feats: [], equipment: [], loot: []
} });
assert.equal(caster.records.filter((record) => record.category === "spellcasting-entry").length, 2,
  "normal and focus casting entries are visible module-built completion requirements");

const focusOnly = completionManifest({ mode: "character", concept: {}, resolved: {
  ancestryDoc: { name: "Human" }, backgroundDoc: { name: "Acolyte" }, classDoc: { name: "Champion" },
  spells: [], focusSpells: [{ spell: { name: "Lay on Hands" }, entry }], feats: [], equipment: [], loot: []
} });
assert.equal(focusOnly.records.filter((record) => record.category === "spellcasting-entry").length, 1,
  "a focus-only character still records its module-built casting entry");

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
