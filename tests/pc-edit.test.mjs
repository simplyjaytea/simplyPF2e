// PC editing contract (C05): exact candidate edits, invalidation, deferred
// spell refusal, and in-memory completion. Services are injected so the test
// needs no Foundry world; candidates are issued through the real registry.

import assert from "node:assert/strict";

const { applyPCEdit, validatePCEditCompletion, PC_EDIT_CODES } = await import("../scripts/pc-edit.mjs");
const { issueCandidate } = await import("../scripts/compendium.mjs");

const ref = (id) => ({ packId: "test.pack", _id: id });
const candidate = (id, name, extra = {}) => issueCandidate({ packId: "test.pack", _id: id }, { name, ...extra });
const doc = (type, name, system = {}) => ({ type, name, uuid: `Compendium.test.pack.${type}.${name}`, system });

const fighter = doc("class", "Fighter", { keyAbility: { value: ["str"] } });
const rogue = doc("class", "Rogue", { keyAbility: { value: ["dex"] } });
const human = doc("ancestry", "Human", { slug: "human" });
const docsById = new Map([
  ["test.pack:fighter", fighter], ["test.pack:rogue", rogue],
  ["test.pack:human", human], ["test.pack:bg", doc("background", "Acolyte")]
]);

const classCandidate = (id, name) => candidate(id, name);
const catalogs = {
  class: [classCandidate("fighter", "Fighter"), classCandidate("rogue", "Rogue")],
  ancestry: [candidate("human", "Human")],
  background: [candidate("bg", "Acolyte")],
  equipment: [candidate("sword", "Longsword", { value: 15 }), candidate("shield", "Shield", { value: 10 })]
};

const featSlot = (candidates) => ({ type: "class", level: 1, archetype: false, candidates });
const attack = candidate("attack", "Power Attack");
const block = candidate("block", "Shield Block");
const slotCandidates = [attack, block];

function basePlan(overrides = {}) {
  return {
    concept: {
      level: 1, ancestry: "Human", ancestryCandidate: ref("human"),
      background: "Acolyte", backgroundCandidate: ref("bg"),
      class: "Fighter", classCandidate: ref("fighter"),
      heritage: null, heritageCandidate: null,
      keyAbility: "str", traits: ["human", "fighter"],
      spellcasting: null, focusSpells: [],
      equipment: [{ name: "Longsword", quantity: 1, value: 15, candidate: ref("sword") }],
      requiredIdentity: {}
    },
    resolved: {
      ancestryDoc: human, heritageDoc: null, backgroundDoc: docsById.get("test.pack:bg"),
      backgroundLore: [], classDoc: fighter, spells: [], focusSpells: [],
      featSlots: [featSlot(slotCandidates)],
      feats: [{ type: "class", level: 1, archetype: false, name: "Power Attack", entry: ref("attack") }],
      equipment: [{ name: "Longsword", quantity: 1, value: 15, runes: {}, entry: ref("sword") }],
      loot: []
    },
    pending: [],
    ...overrides
  };
}

const services = {
  load: async (entry) => docsById.get(`${entry?.packId}:${entry?._id}`) ?? null,
  classPaths: async () => [],
  recompute: async (concept) => ({
    ancestryDoc: human,
    heritageDoc: null,
    backgroundDoc: docsById.get("test.pack:bg"),
    backgroundLore: [],
    classDoc: concept.class === "Rogue" ? rogue : fighter,
    featSlots: [featSlot(slotCandidates)]
  }),
  resolveEquipmentLine: async (concept) => concept.equipment.map((line) => ({
    name: line.name, quantity: line.quantity, value: line.value, runes: {}, entry: line.candidate
  })),
  equipmentValue: async (equipment) => equipment.reduce((sum, line) => sum + (line.entry ? 15 : 0), 0)
};

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error.code === code);
}

// Feat swap: offered candidate replaces the pick; input plan is untouched.
{
  const plan = basePlan();
  const result = await applyPCEdit(plan, { field: "feat", slot: 0, key: "test.pack:block" }, { services, catalogs });
  assert.deepEqual(result.changed, ["feat:0"]);
  assert.equal(result.plan.resolved.feats[0].name, "Shield Block");
  assert.equal(plan.resolved.feats[0].name, "Power Attack", "input plan must not mutate");
}

