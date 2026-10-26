import assert from "node:assert/strict";
import {
  HAZARD_MAX_LEVEL,
  HAZARD_MIN_LEVEL,
  HAZARD_SCALES,
  hazardAC,
  hazardAttack,
  hazardDamage,
  hazardDC,
  hazardHP,
  hazardHardness,
  hazardProficiency,
  hazardSave,
  hazardSaveDC
} from "../scripts/hazard-tables.mjs";
import { creatureXP, hazardXP, simpleHazardXP } from "../scripts/encounter.mjs";

// Expected numbers are copied from docs/plans/hazard-research-2026-10-26.md,
// section 3 (GM Core Building Hazards, Tables 2-13 to 2-16), not from the module.
// Low DCs are printed as ranges ("12 to 11"); the upper number is expected.
// HP and Hardness are printed as ranges; the midpoint is expected.

assert.equal(HAZARD_MIN_LEVEL, -1);
assert.equal(HAZARD_MAX_LEVEL, 24);
assert.deepEqual(HAZARD_SCALES, ["extreme", "high", "low"]);

// Table 2-13 rows: level, extreme, high, low (upper printed number).
const DC_ROWS = [
  [-1, 18, 15, 12],
  [0, 19, 16, 13],
  [1, 20, 17, 14],
  [4, 25, 22, 18],
  [12, 38, 35, 30],
  [24, 58, 55, 48]
];
// Table 2-14 rows: level, high tier, moderate tier.
const PROFICIENCY_ROWS = [
  [-1, "untrained", "untrained"],
  [0, "untrained", "untrained"],
  [1, "trained", "trained"],
  [4, "trained", "trained"],
  [12, "master", "expert"],
  [24, "legendary", "master"]
];
// Table 2-15 rows: level, EAC, HAC, LAC, E, H, L, Hardness midpoint, HP midpoint.
const DEFENSE_ROWS = [
  [-1, 18, 15, 12, 9, 8, 2, 3, 12],
  [0, 19, 16, 13, 10, 9, 3, 4, 16],
  [1, 19, 16, 13, 11, 10, 4, 6, 24],
  [4, 24, 21, 18, 15, 14, 8, 12, 48],
  [12, 36, 33, 30, 27, 25, 19, 21, 84],
  [24, 54, 51, 48, 46, 42, 36, 48, 184]
];
// Table 2-16 rows: level, S. Atk, C. Atk, simple formula, simple average,
// complex formula, complex average, EDC, HDC.
const OFFENSE_ROWS = [
  [-1, 10, 8, "2d4+1", 6, "1d4+1", 3, 19, 16],
  [0, 11, 8, "2d6+3", 10, "1d6+2", 5, 19, 16],
  [1, 13, 9, "2d6+5", 12, "1d6+3", 6, 20, 17],
  [4, 17, 14, "4d8+10", 28, "2d8+5", 14, 25, 21],
  [12, 29, 26, "6d10+27", 60, "3d10+14", 30, 36, 32],
  [24, 47, 44, "8d12+52", 104, "4d12+26", 52, 52, 48]
];

for (const row of DC_ROWS) {
  const level = row[0];
  assert.equal(hazardDC(level, "extreme"), row[1], "DC extreme at " + level);
  assert.equal(hazardDC(level, "high"), row[2], "DC high at " + level);
  assert.equal(hazardDC(level, "low"), row[3], "DC low at " + level);
}
// Low DC printed as "14 to 13" resolves to the upper number.
assert.equal(hazardDC(1, "low"), 14, "printed 14 to 13 resolves to 14");
assert.equal(hazardDC(3, "low"), 17, "printed 17 to 15 resolves to 17");

for (const row of PROFICIENCY_ROWS) {
  assert.equal(hazardProficiency(row[0], "high"), row[1], "proficiency high at " + row[0]);
  assert.equal(hazardProficiency(row[0], "moderate"), row[2], "proficiency moderate at " + row[0]);
}
// Table 2-14 band edges.
assert.equal(hazardProficiency(5, "high"), "expert");
assert.equal(hazardProficiency(8, "high"), "expert");
assert.equal(hazardProficiency(8, "moderate"), "trained");
assert.equal(hazardProficiency(9, "high"), "master");
assert.equal(hazardProficiency(18, "moderate"), "expert");
assert.equal(hazardProficiency(19, "high"), "legendary");
assert.equal(hazardProficiency(19, "moderate"), "master");

