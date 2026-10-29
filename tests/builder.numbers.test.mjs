// Invariant 4 (PLAYBOOK §3): the AI never writes a number the module can
// compute. Speeds and senses ranges come from fixed lists, the AI writes no
// prices or coin amounts, and an item with no compendium match is dropped
// (never embedded as a priced custom item). Coins and treasure value come from
// the budget logic over real compendium items.
// Run: node tests/builder.numbers.test.mjs

import assert from "node:assert/strict";

const PACK = "pf2e.equipment-srd";
const GOLD_ID = "B6B7tBWJSqOBz5zz";

function doc(id, name, type, system) {
  return {
    _id: id, name, type,
    uuid: `Compendium.${PACK}.Item.${id}`,
    system: { level: { value: 0 }, traits: { value: [], rarity: "common" }, ...system },
    toObject() {
      return { name: this.name, type: this.type, img: "icons/svg/item-bag.svg", system: structuredClone(this.system) };
    }
  };
}

const docs = [
  doc(GOLD_ID, "Gold Pieces", "treasure", { category: "coin", price: { value: { gp: 1 } } }),
  doc("longsword", "Longsword", "weapon", { price: { value: { gp: 1 } } }),
  doc("chainmail", "Chain Mail", "armor", { price: { value: { gp: 40 } } }),
  doc("healing", "Healing Potion (Minor)", "consumable", { level: { value: 1 }, price: { value: { gp: 4 } } }),
  doc("tools", "Thieves' Tools", "tool", { price: { value: { gp: 5 } } })
];
const byId = new Map(docs.map((d) => [d._id, d]));
const pack = {
  getIndex: async () => docs.map((d) => ({ _id: d._id, name: d.name, type: d.type, system: structuredClone(d.system) })),
  getDocument: async (id) => byId.get(id) ?? null
};
// The attack-trait catalog the strike normalizer validates against.
globalThis.CONFIG = { PF2E: { npcAttackTraits: { agile: "", "thrown-20": "" }, attackEffects: {}, damageTypes: { bludgeoning: "" } } };
globalThis.game = {
  settings: { get: () => undefined },
  i18n: { localize: (key) => key },
  packs: { get: (id) => (id === PACK ? pack : undefined) }
};

const { normalizeConcept, normalizeLoot, resolveLoot, resolveEquipment, applyTreasureBudget, lootValueGp, equipmentValueGp } =
  await import("../scripts/builder.mjs");

/** Capture console.warn while running fn; returns the captured messages. */
async function warnings(fn) {
  const seen = [];
  const original = console.warn;
  console.warn = (...args) => seen.push(args.join(" "));
  try { await fn(); } finally { console.warn = original; }
  return seen;
}

const concept = (raw) => normalizeConcept({ name: "Test Creature", ...raw }, { level: 3, rarity: "common" });

/* ---- speeds: fixed list per movement type; off-list dropped, land default kept ---- */
{
  const c = concept({ speeds: [
    { type: "land", value: 25 }, { type: "fly", value: 35 }, { type: "land", value: 27 },
    { type: "swim", value: 45 }, { type: "climb", value: 40 }, { type: "burrow", value: 30 }, { type: "land", value: 0 }
  ] });
  assert.deepEqual(c.speeds, [
    { type: "land", value: 25 }, { type: "fly", value: 35 }, { type: "climb", value: 40 }, { type: "burrow", value: 30 }
  ], "only listed values survive; 27 ft land, 45 ft swim and 0 ft land are dropped, never rounded");
  assert.deepEqual(concept({ speeds: [{ type: "land", value: 27 }] }).speeds, [{ type: "land", value: 25 }],
    "when no listed speed survives, the land default 25 ft stays");
  assert.deepEqual(concept({ speeds: [{ type: "burrow", value: 35 }, { type: "land", value: 40 }] }).speeds,
    [{ type: "land", value: 40 }], "burrow stops at 30 ft, so a 35 ft burrow is dropped and land is kept");
}

/* ---- senses range: 30, 60, 120 or null ---- */
{
  const c = concept({ senses: [
    { type: "darkvision", range: 60 }, { type: "scent", acuity: "imprecise", range: 45 }, { type: "tremorsense", range: 120 }
  ] });
  assert.deepEqual(c.senses.map((s) => [s.type, s.range]), [["darkvision", 60], ["scent", null], ["tremorsense", 120]],
    "a listed range is kept; an off-list range (45 ft) becomes null, never a free number");
}

/* ---- strike ranges: fixed increments; thrown trait stays the real PF2e value ---- */
{
  const c = concept({ strikes: [
    { name: "shortbow", type: "ranged", range: 45 },
    { name: "longbow", type: "ranged", range: 60 },
    { name: "dagger", type: "melee", traits: ["thrown-20"], range: 999 }
  ] });
  assert.equal(c.strikes[0].range, null, "an off-list ranged increment (45 ft) is dropped");
  assert.equal(c.strikes[1].range, 60, "a listed ranged increment is kept");
  assert.equal(c.strikes[2].type, "ranged", "the thrown-20 trait still makes the strike ranged");
  assert.equal(c.strikes[2].range, 20, "the thrown trait's own number is the increment, whatever the AI wrote");
}

