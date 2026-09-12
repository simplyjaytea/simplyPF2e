import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { priceForLevel, getUsageOptions } from "./item-builder.mjs";
import { capRunes, runeGp } from "./runes.mjs";

const boots = JSON.parse(readFileSync(new URL("../tests/fixtures/forge/boots-of-elvenkind.json", import.meta.url), "utf8"));
let selected;
const packs = new Map();
globalThis.game = { settings: { get: () => ({ equipment: [selected] }) }, packs };
// Deliberate custom-pack variants isolate source changes; their prices/levels
// are test values, not claims about published rune balance. Rules stay cloned.
function equipment(name, price, level, usage) {
  const item = structuredClone(boots);
  item.name = name;
  item._id = name;
  item.system.price.value = { gp: price };
  item.system.level.value = level;
  item.system.usage.value = usage;
  return item;
}
function select(id, entries) {
  selected = id;
  let calls = 0;
  const pack = { getIndex: async () => { calls++; return entries; } };
  packs.set(id, pack);
  return () => calls;
}

await test("forge price and usage follow current sources without refetching successful indexes", async () => {
  const callsA = select("qa.prices-a", Array.from({ length: 5 }, (_, i) => equipment(`A${i}`, 10, 5, "wornshoes")));
  assert.equal(await priceForLevel(5), 10);
  assert.deepEqual(await getUsageOptions(), ["wornshoes"]);
  const callsB = select("qa.prices-b", Array.from({ length: 5 }, (_, i) => equipment(`B${i}`, 100, 5, "worncloak")));
  assert.equal(await priceForLevel(5), 100);
  assert.deepEqual(await getUsageOptions(), ["worncloak"]);
  selected = "qa.prices-a";
  assert.equal(await priceForLevel(5), 10);
  assert.deepEqual(await getUsageOptions(), ["wornshoes"]);
  assert.equal(callsA(), 1);
  assert.equal(callsB(), 1);
});

await test("actor rune caps and budgets follow the current pack's level and price", async () => {
  const requested = { potency: 1, striking: 0 };
  select("qa.runes-a", [equipment("Weapon Potency (+1)", 35, 2, "etched-onto-a-weapon")]);
  assert.equal((await capRunes(requested, "weapon", 3)).potency, 1);
  assert.equal(await runeGp(requested, "weapon"), 35);
  select("qa.runes-b", [equipment("Weapon Potency (+1)", 70, 4, "etched-onto-a-weapon")]);
  assert.equal((await capRunes(requested, "weapon", 3)).potency, 0);
  assert.equal(await runeGp(requested, "weapon"), 70);
});

await test("temporary equipment failure does not freeze price, usage or rune fallback values", async () => {
  let failing = true;
  const entries = Array.from({ length: 5 }, (_, i) => equipment(i ? `Recovered${i}` : "Weapon Potency (+1)", 50, 5, "wornshoes"));
  selected = "qa.consumer-recovery";
  packs.set(selected, { getIndex: async () => {
    if (failing) throw new Error("temporary consumer index failure");
    return entries;
  } });
  assert.equal(await priceForLevel(5), 0);
  assert.deepEqual(await getUsageOptions(), ["worn"]);
  assert.equal(await runeGp({ potency: 1 }, "weapon"), 0);
  failing = false;
  assert.equal(await priceForLevel(5), 50);
  assert.deepEqual(await getUsageOptions(), ["wornshoes"]);
  assert.equal(await runeGp({ potency: 1 }, "weapon"), 50);
});