// Midpoint floor: level 0 hardness 3-5 (odd endpoints), level -1 hardness 2-4 (even endpoints).
assert.equal(hazardHardness(0), 4);
assert.equal(hazardHardness(-1), 3);
assert.equal(hazardHP(-1), 12);
assert.equal(hazardHP(0), 16);

for (const row of DEFENSE_ROWS) {
  const level = row[0];
  assert.equal(hazardAC(level, "extreme"), row[1], "EAC at " + level);
  assert.equal(hazardAC(level, "high"), row[2], "HAC at " + level);
  assert.equal(hazardAC(level, "low"), row[3], "LAC at " + level);
  assert.equal(hazardSave(level, "extreme"), row[4], "E save at " + level);
  assert.equal(hazardSave(level, "high"), row[5], "H save at " + level);
  assert.equal(hazardSave(level, "low"), row[6], "L save at " + level);
  assert.equal(hazardHardness(level), row[7], "hardness at " + level);
  assert.equal(hazardHP(level), row[8], "HP at " + level);
}

for (const row of OFFENSE_ROWS) {
  const level = row[0];
  assert.equal(hazardAttack(level, "simple"), row[1], "S. Atk at " + level);
  assert.equal(hazardAttack(level, "complex"), row[2], "C. Atk at " + level);
  assert.deepEqual(hazardDamage(level, "simple"), { formula: row[3], average: row[4] }, "simple damage at " + level);
  assert.deepEqual(hazardDamage(level, "complex"), { formula: row[5], average: row[6] }, "complex damage at " + level);
  assert.equal(hazardSaveDC(level, "extreme"), row[7], "EDC at " + level);
  assert.equal(hazardSaveDC(level, "high"), row[8], "HDC at " + level);
}

// Clamping below -1 and above 24.
assert.equal(hazardDC(-5, "extreme"), 18);
assert.equal(hazardDC(99, "extreme"), 58);
assert.equal(hazardAC(-40, "low"), 12);
assert.equal(hazardHP(100), 184);
assert.equal(hazardProficiency(-3, "high"), "untrained");
assert.equal(hazardProficiency(40, "moderate"), "master");
assert.deepEqual(hazardDamage(99, "complex"), { formula: "4d12+26", average: 52 });
assert.equal(hazardSaveDC(-9, "high"), 16);
assert.equal(hazardAttack(50, "simple"), 47);

// Unknown scale, tier or kind throws and names the bad value.
assert.throws(() => hazardDC(1, "moderate"), /moderate/);
assert.throws(() => hazardAC(1, "terrible"), /terrible/);
assert.throws(() => hazardSave(1, "moderate"), /moderate/);
assert.throws(() => hazardSaveDC(1, "low"), /low/);
assert.throws(() => hazardProficiency(1, "expert"), /expert/);
assert.throws(() => hazardAttack(1, "medium"), /medium/);
assert.throws(() => hazardDamage(1, "advanced"), /advanced/);

// Simple hazard XP map and clamp (GM Core pg. 56, Simple Hazard column).
const SIMPLE_XP = [2, 3, 4, 6, 8, 12, 16, 24, 32];
for (let rel = -4; rel <= 4; rel++) {
  assert.equal(simpleHazardXP(5 + rel, 5), SIMPLE_XP[rel + 4], "simple XP at relative " + rel);
}
assert.equal(simpleHazardXP(14, 5), 32, "relative +9 clamps to +4");
assert.equal(simpleHazardXP(-4, 5), 2, "relative -9 clamps to -4");
assert.equal(simpleHazardXP(-20, 24), 2, "far below clamps to -4");
assert.equal(creatureXP(3, 1), 80);
assert.equal(hazardXP(3, 1, true), 80, "complex hazard uses creature XP");
assert.equal(hazardXP(3, 1, false), 16, "simple hazard uses the simple map");

console.log("hazard-tables.test.mjs: tables, clamping, unknown keys and hazard XP match the GM Core record");
