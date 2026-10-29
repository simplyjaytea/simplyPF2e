// Golden snapshots of the NPC benchmark tables and of the stat blocks built from them, through the real code.
// tests/fixtures/tables/ holds: every table export of tables.mjs; the encounter compositions of encounter.mjs for every
// threat, party size 3 to 6 and level 1 to 20; and the stat blocks computeStats returns for a brute and a caster.
// The snapshots pin the current values, so any table cell, boss offset, budget or stat-block change fails here and
// must be reviewed on purpose. They do not prove the tables match GM Core; the record states that boundary.
// Run: node tests/tables.golden.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as T from "../scripts/tables.mjs";
import { composeEncounter, encounterBudget, THREATS } from "../scripts/encounter.mjs";
import { computeStats } from "../scripts/builder.mjs";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/tables/${name}`, import.meta.url), "utf8"));

// 1. Every table is pinned, cell for cell, and no table is added or removed without a snapshot update.
const { tables } = fixture("tables.json");
const liveTables = Object.fromEntries(Object.entries(T).filter(([, value]) => typeof value === "object" && value !== null));
assert.deepEqual(Object.keys(liveTables).sort(), Object.keys(tables).sort(), "the table set is the snapshot's");
for (const [name, expected] of Object.entries(tables)) {
  assert.deepEqual(liveTables[name], expected, `${name} matches its snapshot`);
}

// 2. Encounter compositions: the budget, the headline creature, the hazard and the minions for every threat, party,
// level and hazard option. The minion tie-break is exercised by the hazard cases.
// The hazard options the GM can drop with a warning are expected here; silence them for the run.
const realWarn = console.warn;
console.warn = () => {};
for (const expected of fixture("encounters.json").encounters) {
  const { threat, partySize, partyLevel, hazard } = expected;
  const label = `${threat}, party of ${partySize} at level ${partyLevel}, hazard ${hazard}`;
  if (expected.error) {
    assert.throws(() => composeEncounter(threat, partySize, partyLevel, { hazard }), (err) => err.message === expected.error, label);
    continue;
  }
  const live = composeEncounter(threat, partySize, partyLevel, { hazard });
  assert.equal(live.budget, expected.budget, `${label}: budget`);
  assert.equal(live.spent, expected.spent, `${label}: spent`);
  assert.deepEqual(live.members, expected.members, `${label}: members`);
}
console.warn = realWarn;

// The severe threat's budget for a party of four is its table budget, and the snapshot agrees with it.
assert.equal(encounterBudget("severe", 4), THREATS.severe.budget, "a party of four gets the threat's table budget");
assert.equal(fixture("encounters.json").encounters.find((e) => e.threat === "severe" && e.partySize === 4 && e.partyLevel === 5).budget,
  THREATS.severe.budget, "the snapshot's severe budget is the table budget");

// 3. Stat blocks through the real computeStats: AC, HP, the three saves, perception, one strike's attack and
// damage, spell DC and attack, and resistance, for a brute and a caster.
for (const [name, block] of Object.entries(fixture("stat-blocks.json").stats)) {
  const live = computeStats(block.concept);
  assert.deepEqual(live, block.stats, `${name}: the stat block matches its snapshot`);
  for (const key of ["ac", "hp", "perception", "resistanceValue"]) {
    assert.equal(typeof live[key], "number", `${name}: ${key} is a number`);
  }
  assert.equal(typeof live.saves.fortitude, "number");
  assert.equal(typeof live.saves.reflex, "number");
  assert.equal(typeof live.saves.will, "number");
  assert.equal(typeof live.strikes[0].bonus, "number", `${name}: strike attack`);
  assert.match(live.strikes[0].damage, /^\d+d\d+[+-]\d+$/, `${name}: strike damage is a dice formula`);
  if (block.concept.spellcasting) {
    assert.equal(typeof live.spellDC, "number", `${name}: spell DC`);
    assert.equal(typeof live.spellAttack, "number", `${name}: spell attack`);
  } else {
    assert.equal(live.spellDC, null, `${name}: no spell DC without spellcasting`);
  }
}

console.log("tables.golden.test.mjs: every benchmark table, the encounter compositions and two stat blocks match their snapshots");
