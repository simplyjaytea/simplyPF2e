// Checks the armor-category gate on item forge property runes (a known gap
// until now): a rune whose real usage string restricts it to light armor
// ("etched-onto-light-armor") could land on a heavy base, because the
// candidate list only checked kind, never the base armor's category.
// Run: node scripts/item-builder.runeCategory.test.mjs
//
// Both functions under test are pure: propertyRuneFitsBase is a lookup
// against the verified usage->category table, and normalizeRunedItemConcept
// takes its candidate lists as arguments, so no compendium is needed.

import assert from "node:assert/strict";
import { issueCandidate } from "./compendium.mjs";
import {
  getBaseItemCandidates, getPropertyRuneCandidates,
  propertyRuneFitsBase, propertyRuneRestrictionNote
} from "./runes.mjs";
import { normalizeRunedItemConcept } from "./item-builder.mjs";

/* ---------------- usage -> category fit ---------------- */

assert.ok(propertyRuneFitsBase("armor", "etched-onto-armor", "heavy"), "an unrestricted armor rune fits any category");
assert.ok(propertyRuneFitsBase("armor", "etched-onto-light-armor", "light"), "a light-armor rune fits light armor");
assert.ok(!propertyRuneFitsBase("armor", "etched-onto-light-armor", "heavy"), "a light-armor rune does NOT fit heavy armor");
assert.ok(propertyRuneFitsBase("armor", "etched-onto-med-heavy-armor", "medium"), "a med/heavy rune fits medium armor");
assert.ok(propertyRuneFitsBase("armor", "etched-onto-med-heavy-armor", "heavy"), "a med/heavy rune fits heavy armor");
assert.ok(!propertyRuneFitsBase("armor", "etched-onto-med-heavy-armor", "light"), "a med/heavy rune does NOT fit light armor");
assert.ok(propertyRuneFitsBase("armor", "etched-onto-heavy-armor", "heavy"), "a heavy-only rune fits heavy armor");
assert.ok(!propertyRuneFitsBase("armor", "etched-onto-heavy-armor", "medium"), "a heavy-only rune does NOT fit medium armor");

// Fail closed: anything the table doesn't know is rejected, never guessed.
assert.ok(!propertyRuneFitsBase("armor", "etched-onto-metal-armor", "heavy"), "a material-constrained usage fails closed (metal-ness isn't in the index)");
assert.ok(!propertyRuneFitsBase("armor", "etched-onto-light-armor", null), "a restricted rune on an unknown-category base fails closed");
assert.ok(propertyRuneFitsBase("armor", "etched-onto-armor", null), "an unrestricted rune still fits an unknown-category base");
assert.ok(propertyRuneFitsBase("weapon", "etched-onto-a-weapon", null), "weapon runes carry no category constraint");

assert.equal(propertyRuneRestrictionNote("etched-onto-light-armor"), "light armor only", "restricted usages get a prompt note");
assert.equal(propertyRuneRestrictionNote("etched-onto-med-heavy-armor"), "medium/heavy armor only", "multi-category notes join with a slash");
assert.equal(propertyRuneRestrictionNote("etched-onto-armor"), null, "unrestricted usages get no note");

/* ---------------- normalizeRunedItemConcept gating ---------------- */

// Real shapes: entries as getBaseItemCandidates/getPropertyRuneCandidates
// return them, usages as published (Invisibility is a real light-armor rune,
// Fortification a real med/heavy one).
const candidate = (id, name, fields = {}) => issueCandidate(
  { packId: "test.runes", _id: id }, { name, ...fields }
);
const BASES = [
  candidate("full-plate", "Full Plate", { level: 2, category: "heavy" }),
  candidate("leather", "Leather Armor", { level: 0, category: "light" })
];
const RUNES = [
  candidate("invisibility", "Invisibility", { level: 8, usage: "etched-onto-light-armor" }),
  candidate("fortification", "Fortification", { level: 12, usage: "etched-onto-med-heavy-armor" }),
  candidate("acid-resistant", "Acid-Resistant", { level: 8, usage: "etched-onto-armor" })
];
const ARGS = {
  kind: "armor", rarity: "common",
  baseCandidates: BASES, runeCandidates: RUNES,
  potencyCandidates: [
    candidate("potency-1", "Armor Potency (+1)", { tier: 1 }),
    candidate("potency-2", "Armor Potency (+2)", { tier: 2 }),
    candidate("potency-3", "Armor Potency (+3)", { tier: 3 })
  ],
  secondaryCandidates: [candidate("secondary-1", "Resilient", { tier: 1 })]
};
const [POTENCY_ONE, POTENCY_TWO, POTENCY_THREE] = ARGS.potencyCandidates;
const [SECONDARY_ONE] = ARGS.secondaryCandidates;

