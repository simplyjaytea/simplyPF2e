// Dedication replacement skills (feat/dedication-skills). A Bard or Wizard Dedication trains its skills through its
// own real 8.5.0 `ActiveEffectLike` rule (`upgrade` to rank 1; pf2e applies upgrade as Math.max, so an already-trained
// skill is harmless). The published text still grants a replacement skill for each overlap, and the module spends it
// through the same training budget and priority order as a class/background duplicate. The native stand-in applies
// embedded feats' upgrade rules the way pf2e does, so the rank's origin is visible: the rule trains, the module adds
// exactly one choice per overlap.
// Run: node tests/pc-builder.dedicationSkills.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CORE_SKILLS } from "../scripts/pc-skills.mjs";

const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/pc-caster/${name}.json`, import.meta.url), "utf8"));
const clone = (value) => structuredClone(value);
const docs = new Map();
const stub = (json, packId) => {
  docs.set(`${packId}:${json._id}`, { id: json._id, uuid: `Compendium.pf2e.${packId}.Item.${json._id}`, name: json.name, type: json.type,
    system: json.system, toObject: () => clone(json) });
  return { packId, _id: json._id, uuid: `Compendium.pf2e.${packId}.Item.${json._id}`, name: json.name };
};
const bardDedication = stub(load("bard-dedication"), "feats");
const wizardDedication = stub(load("wizard-dedication"), "feats");
const cantrips = Object.fromEntries(["detect-magic", "light", "electric-arc", "telekinetic-projectile"].map((file) => [file, stub(load(file), "spells")]));
// A held ancestry feat with its own literal skill-rank rule (Adroit Manipulation: Thievery upgrade to 1). It is not a
// dedication, so an overlap with it grants no replacement.
const adroitManipulation = stub(load("adroit-manipulation"), "feats");
const maestro = load("maestro");

// ---- Native stand-in: ABC training, plus each embedded feat's own ActiveEffectLike upgrades (pf2e's max).
class NativeActor {
  constructor(source, embedded = false) {
    this._source = clone(source);
    this.embedded = embedded;
    this.id = "created-character";
    this.prepare();
  }
  prepare() {
    const items = this._source.items ?? [];
    this.items = new Map(items.map((item) => [item._id, { ...item, id: item._id }]));
    const ranks = Object.fromEntries(CORE_SKILLS.map((slug) => [slug, this._source.system.skills?.[slug]?.rank ?? 0]));
    for (const item of items.filter((entry) => ["class", "background"].includes(entry.type))) {
      for (const slug of item.system.trainedSkills?.value ?? []) ranks[slug] = Math.max(ranks[slug], 1);
    }
    for (const item of items.filter((entry) => entry.type === "feat")) {
      for (const rule of item.system.rules ?? []) {
        const match = /^system\.skills\.([a-z]+)\.rank$/.exec(String(rule.path ?? ""));
        if (rule.key === "ActiveEffectLike" && rule.mode === "upgrade" && match && ranks[match[1]] !== undefined) {
          ranks[match[1]] = Math.max(ranks[match[1]], rule.value);
        }
      }
    }
    const level = this._source.system.details.level.value;
    this.system = { ...clone(this._source.system),
      skills: Object.fromEntries(CORE_SKILLS.map((slug) => [slug, { rank: ranks[slug] }])),
      abilities: { int: { base: level === 1 ? 0 : 0, mod: 0 } },
      attributes: { hp: { max: 37 } },
      autoChanges: {}
    };
  }
  toObject() { return clone(this._source); }
  clone(changes) {
    const source = this.toObject();
    for (const [path, value] of Object.entries(changes)) {
      const parts = path.split(".");
      let target = source;
      for (const key of parts.slice(0, -1)) target = target[key] ??= {};
      target[parts.at(-1)] = clone(value);
    }
    return new NativeActor(source, this.embedded);
  }
  async update(changes) {
    for (const [path, value] of Object.entries(changes)) {
      const parts = path.split(".");
      let target = this._source;
      for (const key of parts.slice(0, -1)) target = target[key] ??= {};
      target[parts.at(-1)] = clone(value);
    }
    this.prepare();
  }
  async createEmbeddedDocuments(type, items) {
    assert.equal(type, "Item");
    this._source.items = clone(items);
    this.embedded = true;
    this.prepare();
    return [...this.items.values()];
  }
  async delete() {}
}

globalThis.foundry = { utils: { randomID: (() => { let id = 0; return () => `id${++id}`; })() } };
globalThis.CONST = { TOKEN_DISPLAY_MODES: { OWNER_HOVER: 50 } };
globalThis.CONFIG = { PF2E: { languages: {} } };
globalThis.game = {
  i18n: { localize: (key) => key, format: (key) => key },
  settings: { get: () => ({}) },
  packs: new Map([
    ["feats", { getDocument: async (id) => docs.get(`feats:${id}`) ?? null }],
    ["spells", { getDocument: async (id) => docs.get(`spells:${id}`) ?? null }],
    // Only the Bard dedication's muse ChoiceSet reads class features.
    ["pf2e.classfeatures", { getIndex: async () => [{
      _id: maestro._id, name: maestro.name, type: "feat",
      system: { slug: maestro.system.slug ?? null, level: maestro.system.level, category: maestro.system.category,
        traits: { value: ["bard-muse"], otherTags: maestro.system.traits.otherTags } }
    }], getDocument: async () => null }]
  ])
};
let created;
globalThis.Actor = { create: async (source) => { created = new NativeActor(source); return created; } };
console.warn = () => {};
const { createCharacterActor } = await import("../scripts/pc-builder.mjs");

const doc = (type, system) => ({ type, system, toObject: () => ({ type, name: type, system: clone(system) }) });
const pick = (file, rank) => ({ spell: { name: file, rank }, entry: cantrips[file] });

/** A level-2 Fighter (trained skill list given) that took one dedication; the rest of the ABC data is empty. */
function scenario(name, ref, trained, archetypeSpellcasting, spells) {
  return {
    concept: { name: "Dedication Test", level: 2, keyAbility: "str", skillPriorities: ["medicine", "athletics"], languages: [],
      spellcasting: null, ...(archetypeSpellcasting ? { archetypeSpellcasting } : {}) },
    resolved: {
      ancestryDoc: doc("ancestry", { boosts: {}, additionalLanguages: {}, languages: { value: [] } }),
      backgroundDoc: doc("background", { boosts: {}, trainedSkills: { value: [] } }),
      classDoc: doc("class", { keyAbility: { value: ["str"] }, trainedSkills: { value: trained, additional: 3 },
        skillIncreaseLevels: { value: [3, 5, 7, 9, 11, 13, 15, 17, 19] } }),
      heritageDoc: null, focusSpells: [], equipment: [], loot: [], spells: [],
      feats: [{ type: "class", level: 2, archetype: false, name, entry: ref }],
      archetypeSpells: spells
    }
  };
}
const bardChoice = { flag: "dedicationMuse", value: "maestro", options: [{ value: "maestro", label: "Maestro" }] };
const bardSpells = [pick("detect-magic", 0), pick("light", 0)];
const wizardSpells = [pick("detect-magic", 0), pick("electric-arc", 0), pick("light", 0), pick("telekinetic-projectile", 0)];
const rank1 = (slug) => created.system.skills[slug].rank;

// Bard: Occultism is already trained by the class. The rule keeps it at 1 (upgrade = max) and the module spends the
// replacement on the next skill in the ordinary priority order.
{
  const args = scenario("Bard Dedication", bardDedication, ["occultism"], { pkg: "bard", choice: bardChoice }, bardSpells);
  const result = await createCharacterActor(args.concept, args.resolved);
  assert.equal(result.skillReport.trainingBudget, 4, "an already-trained Occultism grants one replacement skill");
  assert.equal(result.skillReport.unspentTraining, 0);
  assert.equal(rank1("occultism"), 1, "the dedication's own rule trains Occultism");
  assert.equal(rank1("performance"), 1, "and Performance");
  assert.equal(rank1("arcana"), 1, "the replacement is the fourth untrained skill (medicine, athletics, acrobatics, arcana)");
  assert.equal(rank1("crafting"), 0, "and only one skill is added");
}

// Wizard: Arcana is already trained; the same replacement applies.
{
  const args = scenario("Wizard Dedication", wizardDedication, ["arcana"], { pkg: "wizard" }, wizardSpells);
  const result = await createCharacterActor(args.concept, args.resolved);
  assert.equal(result.skillReport.trainingBudget, 4, "an already-trained Arcana grants one replacement skill");
  assert.equal(rank1("arcana"), 1, "the dedication's own rule trains Arcana");
  assert.equal(rank1("crafting"), 1, "the replacement is the fourth untrained skill (medicine, athletics, acrobatics, crafting)");
}

// No overlap: the allowance is exactly the class budget and only three skills are picked.
{
  const args = scenario("Bard Dedication", bardDedication, ["society"], { pkg: "bard", choice: bardChoice }, bardSpells);
  const result = await createCharacterActor(args.concept, args.resolved);
  assert.equal(result.skillReport.trainingBudget, 3, "a dedication with no overlap adds no training");
  assert.equal(rank1("occultism"), 1);
  assert.equal(rank1("society"), 1, "the class's own fixed skill");
  assert.equal(rank1("arcana"), 0, "the fourth skill stays untrained");
}

// Only a dedication counts: an ancestry feat whose own rule trains an already-trained skill adds nothing.
{
  const args = scenario("Bard Dedication", bardDedication, ["society", "thievery"], { pkg: "bard", choice: bardChoice }, bardSpells);
  args.resolved.feats.unshift({ type: "ancestry", level: 1, archetype: false, name: "Adroit Manipulation", entry: adroitManipulation });
  const result = await createCharacterActor(args.concept, args.resolved);
  assert.ok(created._source.items.some((item) => item.name === "Adroit Manipulation"), "the ancestry feat is held and its rule applied");
  assert.equal(result.skillReport.trainingBudget, 3, "a non-dedication feat's overlapping skill rule grants no replacement");
  assert.equal(rank1("thievery"), 1);
}

console.log("pc-builder.dedicationSkills.test.mjs: dedication overlaps grant one replacement skill, no overlap adds none");
