// Regression check for the PC focus-spell clamp (feat/pc-focus-spells):
// normalizePCConcept coerces raw `focusSpells` into [{name}] records, drops
// falsy/empty/junk entries BEFORE applying the 3-entry cap (the hard PF2e
// focus-pool ceiling — see pc-builder.mjs normalizePCConcept), so the first
// 3 VALID names survive, and never yields undefined/null for the field.
// Run: node scripts/pc-builder.focusSpells.test.mjs
//
// normalizePCConcept is pure (no foundry.*/game.* globals — those only appear
// in createCharacterActor and the resolve helpers), so like the wealth test
// this imports the REAL function rather than porting the logic.

import assert from "node:assert/strict";
import { normalizePCConcept } from "./pc-builder.mjs";

const norm = (focusSpells) => normalizePCConcept({ focusSpells }, { level: 5 }).focusSpells;

// 5 raw names -> exactly the FIRST 3 kept, as {name} records.
assert.deepEqual(
  norm(["Lay on Hands", "Fire Ray", "Tempest Surge", "Wild Morph", "Ki Rush"]),
  [{ name: "Lay on Hands" }, { name: "Fire Ray" }, { name: "Tempest Surge" }],
  "5 valid names must clamp to the first 3"
);

// Missing / empty / non-array input -> [], never undefined or null.
assert.deepEqual(norm(undefined), [], "missing focusSpells must normalize to []");
assert.deepEqual(normalizePCConcept({}, { level: 1 }).focusSpells, [], "absent field must normalize to []");
assert.deepEqual(norm([]), [], "empty array must stay []");
assert.deepEqual(norm("Lay on Hands"), [], "a non-array value must normalize to []");

// Falsy/empty/junk entries are dropped BEFORE the cap, not counted toward it:
// 3 valid names interleaved with junk (and one past raw index 3) all survive.
assert.deepEqual(
  norm(["", null, "Lay on Hands", false, "   ", { name: "Fire Ray" }, { name: "" }, "Tempest Surge"]),
  [{ name: "Lay on Hands" }, { name: "Fire Ray" }, { name: "Tempest Surge" }],
  "junk entries must be filtered out before the 3-entry cap is applied"
);

// {name} objects are accepted alongside plain strings (the normalized shape
// itself round-trips), and names are trimmed.
assert.deepEqual(
  norm([{ name: "  Lay on Hands  " }]),
  [{ name: "Lay on Hands" }],
  "{name} records must be accepted and trimmed"
);

console.log("pc-builder focus-spell clamp regression check: all assertions passed");
