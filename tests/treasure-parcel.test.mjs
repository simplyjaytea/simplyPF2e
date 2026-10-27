// Run: node tests/treasure-parcel.test.mjs
import assert from "node:assert/strict";
import {
  PARCEL_DROP, scrollRankForItemLevel, planParcelSlots, assignParcelPicks, stackParcelAssignments, parcelValueGp
} from "../scripts/treasure-parcel.mjs";

// Literal rows from docs/plans/sprint-2026-10-27.md §2.10 (GM Core Table 10-9, four PCs).
const LEVEL_1 = {
  level: 1, totalGp: 175,
  permanent: [{ level: 2, count: 2 }, { level: 1, count: 2 }],
  consumables: [{ level: 2, count: 2 }, { level: 1, count: 3 }],
  currencyGp: 40
};
const LEVEL_5 = {
  level: 5, totalGp: 1350,
  permanent: [{ level: 6, count: 2 }, { level: 5, count: 2 }],
  consumables: [{ level: 6, count: 2 }, { level: 5, count: 2 }, { level: 4, count: 2 }],
  currencyGp: 320
};
const LEVEL_20 = {
  level: 20, totalGp: 490000,
  permanent: [{ level: 20, count: 4 }],
  consumables: [{ level: 20, count: 4 }, { level: 19, count: 2 }],
  currencyGp: 140000
};

// Slot planning.
const one = planParcelSlots(LEVEL_1);
assert.equal(one.slots.length, 5, "level 1 has five consumable slots");
assert.deepEqual(one.slots.map((slot) => slot.rank), [1, 1, 1, 1, 1], "level 1 slots are all rank 1");
assert.deepEqual(one.slots.map((slot) => slot.id), ["slot-1", "slot-2", "slot-3", "slot-4", "slot-5"]);
assert.deepEqual(one.slots.map((slot) => slot.itemLevel), [2, 2, 1, 1, 1], "higher item levels come first");
assert.equal(one.partyLevel, 1);
assert.equal(one.currencyGp, 40);
assert.equal(one.totalGp, 175);
assert.deepEqual(one.permanent, LEVEL_1.permanent, "permanent is copied through, not built");
assert.deepEqual(one.permanentExtra, { count: 0, levels: [] }, "absent permanentExtra defaults to empty");

const five = planParcelSlots(LEVEL_5);
assert.deepEqual(five.slots.map((slot) => slot.rank), [3, 3, 3, 3, 2, 2], "level 5 ranks");
assert.deepEqual(five.slots.map((slot) => slot.itemLevel), [6, 6, 5, 5, 4, 4]);
assert.deepEqual(five.slots.map((slot) => slot.id), ["slot-1", "slot-2", "slot-3", "slot-4", "slot-5", "slot-6"]);

const twenty = planParcelSlots(LEVEL_20);
assert.equal(twenty.slots.length, 6, "level 20 has six consumable slots");
assert.deepEqual(twenty.slots.map((slot) => slot.rank), [10, 10, 10, 10, 10, 10], "level 19 and 20 both give rank 10");
assert.deepEqual(twenty.slots.map((slot) => slot.itemLevel), [20, 20, 20, 20, 19, 19]);

const withExtra = planParcelSlots({ ...LEVEL_1, permanentExtra: { count: 1, levels: [1, 2] } });
assert.deepEqual(withExtra.permanentExtra, { count: 1, levels: [1, 2] }, "a supplied permanentExtra passes through");

// Scroll rank per item level.
assert.equal(scrollRankForItemLevel(1), 1);
assert.equal(scrollRankForItemLevel(2), 1, "an even level gets the scroll one level lower");
assert.equal(scrollRankForItemLevel(3), 2);
assert.equal(scrollRankForItemLevel(19), 10);
assert.equal(scrollRankForItemLevel(20), 10, "rank is capped at 10");
assert.throws(() => scrollRankForItemLevel(0), /integer of at least 1/);
assert.throws(() => scrollRankForItemLevel(1.5), /integer of at least 1/);
assert.throws(() => scrollRankForItemLevel(NaN), /integer of at least 1/);

