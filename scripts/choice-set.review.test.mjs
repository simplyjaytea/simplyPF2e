import assert from "node:assert/strict";
import { reviewUnresolvedChoices } from "./choice-set.mjs";

const choice = (extra = {}) => ({ key: "ChoiceSet", flag: "feature.choice!", ...extra });
const item = (rules, extra = {}) => ({ id: "feature", name: "<b>Native feature</b>", type: "feat", system: { rules }, ...extra });
const inputs = [item([
  choice({ prompt: "Pick a skill", ignored: true }),
  choice({ label: "Conditional", predicate: ["class:wizard"] }),
  choice({ selection: false }),
  ...["", "acrobatics", 0, 2, {}, { value: "test" }, Object.create(null)].map((selection) => choice({ selection })),
  choice({ allowNoSelection: true }),
  { key: "GrantItem" }
]), item([choice()], { suppressed: true })];
const before = structuredClone(inputs);
const report = reviewUnresolvedChoices(inputs);
assert.equal(report.incomplete, false);
assert.equal(report.choices.length, 3);
assert.deepEqual(report.choices[0], {
  itemId: "feature", itemName: "<b>Native feature</b>", prompt: "Pick a skill",
  flag: "featurechoice", conditional: false, ignored: true
});
assert.equal(report.choices[1].conditional, true);
assert.equal(report.choices[1].prompt, "Conditional");
assert.equal(report.choices[2].prompt, "PF2E.UI.RuleElements.ChoiceSet.Prompt");
assert.deepEqual(structuredClone(inputs), before, "inspection cannot mutate native item sources");
assert.equal(reviewUnresolvedChoices([item([choice()], { type: "effect", suppressed: true })]).choices.length, 1,
  "only feat suppression has the native skip semantics");
for (const selection of [null, undefined, true, false, NaN, Infinity, [], new Date()]) {
  assert.equal(reviewUnresolvedChoices([item([choice({ selection })])]).choices.length, 1);
}
for (const input of [undefined, null, {}, new Map()]) {
  assert.deepEqual(reviewUnresolvedChoices(input), { choices: [], incomplete: true });
}
const unreadable = { get system() { throw new Error("unreadable homebrew"); } };
const partial = reviewUnresolvedChoices([item([choice()]), unreadable, item(null), null, item([null]), item([choice()])]);
assert.equal(partial.incomplete, true);
assert.equal(partial.choices.length, 2, "continue inspecting other items after a failure");
assert.deepEqual(reviewUnresolvedChoices([{}, { system: {} }]), { choices: [], incomplete: false });
assert.deepEqual(reviewUnresolvedChoices([]), { choices: [], incomplete: false });
console.log("choice-set.review.test.mjs: read-only native-choice review passed");
