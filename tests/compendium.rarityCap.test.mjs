/* The generator's Max rarity setting (rarityCap) filters the feat, spell and equipment pools as it
 * already filters ancestries, backgrounds and heritages. With no cap, or the default "unique", every
 * pool is unchanged. Run: node tests/compendium.rarityCap.test.mjs */
import assert from "node:assert/strict";

const PACKS = { equipment: "test.equipment", spells: "test.spells", feats: "test.feats" };

const feat = (_id, name, rarity, extra = {}) => ({
  _id, name, type: "feat",
  system: { level: { value: 1 }, category: "skill", traits: { value: [], rarity }, prerequisites: { value: [] }, ...extra }
});
const feats = [
  feat("f-common", "Common Feat", "common"),
  feat("f-uncommon", "Uncommon Feat", "uncommon"),
  feat("f-rare", "Rare Feat", "rare"),
  feat("f-class", "Uncommon Class Feat", "uncommon", { category: "class", traits: { value: ["fighter"], rarity: "uncommon" } })
];

const spell = (_id, name, rarity, extra = {}) => ({
  _id, name, type: "spell",
  system: { level: { value: 1 }, traits: { value: [], traditions: ["divine"], rarity }, ...extra }
});
const spells = [
  spell("s-common", "Common Spell", "common"),
  spell("s-uncommon", "Uncommon Spell", "uncommon"),
  spell("s-rare", "Rare Spell", "rare"),
  spell("s-focus", "Rare Focus Spell", "rare", { traits: { value: ["focus"], traditions: [], rarity: "rare" } })
];

const equipment = [
  { _id: "e-common", name: "Common Blade", type: "weapon", system: { level: { value: 1 }, traits: { value: [], rarity: "common" } } },
  { _id: "e-uncommon", name: "Uncommon Blade", type: "weapon", system: { level: { value: 1 }, traits: { value: [], rarity: "uncommon" } } },
  { _id: "e-rare", name: "Rare Blade", type: "weapon", system: { level: { value: 1 }, traits: { value: [], rarity: "rare" } } },
  { _id: "t-rare", name: "Rare Gem", type: "treasure", system: { level: { value: 1 }, category: "gem", traits: { value: [], rarity: "rare" } } },
  { _id: "t-common", name: "Common Gem", type: "treasure", system: { level: { value: 1 }, category: "gem", traits: { value: [], rarity: "common" } } }
];

const packOf = (raws) => ({
  async getIndex() { return raws.map((raw) => structuredClone(raw)); }
});
const packs = new Map([
  [PACKS.equipment, packOf(equipment)],
  [PACKS.spells, packOf(spells)],
  [PACKS.feats, packOf(feats)]
]);
globalThis.game = {
  settings: { get: () => ({ ...PACKS, equipment: [PACKS.equipment], spells: [PACKS.spells], feats: [PACKS.feats] }) },
  packs: { get: (id) => packs.get(id) }
};

const compendium = await import("../scripts/compendium.mjs");
const names = (list) => list.map((candidate) => candidate.name).sort();

/* ---- feats ---- */
{
  const none = names(await compendium.getFeatCandidates({ level: 1, category: "skill" }));
  assert.deepEqual(none, ["Common Feat", "Rare Feat", "Uncommon Feat"], "no cap: every skill feat is offered, as before");
  assert.deepEqual(names(await compendium.getFeatCandidates({ level: 1, category: "skill", maxRarity: "unique" })), none,
    "the default unique cap changes nothing");
  assert.deepEqual(names(await compendium.getFeatCandidates({ level: 1, category: "skill", maxRarity: "common" })), ["Common Feat"],
    "a common cap leaves out uncommon and rare feats");
  assert.deepEqual(names(await compendium.getFeatCandidates({ level: 1, category: "skill", maxRarity: "uncommon" })), ["Common Feat", "Uncommon Feat"],
    "an uncommon cap keeps uncommon and drops rare");
}

/* ---- creature feats (class feats for the NPC catalog) ---- */
{
  const none = names(await compendium.getCreatureFeatCandidates({ level: 4 }));
  assert.ok(none.includes("Uncommon Class Feat"), "no cap: the uncommon class feat is offered");
  assert.ok(!names(await compendium.getCreatureFeatCandidates({ level: 4, maxRarity: "common" })).includes("Uncommon Class Feat"),
    "a common cap drops the uncommon class feat from the creature catalog");
}

/* ---- spells ---- */
{
  const none = names(await compendium.getSpellCandidates("divine", 1, []));
  assert.deepEqual(none, ["Common Spell", "Rare Spell", "Uncommon Spell"], "no cap: every divine rank-1 spell is offered");
  assert.deepEqual(names(await compendium.getSpellCandidates("divine", 1, [], null, { maxRarity: "unique" })), none,
    "the default unique cap changes nothing");
  assert.deepEqual(names(await compendium.getSpellCandidates("divine", 1, [], null, { maxRarity: "common" })), ["Common Spell"],
    "a common cap leaves out uncommon and rare spells");
  assert.deepEqual(names(await compendium.getSpellCandidates("divine", 1, [], null, { maxRarity: "uncommon" })), ["Common Spell", "Uncommon Spell"],
    "an uncommon cap keeps uncommon spells and drops rare ones");
}
{
  assert.deepEqual(names(await compendium.getFocusSpellCandidates(1, [])), ["Rare Focus Spell"], "no cap: the focus spell is offered");
  assert.deepEqual(names(await compendium.getFocusSpellCandidates(1, [], { maxRarity: "common" })), [],
    "a common cap leaves out a rare focus spell");
}

/* ---- equipment and loot ---- */
{
  const none = names(await compendium.getEquipmentCandidates(1, []));
  assert.deepEqual(none, ["Common Blade", "Rare Blade", "Uncommon Blade"], "no cap: every weapon is offered");
  assert.deepEqual(names(await compendium.getEquipmentCandidates(1, [], { maxRarity: "unique" })), none,
    "the default unique cap changes nothing");
  assert.deepEqual(names(await compendium.getEquipmentCandidates(1, [], { maxRarity: "common" })), ["Common Blade"],
    "a common cap leaves out uncommon and rare equipment");
  assert.deepEqual(names(await compendium.getLootCandidates(1, [])), ["Common Blade", "Common Gem", "Rare Blade", "Rare Gem", "Uncommon Blade"],
    "no cap: loot keeps the rare gem");
  assert.deepEqual(names(await compendium.getLootCandidates(1, [], { maxRarity: "common" })), ["Common Blade", "Common Gem"],
    "a common cap leaves out rare and uncommon loot");
}

console.log("compendium.rarityCap.test.mjs: a Max rarity cap filters feats, spells and equipment; no cap changes nothing");