const warnings = [];
const realWarn = console.warn;
console.warn = (...args) => warnings.push(args.join(" "));
try {
  const onHeavy = normalizeRunedItemConcept({
    baseItemId: BASES[0].id, potencyRuneId: POTENCY_TWO.id, secondaryRuneId: SECONDARY_ONE.id,
    propertyRuneIds: [RUNES[0].id, RUNES[1].id]
  }, ARGS);
  assert.deepEqual(onHeavy.propertyRunes, ["Fortification"],
    "a light-armor rune on a heavy base is dropped; the med/heavy rune survives");
  assert.ok(warnings.some((w) => w.includes("Invisibility") && w.includes("heavy")),
    "the drop is warned, naming the rune and the base category");

  const onLight = normalizeRunedItemConcept({
    baseItemId: BASES[1].id, potencyRuneId: POTENCY_THREE.id, secondaryRuneId: "none",
    propertyRuneIds: [RUNES[1].id, RUNES[0].id, RUNES[2].id]
  }, ARGS);
  assert.deepEqual(onLight.propertyRunes, ["Invisibility", "Acid-Resistant"],
    "a med/heavy rune on a light base is dropped; light-legal runes survive");

  // The dropped rune must not eat a potency slot that a later legal pick
  // could have used: with potency 1, an illegal first pick still leaves the
  // slot for the next legal rune.
  const slotNotWasted = normalizeRunedItemConcept({
    baseItemId: BASES[0].id, potencyRuneId: POTENCY_ONE.id, secondaryRuneId: "none",
    propertyRuneIds: [RUNES[0].id, RUNES[2].id]
  }, ARGS);
  assert.deepEqual(slotNotWasted.propertyRunes, ["Acid-Resistant"],
    "an illegal pick doesn't consume the potency slot");

  // Weapons are untouched by the category gate.
  const weaponArgs = {
    kind: "weapon", rarity: "common",
    baseCandidates: [candidate("weapon-base", "Longsword", { level: 0, category: "martial" })],
    runeCandidates: [candidate("weapon-flaming", "Flaming", { level: 8, usage: "etched-onto-a-weapon" })],
    potencyCandidates: [candidate("weapon-potency", "Weapon Potency (+1)", { tier: 1 })], secondaryCandidates: []
  };
  const weapon = normalizeRunedItemConcept({
    baseItemId: weaponArgs.baseCandidates[0].id, potencyRuneId: weaponArgs.potencyCandidates[0].id,
    secondaryRuneId: "none", propertyRuneIds: [weaponArgs.runeCandidates[0].id]
  }, weaponArgs);
  assert.deepEqual(weapon.propertyRunes, ["Flaming"], "weapon runes pass through unchanged");
} finally {
  console.warn = realWarn;
}

/* ---------------- compendium index -> candidates ---------------- */

// Exercise the Foundry-facing boundary added with this fix. The pure tests
// above would still pass if getEquipmentIndex forgot to request
// system.category, or if getAllEquipmentEntries dropped it while flattening
// index records. A minimal game/pack mock lets the real production functions
// prove that category and usage survive all the way into the candidate lists.
const previousGame = globalThis.game;
let requestedFields = [];
const indexEntries = [
  { _id: "full-plate", name: "Full Plate", type: "armor", system: { level: { value: 2 }, category: "heavy" } },
  { _id: "leather", name: "Leather Armor", type: "armor", system: { level: { value: 0 }, category: "light" } },
  { _id: "specific-full", name: "Specific Full Plate", type: "armor", system: {
    level: { value: 5 }, category: "heavy", specific: {}
  } },
  { _id: "longsword", name: "Longsword", type: "weapon", system: { level: { value: 0 } } },
  { _id: "specific-longsword", name: "Specific Longsword", type: "weapon", system: {
    level: { value: 5 }, specific: {}
  } },
  { _id: "invisibility", name: "Invisibility", type: "equipment", system: {
    level: { value: 8 }, usage: { value: "etched-onto-light-armor" }
  } },
  { _id: "fortification", name: "Fortification", type: "equipment", system: {
    level: { value: 12 }, usage: { value: "etched-onto-med-heavy-armor" }
  } },
  { _id: "shadow", name: "Shadow", type: "equipment", system: {
    level: { value: 5 }, usage: { value: "etched-onto-lm-nonmetal-armor" }
  } },
  { _id: "armor-potency", name: "Armor Potency (+1)", type: "equipment", system: {
    level: { value: 5 }, usage: { value: "etched-onto-armor" }
  } }
];

globalThis.game = {
  settings: { get: () => ({}) },
  packs: new Map([["pf2e.equipment-srd", {
    getIndex: async ({ fields }) => {
      requestedFields = fields;
      return indexEntries;
    }
  }]])
};

try {
  const indexedBases = await getBaseItemCandidates("armor", 20);
  assert.ok(requestedFields.includes("system.category"),
    "the equipment index explicitly requests the base armor category");
  assert.ok(requestedFields.includes("system.specific"),
    "the equipment index explicitly requests PF2e's specific-item marker");
  assert.deepEqual(indexedBases.map(({ name, level, category }) => ({ name, level, category })), [
    { name: "Leather Armor", level: 0, category: "light" },
    { name: "Full Plate", level: 2, category: "heavy" }
  ], "base candidates preserve real system.category values from the pack index");

  const indexedWeapons = await getBaseItemCandidates("weapon", 20);
  assert.deepEqual(indexedWeapons.map(({ name, level, category }) => ({ name, level, category })), [
    { name: "Longsword", level: 0, category: null }
  ], "specific weapons are excluded while a base missing system.specific remains ordinary");

  const indexedRunes = await getPropertyRuneCandidates("armor", 20);
  assert.deepEqual(indexedRunes.map(({ name, level, usage }) => ({ name, level, usage })), [
    { name: "Invisibility", level: 8, usage: "etched-onto-light-armor" },
    { name: "Fortification", level: 12, usage: "etched-onto-med-heavy-armor" }
  ], "rune candidates preserve supported usages while excluding material-constrained and fundamental runes");
} finally {
  if (previousGame === undefined) delete globalThis.game;
  else globalThis.game = previousGame;
}

console.log("item forge armor-category rune gate check: all assertions passed");
