import assert from "node:assert/strict";
import { composeEncounter, encounterBudget, creatureXP, THREATS } from "./encounter.mjs";

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
console.log("encounter.test.mjs: all 800 supported party/threat combinations stay within budget or fail explicitly");