// Non-offered feat key is refused; spells are deferred.
{
  await expectCode(applyPCEdit(basePlan(), { field: "feat", slot: 0, key: "test.pack:nope" }, { services, catalogs }), PC_EDIT_CODES.INVALID);
  await expectCode(applyPCEdit(basePlan(), { field: "spells" }, { services, catalogs }), PC_EDIT_CODES.DEFERRED);
  await expectCode(applyPCEdit(basePlan(), { field: "focusSpells" }, { services, catalogs }), PC_EDIT_CODES.DEFERRED);
}

// Equipment swap resolves the exact entry and recomputes gp value.
{
  const result = await applyPCEdit(basePlan(), { field: "equipment", index: 0, key: "test.pack:shield" }, { services, catalogs });
  assert.equal(result.plan.concept.equipment[0].name, "Shield");
  assert.equal(result.plan.resolved.equipment[0].entry._id, "shield");
  assert.equal(result.equipmentGp, 15);
}

// Class change drops the path/key ability that no longer fit and blocks completion.
{
  const result = await applyPCEdit(basePlan(), { field: "class", key: "test.pack:rogue" }, { services, catalogs });
  assert.equal(result.plan.pending.some((item) => item.field === "keyAbility"), true);
  assert.equal(result.invalidated.some((item) => item.field === "keyAbility"), true);
  assert.equal(validatePCEditCompletion(result.plan).complete, false);

  const fixed = await applyPCEdit(result.plan, { field: "keyAbility", value: "dex" }, { services, catalogs });
  assert.equal(fixed.plan.concept.keyAbility, "dex");
  assert.deepEqual(fixed.plan.pending, []);
  assert.equal(fixed.plan.resolved.classDoc.name, "Rogue");
}

// Key ability must belong to the current class.
{
  await expectCode(applyPCEdit(basePlan(), { field: "keyAbility", value: "dex" }, { services, catalogs }), PC_EDIT_CODES.INVALID);
}

// Background lore is refused for backgrounds without a lore choice.
{
  await expectCode(applyPCEdit(basePlan(), { field: "backgroundLore", value: "legal" }, { services, catalogs }), PC_EDIT_CODES.INVALID);
}

// Completion is validated in memory and reports pending choices.
{
  const complete = validatePCEditCompletion(basePlan());
  assert.equal(complete.pending.length, 0);
  assert.equal(complete.errors.length, 0);
  const pending = validatePCEditCompletion(basePlan({ pending: [{ field: "heritage", reason: "re-pick" }] }));
  assert.equal(pending.complete, false);
  assert.equal(pending.pending[0].field, "heritage");
}

