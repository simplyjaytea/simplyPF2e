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
const spellJson = {};
const refs = {};
for (const file of ["detect-magic", "electric-arc", "light", "telekinetic-projectile", "fear", "grim-tendrils", "mirror-image", "invisibility", "web", "fireball", "lightning-bolt"]) {
  spellJson[file] = await load(file);
  refs[file] = stub(spellJson[file], "spells");
}
const pristine = structuredClone(spellJson);
const restoreSpells = () => { for (const [file, json] of Object.entries(pristine)) spellJson[file] = Object.assign(spellJson[file], structuredClone(json)); };

globalThis.foundry = { utils: { randomID: (() => { let i = 0; return () => `id-${++i}`; })() } };
globalThis.CONST = { TOKEN_DISPLAY_MODES: { OWNER_HOVER: 50 } };
globalThis.CONFIG = { PF2E: { languages: {} } };
globalThis.game = {
  i18n: { localize: (x) => x, format: (key, data) => `${key} ${JSON.stringify(data)}` },
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
    pick("fear", 1), pick("grim-tendrils", 1), pick("mirror-image", 2), pick("invisibility", 2), pick("fireball", 3), pick("lightning-bolt", 3)
  ]
});
const entries = () => embedded.filter((item) => item.type === "spellcastingEntry");
const spells = () => embedded.filter((item) => item.type === "spell");

// The Fighter gets the dedication and Basic feats unchanged, plus one archetype entry and its ten planned spells.
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
  assert.equal(spells().length, 10);
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
  assert.equal(levelFive.archetypeSpells.length, 6);
  await createCharacterActor({ ...common, level: 5, archetypeSpellcasting: { pkg: "wizard" } }, levelFive);
  assert.deepEqual(Object.entries(entries()[0].system.slots).filter(([, slot]) => slot.max).map(([key]) => key), ["slot0", "slot1"]);
  assert.equal(spells().length, 6);
}

// No dedication held and no archetype state: nothing to build.
{
  const noDedication = base();
  noDedication.feats = [feat(basicRef, "Basic Wizard Spellcasting", 4)];
  noDedication.archetypeSpells = [];
  embedded = undefined;
  await createCharacterActor({ ...common }, noDedication);
  assert.equal(entries().length, 0, "Basic without the dedication builds no entry");
  assert.equal(spells().length, 0);
}

