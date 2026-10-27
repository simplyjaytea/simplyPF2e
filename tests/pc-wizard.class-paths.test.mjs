// Wizard class paths over the real PF2e 8.5.0 files in tests/fixtures/pc-wizard.
// Wizard has two level-one bridges (Arcane School, Arcane Thesis). This proves
// closed candidate discovery per bridge, staging of both bridges, validation
// of each required path against its own bridge only, the fail-closed guard on
// master's two-entry Arcane School filter, and that Fighter, Rogue and
// Investigator (real level-one data) stage exactly as before.
// Run: node tests/pc-wizard.class-paths.test.mjs
import assert from "node:assert/strict";
import { load, makeWorld, installWorld } from "./fixtures/pc-wizard/world.mjs";

const CF = "pf2e.classfeatures";
const worlds = installWorld();

const wizard = await load("wizard");
const feature = Object.fromEntries(await Promise.all([
  "wizard-spellcasting", "arcane-school", "arcane-bond", "arcane-thesis",
  "school-of-battle-magic", "school-of-mentalism", "school-of-rooted-wisdom", "school-of-unified-magical-theory",
  "spell-blending", "spell-substitution", "staff-nexus", "improved-familiar-attunement", "experimental-spellshaping"
].map(async (name) => [name, await load(name)])));
const familiar = await load("familiar");
const pet = await load("pet");
const arcaneSchoolMaster = await load("arcane-school-master");

const classFeatures = Object.values(feature);
const wizardWorld = makeWorld({ [CF]: classFeatures, "pf2e.feats-srd": [familiar, pet] });
const masterWorld = makeWorld({
  [CF]: classFeatures.map((json) => (json._id === arcaneSchoolMaster._id ? arcaneSchoolMaster : json)),
  "pf2e.feats-srd": [familiar, pet]
});
const noFamiliarWorld = makeWorld({ [CF]: classFeatures });

const { getClassPathCandidates, preflightClassPaths, stageClassPaths } = await import("../scripts/class-paths.mjs");
const { getClassFeatureCandidates } = await import("../scripts/compendium.mjs");
const { classPathBridges } = await import("../scripts/pc-identity.mjs");
const { pcSpellSlots, pcSpellcastingProfile } = await import("../scripts/pc-tables.mjs");

const SCHOOL = "Arcane School";
const THESIS = "Arcane Thesis";
const names = (list, bridge) => list.filter((candidate) => candidate.bridge === bridge).map((candidate) => candidate.name);
const classCopy = () => structuredClone(wizard);
const missing = /missing, wrong-class, or unsupported/;
const pickByLabel = (labels) => async (groups) => ({
  picks: groups.map((group) => ({
    choice: group.id,
    option: (group.options.find((option) => labels.includes(option.label)) ?? group.options[0]).id
  }))
});

// ---- The Wizard class data matches the casting model the builder already has.
worlds.use(wizardWorld);
{
  const profile = pcSpellcastingProfile(wizard);
  assert.deepEqual(profile, { mode: "prepared", ability: "int", tradition: "arcane", baseSlots: 2 },
    "Wizard has no slug at 8.5.0; the profile matches by name and publication");
  assert.deepEqual(pcSpellSlots(1, profile), { 0: 5, 1: 2, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 },
    "level 1: five cantrips and two first-rank slots, as in the class table");
  assert.deepEqual(wizard.system.keyAbility.value, ["int"]);
}

// ---- Candidate discovery: closed schools and theses per bridge.
let candidates;
{
  candidates = await getClassPathCandidates(classCopy());
  assert.deepEqual(names(candidates, SCHOOL), ["School of Battle Magic", "School of Mentalism"],
    "only closed schools (no ChoiceSet) are offered; Rooted Wisdom and Unified Magical Theory are not");
  assert.deepEqual(names(candidates, THESIS), ["Improved Familiar Attunement", "Spell Blending", "Spell Substitution", "Staff Nexus"],
    "closed theses are offered, including the familiar grant chain; Experimental Spellshaping is not");
  assert.equal(candidates.length, 6, "no candidate outside the two bridges");
  assert.deepEqual(classPathBridges(candidates), [SCHOOL, THESIS]);
  assert.ok(candidates.every((candidate) => typeof candidate.bridge === "string" && candidate.ref?.packId === CF && candidate.uuid.startsWith("Compendium.pf2e.classfeatures.Item.")));
  for (const open of ["School of Rooted Wisdom", "School of Unified Magical Theory", "Experimental Spellshaping"]) {
    assert.ok(!candidates.some((candidate) => candidate.name === open), `${open} is never offered`);
  }

  // Name-form grant uuids must resolve for Improved Familiar Attunement
  // (Familiar -> Pet); if they cannot, it fails closed rather than guessing.
  worlds.use(noFamiliarWorld);
  assert.deepEqual(names(await getClassPathCandidates(classCopy()), THESIS), ["Spell Blending", "Spell Substitution", "Staff Nexus"],
    "an unresolved grant chain removes Improved Familiar Attunement");
  worlds.use(wizardWorld);
}
const candidate = (name) => candidates.find((entry) => entry.name === name);
const mentalism = candidate("School of Mentalism");
const battleMagic = candidate("School of Battle Magic");
const staffNexus = candidate("Staff Nexus");
const spellBlending = candidate("Spell Blending");
const attunement = candidate("Improved Familiar Attunement");