// Class paths of a multi-bridge class (Wizard): one edit per bridge, offered only
// from that bridge's candidates, kept in concept.classPaths / requiredIdentity.classPaths.
{
  const path = (id, name, bridge) => candidate(id, name, { bridge });
  const wizardPaths = [
    path("school-a", "School of Mentalism", "Arcane School"), path("school-b", "School of Battle Magic", "Arcane School"),
    path("thesis-a", "Staff Nexus", "Arcane Thesis"), path("thesis-b", "Spell Blending", "Arcane Thesis")
  ];
  const wizardServices = { ...services, classPaths: async () => wizardPaths };
  const SCHOOL = "Arcane School";
  const THESIS = "Arcane Thesis";
  const edit = (plan, bridge, key) => applyPCEdit(plan, { field: "classPath", bridge, key }, { services: wizardServices, catalogs });
  const plan = basePlan();

  const withSchool = await edit(plan, SCHOOL, "test.pack:school-a");
  assert.deepEqual(withSchool.changed, ["classPath.Arcane School"]);
  assert.deepEqual(withSchool.plan.concept.classPaths, { [SCHOOL]: "School of Mentalism" });
  assert.deepEqual(withSchool.plan.concept.classPathCandidates, { [SCHOOL]: ref("school-a") });
  assert.equal(withSchool.plan.concept.requiredIdentity.classPaths[SCHOOL].name, "School of Mentalism");
  assert.equal(Object.hasOwn(withSchool.plan.concept, "classPath"), false, "the single alias is not written for a bridge edit");
  assert.equal(plan.concept.classPaths, undefined, "input plan must not mutate");
  assert.equal(plan.concept.requiredIdentity.classPaths, undefined);

  const both = await edit(withSchool.plan, THESIS, "test.pack:thesis-b");
  assert.deepEqual(both.plan.concept.classPaths, { [SCHOOL]: "School of Mentalism", [THESIS]: "Spell Blending" }, "editing one bridge keeps the other");
  assert.deepEqual(Object.keys(both.plan.concept.requiredIdentity.classPaths), [SCHOOL, THESIS]);
  assert.equal(withSchool.plan.concept.classPaths[THESIS], undefined, "the earlier plan is not mutated");
  assert.equal(validatePCEditCompletion(both.plan).errors.length, 0, "the edited identity satisfies the required identity");

  const swapped = await edit(both.plan, SCHOOL, "test.pack:school-b");
  assert.equal(swapped.plan.concept.classPaths[SCHOOL], "School of Battle Magic");
  assert.equal(swapped.plan.concept.classPaths[THESIS], "Spell Blending");
  const unchanged = await edit(both.plan, SCHOOL, "test.pack:school-a");
  assert.deepEqual(unchanged.changed, []);

  const cleared = await edit(both.plan, SCHOOL, null);
  assert.deepEqual(cleared.plan.concept.classPaths, { [THESIS]: "Spell Blending" }, "clearing a bridge removes only that bridge");
  assert.deepEqual(Object.keys(cleared.plan.concept.requiredIdentity.classPaths), [THESIS]);
  const none = await edit(cleared.plan, THESIS, null);
  assert.equal(none.plan.concept.classPaths, undefined);
  assert.equal(none.plan.concept.classPathCandidates, undefined);
  assert.equal(none.plan.concept.requiredIdentity.classPaths, undefined, "an empty requirement map is dropped");

  // A path is never taken from another bridge, and the bridge must be named.
  await expectCode(edit(plan, SCHOOL, "test.pack:thesis-a"), PC_EDIT_CODES.INVALID);
  await expectCode(edit(plan, THESIS, "test.pack:school-a"), PC_EDIT_CODES.INVALID);
  await expectCode(edit(plan, "Arcane Major", "test.pack:school-a"), PC_EDIT_CODES.INVALID);
  await expectCode(applyPCEdit(plan, { field: "classPath", key: "test.pack:school-a" }, { services: wizardServices, catalogs }), PC_EDIT_CODES.INVALID);
  await expectCode(applyPCEdit(plan, { field: "heritage", bridge: SCHOOL, key: null }, { services: wizardServices, catalogs }), PC_EDIT_CODES.INVALID);
  await expectCode(edit(plan, "", "test.pack:school-a"), PC_EDIT_CODES.INVALID);

  // A single-bridge class keeps the unchanged bridge-less edit.
  const oneBridge = { ...services, classPaths: async () => [path("racket", "Thief", "Rogue's Racket")] };
  const single = await applyPCEdit(plan, { field: "classPath", key: "test.pack:racket" }, { services: oneBridge, catalogs });
  assert.equal(single.plan.concept.classPath, "Thief");
  assert.equal(single.plan.concept.requiredIdentity.classPath.name, "Thief");
  assert.equal(single.plan.concept.classPaths, undefined);

  // A per-bridge choice supersedes a single alias for the same bridge.
  const aliased = await applyPCEdit(plan, { field: "classPath", key: "test.pack:thesis-a" }, { services: { ...services, classPaths: async () => [wizardPaths[2]] }, catalogs });
  const superseded = await edit(aliased.plan, THESIS, "test.pack:thesis-b");
  assert.equal(superseded.plan.concept.classPath, undefined);
  assert.equal(superseded.plan.concept.requiredIdentity.classPath, undefined);
  assert.equal(superseded.plan.concept.classPaths[THESIS], "Spell Blending");

  // Spell-bearing characters defer every identity edit, including a bridge.
  await expectCode(edit(basePlan({ resolved: { ...basePlan().resolved, spells: [{ entry: ref("x") }] } }), SCHOOL, "test.pack:school-a"), PC_EDIT_CODES.DEFERRED);

  // Changing the class drops every path choice, one invalidation per cleared choice.
  const classChanged = await applyPCEdit(both.plan, { field: "class", key: "test.pack:rogue" }, { services: wizardServices, catalogs });
  const concept = classChanged.plan.concept;
  assert.equal(concept.classPaths, undefined);
  assert.equal(concept.classPathCandidates, undefined);
  assert.equal(concept.requiredIdentity.classPaths, undefined);
  assert.deepEqual(classChanged.invalidated.filter((item) => item.field === "classPath").map((item) => item.bridge), [SCHOOL, THESIS]);
  assert.equal(both.plan.concept.classPaths[SCHOOL], "School of Mentalism", "the earlier plan is not mutated");

  // Completion notices a concept that drifted from its required bridge choice.
  const drifted = structuredClone(both.plan);
  drifted.concept.classPaths[SCHOOL] = "Staff Nexus";
  assert.ok(validatePCEditCompletion(drifted).errors.some((message) => /Class path/.test(message)));
}

