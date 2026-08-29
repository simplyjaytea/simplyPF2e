// Exact-content boundary: active one-click creation must never turn a
// name-only first draft into a compendium pick after the bounded catalog has
// been issued. Legacy callers retain their explicit permissive default.

import assert from "node:assert/strict";

globalThis.game = {
  settings: { get: () => ({ equipment: ["test.equipment"], spells: ["test.spells"], feats: ["test.feats"] }) },
  packs: new Map([
    ["test.equipment", { async getIndex() { return [{ _id: "longsword", name: "Longsword", type: "weapon", system: { level: { value: 0 }, traits: { value: [] } } }]; } }],
    ["test.spells", {}],
    ["test.feats", { async getIndex() { return [{ _id: "power-attack", name: "Power Attack", type: "feat", system: { level: { value: 1 }, category: "class", traits: { value: [] } } }]; } }]
  ])
};

const { normalizeConcept, normalizeLoot, resolveConcept, resolveEquipment, resolveLoot, resolveFocusSpells } = await import("./builder.mjs");
const { getEquipmentCandidates, getFeatCandidates } = await import("./compendium.mjs");

const concept = {
  level: 1,
  equipment: [{ name: "Longsword", quantity: 1, value: 0 }],
  loot: [{ name: "Mysterious Relic", quantity: 1, value: 0 }]
};
const strictEquipment = await resolveEquipment(concept, { exactContent: true });
const strictLoot = await resolveLoot(concept, { exactContent: true });
const strictFocus = await resolveFocusSpells([{ name: "Fire Ray" }], { exactContent: true });
assert.equal(strictEquipment[0].entry, null, "strict equipment cannot fuzzy-match a first-draft name");
assert.equal(strictLoot[0].entry, null, "strict loot cannot fuzzy-match a first-draft name");
assert.equal(strictFocus[0].entry, null, "strict focus spells cannot fuzzy-match a first-draft name");

const exact = (await getEquipmentCandidates(1)).find((candidate) => candidate.name === "Longsword").ref;
const exactEquipment = await resolveEquipment({ ...concept, equipment: [{ ...concept.equipment[0], candidate: exact }] },
  { exactContent: true });
assert.equal(exactEquipment[0].entry, exact, "a locally retained source reference remains valid in strict mode");

const featCandidate = (await getFeatCandidates({ level: 1, category: "class" }))
  .find((candidate) => candidate.name === "Power Attack").ref;
const strictFeat = await resolveConcept(normalizeConcept({ feats: ["Power Attack"] }, { level: 1, rarity: "common" }),
  { exactContent: true });
assert.equal(strictFeat.feats[0].entry, null, "strict creature feats cannot fuzzy-match a first-draft name");
const exactFeat = await resolveConcept(normalizeConcept({ feats: [{ name: "Power Attack", candidate: featCandidate }] },
  { level: 1, rarity: "common" }), { exactContent: true });
assert.equal(exactFeat.feats[0].entry, featCandidate, "a grounded creature feat retains its exact source reference");

const scrollCandidate = { packId: "test.spells", _id: "fireball" };
assert.deepEqual(
  normalizeLoot([{ name: "Scroll of Fireball (Rank 3)", scrollCandidate }]),
  [{ name: "Scroll of Fireball (Rank 3)", quantity: 1, value: 0, scrollCandidate }],
  "a selected scroll retains its exact spell source through loot normalization"
);

console.log("builder exact-content boundary: name fallbacks blocked, opaque references retained");
