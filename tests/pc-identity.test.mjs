import assert from "node:assert/strict";
import { classPathBridges, pcIdentityKey, resolvePCIdentity, applyPCIdentity, assertPCIdentity } from "../scripts/pc-identity.mjs";

const candidate = (name, packId, _id) => ({ name, ref: { packId, _id }, uuid: `Compendium.${packId}.Item.${_id}` });
const catalogs = {
  ancestry: [candidate("Human", "ancestries", "human"), candidate("Android", "ancestries", "android")],
  heritage: [candidate("Skilled Human", "heritages", "skilled-human")],
  background: [candidate("Guard", "pf2e.backgrounds", "6UmhTxOQeqFnppxx")],
  class: [candidate("Rogue", "classes", "rogue"), candidate("Fighter", "classes", "fighter")],
  classPath: [candidate("Thief", "class-features", "thief")]
};
const guardLore = { backgroundLore: "legal" };
const key = (field, index = 0) => pcIdentityKey(catalogs[field][index]);
const error = (fn, code, field) => assert.throws(fn, (caught) => {
  assert.equal(caught.code, code);
  assert.equal(caught.field, field);
  return true;
});

assert.equal(pcIdentityKey(catalogs.class[0]), "classes:rogue");
assert.equal(pcIdentityKey({ name: "bad" }), "");
assert.equal(pcIdentityKey({ ref: { packId: "", _id: "x" } }), "");

const required = resolvePCIdentity({ choices: { name: "Mira", class: key("class") }, catalogs });
assert.deepEqual(required, { name: "Mira", class: catalogs.class[0] });
assert.deepEqual(resolvePCIdentity({ choices: { class: key("class") }, catalogs }), { class: catalogs.class[0] });
assert.deepEqual(resolvePCIdentity({ choices: { heritage: "none" }, catalogs }), { heritage: null });
assert.deepEqual(resolvePCIdentity({ choices: { class: key("class") }, prompt: "A Rogue opponent", catalogs }), { class: catalogs.class[0] },
  "an explicit field control resolves prose ambiguity for that field");

const declared = resolvePCIdentity({
  prompt: "Name: Mira; Class: Rogue; Ancestry: Human; Heritage: none; Background: Guard; Key ability: Dexterity; Racket: Thief",
  catalogs
});
assert.equal(declared.name, "Mira");
assert.equal(declared.keyAbility, "dex");
assert.equal(declared.classPath, catalogs.classPath[0]);
assert.equal(declared.heritage, null);

error(() => resolvePCIdentity({ choices: { class: "classes:missing" }, catalogs }), "PC_IDENTITY_UNKNOWN", "class");
assert.deepEqual(resolvePCIdentity({ choices: { classPath: key("classPath") }, catalogs }), { classPath: catalogs.classPath[0] },
  "path identity remains a stable key; its required class relation is enforced by the caller");
assert.equal(resolvePCIdentity({ choices: { background: key("background"), backgroundLore: "warfare" }, catalogs }).backgroundLore, "warfare");
assert.equal(resolvePCIdentity({ prompt: "Background: Guard; Background Lore: Legal Lore", catalogs }).backgroundLore, "legal");
error(() => resolvePCIdentity({ choices: { backgroundLore: "arcana" }, catalogs }), "PC_IDENTITY_CONTROL", "backgroundLore");
error(() => resolvePCIdentity({ choices: { background: key("background"), backgroundLore: "Legal Lore" }, catalogs }), "PC_IDENTITY_CONTROL", "backgroundLore");
assert.throws(() => resolvePCIdentity({ prompt: "Class: NotInstalled", catalogs }), (caught) => {
  assert.equal(caught.code, "PC_IDENTITY_UNKNOWN");
  assert.equal(caught.field, "class");
  assert.match(caught.message, /^Required character choices \(Class\):/);
  assert.doesNotMatch(caught.message, /PC_IDENTITY_/);
  return true;
});
error(() => resolvePCIdentity({ prompt: "Class: Rogue; Class: Rogue", catalogs }), "PC_IDENTITY_DUPLICATE", "class");
error(() => resolvePCIdentity({ prompt: "Class: Rogue", choices: { class: key("class", 1) }, catalogs }), "PC_IDENTITY_CONFLICT", "class");

