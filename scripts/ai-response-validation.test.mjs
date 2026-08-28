import assert from "node:assert/strict";
import { AI_TASK } from "./ai-task-profiles.mjs";
import { taskResponseProblem } from "./ai-response-validation.mjs";

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
    ancestry: "Dwarf", heritage: null, background: "Guard", class: "Fighter", keyAbility: "str"
  }),
  null
);
assert.match(taskResponseProblem("unknown", {}), /unknown task/);
assert.equal(taskResponseProblem(AI_TASK.CHARACTER_CHOICES, { picks: [] }), null);
assert.match(taskResponseProblem(AI_TASK.CHARACTER_CHOICES, {}), /missing required fields: picks/);
assert.match(taskResponseProblem(AI_TASK.CHARACTER_CHOICES, { picks: {} }), /fields must be arrays: picks/);

console.log("ai-response-validation.test.mjs: all response-shape assertions passed");
