import assert from "node:assert/strict";
import { normalizeRunedItemConcept } from "./item-builder.mjs";

const context = {
  kind: "weapon", rarity: "common",
  baseCandidates: [{ name: "Air Repeater", level: 0 }, { name: "Longsword", level: 0 }],
  runeCandidates: [], potencyTiers: [1], secondaryTiers: []
};
assert.throws(() => normalizeRunedItemConcept({ baseItemName: "Invented Sword", potency: "single" }, context),
  /base weapon/i, "unresolved required bases must not become the first catalog item");
assert.equal(normalizeRunedItemConcept({ baseItemName: "longsword", potency: "single", secondaryTier: "none" }, context).baseItemName,
  "Longsword", "a format-tolerant exact catalog match remains supported");
console.log("forge required base selection passed");
