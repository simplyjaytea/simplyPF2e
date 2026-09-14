import assert from "node:assert/strict";
import { pcIdentityKey, resolvePCIdentity, applyPCIdentity, assertPCIdentity } from "./pc-identity.mjs";

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

console.log("pc-identity.test.mjs: bounded controls, declarations, ambiguity checks, and source retention passed");
