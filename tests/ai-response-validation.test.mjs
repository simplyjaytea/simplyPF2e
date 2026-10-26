import assert from "node:assert/strict";
import { AI_TASK } from "../scripts/ai-task-profiles.mjs";
import { taskResponseProblem } from "../scripts/ai-response-validation.mjs";

assert.equal(taskResponseProblem(AI_TASK.LOOT_DRAFT, { loot: [] }), null);
assert.match(
  taskResponseProblem(AI_TASK.LOOT_DRAFT, {}),
  /missing required fields: loot/,
  "valid JSON missing its operation payload must fail"
);
assert.match(
  taskResponseProblem(AI_TASK.CREATURE_CONCEPT, { name: "Incomplete" }),
  /missing required fields/,
  "valid but partial creature JSON must not reach normalization"
);
assert.match(
  taskResponseProblem(AI_TASK.SPELL_SELECTION, { spells: {} }),
  /fields must be arrays: spells/
);
assert.equal(
  taskResponseProblem(AI_TASK.ABC_SELECTION, {
    ancestryId: "A0", heritageId: null, backgroundId: "B0", classId: "C0", keyAbility: "str"
  }),
  null
);
assert.match(
  taskResponseProblem(AI_TASK.ABC_SELECTION, {
    ancestry: "Dwarf", heritage: null, background: "Guard", class: "Fighter", keyAbility: "str"
  }),
  /missing required fields: ancestryId, heritageId, backgroundId, classId/,
  "the old name-shaped ABC response must not satisfy the ID contract"
);
assert.match(
  taskResponseProblem(AI_TASK.ABC_SELECTION, {
    ancestryId: "A0", heritageId: 7, backgroundId: "B0", classId: "C0", keyAbility: "str"
  }),
  /fields must be non-empty strings or null: heritageId/,
  "heritageId may be null or a non-empty string only"
);
assert.match(
  taskResponseProblem(AI_TASK.ABC_SELECTION, {
    ancestryId: "A0", heritageId: null, backgroundId: "B0", classId: "C0", keyAbility: "strength"
  }),
  /fields must use offered enum slugs: keyAbility/,
  "ABC keyAbility must use the emitted enum slugs"
);
assert.match(taskResponseProblem("unknown", {}), /unknown task/);
assert.equal(taskResponseProblem(AI_TASK.CHARACTER_CHOICES, { picks: [] }), null);
assert.match(taskResponseProblem(AI_TASK.CHARACTER_CHOICES, {}), /missing required fields: picks/);
assert.match(taskResponseProblem(AI_TASK.CHARACTER_CHOICES, { picks: {} }), /fields must be arrays: picks/);
assert.equal(taskResponseProblem(AI_TASK.ABILITY_SELECTION, { abilityIds: [] }), null);
assert.match(taskResponseProblem(AI_TASK.ABILITY_SELECTION, { picks: [] }), /missing required fields: abilityIds/);
assert.equal(taskResponseProblem(AI_TASK.CREATURE_FEAT_SELECTION, { featIds: [] }), null);
assert.match(taskResponseProblem(AI_TASK.CREATURE_FEAT_SELECTION, { picks: [] }), /missing required fields: featIds/);

const HAZARD = {
  name: "Spear Launcher", description: "A wall socket loaded with a spear.", traits: ["trap"], rarity: "common", complex: false,
  stealth: "high", disable: [{ skill: "thievery", scale: "high" }], dispel: false, ac: "high",
  saves: { fortitude: "high", reflex: null, will: null }, hasHP: true,
  reaction: { name: "Spear", trigger: "Pressure is applied.", effect: "A spear flies.", strike: null, save: null },
  routine: null, reset: ""
};
assert.equal(taskResponseProblem(AI_TASK.HAZARD_CONCEPT, HAZARD), null, "a complete hazard shape passes without the validate hook");
const withoutReset = { ...HAZARD };
delete withoutReset.reset;
assert.match(taskResponseProblem(AI_TASK.HAZARD_CONCEPT, withoutReset), /missing required fields: reset/);
assert.match(taskResponseProblem(AI_TASK.HAZARD_CONCEPT, { ...HAZARD, traits: "trap" }), /fields must be arrays: traits/);
assert.match(taskResponseProblem(AI_TASK.HAZARD_CONCEPT, { ...HAZARD, disable: {} }), /fields must be arrays: disable/);
assert.match(taskResponseProblem(AI_TASK.HAZARD_CONCEPT, { ...HAZARD, name: "   " }), /fields must be non-empty strings: name/);
assert.match(taskResponseProblem(AI_TASK.HAZARD_CONCEPT, {}), /missing required fields: name, description/);
assert.doesNotMatch(taskResponseProblem(AI_TASK.HAZARD_CONCEPT, {}), /unknown task/, "the hazard task has a RULES entry");
console.log("ai-response-validation.test.mjs: all response-shape assertions passed");
