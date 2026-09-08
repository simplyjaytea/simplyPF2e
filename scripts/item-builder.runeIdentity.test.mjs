// Runed Forge selections are opaque, issued compendium identities from prompt
// through creation. These assertions cover name collisions, forged IDs,
// vanished sources, and PF2e's property-rune grade pruning before price/slots.
// Run: node scripts/item-builder.runeIdentity.test.mjs
import assert from "node:assert/strict";
import { SETTINGS } from "./settings.mjs";
import { issueCandidate } from "./compendium.mjs";

const system = (price, level, extra = {}) => ({
  price: { value: { gp: price } }, level: { value: level }, ...extra
});
const doc = (id, name, type, data) => ({
  name, type, system: data,
  toObject: () => ({ _id: id, name, type, system: structuredClone(data) })
});
const primary = new Map([
  ["longsword", doc("longsword", "Longsword", "weapon", system(1, 0, {
    runes: { potency: 0, striking: 0, property: [] },
    traits: { rarity: "common", value: ["martial"] }, description: { value: "Primary." }
  }))],
  ["potency-2", doc("potency-2", "Weapon Potency (+2)", "equipment", system(100, 10))],
  ["flaming", doc("flaming", "Flaming", "equipment", system(50, 8))]
]);
const homebrew = new Map([
  ["longsword", doc("longsword", "Longsword", "weapon", system(7, 1, {
    runes: { potency: 0, striking: 0, property: [] },
    traits: { rarity: "common", value: ["martial"] }, description: { value: "Homebrew." }
  }))],
  ["greater-flaming", doc("greater-flaming", "Flaming (Greater)", "equipment", system(250, 15, {
    usage: { value: "etched-onto-a-weapon" }
  }))]
]);
globalThis.game = {
  settings: { get: (_module, key) => key === SETTINGS.sourcePacks ? { equipment: ["pf2e.equipment-srd", "homebrew.runes"] } : null },
  i18n: { localize: (key) => key },
  packs: new Map([
    ["pf2e.equipment-srd", { getDocument: async (id) => primary.get(id) }],
    ["homebrew.runes", { getDocument: async (id) => homebrew.get(id) }]
  ])
};
globalThis.foundry = { utils: { escapeHTML: (value) => String(value), deepClone: structuredClone } };

let dropNativeRune = false;
// This stub represents the native system boundary, not a reproduction of
// its valuation algorithm. Its output intentionally differs from source gp.
globalThis.CONFIG = { Item: { documentClass: class {
  constructor(data) {
    this.system = data.system;
    if (dropNativeRune) this.system.runes.property = [];
    this.system.price.value = { gp: 7435 };
    this.level = 15; this.rarity = "uncommon"; this.price = this.system.price;
  }
} } };
const { normalizeRunedItemConcept, buildRunedItem, preflightRunedItem } = await import("./item-builder.mjs");
const { prunePropertyRuneCandidates } = await import("./runes.mjs");
const candidate = (packId, id, name, fields = {}) => issueCandidate({ packId, _id: id }, { name, ...fields });
const bases = [
  candidate("pf2e.equipment-srd", "longsword", "Longsword", { level: 0, category: null }),
  candidate("homebrew.runes", "longsword", "Longsword", { level: 1, category: null })
];
const potency = candidate("pf2e.equipment-srd", "potency-2", "Weapon Potency (+2)", { tier: 2, level: 10 });
const runes = [
  candidate("pf2e.equipment-srd", "flaming", "Flaming", { level: 8, usage: "etched-onto-a-weapon" }),
  candidate("homebrew.runes", "greater-flaming", "Flaming (Greater)", { level: 15, usage: "etched-onto-a-weapon" })
];
const args = {
  kind: "weapon", rarity: "common", baseCandidates: bases, runeCandidates: runes,
  potencyCandidates: [potency], secondaryCandidates: []
};

const normalized = normalizeRunedItemConcept({
  // The two base names are intentionally identical. Only this issued ID can
  // select the homebrew source whose base price is 7 gp.
  baseItemId: bases[1].id, potencyRuneId: potency.id, secondaryRuneId: "none",
  propertyRuneIds: [runes[0].id, runes[1].id], description: "A test blade."
}, args);
assert.equal(normalized.baseItemCandidate, bases[1], "normalization preserves the exact selected duplicate-name source object");
assert.deepEqual(normalized.propertyRuneCandidates, [runes[1]],
  "a greater property rune replaces its lower same-family grade before the two-slot potency cap");

const built = await buildRunedItem(normalized);
assert.deepEqual(built.itemData.system.price, { value: { gp: 7 } }, "assembly clones the selected duplicate-name base, never a fuzzy first match");
assert.deepEqual(built.itemData.system.runes.property, ["greaterFlaming"], "assembly uses the retained highest property grade");
assert.equal(built.preview.priceGp, 7435, "native prepared price owns preview even when selected source prices differ");
assert.equal(built.preview.rarity, "uncommon");
assert.equal(built.preview.level, 15, "preview level uses the retained highest-grade source document");

assert.throws(() => normalizeRunedItemConcept({
  baseItemId: "c-forged", potencyRuneId: potency.id, secondaryRuneId: "none", propertyRuneIds: [], description: "Forged."
}, args), /not one of this Forge run/, "a forged opaque ID cannot select a component by name or path");

const order = ["Flaming", "Frost", "Flaming (Greater)"].map((name) => ({ name }));
assert.deepEqual(prunePropertyRuneCandidates(order), order.slice(1), "surviving grades retain native order before slot capping");
const dread = ["Dread (Lesser)", "Dread (Moderate)"].map((name) => ({ name }));
assert.deepEqual(prunePropertyRuneCandidates(dread), dread, "distinct native lesser/moderate keys are not guessed to be interchangeable");
dropNativeRune = true;
await assert.rejects(buildRunedItem(normalized), /could not prepare every selected rune/);
dropNativeRune = false;
await assert.rejects(buildRunedItem({ ...normalized, maxLevel: 10 }), /exceeds the requested level/);
homebrew.get("longsword").system.specific = { value: true };
await assert.rejects(preflightRunedItem(normalized), /became a specific magic item/);
delete homebrew.get("longsword").system.specific;
homebrew.get("greater-flaming").system.level.value = 20;
await assert.rejects(preflightRunedItem(normalized), /no longer available/);
homebrew.get("greater-flaming").system.level.value = 15;
const NativeItem = CONFIG.Item.documentClass;
CONFIG.Item.documentClass = null;
await assert.rejects(buildRunedItem(normalized), /preparation is unavailable/);
CONFIG.Item.documentClass = NativeItem;
homebrew.delete("greater-flaming");
await assert.rejects(preflightRunedItem(normalized), /no longer available/, "a source that disappears after preview blocks Create");

console.log("runed Forge identity, grade pruning, and preflight assertions passed");
