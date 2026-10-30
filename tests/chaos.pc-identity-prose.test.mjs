// Regression test adapted from Troy’s ce8092c reproduction; runs in the gate.
import assert from "node:assert/strict";

const { resolvePCIdentity } = await import("../scripts/pc-identity.mjs");

const ref = (packId, id) => ({ packId, _id: id });
const cand = (name, packId, id) => ({ name, ref: ref(packId, id), uuid: `Compendium.${packId}.Item.${id}` });
const catalogs = {
  ancestry: [cand("Human", "pf2e.ancestries", "human"), cand("Elf", "pf2e.ancestries", "elf")],
  heritage: [cand("Versatile Heritage", "pf2e.heritages", "versatile")],
  background: [cand("Guard", "pf2e.backgrounds", "guard"), cand("Acolyte", "pf2e.backgrounds", "acolyte")],
  class: [
    cand("Fighter", "pf2e.classes", "fighter"), cand("Wizard", "pf2e.classes", "wizard"),
    cand("Bard", "pf2e.classes", "bard"), cand("Sorcerer", "pf2e.classes", "sorcerer")
  ],
  classPath: []
};

const silent = console.warn;
console.warn = () => {};

const cases = [
  // Words that are ordinary English, not identity requests.
  ["A disgraced knight with a mysterious background seeking redemption", "ordinary English 'background'"],
  ["A working-class smuggler from Absalom", "ordinary English 'class' (hyphenated)"],
  ["A second-class citizen of the empire", "ordinary English 'class'"],
  ["A traveler from a place called Sandpoint", "ordinary English 'called'"],
  ["A character of great strength and few words", "ordinary English 'strength'"],
  ["A cleric whose faith is her ancestry's legacy", "ordinary English 'ancestry'"],

];

const refusals = [];
for (const [prompt, label] of cases) {
  try {
    resolvePCIdentity({ prompt, catalogs });
  } catch (err) {
    refusals.push(`${label}: ${err.code} (${err.field}) for ${JSON.stringify(prompt)}`);
  }
}

assert.throws(() => resolvePCIdentity({ prompt:"A level 8 Wizard", catalogs }), (e) => e.code === "PC_IDENTITY_AMBIGUOUS" && e.field === "class");
assert.deepEqual(refusals, [],
  "ordinary Character-mode prompts must not be refused as identity requests");

console.warn = silent;
console.log("chaos.pc-identity-prose.test.mjs: all prompts resolved");
