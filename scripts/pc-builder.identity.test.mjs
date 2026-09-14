// Required PC identity must be validated against the issued source records
// before any provider/world work. The fixtures model the PF2e ABC fields
// verified in class/data.ts and heritage/data.ts.
import assert from "node:assert/strict";

globalThis.CONFIG = { PF2E: {} };
globalThis.foundry = { utils: { randomID: () => "id" } };
const packMap = new Map();
let selectedSources = {};
globalThis.game = { settings: { get: () => selectedSources }, packs: { get: (id) => packMap.get(id), [Symbol.iterator]: function* () { yield* packMap.values(); } } };
globalThis.Actor = { create: async () => { throw new Error("Actor.create must not run"); } };

const docs = new Map();
function add(packId, id, type, system, name = type) {
  const uuid = `Compendium.${packId}.Item.${id}`;
  docs.set(uuid, { id, uuid, pack: packId, type, name, system,
    toObject: () => ({ _id: id, name, type, system: structuredClone(system) }) });
}
add("pf2e.ancestries", "anc", "ancestry", { slug: "dwarf" }, "Dwarf");
add("pf2e.backgrounds", "bg", "background", {});
add("pf2e.classes", "cls", "class", { keyAbility: { value: ["str"] }, items: {} }, "Fighter");
add("pf2e.classes", "rogue", "class", { keyAbility: { value: ["dex"] }, items: {} }, "Rogue");
add("pf2e.heritages", "elf", "heritage", { ancestry: { name: "Elf", slug: "elf", uuid: "Compendium.pf2e.ancestries.Item.elf" } }, "Cavern Elf");
for (const packId of ["pf2e.ancestries", "pf2e.backgrounds", "pf2e.classes", "pf2e.heritages"]) {
  packMap.set(packId, { collection: packId, metadata: { type: "Item" }, getIndex: async () => [...docs.values()].filter((d) => d.pack === packId).map((d) => ({
    _id: d.id, name: d.name, type: d.type, system: d.system
  })), getDocument: async (id) => [...docs.values()].find((d) => d.pack === packId && d.id === id) ?? null });
}
globalThis.fromUuid = async (uuid) => docs.get(uuid) ?? null;

const { issueCandidate, getAllPacksFor } = await import("./compendium.mjs");
const { normalizePCConcept, validatePCIdentityRequirements, createCharacterActor } = await import("./pc-builder.mjs");
const ref = (packId, id, type, name) => issueCandidate(
  { packId, _id: id, type, name, normalized: name.toLowerCase(), system: docs.get(`Compendium.${packId}.Item.${id}`).system },
  { name, uuid: `Compendium.${packId}.Item.${id}` }
);
const ancestry = ref("pf2e.ancestries", "anc", "ancestry", "Dwarf");
const background = ref("pf2e.backgrounds", "bg", "background", "background");
const cls = ref("pf2e.classes", "cls", "class", "Fighter");
const elfHeritage = ref("pf2e.heritages", "elf", "heritage", "Cavern Elf");
const rogue = ref("pf2e.classes", "rogue", "class", "Rogue");

assert.equal(normalizePCConcept({ requiredIdentity: { keyAbility: "dex" } }, { level: 1 }).requiredIdentity, undefined,
  "raw provider data cannot inject module-owned identity");
await assert.rejects(validatePCIdentityRequirements({ ancestry, background, class: cls, heritage: elfHeritage }), /incompatible/,
  "incompatible required heritage is rejected");
await assert.rejects(validatePCIdentityRequirements({ ancestry, background, class: cls, keyAbility: "dex" }), /illegal/,
  "illegal required key ability is rejected");
await assert.rejects(validatePCIdentityRequirements({ ancestry: { ...ancestry, uuid: "Compendium.pf2e.ancestries.Item.other" } }), /missing or invalid/,
  "source identity drift is rejected");

let actorCreates = 0;
globalThis.Actor.create = async () => { actorCreates++; return null; };
const concept = {
  name: "Guard", level: 1, keyAbility: "dex", ancestry: "Dwarf", ancestryCandidate: ancestry.ref,
  background: "background", backgroundCandidate: background.ref, class: "Fighter", classCandidate: cls.ref,
  requiredIdentity: { name: "Guard", ancestry, background, class: cls, keyAbility: "dex" }
};
await assert.rejects(createCharacterActor(concept, {
  ancestryDoc: docs.get(ancestry.uuid), backgroundDoc: docs.get(background.uuid), classDoc: docs.get(cls.uuid),
  heritageDoc: null, feats: [], spells: [], focusSpells: [], equipment: [], loot: []
}), /illegal/);
assert.equal(actorCreates, 0, "identity failure happens before Actor.create");

await assert.rejects(createCharacterActor({ ...concept, keyAbility: "str", requiredIdentity: { ...concept.requiredIdentity, keyAbility: "str", class: cls } }, {
  ancestryDoc: docs.get(ancestry.uuid), backgroundDoc: docs.get(background.uuid), classDoc: docs.get(rogue.uuid),
  heritageDoc: null, feats: [], spells: [], focusSpells: [], equipment: [], loot: []
}), /prepared class|prepared/, "prepared class source drift is rejected before Actor.create");
assert.equal(actorCreates, 0, "prepared identity drift still precedes Actor.create");

console.log("pc-builder.identity.test.mjs: required identity guards passed");

const validConcept = { ...concept, keyAbility: "str", requiredIdentity: { ...concept.requiredIdentity, keyAbility: "str" } };
const validResolved = {
  ancestryDoc: docs.get(ancestry.uuid), backgroundDoc: docs.get(background.uuid), classDoc: docs.get(cls.uuid),
  heritageDoc: null, feats: [], spells: [], focusSpells: [], equipment: [], loot: []
};
await assert.rejects(createCharacterActor({ ...validConcept, name: "Wrong name" }, validResolved), /name/,
  "a changed literal name cannot pass the creation boundary");
await assert.rejects(createCharacterActor({ ...validConcept, heritage: null,
  requiredIdentity: { ...validConcept.requiredIdentity, heritage: null } }, { ...validResolved, heritageDoc: docs.get(elfHeritage.uuid) }), /heritage/,
  "explicit no-heritage rejects a prepared heritage");
packMap.set("module.other-classes", { collection: "module.other-classes", metadata: { type: "Item" },
  getIndex: async () => [], getDocument: async () => null });
selectedSources = { classes: ["module.other-classes"] };
assert.ok((await getAllPacksFor("classes")).includes("pf2e.classes"), "the old class pack remains installed and discoverable");
await assert.rejects(validatePCIdentityRequirements(validConcept.requiredIdentity), /not an issued candidate/,
  "required sources must remain selected, not merely installed");
await assert.rejects(createCharacterActor(validConcept, validResolved), /not an issued candidate/,
  "deselecting the required source after preview prevents creation");
assert.equal(actorCreates, 0, "all rejected identities preserve the world");
