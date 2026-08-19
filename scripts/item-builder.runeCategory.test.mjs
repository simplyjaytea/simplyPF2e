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
import { propertyRuneFitsBase, propertyRuneRestrictionNote } from "./runes.mjs";
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
const BASES = [
  { name: "Full Plate", level: 2, category: "heavy" },
  { name: "Leather Armor", level: 0, category: "light" }
];
const RUNES = [
  { name: "Invisibility", level: 8, usage: "etched-onto-light-armor" },
  { name: "Fortification", level: 12, usage: "etched-onto-med-heavy-armor" },
  { name: "Acid-Resistant", level: 8, usage: "etched-onto-armor" }
];
const ARGS = {
  kind: "armor", rarity: "common",
  baseCandidates: BASES, runeCandidates: RUNES,
  potencyTiers: [1, 2, 3], secondaryTiers: [1, 2, 3]
};

const warnings = [];
const realWarn = console.warn;
console.warn = (...args) => warnings.push(args.join(" "));
try {
  const onHeavy = normalizeRunedItemConcept({
    baseItemName: "Full Plate", potency: 2, secondaryTier: 1,
    propertyRunes: ["Invisibility", "Fortification"]
  }, ARGS);
  assert.deepEqual(onHeavy.propertyRunes, ["Fortification"],
    "a light-armor rune on a heavy base is dropped; the med/heavy rune survives");
  assert.ok(warnings.some((w) => w.includes("Invisibility") && w.includes("heavy")),
    "the drop is warned, naming the rune and the base category");

  const onLight = normalizeRunedItemConcept({
    baseItemName: "Leather Armor", potency: 3, secondaryTier: 0,
    propertyRunes: ["Fortification", "Invisibility", "Acid-Resistant"]
  }, ARGS);
  assert.deepEqual(onLight.propertyRunes, ["Invisibility", "Acid-Resistant"],
    "a med/heavy rune on a light base is dropped; light-legal runes survive");

  // The dropped rune must not eat a potency slot that a later legal pick
  // could have used: with potency 1, an illegal first pick still leaves the
  // slot for the next legal rune.
  const slotNotWasted = normalizeRunedItemConcept({
    baseItemName: "Full Plate", potency: 1, secondaryTier: 0,
    propertyRunes: ["Invisibility", "Acid-Resistant"]
  }, ARGS);
  assert.deepEqual(slotNotWasted.propertyRunes, ["Acid-Resistant"],
    "an illegal pick doesn't consume the potency slot");

  // Weapons are untouched by the category gate.
  const weapon = normalizeRunedItemConcept({
    baseItemName: "Longsword", potency: 1, secondaryTier: 0,
    propertyRunes: ["Flaming"]
  }, {
    kind: "weapon", rarity: "common",
    baseCandidates: [{ name: "Longsword", level: 0, category: "martial" }],
    runeCandidates: [{ name: "Flaming", level: 8, usage: "etched-onto-a-weapon" }],
    potencyTiers: [1, 2, 3], secondaryTiers: [1, 2, 3]
  });
  assert.deepEqual(weapon.propertyRunes, ["Flaming"], "weapon runes pass through unchanged");
} finally {
  console.warn = realWarn;
}

console.log("item forge armor-category rune gate check: all assertions passed");