// ---- Runelord and the Thassilonian school (Lost Omens Rival Academies) carry the
// school tag but are open, so they are never offered. The real 8.5.0 files are in
// the world, so only the closed-path check can be what keeps them out.
{
  const runelord = await load("runelord");
  const thassilonian = await load("school-of-thassilonian-rune-magic");
  assert.deepEqual(runelord.system.traits.otherTags, ["class-archetype", "wizard-arcane-school"]);
  worlds.use(makeWorld({ [CF]: [...classFeatures, runelord, thassilonian], "pf2e.feats-srd": [familiar, pet] }));
  const byTag = await getClassFeatureCandidates("wizard-arcane-school");
  assert.ok(byTag.some((entry) => entry.name === "Runelord"), "the school tag does select Runelord");
  const offered = await getClassPathCandidates(classCopy());
  assert.ok(!offered.some((entry) => ["Runelord", "School of Thassilonian Rune Magic"].includes(entry.name)), "Runelord is never offered");
  assert.deepEqual(names(offered, SCHOOL), ["School of Battle Magic", "School of Mentalism"], "the closed schools are unchanged");
  // Staging with Runelord present offers the chooser the same two schools only.
  const menus = [];
  await stageClassPaths(classCopy(), "class-id", {
    context: {},
    selectChoices: async (groups) => {
      menus.push(groups.map((group) => group.options.map((option) => option.label)));
      return pickByLabel([])(groups);
    }
  });
  assert.deepEqual(menus[0], [["School of Battle Magic", "School of Mentalism"]]);
  worlds.use(wizardWorld);
}

// ---- Both bridges stage, each narrowed to its own closed candidates.
{
  const classData = classCopy();
  const offers = [];
  const staged = await stageClassPaths(classData, "class-id", {
    context: {},
    selectChoices: async (groups) => {
      offers.push(groups.map((group) => group.options.map((option) => option.label)));
      return pickByLabel(["School of Mentalism", "Staff Nexus"])(groups);
    }
  });
  assert.deepEqual(staged.items.map((item) => item.name), [SCHOOL, THESIS], "both bridges are staged");
  assert.deepEqual(offers, [
    [["School of Battle Magic", "School of Mentalism"]],
    [["Improved Familiar Attunement", "Spell Blending", "Spell Substitution", "Staff Nexus"]]
  ], "each bridge offers only its own closed candidates");
  const [school, thesis] = staged.items;
  assert.equal(school.system.location, "class-id");
  assert.equal(thesis.system.location, "class-id");
  assert.equal(school.system.rules[0].selection, mentalism.uuid);
  assert.equal(thesis.system.rules[0].selection, staffNexus.uuid);
  assert.deepEqual(school.system.rules[0].choices.map((entry) => entry.label), ["School of Battle Magic", "School of Mentalism"]);
  assert.equal(school.system.rules[1].uuid, "{item|flags.system.rulesSelections.arcaneSchool}", "the real GrantItem rule is kept unchanged");
  assert.equal(thesis.system.rules[1].uuid, "{item|flags.system.rulesSelections.arcaneThesis}");
  assert.deepEqual(staged.expectedPaths.map((entry) => entry.name), ["School of Mentalism", "Staff Nexus"]);
  assert.deepEqual(Object.keys(classData.system.items).filter((id) => wizard.system.items[id].level === 1).sort(), ["13v1o", "45yt7"],
    "only the two bridge entries leave the class; Wizard Spellcasting and Arcane Bond stay native");
  assert.equal(Object.keys(classData.system.items).length, Object.keys(wizard.system.items).length - 2);
}

