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

/* ---- speeds: fixed list per movement type (published maxima, pf2e 8.5.0); off-list snaps to nearest ---- */
{
  const speedsOf = (speeds) => concept({ speeds }).speeds;
  assert.deepEqual(speedsOf([{ type: "fly", value: 120 }]), [{ type: "fly", value: 120 }],
    "a fly-120 dragon keeps fly 120; it does not fall back to land 25");
  assert.deepEqual(speedsOf([{ type: "fly", value: 90 }]), [{ type: "fly", value: 90 }], "fly 90 is kept");
  assert.deepEqual(speedsOf([{ type: "swim", value: 60 }]), [{ type: "swim", value: 60 }], "swim 60 is kept");
  assert.deepEqual(speedsOf([{ type: "land", value: 22 }]), [{ type: "land", value: 20 }],
    "land 22 snaps to the nearest listed 20 ft, not dropped");
  // QA F4: the tie direction was untested ("<" -> "<=" survived). An exact midpoint takes the lower step.
  assert.deepEqual(speedsOf([{ type: "land", value: 22.5 }]), [{ type: "land", value: 20 }],
    "land 22.5 is exactly between 20 and 25 and takes the lower 20");
  assert.deepEqual(speedsOf([{ type: "fly", value: 62.5 }]), [{ type: "fly", value: 60 }],
    "fly 62.5 is exactly between 60 and 65 and takes the lower 60");
  assert.deepEqual(speedsOf([{ type: "land", value: 27 }, { type: "burrow", value: 35 }]),
    [{ type: "land", value: 25 }, { type: "burrow", value: 35 }],
    "27 ft land snaps to 25; a 35 ft burrow is inside the 60 ft burrow list and is kept");
  assert.deepEqual(speedsOf([{ type: "burrow", value: 75 }]), [{ type: "burrow", value: 60 }],
    "a 75 ft burrow snaps to the 60 ft list top");
  assert.deepEqual(speedsOf([{ type: "land", value: 0 }, { type: "fly", value: -10 }, { type: "swim", value: "fast" }]),
    [{ type: "land", value: 25 }], "nonsense speeds (0, negative, non-numeric) are dropped; the land default stays");
  assert.deepEqual(speedsOf([{ type: "teleport", value: 30 }, { type: "land", value: 40 }]), [{ type: "land", value: 40 }],
    "an unknown movement type is dropped");
}

/* ---- speed list maxima: each top kept, one step over snaps back to the top ---- */
{
  for (const [type, top] of [["land", 120], ["fly", 240], ["swim", 100], ["climb", 60], ["burrow", 60]]) {
    assert.deepEqual(concept({ speeds: [{ type, value: top }] }).speeds, [{ type, value: top }],
      `${type} ${top} is the published maximum and stays`);
    assert.deepEqual(concept({ speeds: [{ type, value: top + 5 }] }).speeds, [{ type, value: top }],
      `${type} ${top + 5} is over the maximum and snaps to ${top}`);
  }
  assert.deepEqual(concept({ speeds: [{ type: "fly", value: 60 }] }).speeds, [{ type: "fly", value: 60 }],
    "fly 60 is a listed step (it was the old cap, and the QA boundary) and stays");
}

/* ---- senses range: steps of 5 to 1000 (published maximum); off-list snaps; nonsense is null ---- */
{
  const c = concept({ senses: [
    { type: "darkvision", range: 60 }, { type: "scent", acuity: "imprecise", range: 45 }, { type: "tremorsense", range: 62 }
  ] });
  assert.deepEqual(c.senses.map((s) => [s.type, s.range]), [["darkvision", 60], ["scent", 45], ["tremorsense", 60]],
    "listed ranges are kept and an off-list range snaps to the nearest 5 ft step (62 becomes 60)");
  assert.deepEqual(concept({ senses: [{ type: "darkvision", range: 52.5 }] }).senses.map((s) => s.range), [50],
    "a sense range exactly between 50 and 55 takes the lower 50 (the same tie rule as speeds)");
  const nonsense = concept({ senses: [{ type: "scent", range: -30 }, { type: "tremorsense", range: "far" }] });
  assert.deepEqual(nonsense.senses.map((s) => [s.type, s.range]), [["scent", null], ["tremorsense", null]],
    "a nonsense sense range (negative, non-numeric) becomes null; the sense itself stays");
  assert.deepEqual(concept({ senses: [{ type: "lifesense", range: 1000 }] }).senses.map((s) => s.range), [1000],
    "lifesense 1000 ft, the published maximum, is kept");
  assert.deepEqual(concept({ senses: [{ type: "lifesense", range: 1005 }] }).senses.map((s) => s.range), [1000],
    "a range over the 1000 ft maximum snaps to 1000");
}

/* ---- strike ranges: fixed increments snap to nearest; thrown trait stays the real PF2e value ---- */
{
  const c = concept({ strikes: [
    { name: "shortbow", type: "ranged", range: 45 },
    { name: "longbow", type: "ranged", range: 60 },
    { name: "dagger", type: "melee", traits: ["thrown-20"], range: 999 }
  ] });
  assert.equal(c.strikes[0].range, 40, "an off-list ranged increment (45 ft) snaps to the nearest listed 40 ft");
  assert.equal(c.strikes[1].range, 60, "a listed ranged increment is kept");
  assert.equal(c.strikes[2].type, "ranged", "the thrown-20 trait still makes the strike ranged");
  assert.equal(c.strikes[2].range, 20, "the thrown trait's own number is the increment, whatever the AI wrote");
  const ranged = (range) => concept({ strikes: [{ name: "bow", type: "ranged", range }] }).strikes[0].range;
  assert.equal(ranged(150), 150, "a listed 150 ft increment is kept");
  assert.equal(ranged(200), 200, "the strike list maximum 200 ft is kept");
  assert.equal(ranged(250), 200, "a ranged increment over 200 ft snaps to 200");
  assert.equal(ranged(-10), null, "a nonsense increment (negative) is dropped to the sheet default");
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
