// The loot actor sheet type: "Loot" by default, "Merchant" only when asked, anything else refused.
// Run: node tests/loot-actor.sheet.test.mjs
import assert from "node:assert/strict";
import { LOOT_SHEET_TYPES, buildLootActorSource } from "../scripts/loot-actor.mjs";

const ITEM = { type: "consumable", name: "Scroll of Heal (Rank 1)", img: "x.webp", system: { quantity: 1, rules: [] } };
const build = (extra = {}) => buildLootActorSource({ name: "Chest", level: 1, descriptionLines: ["Loot"], items: [ITEM], ...extra });

// pf2e-8.5.0 data.ts choices, quoted in loot-actor.mjs.
assert.deepEqual([...LOOT_SHEET_TYPES], ["Loot", "Merchant"]);
assert.equal(build().actor.system.lootSheetType, "Loot", "omitting the sheet keeps the Loot default");
assert.equal(build({ lootSheetType: "Loot" }).actor.system.lootSheetType, "Loot");
assert.equal(build({ lootSheetType: "Merchant" }).actor.system.lootSheetType, "Merchant",
  "an explicit Merchant sheet is written to the create payload");
assert.deepEqual(Object.keys(build({ lootSheetType: "Merchant" }).actor.system).sort(), ["details", "hiddenWhenEmpty", "lootSheetType"],
  "the sheet choice adds no other system field");

for (const bad of ["Shop", "merchant", "", null, 0]) {
  assert.throws(() => build({ lootSheetType: bad }), /sheet must be one of Loot, Merchant/,
    `refuses sheet ${JSON.stringify(bad)} instead of writing it`);
}

console.log("loot-actor.sheet.test.mjs: Loot default, Merchant opt-in, unknown sheets refused");
