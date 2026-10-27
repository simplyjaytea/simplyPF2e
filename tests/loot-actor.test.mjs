// WP2: pure pf2e loot actor source, coin clone guard and description escaping.
// Expected field names come from docs/plans/sprint-2026-10-27.md section 2.1-2.6, not from memory.
// Run: node tests/loot-actor.test.mjs

import assert from "node:assert/strict";
import {
  LOOT_ACTOR_IMG, LOOT_ITEM_TYPES, LOOT_MANIFEST, COIN_UUIDS, LOOT_NAME_MAX,
  coinItemSource, lootDescriptionHtml, buildLootActorSource,
} from "../scripts/loot-actor.mjs";

const item = (type, extra = {}) => ({ name: `${type} sample`, type, system: { rules: [], ...extra } });
const build = (overrides = {}) => buildLootActorSource({
  name: "Forged Loot",
  level: 0,
  descriptionLines: ["Spell consumables forged by SimplyPF2e."],
  items: [item("consumable")],
  ...overrides,
});

// 1. The actor source matches the plan 2.1 field map exactly.
const built = build();
assert.deepEqual(Object.keys(built.actor.system), ["details", "lootSheetType", "hiddenWhenEmpty"],
  "system writes only the loot data model fields");
assert.equal(built.actor.type, "loot");
assert.equal(built.actor.img, LOOT_ACTOR_IMG);
assert.equal(LOOT_ACTOR_IMG, "systems/pf2e/icons/default-icons/loot.svg");
assert.equal(built.actor.system.lootSheetType, "Loot");
assert.equal(built.actor.system.hiddenWhenEmpty, false);
assert.deepEqual(built.actor.system.details.level, { value: 0 });
assert.equal(built.actor.system.details.description, "<p>Spell consumables forged by SimplyPF2e.</p>");
assert.deepEqual(Object.keys(built.actor).sort(), ["img", "name", "system", "type"],
  "no ownership, no prototypeToken, no folder");
assert.ok(!("ownership" in built.actor));
assert.ok(!("prototypeToken" in built.actor));
assert.ok(!("folder" in built.actor));
assert.ok(!("attributes" in built.actor.system), "a loot actor source has no system.attributes");
assert.ok(!("traits" in built.actor.system), "a loot actor source has no system.traits");
assert.deepEqual(LOOT_MANIFEST, { complete: true });

// 2. Every one of the nine physical item types is accepted; spell, action and effect are not.
// Plan 2.5 lists: ammo, armor, backpack, book, consumable, equipment, shield, treasure, weapon.
const PHYSICAL = ["ammo", "armor", "backpack", "book", "consumable", "equipment", "shield", "treasure", "weapon"];
assert.deepEqual([...LOOT_ITEM_TYPES].sort(), [...PHYSICAL].sort());
for (const type of PHYSICAL) {
  assert.equal(build({ items: [item(type)] }).items[0].type, type, `${type} is a physical item type`);
}
for (const type of ["spell", "action", "effect"]) {
  assert.throws(() => build({ items: [item(type)] }), /cannot hold/, `${type} is not a physical item type`);
}

// 3. Rule Elements are refused; an empty rules array is fine (plan 3.3.1).
assert.throws(() => build({ items: [item("equipment", { rules: [{ key: "FlatModifier" }] })] }),
  /Rule Elements/, "an item carrying Rule Elements blocks the source");
assert.equal(build({ items: [item("equipment", { rules: [] })] }).items.length, 1);

// 4. The level is an integer of at least 0 (plan 2.1 NumberField min 0, integer true).
assert.throws(() => build({ level: -1 }), /level/, "-1 is below the loot level minimum");
assert.throws(() => build({ level: 1.5 }), /level/, "a fractional level is refused");
assert.equal(build({ level: 0 }).actor.system.details.level.value, 0);

// 5. Name: trimmed, non-empty, at most LOOT_NAME_MAX characters.
assert.equal(build({ name: "  Forged Loot  " }).actor.name, "Forged Loot", "the name is trimmed");
assert.equal(LOOT_NAME_MAX, 100);
assert.throws(() => build({ name: "x".repeat(101) }), /100 characters/, "a 101-character name is refused");
assert.equal(build({ name: "x".repeat(100) }).actor.name.length, 100);
assert.throws(() => build({ name: "" }), /non-empty name/, "an empty name is refused");
assert.throws(() => build({ name: "   " }), /non-empty name/, "a whitespace-only name is refused");
assert.throws(() => build({ name: 42 }), /text name/, "a non-string name is refused");

// 6. The description is escaped and proven enricher-inert (plan 2.9, PLAYBOOK invariant 5).
assert.throws(() => build({ descriptionLines: ["See @UUID[Compendium.pf2e.spells-srd.Item.fireball]{Fireball}."] }),
  /enricher/, "@UUID is refused");
assert.throws(() => build({ descriptionLines: ["Roll [[/r 1d4]] for the result."] }), /enricher/,
  "an inline roll is refused");
