import assert from "node:assert/strict";
import { AI_TASK, completionOptionsFor } from "./ai-task-profiles.mjs";

assert.deepEqual(
  completionOptionsFor(AI_TASK.CONNECTION_TEST, {
    configuredTemperature: 1.8,
    configuredMaxTokens: 8000
  }),
  { temperature: 0, maxTokens: 64, reasoningEffort: "none", thinkingType: "disabled" },
  "connection checks must be deterministic and inexpensive"
);

assert.deepEqual(
  completionOptionsFor(AI_TASK.SPELL_FOCUS, {
    configuredTemperature: 1.4,
    configuredMaxTokens: 8000
  }),
  { temperature: 0, maxTokens: 768, reasoningEffort: "none", thinkingType: "disabled" },
  "grounding tasks must be deterministic and tightly bounded"
);

assert.deepEqual(
  completionOptionsFor(AI_TASK.CREATURE_CONCEPT, {
    configuredTemperature: 0,
    configuredMaxTokens: 3500
  }),
  { temperature: 0, maxTokens: 3500, reasoningEffort: "none", thinkingType: "disabled" },
  "configured temperature zero and lower user ceiling must survive"
);

assert.deepEqual(
  completionOptionsFor(AI_TASK.PC_CONCEPT, {
    configuredTemperature: 4,
    configuredMaxTokens: 50_000
  }),
  { temperature: 2, maxTokens: 8000, reasoningEffort: "none", thinkingType: "disabled" },
  "unsafe settings must clamp to task limits"
);

assert.equal(
  completionOptionsFor(AI_TASK.CREATURE_CONCEPT, { configuredMaxTokens: 8000 }).thinkingType,
  "disabled",
  "full structured concepts must reserve their response budget for JSON output"
);

assert.deepEqual(
  completionOptionsFor(AI_TASK.LOOT_DRAFT, {
    configuredTemperature: "not-a-number",
    configuredMaxTokens: 0
  }),
  { temperature: 0.8, maxTokens: 1600, reasoningEffort: "none", thinkingType: "disabled" },
  "invalid settings must use safe task defaults"
);

assert.throws(
  () => completionOptionsFor("missing-task"),
  /Unknown AI task profile/,
  "unknown operations must fail closed instead of inheriting a broad default"
);

assert.equal(
  completionOptionsFor(AI_TASK.SPELL_FOCUS, {
    configuredMaxTokens: 8000,
    retryAttempt: 1
  }).maxTokens,
  1536,
  "retry may expand a selector budget when a thinking model exhausts the first cap"
);

assert.equal(
  completionOptionsFor(AI_TASK.LOOT_DRAFT, { configuredMaxTokens: 8000 }).reasoningEffort,
  "none",
  "short creative tasks must also disable reasoning to preserve output budget"
);

assert.deepEqual(
  completionOptionsFor(AI_TASK.CHARACTER_CHOICES, { configuredTemperature: 1.5, configuredMaxTokens: 8000 }),
  { temperature: 0, maxTokens: 3072, reasoningEffort: "none", thinkingType: "disabled" },
  "character choice grounding must use a bounded deterministic request"
);

console.log("ai-task-profiles.test.mjs: all task-profile assertions passed");
