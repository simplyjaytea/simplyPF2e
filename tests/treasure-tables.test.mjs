import assert from "node:assert/strict";
import {
  BASE_PARTY_SIZE,
  PARTY_SIZE_MAX,
  PARTY_SIZE_MIN,
  PARTY_TREASURE_BY_LEVEL,
  TREASURE_MAX_PARTY_LEVEL,
  TREASURE_MIN_PARTY_LEVEL,
  partyTreasureForSize,
  partyTreasureRow
} from "../scripts/treasure-tables.mjs";
import { TREASURE_BY_LEVEL } from "../scripts/tables.mjs";

// Run: node tests/treasure-tables.test.mjs
//
// Expected values are copied from docs/plans/sprint-2026-10-27.md section 2.10
// (GM Core pg. 59, Table 10-9: Party Treasure by Level, via Archives of Nethys
// Rules ID 2656), not from the module. "6th: 2, 5th: 2" means item level 6
// count 2, item level 5 count 2; thousands separators are stripped.

assert.equal(TREASURE_MIN_PARTY_LEVEL, 1);
assert.equal(TREASURE_MAX_PARTY_LEVEL, 20);
assert.equal(PARTY_SIZE_MIN, 1);
assert.equal(PARTY_SIZE_MAX, 8);
assert.equal(BASE_PARTY_SIZE, 4);
assert.equal(PARTY_TREASURE_BY_LEVEL.length, 20);

// Rows: level, total, permanent, consumables, party currency, per extra PC.
const ROWS = [
  [1, 175, [{ level: 2, count: 2 }, { level: 1, count: 2 }], [{ level: 2, count: 2 }, { level: 1, count: 3 }], 40, 10],
  [2, 300, [{ level: 3, count: 2 }, { level: 2, count: 2 }], [{ level: 3, count: 2 }, { level: 2, count: 2 }, { level: 1, count: 2 }], 70, 18],
  [3, 500, [{ level: 4, count: 2 }, { level: 3, count: 2 }], [{ level: 4, count: 2 }, { level: 3, count: 2 }, { level: 2, count: 2 }], 120, 30],
  [10, 8000, [{ level: 11, count: 2 }, { level: 10, count: 2 }], [{ level: 11, count: 2 }, { level: 10, count: 2 }, { level: 9, count: 2 }], 2000, 500],
  [19, 355000, [{ level: 20, count: 2 }, { level: 19, count: 2 }], [{ level: 20, count: 2 }, { level: 19, count: 2 }, { level: 18, count: 2 }], 80000, 20000],
  [20, 490000, [{ level: 20, count: 4 }], [{ level: 20, count: 4 }, { level: 19, count: 2 }], 140000, 35000]
];

for (const [level, totalGp, permanent, consumables, currencyGp, currencyPerExtraPcGp] of ROWS) {
  const row = partyTreasureRow(level);
  assert.equal(row.level, level, "level at " + level);
  assert.equal(row.totalGp, totalGp, "total at " + level);
  assert.deepEqual(row.permanent, permanent, "permanent at " + level);
  assert.deepEqual(row.consumables, consumables, "consumables at " + level);
  assert.equal(row.currencyGp, currencyGp, "party currency at " + level);
  assert.equal(row.currencyPerExtraPcGp, currencyPerExtraPcGp, "per extra PC at " + level);
}

// Cross-check the two transcriptions: TREASURE_BY_LEVEL.total starts at level -1.
for (let level = TREASURE_MIN_PARTY_LEVEL; level <= TREASURE_MAX_PARTY_LEVEL; level++) {
  assert.equal(partyTreasureRow(level).totalGp, TREASURE_BY_LEVEL.total[level + 1], "cross-check total at " + level);
}

// Out-of-range levels throw; there is no clamping and no extrapolation.
assert.throws(() => partyTreasureRow(0), /0/);
assert.throws(() => partyTreasureRow(21), /21/);
assert.throws(() => partyTreasureRow(2.5), /2\.5/);
assert.throws(() => partyTreasureRow(-1), /-1/);
assert.throws(() => partyTreasureRow("5"), /5/);

