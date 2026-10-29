// W3: spellcasting-archetype feats reach the feat-slot candidates only when the multiclass/Free Archetype
// settings allow an archetype AND the GM allowed spellcasting, with the real Wizard Dedication and Basic
// Wizard Spellcasting data (tests/fixtures/pc-caster) and the real ability prerequisite.
// Run: node tests/pc-builder.casterCandidates.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const load = async (name) => JSON.parse(await readFile(new URL(`./fixtures/pc-caster/${name}.json`, import.meta.url), "utf8"));
const dedication = await load("wizard-dedication");
const basic = await load("basic-wizard-spellcasting");
const expert = await load("expert-wizard-spellcasting");
const master = await load("master-wizard-spellcasting");
const fighterDedication = { _id: "fighterded", name: "Fighter Dedication", type: "feat", system: { level: { value: 2 }, category: "class", traits: { value: ["archetype", "dedication", "multiclass"], rarity: "common" }, prerequisites: { value: [{ value: "Strength +2" }] } } };
const bardDedication = await load("bard-dedication");
const bardBasic = await load("basic-bard-spellcasting");
const bardExpert = await load("expert-bard-spellcasting");
const feats = [dedication, basic, expert, master, bardDedication, bardBasic, bardExpert, fighterDedication].map((json) => ({ _id: json._id, name: json.name, type: "feat", system: json.system }));

const source = (name, type, system) => ({ _id: name, name, type, system });
const entries = {
  ancestry: source("Human", "ancestry", {}),
  background: source("Scholar", "background", { trainedSkills: { value: ["society"], lore: [] } }),
  class: source("Fighter", "class", {
    keyAbility: { value: ["str", "int", "cha"] }, trainedSkills: { value: [], additional: 3 },
    ancestryFeatLevels: { value: [1, 5] }, classFeatLevels: { value: [1, 2, 4, 6] }, generalFeatLevels: { value: [3] },
    skillFeatLevels: { value: [2, 4, 6] }
  })
};
// The class pack holds both classes the scenarios use (the index is cached, so it must not change).
const classIndex = [entries.class, { ...entries.class, _id: "Wizard", name: "Wizard" }];
const packMap = new Map();
for (const [category, entry] of Object.entries(entries)) {
  const id = `test.${category}`;
  const list = category === "class" ? classIndex : [entry];
  packMap.set(id, {
    collection: id, metadata: { type: "Item", label: category },
    getIndex: async () => list,
    getDocument: async (docId) => {
      const found = list.find((item) => item._id === docId) ?? entry;
      return { ...found, uuid: `Compendium.${id}.Item.${found._id}`, toObject: () => structuredClone(found) };
    }
  });
}
packMap.set("test.feats", { collection: "test.feats", metadata: { type: "Item", label: "Feats" }, getIndex: async () => feats });
let multiclass = true;
let freeArchetype = false;
globalThis.game = {
  settings: { get: (_module, key) => key === "freeArchetype" ? freeArchetype : key === "multiclassArchetypes" ? multiclass : {
    ancestries: ["test.ancestry"], backgrounds: ["test.background"], classes: ["test.class"], feats: ["test.feats"], spells: [], equipment: []
  } },
  packs: { get: (id) => packMap.get(id), [Symbol.iterator]: () => packMap.values() }
};
const { resolvePCConcept } = await import("../scripts/pc-builder.mjs");
const base = { ancestry: "Human", background: "Scholar", class: "Fighter", level: 4, keyAbility: "int", feats: [], focusSpells: [], equipment: [], loot: [] };
const names = (resolved, test) => resolved.featSlots.filter(test).flatMap((slot) => slot.candidates.map((candidate) => candidate.name));
const classSlots = (slot) => slot.type === "class" && !slot.archetype;
const archetypeSlots = (slot) => slot.archetype === true;

// Default: no caster feat is ever offered, noncaster dedications still are.
{
  const resolved = await resolvePCConcept({ ...base });
  const offered = names(resolved, classSlots);
  assert.ok(!offered.some((name) => /Wizard/.test(name)), "casterArchetypes unset offers no Wizard feat");
}

