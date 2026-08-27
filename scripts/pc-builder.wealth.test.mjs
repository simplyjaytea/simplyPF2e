// Regression check for PC starting wealth.
//
// Original bug (issue #56 / PR #61): a brand-new 1st-level PC got the
// TREASURE_BY_LEVEL table's level-1 total (175 gp) instead of the flat 15 gp,
// ~10x too much gold. That was patched with a `level <= 1` special case.
//
// Follow-up bug (this file's current subject): the special case only masked
// level 1. TREASURE_BY_LEVEL is GM Core Table 10-9 Treasure by Level — the
// total treasure a whole PARTY accumulates across a level of play — so every
// level >= 2 was still badly overpaid (level 2 got 300 gp instead of 30).
// pcStartingWealthGp() now reads pc-tables.mjs's PC_WEALTH_BY_LEVEL, the lump
// sum column of GM Core Table 10-10 "Character Wealth".
//
// Run: node scripts/pc-builder.wealth.test.mjs
//
// pcStartingWealthGp and its dependencies (tables.mjs, pc-tables.mjs) are pure
// — no foundry.*/game.* globals — so unlike the grants test, this imports the
// REAL function.

import assert from "node:assert/strict";
import { pcStartingWealthGp } from "./pc-builder.mjs";
import { PC_WEALTH_BY_LEVEL } from "./pc-tables.mjs";
import * as T from "./tables.mjs";

/* ---- The verified table itself ---------------------------------------- */

assert.equal(PC_WEALTH_BY_LEVEL.length, 20, "Character Wealth table must cover levels 1-20");
assert.ok(
  PC_WEALTH_BY_LEVEL.every((gp, i) => i === 0 || gp > PC_WEALTH_BY_LEVEL[i - 1]),
  "Character Wealth lump sums must increase monotonically by level"
);

/* ---- Per-level standard values, straight from GM Core Table 10-10 ------ */

const EXPECTED = {
  1: 15, 2: 30, 3: 75, 4: 140, 5: 270,
  6: 450, 7: 720, 8: 1100, 9: 1600, 10: 2300,
  11: 3200, 12: 4500, 13: 6400, 14: 9300, 15: 13500,
  16: 20000, 17: 30000, 18: 45000, 19: 69000, 20: 112000
};
for (const [lv, gp] of Object.entries(EXPECTED)) {
  assert.equal(
    pcStartingWealthGp(Number(lv)), gp,
    `level-${lv} standard starting wealth must be the Table 10-10 lump sum ${gp} gp`
  );
}

/* ---- Treasure amount multiplier still applies -------------------------- */

// Level 1, generous: Math.round(15 * 1.5) = Math.round(22.5) = 23.
assert.equal(pcStartingWealthGp(1, "generous"), 23, "level-1 generous must be round(15 * 1.5) = 23");
// Level 1, stingy: Math.round(15 * 0.5) = Math.round(7.5) = 8 (JS rounds .5 up).
assert.equal(pcStartingWealthGp(1, "stingy"), 8, "level-1 stingy must be round(15 * 0.5) = 8");
assert.equal(pcStartingWealthGp(5, "generous"), 405, "level-5 generous must be round(270 * 1.5) = 405");
assert.equal(pcStartingWealthGp(10, "stingy"), 1150, "level-10 stingy must be round(2300 * 0.5) = 1150");
// An unknown amount falls back to a 1x multiplier rather than NaN.
assert.equal(pcStartingWealthGp(5, "lavish"), 270, "unknown treasure amount must fall back to 1x");

/* ---- Clamping / bad input --------------------------------------------- */

assert.equal(pcStartingWealthGp(0), 15, "level 0 clamps to the level-1 lump sum");
assert.equal(pcStartingWealthGp(-3), 15, "negative levels clamp to the level-1 lump sum");
assert.equal(pcStartingWealthGp(25), 112000, "levels above 20 clamp to the level-20 lump sum");
assert.equal(pcStartingWealthGp(undefined), 15, "a missing level falls back to level 1, never NaN");
assert.equal(pcStartingWealthGp("7"), 720, "a numeric string level is coerced, not rejected");

/* ---- Regression guard against reading the party table again ------------ */

// TREASURE_BY_LEVEL is the party-per-level progression, an order of magnitude
// larger. If pcStartingWealthGp ever reads it again, these fail loudly.
assert.equal(T.lookup(T.TREASURE_BY_LEVEL, 1, "total", []), 175, "sanity: party table's level-1 total is 175");
assert.equal(T.lookup(T.TREASURE_BY_LEVEL, 2, "total", []), 300, "sanity: party table's level-2 total is 300");
for (const lv of [1, 2, 5, 10, 20]) {
  const party = T.lookup(T.TREASURE_BY_LEVEL, lv, "total", []);
  assert.ok(
    pcStartingWealthGp(lv) < party,
    `level-${lv} PC wealth (${pcStartingWealthGp(lv)}) must stay below the PARTY treasure total (${party}) — pcStartingWealthGp has regressed to reading TREASURE_BY_LEVEL`
  );
}

console.log("pc-builder starting-wealth regression check: all assertions passed");
