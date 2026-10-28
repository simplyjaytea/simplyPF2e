// Production createCharacterActor over the real Wizard class and level-one
// features (PF2e 8.5.0): both bridges are staged before Actor.create, required
// school and thesis ride the identity contract, and master's unstageable
// Arcane School filter refuses the build before any write. AI-named focus spells
// are dropped for Wizard (no focus entry, no pool), and an explicitly required
// Wizard on master-shaped data fails identity validation itself.
// Run: node tests/pc-wizard.builder.test.mjs
import assert from "node:assert/strict";
import { load, makeWorld, installWorld } from "./fixtures/pc-wizard/world.mjs";

const events = [];
let created = null;
let actorData = null;
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
  async create(data) {
    events.push("actor-create");
    actorData = data;
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
const forceBolt = await load("force-bolt");
const charmingPush = await load("charming-push");
const classDoc = { id: "wizard", pack: "pf2e.classes", uuid: `Compendium.pf2e.classes.Item.${wizard._id}`, name: "Wizard", type: "class", system: wizard.system,
  toObject: () => structuredClone(wizard) };
// Synthetic stand-in for a published focus spell, used only by regression 5: the
// document shape and the focus trait are all the builder reads. Not a PF2e fixture.
const focusSpell = { _id: "focusSpell0001", name: "Stand-in Focus Spell", type: "spell", system: { traits: { value: ["focus"] }, location: { value: null } } };
const world = makeWorld({ [CF]: features, "pf2e.classes": [wizard], "pf2e.spells-srd": [forceBolt, charmingPush, focusSpell] });
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
const reset = () => { events.length = 0; created = null; actorData = null; };
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

// 5. Focus spells. Wizard has no modeled focus source (school spells are linked
// from prose, no rule grants them), so AI-named focus spells are dropped with a
// warning and neither a focus entry nor a focus pool is written.
{
  reset();
  const first = warnings.length;
  const focus = { name: focusSpell.name, entry: { packId: "pf2e.spells-srd", _id: focusSpell._id } };
  const wizardConcept = { ...concept(), focusSpells: [{ name: focusSpell.name }] };
  await createCharacterActor(wizardConcept, { ...resolved(), focusSpells: [focus] }, { selectChoices: chooser([]) });
  assert.deepEqual(wizardConcept.focusSpells, [], "the AI-named focus spells are dropped from the concept");
  assert.equal(created.some((item) => item.type === "spellcastingEntry"), false, "no focus spellcasting entry is written");
  assert.equal(created.some((item) => item.type === "spell"), false, "no focus spell is embedded");
  assert.equal(actorData.system.resources.focus.value, 0, "the focus pool stays at 0");
  const fresh = warnings.splice(first);
  assert.equal(fresh.filter((line) => /Wizard has no modeled focus-spell source/.test(line)).length, 1, "the drop is warned exactly once");
  warnings.push(...fresh.filter((line) => !/modeled focus-spell source/.test(line)));

  // Control: the same data for a class outside the complete-only registry keeps
  // its focus entry and pool, so the assertions above can fail.
  reset();
  const mark = warnings.length;
  const otherConcept = { ...concept(), focusSpells: [{ name: focusSpell.name }] };
  await createCharacterActor(otherConcept, { ...resolved(), classDoc: { ...classDoc, name: "Champion" }, focusSpells: [focus] }, { selectChoices: chooser([]) });
  const focusEntry = created.find((item) => item.type === "spellcastingEntry");
  assert.equal(focusEntry?.system.prepared.value, "focus", "a class with a focus source keeps its focus entry");
  assert.deepEqual(focusEntry.system.rules, []);
  assert.equal(created.find((item) => item.type === "spell")?.system.location.value, focusEntry._id);
  assert.equal(actorData.system.resources.focus.value, 1);
  assert.equal(otherConcept.focusSpells.length, 1, "and its focus spells are not dropped");
  assert.equal(warnings.slice(mark).filter((line) => /focus-pool/.test(line)).length, 0);
}

// 6. An explicitly required Wizard on master-shaped data fails identity
// validation itself, before ABC selection or any further provider call.
{
  const guard = (error) => {
    assert.equal(error.message, "simplypf2e | class path \"Arcane School\" has an unsupported choice shape; refusing a one-click build");
    return true;
  };
  worlds.use(masterWorld);
  await assert.rejects(validatePCIdentityRequirements({ class: wizardCandidate }), guard);
  await assert.rejects(validatePCIdentityRequirements({ class: wizardCandidate, classPaths: { "Arcane Thesis": named("Staff Nexus") } }), guard,
    "a required thesis does not hide the unstageable school");
  await validatePCIdentityRequirements({});
  worlds.use(world);
  await validatePCIdentityRequirements({ class: wizardCandidate });
}
}

