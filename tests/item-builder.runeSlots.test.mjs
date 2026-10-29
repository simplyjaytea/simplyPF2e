// Property-rune slots and the one-per-family rule on Forge runed items.
// pf2e 8.5.0 caps property runes at the potency rune (physical/runes.ts
// getPropertyRuneSlots; armor/document.ts 105–106 truncates the excess silently).
// The Forge drops the excess itself and says so. The one-per-family rule is the
// module's policy, not a pf2e rule: prunePropertyRunes is defined in runes.ts
// and never called in 8.5.0. Pure: candidates are issued as the compendium
// layer issues them, and no compendium is read.
// Run: node tests/item-builder.runeSlots.test.mjs

import assert from "node:assert/strict";
import { issueCandidate } from "../scripts/compendium.mjs";
import { normalizeRunedItemConcept } from "../scripts/item-builder.mjs";

const candidate = (id, name, fields = {}) => issueCandidate({ packId: "test.runes", _id: id }, { name, ...fields });
const BASE = candidate("full-plate", "Full Plate", { level: 2, category: "heavy" });
const POTENCY = {
  1: candidate("potency-1", "Armor Potency (+1)", { tier: 1 }),
  2: candidate("potency-2", "Armor Potency (+2)", { tier: 2 }),
  3: candidate("potency-3", "Armor Potency (+3)", { tier: 3 })
};
const ACID = candidate("acid-resistant", "Acid-Resistant", { level: 8, usage: "etched-onto-armor" });
const FIRE = candidate("fire", "Fire", { level: 8, usage: "etched-onto-armor" });
const FLAMING = candidate("flaming", "Flaming", { level: 8, usage: "etched-onto-armor" });
const GREATER_FLAMING = candidate("greater-flaming", "Flaming (Greater)", { level: 15, usage: "etched-onto-armor" });
const ARGS = {
  kind: "armor", rarity: "common", baseCandidates: [BASE],
  runeCandidates: [ACID, FIRE, FLAMING, GREATER_FLAMING],
  potencyCandidates: [POTENCY[1], POTENCY[2], POTENCY[3]],
  secondaryCandidates: []
};
const concept = (potency, propertyRuneIds) => ({
  baseItemId: BASE.id, potencyRuneId: POTENCY[potency].id, secondaryRuneId: "none", propertyRuneIds
});

const warnings = [];
const realWarn = console.warn;
console.warn = (...args) => warnings.push(args.join(" "));
try {
  // Slots: potency 1 holds one property rune. The first pick is kept, the excess is dropped and warned.
  const oneSlot = normalizeRunedItemConcept(concept(1, [ACID.id, FIRE.id]), ARGS);
  assert.deepEqual(oneSlot.propertyRunes, ["Acid-Resistant"], "potency 1 holds one property rune; the first pick is kept");
  assert.ok(warnings.some((w) => /dropped property rune "Fire"/.test(w) && /1 property-rune slot/.test(w)),
    "the excess pick is dropped with a warning that names it and the slot count");

  // Slots grow with the potency rune: +2 holds two, the third pick is the excess.
  warnings.length = 0;
  const twoSlots = normalizeRunedItemConcept(concept(2, [ACID.id, FIRE.id, FLAMING.id]), ARGS);
  assert.deepEqual(twoSlots.propertyRunes, ["Acid-Resistant", "Fire"], "potency 2 holds two property runes");
  assert.ok(warnings.some((w) => /dropped property rune "Flaming"/.test(w)), "the third pick is warned");

  // One rune per family (module policy): Flaming and Flaming (Greater) take one slot, and the greater grade is kept.
  warnings.length = 0;
  const family = normalizeRunedItemConcept(concept(1, [FLAMING.id, GREATER_FLAMING.id]), ARGS);
  assert.deepEqual(family.propertyRunes, ["Flaming (Greater)"], "the greater grade replaces the lesser grade of its family");
  assert.equal(family.propertyRuneCandidates[0], GREATER_FLAMING, "the exact issued greater candidate is kept");
  assert.ok(warnings.some((w) => /dropped property rune "Flaming"/.test(w) && /one rune per family/.test(w)),
    "the superseded grade is warned as a family drop, not a slot drop");

  // Duplicates: the same issued rune picked twice is kept once.
  warnings.length = 0;
  const duplicate = normalizeRunedItemConcept(concept(2, [ACID.id, ACID.id]), ARGS);
  assert.deepEqual(duplicate.propertyRunes, ["Acid-Resistant"], "a rune picked twice is kept once");
  assert.ok(warnings.some((w) => /dropped property rune "Acid-Resistant"/.test(w)), "the second copy is warned");

  // Regression: an existing valid item (runes within the slots, no family overlap) builds exactly as before,
  // with no warning at all.
  warnings.length = 0;
  const valid = normalizeRunedItemConcept(concept(2, [FIRE.id, ACID.id]), ARGS);
  assert.deepEqual({
    kind: valid.kind, maxLevel: valid.maxLevel, baseItemName: valid.baseItemName, potency: valid.potency,
    secondaryTier: valid.secondaryTier, propertyRunes: valid.propertyRunes, rarity: valid.rarity,
    potencyRuneCandidate: valid.potencyRuneCandidate.id, propertyRuneIds: valid.propertyRuneCandidates.map((c) => c.id)
  }, {
    kind: "armor", maxLevel: 24, baseItemName: "Full Plate", potency: 2, secondaryTier: 0,
    propertyRunes: ["Fire", "Acid-Resistant"], rarity: "common",
    potencyRuneCandidate: POTENCY[2].id, propertyRuneIds: [FIRE.id, ACID.id]
  }, "an existing valid item builds exactly as before");
  assert.deepEqual(warnings, [], "a valid item produces no warning");
} finally {
  console.warn = realWarn;
}

console.log("item-builder.runeSlots.test.mjs: property-rune slots cap at potency with a warning, one rune per family, duplicates kept once, and a valid item is unchanged");