assert.throws(() => build({ descriptionLines: ["A stray @Check mention."] }), /enricher/, "an @ command is refused");
assert.equal(lootDescriptionHtml(["<b>bold</b>"]), "<p>&lt;b&gt;bold&lt;/b&gt;</p>", "markup is escaped");
assert.equal(lootDescriptionHtml(["One", "Two"]), "<p>One</p><p>Two</p>", "lines are separate paragraphs");
assert.throws(() => lootDescriptionHtml([]), /at least one line/, "an empty description is refused");
assert.throws(() => lootDescriptionHtml([""]), /non-blank/, "an empty line is refused");
assert.throws(() => build({ descriptionLines: [] }), /at least one line/);

// 7. The items must be a non-empty array.
assert.throws(() => build({ items: [] }), /at least one item/);
assert.throws(() => build({ items: undefined }), /at least one item/);

// 8. coinItemSource mirrors addCurrency (plan 2.6):
// published Gold Pieces (packs/pf2e/equipment/gold-pieces.json, _id B6B7tBWJSqOBz5zz),
// type treasure, system.category coin, price.value {gp: 1}, rules [].
const goldDoc = {
  _id: "B6B7tBWJSqOBz5zz",
  img: "systems/pf2e/icons/equipment/treasure/currency/gold-pieces.webp",
  name: "Gold Pieces",
  type: "treasure",
  system: {
    category: "coin",
    price: { value: { gp: 1 } },
    quantity: 1,
    rules: [],
    traits: { rarity: "common", value: [] },
  },
  _stats: { compendiumSource: COIN_UUIDS.gp },
};
assert.deepEqual(COIN_UUIDS, {
  pp: "Compendium.pf2e.equipment-srd.Item.JuNPeK5Qm1w6wpb4",
  gp: "Compendium.pf2e.equipment-srd.Item.B6B7tBWJSqOBz5zz",
  sp: "Compendium.pf2e.equipment-srd.Item.5Ew82vBF9YfaiY9f",
  cp: "Compendium.pf2e.equipment-srd.Item.lzJ8AVhRcbFul5fh",
}, "coin UUIDs match plan 2.6");
const goldStateBefore = structuredClone(goldDoc);
const gold = coinItemSource(goldDoc, "gp", 40);
assert.equal(gold.system.quantity, 40, "the requested quantity is written");
assert.ok(!("_id" in gold), "the clone drops _id like the native clone");
assert.equal(gold.type, "treasure");
assert.equal(gold._stats.compendiumSource, COIN_UUIDS.gp);
assert.deepEqual(goldDoc, goldStateBefore, "the published coin document is not mutated");

const coinVariant = (mutate) => {
  const copy = structuredClone(goldDoc);
  mutate(copy);
  return copy;
};
assert.throws(() => coinItemSource(goldDoc, "sp", 10), /not priced in sp/, "the denomination must match the price");
assert.throws(() => coinItemSource(coinVariant((coin) => { coin.system.category = "gem"; }), "gp", 10),
  /not coinage/, "a non-coin treasure is refused");
assert.throws(() => coinItemSource(coinVariant((coin) => { coin.system.price.value = { gp: 1, sp: 2 }; }), "gp", 10),
  /not priced in gp/, "a multi-denomination price is refused");
assert.throws(() => coinItemSource(coinVariant((coin) => {
  delete coin._stats;
}), "gp", 10), /not the published gp document/, "a coin without a compendium source is refused");
assert.throws(() => coinItemSource(coinVariant((coin) => {
  coin._stats.compendiumSource = COIN_UUIDS.sp;
}), "gp", 10), /not the published gp document/, "the wrong compendium source is refused");
assert.throws(() => coinItemSource(goldDoc, "gp", 0), /at least 1/, "quantity 0 is refused");
assert.throws(() => coinItemSource(goldDoc, "gp", 1.5), /whole number/, "a fractional quantity is refused");
assert.throws(() => coinItemSource({ ...goldDoc, type: "equipment" }, "gp", 1), /not a treasure item/);
assert.throws(() => coinItemSource(goldDoc, "credits", 1), /not a coin denomination/, "credits are not coins here");

// The legacy pre-8.4.1 pile still reads as coinage; the category field is the current one.
const legacyStack = coinVariant((coin) => {
  delete coin.system.category;
  coin.system.stackGroup = "coins";
});
assert.equal(coinItemSource(legacyStack, "gp", 5).system.quantity, 5);

// 9. Inputs are never mutated by buildLootActorSource, and the items are a deep clone.
const inputItems = [item("weapon", { price: { value: { gp: 2 } } }), item("treasure")];
const inputState = structuredClone(inputItems);
const builtTwice = build({ items: inputItems });
assert.deepEqual(inputItems, inputState, "build does not mutate its items");
assert.deepEqual(builtTwice.items, inputState, "the returned items equal the inputs");
assert.notEqual(builtTwice.items, inputItems, "the returned items are a copy");
assert.notEqual(builtTwice.items[0], inputItems[0], "the returned items are deep clones");
builtTwice.items[0].system.price.value.gp = 99;
assert.equal(inputItems[0].system.price.value.gp, 2, "editing the copy does not reach the input");

const descriptionState = ["A line"];
const nameState = "  Name  ";
build({ name: nameState, descriptionLines: descriptionState });
assert.deepEqual(descriptionState, ["A line"], "the description lines are not mutated");
assert.equal(nameState, "  Name  ", "the name is not mutated");

console.log("loot actor source: field map, item types, level, name, description, coin and clone checks passed");
