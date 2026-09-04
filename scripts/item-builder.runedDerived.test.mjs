// Runed source data must preserve cloned base price/level while retaining
// PF2e-aligned same-pass estimates for the Item Forge preview.
// Run: node scripts/item-builder.runedDerived.test.mjs
import assert from "node:assert/strict";
import { SETTINGS } from "./settings.mjs";

const docs = new Map();
const entry = (id, name, type) => ({ _id: id, name, type });
const makeDoc = (id, name, type, system) => ({
  name,
  uuid: `Compendium.pf2e.equipment-srd.Item.${id}`,
  system,
  toObject: () => ({ _id: id, name, type, system: structuredClone(system) })
});
const base = makeDoc("longsword", "Longsword", "weapon", {
  price: { value: { gp: 1 } }, level: { value: 0 },
  runes: { potency: 0, striking: 0, property: [] },
  traits: { rarity: "common", value: ["martial", "sword"] },
  description: { value: "A real base weapon." }
});
const potency = makeDoc("potency1", "Weapon Potency (+1)", "equipment", {
  price: { value: { gp: 35 } }, level: { value: 2 }
});
const striking = makeDoc("striking", "Striking", "equipment", {
  price: { value: { gp: 65 } }, level: { value: 4 }
});
for (const doc of [base, potency, striking]) docs.set(doc.uuid.split(".").at(-1), doc);

const entries = [
  entry("longsword", "Longsword", "weapon"),
  entry("potency1", "Weapon Potency (+1)", "equipment"),
  entry("striking", "Striking", "equipment")
];
globalThis.game = {
  settings: { get: (_moduleId, key) => key === SETTINGS.sourcePacks ? {} : null },
  i18n: { localize: (key) => key },
  packs: new Map([["pf2e.equipment-srd", {
    getIndex: async () => entries,
    getDocument: async (id) => docs.get(id)
  }]])
};
globalThis.foundry = { utils: { escapeHTML: (value) => String(value) } };

const { buildRunedItem } = await import("./item-builder.mjs");
const { itemData, preview } = await buildRunedItem({
  kind: "weapon", baseItemName: "Longsword", potency: 1, secondaryTier: 1,
  propertyRunes: [], rarity: "common", description: "A test blade."
});

assert.deepEqual(itemData.system.price, { value: { gp: 1 } },
  "persisted source must preserve the base item's system.price");
assert.deepEqual(itemData.system.level, { value: 0 },
  "persisted source must preserve the base item's system.level");
assert.deepEqual(preview, { priceGp: 100, level: 4 },
  "ordinary runed preview uses rune-only price and maximum component level");
assert.equal(itemData.name, "+1 Striking Longsword");
assert.deepEqual(itemData.system.runes, { potency: 1, striking: 1, property: [] });

console.log("runed derived-source/preview split assertions passed");
