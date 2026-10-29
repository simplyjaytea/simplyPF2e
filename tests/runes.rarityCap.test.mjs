// The Forge's chosen rarity caps its runed-item pools: base weapons/armor, property runes and fundamental rune tiers.
// Exercises the production functions over a mock equipment pack index (as item-builder.runeCategory.test.mjs).
// Run: node tests/runes.rarityCap.test.mjs
import assert from "node:assert/strict";
import { getBaseItemCandidates, getFundamentalRuneTiers, getPropertyRuneCandidates } from "../scripts/runes.mjs";

const entry = (_id, name, type, system, rarity) => ({ _id, name, type, system: { ...system, ...(rarity ? { traits: { rarity } } : {}) } });
const indexEntries = [
  entry("longsword", "Longsword", "weapon", { level: { value: 0 } }, "common"),
  entry("kris", "Kris", "weapon", { level: { value: 0 } }, "uncommon"),
  entry("katar-rare", "Rare Blade", "weapon", { level: { value: 0 } }, "rare"),
  entry("untagged", "Plain Mace", "weapon", { level: { value: 0 } }),
  entry("bogus", "Bogus Blade", "weapon", { level: { value: 0 } }, "bogus"),
  entry("flaming", "Flaming", "equipment", { level: { value: 8 }, usage: { value: "etched-onto-a-weapon" } }, "common"),
  entry("ghost", "Ghost Touch", "equipment", { level: { value: 4 }, usage: { value: "etched-onto-a-weapon" } }, "uncommon"),
  entry("vorpal", "Vorpal", "equipment", { level: { value: 17 }, usage: { value: "etched-onto-a-weapon" } }, "rare"),
  entry("pot1", "Weapon Potency (+1)", "equipment", { level: { value: 2 } }, "common"),
  entry("pot2", "Weapon Potency (+2)", "equipment", { level: { value: 10 } }, "uncommon"),
  entry("str1", "Striking", "equipment", { level: { value: 4 } }, "common"),
  entry("str2", "Striking (Greater)", "equipment", { level: { value: 12 } }, "rare")
];
globalThis.game = { settings: { get: () => ({}) }, packs: new Map([["pf2e.equipment-srd", { getIndex: async () => indexEntries }]]) };

const names = (list) => list.map((candidate) => candidate.name);

// No cap: nothing is filtered (existing callers and the unlimited default).
assert.deepEqual(names(await getBaseItemCandidates("weapon", 20)), ["Bogus Blade", "Kris", "Longsword", "Plain Mace", "Rare Blade"]);
assert.deepEqual(names(await getBaseItemCandidates("weapon", 20, { maxRarity: null })), ["Bogus Blade", "Kris", "Longsword", "Plain Mace", "Rare Blade"]);

// Base items: common keeps common and rarity-less (default common); uncommon adds Kris; rare adds Rare Blade.
assert.deepEqual(names(await getBaseItemCandidates("weapon", 20, { maxRarity: "common" })), ["Longsword", "Plain Mace"]);
assert.deepEqual(names(await getBaseItemCandidates("weapon", 20, { maxRarity: "uncommon" })), ["Kris", "Longsword", "Plain Mace"]);
assert.deepEqual(names(await getBaseItemCandidates("weapon", 20, { maxRarity: "rare" })), ["Kris", "Longsword", "Plain Mace", "Rare Blade"]);
assert.ok(!names(await getBaseItemCandidates("weapon", 20, { maxRarity: "rare" })).includes("Bogus Blade"), "an unknown rarity is dropped when a cap is set");

// Property runes.
assert.deepEqual(names(await getPropertyRuneCandidates("weapon", 20, { maxRarity: "common" })), ["Flaming"]);
assert.deepEqual(names(await getPropertyRuneCandidates("weapon", 20, { maxRarity: "uncommon" })), ["Ghost Touch", "Flaming"]);
assert.deepEqual(names(await getPropertyRuneCandidates("weapon", 20, { maxRarity: "rare" })), ["Ghost Touch", "Flaming", "Vorpal"]);
assert.deepEqual(names(await getPropertyRuneCandidates("weapon", 20)), ["Ghost Touch", "Flaming", "Vorpal"], "no cap lists every rarity");

// Fundamental rune tiers: the capped tier drops, the level cap still applies on top.
const tiers = async (options) => {
  const result = await getFundamentalRuneTiers("weapon", 20, options);
  return { potency: result.potencyCandidates.map((c) => c.tier), secondary: result.secondaryCandidates.map((c) => c.tier) };
};
assert.deepEqual(await tiers(undefined), { potency: [1, 2], secondary: [1, 2] });
assert.deepEqual(await tiers({ maxRarity: "common" }), { potency: [1], secondary: [1] });
assert.deepEqual(await tiers({ maxRarity: "uncommon" }), { potency: [1, 2], secondary: [1] });
assert.deepEqual(await tiers({ maxRarity: "rare" }), { potency: [1, 2], secondary: [1, 2] });
assert.equal((await getFundamentalRuneTiers("weapon", 3, { maxRarity: "uncommon" })).potencyCandidates.length, 1, "the level cap still applies with a rarity cap");

console.log("runes.rarityCap.test.mjs: base items, property runes and rune tiers honor the Forge rarity");