// A class edit into a spellcasting class is refused until spell editing exists:
// the character would be a caster with no spells while the plan still read as complete.
{
  const { load } = await import("./fixtures/pc-wizard/world.mjs");
  const wizardJson = await load("wizard");
  docsById.set("test.pack:wizard", doc("class", "Wizard", wizardJson.system));
  docsById.set("test.pack:oddcaster", doc("class", "Rogue", { keyAbility: { value: ["dex"] }, spellcasting: 1 }));
  const casterCatalogs = { ...catalogs, class: [...catalogs.class, classCandidate("wizard", "Wizard")] };
  const plan = basePlan();
  await assert.rejects(applyPCEdit(plan, { field: "class", key: "test.pack:wizard" }, { services, catalogs: casterCatalogs }), (error) => {
    assert.equal(error.code, PC_EDIT_CODES.DEFERRED);
    assert.equal(error.field, "class");
    assert.match(error.message, /"Wizard" casts spells; spell editing is deferred, so the class cannot change to a spellcasting class/);
    return true;
  }, "the real Wizard class data (spellcasting 1) is refused");
  assert.equal(plan.concept.class, "Fighter", "the plan is untouched");
  const odd = { ...casterCatalogs, class: [...casterCatalogs.class, classCandidate("oddcaster", "Rogue")] };
  await expectCode(applyPCEdit(plan, { field: "class", key: "test.pack:oddcaster" }, { services, catalogs: odd }), PC_EDIT_CODES.DEFERRED);
  const rogueEdit = await applyPCEdit(plan, { field: "class", key: "test.pack:rogue" }, { services, catalogs: casterCatalogs });
  assert.equal(rogueEdit.plan.resolved.classDoc.name, "Rogue", "a class without spellcasting still edits");
}

// The caster test the editor's class control shares: real Wizard data (spellcasting 1)
// casts, real Fighter data (spellcasting 0) does not.
{
  const { classCastsSpells } = await import("../scripts/pc-edit.mjs");
  const { load } = await import("./fixtures/pc-wizard/world.mjs");
  assert.equal(classCastsSpells(await load("wizard")), true);
  assert.equal(classCastsSpells(await load("precedent/fighter-class")), false);
}