// Allowed: the dedication reaches the level-2 and level-4 class slots, the Basic feat only the level-4 slot.
{
  const resolved = await resolvePCConcept({ ...base, casterArchetypes: true });
  const bySlot = resolved.featSlots.filter(classSlots).map((slot) => [slot.level, slot.candidates.map((candidate) => candidate.name).filter((name) => /Wizard/.test(name)).sort()]);
  assert.deepEqual(bySlot, [
    [1, []],
    [2, ["Wizard Dedication"]],
    [4, ["Basic Wizard Spellcasting", "Wizard Dedication"]]
  ]);
  assert.ok(!names(resolved, classSlots).some((name) => /Expert Wizard|Master Wizard/.test(name)), "Expert and Master are never offered");
}

// The Intelligence +2 prerequisite is checked against the slot's derived modifiers.
{
  const resolved = await resolvePCConcept({ ...base, keyAbility: "str", casterArchetypes: true });
  assert.ok(!names(resolved, classSlots).includes("Wizard Dedication"), "Strength-keyed character lacks Intelligence +2 at level 2");
}

// A Wizard cannot take its own class's dedication.
{
  const resolved = await resolvePCConcept({ ...base, class: "Wizard", casterArchetypes: true });
  assert.ok(!names(resolved, classSlots).includes("Wizard Dedication"));
}

// The setting still gates everything: without multiclass or Free Archetype there is no archetype candidate.
{
  multiclass = false;
  const resolved = await resolvePCConcept({ ...base, casterArchetypes: true });
  assert.ok(!names(resolved, classSlots).some((name) => /Wizard/.test(name)), "multiclassArchetypes off offers none");
  assert.equal(names(resolved, archetypeSlots).length, 0);
  multiclass = true;
}

// Free Archetype slots take the catalog, caster feats only when allowed.
{
  freeArchetype = true;
  const allowed = await resolvePCConcept({ ...base, casterArchetypes: true });
  assert.ok(names(allowed, archetypeSlots).includes("Wizard Dedication"), "an archetype slot offers the dedication when allowed");
  const refused = await resolvePCConcept({ ...base });
  assert.ok(!names(refused, archetypeSlots).some((name) => /Wizard/.test(name)), "and not otherwise");
  freeArchetype = false;
}

// Bard (feat/bard-archetype): Charisma +2, the same switches and levels, Expert never offered.
{
  const offeredBard = (resolved) => resolved.featSlots.filter(classSlots).map((slot) => [slot.level, slot.candidates.map((c) => c.name).filter((name) => /Bard/.test(name)).sort()]);
  const allowed = await resolvePCConcept({ ...base, keyAbility: "cha", casterArchetypes: true });
  assert.deepEqual(offeredBard(allowed), [[1, []], [2, ["Bard Dedication"]], [4, ["Bard Dedication", "Basic Bard Spellcasting"]]]);
  assert.ok(!names(allowed, classSlots).includes("Expert Bard Spellcasting"), "Expert is never offered");
  const refused = await resolvePCConcept({ ...base, keyAbility: "cha" });
  assert.ok(!names(refused, classSlots).some((name) => /Bard/.test(name)), "no caster feat without the GM option");
  const lowCha = await resolvePCConcept({ ...base, keyAbility: "str", casterArchetypes: true });
  assert.ok(!names(lowCha, classSlots).includes("Bard Dedication"), "a Strength-keyed character lacks Charisma +2");
  const wizardOnly = await resolvePCConcept({ ...base, keyAbility: "int", casterArchetypes: true });
  assert.ok(names(wizardOnly, classSlots).includes("Wizard Dedication") && !names(wizardOnly, classSlots).includes("Bard Dedication"), "Intelligence qualifies for Wizard, not Bard");
}

console.log("pc-builder.casterCandidates.test.mjs: Wizard archetype feats are offered only when allowed, by level and by Intelligence +2");