// Fail closed at Create (CR MEDIUM #3): the preview required the complete spellbook, so Create requires it again and
// throws before Actor.create, writing nothing, whenever a planned pick is missing, changed or excess.
{
  let created = 0;
  const realCreate = globalThis.Actor.create;
  globalThis.Actor.create = async (...args) => { created += 1; return realCreate(...args); };
  const attempt = async (resolved, concept = { ...common, archetypeSpellcasting: { pkg: "wizard" } }) => {
    created = 0;
    embedded = undefined;
    await assert.rejects(createCharacterActor(concept, resolved), (error) => /^SIMPLYPF2E\.Errors\.PCArchetypeSpellbook /.test(error.message) && (attempt.last = error.message, true));
    assert.equal(created, 0, "no actor is created");
    assert.equal(embedded, undefined, "no item is written");
    return attempt.last;
  };

  // ONLY=<name> runs a single scenario (fail-before evidence); unset runs all.
  const only = (name) => !process.env.ONLY || process.env.ONLY === name;

  // A planned spell removed between preview and Create: its pick no longer resolves, or its document is gone.
  if (only("removed")) {
  const removedPick = base();
  removedPick.archetypeSpells[3] = { spell: { name: "Gone", rank: 0 }, entry: null };
  assert.match(await attempt(removedPick), /could not be loaded/);
  const fireballKey = `spells:${refs.fireball._id}`;
  const fireballDoc = docs.get(fireballKey);
  docs.delete(fireballKey);
  try { assert.match(await attempt(base()), /fireball.* could not be loaded/); } finally { docs.set(fireballKey, fireballDoc); }
  }

  if (only("short")) {
  // A short list: the preview's count is not met.
  const shortList = base();
  shortList.archetypeSpells = shortList.archetypeSpells.slice(0, 9);
  assert.match(await attempt(shortList), /rank 3 has 1 of 2 planned spells/);

  }

  // A changed tradition: a planned spell is no longer arcane.
  if (only("tradition")) {
  spellJson.fear.system.traits.traditions = ["divine"];
  assert.match(await attempt(base()), /not an arcane spell/);
  restoreSpells();
  }

  // A changed rank: a planned spell now sits at another rank.
  if (only("rank")) {
  spellJson["mirror-image"].system.level.value = 3;
  assert.match(await attempt(base()), /its own rank does not match rank 2/);
  restoreSpells();
  }

  if (only("rarity")) {
  // A changed rarity.
  spellJson.light.system.traits.rarity = "uncommon";
  assert.match(await attempt(base()), /only common spells/);
  restoreSpells();

  }

  // All sources rejected: nothing valid remains, and the entry is not pushed on its own.
  if (only("all-rejected")) {
  for (const json of Object.values(spellJson)) json.system.traits.traditions = ["occult"];
  assert.match(await attempt(base()), /not an arcane spell/);
  restoreSpells();
  }

  if (only("other")) {
  // Nothing resolved at all, and no list at all.
  const unresolved = base();
  unresolved.archetypeSpells = [{ spell: { name: "Nothing", rank: 0 }, entry: null }];
  assert.match(await attempt(unresolved), /could not be loaded/);
  const noList = base();
  delete noList.archetypeSpells;
  assert.match(await attempt(noList), /rank 0 has 0 of 4 planned spells/);

  // An excess pick beyond the plan, and a duplicate.
  const excess = base();
  excess.archetypeSpells.push(pick("web", 2));
  assert.match(await attempt(excess), /rank 2 picks are full/);
  const duplicate = base();
  duplicate.archetypeSpells[1] = pick("detect-magic", 0);
  assert.match(await attempt(duplicate), /duplicate spell/);

  // The archetype list outlives its feats: refused, not silently ignored.
  const noFeats = base();
  noFeats.feats = [];
  assert.match(await attempt(noFeats), /no longer held/);
  noFeats.archetypeSpells = base().archetypeSpells;
  assert.match(await attempt(noFeats, { ...common }), /no longer held/, "a spell list with no plan at all is refused");
  assert.match(await attempt(noFeats, { ...common, archetypeSpellcasting: { pkg: "wizard" } }), /Wizard Archetype Spells/, "the plan label, not fixed English, names the archetype");
  assert.match(await attempt(noFeats, { ...common, archetypeSpellcasting: { pkg: "unknown" } }), /SIMPLYPF2E\.Errors\.PCArchetypeLabel/, "an unknown package uses the localized fallback label");

  }

  // A valid spellbook still creates, and the creation list holds every planned item.
  restoreSpells();
  const valid = await createCharacterActor({ ...common, level: 8, archetypeSpellcasting: { pkg: "wizard" } }, base());
  assert.equal(spells().length, 10);
  const expectedNames = valid.expectedItems.filter((item) => item.type === "spell" || item.type === "spellcastingEntry").map((item) => item.name).sort();
  assert.deepEqual(expectedNames, ["Detect Magic", "Electric Arc", "Fear", "Fireball", "Grim Tendrils", "Invisibility", "Light", "Lightning Bolt",
    "Mirror Image", "Telekinetic Projectile", "Wizard Archetype Spells"], "post-create verification is given the whole planned spellbook and its entry");
  globalThis.Actor.create = realCreate;
}

// CR MEDIUM 2 (Wizard path): a held dedication or Basic feat that cannot be reloaded at Create fails closed, no actor.
{
  let created = 0;
  const realCreate = globalThis.Actor.create;
  globalThis.Actor.create = async (...args) => { created += 1; return realCreate(...args); };
  for (const ref of [dedicationRef, basicRef]) {
    const key = `feats:${ref._id}`;
    const stashed = docs.get(key);
    docs.delete(key);
    created = 0; embedded = undefined;
    await assert.rejects(createCharacterActor({ ...common, archetypeSpellcasting: { pkg: "wizard" } }, base()), (error) => /Errors\.PCArchetypeFeat/.test(error.message));
    assert.equal(created, 0, `no actor when ${ref.name} is gone`);
    assert.equal(embedded, undefined);
    docs.set(key, stashed);
  }
  globalThis.Actor.create = realCreate;
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
