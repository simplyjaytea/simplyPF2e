// Coin loot must clone published PF2e coinage documents (sheet currency),
// never the custom-treasure fallback. parseCoins only accepts the four
// PF2e denominations. Coins resolve even under exactContent because they
// are module-built, not AI-selected equipment.
// Run: node scripts/builder.coins.test.mjs

import assert from "node:assert/strict";

const GOLD_ID = "B6B7tBWJSqOBz5zz";
const SILVER_ID = "5Ew82vBF9YfaiY9f";
const COPPER_ID = "lzJ8AVhRcbFul5fh";
const PLATINUM_ID = "JuNPeK5Qm1w6wpb4";

function coinDoc(id, name, denom) {
  return {
    _id: id,
    name,
    type: "treasure",
    uuid: `Compendium.pf2e.equipment-srd.Item.${id}`,
    system: {
      category: "coin",
      quantity: 1,
      price: { value: { [denom]: 1 } },
      level: { value: 0 }
    },
    toObject() {
      return {
        name: this.name,
        type: this.type,
        img: `systems/pf2e/icons/equipment/treasure/currency/${name.toLowerCase().replaceAll(" ", "-")}.webp`,
        system: structuredClone(this.system)
      };
    }
  };
}

const docs = {
  [GOLD_ID]: coinDoc(GOLD_ID, "Gold Pieces", "gp"),
  [SILVER_ID]: coinDoc(SILVER_ID, "Silver Pieces", "sp"),
  [COPPER_ID]: coinDoc(COPPER_ID, "Copper Pieces", "cp"),
  [PLATINUM_ID]: coinDoc(PLATINUM_ID, "Platinum Pieces", "pp")
};

const index = Object.values(docs).map((doc) => ({
  _id: doc._id, name: doc.name, type: doc.type, system: { level: { value: 0 } }
}));

const equipmentPack = {
  getIndex: async () => index.map((entry) => ({ ...entry })),
  getDocument: async (id) => docs[id] ?? null
};

globalThis.game = {
  settings: { get: () => undefined },
  i18n: { localize: (key) => key },
  packs: { get: (id) => (id === "pf2e.equipment-srd" ? equipmentPack : undefined) }
};

const {
  parseCoins, isCoinageDocument, normalizeLoot, resolveLoot, buildLootItems, applyTreasureBudget
} = await import("./builder.mjs");

/* ---------------------------------------------------------------------- *
 * parseCoins: known denominations map to canonical names; unknown fail closed
 * ---------------------------------------------------------------------- */

{
  assert.deepEqual(parseCoins("Gold Coins"), { name: "Gold Pieces", count: null });
  assert.deepEqual(parseCoins("10 gold coins"), { name: "Gold Pieces", count: 10 });
  assert.deepEqual(parseCoins("150 gold pieces"), { name: "Gold Pieces", count: 150 });
  assert.deepEqual(parseCoins("20 gp"), { name: "Gold Pieces", count: 20 });
  assert.deepEqual(parseCoins("Gold Pieces"), { name: "Gold Pieces", count: null });
  assert.deepEqual(parseCoins("Silver Coins"), { name: "Silver Pieces", count: null });
  assert.deepEqual(parseCoins("5 sp"), { name: "Silver Pieces", count: 5 });
  assert.deepEqual(parseCoins("Copper Pieces"), { name: "Copper Pieces", count: null });
  assert.deepEqual(parseCoins("pp"), { name: "Platinum Pieces", count: null });
  assert.equal(parseCoins("Electrum Coins"), null, "unknown denomination is not currency");
  assert.equal(parseCoins("adamantine pieces"), null, "non-PF2e metal is not currency");
  assert.equal(parseCoins("Bag of Gold"), null, "incidental gold in a name is not a coin line");
  assert.equal(parseCoins("Scroll of Fear"), null);
  assert.deepEqual(
    normalizeLoot([{ name: "Gold Coins", quantity: 35, value: 1 }]),
    [{ name: "Gold Pieces", quantity: 35, value: 1 }],
    "normalizeLoot folds AI coin names onto the canonical published name"
  );
}

assert.equal(isCoinageDocument(docs[GOLD_ID]), true, "8.4.1 category:coin is coinage");
assert.equal(isCoinageDocument({ type: "treasure", system: { stackGroup: "coins", price: { value: { gp: 1 } } } }), true,
  "pre-8.4.1 stackGroup coins still counts as coinage");
assert.equal(isCoinageDocument({ type: "treasure", system: { price: { value: { gp: 12 } } } }), false,
  "ordinary treasure without coin category is not currency");

/* ---------------------------------------------------------------------- *
 * resolveLoot + exactContent still loads official coinage documents
 * ---------------------------------------------------------------------- */

