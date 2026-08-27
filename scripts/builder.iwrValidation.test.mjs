// Regression check for two bugs fixed together in normalizeConcept:
//
// 1. AI-invented resistance/weakness/immunity type slugs, sense slugs, and
//    language strings previously passed through bare slugify with no
//    membership check against the real pf2e allowed-value lists (unlike
//    traits, which were already validated). Invalid entries must now be
//    dropped (fail-closed, invariant 5) while valid real slugs survive.
// 2. maxSpellRank = ceil(level / 2) was uncapped, so a level 21-24 creature
//    computed rank 11-12 — PF2e's real ceiling is rank 10.
//
// Run: node scripts/builder.iwrValidation.test.mjs
//
// normalizeConcept is pure enough to real-import (same rationale as
// builder.focusSpells.test.mjs): its only Foundry touch is a
// `typeof CONFIG !== "undefined"` guarded trait filter that no-ops in Node.

import assert from "node:assert/strict";
import { normalizeConcept } from "./builder.mjs";

const norm = (raw, opts = { level: 5, rarity: "common" }) => normalizeConcept(raw, opts);

// --- Resistances/weaknesses/immunities: real slugs survive, invented ones drop ---
{
  const c = norm({
    resistances: ["fire", "cold-iron", "made-up-nonsense", { type: "physical" }],
    weaknesses: ["silver", "totally-fake-weakness", { type: "cold" }],
    immunities: ["poison", "paralyzed", "not-a-real-immunity", "sleep"]
  });
  assert.deepEqual(c.resistances, ["fire", "cold-iron", "physical"], "invalid resistance slug must be dropped");
  assert.deepEqual(c.weaknesses, ["silver", "cold"], "invalid weakness slug must be dropped");
  assert.deepEqual(c.immunities, ["poison", "paralyzed", "sleep"], "invalid immunity slug must be dropped");
}

// Immunity-only conditions are NOT valid weaknesses/resistances (the three
// lists differ) — cross-category slugs must still be rejected.
{
  const c = norm({
    weaknesses: ["paralyzed"], // valid immunity, NOT a real weakness type
    resistances: ["blinded"] // valid immunity, NOT a real resistance type
  });
  assert.deepEqual(c.weaknesses, [], "an immunity-only slug must not pass the weakness whitelist");
  assert.deepEqual(c.resistances, [], "an immunity-only slug must not pass the resistance whitelist");
}

// --- Senses: real sense types survive, invented ones drop ---
{
  const c = norm({
    senses: [
      { type: "darkvision" },
      { type: "scent", acuity: "vague" },
      { type: "made-up-sense", range: 60 },
      { type: "tremorsense", range: 30 }
    ]
  });
  assert.deepEqual(
    c.senses.map((s) => s.type),
    ["darkvision", "scent", "tremorsense"],
    "invalid sense type must be dropped, valid ones keep their order"
  );
}

// --- Languages: real language slugs survive, invented ones drop ---
{
  const c = norm({ languages: ["common", "draconic", "not-a-real-language", "Necril"] });
  assert.deepEqual(c.languages, ["common", "draconic", "necril"], "invalid language must be dropped");
}

// --- maxSpellRank cap ---
{
  const highLevel = norm({
    spellcasting: { tradition: "arcane", spells: [{ name: "Big Spell", rank: 99 }] }
  }, { level: 24, rarity: "common" });
  assert.equal(highLevel.spellcasting.maxRank, 10, "level 24 must cap maxSpellRank at 10, not ceil(24/2)=12");
  assert.equal(highLevel.spellcasting.spells[0].rank, 10, "an overshooting spell rank must clamp to the capped max");

  const midLevel = norm({
    spellcasting: { tradition: "arcane", spells: [] }
  }, { level: 10, rarity: "common" });
  assert.equal(midLevel.spellcasting.maxRank, 5, "level 10 must still compute ceil(10/2)=5 under the cap");

  const lowLevel = norm({ spellcasting: { tradition: "arcane", spells: [] } }, { level: -1, rarity: "common" });
  assert.equal(lowLevel.spellcasting.maxRank, 1, "minimum level must floor maxSpellRank at 1");
}

console.log("builder IWR/sense/language whitelist + spell-rank-cap regression check: all assertions passed");
