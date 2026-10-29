// W3: createCharacterActor builds the Wizard archetype entry from the feats actually built, with the real
// pf2e 8.5.0 feats cloned unchanged and real arcane spells (tests/fixtures/pc-caster).
// Run: node tests/pc-builder.casterArchetype.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const load = async (name) => JSON.parse(await readFile(new URL(`./fixtures/pc-caster/${name}.json`, import.meta.url), "utf8"));
const docs = new Map();
const warnings = [];
const stub = (json, packId) => {
  docs.set(`${packId}:${json._id}`, {
    id: json._id, uuid: `Compendium.pf2e.${packId}.Item.${json._id}`, name: json.name, type: json.type, system: json.system,
    toObject: () => structuredClone(json)
  });
  return { packId, _id: json._id, uuid: `Compendium.pf2e.${packId}.Item.${json._id}`, name: json.name };
};
const dedicationJson = await load("wizard-dedication");
const basicJson = await load("basic-wizard-spellcasting");
const dedicationRef = stub(dedicationJson, "feats");
const basicRef = stub(basicJson, "feats");
const spell = async (file) => stub(await load(file), "spells");
const refs = {};
for (const file of ["detect-magic", "electric-arc", "light", "telekinetic-projectile", "fear", "grim-tendrils", "mirror-image", "fireball"]) refs[file] = await spell(file);

globalThis.foundry = { utils: { randomID: (() => { let i = 0; return () => `id-${++i}`; })() } };
globalThis.CONST = { TOKEN_DISPLAY_MODES: { OWNER_HOVER: 50 } };
globalThis.CONFIG = { PF2E: { languages: {} } };
globalThis.game = {
  i18n: { localize: (x) => x },
  packs: new Map(["feats", "spells"].map((packId) => [packId, { getDocument: async (id) => docs.get(`${packId}:${id}`) ?? null }]))
};
let embedded;
globalThis.Actor = { create: async () => ({
  system: { attributes: { hp: { max: 20 } }, abilities: { int: { mod: 0 } } },
  async createEmbeddedDocuments(_type, items) { embedded = items; }, async update() {}, async delete() {}
}) };
// The stand-in actor has no clone(): the builder warns that it skipped native skill inspection. Warnings are collected.
console.warn = (...args) => { warnings.push(args.join(" ")); };
const { createCharacterActor } = await import("../scripts/pc-builder.mjs");

const doc = (type, system, name = type) => ({ type, name, system, toObject: () => ({ name, type, system: structuredClone(system) }) });
const common = {
  name: "Archetype Fighter", level: 8, keyAbility: "str", languages: [], backstory: "", appearance: "", personality: "", alignmentFlavor: "",
  likes: "", dislikes: "", allies: "", enemies: "", organizations: "", age: "", gender: "", height: "", weight: "", ethnicity: "", nationality: "",
  spellcasting: null
};
const fighterClass = doc("class", { slug: "fighter", publication: { title: "Pathfinder Player Core", remaster: true }, keyAbility: { value: ["str", "dex"] }, trainedSkills: { value: [], additional: 3 } }, "Fighter");
const feat = (ref, name, level) => ({ type: "class", level, archetype: false, name, entry: ref });
const pick = (file, rank) => ({ spell: { name: file, rank }, entry: refs[file] });
const base = () => ({
  ancestryDoc: doc("ancestry", { boosts: {}, additionalLanguages: {}, languages: { value: [] } }),
  backgroundDoc: doc("background", { boosts: {}, trainedSkills: { value: [] } }),
  classDoc: fighterClass, heritageDoc: null, focusSpells: [], equipment: [], loot: [], spells: [],
  feats: [feat(dedicationRef, "Wizard Dedication", 2), feat(basicRef, "Basic Wizard Spellcasting", 4)],
  archetypeSpells: [
    pick("detect-magic", 0), pick("electric-arc", 0), pick("light", 0), pick("telekinetic-projectile", 0),
    pick("fear", 1), pick("grim-tendrils", 1), pick("mirror-image", 2), pick("fireball", 3)
  ]
});
const entries = () => embedded.filter((item) => item.type === "spellcastingEntry");
const spells = () => embedded.filter((item) => item.type === "spell");

