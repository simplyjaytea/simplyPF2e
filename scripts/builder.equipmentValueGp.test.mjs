// Regression check for the "PC equipment embeds at zero cost" bug: PC gear
// (unlike NPC gear, free by design) must be paid for out of starting wealth,
// so the loot budget needs the real gp value of the resolved equipment list
// BEFORE applyTreasureBudget runs. This checks builder.mjs's equipmentValueGp
// helper (base price via priceToGp on the resolved doc, plus real rune price
// via runes.mjs's runeGp — mirroring resolveLoot()'s resolvedValue logic
// exactly) and the generator-app.mjs deduction wiring around it.
// Run: node scripts/builder.equipmentValueGp.test.mjs
//
// equipmentValueGp touches getDocument (compendium.mjs) and runeGp (runes.mjs),
// both of which read `game.packs`/`game.settings` — so a minimal in-memory
// `game` mock is installed before importing builder.mjs, same pattern as the
// other Foundry-touching regression checks in this module.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/* ---- minimal Foundry `game` mock: one equipment pack with a plain item,
   a +1 potency rune, and a Striking rune, all with real-shaped price data. ---- */
const PACK_ID = "pf2e.equipment-srd";

const LONGSWORD = { _id: "longsword001", name: "Longsword", type: "weapon", system: { price: { value: { gp: 1 } } } };
const POTENCY_1 = { name: "Weapon Potency (+1)", type: "equipment", system: { level: { value: 2 }, price: { value: { gp: 35 } } } };
const STRIKING_1 = { name: "Striking", type: "equipment", system: { level: { value: 4 }, price: { value: { gp: 65 } } } };

const docsById = { [LONGSWORD._id]: LONGSWORD };

const equipmentPack = {
  getIndex: async () => [POTENCY_1, STRIKING_1].map((e) => ({ ...e })),
  getDocument: async (id) => docsById[id] ?? null
};

global.game = {
  settings: { get: () => undefined }, // -> getPacksFor falls back to DEFAULT_PACKS
  packs: { get: (id) => (id === PACK_ID ? equipmentPack : undefined) }
};

const { equipmentValueGp } = await import("./builder.mjs");

// A plain unrunned item resolves to its real base price × quantity.
const plain = [{ name: "Longsword", quantity: 2, value: 999, runes: { potency: 0, striking: 0, resilient: 0 }, entry: { packId: PACK_ID, _id: LONGSWORD._id, type: "weapon" } }];
assert.equal(await equipmentValueGp(plain), 2, "real base price (1 gp) x quantity (2) must win over the AI's own estimate (999)");

// A runed item adds the runes' own real price on top of the real base price
// (1 + 35 + 65 = 101), never the base price alone.
const runed = [{ name: "+1 striking longsword", quantity: 1, value: 5, runes: { potency: 1, striking: 1, resilient: 0 }, entry: { packId: PACK_ID, _id: LONGSWORD._id, type: "weapon" } }];
assert.equal(await equipmentValueGp(runed), 101, "a runed item must value at real base + real rune price, not the base alone");

// An unmatched name (no compendium entry) falls back to the AI's own gp estimate.
const unmatched = [{ name: "Bespoke Trinket", quantity: 3, value: 10, runes: { potency: 0, striking: 0, resilient: 0 }, entry: null }];
assert.equal(await equipmentValueGp(unmatched), 30, "an unresolved item must fall back to value x quantity, same as resolveLoot");

// Multiple lines sum together; empty/missing input is 0.
assert.equal(await equipmentValueGp([...plain, ...unmatched]), 32, "equipmentValueGp must sum every line");
assert.equal(await equipmentValueGp([]), 0, "an empty equipment list must value at 0");
assert.equal(await equipmentValueGp(undefined), 0, "a missing equipment list must value at 0, not throw");

/* ---- generator-app.mjs wiring: source-pattern checks, same technique as
   pc-builder.grants.test.mjs, since GeneratorApp extends a Foundry
   Application class and isn't importable outside a live world. ---- */
const appSource = await readFile(new URL("./generator-app.mjs", import.meta.url), "utf8");

assert.match(
  appSource,
  /equipmentGp\s*=\s*await equipmentValueGp\(resolved\.equipment\)/,
  "the PC pipeline must compute the resolved equipment's real gp value"
);
assert.match(
  appSource,
  /lootBudget\s*=\s*Math\.max\(wealthTarget\s*-\s*equipmentGp,\s*0\)/,
  "the loot budget must be the wealth target minus equipment value, floored at 0"
);
assert.match(
  appSource,
  /applyTreasureBudget\(resolved\.loot,\s*lootBudget\)/,
  "applyTreasureBudget must be called with the equipment-adjusted budget, not the raw wealth target"
);
assert.match(
  appSource,
  /if \(equipmentGp > wealthTarget\)[\s\S]{0,200}console\.warn/,
  "an equipment value that alone exceeds the wealth target must log a single console.warn"
);
assert.match(
  appSource,
  /coinGp > lootBudget \* 0\.25/,
  "the unspent-coin shortfall check must compare against the equipment-adjusted loot budget, not the raw wealth target"
);

// Duplicate names must be counted once — buildEquipmentItems({ dedup: true })
// drops repeated names at embed time, so the budget deduction must match.
{
  const dupes = [
    { name: "Longsword", quantity: 1, value: 1, runes: null, entry: null },
    { name: "Longsword", quantity: 1, value: 1, runes: null, entry: null },
    { name: "longsword", quantity: 1, value: 1, runes: null, entry: null }
  ];
  const gp = await equipmentValueGp(dupes);
  assert.equal(gp, 1, "repeated equipment names must be valued once, matching the dedup embed");
}

console.log("builder equipmentValueGp / PC wealth-deduction regression check: all assertions passed");