// ---- Required school plus required thesis validate, each against its own bridge.
{
  let chooserCalls = 0;
  const staged = await stageClassPaths(classCopy(), "class-id", {
    context: {}, requiredPaths: { [SCHOOL]: mentalism, [THESIS]: staffNexus },
    selectChoices: async () => { chooserCalls++; return { picks: [] }; }
  });
  assert.equal(staged.items[0].system.rules[0].selection, mentalism.uuid);
  assert.equal(staged.items[1].system.rules[0].selection, staffNexus.uuid);
  assert.equal(chooserCalls, 0, "a required path leaves the bounded chooser nothing to decide");
  assert.deepEqual(staged.items[0].system.rules[0].choices, [{ value: mentalism.uuid, label: "School of Mentalism" }]);

  // One required bridge leaves the other to the chooser.
  const partial = await stageClassPaths(classCopy(), "class-id", {
    context: {}, requiredPaths: { [THESIS]: spellBlending }, selectChoices: pickByLabel(["School of Battle Magic"])
  });
  assert.equal(partial.items[0].system.rules[0].selection, battleMagic.uuid);
  assert.equal(partial.items[1].system.rules[0].selection, spellBlending.uuid);

  // The familiar grant chain stages like any other closed thesis.
  const familiarThesis = await stageClassPaths(classCopy(), "class-id", {
    context: {}, requiredPaths: { [THESIS]: attunement }, selectChoices: pickByLabel([])
  });
  assert.equal(familiarThesis.items[1].system.rules[0].selection, attunement.uuid);
  assert.equal(familiarThesis.items[1].system.rules[1].preselectChoices, undefined, "no choice to pre-answer in the grant chain");
  assert.equal(familiarThesis.expectedPaths[1].name, "Improved Familiar Attunement");

  // The single-bridge alias with a bridge-labelled candidate is one per-bridge entry.
  const alias = await stageClassPaths(classCopy(), "class-id", { context: {}, requiredPath: staffNexus, selectChoices: pickByLabel([]) });
  assert.equal(alias.items[1].system.rules[0].selection, staffNexus.uuid);
}

// ---- A required path is never matched against another bridge.
{
  const stage = (options) => stageClassPaths(classCopy(), "class-id", { context: {}, selectChoices: pickByLabel([]), ...options });
  await assert.rejects(stage({ requiredPaths: { [SCHOOL]: staffNexus } }), missing, "a required thesis offered as the school fails");
  await assert.rejects(stage({ requiredPaths: { [THESIS]: mentalism } }), missing, "a required school offered as the thesis fails");
  await assert.rejects(stage({ requiredPaths: { [SCHOOL]: mentalism, [THESIS]: battleMagic } }), missing);
  await assert.rejects(stage({ requiredPath: { name: staffNexus.name, uuid: staffNexus.uuid, ref: staffNexus.ref } }), missing,
    "a bridge-less single path cannot be validated against two bridges");
  let chooserCalls = 0;
  await assert.rejects(stage({ requiredPaths: { "Arcane Major": mentalism }, selectChoices: async () => { chooserCalls++; return { picks: [] }; } }),
    /names bridge "Arcane Major", which this class does not have/);
  assert.equal(chooserCalls, 0, "an impossible requirement is refused before the chooser is asked anything");
  await assert.rejects(stage({ requiredPath: staffNexus, requiredPaths: { [THESIS]: spellBlending } }), /conflicts with the required path for "Arcane Thesis"/);
  await assert.rejects(stage({ requiredPaths: [mentalism] }), /keyed by bridge name/);
}

// ---- Fail-closed guard: master's Arcane School filter cannot be staged.
{
  worlds.use(masterWorld);
  const master = await getClassPathCandidates(classCopy());
  assert.deepEqual(classPathBridges(master), [THESIS], "master's two-entry filter is not recognized as a bridge, so no schools are offered");

  const guard = (error) => {
    assert.equal(error.message, 'simplypf2e | class path "Arcane School" has an unsupported choice shape; refusing a one-click build');
    return true;
  };
  const classData = classCopy();
  let chooserCalls = 0;
  const counting = async (groups) => { chooserCalls++; return pickByLabel([])(groups); };
  await assert.rejects(stageClassPaths(classData, "class-id", { context: {}, selectChoices: counting }), guard,
    "the unstaged Arcane School would open a native dialog after a one-click build");
  assert.equal(chooserCalls, 0, "the refusal comes before any chooser call that could spend provider tokens");
  assert.deepEqual(classData, wizard, "and before the class source is touched");
  await assert.rejects(stageClassPaths(classCopy(), "class-id", {
    context: {}, requiredPaths: { [THESIS]: staffNexus }, selectChoices: pickByLabel([])
  }), guard, "a required thesis does not hide the unstageable school");
  await assert.rejects(stageClassPaths(classCopy(), "class-id", {
    context: {}, requiredPaths: { [SCHOOL]: mentalism }, selectChoices: pickByLabel([])
  }), guard, "nor does a required school: the guard fires before any required-path error");
  worlds.use(wizardWorld);
}

