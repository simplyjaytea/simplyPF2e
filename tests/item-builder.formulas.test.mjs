// The Forge's level formulas: the damage dice and save DC for an activated item (pinned to a snapshot for every level
// and rarity), and the empirical price benchmark, which takes the median of real priced items at the level and
// multiplies it by the rarity multiplier. The price test uses a skewed sample so a median and a mean differ.
// Run: node tests/item-builder.formulas.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { damageDiceForLevel, saveDcForLevel, priceForLevel } from "../scripts/item-builder.mjs";

// 1. Damage dice and save DC, pinned for levels 0 to 24 and each rarity.
const pinned = JSON.parse(readFileSync(new URL("./fixtures/tables/forge-formulas.json", import.meta.url), "utf8"));
for (let level = 0; level <= 24; level++) {
  assert.equal(damageDiceForLevel(level), pinned.damageDice[level], `level ${level}: damage dice`);
  for (const rarity of ["common", "uncommon", "rare", "unique"]) {
    assert.equal(saveDcForLevel(level, rarity), pinned.saveDc[level][rarity], `level ${level} ${rarity}: save DC`);
  }
}
// The rarity adjustment is the only difference between rarities at one level.
assert.equal(saveDcForLevel(5, "rare") - saveDcForLevel(5, "common"), 5, "a rare save DC is five above common");
assert.equal(saveDcForLevel(5, "unique") - saveDcForLevel(5, "common"), 10, "a unique save DC is ten above common");

// 2. Price benchmark: the median of real priced items at the level, times the rarity multiplier.
// A fake equipment pack holds the samples. The level-5 sample is skewed, so the median (10) and the mean (28) differ.
const samples = [
  { _id: "a", name: "Cheap A", type: "equipment", system: { level: { value: 5 }, price: { value: { gp: 10 } } } },
  { _id: "b", name: "Cheap B", type: "equipment", system: { level: { value: 5 }, price: { value: { gp: 10 } } } },
  { _id: "c", name: "Cheap C", type: "equipment", system: { level: { value: 5 }, price: { value: { gp: 10 } } } },
  { _id: "d", name: "Cheap D", type: "equipment", system: { level: { value: 5 }, price: { value: { gp: 10 } } } },
  { _id: "e", name: "Dear E", type: "equipment", system: { level: { value: 5 }, price: { value: { gp: 100 } } } },
  // Level 9 has only four samples, which is below the five the benchmark needs. The window widens to levels 8 and 10,
  // where the samples are dear, so the widened median is 510 (not the four cheap items' 20).
  { _id: "f", name: "Level Nine F", type: "equipment", system: { level: { value: 9 }, price: { value: { gp: 20 } } } },
  { _id: "g", name: "Level Nine G", type: "equipment", system: { level: { value: 9 }, price: { value: { gp: 20 } } } },
  { _id: "h", name: "Level Nine H", type: "equipment", system: { level: { value: 9 }, price: { value: { gp: 20 } } } },
  { _id: "i", name: "Level Nine I", type: "equipment", system: { level: { value: 9 }, price: { value: { gp: 20 } } } },
  { _id: "j", name: "Level Eight J", type: "equipment", system: { level: { value: 8 }, price: { value: { gp: 1000 } } } },
  { _id: "k", name: "Level Eight K", type: "equipment", system: { level: { value: 8 }, price: { value: { gp: 1000 } } } },
  { _id: "l", name: "Level Ten L", type: "equipment", system: { level: { value: 10 }, price: { value: { gp: 1000 } } } },
  { _id: "m", name: "Level Ten M", type: "equipment", system: { level: { value: 10 }, price: { value: { gp: 1000 } } } }
];
const pack = { getIndex: async () => samples.map((s) => ({ ...s })), getDocument: async () => null };
globalThis.game = {
  settings: { get: () => ({ equipment: ["test.equipment"] }) },
  packs: new Map([["test.equipment", pack]]),
  i18n: { localize: (k) => k, format: (k) => k }
};
globalThis.foundry = { utils: { randomID: () => "id" } };

assert.equal(await priceForLevel(5, "common"), 10, "the median price, not the mean (28), is the benchmark");
// The rarity multipliers, as numbers: uncommon 1.5, rare 2.5, unique 4.
assert.equal(await priceForLevel(5, "uncommon"), 15, "the uncommon multiplier (1.5) applies once");
assert.equal(await priceForLevel(5, "rare"), 25, "the rare multiplier (2.5) applies once");
assert.equal(await priceForLevel(5, "unique"), 40, "the unique multiplier (4) applies once");
// Sparse levels: four samples at level 9 are below the minimum of five, so the window widens and the median is 510.
assert.equal(await priceForLevel(9, "common"), 510, "a sparse level widens to the nearest levels with enough samples");

console.log("item-builder.formulas.test.mjs: damage dice and save DC match their snapshot; the price benchmark is the median times the rarity multiplier");
