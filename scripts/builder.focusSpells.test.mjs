// Regression check for the NPC focus-spell clamp (feat/npc-focus-spells):
// normalizeConcept coerces raw `focusSpells` into [{name}] records, drops
// falsy/empty/junk entries BEFORE applying the 3-entry cap (the hard PF2e
// focus-pool ceiling), so the first 3 VALID names survive — same as the PC
// clamp (pc-builder.focusSpells.test.mjs) — PLUS the NPC-only scope gate:
// when `spellcasting` is absent/invalid, focusSpells is forced to [] no
// matter what the AI sent (focus-only creatures are out of scope in v1;
// focus spells ride on the normal spellcasting DC).
// Run: node scripts/builder.focusSpells.test.mjs
//
// normalizeConcept is pure enough to real-import: its only Foundry touch is
// a `typeof CONFIG !== "undefined"` guarded trait filter, so like the PC
// focus-spell test this imports the REAL function rather than porting it.

import assert from "node:assert/strict";
import { normalizeConcept } from "./builder.mjs";

const CASTER = { tradition: "divine", dcScale: "high", spells: [{ name: "Bless", rank: 1 }] };
const norm = (focusSpells, spellcasting = CASTER) =>
  normalizeConcept({ focusSpells, spellcasting }, { level: 5, rarity: "common" }).focusSpells;

// With spellcasting present: 5 raw names -> exactly the FIRST 3, as {name} records.
assert.deepEqual(
  norm(["Fire Ray", "Tempest Surge", "Agitate", "Wild Morph", "Ki Rush"]),
  [{ name: "Fire Ray" }, { name: "Tempest Surge" }, { name: "Agitate" }],
  "5 valid names must clamp to the first 3"
);

// Falsy/empty/junk entries are dropped BEFORE the cap, not counted toward it;
// {name} objects are accepted alongside strings, and names are trimmed.
assert.deepEqual(
  norm(["", null, "Fire Ray", false, "   ", { name: "  Tempest Surge  " }, { name: "" }, "Agitate"]),
  [{ name: "Fire Ray" }, { name: "Tempest Surge" }, { name: "Agitate" }],
  "junk entries must be filtered out before the 3-entry cap is applied"
);

// Missing / empty / non-array input -> [], never undefined or null.
assert.deepEqual(norm(undefined), [], "missing focusSpells must normalize to []");
assert.deepEqual(norm([]), [], "empty array must stay []");
assert.deepEqual(norm("Fire Ray"), [], "a non-array value must normalize to []");

// THE NPC-SPECIFIC GATE: no (or invalid) spellcasting -> focusSpells forced
// to [], even when the AI sent perfectly valid names.
assert.deepEqual(norm(["Fire Ray", "Tempest Surge"], null), [], "no spellcasting must force focusSpells to []");
assert.deepEqual(
  normalizeConcept({ focusSpells: ["Fire Ray"] }, { level: 5, rarity: "common" }).focusSpells,
  [],
  "absent spellcasting field must force focusSpells to []"
);
assert.deepEqual(
  norm(["Fire Ray"], { tradition: "psychic-not-real", spells: [] }),
  [],
  "an invalid tradition (spellcasting normalized to null) must force focusSpells to []"
);

console.log("builder NPC focus-spell clamp regression check: all assertions passed");
