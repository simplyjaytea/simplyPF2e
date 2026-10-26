import assert from "node:assert/strict";
import {
  classModelsFocusSpells, isCompletePCClass, settleFocusSpells, supportedClassCandidates
} from "../scripts/pc-support.mjs";

const candidates = ["Fighter", "Wizard", "Bard", "Rogue", "Investigator"].map((name) => ({ name }));
assert.deepEqual(supportedClassCandidates(candidates).map((candidate) => candidate.name),
  ["Fighter", "Wizard", "Rogue", "Investigator"]);
assert.equal(isCompletePCClass("Fighter"), true);
assert.equal(isCompletePCClass("Rogue"), true);
assert.equal(isCompletePCClass("Investigator"), true);
assert.equal(isCompletePCClass("Wizard"), true);
assert.equal(isCompletePCClass("Bard"), false);

// Focus spells: no complete-only class has a modeled focus source, so none are
// honoured for them; classes outside the registry keep their previous handling.
for (const name of ["Fighter", "Rogue", "Investigator", "Wizard"]) {
  assert.equal(classModelsFocusSpells(name), false, `${name} has no modeled focus source`);
  assert.equal(classModelsFocusSpells({ name }), false);
}
assert.equal(classModelsFocusSpells("Champion"), true);
assert.equal(classModelsFocusSpells(undefined), true, "a missing class is not a complete-only class");
const originalWarn = console.warn;
const warned = [];
console.warn = (...args) => { warned.push(args.join(" ")); };
const wizardConcept = { focusSpells: [{ name: "Force Bolt" }, { name: "Fire Ray" }] };
assert.equal(settleFocusSpells(wizardConcept, { name: "Wizard" }), false);
assert.deepEqual(wizardConcept.focusSpells, [], "the AI-supplied focus spells are dropped");
assert.equal(warned.length, 1);
assert.match(warned[0], /Wizard has no modeled focus-spell source/);
assert.equal(settleFocusSpells(wizardConcept, "Wizard"), false);
assert.equal(warned.length, 1, "nothing left to drop, so nothing to warn about");
const championConcept = { focusSpells: [{ name: "Lay on Hands" }] };
assert.equal(settleFocusSpells(championConcept, { name: "Champion" }), true);
assert.deepEqual(championConcept.focusSpells, [{ name: "Lay on Hands" }], "other classes keep their focus spells");
assert.equal(settleFocusSpells({}, { name: "Wizard" }), false, "a concept without the field is fine");
console.warn = originalWarn;
console.log("pc-support.test.mjs: complete-only class registry and focus-spell gate passed");
