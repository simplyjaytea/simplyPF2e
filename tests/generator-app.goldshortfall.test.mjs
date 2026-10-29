// Regression check for issue #64 item 6: after the first purchase pass, if
// more than 25% of the loot budget is still sitting as coin, the PC pipeline
// triggers ONE more generatePCLoot purchase pass. This checks the real trigger
// predicate (purchase-pass.mjs) on the real coin and value helpers (builder.mjs).
// Run: node tests/generator-app.goldshortfall.test.mjs

import assert from "node:assert/strict";
import { needsExtraPurchasePass } from "../scripts/purchase-pass.mjs";

const target = 1000;

// Mostly coin: 900 gp of a 1000 gp budget left as gold -> needs another pass.
const coinHeavy = [
  { name: "Longsword", resolvedValue: 100, quantity: 1 },
  { name: "Gold Pieces", resolvedValue: 1, quantity: 900 }
];
assert.equal(needsExtraPurchasePass(coinHeavy, target), true, "90% coin triggers an extra purchase pass");

// Mostly items: only 150 gp coin left -> under the 25% threshold, no extra pass.
const itemHeavy = [
  { name: "+1 striking longsword", resolvedValue: 700, quantity: 1 },
  { name: "Healing Potion (Lesser)", resolvedValue: 12, quantity: 4 },
  { name: "Gold Pieces", resolvedValue: 1, quantity: 150 }
];
assert.equal(needsExtraPurchasePass(itemHeavy, target), false, "15% coin does not trigger another pass");

// Exactly at the threshold (250 of 1000 = 25%) is NOT over it -> no pass.
const atThreshold = [{ name: "Gold Pieces", resolvedValue: 1, quantity: 250 }];
assert.equal(needsExtraPurchasePass(atThreshold, target), false, "exactly 25% is not over the threshold");
const justOver = [{ name: "Gold Pieces", resolvedValue: 1, quantity: 251 }];
assert.equal(needsExtraPurchasePass(justOver, target), true, "one gp over 25% triggers the pass");

// Coin counts by resolved unit value times quantity, so platinum weighs ten gold each.
const platinum = [{ name: "Platinum Pieces", resolvedValue: 10, quantity: 100 }];
assert.equal(needsExtraPurchasePass(platinum, target), true, "100 pp (1000 gp) is over a quarter of a 1000 gp budget");

// Non-coin items are never counted as unspent gold.
const noCoin = [{ name: "Bag of Holding", resolvedValue: 500, quantity: 1 }];
assert.equal(needsExtraPurchasePass(noCoin, target), false, "a coinless haul never triggers an extra pass");

// No budget means no pass, whatever the haul.
assert.equal(needsExtraPurchasePass(coinHeavy, 0), false, "a zero budget never triggers a pass");
assert.equal(needsExtraPurchasePass(coinHeavy, NaN), false, "an unset budget never triggers a pass");

console.log("generator-app gold-shortfall regression check: all assertions passed");
