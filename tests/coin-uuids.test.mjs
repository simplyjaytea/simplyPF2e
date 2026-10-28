// The four published coin ids live once, in loot-actor.mjs COIN_UUIDS. builder.mjs
// must derive its lookups from that table, and the full UUIDs must stay in a
// scripts/*.mjs file where the drift check can see them.
// Run: node tests/coin-uuids.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COIN_UUIDS, COIN_PACK_ID, coinEntry } from "../scripts/loot-actor.mjs";

const BARE_IDS = {
  pp: "JuNPeK5Qm1w6wpb4",
  gp: "B6B7tBWJSqOBz5zz",
  sp: "5Ew82vBF9YfaiY9f",
  cp: "lzJ8AVhRcbFul5fh"
};
const read = (name) => readFileSync(new URL(`../scripts/${name}`, import.meta.url), "utf8");
const builder = read("builder.mjs");
const loot = read("loot-actor.mjs");

assert.equal(COIN_PACK_ID, "pf2e.equipment-srd");
for (const [denomination, id] of Object.entries(BARE_IDS)) {
  assert.equal(COIN_UUIDS[denomination], `Compendium.pf2e.equipment-srd.Item.${id}`,
    `${denomination} keeps its published full UUID`);
  assert.deepEqual(coinEntry(denomination), { packId: "pf2e.equipment-srd", _id: id },
    `${denomination} lookup entry is derived from the single table`);
  assert.ok(loot.includes(`Compendium.pf2e.equipment-srd.Item.${id}`),
    `${denomination} full UUID stays in loot-actor.mjs where the drift check scans it`);
  assert.ok(!builder.includes(id), `${denomination} bare id is not copied into builder.mjs`);
}
assert.match(builder, /import \{ coinEntry \} from "\.\/loot-actor\.mjs";/,
  "builder.mjs imports the coin lookup from the module that owns the table");

for (const bad of ["", "pp ", "platinum", "__proto__", "toString", undefined]) {
  assert.throws(() => coinEntry(bad), /not a coin denomination/, `coinEntry rejects ${String(bad)}`);
}

console.log("coin-uuids.test.mjs: one coin id table, derived lookups, no bare-id copy in builder.mjs");
