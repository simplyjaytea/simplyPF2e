// Regression check for issue #64 item 4a: a feat slot whose trait-filtered
// candidate query returns [] must retry once WITHOUT the trait filter before
// giving up, instead of silently dropping the slot. The real featSlotCandidates
// is called with a stub fetch that misses on any trait query.
// Run: node tests/pc-builder.featslot.test.mjs

import assert from "node:assert/strict";
import { featSlotCandidates } from "../scripts/pc-builder.mjs";

// Stub fetch: returns [] for any TRAIT-filtered query, but a real candidate for the
// loosened (no-traits) query, reproducing the miss the retry is meant to recover.
const calls = [];
const fetch = async (query) => {
  calls.push(query);
  if (query.traits?.length) return [];
  return [{ name: `${query.category}-feat`, level: query.level }];
};

// Ancestry and class slots: the trait query misses, the loosened retry fills them.
const ancestry = await featSlotCandidates({ type: "ancestry", level: 1 }, ["elf"], { preferredNames: ["Elven Lore"] }, fetch);
assert.deepEqual(ancestry, [{ name: "ancestry-feat", level: 1 }], "the loosened retry fills an ancestry slot");
assert.deepEqual(calls.map((q) => q.traits), [["elf"], undefined], "one trait query, then one loosened query");
assert.deepEqual(calls[1].preferredNames, ["Elven Lore"], "the retry keeps the AI's preferred names");

calls.length = 0;
const classSlot = await featSlotCandidates({ type: "class", level: 2 }, ["fighter"], {}, fetch);
assert.deepEqual(classSlot, [{ name: "class-feat", level: 2 }], "the retry fills a class slot too");
assert.equal(calls.length, 2, "a missed class slot costs exactly two queries");

// A skill slot has no trait, so there is nothing to loosen: one query, no retry.
calls.length = 0;
const skill = await featSlotCandidates({ type: "skill", level: 2 }, [], {}, fetch);
assert.deepEqual(skill, [{ name: "skill-feat", level: 2 }], "a traitless slot is filled directly");
assert.equal(calls.length, 1, "a traitless slot is queried once");

// When the trait query hits, the loosened query is never asked.
calls.length = 0;
const hit = await featSlotCandidates({ type: "class", level: 4 }, ["rogue"], {}, async (query) => {
  calls.push(query);
  return query.traits?.length ? [{ name: "rogue-feat", level: 4 }] : [];
});
assert.deepEqual(hit, [{ name: "rogue-feat", level: 4 }], "a trait hit is returned as is");
assert.equal(calls.length, 1, "no retry when the trait query already hits");

// Nothing matches even loosened: the empty list is returned for the caller to warn about.
const none = await featSlotCandidates({ type: "general", level: 3 }, [], {}, async () => []);
assert.deepEqual(none, [], "an unfillable slot stays empty for the caller to report");

console.log("pc-builder feat-slot retry regression check: all assertions passed");