const duplicateCatalogs = { ...catalogs, class: [...catalogs.class, candidate("Rogue", "other-classes", "rogue")] };
error(() => resolvePCIdentity({ prompt: "Class: Rogue", catalogs: duplicateCatalogs }), "PC_IDENTITY_DUPLICATE", "class");
error(() => resolvePCIdentity({ prompt: "I want a Rogue, perhaps Fighter", catalogs }), "PC_IDENTITY_AMBIGUOUS", "class");
error(() => resolvePCIdentity({ prompt: "I am not Human", catalogs }), "PC_IDENTITY_AMBIGUOUS", "ancestry");
error(() => resolvePCIdentity({ prompt: "My history mentions Human", catalogs }), "PC_IDENTITY_AMBIGUOUS", "ancestry");
error(() => resolvePCIdentity({ prompt: "A character called Mira has Dexterity", catalogs }), "PC_IDENTITY_AMBIGUOUS", "name");
error(() => resolvePCIdentity({ prompt: "A Human heritage", catalogs }), "PC_IDENTITY_AMBIGUOUS", "ancestry");
assert.deepEqual(resolvePCIdentity({ prompt: "A quiet traveler with no identity request", catalogs }), {});
error(() => resolvePCIdentity({ prompt: "Class: NotInstalled", choices: { class: key("class") }, catalogs }), "PC_IDENTITY_UNKNOWN", "class");
assert.deepEqual(resolvePCIdentity({ prompt: "Class: Rogue", choices: { class: key("class") }, catalogs, isRandom: true }), {});

const identity = resolvePCIdentity({ choices: { name: "<Mira>", keyAbility: "dex", ancestry: key("ancestry"), heritage: "none", class: key("class") }, catalogs });
const concept = { name: "old", keyAbility: "str", requiredIdentity: "preserve" };
assert.equal(applyPCIdentity(concept, identity), concept);
assert.equal(concept.name, "<Mira>", "HTML-like names remain raw until the renderer escapes them");
assert.equal(concept.ancestryCandidate, catalogs.ancestry[0].ref);
assert.equal(concept.heritage, null);
assert.equal(concept.heritageCandidate, null);
assert.equal(concept.requiredIdentity, "preserve");
assert.equal(assertPCIdentity(concept, identity), true);
error(() => assertPCIdentity({ ...concept, ancestry: "Android" }, identity), "PC_IDENTITY_ASSERT", "ancestry");
error(() => assertPCIdentity({ ...concept, heritage: undefined }, identity), "PC_IDENTITY_ASSERT", "heritage");

// Per-bridge class paths (Wizard): one required path per bridge, keyed by the
// bridge feature's name; the single `classPath` stays for one-bridge classes.
const pathCandidate = (name, bridge, id) => ({ ...candidate(name, "class-features", id), bridge });
const wizardPaths = {
  ...catalogs,
  class: [...catalogs.class, candidate("Wizard", "classes", "wizard")],
  classPath: [
    pathCandidate("School of Mentalism", "Arcane School", "mentalism"),
    pathCandidate("School of Battle Magic", "Arcane School", "battle-magic"),
    pathCandidate("Staff Nexus", "Arcane Thesis", "staff-nexus"),
    pathCandidate("Spell Blending", "Arcane Thesis", "spell-blending")
  ]
};
const [mentalism, battleMagic, staffNexus, spellBlending] = wizardPaths.classPath;
const wizardKey = pcIdentityKey(wizardPaths.class[2]);
assert.deepEqual(classPathBridges(wizardPaths.classPath), ["Arcane School", "Arcane Thesis"]);
assert.deepEqual(classPathBridges([candidate("Thief", "class-features", "thief")]), [], "a candidate without a bridge name has no bridge");
assert.deepEqual(classPathBridges(undefined), []);

const perBridge = resolvePCIdentity({
  choices: { class: wizardKey, classPaths: { "Arcane School": pcIdentityKey(mentalism), "Arcane Thesis": pcIdentityKey(staffNexus) } },
  catalogs: wizardPaths
});
assert.deepEqual(perBridge.classPaths, { "Arcane School": mentalism, "Arcane Thesis": staffNexus });
assert.equal(Object.hasOwn(perBridge, "classPath"), false, "the single alias is not invented");
assert.deepEqual(resolvePCIdentity({ choices: { classPaths: { "Arcane School": "", "Arcane Thesis": pcIdentityKey(spellBlending) } }, catalogs: wizardPaths }),
  { classPaths: { "Arcane Thesis": spellBlending } }, "an empty control leaves its bridge unconstrained");
assert.deepEqual(resolvePCIdentity({ choices: { classPaths: {} }, catalogs: wizardPaths }), {});