// A bridge-less clear removes every path choice, in the concept and in the required
// identity alike (it used to wipe the required map and leave the school and thesis).
{
  const path = (id, name, bridge) => candidate(id, name, { bridge });
  const school = path("school-a", "School of Mentalism", "Arcane School");
  const thesis = path("thesis-a", "Staff Nexus", "Arcane Thesis");
  const wizardPlan = () => {
    const plan = basePlan();
    Object.assign(plan.concept, {
      classPath: "Staff Nexus", classPathCandidate: thesis.ref,
      classPaths: { "Arcane School": "School of Mentalism", "Arcane Thesis": "Staff Nexus" },
      classPathCandidates: { "Arcane School": school.ref, "Arcane Thesis": thesis.ref },
      requiredIdentity: { classPath: thesis, classPaths: { "Arcane School": school, "Arcane Thesis": thesis } }
    });
    return plan;
  };
  const clear = (plan) => applyPCEdit(plan, { field: "classPath", key: null }, { services, catalogs });
  const assertCleared = (result) => {
    assert.deepEqual(result.changed, ["classPath"]);
    for (const field of ["classPath", "classPathCandidate", "classPaths", "classPathCandidates"]) {
      assert.equal(Object.hasOwn(result.plan.concept, field), false, `concept.${field} is cleared`);
    }
    for (const field of ["classPath", "classPaths"]) {
      assert.equal(Object.hasOwn(result.plan.concept.requiredIdentity, field), false, `requiredIdentity.${field} is cleared`);
    }
    assert.deepEqual(validatePCEditCompletion(result.plan).errors, [], "concept and required identity agree");
  };
  const input = wizardPlan();
  assertCleared(await clear(input));
  assert.equal(input.concept.classPaths["Arcane School"], "School of Mentalism", "the input plan is not mutated");
  assert.equal(input.concept.requiredIdentity.classPaths["Arcane Thesis"].name, "Staff Nexus");

  // Only per-bridge choices remain (no single alias): the clear still applies.
  const bridgesOnly = wizardPlan();
  for (const field of ["classPath", "classPathCandidate"]) delete bridgesOnly.concept[field];
  delete bridgesOnly.concept.requiredIdentity.classPath;
  assertCleared(await clear(bridgesOnly));

  // Nothing to clear is still a no-op.
  assert.deepEqual((await clear(basePlan())).changed, []);
}

// Spellcasting archetype (W3): the dedication owns an entry and a spellbook, and spell editing is deferred, so the
// editor refuses to add, replace or remove a caster archetype feat, refuses identity edits once the plan exists,
// and completion flags a plan that disagrees with the feats.
{
  const wizardDedication = candidate("wizded", "Wizard Dedication");
  const archetypePlan = (level = 2) => {
    const plan = basePlan();
    plan.concept.level = level;
    plan.concept.archetypeSpellcasting = { pkg: "wizard", tradition: "arcane", plannedPicks: { 0: 4 }, maxRank: 0, spells: [] };
    plan.resolved.archetypeSpells = [];
    plan.resolved.featSlots = [featSlot([attack, block, wizardDedication])];
    plan.resolved.feats = [{ type: "class", level: 1, archetype: false, name: "Wizard Dedication", entry: ref("wizded") }];
    return plan;
  };
  // Replacing the dedication, and adding one, are both refused.
  await expectCode(applyPCEdit(archetypePlan(), { field: "feat", slot: 0, key: "test.pack:block" }, { services, catalogs }), PC_EDIT_CODES.DEFERRED);
  await expectCode(applyPCEdit(basePlan(), { field: "feat", slot: 0, key: "test.pack:wizded" }, { services, catalogs }), PC_EDIT_CODES.INVALID);
  const offered = basePlan();
  offered.resolved.featSlots = [featSlot([attack, block, wizardDedication])];
  await expectCode(applyPCEdit(offered, { field: "feat", slot: 0, key: "test.pack:wizded" }, { services, catalogs }), PC_EDIT_CODES.DEFERRED);
  // An unrelated feat edit on a plan without an archetype still works.
  assert.deepEqual((await applyPCEdit(basePlan(), { field: "feat", slot: 0, key: "test.pack:block" }, { services, catalogs })).changed, ["feat:0"]);
  // Identity edits are spell-affecting once the plan exists.
  await expectCode(applyPCEdit(archetypePlan(), { field: "class", key: "test.pack:rogue" }, { services, catalogs }), PC_EDIT_CODES.DEFERRED);
  const flexibleKey = archetypePlan();
  flexibleKey.resolved.classDoc = doc("class", "Fighter", { keyAbility: { value: ["str", "dex"] } });
  await expectCode(applyPCEdit(flexibleKey, { field: "keyAbility", value: "dex" }, { services, catalogs }), PC_EDIT_CODES.DEFERRED);
  // Equipment edits stay available.
  assert.deepEqual((await applyPCEdit(archetypePlan(), { field: "equipment", index: 0, key: "test.pack:shield" }, { services, catalogs })).changed, ["equipment:0"]);
  // Completion: a plan that matches the held feats passes the consistency check; a mismatch is an error.
  const matching = validatePCEditCompletion(archetypePlan());
  assert.ok(!matching.errors.some((line) => /archetype/.test(line)), "plan and feats agree");
  const noFeat = archetypePlan();
  noFeat.resolved.feats = [{ type: "class", level: 1, archetype: false, name: "Power Attack", entry: ref("attack") }];
  assert.ok(validatePCEditCompletion(noFeat).errors.some((line) => /spellcasting archetype feats and the archetype spell plan disagree/.test(line)),
    "a plan without its dedication is an error");
  const noPlan = archetypePlan();
  noPlan.concept.archetypeSpellcasting = null;
  assert.ok(validatePCEditCompletion(noPlan).errors.some((line) => /disagree/.test(line)), "a dedication without its plan is an error");
  const wrongPicks = archetypePlan();
  wrongPicks.concept.archetypeSpellcasting.plannedPicks = { 0: 2 };
  assert.ok(validatePCEditCompletion(wrongPicks).errors.some((line) => /disagree/.test(line)), "stale picks are an error");
}

