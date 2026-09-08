import assert from "node:assert/strict";
import { normalizeRunedItemConcept } from "./item-builder.mjs";
import { issueCandidate } from "./compendium.mjs";

const candidate = (id, name, fields = {}) => issueCandidate({ packId: "qa.equipment", _id: id }, { name, ...fields });
const context = {
  kind: "weapon", rarity: "common",
  baseCandidates: [candidate("air-repeater", "Air Repeater", { level: 0 }), candidate("longsword", "Longsword", { level: 0 })],
  runeCandidates: [], potencyCandidates: [candidate("potency", "Weapon Potency (+1)", { tier: 1 })], secondaryCandidates: []
};
assert.throws(() => normalizeRunedItemConcept({
  baseItemId: "c-forged", potencyRuneId: context.potencyCandidates[0].id, secondaryRuneId: "none", propertyRuneIds: []
}, context),
  /base weapon/i, "unresolved required bases must not become the first catalog item");
assert.throws(() => normalizeRunedItemConcept({
  baseItemId: "Longsword", potencyRuneId: context.potencyCandidates[0].id, secondaryRuneId: "none", propertyRuneIds: []
}, context), /base weapon/i, "a display name cannot substitute for an issued opaque ID");
assert.equal(normalizeRunedItemConcept({
  baseItemId: context.baseCandidates[1].id, potencyRuneId: context.potencyCandidates[0].id,
  secondaryRuneId: "none", propertyRuneIds: []
}, context).baseItemName, "Longsword", "the issued opaque ID selects its exact catalog candidate");
console.log("forge required base selection passed");