/* ---- AI loot and equipment carry no prices and no coin amounts ---- */
{
  const c = concept({
    equipment: [{ name: "Chain Mail", quantity: 1, value: 999 }],
    loot: [{ name: "Gold Coins", quantity: 500, value: 1 }, { name: "Healing Potion (Minor)", quantity: 50, value: 4 }]
  });
  assert.deepEqual(c.equipment, [{ name: "Chain Mail", quantity: 1 }], "equipment keeps no value field");
  assert.ok(!("value" in c.equipment[0]), "the AI price is never read");
  assert.deepEqual(c.loot, [{ name: "Healing Potion (Minor)", quantity: 10 }],
    "AI coin lines are dropped and named quantities stay capped at 10 (the documented carve-out)");
}
{
  assert.deepEqual(normalizeLoot([{ name: "Gold Coins", quantity: 35 }]), [], "normalizeLoot drops AI coin lines");
  assert.deepEqual(normalizeLoot([{ name: "Rope", quantity: 1, value: 50 }]), [{ name: "Rope", quantity: 1 }],
    "normalizeLoot keeps no value field");
}

/* ---- unmatched names are dropped with a warning, never priced ---- */
{
  let resolved;
  const seen = await warnings(async () => {
    resolved = await resolveLoot({ level: 3, loot: [
      { name: "Mysterious Relic", quantity: 1 }, { name: "Healing Potion (Minor)", quantity: 2 }
    ] });
  });
  assert.equal(resolved.length, 1, "the unmatched relic is dropped");
  assert.equal(resolved[0].name, "Healing Potion (Minor)");
  assert.equal(resolved[0].resolvedValue, 4, "the matched item carries its real compendium price per unit");
  assert.equal(seen.length, 1, "the drop is reported once");
  assert.match(seen[0], /Mysterious Relic/);
}
{
  let equipment;
  const seen = await warnings(async () => {
    equipment = await resolveEquipment({ level: 3, equipment: [
      { name: "Chain Mail", quantity: 1 }, { name: "Bespoke Trinket", quantity: 1 }
    ] });
  });
  assert.deepEqual(equipment.map((e) => e.name), ["Chain Mail"], "the unmatched trinket is dropped");
  assert.equal(equipment[0].entry?._id, "chainmail", "a matched item resolves to its real document");
  assert.equal(seen.length, 1, "the equipment drop is reported");
  assert.equal(await equipmentValueGp(equipment), 40, "equipment values at the real price only");
}

/* ---- a creature's wielded weapon (named by its strikes) still resolves ---- */
{
  const equipment = await resolveEquipment({ level: 3, equipment: [{ name: "Longsword", quantity: 1 }] });
  assert.equal(equipment[0]?.entry?._id, "longsword", "a weapon the creature wields resolves by name to its real document");
}

/* ---- the loot prompt asks for names only: no prices, no coin counts ---- */
{
  const { lootGuide } = await import("../scripts/ai.mjs");
  const guide = lootGuide("standard");
  assert.ok(!/"value"/.test(guide), "the loot guide must not ask for a value field");
  assert.ok(!/Gold Coins/.test(guide), "the loot guide must not ask the AI for coin counts");
  assert.match(guide, /module sets both/, "the guide says the module sets prices and coins");
}

/* ---- budgets: NPC loot and PC starting wealth land inside their table budget ---- */
{
  // NPC: a 4 gp potion against a 50 gp target. Coins pad the haul to the budget.
  const loot = await resolveLoot({ level: 3, loot: [{ name: "Healing Potion (Minor)", quantity: 1 }] });
  const padded = await applyTreasureBudget(loot, 50);
  const total = lootValueGp(padded);
  assert.ok(total >= 40 && total <= 60, `NPC loot must land within 20% of the 50 gp budget, got ${total}`);
  assert.ok(padded.some((line) => line.name === "Gold Pieces"), "the module adds Gold Pieces, not the AI");
}
{
  // PC: 40 gp of chain mail leaves no wealth for loot against 15 gp, so coins trim to zero.
  const gear = await resolveEquipment({ level: 3, equipment: [{ name: "Thieves' Tools", quantity: 1 }] });
  const remaining = Math.max(20 - await equipmentValueGp(gear), 0);
  const loot = await resolveLoot({ level: 3, loot: [{ name: "Healing Potion (Minor)", quantity: 1 }] });
  const padded = await applyTreasureBudget(loot, remaining);
  const total = lootValueGp(padded);
  assert.ok(total >= remaining * 0.8 && total <= remaining * 1.2,
    `PC loot must land within 20% of the ${remaining} gp remainder, got ${total}`);
}

console.log("builder.numbers.test.mjs: AI emits no prices or coins, enums hold, unmatched items drop, budgets land");
