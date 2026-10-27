import assert from "node:assert/strict";
import { composeEncounter, encounterBudget, creatureXP, THREATS } from "../scripts/encounter.mjs";
import { hazardRequest, hazardXP } from "../scripts/encounter.mjs";
import { HAZARD_MIN_LEVEL, HAZARD_MAX_LEVEL } from "../scripts/hazard-tables.mjs";

// GM Core p75, preserved by the real system's Encounter Budget journal page:
// https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/journals/gm-screen.json
assert.equal(THREATS.low.perPlayer, 20, "low-threat party adjustment is 20 XP");
assert.equal(encounterBudget("low", 3), 40);
assert.equal(encounterBudget("low", 5), 80);
assert.equal(encounterBudget("low", 1), 0, "an impossible budget must not silently be increased");
assert.equal(composeEncounter("moderate", 1, 5).spent, 20, "a solo moderate fight cannot spend 60 XP");
assert.equal(composeEncounter("extreme", 8, 5).spent, 320, "large parties need enough lesser foes to use their budget");
assert.deepEqual(composeEncounter("moderate", 4, 5).members, [
  { role: "boss", level: 6, count: 1, xpEach: 60 },
  { role: "minion", level: 3, count: 1, xpEach: 20 }
], "the ordinary four-player composition remains stable");
for (let partyLevel = 1; partyLevel <= 20; partyLevel++) {
  for (let partySize = 1; partySize <= 8; partySize++) {
    for (const threat of Object.keys(THREATS)) {
      const budget = encounterBudget(threat, partySize);
      const minLevel = Math.max(-1, partyLevel - 4);
      const cheapest = creatureXP(minLevel, partyLevel);
      if (cheapest > budget) {
        assert.throws(() => composeEncounter(threat, partySize, partyLevel), /cannot fit|too small/i,
          "an unsupported tiny encounter must be explicit");
        continue;
      }
      const encounter = composeEncounter(threat, partySize, partyLevel);
      assert.ok(encounter.spent > 0 && encounter.spent <= budget, `${threat}, ${partySize} PCs at ${partyLevel}`);
      assert.equal(encounter.spent, encounter.members.reduce((sum, m) => sum + m.count * m.xpEach, 0));
      assert.ok(encounter.members.length <= 2, "keep the existing bounded two-role generation shape");
      for (const member of encounter.members) {
        assert.ok(member.level >= minLevel && member.level <= 24);
        assert.ok(Number.isInteger(member.count) && member.count >= 1 && member.count <= 8);
        assert.equal(member.xpEach, creatureXP(member.level, partyLevel));
      }
    }
  }
}
// ---- Hazard members (design note 69a22f5, approved 2026-10-27). ----
// At most one hazard. Boss first, then the hazard at the feasible level nearest
// party level (ties upward), then minions from the budget that remains.
// A dropped hazard is reported with console.warn, so warnings are captured here.
function withWarnings(run) {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    return { value: run(), warnings };
  } finally {
    console.warn = originalWarn;
  }
}
const hazardLevels = (partyLevel) => Array.from(
  { length: Math.min(HAZARD_MAX_LEVEL, partyLevel + 4) - Math.max(HAZARD_MIN_LEVEL, partyLevel - 4) + 1 },
  (_, i) => Math.max(HAZARD_MIN_LEVEL, partyLevel - 4) + i
);

// The AI request is normalized at the boundary: three words pass, anything else becomes none with a warning.
{
  const accepted = withWarnings(() => ["none", "simple", "complex"].map(hazardRequest));
  assert.deepEqual(accepted.value, ["none", "simple", "complex"]);
  assert.equal(accepted.warnings.length, 0, "valid requests are not warned about");
  const rejected = withWarnings(() => ["elite", "Simple", "", 2, null, undefined].map(hazardRequest));
  assert.deepEqual(rejected.value, Array(6).fill("none"), "an invalid request is treated as none");
  assert.equal(rejected.warnings.length, 6, "each invalid request is dropped with a warning");
}

// none is the default: every supported combination composes exactly as before.
for (const threat of Object.keys(THREATS)) for (let partySize = 1; partySize <= 8; partySize++) for (let partyLevel = 1; partyLevel <= 20; partyLevel++) {
  const outcome = (options) => {
    try { return composeEncounter(threat, partySize, partyLevel, options); } catch (err) { return err.message; }
  };
  assert.deepEqual(outcome({ hazard: "none" }), outcome(undefined), `${threat}, ${partySize} PCs at ${partyLevel}: none is the default`);
}

