// Release QA F6: the three saves and Perception written to the actor, the treasure-budget band and coin-padding
// cap and the overshoot trim order, and the Recall Knowledge skill for an undead creature. Each assertion pins a
// value that a one-line mutation would change, and the expected values come from literal numbers or computeStats.
// Run: node tests/builder.releaseFixes.test.mjs
import assert from "node:assert/strict";
import { normalizeConcept, computeStats, createActor, applyTreasureBudget, lootValueGp, resolveEquipment, resolveLoot } from "../scripts/builder.mjs";

globalThis.game = { settings: { get: () => ({}) }, packs: new Map(), i18n: { localize: (key) => key, format: (key) => key } };
globalThis.foundry = { utils: { randomID: () => "test-id" } };
globalThis.CONST = { TOKEN_DISPLAY_MODES: { OWNER_HOVER: 20 } };
globalThis.Actor = { create: async (data) => ({ ...data, id: "created" }) };

const none = { abilities: [], feats: [], spells: [], focusSpells: [], equipment: [], loot: [] };
const baseRaw = { name: "Sentry", traits: ["humanoid"], description: "", spellcasting: null };

// 1. The saves and Perception as written to the actor. The scales are chosen so the four values differ, which
//    makes a swap between Fortitude, Reflex, Will and Perception visible.
{
  const concept = normalizeConcept({
    ...baseRaw,
    perceptionScale: "high",
    saveScales: { fortitude: "extreme", reflex: "low", will: "moderate" }
  }, { level: 5, rarity: "common" });
  const stats = computeStats(concept);
  const values = [stats.saves.fortitude, stats.saves.reflex, stats.saves.will, stats.perception];
  assert.equal(new Set(values).size, 4, `the fixture's four values must differ, got ${values}`);
  const { actor } = await createActor(concept, none);
  assert.equal(actor.system.saves.fortitude.value, stats.saves.fortitude, "Fortitude is written as computed");
  assert.equal(actor.system.saves.reflex.value, stats.saves.reflex, "Reflex is written as computed");
  assert.equal(actor.system.saves.will.value, stats.saves.will, "Will is written as computed");
  assert.equal(actor.system.perception.mod, stats.perception, "Perception is written as computed");
}

// 2. The treasure-budget band is 0.8x to 1.2x the target, both edges included. Inside the band nothing changes;
//    just outside, coin pads up or trims down. Padding is paid in whole coins as the Treasure parcel splits them
//    (pp at 100 gp and up, then gp, sp, cp). The wallet lines below exist with quantity 0 so the padding fills
//    them, and no coinage document is needed.
const gold = (quantity) => ({ name: "Gold Pieces", quantity, runes: {}, entry: null, resolvedValue: 1 });
const named = (value) => ({ name: "Healing Potion", quantity: 1, runes: {}, entry: null, resolvedValue: value });
const wallet = () => [
  { name: "Platinum Pieces", quantity: 0, runes: {}, entry: null, resolvedValue: 10 },
  { name: "Gold Pieces", quantity: 0, runes: {}, entry: null, resolvedValue: 1 },
  { name: "Silver Pieces", quantity: 0, runes: {}, entry: null, resolvedValue: 0.1 },
  { name: "Copper Pieces", quantity: 0, runes: {}, entry: null, resolvedValue: 0.01 }
];
const stack = (out, name) => out.find((l) => l.name === name)?.quantity ?? 0;
{
  // Exactly 0.8 x 1000 = 800 gp: inside the band, so no coin is added.
  const loot = [named(700), gold(100)];
  const before = JSON.stringify(loot);
  const out = await applyTreasureBudget(loot, 1000);
  assert.equal(lootValueGp(out), 800);
  assert.equal(out, loot, "a total exactly at 0.8x is inside the band: the same list comes back");
  assert.equal(JSON.stringify(out), before, "and it is untouched");
}
{
  // 799 gp: just below the band, so coin pads up by the 201 gp gap: 20 pp and 1 gp, as the parcel splits it.
  const out = await applyTreasureBudget([named(699), gold(100), ...wallet()], 1000);
  assert.equal(lootValueGp(out), 1000, "a total just below 0.8x pads with coin up to the target");
  assert.equal(stack(out, "Platinum Pieces"), 20, "the 200 gp of the gap is paid in whole platinum");
  assert.equal(stack(out, "Gold Pieces"), 101, "the last gold of the gap is paid in gold, on top of the existing gold");
}
{
  // Exactly 1.2 x 1000 = 1200 gp: inside the band, so no coin is trimmed.
  const loot = [named(1100), gold(100)];
  const before = JSON.stringify(loot);
  const out = await applyTreasureBudget(loot, 1000);
  assert.equal(out, loot, "a total exactly at 1.2x is inside the band: the same list comes back");
  assert.equal(JSON.stringify(out), before, "and it is untouched");
}
{
  // 1201 gp: just above the band, so the 201 gp excess is trimmed from coin, leaving the 1000 gp target.
  const out = await applyTreasureBudget([named(1000), gold(201)], 1000);
  assert.equal(lootValueGp(out), 1000, "a total just above 1.2x is trimmed back to the target");
  assert.equal(out.find((l) => l.name === "Gold Pieces"), undefined, "the trim removes the coin line it empties");
  assert.equal(out.find((l) => l.name === "Healing Potion").resolvedValue, 1000, "named items are never trimmed");
}

