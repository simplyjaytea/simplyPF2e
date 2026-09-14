import assert from "node:assert/strict";

let sources = {};
const installed = new Map();
globalThis.game = {
  settings: { get: () => sources },
  packs: {
    get: (id) => installed.get(id),
    [Symbol.iterator]: () => installed.values()
  }
};

const entry = (name, _id, rarity = "common", type) => ({
  name, _id, type, system: { traits: { rarity, value: [] } }
});
function addPack(id, entries) {
  installed.set(id, {
    collection: id, title: id, metadata: { type: "Item" },
    getIndex: async () => entries
  });
}

addPack("qa.ancestries.a", [entry("Human", "human-a", "common", "ancestry"), entry("Elf", "elf-a", "rare", "ancestry")]);
addPack("qa.ancestries.b", [entry("Human", "human-b", "uncommon", "ancestry")]);
addPack("qa.backgrounds.a", [entry("Guard", "guard-a", "common", "background")]);
addPack("qa.backgrounds.b", [entry("Guard", "guard-b", "uncommon", "background")]);
addPack("qa.classes.a", [entry("Rogue", "rogue-a", "common", "class")]);
addPack("qa.classes.b", [entry("Rogue", "rogue-b", "common", "class"), entry("Fighter", "fighter-b", "rare", "class")]);
// This pack is configured but not installed and therefore must never leak into
// a catalog through source discovery or a stale setting.
sources = {
  ancestries: ["qa.ancestries.a", "qa.ancestries.b", "qa.ancestries.disabled"],
  backgrounds: ["qa.backgrounds.a", "qa.backgrounds.b"],
  classes: ["qa.classes.a", "qa.classes.b", "qa.classes.disabled"]
};

const { getAncestryCandidates, getBackgroundCandidates, getClassCandidates } = await import("./compendium.mjs");
const { pcIdentityKey, resolvePCIdentity } = await import("./pc-identity.mjs");

const defaultAncestries = await getAncestryCandidates("uncommon");
assert.deepEqual(defaultAncestries.map((candidate) => candidate.name), ["Human"],
  "legacy catalogs remain name-deduped and still apply rarity");
assert.equal(defaultAncestries[0].ref.packId, "qa.ancestries.a", "legacy dedup keeps the first enabled source");

const distinctAncestries = await getAncestryCandidates("uncommon", { distinctSources: true });
assert.deepEqual(distinctAncestries.map((candidate) => candidate.name), ["Human", "Human"],
  "distinct-source mode retains same-name ancestries");
assert.deepEqual(distinctAncestries.map(pcIdentityKey), ["qa.ancestries.a:human-a", "qa.ancestries.b:human-b"]);
assert.ok(!distinctAncestries.some((candidate) => candidate.ref.packId.includes("disabled")));
assert.deepEqual((await getAncestryCandidates("common", { distinctSources: true })).map((candidate) => candidate.ref._id), ["human-a"],
  "distinct-source mode does not weaken rarity caps");

const distinctBackgrounds = await getBackgroundCandidates("uncommon", { distinctSources: true });
assert.deepEqual(distinctBackgrounds.map(pcIdentityKey), ["qa.backgrounds.a:guard-a", "qa.backgrounds.b:guard-b"]);

const defaultClasses = await getClassCandidates();
assert.deepEqual(defaultClasses.map((candidate) => candidate.name), ["Rogue", "Fighter"].sort(),
  "class default remains name-deduped");
const distinctClasses = await getClassCandidates({ distinctSources: true });
assert.deepEqual(distinctClasses.map(pcIdentityKey), ["qa.classes.b:fighter-b", "qa.classes.a:rogue-a", "qa.classes.b:rogue-b"],
  "all enabled class source identities are offered");
assert.ok(!distinctClasses.some((candidate) => candidate.ref.packId.includes("disabled")));

const identityCatalog = { ancestry: [], heritage: [], background: [], class: distinctClasses, classPath: [] };
assert.throws(
  () => resolvePCIdentity({ prompt: "Class: Rogue", catalogs: identityCatalog }),
  (error) => error.code === "PC_IDENTITY_DUPLICATE" && error.field === "class",
  "a duplicate same-name declaration must fail closed"
);
const selected = resolvePCIdentity({
  choices: { class: pcIdentityKey(distinctClasses[0]) }, catalogs: identityCatalog
});
assert.equal(selected.class, distinctClasses[0], "a stable control key can select one duplicate source");

console.log("compendium.pc-identity.test.mjs: distinct-source identity catalogs, rarity caps and stale-source exclusion passed");
