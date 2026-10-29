// The Character editor's recompute (the exact-content path after an identity edit) honors the rarity cap: with
// a cap, the regenerated feat-slot candidates carry nothing rarer; without one, they do.
// Production resolvePCConcept over stand-in packs; only the pf2e documents are minimal.
// Run: node tests/pc-edit.rarityCap.test.mjs
import assert from "node:assert/strict";

const source = (name, type, system) => ({ _id: name, name, type, system });
const entries = {
  ancestry: [source("Human", "ancestry", {}), source("Elf", "ancestry", {})],
  background: [source("Scholar", "background", { trainedSkills: { value: ["society"], lore: [] } })],
  class: [source("Fighter", "class", {
    keyAbility: { value: ["str"] }, trainedSkills: { value: ["athletics"], additional: 3 },
    ancestryFeatLevels: { value: [1] }, classFeatLevels: { value: [1] }, generalFeatLevels: { value: [3] }, skillFeatLevels: { value: [2] }
  })]
};
const packMap = new Map();
for (const [category, list] of Object.entries(entries)) {
  const id = `test.${category}`;
  packMap.set(id, {
    collection: id, metadata: { type: "Item", label: category },
    getIndex: async () => list,
    getDocument: async (docId) => {
      const found = list.find((item) => item._id === docId);
      return found ? { ...found, uuid: `Compendium.${id}.Item.${found._id}`, toObject: () => structuredClone(found) } : null;
    }
  });
}
const classFeat = (name, rarity) => source(name, "feat", { level: { value: 1 }, category: "class", traits: { value: ["fighter"], rarity }, prerequisites: { value: [] } });
const ancestryFeat = (name, rarity) => source(name, "feat", { level: { value: 1 }, category: "ancestry", traits: { value: ["human", "elf"], rarity }, prerequisites: { value: [] } });
const feats = [classFeat("Common Strike", "common"), classFeat("Rare Strike", "rare"), classFeat("Uncommon Strike", "uncommon"),
  ancestryFeat("Common Heritage Trick", "common"), ancestryFeat("Rare Heritage Trick", "rare")];
packMap.set("test.feats", { collection: "test.feats", metadata: { type: "Item", label: "Feats" }, getIndex: async () => feats });
globalThis.game = {
  settings: { get: (_module, key) => key === "freeArchetype" || key === "multiclassArchetypes" ? false : {
    ancestries: ["test.ancestry"], backgrounds: ["test.background"], classes: ["test.class"], feats: ["test.feats"], spells: [], equipment: []
  } },
  packs: { get: (id) => packMap.get(id), [Symbol.iterator]: () => packMap.values() }
};
console.warn = () => {};
const { applyPCEdit } = await import("../scripts/pc-edit.mjs");
const { issueCandidate, getDocument } = await import("../scripts/compendium.mjs");
const { resolvePCConcept } = await import("../scripts/pc-builder.mjs");

const candidate = (packId, name) => issueCandidate({ packId, _id: name, type: packId.split(".")[1], name }, { name, uuid: `Compendium.${packId}.Item.${name}` });
const human = candidate("test.ancestry", "Human");
const elf = candidate("test.ancestry", "Elf");
const scholar = candidate("test.background", "Scholar");
const fighter = candidate("test.class", "Fighter");

const concept = {
  level: 1, ancestry: "Human", ancestryCandidate: human.ref, background: "Scholar", backgroundCandidate: scholar.ref,
  class: "Fighter", classCandidate: fighter.ref, heritage: null, heritageCandidate: null, keyAbility: "str", traits: ["human", "fighter"],
  spellcasting: null, focusSpells: [], equipment: [], loot: [], requiredIdentity: {}
};
const plan = async () => {
  const resolved = await resolvePCConcept(concept, { exactContent: true });
  return {
    concept: { ...concept, equipment: [] },
    resolved: { ...resolved, spells: [], focusSpells: [], equipment: [], loot: [], feats: resolved.featSlots.map((slot) => ({ type: slot.type, level: slot.level, archetype: false, name: `${slot.type} feat`, entry: null })) },
    pending: []
  };
};
const catalogs = { ancestry: [human, elf], background: [scholar], class: [fighter], equipment: [] };
const services = { equipmentValue: async () => 0, resolveEquipmentLine: async () => [] };
const offered = (result) => result.plan.resolved.featSlots.flatMap((slot) => slot.candidates.map((c) => c.name)).sort();

// Without a cap the regenerated slots offer the rare feats; with a cap they offer nothing rarer.
const uncapped = await applyPCEdit(await plan(), { field: "ancestry", key: `${elf.ref.packId}:${elf.ref._id}` }, { catalogs, services });
assert.ok(offered(uncapped).includes("Rare Strike") && offered(uncapped).includes("Rare Heritage Trick"), "no cap offers rare feats");

const common = await applyPCEdit(await plan(), { field: "ancestry", key: `${elf.ref.packId}:${elf.ref._id}` }, { catalogs, services, maxRarity: "common" });
assert.deepEqual(offered(common).filter((name) => /Rare|Uncommon/.test(name)), [], "a common cap drops uncommon and rare feats after the edit");
assert.ok(offered(common).includes("Common Strike") && offered(common).includes("Common Heritage Trick"), "common feats remain");

const uncommon = await applyPCEdit(await plan(), { field: "ancestry", key: `${elf.ref.packId}:${elf.ref._id}` }, { catalogs, services, maxRarity: "uncommon" });
assert.ok(offered(uncommon).includes("Uncommon Strike") && !offered(uncommon).includes("Rare Strike"), "an uncommon cap keeps uncommon and drops rare");

// An injected recompute receives the cap, so any service replacement sees it too.
let received;
await applyPCEdit(await plan(), { field: "ancestry", key: `${elf.ref.packId}:${elf.ref._id}` }, { catalogs, maxRarity: "rare",
  services: { ...services, recompute: async (conceptArg, options) => { received = options; return { ancestryDoc: await getDocument(elf.ref), heritageDoc: null, backgroundDoc: await getDocument(scholar.ref), backgroundLore: [], classDoc: await getDocument(fighter.ref), featSlots: [] }; } } });
assert.deepEqual(received, { maxRarity: "rare" });

console.log("pc-edit.rarityCap.test.mjs: the editor's recompute honors the rarity cap");