// 3. A large remainder is paid in exact whole coins across the denominations, so a generous level-20 PC's
//    168,000 gp target is met. Each stack holds at most 100000 coins; a remainder that needs more stacks than the
//    lines hold needs a coinage document, and without one the list is left as it was.
{
  const target = 168000;
  const out = await applyTreasureBudget([named(0), ...wallet()], target);
  assert.equal(lootValueGp(out), target, "a 168,000 gp target is met exactly");
  assert.equal(stack(out, "Platinum Pieces"), 16800, "the remainder is paid mostly in platinum, 100 gp and up");
  assert.equal(stack(out, "Gold Pieces") + stack(out, "Silver Pieces") + stack(out, "Copper Pieces"), 0,
    "no smaller coin is needed for a whole-platinum remainder");
}
{
  const out = await applyTreasureBudget([named(0), gold(0), ...wallet().slice(0, 1)], 125001);
  assert.equal(lootValueGp(out), 125001, "a target just above 125,000 gp is met exactly");
  assert.equal(stack(out, "Platinum Pieces"), 12500, "whole platinum first");
  assert.equal(stack(out, "Gold Pieces"), 1, "the single gold is the remainder");
}
{
  // 1,200,000 gp of padding needs 1 extra platinum stack beyond the one line the wallet holds, with no coinage
  // document available to create it: the list is left unpadded rather than paid in a different amount.
  const loot = [named(0), ...wallet()];
  const before = JSON.stringify(loot);
  const out = await applyTreasureBudget(loot, 1200000);
  assert.equal(JSON.stringify(out), before, "an unpayable remainder changes nothing");
}
{
  const out = await applyTreasureBudget([gold(1), ...wallet().slice(1)], 51);
  assert.equal(stack(out, "Gold Pieces"), 51, "a small gap pads exactly in gold");
}

// 4. Overshoot trims the biggest denomination first and never below zero.
{
  const pp = { name: "Platinum Pieces", quantity: 2, runes: {}, entry: null, resolvedValue: 10 };
  const coin = { name: "Gold Pieces", quantity: 100, runes: {}, entry: null, resolvedValue: 1 };
  const out = await applyTreasureBudget([pp, coin], 50);
  assert.equal(lootValueGp(out), 50, "the overshoot is trimmed to the target");
  assert.equal(out.find((l) => l.name === "Platinum Pieces"), undefined, "the platinum line is trimmed first, to zero");
  assert.equal(out.find((l) => l.name === "Gold Pieces").quantity, 50, "the gold line keeps what is left");
}

// 5. Recall Knowledge names the undead skill (religion), not the aberration skill (occultism).
{
  const undead = normalizeConcept({ ...baseRaw, traits: ["undead"], recallKnowledge: "Drains warmth." }, { level: 3, rarity: "common" });
  const { actor } = await createActor(undead, none);
  assert.match(actor.system.details.publicNotes, /<strong>Religion<\/strong> @Check\[type:religion\|dc:\d+\]/,
    "an undead creature is identified by Religion");
  const aberration = normalizeConcept({ ...baseRaw, traits: ["aberration"], recallKnowledge: "Shifts shape." }, { level: 3, rarity: "common" });
  const other = await createActor(aberration, none);
  assert.match(other.actor.system.details.publicNotes, /<strong>Occultism<\/strong> @Check\[type:occultism\|dc:\d+\]/,
    "an aberration is identified by Occultism");
}

// 6. An item with no compendium match is dropped and its name reported, for equipment and loot alike.
{
  const skippedEquipment = [];
  const equipment = await resolveEquipment({ level: 2, equipment: [{ name: "Phantom Lantern", quantity: 1 }] }, { skipped: skippedEquipment });
  assert.equal(equipment.length, 0, "an unmatched equipment name is dropped");
  assert.deepEqual([...skippedEquipment], ["Phantom Lantern"], "and reported as skipped");
  const skippedLoot = [];
  const loot = await resolveLoot({ level: 2, loot: [{ name: "Gleaming Rubble", quantity: 1 }] }, { skipped: skippedLoot });
  assert.equal(loot.length, 0, "an unmatched loot name is dropped");
  assert.deepEqual([...skippedLoot], ["Gleaming Rubble"], "and reported as skipped");
}

console.log("builder.releaseFixes.test.mjs: saves and Perception on the actor, the budget band, coin cap, trim order and undead recall are pinned");