// Bard muse (feat/bard-archetype): the archetype ChoiceSet is an editable value; only an eligible answer is accepted, nothing
// else is recomputed, and an invalid or missing answer blocks completion.
{
  const museOptions = [{ value: "enigma", label: "Enigma" }, { value: "maestro", label: "Maestro" }, { value: "warrior", label: "Warrior" }];
  const bardPlan = (value = "maestro") => {
    const plan = basePlan();
    plan.concept.level = 2;
    plan.concept.archetypeSpellcasting = { pkg: "bard", tradition: "occult", plannedPicks: { 0: 2 }, maxRank: 0, spells: [],
      choice: { flag: "dedicationMuse", labelKey: "k", options: museOptions, value } };
    plan.resolved.archetypeSpells = [];
    const bardDedication = candidate("barded", "Bard Dedication");
    plan.resolved.featSlots = [featSlot([attack, block, bardDedication])];
    plan.resolved.feats = [{ type: "class", level: 1, archetype: false, name: "Bard Dedication", entry: ref("barded") }];
    return plan;
  };
  const edited = await applyPCEdit(bardPlan(), { field: "archetypeChoice", value: "warrior" }, { services, catalogs });
  assert.deepEqual(edited.changed, ["archetypeChoice"]);
  assert.equal(edited.plan.concept.archetypeSpellcasting.choice.value, "warrior");
  assert.equal(bardPlan().concept.archetypeSpellcasting.choice.value, "maestro", "the input plan is not mutated");
  const original = bardPlan();
  const again = await applyPCEdit(original, { field: "archetypeChoice", value: "warrior" }, { services, catalogs });
  assert.equal(original.concept.archetypeSpellcasting.choice.value, "maestro");
  assert.equal(again.plan.concept.archetypeSpellcasting.choice.value, "warrior");
  assert.deepEqual((await applyPCEdit(bardPlan(), { field: "archetypeChoice", value: "maestro" }, { services, catalogs })).changed, [], "an unchanged answer is a no-op");
  await expectCode(applyPCEdit(bardPlan(), { field: "archetypeChoice", value: "not-a-muse" }, { services, catalogs }), PC_EDIT_CODES.INVALID);
  await expectCode(applyPCEdit(bardPlan(), { field: "archetypeChoice", value: 5 }, { services, catalogs }), PC_EDIT_CODES.INVALID);
  await expectCode(applyPCEdit(basePlan(), { field: "archetypeChoice", value: "maestro" }, { services, catalogs }), PC_EDIT_CODES.INVALID);
  // Completion: a valid answer passes the check; a missing or ineligible one is an error.
  assert.ok(!validatePCEditCompletion(bardPlan()).errors.some((line) => /choice/.test(line)));
  assert.ok(validatePCEditCompletion(bardPlan(null)).errors.some((line) => /archetype choice is missing or not eligible/.test(line)));
  assert.ok(validatePCEditCompletion(bardPlan("bogus")).errors.some((line) => /archetype choice is missing or not eligible/.test(line)));
  // The Bard dedication is still a caster feat: it cannot be swapped away.
  await expectCode(applyPCEdit(bardPlan(), { field: "feat", slot: 0, key: "test.pack:block" }, { services, catalogs }), PC_EDIT_CODES.DEFERRED);
}

console.log("pc-edit tests passed");
