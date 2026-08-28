import assert from "node:assert/strict";

const docs = new Map();
const entry = (id) => ({ packId: "spells", _id: id, uuid: `Compendium.spells.Item.${id}` });
const spellDoc = (id, level, traits = []) => ({
  id, uuid: `Compendium.spells.Item.${id}`,
  toObject: () => ({ _id: id, name: id, type: "spell", system: { level: { value: level }, traits: { value: traits, traditions: ["arcane"] }, location: { value: "stale", heightenedLevel: 9 } } })
});
docs.set("magic-missile", spellDoc("magic-missile", 1));
docs.set("fireball", spellDoc("fireball", 3));
docs.set("detect-magic", spellDoc("detect-magic", 1, ["cantrip"]));

globalThis.foundry = { utils: { randomID: (() => { let i = 0; return () => `id-${++i}`; })() } };
globalThis.CONST = { TOKEN_DISPLAY_MODES: { OWNER_HOVER: 50 } };
globalThis.CONFIG = { PF2E: { languages: {} } };
globalThis.game = { i18n: { localize: (x) => x }, packs: new Map([["spells", { getDocument: async (id) => docs.get(id) }]]) };
let embedded;
globalThis.Actor = { create: async () => ({
  system: { attributes: { hp: { max: 20 } }, abilities: { int: { mod: 0 } } },
  async createEmbeddedDocuments(_type, items, options) {
    assert.equal(options.keepId, true, "prepared IDs must survive native embedding");
    embedded = items;
  }, async update() {}, async delete() {}
}) };
const { createCharacterActor } = await import("./pc-builder.mjs");
const doc = (type, system, name = type) => ({ type, name, system, toObject: () => ({ name, type, system: structuredClone(system) }) });
const common = {
  name: "Caster", level: 5, keyAbility: "str", languages: [], backstory: "", appearance: "", personality: "", alignmentFlavor: "",
  likes: "", dislikes: "", allies: "", enemies: "", organizations: "", age: "", gender: "", height: "", weight: "", ethnicity: "", nationality: ""
};
const resolved = {
  ancestryDoc: doc("ancestry", { boosts: {}, additionalLanguages: {}, languages: { value: [] } }),
  backgroundDoc: doc("background", { boosts: {}, trainedSkills: { value: [] } }),
  classDoc: doc("class", { slug: "wizard", publication: { title: "Pathfinder Player Core", remaster: true }, keyAbility: { value: ["int"] }, trainedSkills: { value: [], additional: 0 } }, "Wizard"),
  heritageDoc: null, feats: [], focusSpells: [], equipment: [], loot: [],
  spells: [
    { spell: { rank: 1 }, entry: entry("magic-missile") }, { spell: { rank: 1 }, entry: entry("magic-missile") },
    { spell: { rank: 3 }, entry: entry("fireball") }, { spell: { rank: 0 }, entry: entry("detect-magic") },
    { spell: { rank: 2 }, entry: entry("fireball") }
  ]
};
await createCharacterActor({ ...common, spellcasting: { tradition: "arcane", spells: [] } }, resolved);
const casting = embedded.find((item) => item.type === "spellcastingEntry" && item.name === "Arcane Spells");
assert.equal(casting.system.prepared.value, "prepared");
assert.equal(casting.system.ability.value, "int");
assert.equal(casting.system.slots.slot1.prepared.length, 2, "explicit repeated prepared picks fill two slots from one source");
assert.equal(casting.system.slots.slot1.prepared[0].id, casting.system.slots.slot1.prepared[1].id);
assert.equal(casting.system.slots.slot3.prepared.length, 1);
assert.equal(casting.system.slots.slot2.prepared.length, 0, "base rank above assigned rank is dropped");
assert.equal(casting.system.slots.slot0.prepared.length, 1, "a level-1 cantrip occupies its rank-0 prepared slot");
assert.equal(embedded.filter((item) => item.type === "spell" && item.name === "magic-missile").length, 1);
assert.equal(embedded.filter((item) => item.type === "spell" && item.name === "detect-magic").length, 1);
assert.ok(embedded.filter((item) => item.type === "spell").every((item) => item.system.location.value === casting._id && item.system.location.heightenedLevel === undefined),
  "prepared spell sources discard stale entry and heightening locations");

const wizardClass = resolved.classDoc;
resolved.classDoc = doc("class", { slug: "sorcerer", publication: { title: "Pathfinder Player Core 2", remaster: true }, keyAbility: { value: ["cha"] }, trainedSkills: { value: [], additional: 0 } }, "Sorcerer");
resolved.spells = [
  { spell: { rank: 3 }, entry: entry("fireball") }, { spell: { rank: 4 }, entry: entry("fireball") }
];
await createCharacterActor({ ...common, level: 8, spellcasting: { tradition: "arcane", spells: [] } }, resolved);
const spontaneous = embedded.find((item) => item.type === "spellcastingEntry" && item.name === "Arcane Spells");
assert.equal(spontaneous.system.prepared.value, "spontaneous");
const fireballs = embedded.filter((item) => item.type === "spell" && item.name === "fireball");
assert.equal(fireballs.length, 2, "one source at two explicit spontaneous ranks embeds separately");
assert.deepEqual(fireballs.map((item) => item.system.location.heightenedLevel).sort(), [4, undefined]);
assert.equal(spontaneous.system.slots.slot4.max, 4);
assert.equal(spontaneous.system.ability.value, "cha");

