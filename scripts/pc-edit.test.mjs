// PC editing contract (C05): exact candidate edits, invalidation, deferred
// spell refusal, and in-memory completion. Services are injected so the test
// needs no Foundry world; candidates are issued through the real registry.

import assert from "node:assert/strict";

const { applyPCEdit, validatePCEditCompletion, PC_EDIT_CODES } = await import("./pc-edit.mjs");
const { issueCandidate } = await import("./compendium.mjs");

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

console.log("pc-edit tests passed");