{
  const resolved = await resolveLoot({
    level: 1,
    loot: normalizeLoot([
      { name: "Gold Coins", quantity: 35, value: 1 },
      { name: "Mysterious Relic", quantity: 1, value: 12 }
    ])
  }, { exactContent: true });
  assert.equal(resolved.length, 2);
  assert.equal(resolved[0].name, "Gold Pieces");
  assert.equal(resolved[0].quantity, 35);
  assert.equal(resolved[0].entry?._id, GOLD_ID, "coins resolve to the official Gold Pieces document under exactContent");
  assert.equal(resolved[0].resolvedValue, 1);
  assert.equal(resolved[1].entry, null, "named loot still cannot fuzzy-match under exactContent");
}

{
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  const resolved = await resolveLoot({
    level: 1,
    loot: [{ name: "Electrum Coins", quantity: 4, value: 2 }]
  }, { exactContent: true });
  console.warn = original;
  assert.equal(resolved.length, 1, "unknown denomination stays on the generic loot path");
  assert.equal(resolved[0].name, "Electrum Coins");
  assert.equal(resolved[0].entry, null);
  assert.equal(warnings.length, 0, "unknown denomination is not a coin drop; parseCoins already rejected it");
}

/* ---------------------------------------------------------------------- *
 * buildLootItems: coins become published coinage, never custom treasure
 * ---------------------------------------------------------------------- */

{
  const resolved = await resolveLoot({
    level: 1,
    loot: normalizeLoot([
      { name: "Gold Coins", quantity: 35, value: 1 },
      { name: "5 sp", quantity: 1, value: 0.1 }
    ])
  }, { exactContent: true });
  const items = await buildLootItems(resolved);
  assert.equal(items.length, 2);
  assert.equal(items[0].name, "Gold Pieces");
  assert.equal(items[0].type, "treasure");
  assert.equal(items[0].system.category, "coin");
  assert.equal(items[0].system.quantity, 35);
  assert.equal(items[0].system.price.value.gp, 1);
  assert.equal(items[0]._stats.compendiumSource, `Compendium.pf2e.equipment-srd.Item.${GOLD_ID}`);
  assert.equal(items[1].name, "Silver Pieces");
  assert.equal(items[1].system.category, "coin");
  assert.equal(items[1].system.quantity, 5);
  for (const item of items) {
    assert.equal(item.system.description?.value?.includes("CustomItem"), undefined,
      "coin loot must not carry the custom-treasure label");
  }
}

{
  await assert.rejects(buildLootItems([
    { name: "Gold Pieces", quantity: 12, value: 1, entry: null }
  ]), /Cannot create coin loot "Gold Pieces"/,
  "missing coinage must stop assembly before a partial actor is written");
}

{
  const items = await buildLootItems([
    { name: "Gold Pieces", quantity: 8, value: 1, entry: { packId: "pf2e.equipment-srd", _id: GOLD_ID } },
    { name: "Unmatched Gem", quantity: 1, value: 15, entry: null }
  ]);
  assert.equal(items[0].system.category, "coin");
  assert.equal(items[1].type, "treasure");
  assert.equal(items[1].system.category, undefined, "non-coin unmatched loot may still be custom treasure");
  assert.match(items[1].system.description.value, /CustomItem/);
}

/* ---------------------------------------------------------------------- *
 * applyTreasureBudget still pads/trims Gold Pieces against published coinage
 * ---------------------------------------------------------------------- */

{
  const loot = [
    { name: "Potion of Healing (Minor)", quantity: 1, resolvedValue: 4, entry: {} }
  ];
  const padded = await applyTreasureBudget(loot, 50);
  const gold = padded.find((line) => line.name === "Gold Pieces");
  assert.ok(gold, "budget shortfall creates a Gold Pieces line");
  assert.equal(gold.entry?._id, GOLD_ID, "padded coins retain the official coinage document");
  assert.equal(gold.quantity, 46);
  const items = await buildLootItems(padded.filter((line) => line.name === "Gold Pieces"));
  assert.equal(items[0].system.category, "coin");
  assert.equal(items[0].system.quantity, 46);
}

{
  const loot = [
    { name: "Gold Pieces", quantity: 10, resolvedValue: 1, entry: { packId: "pf2e.equipment-srd", _id: GOLD_ID } }
  ];
  const padded = await applyTreasureBudget(structuredClone(loot), 50);
  assert.equal(padded[0].quantity, 50, "an existing gold line is increased to close the gap");
  const trimmed = await applyTreasureBudget(structuredClone(loot), 4);
  assert.equal(trimmed[0].quantity, 4, "over-budget coin lines shrink, largest denomination first");
}

console.log("builder.coins.test.mjs: parseCoins, exactContent coinage clones, and budget padding passed");
