// Currency split for a treasure parcel: whole pp, gp, sp and cp whose copper total is exact.
// Run: node tests/treasure-parcel.currency.test.mjs
import assert from "node:assert/strict";
import { COIN_COPPER_RATES, PARCEL_PP_THRESHOLD_CP, splitCurrencyGp } from "../scripts/treasure-parcel.mjs";
import { partyTreasureForSize, PARTY_SIZE_MAX, TREASURE_MAX_PARTY_LEVEL } from "../scripts/treasure-tables.mjs";

const copper = (coins) => Object.entries(coins).reduce((sum, [d, n]) => sum + n * COIN_COPPER_RATES[d], 0);

// pf2e copper rates, values.ts DENOMINATION_RATES (pf2e-8.5.0).
assert.deepEqual(COIN_COPPER_RATES, { pp: 1000, gp: 100, sp: 10, cp: 1 });

// Module convention: below 100 gp there is no pp; from 100 gp up, whole pp come first.
assert.equal(PARCEL_PP_THRESHOLD_CP, 10000);
assert.deepEqual(splitCurrencyGp(0), { pp: 0, gp: 0, sp: 0, cp: 0 });
assert.deepEqual(splitCurrencyGp(40), { pp: 0, gp: 40, sp: 0, cp: 0 }, "40 gp stays gold: under the threshold");
assert.deepEqual(splitCurrencyGp(99.99), { pp: 0, gp: 99, sp: 9, cp: 9 }, "just under the threshold: no pp");
assert.deepEqual(splitCurrencyGp(100), { pp: 10, gp: 0, sp: 0, cp: 0 }, "the threshold itself pays whole pp");
assert.deepEqual(splitCurrencyGp(175), { pp: 17, gp: 5, sp: 0, cp: 0 }, "above the threshold: whole pp, the remainder in gp");
assert.deepEqual(splitCurrencyGp(1400), { pp: 140, gp: 0, sp: 0, cp: 0 });
assert.deepEqual(splitCurrencyGp(36500), { pp: 3650, gp: 0, sp: 0, cp: 0 });

// Fractions of a gold piece land in sp and cp, largest first, with no rounding loss.
assert.deepEqual(splitCurrencyGp(0.37), { pp: 0, gp: 0, sp: 3, cp: 7 });
assert.deepEqual(splitCurrencyGp(0.01), { pp: 0, gp: 0, sp: 0, cp: 1 });
assert.deepEqual(splitCurrencyGp(12.5), { pp: 0, gp: 12, sp: 5, cp: 0 });
assert.deepEqual(splitCurrencyGp(1000.5), { pp: 100, gp: 0, sp: 5, cp: 0 });
assert.deepEqual(splitCurrencyGp(1234.56), { pp: 123, gp: 4, sp: 5, cp: 6 });
assert.deepEqual(splitCurrencyGp(0.29), { pp: 0, gp: 0, sp: 2, cp: 9 }, "float noise from x100 is absorbed, not truncated");

// Every table row and every party size: the split reproduces the exact copper total.
for (let level = 1; level <= TREASURE_MAX_PARTY_LEVEL; level++) {
  for (let size = 1; size <= PARTY_SIZE_MAX; size++) {
    const { currencyGp } = partyTreasureForSize(level, size);
    const coins = splitCurrencyGp(currencyGp);
    assert.equal(copper(coins), currencyGp * 100, `level ${level}, size ${size}: copper total is exact`);
    for (const value of Object.values(coins)) assert.ok(Number.isSafeInteger(value) && value >= 0);
    assert.equal(coins.sp, 0, "a whole-gp table amount never needs sp");
    assert.equal(coins.cp, 0, "a whole-gp table amount never needs cp");
  }
}

// Amounts that cannot be split exactly fail closed.
for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, "40", null, 0.001, 0.005]) {
  assert.throws(() => splitCurrencyGp(bad), /Currency must be/, `refuses ${String(bad)}`);
}

console.log("treasure-parcel.currency.test.mjs: exact pp/gp/sp/cp split for every table row and party size");
