// Bard archetype (feat/bard-archetype): createCharacterActor clones the real Bard Dedication, answers its muse
// ChoiceSet with the previewed choice (the `selection` pf2e itself persists), builds a separate spontaneous occult
// entry with the signature spell, and throws before Actor.create on a missing or ineligible muse or a changed spellbook.
// Real pf2e 8.5.0 fixtures (tests/fixtures/pc-caster).
// Run: node tests/pc-builder.bardArchetype.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const load = async (name) => JSON.parse(await readFile(new URL(`./fixtures/pc-caster/${name}.json`, import.meta.url), "utf8"));
const docs = new Map();
const stub = (json, packId) => {
  docs.set(`${packId}:${json._id}`, { id: json._id, uuid: `Compendium.pf2e.${packId}.Item.${json._id}`, name: json.name, type: json.type, system: json.system, toObject: () => structuredClone(json) });
  return { packId, _id: json._id, uuid: `Compendium.pf2e.${packId}.Item.${json._id}`, name: json.name };
};
const dedicationJson = await load("bard-dedication");
const basicJson = await load("basic-bard-spellcasting");
const dedicationRef = stub(dedicationJson, "feats");
const basicRef = stub(basicJson, "feats");
const spellJson = {};
const refs = {};
for (const file of ["detect-magic", "light", "telekinetic-projectile", "fear", "grim-tendrils", "mirror-image", "haste", "fireball"]) {
  spellJson[file] = await load(file);
  refs[file] = stub(spellJson[file], "spells");
}
const museJson = await Promise.all(["enigma", "maestro", "polymath", "warrior", "zoophonia"].map(load));
let museIndex = museJson.map((json) => ({ _id: json._id, name: json.name, type: json.type, system: { category: json.system.category, level: json.system.level, traits: json.system.traits } }));

globalThis.foundry = { utils: { randomID: (() => { let i = 0; return () => `id-${++i}`; })() } };
globalThis.CONST = { TOKEN_DISPLAY_MODES: { OWNER_HOVER: 50 } };
globalThis.CONFIG = { PF2E: { languages: {} } };
globalThis.game = {
  i18n: { localize: (x) => x, format: (key, data) => `${key} ${JSON.stringify(data)}` },
  settings: { get: () => ({}) },
  packs: new Map([
    ...["feats", "spells"].map((packId) => [packId, { getDocument: async (id) => docs.get(`${packId}:${id}`) ?? null }]),
    ["pf2e.classfeatures", { getIndex: async () => museIndex, getDocument: async () => null }]
  ])
};
// The module caches an index per pack object, so a scenario that changes the muse list swaps in a fresh pack object.
const setMuses = (list) => { museIndex = list; globalThis.game.packs.set("pf2e.classfeatures", { getIndex: async () => list, getDocument: async () => null }); };
let created = 0;
let embedded;
globalThis.Actor = { create: async () => { created += 1; return {
  system: { attributes: { hp: { max: 20 } }, abilities: { cha: { mod: 0 } } },
  async createEmbeddedDocuments(_type, items) { embedded = items; }, async update() {}, async delete() {}
}; } };
console.warn = () => {};
const { createCharacterActor, casterArchetypeChoiceOptions } = await import("../scripts/pc-builder.mjs");
const { CASTER_ARCHETYPES } = await import("../scripts/pc-caster-archetype.mjs");

const doc = (type, system, name = type) => ({ type, name, system, toObject: () => ({ name, type, system: structuredClone(system) }) });
const common = {
  name: "Archetype Fighter", level: 8, keyAbility: "str", languages: [], backstory: "", appearance: "", personality: "", alignmentFlavor: "",
  likes: "", dislikes: "", allies: "", enemies: "", organizations: "", age: "", gender: "", height: "", weight: "", ethnicity: "", nationality: "", spellcasting: null
};
const fighterClass = doc("class", { slug: "fighter", publication: { title: "Pathfinder Player Core", remaster: true }, keyAbility: { value: ["str", "dex"] }, trainedSkills: { value: [], additional: 3 } }, "Fighter");
const feat = (ref, name, level) => ({ type: "class", level, archetype: false, name, entry: ref });
const pick = (file, rank) => ({ spell: { name: file, rank }, entry: refs[file] });
const concept = (extra = {}) => ({ ...common, archetypeSpellcasting: { pkg: "bard", choice: { flag: "dedicationMuse", value: "maestro", options: [{ value: "maestro", label: "Maestro" }] }, ...extra } });
const base = () => ({
  ancestryDoc: doc("ancestry", { boosts: {}, additionalLanguages: {}, languages: { value: [] } }),
  backgroundDoc: doc("background", { boosts: {}, trainedSkills: { value: [] } }),
  classDoc: fighterClass, heritageDoc: null, focusSpells: [], equipment: [], loot: [], spells: [],
  feats: [feat(dedicationRef, "Bard Dedication", 2), feat(basicRef, "Basic Bard Spellcasting", 4)],
  archetypeSpells: [pick("detect-magic", 0), pick("light", 0), pick("fear", 1), pick("mirror-image", 2), pick("haste", 3)]
});
const entries = () => embedded.filter((item) => item.type === "spellcastingEntry");
const spells = () => embedded.filter((item) => item.type === "spell");

// Options: the five 8.5.0 muses by the dedication's own filter; a class-archetype-tagged one is excluded.
{
  const options = await casterArchetypeChoiceOptions(CASTER_ARCHETYPES.bard.choice);
  assert.deepEqual(options.map((option) => option.value), ["enigma", "maestro", "polymath", "warrior", "zoophonia"]);
}

