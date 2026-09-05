/* Regression coverage for equipment/loot candidate filtering of PF2e blank
 * scroll templates. The production index explicitly requests system.spell so
 * a published template with no embedded spell is distinguishable from a
 * completed embedded-spell scroll.
 * Run: node scripts/compendium.scrollCandidates.test.mjs */
import assert from "node:assert/strict";

const requestedFields = [];
const entries = [
  {
    _id: "RjuupS9xyXDLgyIr",
    name: "Scroll of 1st-rank Spell",
    type: "consumable",
    system: {
      level: { value: 1 },
      category: "scroll",
      traits: { value: ["consumable", "magical", "scroll"] }
    }
  },
  {
    _id: "Y7UD64foDbDMV9sx",
    name: "Scroll of 2nd-rank Spell",
    type: "consumable",
    system: {
      level: { value: 2 },
      category: "scroll",
      traits: { value: ["consumable", "magical", "scroll"] },
      spell: null
    }
  },
  {
    _id: "embedded-scroll",
    name: "Scroll of Embedded Spell",
    type: "consumable",
    system: {
      level: { value: 1 },
      category: "scroll",
      traits: { value: ["consumable", "magical", "scroll"] },
      spell: { uuid: "Compendium.test.spells.Item.fireball" }
    }
  },
  {
    _id: "potion",
    name: "Healing Potion",
    type: "consumable",
    system: { level: { value: 1 }, category: "potion", traits: { value: ["consumable"] } }
  },
  {
    _id: "sword",
    name: "Longsword",
    type: "weapon",
    system: { level: { value: 0 }, traits: { value: [] } }
  }
];

const pack = {
  async getIndex({ fields }) {
    requestedFields.push(fields);
    return entries.map((entry) => structuredClone(entry));
  }
};
globalThis.game = {
  settings: { get: () => ({ equipment: ["test.equipment"] }) },
  packs: new Map([["test.equipment", pack]])
};

const { findEntry, getEquipmentCandidates, getLootCandidates } = await import("./compendium.mjs");
const equipment = await getEquipmentCandidates(2);
const loot = await getLootCandidates(0);
const equipmentNames = equipment.map((candidate) => candidate.name);
const lootNames = loot.map((candidate) => candidate.name);

assert.ok(requestedFields.some((fields) => fields.includes("system.spell")),
  "candidate indexing must request system.spell rather than filtering an unindexed field");
assert.ok(!equipmentNames.includes("Scroll of 1st-rank Spell"),
  "a blank scroll template with an absent system.spell must not be equipment candidate");
assert.ok(!lootNames.includes("Scroll of 2nd-rank Spell"),
  "a blank scroll template with system.spell null must not be loot candidate");
assert.ok(equipmentNames.includes("Scroll of Embedded Spell"),
  "a scroll carrying an embedded spell remains an eligible equipment candidate");
assert.ok(lootNames.includes("Scroll of Embedded Spell"),
  "a scroll carrying an embedded spell remains an eligible loot candidate");
assert.ok(equipmentNames.includes("Healing Potion") && equipmentNames.includes("Longsword"),
  "ordinary consumables and equipment remain eligible");
assert.ok(lootNames.includes("Healing Potion") && lootNames.includes("Longsword"),
  "ordinary consumables and equipment remain eligible as loot");

// Candidate filtering must not poison the shared index used by the grounded
// scroll builder's findScrollTemplate() path.
const template = await findEntry(["test.equipment"], "Scroll of 1st-rank Spell", (entry) =>
  entry.type === "consumable"
);
assert.equal(template?._id, "RjuupS9xyXDLgyIr",
  "the underlying index remains able to resolve a blank scroll template for building");

console.log("compendium.scrollCandidates.test.mjs: blank-template filtering assertions passed");