// Malformed rows fail closed.
assert.throws(() => planParcelSlots({ level: 1, totalGp: 175, currencyGp: 40 }), /consumables must be an array/, "missing consumables");
assert.throws(() => planParcelSlots({ ...LEVEL_1, consumables: { level: 1, count: 1 } }), /consumables must be an array/);
assert.throws(() => planParcelSlots({ ...LEVEL_1, consumables: [{ level: 1, count: -1 }] }), /Malformed consumable entry/, "negative count");
assert.throws(() => planParcelSlots({ ...LEVEL_1, level: 2.5 }), /level must be an integer/, "fractional party level");
assert.throws(() => planParcelSlots({ ...LEVEL_1, consumables: [{ level: 1, count: 1.5 }] }), /Malformed consumable entry/);
assert.throws(() => planParcelSlots({ ...LEVEL_1, currencyGp: NaN }), /currencyGp must be finite/);
assert.throws(() => planParcelSlots({ ...LEVEL_1, totalGp: Infinity }), /totalGp must be finite/);
assert.throws(() => planParcelSlots(null), /must be an object/);

// Pick assignment.
const slots = [
  { id: "slot-1", itemLevel: 2, rank: 1 },
  { id: "slot-2", itemLevel: 2, rank: 1 },
  { id: "slot-3", itemLevel: 1, rank: 1 },
  { id: "slot-4", itemLevel: 1, rank: 1 },
  { id: "slot-5", itemLevel: 1, rank: 1 }
];
const candidates = [
  { id: "light", rank: 1, name: "Light" },
  { id: "shield", rank: 1, name: "Shield" },
  { id: "fireball", rank: 3, name: "Fireball" }
];

assert.equal(PARCEL_DROP.UNKNOWN_SLOT, "unknown-slot");
assert.equal(PARCEL_DROP.DUPLICATE_SLOT, "duplicate-slot");
assert.equal(PARCEL_DROP.UNKNOWN_SPELL, "unknown-spell");
assert.equal(PARCEL_DROP.RANK_ABOVE_SLOT, "rank-above-slot");
assert.ok(Object.isFrozen(PARCEL_DROP));

const unknownSlot = assignParcelPicks(slots, [{ slotId: "slot-9", spellId: "light" }], candidates);
assert.deepEqual(unknownSlot.dropped, [{ slotId: "slot-9", spellId: "light", reason: PARCEL_DROP.UNKNOWN_SLOT }]);
assert.deepEqual(unknownSlot.assignments, []);

const duplicate = assignParcelPicks(slots, [
  { slotId: "slot-1", spellId: "light" },
  { slotId: "slot-1", spellId: "shield" }
], candidates);
assert.equal(duplicate.assignments[0].candidate.id, "light", "the first pick for a slot keeps it");
assert.deepEqual(duplicate.dropped, [{ slotId: "slot-1", spellId: "shield", reason: PARCEL_DROP.DUPLICATE_SLOT }]);

const unknownSpell = assignParcelPicks(slots, [{ slotId: "slot-2", spellId: "wish" }], candidates);
assert.deepEqual(unknownSpell.dropped, [{ slotId: "slot-2", spellId: "wish", reason: PARCEL_DROP.UNKNOWN_SPELL }]);
assert.equal(unknownSpell.unfilled.length, 5, "an unknown spell fills nothing");

const aboveRank = assignParcelPicks(slots, [
  { slotId: "slot-1", spellId: "fireball" },
  { slotId: "slot-1", spellId: "light" }
], candidates);
assert.deepEqual(aboveRank.dropped, [{ slotId: "slot-1", spellId: "fireball", reason: PARCEL_DROP.RANK_ABOVE_SLOT }]);
assert.equal(aboveRank.assignments[0].candidate.id, "light", "an invalid pick does not claim the slot");

