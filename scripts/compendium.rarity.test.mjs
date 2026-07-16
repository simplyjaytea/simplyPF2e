/* Regression test for the Max-rarity cap rule in scripts/compendium.mjs's
   getFullCandidates() (used by getAncestry/Background/HeritageCandidates).
   RARITY_RANK copied from compendium.mjs:288; the filter rule below mirrors
   lines 300 ("maxRank = RARITY_RANK[maxRarity] ?? RARITY_RANK.unique") and
   308-309 (rarity defaults to "common", drop when rank > maxRank).
   getFullCandidates itself reads game.packs (Foundry globals), so it can't
   run in plain Node — keep this helper in sync if that filter ever changes.
   Run: node scripts/compendium.rarity.test.mjs */
import assert from "node:assert/strict";

const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, unique: 3 };

// Ported verbatim from compendium.mjs:300,308-309, including the
// entry.system?.traits?.rarity ?? "common" default (line 308).
function passesRarityCap(entryRarity, maxRarity) {
  const maxRank = RARITY_RANK[maxRarity] ?? RARITY_RANK.unique;
  const rarity = entryRarity ?? "common";
  return (RARITY_RANK[rarity] ?? 0) <= maxRank;
}

const ALL = ["common", "uncommon", "rare", "unique"];

// cap -> exact list of rarities that must pass
const CASES = [
  ["common", ["common"]],
  ["uncommon", ["common", "uncommon"]],
  ["rare", ["common", "uncommon", "rare"]],
  ["unique", ALL],
  [undefined, ALL], // caller omitted maxRarity (e.g. getClassCandidates) — ?? falls back to unique
  ["legendary", ALL], // unrecognized cap string — RARITY_RANK["legendary"] is undefined, same fallback
];

for (const [cap, expected] of CASES) {
  const passed = ALL.filter((r) => passesRarityCap(r, cap));
  assert.deepEqual(passed, expected, `maxRarity=${String(cap)}: expected [${expected}], got [${passed}]`);
}

// Entry with no system.traits.rarity field at all → defaults to "common" → passes every cap.
for (const cap of ["common", "uncommon", "rare", "unique", undefined]) {
  assert.equal(passesRarityCap(undefined, cap), true, `missing rarity must pass cap ${String(cap)}`);
}

console.log("compendium.rarity.test.mjs: all rarity-cap assertions passed");