// Valid level-8 build.
{
  const result = await createCharacterActor(concept(), base());
  assert.equal(created, 1);
  const dedication = embedded.find((item) => item.name === "Bard Dedication");
  assert.equal(dedication.system.location, "class-2");
  // Rules are the real ones; the only difference is the ChoiceSet's selection (pf2e's own persisted answer).
  const rules = structuredClone(dedication.system.rules);
  assert.equal(rules[0].selection, "maestro");
  delete rules[0].selection;
  assert.deepEqual(rules, dedicationJson.system.rules, "every rule is the unchanged, unauthored one except the answered selection");
  assert.ok(!embedded.some((item) => item.name === "Maestro"), "no muse feature is granted");
  assert.ok(!embedded.some((item) => item.type === "feat" && !["Bard Dedication", "Basic Bard Spellcasting"].includes(item.name)), "no starting feat is granted");
  assert.equal(embedded.find((item) => item.name === "Basic Bard Spellcasting").system.location, "class-4");
  assert.equal(entries().length, 1);
  const [entry] = entries();
  assert.equal(entry.name, "Bard Archetype Spells");
  assert.deepEqual([entry.system.tradition.value, entry.system.ability.value, entry.system.prepared.value, entry.system.prepared.flexible, entry.system.proficiency.value],
    ["occult", "cha", "spontaneous", false, 1]);
  assert.deepEqual(Object.entries(entry.system.slots).filter(([, slot]) => slot.max).map(([key, slot]) => [key, slot.max]), [["slot1", 1], ["slot2", 1], ["slot3", 1]]);
  assert.equal(spells().length, 5);
  assert.ok(spells().every((item) => item.system.location.value === entry._id));
  assert.deepEqual(spells().filter((item) => item.system.location.signature).map((item) => item.name), ["Fear"], "one signature spell at level 8");
  assert.deepEqual(result.expectedItems.filter((item) => item.type === "spell" || item.type === "spellcastingEntry").length, 6, "verification covers the entry and every spell");
}

// Level 4 has no signature; a different eligible muse is saved as chosen.
{
  const l4 = base();
  l4.archetypeSpells = [pick("detect-magic", 0), pick("light", 0), pick("fear", 1)];
  await createCharacterActor({ ...concept({ choice: { flag: "dedicationMuse", value: "warrior", options: [] } }), level: 4 }, l4);
  assert.equal(spells().filter((item) => item.system.location.signature).length, 0);
  assert.equal(embedded.find((item) => item.name === "Bard Dedication").system.rules[0].selection, "warrior", "the muse chosen in the preview is the one written");
}

// Dedication only: two cantrips, no ranked slot.
{
  const only = base();
  only.feats = [feat(dedicationRef, "Bard Dedication", 2)];
  only.archetypeSpells = [pick("detect-magic", 0), pick("light", 0)];
  await createCharacterActor({ ...concept(), level: 2 }, only);
  assert.deepEqual(Object.entries(entries()[0].system.slots).filter(([, slot]) => slot.max), []);
  assert.equal(spells().length, 2);
}

// Fail closed before Actor.create: nothing is written.
const refuse = async (conceptArg, resolved, pattern) => {
  created = 0; embedded = undefined;
  await assert.rejects(createCharacterActor(conceptArg, resolved), (error) => pattern.test(error.message));
  assert.equal(created, 0, "no actor");
  assert.equal(embedded, undefined, "no item");
};
await refuse(concept({ choice: { flag: "dedicationMuse", value: "not-a-muse", options: [] } }), base(), /Errors\.PCArchetypeChoice/);
await refuse(concept({ choice: { flag: "dedicationMuse", value: null, options: [] } }), base(), /Errors\.PCArchetypeChoice/);
await refuse(concept({ choice: undefined }), base(), /Errors\.PCArchetypeChoice/);
await refuse({ ...common, archetypeSpellcasting: null }, base(), /Errors\.PCArchetypeChoice/);
// The muse is eligible only while the live sources list it.
{
  const saved = museIndex;
  setMuses(museIndex.filter((entry) => entry.name !== "Maestro"));
  await refuse(concept(), base(), /Errors\.PCArchetypeChoice/);
  setMuses(saved);
}
// A muse tagged class-archetype is not eligible even when listed.
{
  const saved = museIndex;
  setMuses(museIndex.map((entry) => entry.name === "Maestro" ? { ...entry, system: { ...entry.system, traits: { ...entry.system.traits, otherTags: ["bard-muse", "class-archetype"] } } } : entry));
  await refuse(concept(), base(), /Errors\.PCArchetypeChoice/);
  setMuses(saved);
}
// Spells: a removed pick, an arcane-only spell (not occult), a changed rank.
{
  const removed = base(); removed.archetypeSpells[4] = { spell: { name: "Gone", rank: 3 }, entry: null };
  await refuse(concept(), removed, /Errors\.PCArchetypeSpellbook/);
  const arcane = base(); arcane.archetypeSpells[4] = pick("fireball", 3);
  await refuse(concept(), arcane, /not an occult spell/);
  spellJson["mirror-image"].system.level.value = 3;
  await refuse(concept(), base(), /own rank does not match rank 2/);
  spellJson["mirror-image"].system.level.value = 2;
}
// Still valid afterwards (the scenarios restored their changes).
await createCharacterActor(concept(), base());
assert.equal(spells().length, 5);

console.log("pc-builder.bardArchetype.test.mjs: the Bard Dedication keeps its real rules plus the previewed muse, the spontaneous occult entry and signature spell are built, and a bad muse or spellbook writes nothing");
