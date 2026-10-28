// Permanent slots, safety filters, valuables and assignment for a treasure parcel (part 2).
// The classification cases use real pf2e 8.5.0 documents in tests/fixtures/parcel (see its README).
// Run: node tests/treasure-permanent.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PERMANENT_REASON, WAND_RANK_MAX, planPermanentSlots, permanentEquipmentProblem, permanentDocumentProblem,
  permanentSourceProblem, valuableProblem, priceCopper, wandLevelForRank, wandRankForLevel, assignPermanentPicks,
  chooseValuable, rankByBrief
} from "../scripts/treasure-permanent.mjs";
import { partyTreasureForSize, partyTreasureRow, TREASURE_MAX_PARTY_LEVEL, PARTY_SIZE_MAX } from "../scripts/treasure-tables.mjs";
import { splitCurrencyCopper } from "../scripts/treasure-parcel.mjs";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/parcel/${name}.json`, import.meta.url), "utf8"));
const clone = (value) => structuredClone(value);

// Slot planning: rows 1-20 at party sizes 4 and 8.
for (let level = 1; level <= TREASURE_MAX_PARTY_LEVEL; level++) {
  const table = partyTreasureRow(level).permanent;
  const before = JSON.stringify(table);
  for (const size of [4, 8]) {
    const row = partyTreasureForSize(level, size);
    const slots = planPermanentSlots(row);
    const tableCount = table.reduce((sum, entry) => sum + entry.count, 0);
    const extraCount = size - 4 > 0 ? (size - 4) : 0;
    assert.equal(slots.length, tableCount + extraCount, `level ${level}, size ${size}: one slot per table count and per extra PC`);
    assert.equal(new Set(slots.map((slot) => slot.id)).size, slots.length, "slot ids are unique");
    assert.ok(slots.every((slot, index) => slot.id === `perm-${index + 1}`), "slot ids are stable perm-N in order");
    const ordinary = slots.filter((slot) => slot.source === "table");
    assert.equal(ordinary.length, tableCount);
    for (const slot of ordinary) assert.equal(slot.allowedLevels.length, 1, "a table slot allows exactly its item level");
    const extra = slots.filter((slot) => slot.source === "extra");
    assert.equal(extra.length, extraCount);
    for (const slot of extra) {
      const expected = [...new Set([level, Math.min(level + 1, TREASURE_MAX_PARTY_LEVEL)])];
      assert.deepEqual(slot.allowedLevels, expected, "an extra-PC slot allows the party level and the next, as one slot");
    }
  }
  assert.equal(JSON.stringify(table), before, `level ${level}: the table is not mutated by planning`);
}
assert.equal(TREASURE_MAX_PARTY_LEVEL, 20);
assert.equal(PARTY_SIZE_MAX, 8);
assert.deepEqual(planPermanentSlots(partyTreasureForSize(5, 4)).map((slot) => slot.allowedLevels), [[6], [6], [5], [5]],
  "level 5 at four PCs: two level-6 and two level-5 table slots");

// Wand levels: generic wands are item level 2r+1 for rank 1 to 9.
for (let rank = 1; rank <= WAND_RANK_MAX; rank++) {
  assert.equal(wandLevelForRank(rank), 2 * rank + 1);
  assert.equal(wandRankForLevel(2 * rank + 1), rank);
}
for (const bad of [0, 10, -1, 1.5]) assert.equal(wandLevelForRank(bad), null, `rank ${bad} has no wand`);
for (const level of [2, 4, 20, 21, 1, 0]) assert.equal(wandRankForLevel(level), null, `level ${level} is not a generic wand level`);

// Equipment filter on real documents (index-shaped and document-shaped).
const hearingAid = fixture("magical-hearing-aid");
assert.equal(permanentEquipmentProblem(hearingAid, 1, "common"), null, "a magical worn item at its level is eligible");
assert.equal(permanentDocumentProblem(hearingAid, 1, "common"), null, "and it carries no Rule Elements");
assert.equal(permanentEquipmentProblem(hearingAid, 2, "common"), "level", "a wrong level is refused");
assert.equal(permanentEquipmentProblem(fixture("cube-of-recall"), 19, "common"), null, "a level-19 item at level 19");
assert.equal(permanentEquipmentProblem(fixture("abysium-chunk"), 0, "rare"), "classification", "a precious material is mundane, not magical");
assert.equal(permanentEquipmentProblem(fixture("flaming"), 8, "common"), "attachment", "a fundamental rune is an attachment, not a permanent item");
assert.equal(permanentEquipmentProblem(fixture("wand-of-mercy-1st-rank"), 4, "common"), "classification", "a special published wand is excluded");
assert.equal(permanentEquipmentProblem(fixture("poisonous-cloak-type-i"), 6, "rare"), "classification", "a cursed item is excluded");
assert.equal(permanentEquipmentProblem(fixture("taletellers-ring"), 9, "rare"), "classification", "a cursed ring is excluded");
// Intelligent and artifact are each excluded on their own (real 8.5.0 documents). Each case also shows the
// same item passes once only the excluded trait differs, so the trait is what decides the outcome.
const quill = fixture("inquisitive-quill");
assert.equal(permanentEquipmentProblem(quill, 4, "unique"), "classification", "an intelligent item is excluded on its own");
const quillWithoutIntelligence = clone(quill);
quillWithoutIntelligence.system.traits.value = ["magical"];
quillWithoutIntelligence.system.price.value = { gp: 5 };
quillWithoutIntelligence.system.usage.value = "held-in-one-hand";
assert.equal(permanentEquipmentProblem(quillWithoutIntelligence, 4, "unique"), null, "the same item passes without the intelligent trait");
const theKeep = fixture("the-keep");
assert.equal(permanentEquipmentProblem(theKeep, 20, "unique"), "classification", "an artifact item is excluded on its own");
const keepWithoutArtifact = clone(theKeep);
keepWithoutArtifact.system.traits.value = ["invested", "magical"];
keepWithoutArtifact.system.price.value = { gp: 1 };
assert.equal(permanentEquipmentProblem(keepWithoutArtifact, 20, "unique"), null, "the same item passes without the artifact trait");
assert.equal(permanentEquipmentProblem(fixture("guiding-star-orb-heroic"), 20, "unique"), "classification", "an apex, artifact, intelligent orb is excluded");

// A tradition is a magic trait: an item whose only magic trait is arcane is accepted.
const arcaneOnly = clone(hearingAid);
arcaneOnly.system.traits.value = ["arcane"];
assert.equal(permanentEquipmentProblem(arcaneOnly, 1, "common"), null, "an arcane-only item is a magical item and is accepted");

// A non-coin price denomination makes the price unknown, even alongside a coin price.
const creditsPrice = clone(hearingAid);
creditsPrice.system.price.value = { gp: 5, credits: 2 };
assert.equal(permanentEquipmentProblem(creditsPrice, 1, "common"), "price", "a price with a non-coin denomination is refused");
assert.equal(priceCopper({ gp: 5, credits: 2 }), null, "priceCopper refuses a non-coin denomination");

assert.equal(permanentEquipmentProblem(fixture("magic-wand-1st-rank-spell"), 3, "common"), "type",
  "the generic wand template is a consumable and is only built through the wand path");

const cloak = fixture("aerial-cloak");
assert.equal(permanentEquipmentProblem(cloak, 3, "common"), null, "the index-shaped check passes it");
assert.equal(permanentDocumentProblem(cloak, 3, "common"), "rules", "the document check refuses a Rule Elements item");

// Rarity fails closed: an unknown value or an unknown cap is never at or below the cap.
const rareHearing = clone(hearingAid);
rareHearing.system.traits.rarity = "rare";
assert.equal(permanentEquipmentProblem(rareHearing, 1, "common"), "rarity");
assert.equal(permanentEquipmentProblem(rareHearing, 1, "rare"), null);
assert.equal(permanentEquipmentProblem(hearingAid, 1, "bogus"), "rarity", "an unknown Forge cap refuses");
const legendary = clone(hearingAid);
legendary.system.traits.rarity = "legendary";
assert.equal(permanentEquipmentProblem(legendary, 1, "unique"), "rarity", "an unknown item rarity is never offered");
const noUsage = clone(hearingAid);
noUsage.system.usage = {};
assert.equal(permanentEquipmentProblem(noUsage, 1, "common"), "attachment", "a missing usage fails closed");
const noTraits = clone(hearingAid);
delete noTraits.system.traits.value;
assert.equal(permanentEquipmentProblem(noTraits, 1, "common"), "classification", "missing traits fail closed");
assert.equal(permanentEquipmentProblem(null, 1, "common"), "malformed");
assert.equal(permanentEquipmentProblem({ ...clone(hearingAid), type: "weapon" }, 1, "common"), "type", "weapons are excluded");

// Prices are exact copper; anything not whole or not in pp/gp/sp/cp fails closed.
assert.equal(priceCopper({ sp: 5 }), 50);
assert.equal(priceCopper({ gp: 10 }), 1000);
assert.equal(priceCopper({ pp: 1, gp: 2, sp: 3, cp: 4 }), 1234);
assert.equal(priceCopper({ cp: 0, gp: 25, pp: 0, sp: 0 }), 2500, "zero denominations are ignored");
for (const bad of [{}, null, { gp: 1.5 }, { gp: -1 }, { foo: 1 }, { credits: 3 }]) {
  assert.equal(priceCopper(bad), null, `price ${JSON.stringify(bad)} is refused`);
}

// Valuables: the real agate and silk ceremonial armor pass; coins, rarity and price problems do not.
assert.equal(valuableProblem(fixture("agate"), "common"), null, "a published gem is a valuable");
assert.equal(valuableProblem(fixture("silk-ceremonial-armor"), "common"), null, "a published art object is a valuable");
assert.equal(priceCopper(fixture("agate").system.price.value), 50, "agate costs 5 sp (50 cp)");
const coinLike = clone(fixture("agate"));
coinLike.system.category = "coin";
assert.equal(valuableProblem(coinLike, "common"), "classification", "coinage is not a valuable");
const rareGem = clone(fixture("agate"));
rareGem.system.traits.rarity = "rare";
assert.equal(valuableProblem(rareGem, "common"), "rarity");
const priceless = clone(fixture("agate"));
priceless.system.price.value = {};
assert.equal(valuableProblem(priceless, "common"), "price");

// Exact arithmetic from the spec: 40 gp with a 5 sp agate leaves 39 gp 5 sp of coins, 40 gp in all.
const budget = 40 * 100;
const agate = priceCopper(fixture("agate").system.price.value);
assert.deepEqual(splitCurrencyCopper(budget - agate), { pp: 0, gp: 39, sp: 5, cp: 0 });
assert.equal(splitCurrencyCopper(budget - agate).gp * 100 + splitCurrencyCopper(budget - agate).sp * 10 + agate, budget,
  "coins plus the valuable add back to the budget exactly");
assert.deepEqual(splitCurrencyCopper(budget - budget), { pp: 0, gp: 0, sp: 0, cp: 0 }, "an exact-equality valuable leaves no coins");

// Assignment: valid picks fill, invalid picks never claim a slot, the first valid pick wins, neighbours are kept.
const slots = [
  { id: "perm-1", allowedLevels: [5], source: "table" },
  { id: "perm-2", allowedLevels: [5, 6], source: "extra" },
  { id: "perm-3", allowedLevels: [7], source: "table" },
  { id: "perm-4", allowedLevels: [9], source: "table" },
  { id: "perm-5", allowedLevels: [5], source: "table" }
];
const offered = new Map([
  ["c-five", { id: "c-five", level: 5 }],
  ["c-six", { id: "c-six", level: 6 }],
  ["c-seven", { id: "c-seven", level: 7 }]
]);
const outcome = assignPermanentPicks(slots, [
  { slotId: "perm-1", candidateId: "c-five" },
  { slotId: "perm-1", candidateId: "c-six" },
  { slotId: "perm-2", candidateId: "c-five" },
  { slotId: "perm-3", candidateId: "c-five" },
  { slotId: "perm-9", candidateId: "c-five" }
], offered);
assert.deepEqual(outcome.assignments.map(({ slot, candidate }) => [slot.id, candidate.id]), [
  ["perm-1", "c-five"], ["perm-2", "c-five"]
], "the same offered item fills two separate slots, each cloned on its own");
const unfilled = Object.fromEntries(outcome.unfilled.map(({ slot, reason }) => [slot.id, reason]));
assert.deepEqual(unfilled, {
  "perm-3": PERMANENT_REASON.INVALID_PICK,
  "perm-4": PERMANENT_REASON.NO_CANDIDATES,
  "perm-5": PERMANENT_REASON.NO_PICK
}, "each unfilled slot keeps its own reason; an invalid pick does not spread to other slots");
assert.ok(outcome.dropped.some((drop) => drop.reason === "duplicate-slot" && drop.slotId === "perm-1"),
  "a second pick for the same slot is dropped as a duplicate");
assert.ok(outcome.dropped.some((drop) => drop.reason === "unknown-slot" && drop.slotId === "perm-9"));
assert.ok(outcome.dropped.some((drop) => drop.reason === "unoffered-candidate" && drop.slotId === "perm-3"),
  "a candidate whose level is not allowed for the slot is refused");

const fabricated = assignPermanentPicks([{ id: "perm-1", allowedLevels: [5] }], [{ slotId: "perm-1", candidateId: "c-made-up" }], offered);
assert.equal(fabricated.assignments.length, 0, "a fabricated id never fills a slot");
assert.equal(fabricated.unfilled[0].reason, PERMANENT_REASON.INVALID_PICK);
assert.throws(() => assignPermanentPicks(slots, [], []), /Offered permanent candidates must be a Map/);

// Valuable choice: the first ranked candidate that fits; exact equality fits; nothing fitting is a reason.
assert.deepEqual(chooseValuable([{ copper: 0 }, { copper: 500, name: "a" }, { copper: 4000, name: "b" }], 4000).entry.name, "a");
assert.equal(chooseValuable([{ copper: 4000, name: "exact" }], 4000).entry.name, "exact", "exact equality is allowed");
assert.equal(chooseValuable([{ copper: 4000 }], 3999).reason, "too-expensive");
assert.equal(chooseValuable([], 3999).reason, "none-offered");
assert.throws(() => chooseValuable([{ copper: 1 }], 1.5), /whole, non-negative copper/);

// Brief ranking is deterministic: more keyword hits first, then name, then id.
const ranked = rankByBrief([
  { id: "b", name: "Fire Gem" },
  { id: "a", name: "Water Gem" },
  { id: "c", name: "Fire Opal", traits: ["fire"] }
], ["fire", "opal"]).map((entry) => entry.id);
assert.deepEqual(ranked, ["c", "b", "a"]);

// Build-time and Create-time checks are one predicate. An equipment source is judged as the pool was:
// the same type, level, rarity cap, traits and Rule Elements rules apply after Generate as before.
const built = clone(hearingAid);
assert.equal(permanentSourceProblem(built, [1], "common"), null, "a built equipment item that still passes is accepted");
assert.equal(permanentSourceProblem(built, [2], "common"), "level", "a level the slot does not allow is refused");
const withRule = clone(built);
withRule.system.rules = [{ key: "Fake" }];
assert.equal(permanentSourceProblem(withRule, [1], "common"), "rules", "a Rule Element added after Generate is refused");
const raised = clone(built);
raised.system.traits.rarity = "rare";
assert.equal(permanentSourceProblem(raised, [1], "common"), "rarity", "a rarity raised after Generate is refused against the Forge cap");
assert.equal(permanentSourceProblem(raised, [1], "rare"), null, "the same source passes under its own cap");
const asWeapon = clone(built);
asWeapon.type = "weapon";
assert.equal(permanentSourceProblem(asWeapon, [1], "common"), "type", "a changed item type is refused");
const intelligent = clone(built);
intelligent.system.traits.value = ["magical", "intelligent"];
assert.equal(permanentSourceProblem(intelligent, [1], "common"), "classification", "a source that gained an excluded trait is refused");
const wand = { type: "consumable", system: { category: "wand", level: { value: 3 }, traits: { rarity: "common", value: ["magical", "wand"] },
  price: { value: { gp: 60 } }, rules: [] } };
assert.equal(permanentSourceProblem(wand, [3], "common"), null, "a built generic wand at an allowed level passes");
assert.equal(permanentSourceProblem({ ...wand, system: { ...wand.system, rules: [{ key: "X" }] } }, [3], "common"), "rules");
assert.equal(permanentSourceProblem({ ...wand, system: { ...wand.system, traits: { rarity: "rare", value: ["magical", "wand"] } } }, [3], "common"), "rarity");
assert.equal(permanentSourceProblem(wand, [5], "common"), "level");
assert.equal(permanentSourceProblem({ ...wand, system: { ...wand.system, price: { value: {} } } }, [3], "common"), "price");
assert.equal(permanentSourceProblem(null, [1], "common"), "malformed");

console.log("treasure-permanent.test.mjs: slots for rows 1-20, real-document safety filters, valuables, exact assignment and boundaries passed");
