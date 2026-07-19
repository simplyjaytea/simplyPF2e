// Regression check for issue #64 item 6: after the first purchase pass, if
// more than 25% of the wealth target is still sitting as coin, the PC pipeline
// triggers ONE more generatePCLoot purchase pass. This checks the trigger
// predicate that gates that extra pass.
// Run: node scripts/generator-app.goldshortfall.test.mjs
//
// The predicate lives in generator-app.mjs #generatePC (heavy Foundry deps, not
// importable), so the pure slice + its two helpers are copied verbatim below.

import assert from "node:assert/strict";

// --- Copied from builder.mjs (source of truth) ---
const COIN_ITEM_NAMES = {
  platinum: "Platinum Pieces", pp: "Platinum Pieces", gold: "Gold Pieces", gp: "Gold Pieces",
  silver: "Silver Pieces", sp: "Silver Pieces", copper: "Copper Pieces", cp: "Copper Pieces"
};
function parseCoins(name) {
  const match = /^\s*(\d+)?\s*(platinum|gold|silver|copper|pp|gp|sp|cp)\s*(?:coins?|pieces?)?\s*$/i
    .exec(String(name ?? ""));
  if (!match) return null;
  return { name: COIN_ITEM_NAMES[match[2].toLowerCase()], count: match[1] ? Number(match[1]) : null };
}
function lootValueGp(loot) {
  return (Array.isArray(loot) ? loot : []).reduce(
    (sum, l) => sum + (Number(l?.resolvedValue) || 0) * (Number(l?.quantity) || 1),
    0
  );
}

// --- Copied from generator-app.mjs #generatePC (source of truth) ---
function needsExtraPurchasePass(loot, wealthTarget) {
  const coinGp = lootValueGp(loot.filter((l) => parseCoins(l.name)));
  return coinGp > wealthTarget * 0.25;
}

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

// Non-coin items are never counted as unspent gold.
const noCoin = [{ name: "Bag of Holding", resolvedValue: 500, quantity: 1 }];
assert.equal(needsExtraPurchasePass(noCoin, target), false, "a coinless haul never triggers an extra pass");

console.log("generator-app gold-shortfall regression check: all assertions passed");