// A key is accepted only for the bridge that offers it.
error(() => resolvePCIdentity({ choices: { classPaths: { "Arcane School": pcIdentityKey(staffNexus) } }, catalogs: wizardPaths }), "PC_IDENTITY_UNKNOWN", "classPaths");
error(() => resolvePCIdentity({ choices: { classPaths: { "Arcane Thesis": pcIdentityKey(mentalism) } }, catalogs: wizardPaths }), "PC_IDENTITY_UNKNOWN", "classPaths");
error(() => resolvePCIdentity({ choices: { classPaths: { "Arcane Major": pcIdentityKey(mentalism) } }, catalogs: wizardPaths }), "PC_IDENTITY_UNKNOWN", "classPaths");
error(() => resolvePCIdentity({ choices: { classPaths: "School of Mentalism" }, catalogs: wizardPaths }), "PC_IDENTITY_CONTROL", "classPaths");
error(() => resolvePCIdentity({ choices: { classPaths: { "Arcane School": "class-features:missing" } }, catalogs: wizardPaths }), "PC_IDENTITY_UNKNOWN", "classPaths");

// Declarations: school/arcane school and thesis/arcane thesis name their bridge.
const declaredPaths = resolvePCIdentity({ prompt: "Class: Wizard; School: School of Mentalism; Thesis: Staff Nexus", catalogs: wizardPaths });
assert.deepEqual(declaredPaths.classPaths, { "Arcane School": mentalism, "Arcane Thesis": staffNexus });
assert.equal(declaredPaths.class, wizardPaths.class[2]);
assert.deepEqual(resolvePCIdentity({ prompt: "arcane   school: school of battle magic\nArcane Thesis: spell blending", catalogs: wizardPaths }).classPaths,
  { "Arcane School": battleMagic, "Arcane Thesis": spellBlending }, "labels and names are case- and space-tolerant like the other declarations");
error(() => resolvePCIdentity({ prompt: "School: Staff Nexus", catalogs: wizardPaths }), "PC_IDENTITY_UNKNOWN", "classPaths");
error(() => resolvePCIdentity({ prompt: "Thesis: School of Mentalism", catalogs: wizardPaths }), "PC_IDENTITY_UNKNOWN", "classPaths");
error(() => resolvePCIdentity({ prompt: "School: School of Mentalism; Arcane School: School of Battle Magic", catalogs: wizardPaths }), "PC_IDENTITY_DUPLICATE", "classPaths");
error(() => resolvePCIdentity({ prompt: "School: ", catalogs: wizardPaths }), "PC_IDENTITY_UNKNOWN", "classPaths");
assert.deepEqual(resolvePCIdentity({ prompt: "Racket: Thief", catalogs }).classPath, catalogs.classPath[0], "racket and methodology still bind the single alias");
error(() => resolvePCIdentity({ prompt: "School: School of Mentalism", choices: { classPaths: { "Arcane School": pcIdentityKey(battleMagic) } }, catalogs: wizardPaths }),
  "PC_IDENTITY_CONFLICT", "classPaths");
assert.deepEqual(resolvePCIdentity({ prompt: "School: School of Mentalism", choices: { classPaths: { "Arcane School": pcIdentityKey(mentalism) } }, catalogs: wizardPaths }).classPaths,
  { "Arcane School": mentalism }, "a control and a declaration for the same path agree");

// The alias and the per-bridge map must not disagree about one bridge.
error(() => resolvePCIdentity({ choices: { classPath: pcIdentityKey(staffNexus), classPaths: { "Arcane Thesis": pcIdentityKey(spellBlending) } }, catalogs: wizardPaths }),
  "PC_IDENTITY_CONFLICT", "classPath");
assert.equal(resolvePCIdentity({ choices: { classPath: pcIdentityKey(staffNexus), classPaths: { "Arcane Thesis": pcIdentityKey(staffNexus) } }, catalogs: wizardPaths }).classPath, staffNexus);

// Prose: a path's full name is ambiguous unless a control or declaration binds
// it; ordinary uses of "school" and "thesis" are flavor, not requests.
error(() => resolvePCIdentity({ prompt: "A scholar of the School of Mentalism", catalogs: wizardPaths }), "PC_IDENTITY_AMBIGUOUS", "classPath");
assert.deepEqual(resolvePCIdentity({ prompt: "A scholar of the School of Mentalism", choices: { classPaths: { "Arcane School": pcIdentityKey(mentalism) } }, catalogs: wizardPaths }).classPaths,
  { "Arcane School": mentalism }, "a per-bridge control resolves the prose mention");
assert.deepEqual(resolvePCIdentity({ prompt: "An old-school duelist who finished a thesis on wards", catalogs: wizardPaths }), {});

