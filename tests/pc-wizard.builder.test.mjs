// Production createCharacterActor over the real Wizard class and level-one
// features (PF2e 8.5.0): both bridges are staged before Actor.create, required
// school and thesis ride the identity contract, and master's unstageable
// Arcane School filter refuses the build before any write.
// Run: node tests/pc-wizard.builder.test.mjs
import assert from "node:assert/strict";
import { load, makeWorld, installWorld } from "./fixtures/pc-wizard/world.mjs";

const events = [];
let created = null;
// The Actor stand-in has no `clone`, so the builder's native-skill preview
// degrades with a warning (the same limit the other builder regressions have).
// Keep the output clean but fail on any other warning.
const warnings = [];
const warn = console.warn;
console.warn = (...args) => { warnings.push(args.map(String).join(" ")); };
globalThis.foundry = { utils: { randomID: (() => { let id = 0; return () => `id-${++id}`; })() } };
globalThis.CONST = { TOKEN_DISPLAY_MODES: { OWNER_HOVER: 50 } };
globalThis.CONFIG = { PF2E: { languages: {} } };
globalThis.game = { i18n: { localize: (label) => label } };
globalThis.Actor = {
  async create() {
    events.push("actor-create");
    return {
      system: { attributes: { hp: { max: 20 } }, abilities: { int: { mod: 0 } } },
      async createEmbeddedDocuments(type, items) { events.push("embedded-create"); created = items; return items; },
      async update() { events.push("actor-update"); },
      async delete() { events.push("actor-delete"); }
    };
  }
};
const worlds = installWorld();

const CF = "pf2e.classfeatures";
const wizard = await load("wizard");
const features = await Promise.all([
  "wizard-spellcasting", "arcane-school", "arcane-bond", "arcane-thesis", "school-of-battle-magic", "school-of-mentalism",
  "spell-blending", "staff-nexus"
].map(load));
const arcaneSchoolMaster = await load("arcane-school-master");
const classDoc = { id: "wizard", pack: "pf2e.classes", uuid: `Compendium.pf2e.classes.Item.${wizard._id}`, name: "Wizard", type: "class", system: wizard.system,
  toObject: () => structuredClone(wizard) };
const world = makeWorld({ [CF]: features, "pf2e.classes": [wizard] });
const masterWorld = makeWorld({
  [CF]: features.map((json) => (json._id === arcaneSchoolMaster._id ? arcaneSchoolMaster : json)), "pf2e.classes": [wizard]
});
worlds.use(world);

const { createCharacterActor, validatePCIdentityRequirements } = await import("../scripts/pc-builder.mjs");
const { getClassPathCandidates } = await import("../scripts/class-paths.mjs");
const { issueCandidate } = await import("../scripts/compendium.mjs");

const doc = (type, system) => ({ type, system, toObject: () => ({ name: type, type, system: structuredClone(system) }) });
const concept = (requiredIdentity) => ({
  name: "Wizard Test", level: 1, keyAbility: "int", languages: [], backstory: "", appearance: "",
  personality: "", alignmentFlavor: "", likes: "", dislikes: "", allies: "", enemies: "", organizations: "",
  age: "", gender: "", height: "", weight: "", ethnicity: "", nationality: "", ...(requiredIdentity ? { requiredIdentity } : {})
});
const resolved = () => ({
  ancestryDoc: doc("ancestry", { boosts: {}, additionalLanguages: {}, languages: { value: [] }, rules: [] }),
  backgroundDoc: doc("background", { boosts: {}, trainedSkills: { value: [] } }),
  classDoc, heritageDoc: null, feats: [], spells: [], focusSpells: [], equipment: [], loot: []
});
const reset = () => { events.length = 0; created = null; };
const chooser = (labels) => async (groups) => ({
  picks: groups.map((group) => ({ choice: group.id, option: (group.options.find((option) => labels.includes(option.label)) ?? group.options[0]).id }))
});

// Candidates, as the identity catalogs issue them.
const candidates = await getClassPathCandidates(structuredClone(wizard));
const named = (name) => candidates.find((candidate) => candidate.name === name);
const wizardCandidate = issueCandidate({ packId: "pf2e.classes", _id: wizard._id, type: "class", name: "Wizard" }, { name: "Wizard", uuid: classDoc.uuid });

