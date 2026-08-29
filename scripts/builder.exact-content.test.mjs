// Exact-content boundary: active one-click creation must never turn a
// name-only first draft into a compendium pick after the bounded catalog has
// been issued. Legacy callers retain their explicit permissive default.

import assert from "node:assert/strict";

globalThis.game = {
  settings: { get: () => ({ equipment: ["test.equipment"], spells: ["test.spells"] }) },
  packs: new Map([["test.equipment", {}], ["test.spells", {}]])
};

const { normalizeLoot, resolveEquipment, resolveLoot, resolveFocusSpells } = await import("./builder.mjs");

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

const exact = { packId: "test.equipment", _id: "longsword" };
const exactEquipment = await resolveEquipment({ ...concept, equipment: [{ ...concept.equipment[0], candidate: exact }] },
  { exactContent: true });
assert.equal(exactEquipment[0].entry, exact, "a locally retained source reference remains valid in strict mode");

const scrollCandidate = { packId: "test.spells", _id: "fireball" };
assert.deepEqual(
  normalizeLoot([{ name: "Scroll of Fireball (Rank 3)", scrollCandidate }]),
  [{ name: "Scroll of Fireball (Rank 3)", quantity: 1, value: 0, scrollCandidate }],
  "a selected scroll retains its exact spell source through loot normalization"
);

console.log("builder exact-content boundary: name fallbacks blocked, opaque references retained");