// Apply and assert keep every bridge's exact source.
const wizardIdentity = resolvePCIdentity({ choices: { class: wizardKey, classPaths: { "Arcane School": pcIdentityKey(mentalism), "Arcane Thesis": pcIdentityKey(staffNexus) } }, catalogs: wizardPaths });
const wizardConcept = applyPCIdentity({}, wizardIdentity);
assert.deepEqual(wizardConcept.classPaths, { "Arcane School": "School of Mentalism", "Arcane Thesis": "Staff Nexus" });
assert.deepEqual(wizardConcept.classPathCandidates, { "Arcane School": mentalism.ref, "Arcane Thesis": staffNexus.ref });
assert.equal(Object.hasOwn(wizardConcept, "classPath"), false);
assert.equal(assertPCIdentity(wizardConcept, wizardIdentity), true);
error(() => assertPCIdentity({ ...wizardConcept, classPaths: { "Arcane School": "Staff Nexus", "Arcane Thesis": "Staff Nexus" } }, wizardIdentity), "PC_IDENTITY_ASSERT", "classPaths");
error(() => assertPCIdentity({ ...wizardConcept, classPathCandidates: { ...wizardConcept.classPathCandidates, "Arcane School": staffNexus.ref } }, wizardIdentity), "PC_IDENTITY_ASSERT", "classPaths");
error(() => assertPCIdentity({ ...wizardConcept, classPaths: { "Arcane Thesis": "Staff Nexus" } }, wizardIdentity), "PC_IDENTITY_ASSERT", "classPaths");
error(() => assertPCIdentity({}, { classPaths: wizardIdentity.classPaths }), "PC_IDENTITY_ASSERT", "classPaths");
error(() => applyPCIdentity({}, { classPaths: { "Arcane School": { name: "bad" } } }), "PC_IDENTITY_APPLY", "classPaths");

// A path required through the single alias keeps its bridge. For a class with
// several bridges (Wizard) the alias is normalized into the per-bridge map, where
// the Arcane School and Arcane Thesis controls read it; a one-bridge class keeps
// the alias unchanged. Catalog candidates relate to their classes through classKeys.
const racket = { ...pathCandidate("Thief", "Rogue's Racket", "thief"), classKeys: [key("class")] };
const related = {
  ...wizardPaths,
  classPath: [...wizardPaths.classPath.map((path) => ({ ...path, classKeys: [wizardKey] })), racket]
};
const byName = (name) => related.classPath.find((path) => path.name === name);
const aliasIdentity = resolvePCIdentity({ choices: { class: wizardKey, classPath: pcIdentityKey(staffNexus) }, catalogs: related });
assert.deepEqual(Object.keys(aliasIdentity.classPaths), ["Arcane Thesis"]);
assert.equal(aliasIdentity.classPaths["Arcane Thesis"], byName("Staff Nexus"), "the alias is the requirement for its own bridge");
assert.equal(Object.hasOwn(aliasIdentity, "classPath"), false, "and is no longer carried twice");
const aliasConcept = applyPCIdentity({}, aliasIdentity);
assert.deepEqual(aliasConcept.classPaths, { "Arcane Thesis": "Staff Nexus" });
assert.deepEqual(aliasConcept.classPathCandidates, { "Arcane Thesis": staffNexus.ref });
assert.equal(assertPCIdentity(aliasConcept, aliasIdentity), true);
assert.equal(resolvePCIdentity({ prompt: "Class: Wizard; Class path: Spell Blending", catalogs: related }).classPaths["Arcane Thesis"], byName("Spell Blending"),
  "a Class path declaration is normalized the same way");
assert.deepEqual(Object.keys(resolvePCIdentity({ choices: { classPath: pcIdentityKey(mentalism) }, catalogs: related }).classPaths), ["Arcane School"],
  "without a class control, the classes the candidate relates to decide");
const rogueAlias = resolvePCIdentity({ choices: { class: key("class"), classPath: pcIdentityKey(racket) }, catalogs: related });
assert.equal(rogueAlias.classPath, racket, "a one-bridge class keeps the single alias");
assert.equal(Object.hasOwn(rogueAlias, "classPaths"), false);
assert.deepEqual(resolvePCIdentity({ choices: { classPath: pcIdentityKey(racket) }, catalogs: related }), { classPath: racket });
error(() => resolvePCIdentity({ choices: { class: wizardKey, classPath: pcIdentityKey(staffNexus), classPaths: { "Arcane Thesis": pcIdentityKey(spellBlending) } }, catalogs: related }),
  "PC_IDENTITY_CONFLICT", "classPath");

console.log("pc-identity.test.mjs: bounded controls, declarations, ambiguity checks, and source retention passed");
