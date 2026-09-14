import assert from "node:assert/strict";
import { getBackgroundLoreOptions, resolveBackgroundLore, GUARD_BACKGROUND_REF } from "./pc-background-lore.mjs";

const options = getBackgroundLoreOptions(GUARD_BACKGROUND_REF);
assert.deepEqual(options, [
  { value: "legal", label: "Legal Lore" },
  { value: "warfare", label: "Warfare Lore" }
]);
assert.deepEqual(getBackgroundLoreOptions({ packId: "pf2e.backgrounds", _id: "other" }), []);
assert.deepEqual(getBackgroundLoreOptions({ uuid: "Compendium.pf2e.backgrounds.Item.6UmhTxOQeqFnppxx" }), options);

const guard85 = { uuid: "Compendium.pf2e.backgrounds.Item.6UmhTxOQeqFnppxx", type: "background", name: "Guard", system: { rules: [], description: { value: "You're trained in the Intimidation skill and the Legal Lore or Warfare Lore skill." }, trainedSkills: { value: ["intimidation"], lore: [] } } };
const guardMaster = { ...guard85, system: { ...guard85.system, trainedSkills: { value: ["intimidation"], lore: ["<Legal or Warfare> Lore"] } } };
assert.deepEqual(resolveBackgroundLore(guard85, "legal"), ["Legal Lore"]);
assert.deepEqual(resolveBackgroundLore(guard85, "warfare"), ["Warfare Lore"]);
assert.throws(() => resolveBackgroundLore(guard85), /requires an explicit/);
assert.deepEqual(resolveBackgroundLore(guardMaster, "legal"), ["Legal Lore"]);
assert.throws(() => resolveBackgroundLore({ type: "background", name: "Scholar", pack: "pf2e.backgrounds", id: "other", system: { trainedSkills: { lore: ["Sailing Lore"] } } }, "legal"), /requires the exact published Guard/);
assert.throws(() => resolveBackgroundLore({ type: "background", name: "Guard", uuid: guard85.uuid, pack: "pf2e.backgrounds", id: "other", system: guard85.system }), /conflicting/);
assert.throws(() => resolveBackgroundLore({ uuid: guard85.uuid, type: "background", name: "Guard", system: { rules: [], description: { value: "You're trained in the Intimidation skill and the Legal Lore or Warfare Lore skill." }, trainedSkills: { value: ["intimidation"], lore: ["Changed Lore"] } } }, "legal"), /source is missing or changed/);
assert.throws(() => resolveBackgroundLore({ uuid: "Compendium.pf2e.backgrounds.Item.other", type: "background", system: { trainedSkills: { lore: ["Sailing Lore", "<Choose> Lore"] } } }), /unresolved placeholder/);
console.log("pc-background-lore.test.mjs: bounded Guard and fixed Lore resolution passed");
for (const trainedSkills of [undefined, {}, { lore: null }, { lore: [] }]) {
  assert.throws(() => resolveBackgroundLore({ type: "background", system: { trainedSkills } }, "legal"), /exact published Guard/);
}
