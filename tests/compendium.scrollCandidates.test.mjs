/* Regression coverage for equipment/loot candidate filtering of PF2e blank
 * scroll templates. The production index explicitly requests system.spell so
 * a published template with no embedded spell is distinguishable from a
 * completed embedded-spell scroll.
 * Run: node tests/compendium.scrollCandidates.test.mjs */
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
  },
  {
    _id: "gold",
    name: "Gold Pieces",
    type: "treasure",
    system: { level: { value: 0 }, category: "coin", price: { value: { gp: 1 } } }
  },
  {
    _id: "silver",
    name: "Silver Pieces",
    type: "treasure",
    system: { level: { value: 0 }, category: "coin", price: { value: { sp: 1 } } }
  },
  {
    _id: "copper",
    name: "Copper Pieces",
    type: "treasure",
    // Pre-8.4.1 source data used stackGroup; PF2e migration turns this into
    // category: coin, but the candidate gate must remain safe if migration has
    // not run yet.
    system: { level: { value: 0 }, stackGroup: "coins", price: { value: { cp: 1 } } }
  },
  {
    _id: "platinum",
    name: "Platinum Pieces",
    type: "treasure",
    system: { level: { value: 0 }, category: "coin", price: { value: { pp: 1 } } }
  },
  {
    _id: "gem",
    name: "Gem",
    type: "treasure",
    system: { level: { value: 0 }, category: "gem", price: { value: { gp: 10 } } }
  }
];

// Spell index for the scroll candidate query: a focus spell, a cantrip, a rare spell and a rank 9 spell.
const spellEntries = [
  { _id: "heal000000000001", name: "Heal", type: "spell", system: { level: { value: 1 }, traits: { value: ["healing"], rarity: "common" } } },
  { _id: "font00000000002", name: "Healing Font", type: "spell", system: { level: { value: 1 }, traits: { value: ["focus", "healing"], rarity: "common" } } },
  { _id: "light0000000003", name: "Light", type: "spell", system: { level: { value: 0 }, traits: { value: ["cantrip"], rarity: "common" } } },
  { _id: "ward000000000004", name: "Ancient Ward", type: "spell", system: { level: { value: 2 }, traits: { value: ["abjuration"], rarity: "rare" } } },
  { _id: "wish0000000000005", name: "Wish", type: "spell", system: { level: { value: 9 }, traits: { value: [], rarity: "common" } } }
];
const spellPack = {
  async getIndex() { return spellEntries.map((entry) => structuredClone(entry)); }
};
const pack = {
  async getIndex({ fields }) {
    requestedFields.push(fields);
    return entries.map((entry) => structuredClone(entry));
  }
};
globalThis.game = {
  settings: { get: () => ({ equipment: ["test.equipment"], spells: ["test.spells"] }) },
  packs: new Map([["test.equipment", pack], ["test.spells", spellPack]])
};

const { findEntry, getEquipmentCandidates, getLootCandidates, getScrollSpellCandidates } = await import("../scripts/compendium.mjs");
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
assert.ok(lootNames.includes("Gem"), "non-coin treasure remains eligible as loot");
for (const name of ["Gold Pieces", "Silver Pieces", "Copper Pieces", "Platinum Pieces"]) {
  assert.ok(!lootNames.includes(name), `${name} must stay out of the loot selector catalog and remain module-built currency`);
}

// Candidate filtering must not poison the shared index used by the grounded
// scroll builder's findScrollTemplate() path.
const template = await findEntry(["test.equipment"], "Scroll of 1st-rank Spell", (entry) =>
  entry.type === "consumable"
);
assert.equal(template?._id, "RjuupS9xyXDLgyIr",
  "the underlying index remains able to resolve a blank scroll template for building");

// Scroll and wand candidates: focus spells and cantrips never appear; rank and rarity caps apply before the cut.
const scrollNames = (await getScrollSpellCandidates(10)).map((candidate) => candidate.name);
assert.ok(scrollNames.includes("Heal") && scrollNames.includes("Wish") && scrollNames.includes("Ancient Ward"),
  "ordinary, high-rank and rare spells are offered when no rarity cap is given");
assert.ok(!scrollNames.includes("Healing Font"), "focus spells never become scroll or wand candidates");
assert.ok(!scrollNames.includes("Light"), "cantrips stay out of scroll candidates");
assert.deepEqual((await getScrollSpellCandidates(3, [], { maxRarity: "common" })).map((candidate) => candidate.name), ["Heal"],
  "the rank cap and the rarity cap both apply before the list is returned");
assert.ok((await getScrollSpellCandidates(3, [], { maxRarity: "rare" })).some((candidate) => candidate.name === "Ancient Ward"),
  "a rare cap admits rare spells");
assert.ok(!(await getScrollSpellCandidates(2)).some((candidate) => candidate.name === "Wish"), "spells above the rank cap are left out");
console.log("compendium.scrollCandidates.test.mjs: blank-template filtering and scroll spell candidate assertions passed");
