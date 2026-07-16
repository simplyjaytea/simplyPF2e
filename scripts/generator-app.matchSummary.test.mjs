/* Regression test for GeneratorApp's #matchSummary() counting logic in
   scripts/generator-app.mjs (lines 269-275, issue #52 / PR #60): aggregates
   {found} items across category groups into the "X/Y compendium matches"
   header badge, returning null when nothing was generated (hides the badge).
   The real method is private on a class extending SpfApp (Foundry
   Application API at class-definition time) and its `text` field needs a
   live game.i18n — so the counting logic (flat/filter(Boolean)/null guard)
   is ported below WITHOUT the i18n text field. Copy kept in sync manually,
   update both if generator-app.mjs changes this logic.
   Run: node scripts/generator-app.matchSummary.test.mjs */
import assert from "node:assert/strict";

// Ported from generator-app.mjs:269-275, minus the game.i18n.format text.
function matchSummary(...groups) {
  const items = groups.flat().filter(Boolean);
  const total = items.length;
  if (!total) return null;  const matched = items.filter((i) => i.found).length;
  return { matched, total };
}

// 1. Mixed groups: 4 items total, 3 found.
assert.deepEqual(
  matchSummary([{ found: true }], [{ found: false }, { found: true }], [{ found: true }]),
  { matched: 3, total: 4 },
  "mixed groups must count 3 matched of 4 total"
);

// 2. All found → matched === total.
const all = matchSummary([{ found: true }, { found: true }], [{ found: true }]);
assert.deepEqual(all, { matched: 3, total: 3 }, "all-found must give matched === total");

// 3. All misses → matched 0, total still counts them.
assert.deepEqual(
  matchSummary([{ found: false }], [{ found: false }, { found: false }]),
  { matched: 0, total: 3 },
  "all-miss must keep total at 3 with matched 0"
);

// 4. Empty input → null (hides the badge before anything is generated).
assert.equal(matchSummary(), null, "no groups must return null");
assert.equal(matchSummary([], [], []), null, "all-empty groups must return null");

// 5. filter(Boolean): falsy entries (e.g. a PC with no heritage — the caller
// wraps single ABC/heritage picks in 1-element arrays that can hold null)
// are dropped entirely, not counted as misses.
assert.deepEqual(
  matchSummary([null], [{ found: true }, undefined, { found: false }]),
  { matched: 1, total: 2 },
  "null/undefined entries must be dropped from both counts"
);

console.log("generator-app.matchSummary.test.mjs: all matchSummary aggregation assertions passed");
