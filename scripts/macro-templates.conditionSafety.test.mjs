// The condition macro must fail closed when it cannot read a PF2e save result:
// a save-negates effect must never silently become an automatic condition.
// Run: node scripts/macro-templates.conditionSafety.test.mjs
import assert from "node:assert/strict";
import { buildActivationCommand } from "./macro-templates.mjs";

const command = await buildActivationCommand({
  template: "condition",
  params: { conditionSlug: "frightened", value: 1, saveType: "fortitude", dc: 20 }
}, { forgeId: "test-forge", itemName: "Test Item", itemLevel: 3 });

assert.match(command, /const dos = outcome\?\.degreeOfSuccess \?\? outcome\?\.options\?\.degreeOfSuccess;/);
assert.match(command, /skipping auto-apply so the table can adjudicate manually/);
assert.match(command, /applies = false;/);
assert.match(command, /increaseCondition\(P\.conditionSlug, P\.value \? \{ value: P\.value \} : \{\}\)/);
assert.doesNotMatch(command, /result unclear to the macro\).*applied/);

console.log("macro condition safety check: all assertions passed");