// 1. 8.5.0 data: no required path, the chooser decides each bridge.
{
  reset();
  await createCharacterActor(concept(), resolved(), { selectChoices: chooser(["School of Mentalism", "Staff Nexus"]) });
  assert.deepEqual(events, ["actor-create", "embedded-create", "actor-update"]);
  const wizardItem = created.find((item) => item.type === "class");
  const staged = created.filter((item) => item.type === "feat");
  assert.deepEqual(staged.map((item) => item.name), ["Arcane School", "Arcane Thesis"], "both bridges are embedded directly");
  assert.ok(staged.every((item) => item.system.location === wizardItem._id), "each bridge is linked to the class item");
  assert.equal(staged[0].system.rules[0].selection, named("School of Mentalism").uuid);
  assert.equal(staged[1].system.rules[0].selection, named("Staff Nexus").uuid);
  assert.deepEqual(Object.values(wizardItem.system.items).filter((entry) => entry.level === 1).map((entry) => entry.name).sort(),
    ["Arcane Bond", "Wizard Spellcasting"], "the other level-one grants stay native");
}

// 2. A required school and thesis reach the actor exactly and never reach the chooser.
{
  reset();
  const requiredIdentity = { class: wizardCandidate, classPaths: { "Arcane School": named("School of Battle Magic"), "Arcane Thesis": named("Spell Blending") } };
  let chooserCalls = 0;
  const wizardConcept = { ...concept(requiredIdentity), class: "Wizard", classCandidate: wizardCandidate.ref,
    classPaths: { "Arcane School": "School of Battle Magic", "Arcane Thesis": "Spell Blending" },
    classPathCandidates: { "Arcane School": named("School of Battle Magic").ref, "Arcane Thesis": named("Spell Blending").ref } };
  await createCharacterActor(wizardConcept, { ...resolved(), classDoc }, { selectChoices: async () => { chooserCalls++; return { picks: [] }; } });
  const staged = created.filter((item) => item.type === "feat");
  assert.equal(staged[0].system.rules[0].selection, named("School of Battle Magic").uuid);
  assert.equal(staged[1].system.rules[0].selection, named("Spell Blending").uuid);
  assert.equal(chooserCalls, 0);
}

// 3. Builder identity validation: each required path against its own bridge.
{
  const ok = { class: wizardCandidate, classPaths: { "Arcane School": named("School of Mentalism"), "Arcane Thesis": named("Staff Nexus") } };
  await validatePCIdentityRequirements(ok);
  await validatePCIdentityRequirements({ class: wizardCandidate, classPath: named("School of Mentalism") });
  const wrong = /missing, wrong-class, or unsupported/;
  await assert.rejects(validatePCIdentityRequirements({ class: wizardCandidate, classPaths: { "Arcane School": named("Staff Nexus") } }), wrong,
    "a thesis offered as the school fails");
  await assert.rejects(validatePCIdentityRequirements({ class: wizardCandidate, classPaths: { "Arcane Thesis": named("School of Mentalism") } }), wrong);
  await assert.rejects(validatePCIdentityRequirements({ class: wizardCandidate, classPaths: { "Arcane Major": named("School of Mentalism") } }), wrong);
  await assert.rejects(validatePCIdentityRequirements({ classPaths: { "Arcane School": named("School of Mentalism") } }), /requires an explicit class/);
  await assert.rejects(validatePCIdentityRequirements({ class: wizardCandidate, classPaths: ["School of Mentalism"] }), /keyed by bridge name/);
}

// 4. master's Arcane School: refused before Actor.create, so nothing is written.
{
  worlds.use(masterWorld);
  reset();
  await assert.rejects(createCharacterActor(concept(), resolved(), { selectChoices: chooser([]) }),
    (error) => error.message === 'simplypf2e | class path "Arcane School" has an unsupported choice shape; refusing a one-click build');
  assert.deepEqual(events, [], "the build refuses before any actor write");
  worlds.use(world);
}

console.warn = warn;
assert.deepEqual(warnings.filter((line) => !/provisional native skills|character skill review/.test(line)), [],
  "only the stand-in's native-skill preview limit is warned");

console.log("pc-wizard.builder.test.mjs: Wizard bridges stage before Actor.create and master's Arcane School refuses the build");
