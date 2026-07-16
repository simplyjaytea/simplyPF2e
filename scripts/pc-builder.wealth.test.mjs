// Regression check for issue #56 / PR #61: a brand-new 1st-level PC gets the
// Core Rulebook's flat 15 gp, NOT the TREASURE_BY_LEVEL table's level-1 total
// (175 gp — the "started a campaign above 1st level" table). The old bug fed
// level 1 through the table and handed fresh characters ~10x too much gold.
// Run: node scripts/pc-builder.wealth.test.mjs
//
// pcStartingWealthGp and its only dependency (tables.mjs) are pure — no
// foundry.*/game.* globals — so unlike the grants test, this imports the REAL
// function.

import assert from "node:assert/strict";
import { pcStartingWealthGp } from "./pc-builder.mjs";
import * as T from "./tables.mjs";

// Level 1, standard: flat CRB 15 gp.
assert.equal(pcStartingWealthGp(1), 15, "level-1 standard starting wealth must be the flat CRB 15 gp");

// Level 1, generous: Math.round(15 * 1.5) = Math.round(22.5) = 23.
// If the level-1 branch regressed, this would be Math.round(175 * 1.5) = 263.
assert.equal(pcStartingWealthGp(1, "generous"), 23, "level-1 generous must be round(15 * 1.5) = 23, not table-derived");

// Level 1, stingy: Math.round(15 * 0.5) = Math.round(7.5) = 8 (JS rounds .5 up).
assert.equal(pcStartingWealthGp(1, "stingy"), 8, "level-1 stingy must be round(15 * 0.5) = 8");

// Above level 1 the table applies normally: level 2 total is 300 gp
// (tables.mjs TREASURE_BY_LEVEL.total, array starts at level -1).
assert.equal(pcStartingWealthGp(2), 300, "level-2 standard wealth must be the table's 300 gp total");

// Regression guard: the table's own level-1 entry is 175. If the `level <= 1`
// special case in pcStartingWealthGp were ever removed, level 1 would fall
// through to the table and return ~175. Assert the real result stays well
// below half of the table's level-1 entry so that regression fails loudly.
const tableLevel1 = T.lookup(T.TREASURE_BY_LEVEL, 1, "total", []);
assert.equal(tableLevel1, 175, "sanity: table's own level-1 total should be 175");
assert.ok(
  pcStartingWealthGp(1) < tableLevel1 / 2,
  `level-1 wealth (${pcStartingWealthGp(1)}) must stay well below the table's level-1 entry (${tableLevel1}) — the level <= 1 flat-15gp branch has regressed`
);

console.log("pc-builder starting-wealth regression check: all assertions passed");