const sameRank = assignParcelPicks([{ id: "slot-1", itemLevel: 5, rank: 3 }], [{ slotId: "slot-1", spellId: "fireball" }], candidates);
assert.equal(sameRank.assignments[0].candidate.id, "fireball", "a spell at exactly the slot rank is valid");

const partial = assignParcelPicks(slots, [
  { slotId: "slot-4", spellId: "shield" },
  { slotId: "slot-2", spellId: "light" }
], candidates);
assert.deepEqual(partial.assignments.map((item) => item.slot.id), ["slot-2", "slot-4"], "assignments keep slot order");
assert.deepEqual(partial.unfilled.map((slot) => slot.id), ["slot-1", "slot-3", "slot-5"], "unfilled slots are listed in slot order");
assert.deepEqual(partial.dropped, []);

for (const picks of [undefined, null, "none"]) {
  const empty = assignParcelPicks(slots, picks, candidates);
  assert.deepEqual(empty.assignments, [], "non-array picks are treated as empty");
  assert.deepEqual(empty.unfilled, slots, "everything is unfilled");
  assert.deepEqual(empty.dropped, []);
}

assert.throws(() => assignParcelPicks({}, [], candidates), /slots must be an array/);
assert.throws(() => assignParcelPicks(slots, [], undefined), /candidates must be an array/);

// Stacking.
const light = candidates[0];
const shield = candidates[1];
const sameRankStack = stackParcelAssignments([
  { slot: slots[0], candidate: light },
  { slot: slots[1], candidate: light }
]);
assert.deepEqual(sameRankStack, [{ candidate: light, rank: 1, quantity: 2, slotIds: ["slot-1", "slot-2"] }]);

const differentRank = stackParcelAssignments([
  { slot: { id: "slot-1", itemLevel: 2, rank: 1 }, candidate: light },
  { slot: { id: "slot-3", itemLevel: 4, rank: 2 }, candidate: light }
]);
assert.deepEqual(differentRank, [
  { candidate: light, rank: 1, quantity: 1, slotIds: ["slot-1"] },
  { candidate: light, rank: 2, quantity: 1, slotIds: ["slot-3"] }
], "the same spell at different slot ranks gives separate stacks");

const firstSeen = stackParcelAssignments([
  { slot: { id: "slot-1", itemLevel: 4, rank: 2 }, candidate: light },
  { slot: { id: "slot-2", itemLevel: 2, rank: 1 }, candidate: shield },
  { slot: { id: "slot-3", itemLevel: 4, rank: 2 }, candidate: light }
]);
assert.deepEqual(firstSeen.map((stack) => [stack.candidate.id, stack.rank, stack.quantity]), [
  ["light", 2, 2],
  ["shield", 1, 1]
], "stacks keep first-seen order");
assert.deepEqual(stackParcelAssignments([]), []);

// Value.
assert.equal(parcelValueGp({ items: [{ priceGp: 4, quantity: 2 }, { priceGp: 12, quantity: 1 }], currencyGp: 40 }), 60);
assert.equal(parcelValueGp({ items: [], currencyGp: 40 }), 40, "currency alone is the value");
assert.throws(() => parcelValueGp({ items: [{ priceGp: NaN, quantity: 1 }], currencyGp: 0 }), /finite priceGp/);
assert.throws(() => parcelValueGp({ items: [{ priceGp: 4, quantity: Infinity }], currencyGp: 0 }), /finite priceGp/);
assert.throws(() => parcelValueGp({ items: [{ quantity: 1 }], currencyGp: 0 }), /finite priceGp/, "undefined priceGp");
assert.throws(() => parcelValueGp({ items: [], currencyGp: NaN }), /currencyGp must be finite/);
assert.throws(() => parcelValueGp({ items: [], currencyGp: undefined }), /currencyGp must be finite/);