// The Fighter gets the dedication and Basic feats unchanged, plus one archetype entry and its eight spells.
{
  await createCharacterActor({ ...common, archetypeSpellcasting: { pkg: "wizard" } }, base());
  const embeddedDedication = embedded.find((item) => item.name === "Wizard Dedication");
  assert.deepEqual(embeddedDedication.system.rules, dedicationJson.system.rules, "the Rule Element is the real, unauthored one");
  assert.equal(embeddedDedication.system.location, "class-2");
  assert.equal(embedded.find((item) => item.name === "Basic Wizard Spellcasting").system.location, "class-4");
  const [entry] = entries();
  assert.equal(entries().length, 1, "a Fighter has no class entry, so exactly the archetype entry");
  assert.equal(entry.name, "Wizard Archetype Spells");
  assert.equal(entry.system.tradition.value, "arcane");
  assert.equal(entry.system.ability.value, "int", "the key attribute is Intelligence although the class key is Strength");
  assert.deepEqual(entry.system.prepared, { value: "prepared", flexible: false });
  assert.equal(entry.system.proficiency.value, 1);
  assert.deepEqual(Object.entries(entry.system.slots).filter(([, slot]) => slot.max).map(([key, slot]) => [key, slot.max]),
    [["slot0", 2], ["slot1", 1], ["slot2", 1], ["slot3", 1]], "level 8 with Basic: two cantrips and one slot of ranks 1 to 3");
  assert.equal(spells().length, 8);
  assert.ok(spells().every((item) => item.system.location.value === entry._id));
  const byId = new Map(spells().map((item) => [item._id, item]));
  for (const slot of Object.values(entry.system.slots)) {
    for (const preparation of slot.prepared) {
      assert.deepEqual(Object.keys(preparation).sort(), ["expended", "id"]);
      assert.ok(byId.has(preparation.id), "every prepared id is an embedded spell");
    }
  }
  assert.equal(entry.system.slots.slot0.prepared.length, 2);
}

// The plan follows the built feats and the level: dedication only, then a level-5 character.
{
  const dedicationOnly = base();
  dedicationOnly.feats = [feat(dedicationRef, "Wizard Dedication", 2)];
  dedicationOnly.archetypeSpells = dedicationOnly.archetypeSpells.slice(0, 4);
  await createCharacterActor({ ...common, level: 2, archetypeSpellcasting: { pkg: "wizard" } }, dedicationOnly);
  assert.deepEqual(Object.entries(entries()[0].system.slots).filter(([, slot]) => slot.max).map(([key]) => key), ["slot0"], "cantrips only");
  assert.equal(spells().length, 4);

  const levelFive = base();
  levelFive.archetypeSpells = levelFive.archetypeSpells.slice(0, 6);
  await createCharacterActor({ ...common, level: 5, archetypeSpellcasting: { pkg: "wizard" } }, levelFive);
  assert.deepEqual(Object.entries(entries()[0].system.slots).filter(([, slot]) => slot.max).map(([key]) => key), ["slot0", "slot1"]);
  assert.equal(spells().length, 6);
}

// Fail closed: nothing is built without the dedication, without resolved spells, or for spells outside the plan.
{
  const noDedication = base();
  noDedication.feats = [feat(basicRef, "Basic Wizard Spellcasting", 4)];
  await createCharacterActor({ ...common }, noDedication);
  assert.equal(entries().length, 0, "Basic without the dedication builds no entry");
  assert.equal(spells().length, 0);

  const unresolved = base();
  unresolved.archetypeSpells = [{ spell: { name: "Nothing", rank: 0 }, entry: null }];
  warnings.length = 0;
  await createCharacterActor({ ...common, archetypeSpellcasting: { pkg: "wizard" } }, unresolved);
  assert.equal(entries().length, 0);
  assert.ok(warnings.some((line) => /no resolved spells/.test(line)), "the empty plan is warned");

  const offPlan = base();
  offPlan.archetypeSpells = [pick("fireball", 4), pick("fear", 0), pick("detect-magic", 0)];
  warnings.length = 0;
  await createCharacterActor({ ...common, archetypeSpellcasting: { pkg: "wizard" } }, offPlan);
  assert.deepEqual(spells().map((item) => item.name), ["Detect Magic"], "wrong-rank and heightened picks are dropped, the valid cantrip stays");
  assert.equal(warnings.filter((line) => /dropped archetype spell/.test(line)).length, 2);

  const noArchetypeSpells = base();
  delete noArchetypeSpells.archetypeSpells;
  await createCharacterActor({ ...common }, noArchetypeSpells);
  assert.equal(entries().length, 0, "a resolved plan without an archetypeSpells list builds no entry");
}

// A class caster and the archetype coexist as two entries (the archetype's own tradition and attribute).
{
  const wizardLike = base();
  wizardLike.classDoc = doc("class", { slug: "cleric", publication: { title: "Pathfinder Player Core", remaster: true }, keyAbility: { value: ["wis"] }, trainedSkills: { value: [], additional: 3 } }, "Cleric");
  wizardLike.spells = [];
  await createCharacterActor({ ...common, keyAbility: "wis", spellcasting: { tradition: "divine", spells: [] } }, wizardLike);
  const names = entries().map((entry) => entry.name).sort();
  assert.deepEqual(names, ["Divine Spells", "Wizard Archetype Spells"]);
  const archetype = entries().find((entry) => entry.name === "Wizard Archetype Spells");
  assert.equal(archetype.system.tradition.value, "arcane");
  assert.equal(archetype.system.ability.value, "int");
  const classEntry = entries().find((entry) => entry.name === "Divine Spells");
  assert.equal(classEntry.system.ability.value, "wis");
}

console.log("pc-builder.casterArchetype.test.mjs: the Wizard archetype entry, slots and spellbook come from the built feats and level, and anything off-plan is dropped");