// A simple hazard fits beside the boss and the minion: boss 60, hazard 8 at party level, minion 10 from the 12 left.
assert.deepEqual(composeEncounter("moderate", 4, 5, { hazard: "simple" }).members, [
  { role: "boss", level: 6, count: 1, xpEach: 60 },
  { role: "hazard", level: 5, count: 1, xpEach: 8, complex: false },
  { role: "minion", level: 1, count: 1, xpEach: 10 }
], "a simple hazard at party level takes 8 XP and the minion gets the rest");
assert.equal(composeEncounter("moderate", 4, 5, { hazard: "simple" }).spent, 78);

// A complex hazard costs a creature's XP (20 at level 3), so it steps below party level to fit the 20 XP left.
assert.deepEqual(composeEncounter("moderate", 4, 5, { hazard: "complex" }).members, [
  { role: "boss", level: 6, count: 1, xpEach: 60 },
  { role: "hazard", level: 3, count: 1, xpEach: 20, complex: true }
], "a complex hazard takes the nearest feasible level");

// No level fits the 0 XP left after the boss: the hazard is dropped with one warning and the output is the none output.
{
  const dropped = withWarnings(() => composeEncounter("moderate", 1, 1, { hazard: "simple" }));
  assert.deepEqual(dropped.value, composeEncounter("moderate", 1, 1), "a hazard that does not fit leaves the none output");
  assert.equal(dropped.warnings.length, 1, "the dropped hazard is reported once");
  const droppedComplex = withWarnings(() => composeEncounter("moderate", 1, 1, { hazard: "complex" }));
  assert.deepEqual(droppedComplex.value, composeEncounter("moderate", 1, 1));
  assert.equal(droppedComplex.warnings.length, 1);
}

// An unknown request is a caller error inside the module; the AI boundary normalizes it first.
for (const bad of ["elite", "Simple", "", 2, null]) {
  assert.throws(() => composeEncounter("moderate", 4, 5, { hazard: bad }), TypeError, `hazard ${JSON.stringify(bad)}`);
}

// Oracle sweep over every supported combination: independent of the minion loop, it recomputes the
// feasible hazard level and checks the budget, the boss rule, the single hazard and the none fallback.
let drops = 0;
const sweep = withWarnings(() => {
  for (const hazard of ["simple", "complex"]) {
    const complex = hazard === "complex";
    for (const threat of Object.keys(THREATS)) for (let partySize = 1; partySize <= 8; partySize++) for (let partyLevel = 1; partyLevel <= 20; partyLevel++) {
      const budget = encounterBudget(threat, partySize);
      if (creatureXP(Math.max(-1, partyLevel - 4), partyLevel) > budget) continue;
      const label = `${hazard} ${threat}, ${partySize} PCs at ${partyLevel}`;
      const none = composeEncounter(threat, partySize, partyLevel);
      const boss = none.members[0];
      const room = budget - boss.xpEach;
      const fits = hazardLevels(partyLevel)
        .filter((level) => hazardXP(level, partyLevel, complex) <= room)
        .sort((a, b) => Math.abs(a - partyLevel) - Math.abs(b - partyLevel) || b - a);
      const encounter = composeEncounter(threat, partySize, partyLevel, { hazard });
      if (fits.length === 0) {
        drops++;
        assert.deepEqual(encounter, none, `${label}: no feasible level means the none output`);
        continue;
      }
      const hazards = encounter.members.filter((member) => member.role === "hazard");
      assert.equal(hazards.length, 1, `${label}: exactly one hazard member`);
      assert.deepEqual(encounter.members[0], boss, `${label}: the boss is not stepped down for the hazard`);
      assert.deepEqual(hazards[0], { role: "hazard", level: fits[0], count: 1, xpEach: hazardXP(fits[0], partyLevel, complex), complex }, label);
      const minions = encounter.members.filter((member) => member.role === "minion");
      assert.ok(minions.length <= 1 && encounter.members.length <= 3, `${label}: at most boss, hazard and one minion`);
      const minionXP = minions.reduce((sum, m) => sum + m.count * m.xpEach, 0);
      assert.ok(minionXP <= room - hazards[0].xpEach, `${label}: minions use only the budget left after the hazard`);
      assert.equal(encounter.spent, encounter.members.reduce((sum, m) => sum + m.count * m.xpEach, 0), label);
      assert.ok(encounter.spent <= budget, `${label}: hazard, boss and minions stay within the shared budget`);
    }
  }
});
assert.ok(drops > 0 && drops < 1600, "the sweep exercises both fitting and dropped hazards");
assert.equal(sweep.warnings.length, drops, "every dropped hazard in the sweep is reported exactly once");

console.log("encounter.test.mjs: all 800 supported party/threat combinations stay within budget or fail explicitly");
console.log("encounter.test.mjs: hazard members stay within the shared budget, at most one, with the none output unchanged");