// ---- Preflight: the first pass alone, with no chooser and no writes.
{
  worlds.use(wizardWorld);
  const untouched = classCopy();
  assert.deepEqual(await preflightClassPaths(untouched), [SCHOOL, THESIS], "8.5.0 Wizard: both bridges are found");
  assert.deepEqual(untouched, wizard, "the class source is not touched");
  assert.deepEqual(await preflightClassPaths({}), [], "a class source without level-one entries has nothing to refuse");
  worlds.use(masterWorld);
  await assert.rejects(preflightClassPaths(classCopy()), (error) => {
    assert.equal(error.message, "simplypf2e | class path \"Arcane School\" has an unsupported choice shape; refusing a one-click build");
    return true;
  }, "master two-entry Arcane School filter is refused up front");
  worlds.use(wizardWorld);
}

// ---- Fighter, Rogue and Investigator: real level-one data, unaffected.
{
  const precedent = Object.fromEntries(await Promise.all([
    "fighter-class", "rogue-class", "investigator-class", "reactive-strike", "shield-block", "rogues-racket", "sneak-attack",
    "surprise-attack", "thief", "on-the-case", "methodology", "devise-a-stratagem", "strategic-strike", "interrogation-methodology",
    "no-cause-for-alarm", "pointed-question"
  ].map(async (name) => [name, await load(`precedent/${name}`)])));
  worlds.use(makeWorld({
    [CF]: ["reactive-strike", "shield-block", "rogues-racket", "sneak-attack", "surprise-attack", "thief", "on-the-case", "methodology",
      "devise-a-stratagem", "strategic-strike", "interrogation-methodology"].map((name) => precedent[name]),
    "pf2e.feats-srd": [precedent["no-cause-for-alarm"]],
    "pf2e.actionspf2e": [precedent["pointed-question"]]
  }));
  const copy = (name) => structuredClone(precedent[name]);

  const fighter = copy("fighter-class");
  const fighterStaged = await stageClassPaths(fighter, "class-id", { context: {} });
  assert.deepEqual(fighterStaged, { items: [], expectedPaths: [] }, "Fighter has no bridge and nothing to refuse");
  assert.deepEqual(fighter, precedent["fighter-class"], "the Fighter class is left untouched");
  assert.deepEqual(await getClassPathCandidates(copy("fighter-class")), []);

  const rogueCandidates = await getClassPathCandidates(copy("rogue-class"));
  assert.deepEqual(rogueCandidates.map((entry) => [entry.name, entry.bridge]), [["Thief", "Rogue's Racket"]]);
  const rogue = copy("rogue-class");
  const rogueStaged = await stageClassPaths(rogue, "class-id", { context: {}, requiredPath: rogueCandidates[0] });
  assert.deepEqual(rogueStaged.items.map((item) => item.name), ["Rogue's Racket"]);
  assert.equal(rogueStaged.items[0].system.rules[0].selection, rogueCandidates[0].uuid);
  assert.deepEqual(rogueStaged.expectedPaths.map((entry) => entry.name), ["Thief"]);
  assert.equal(Object.keys(rogue.system.items).length, Object.keys(precedent["rogue-class"].system.items).length - 1,
    "Sneak Attack and Surprise Attack stay in the native class");

  const investigatorCandidates = await getClassPathCandidates(copy("investigator-class"));
  assert.deepEqual(investigatorCandidates.map((entry) => [entry.name, entry.bridge]), [["Interrogation Methodology", "Methodology"]]);
  const investigator = copy("investigator-class");
  const investigatorStaged = await stageClassPaths(investigator, "class-id", { context: {}, selectChoices: pickByLabel([]) });
  assert.deepEqual(investigatorStaged.items.map((item) => item.name), ["Methodology"]);
  assert.equal(Object.keys(investigator.system.items).length, Object.keys(precedent["investigator-class"].system.items).length - 1,
    "On the Case, Devise a Stratagem and Strategic Strike stay in the native class");

  // The preflight finds the same bridges without staging anything.
  assert.deepEqual(await preflightClassPaths(copy("fighter-class")), [], "Fighter has no bridge");
  assert.deepEqual(await preflightClassPaths(copy("rogue-class")), ["Rogue's Racket"]);
  assert.deepEqual(await preflightClassPaths(copy("investigator-class")), ["Methodology"]);
  // Thief is the only Rogue's Racket candidate: without it the bridge is refused up front.
  worlds.use(makeWorld({ [CF]: [precedent["rogues-racket"], precedent["sneak-attack"], precedent["surprise-attack"], precedent["reactive-strike"], precedent["shield-block"]] }));
  await assert.rejects(preflightClassPaths(copy("rogue-class")), { message: `simplypf2e | no fully resolvable enabled class paths for "Rogue's Racket"` },
    "a Rogue with no closed Rogue's Racket candidate is refused before any provider call");
}