const pick = (id, rank) => ({ spell: { name: id, rank }, entry: entry(id) });
for (let i = 0; i < 6; i++) docs.set(`cantrip-${i}`, spellDoc(`cantrip-${i}`, 1, ["cantrip"]));
resolved.classDoc = wizardClass;
resolved.spells = [
  ...Array.from({ length: 5 }, () => pick("magic-missile", 1)),
  pick("magic-missile", 2), pick("fireball", 3),
  pick("cantrip-0", 0), pick("cantrip-0", 0),
  ...Array.from({ length: 5 }, (_, i) => pick(`cantrip-${i + 1}`, 0))
];
await createCharacterActor({ ...common, spellcasting: {
  tradition: "divine", preparationMode: "spontaneous", plannedSlots: { 0: 99, 1: 99 }
} }, resolved);
const prepared = embedded.find((item) => item.type === "spellcastingEntry");
assert.equal(prepared.system.tradition.value, "arcane", "real fixed tradition overrides a conflicting concept");
assert.equal(prepared.system.prepared.value, "prepared");
assert.equal(prepared.system.slots.slot1.max, 3, "builder recomputes real profile, never trusts upstream plannedSlots");
assert.equal(prepared.system.slots.slot1.prepared.length, 3);
assert.equal(prepared.system.slots.slot0.prepared.length, 5, "cantrip preparations are distinct and capped");
assert.equal(prepared.system.slots.slot1.prepared[0].id, prepared.system.slots.slot2.prepared[0].id,
  "same real spell may be prepared at multiple ranks without duplicate documents");
assert.equal(embedded.filter((item) => item.type === "spell").length, 7, "overflow picks do not embed extra sources");
const spellsById = new Map(embedded.filter((item) => item.type === "spell").map((item) => [item._id, item]));
for (const slot of Object.values(prepared.system.slots)) {
  for (const preparation of slot.prepared) {
    assert.deepEqual(Object.keys(preparation).sort(), ["expended", "id"]);
    assert.equal(preparation.expended, false);
    assert.equal(spellsById.get(preparation.id)?.system.location.value, prepared._id);
  }
}

// Check actual source shape rather than mythical "ritual" traits.
function addAlteredSpell(id, change) {
  const base = spellDoc(id, 1).toObject();
  change(base);
  docs.set(id, { uuid: `Compendium.spells.Item.${id}`, toObject: () => structuredClone(base) });
}
addAlteredSpell("ritual", (data) => { data.system.ritual = { primary: { check: "arcana" } }; });
addAlteredSpell("focus", (data) => { data.system.traits.value = ["focus"]; });
addAlteredSpell("wrong-tradition", (data) => { data.system.traits.traditions = ["divine"]; });
addAlteredSpell("missing-traits", (data) => { delete data.system.traits.value; });
addAlteredSpell("malformed-traits", (data) => { data.system.traits.value = {}; });
addAlteredSpell("wrong-type", (data) => { data.type = "feat"; });
resolved.spells = [
  ...["ritual", "focus", "wrong-tradition", "missing-traits", "malformed-traits", "wrong-type", "missing-doc"].map((id) => pick(id, 1)),
  ...["1", null, 1.5, -1, 11].map((rank) => pick("magic-missile", rank))
];
await createCharacterActor({ ...common, spellcasting: { tradition: "arcane" } }, resolved);
assert.equal(embedded.filter((item) => item.type === "spell").length, 0, "invalid source/rank picks must not create ordinary spells");
resolved.spells = [];
await createCharacterActor({ ...common, spellcasting: { tradition: "arcane" } }, resolved);
const empty = embedded.find((item) => item.type === "spellcastingEntry");
assert.equal(empty.system.slots.slot1.max, 3, "known empty plans retain usable slots for native manual completion");
assert.equal(empty.system.slots.slot1.prepared.length, 0, "no invented preparation fills empty slots");
await createCharacterActor({ ...common, spellcasting: null }, resolved);
assert.equal(embedded.filter((item) => item.type === "spellcastingEntry").length, 0, "explicitly disabled casting stays disabled");

// Real compendium indexes may omit UUIDs. Bare IDs are not globally unique.
const otherSpell = spellDoc("magic-missile", 1);
otherSpell.uuid = "Compendium.other-spells.Item.magic-missile";
game.packs.set("other-spells", { getDocument: async () => otherSpell });
resolved.spells = [
  { spell: { rank: 1 }, entry: { packId: "spells", _id: "magic-missile" } },
  { spell: { rank: 1 }, entry: { packId: "other-spells", _id: "magic-missile" } }
];
await createCharacterActor({ ...common, spellcasting: { tradition: "arcane" } }, resolved);
const crossPack = embedded.find((item) => item.type === "spellcastingEntry").system.slots.slot1.prepared;
assert.notEqual(crossPack[0].id, crossPack[1].id, "different real document UUIDs cannot collapse on matching bare IDs");
console.log("pc-builder spellcasting: prepared IDs, ranks, source validation, caps and native empty plans passed");