// Size 6 at level 5: two extra PCs, each adding one consumable at level 5 and
// one at level 6 (GM Core: "for each additional character ... Two consumables,
// usually one of the party's level and one of 1 level higher"), so 6th: 2 + 2,
// 5th: 2 + 2, 4th: 2. Currency is 320 + 2 x 80 = 480.
const level5Size6 = partyTreasureForSize(5, 6);
assert.equal(level5Size6.partySize, 6);
assert.equal(level5Size6.extraPcs, 2);
assert.equal(level5Size6.belowBase, false);
assert.deepEqual(level5Size6.consumables, [
  { level: 6, count: 4 },
  { level: 5, count: 4 },
  { level: 4, count: 2 }
]);
assert.deepEqual(level5Size6.permanentExtra, { count: 2, levels: [5, 6] });
assert.equal(level5Size6.currencyGp, 480);
assert.equal(level5Size6.totalGp, 1350);
assert.deepEqual(level5Size6.permanent, [{ level: 6, count: 2 }, { level: 5, count: 2 }]);

// Size 6 at level 20: both extra consumable levels cap at 20, so 20th: 4 + 4.
const level20Size6 = partyTreasureForSize(20, 6);
assert.deepEqual(level20Size6.consumables, [{ level: 20, count: 8 }, { level: 19, count: 2 }]);
assert.deepEqual(level20Size6.permanentExtra, { count: 2, levels: [20, 20] });
assert.equal(level20Size6.currencyGp, 140000 + 2 * 35000);

// A party under four uses the four-PC row unchanged.
const size4 = partyTreasureForSize(7, 4);
const size2 = partyTreasureForSize(7, 2);
for (const key of ["level", "totalGp", "permanent", "consumables", "currencyGp", "currencyPerExtraPcGp", "extraPcs", "permanentExtra"]) {
  assert.deepEqual(size2[key], size4[key], "size 2 matches size 4 for " + key);
}
assert.equal(size2.partySize, 2);
assert.equal(size4.partySize, 4);
assert.equal(size2.belowBase, true);
assert.equal(size4.belowBase, false);
assert.equal(size2.extraPcs, 0);
assert.deepEqual(size2.permanentExtra, { count: 0, levels: [7, 8] });

// Party sizes outside 1..8 throw.
assert.throws(() => partyTreasureForSize(5, 0), /0/);
assert.throws(() => partyTreasureForSize(5, 9), /9/);
assert.throws(() => partyTreasureForSize(5, 4.5), /4\.5/);
assert.throws(() => partyTreasureForSize(0, 4), /0/);

// Returned objects are fresh copies and the table is never mutated.
const adjusted = partyTreasureForSize(5, 6);
adjusted.consumables[0].count = 99;
adjusted.permanent[0].count = 99;
adjusted.permanentExtra.levels.push(1);
assert.deepEqual(partyTreasureForSize(5, 6).consumables[0], { level: 6, count: 4 });
assert.deepEqual(partyTreasureRow(5).permanent[0], { level: 6, count: 2 });
assert.deepEqual(partyTreasureRow(5).consumables[0], { level: 6, count: 2 });
assert.equal(partyTreasureRow(5).currencyGp, 320);

// The array and every row are frozen.
assert.ok(Object.isFrozen(PARTY_TREASURE_BY_LEVEL));
for (const row of PARTY_TREASURE_BY_LEVEL) {
  assert.ok(Object.isFrozen(row), "row frozen at " + row.level);
  assert.ok(Object.isFrozen(row.permanent), "permanent frozen at " + row.level);
  assert.ok(Object.isFrozen(row.consumables), "consumables frozen at " + row.level);
}

console.log("treasure-tables.test.mjs: GM Core Party Treasure by Level rows, party-size adjustment and freezing match the record");