// ---- The decision is the feature's shape, not the class's name: any class
// that leaves a level-one ChoiceSet unstaged is refused.
{
  const sneak = await load("precedent/sneak-attack");
  const withChoice = structuredClone(sneak);
  withChoice.system.rules = [{ key: "ChoiceSet", flag: "grade", choices: [{ value: "a", label: "A" }, { value: "b", label: "B" }] }];
  worlds.use(makeWorld({ [CF]: [withChoice] }));
  await assert.rejects(stageClassPaths({ system: { items: { one: { level: 1, uuid: `Compendium.${CF}.Item.${sneak._id}` } } } }, "class-id", { context: {} }),
    /class path "Sneak Attack" has an unsupported choice shape; refusing a one-click build/);
  worlds.use(makeWorld({ [CF]: [sneak] }));
  assert.deepEqual(await stageClassPaths({ system: { items: { one: { level: 1, uuid: `Compendium.${CF}.Item.${sneak._id}` } } } }, "class-id", { context: {} }),
    { items: [], expectedPaths: [] }, "the same feature with its real, choice-free rules stays native");
  const sneakClass = { system: { items: { one: { level: 1, uuid: `Compendium.${CF}.Item.${sneak._id}` } } } };
  assert.deepEqual(await preflightClassPaths(sneakClass), [], "the choice-free feature passes the preflight");
  worlds.use(makeWorld({ [CF]: [withChoice] }));
  await assert.rejects(preflightClassPaths(sneakClass), /class path "Sneak Attack" has an unsupported choice shape; refusing a one-click build/,
    "the preflight refuses the same shape that stageClassPaths refuses");
}

// ---- Preflight refuses a bridge with no fully resolvable enabled candidate. Only
// open schools remain (Rooted Wisdom, Unified Magical Theory), or no thesis closes:
// the class is refused before any chooser call or provider spend.
{
  const without = (...names) => makeWorld({ [CF]: classFeatures.filter((json) => !names.includes(json.name)), "pf2e.feats-srd": [familiar, pet] });
  const refusal = (bridge) => ({ message: `simplypf2e | no fully resolvable enabled class paths for "${bridge}"` });
  worlds.use(without("School of Battle Magic", "School of Mentalism"));
  const untouched = classCopy();
  await assert.rejects(preflightClassPaths(untouched), refusal(SCHOOL), "only open schools remain: the class is refused");
  assert.deepEqual(untouched, wizard, "the refusal leaves the class source untouched");
  worlds.use(without("Spell Blending", "Spell Substitution", "Staff Nexus", "Improved Familiar Attunement"));
  await assert.rejects(preflightClassPaths(classCopy()), refusal(THESIS), "no closed thesis remains: the class is refused");
  // The build refuses the same bridge before the chooser is asked about the school.
  let chooserCalls = 0;
  await assert.rejects(stageClassPaths(classCopy(), "class-id", {
    context: {}, selectChoices: async () => { chooserCalls++; return { picks: [] }; }
  }), refusal(THESIS));
  assert.equal(chooserCalls, 0, "no chooser call, and so no provider spend, before the refusal");
  worlds.use(wizardWorld);
}

console.log("pc-wizard.class-paths.test.mjs: per-bridge discovery, staging, required-path isolation and the bridge guard passed");