// 7. A Wizard whose Arcane Thesis has no fully resolvable enabled candidate is
// refused by identity validation before any provider call, and by the build
// before Actor.create.
{
  const refusal = { message: 'simplypf2e | no fully resolvable enabled class paths for "Arcane Thesis"' };
  worlds.use(makeWorld({ [CF]: features.filter((json) => !["Spell Blending", "Staff Nexus"].includes(json.name)), "pf2e.classes": [wizard] }));
  reset();
  await assert.rejects(validatePCIdentityRequirements({ class: wizardCandidate }), refusal, "identity validation refuses the class before any provider call");
  await assert.rejects(createCharacterActor(concept(), resolved(), { selectChoices: chooser([]) }), refusal);
  assert.deepEqual(events, [], "the build refuses before any actor write");
  worlds.use(world);
}

// 8–11. School spell resolution is based on the staged school at Create.
const schoolIdentity = { class: wizardCandidate, classPaths: { "Arcane School": named("School of Battle Magic"), "Arcane Thesis": named("Spell Blending") } };
const schoolConcept = () => ({ ...concept(schoolIdentity), class: "Wizard", classCandidate: wizardCandidate.ref,
  classPaths: { "Arcane School": "School of Battle Magic", "Arcane Thesis": "Spell Blending" },
  classPathCandidates: { "Arcane School": named("School of Battle Magic").ref, "Arcane Thesis": named("Spell Blending").ref },
  spellcasting: { tradition: "arcane", spells: [] } });
