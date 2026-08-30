// Exact class-path staging regression: the native class keeps its ordinary
// grant graph, while one closed level-one bridge is linked directly to it.
// Run: node scripts/class-paths.test.mjs
import assert from "node:assert/strict";

const docs = new Map();
const uuid = (id) => `Compendium.pf2e.classfeatures.Item.${id}`;
const doc = (id, name, system) => ({
  pack: "pf2e.classfeatures", uuid: uuid(id), name,
  toObject: () => ({ _id: id, name, type: "feat", system: structuredClone(system) })
});
docs.set(uuid("bridge"), doc("bridge", "Methodology", { rules: [
  { key: "ChoiceSet", flag: "methodology", choices: { filter: ["item:tag:investigator-methodology"] } },
  { key: "GrantItem", uuid: "{item|flags.system.rulesSelections.methodology}" }
] }));
docs.set(uuid("closed"), doc("closed", "Empiricism", { category: "classfeature", traits: { otherTags: ["investigator-methodology"] }, rules: [
  { key: "ChoiceSet", flag: "skill", choices: [{ value: "arcana", label: "Arcana" }, { value: "society", label: "Society" }] }
] }));
docs.set(uuid("open"), doc("open", "Unsupported Methodology", { category: "classfeature", traits: { otherTags: ["investigator-methodology"] }, rules: [
  { key: "ChoiceSet", flag: "other", choices: { filter: ["item:tag:another-choice"] } }
] }));
docs.set(uuid("simple"), doc("simple", "Simple Methodology", { category: "classfeature", traits: { otherTags: ["investigator-methodology"] }, rules: [] }));

const pack = {
  async getIndex() {
    return [
      { _id: "closed", name: "Empiricism", type: "feat", system: { category: "classfeature", level: { value: 1 }, traits: { value: [], otherTags: ["investigator-methodology"] } } },
      { _id: "simple", name: "Simple Methodology", type: "feat", system: { category: "classfeature", level: { value: 1 }, traits: { value: [], otherTags: ["investigator-methodology"] } } },
      { _id: "open", name: "Unsupported Methodology", type: "feat", system: { category: "classfeature", level: { value: 1 }, traits: { value: [], otherTags: ["investigator-methodology"] } } }
    ];
  },
  getDocument: async (id) => docs.get(uuid(id)) ?? null
};
let configuredSources = {};
globalThis.game = { packs: { get: (id) => id === "pf2e.classfeatures" || id === "module.other-features" ? pack : null }, settings: { get: () => configuredSources } };
globalThis.CONFIG = { PF2E: {} };
globalThis.fromUuid = async (id) => docs.get(id) ?? null;

const { stageClassPaths } = await import("./class-paths.mjs");
const classData = { system: { items: { bridge: { level: 1, uuid: uuid("bridge") }, ordinary: { level: 1, uuid: "Compendium.pf2e.classfeatures.Item.NotAPath" } } } };
const calls = [];
const staged = await stageClassPaths(classData, "class-id", {
  context: {},
  selectChoices: async (groups) => {
    calls.push(groups);
    const option = groups[0].options.find((entry) => entry.label === "Empiricism") ?? groups[0].options.at(-1);
    return { picks: [{ choice: groups[0].id, option: option.id }] };
  }
});

assert.equal(staged.items.length, 1);
assert.ok(!("bridge" in classData.system.items), "only the staged bridge is removed from the native class entries");
assert.ok("ordinary" in classData.system.items, "other class grants remain native");
assert.equal(staged.items[0].system.location, "class-id");
assert.deepEqual(staged.items[0].system.rules[0].choices, [
  { value: uuid("closed"), label: "Empiricism" }, { value: uuid("simple"), label: "Simple Methodology" }
],
  "the selector is narrowed to the issued, choice-closed exact candidate");
assert.equal(staged.items[0].system.rules[0].selection, uuid("closed"));
assert.deepEqual(staged.items[0].system.rules[1].preselectChoices, { skill: "society" },
  "the native GrantItem receives an exact preselection for its selected path feature");
assert.equal(calls.length, 2, "the bridge and selected path's static choice reuse the existing bounded selector");
assert.deepEqual(staged.expectedPaths, [{ name: "Empiricism", type: "feat", _stats: { compendiumSource: uuid("closed") } }],
  "the native selected-path grant is included in post-create exact-source verification");

await assert.rejects(stageClassPaths({ system: { items: { bridge: { level: 1, uuid: uuid("bridge") } } } }, "class-id", { context: {} }),
  /was not selected/, "an omitted mandatory path choice blocks before Actor.create");

configuredSources = { classFeatures: ["module.other-features"] };
await assert.rejects(stageClassPaths({ system: { items: { bridge: { level: 1, uuid: uuid("bridge") } } } }, "class-id", { context: {}, selectChoices: async () => ({ picks: [] }) }),
  /source.*not enabled/, "an excluded bridge source blocks instead of falling back to PF2e's native dialog");

console.log("class-paths.test.mjs: exact closed class-path staging passed");
