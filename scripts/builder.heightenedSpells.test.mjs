// Regression check for the NPC heightened-spell bug (fix/npc-heightened-spells):
// createActor embeds NPC spells with `system.location.value = entryId` and
// creates slot rows keyed off the AI-assigned rank. When the AI heightens a
// spell above its own base rank (ai.mjs invites this explicitly), pf2e's
// SpellPF2e#rank falls back to the spell doc's base rank unless
// `system.location.heightenedLevel` is set to the assigned rank — otherwise
// the spell groups under the wrong (base) rank with 0/0 slots and is
// effectively uncastable. heightenedLevelFor() is the pure decision behind
// that fix: real-imported here (see builder.focusSpells.test.mjs for the
// same pattern) since it touches no Foundry globals.
// Run: node scripts/builder.heightenedSpells.test.mjs

import assert from "node:assert/strict";
import { heightenedLevelFor } from "./builder.mjs";

const spellData = (level, traits = []) => ({ level: { value: level }, traits: { value: traits } });

// Heightened above base rank: must record the assigned (higher) rank.
assert.equal(
  heightenedLevelFor(spellData(3), 5),
  5,
  "a rank-3 spell assigned rank 5 must record heightenedLevel 5"
);

// Assigned rank equals base rank (the common, unheightened case): must NOT
// write anything — matches real bestiary data convention of omitting
// heightenedLevel when it isn't actually heightened.
assert.equal(
  heightenedLevelFor(spellData(3), 3),
  null,
  "an unheightened spell (assigned rank === base rank) must not get heightenedLevel"
);

// Cantrips are never heightened via location data — pf2e auto-heightens
// cantrips itself — regardless of what rank ended up assigned to them.
assert.equal(
  heightenedLevelFor(spellData(0, ["cantrip"]), 3),
  null,
  "a cantrip must never get heightenedLevel, even if assignedRank looks heightened"
);
assert.equal(
  heightenedLevelFor(spellData(0, ["cantrip"]), 0),
  null,
  "a normal (non-heightened) cantrip must not get heightenedLevel"
);

// Missing/odd spell system data must fail closed to "no heightening" rather
// than throw or write garbage.
assert.equal(heightenedLevelFor({}, 1), 1, "missing level data treats base rank as 0, so any positive assigned rank heightens");
assert.equal(heightenedLevelFor({}, 0), null, "missing level data + assigned rank 0 must not heighten");

console.log("builder NPC heightened-spell regression check: all assertions passed");