const focusEntries = () => created.filter((item) => item.type === "spellcastingEntry" && item.system.prepared.value === "focus");
{
  reset(); const mark = warnings.length;
  await createCharacterActor(schoolConcept(), resolved());
  assert.equal(focusEntries().length, 1);
  const entry = focusEntries()[0];
  assert.deepEqual(entry.system.rules, []);
  const spell = created.find((item) => item.name === "Force Bolt");
  assert.equal(spell.system.location.value, entry._id);
  assert.equal(spell._stats.compendiumSource, "Compendium.pf2e.spells-srd.Item.Hu38hoAUSYeFpkVa");
  assert.equal(actorData.system.resources.focus.value, 1);
  assert.equal(warnings.slice(mark).filter((line) => /School of Battle Magic/.test(line)).length, 0);
}
{
  worlds.use(makeWorld({ [CF]: features, "pf2e.classes": [wizard], "pf2e.spells-srd": [charmingPush, focusSpell] }));
  reset(); const mark = warnings.length;
  await createCharacterActor(schoolConcept(), resolved());
  assert.equal(focusEntries().length, 0);
  assert.equal(events.includes("actor-create"), true);
  const schoolWarnings = warnings.splice(mark).filter((line) => /School of Battle Magic/.test(line));
  assert.equal(schoolWarnings.length, 1);
  worlds.use(world);
}
{
  const damagedSchool = structuredClone(features.find((item) => item.name === "School of Battle Magic"));
  damagedSchool.system.description.value = "<p>No school spell link.</p>";
  worlds.use(makeWorld({ [CF]: features.map((item) => item._id === damagedSchool._id ? damagedSchool : item), "pf2e.classes": [wizard], "pf2e.spells-srd": [forceBolt] }));
  reset(); const mark = warnings.length;
  await createCharacterActor(schoolConcept(), resolved());
  assert.equal(focusEntries().length, 0);
  assert.equal(events.includes("actor-create"), true);
  assert.equal(warnings.splice(mark).filter((line) => /School of Battle Magic/.test(line)).length, 1);
  worlds.use(world);
}
{
  reset(); const mark = warnings.length;
  const c = { ...schoolConcept(), focusSpells: [{ name: focusSpell.name }] };
  await createCharacterActor(c, { ...resolved(), focusSpells: [{ name: focusSpell.name, entry: { packId: "pf2e.spells-srd", _id: focusSpell._id } }] });
  assert.deepEqual(c.focusSpells, []);
  assert.deepEqual(created.filter((item) => item.type === "spell").map((item) => item.name), ["Force Bolt"]);
  assert.equal(warnings.splice(mark).filter((line) => /Wizard has no modeled focus-spell source/.test(line)).length, 1);
}
// Two staged school-tagged paths are ambiguous; no spell may be guessed.
{
  const secondSchool = structuredClone(features.find((item) => item.name === "Spell Blending"));
  secondSchool.system.traits.otherTags.push("wizard-arcane-school");
  worlds.use(makeWorld({ [CF]: features.map((item) => item._id === secondSchool._id ? secondSchool : item), "pf2e.classes": [wizard], "pf2e.spells-srd": [forceBolt] }));
  reset(); const mark = warnings.length;
  await createCharacterActor(schoolConcept(), resolved());
  assert.equal(events.includes("actor-create"), true);
  assert.equal(focusEntries().length, 0);
  const fresh = warnings.splice(mark);
  const schoolWarnings = fresh.filter((line) => /multiple arcane schools/.test(line));
  assert.equal(schoolWarnings.length, 1);
  assert.match(schoolWarnings[0], /simplypf2e \| School of Battle Magic/);
  warnings.push(...fresh.filter((line) => !/multiple arcane schools/.test(line)));
  worlds.use(world);
}
// A link resolving to a feat is not an eligible spell, even with focus traits.
{
  const nonSpell = { ...structuredClone(forceBolt), type: "feat" };
  worlds.use(makeWorld({ [CF]: features, "pf2e.classes": [wizard], "pf2e.spells-srd": [nonSpell] }));
  reset(); const mark = warnings.length;
  await createCharacterActor(schoolConcept(), resolved());
  assert.equal(events.includes("actor-create"), true);
  assert.equal(focusEntries().length, 0);
  const fresh = warnings.splice(mark);
  const schoolWarnings = fresh.filter((line) => /simplypf2e \| School of Battle Magic/.test(line));
  assert.equal(schoolWarnings.length, 1);
  assert.match(schoolWarnings[0], /initial school spell is missing, invalid, or in a disabled pack/);
  warnings.push(...fresh.filter((line) => !/simplypf2e \| School of Battle Magic/.test(line)));
  worlds.use(world);
}
// A resolved non-focus spell or an excluded pack cannot become a school spell.
{
  const nonFocus = structuredClone(forceBolt);
  nonFocus.system.traits.value = ["force", "wizard"];
  worlds.use(makeWorld({ [CF]: features, "pf2e.classes": [wizard], "pf2e.spells-srd": [nonFocus] }));
  reset(); const mark = warnings.length;
  await createCharacterActor(schoolConcept(), resolved());
  assert.equal(focusEntries().length, 0);
  assert.equal(warnings.splice(mark).filter((line) => /School of Battle Magic/.test(line)).length, 1);
}
{
  worlds.use(makeWorld({ [CF]: features, "pf2e.classes": [wizard], "pf2e.spells-srd": [forceBolt], "custom.spells": [] }));
  const get = game.settings.get;
  game.settings.get = (_module, key) => key === "sourcePacks" ? { spells: ["custom.spells"] } : {};
  reset(); const mark = warnings.length;
  await createCharacterActor(schoolConcept(), resolved());
  assert.equal(focusEntries().length, 0);
  assert.equal(warnings.splice(mark).filter((line) => /School of Battle Magic/.test(line)).length, 1);
  game.settings.get = get;
  worlds.use(world);
}
// Built-pack ID links resolve too, and focus cantrips do not add pool points.
{
  const builtSchool = structuredClone(features.find((item) => item.name === "School of Battle Magic"));
  builtSchool.system.description.value = "<p><strong>School Spells</strong> initial: @UUID[Compendium.pf2e.spells-srd.Item.Hu38hoAUSYeFpkVa]{Force Bolt}; advanced: @UUID[Compendium.pf2e.spells-srd.Item.LoBjvguamA12iyW0]{Energy Absorption}</p>";
  worlds.use(makeWorld({ [CF]: features.map((item) => item._id === builtSchool._id ? builtSchool : item), "pf2e.classes": [wizard], "pf2e.spells-srd": [forceBolt] }));
  reset();
  await createCharacterActor(schoolConcept(), resolved());
  assert.equal(created.find((item) => item.name === "Force Bolt")._stats.compendiumSource, "Compendium.pf2e.spells-srd.Item.Hu38hoAUSYeFpkVa");
  worlds.use(world);
}
{
  const focusCantrip = { _id: "focusCantrip0001", name: "Focus Cantrip", type: "spell", system: { traits: { value: ["focus", "cantrip"] }, location: { value: null } } };
  worlds.use(makeWorld({ [CF]: features, "pf2e.classes": [wizard], "pf2e.spells-srd": [focusSpell, focusCantrip] }));
  reset();
  const c = { ...concept(), focusSpells: [{ name: focusSpell.name }, { name: focusCantrip.name }] };
  await createCharacterActor(c, { ...resolved(), classDoc: { ...classDoc, name: "Champion" }, focusSpells: [
    { entry: { packId: "pf2e.spells-srd", _id: focusSpell._id } }, { entry: { packId: "pf2e.spells-srd", _id: focusCantrip._id } }
  ] }, { selectChoices: chooser([]) });
  assert.equal(created.filter((item) => item.type === "spell").length, 2);
  assert.equal(actorData.system.resources.focus.value, 1);
  worlds.use(world);
}

console.warn = warn;
assert.deepEqual(warnings.filter((line) => !/provisional native skills|character skill review/.test(line)), [],
  "only the stand-in's native-skill preview limit is warned");

console.log("pc-wizard.builder.test.mjs: Wizard bridges stage before Actor.create, master Arcane School refuses the build, and no Wizard focus entry or pool is written");
