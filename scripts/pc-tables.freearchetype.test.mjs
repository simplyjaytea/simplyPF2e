// Regression check for issue #64 item 4b: with the Free Archetype variant on,
// buildFeatSlots() adds one extra archetype class-feat slot at every even
// level (2-20), on top of the normal slots. Off, the slots are unchanged.
// Run: node scripts/pc-tables.freearchetype.test.mjs
//
// buildFeatSlots is pure (no foundry/game globals), so this imports the REAL
// function.

import assert from "node:assert/strict";
import { buildFeatSlots, CLASS_FEAT_LEVELS } from "./pc-tables.mjs";

// Off by default: no archetype slots, no extra slots vs. the bare call.
const base = buildFeatSlots(20);
assert.ok(!base.some((s) => s.archetype), "no archetype slots when freeArchetype is off");
assert.deepEqual(buildFeatSlots(20, { freeArchetype: false }), base, "explicit false matches the default");

// On: exactly one extra archetype slot per even level <= character level.
const fa = buildFeatSlots(20, { freeArchetype: true });
const archetypeSlots = fa.filter((s) => s.archetype);
assert.equal(archetypeSlots.length, CLASS_FEAT_LEVELS.length, "one archetype slot per even level at level 20");
assert.equal(fa.length, base.length + CLASS_FEAT_LEVELS.length, "free archetype adds exactly that many slots");
for (const s of archetypeSlots) {
  assert.equal(s.type, "class", "archetype slots are class-category (archetype feats live under system.category 'class')");
  assert.ok(CLASS_FEAT_LEVELS.includes(s.level), "archetype slots land on even levels only");
}

// Level-gated like every other slot: a level-3 character gets one (level-2 only).
const low = buildFeatSlots(3, { freeArchetype: true }).filter((s) => s.archetype);
assert.deepEqual(low.map((s) => s.level), [2], "a level-3 PC gets a single archetype slot at level 2");

// Output stays sorted by level.
const levels = fa.map((s) => s.level);
assert.deepEqual(levels, [...levels].sort((a, b) => a - b), "slots stay sorted by level");

console.log("pc-tables free-archetype regression check: all assertions passed");
