import assert from "node:assert/strict";
import { encodeFeatCandidateSlots, resolveEncodedFeatPicks } from "./ai-candidate-format.mjs";

const encoded = encodeFeatCandidateSlots([
  { type: "general", level: 3, candidates: [{ name: "Fleet" }, { name: "Toughness" }] },
  { type: "general", level: 7, candidates: [{ name: "Fleet" }, { name: "Incredible Initiative" }] }
]);

assert.equal(encoded.catalog.length, 3, "overlapping feat names must appear once in catalog");
assert.deepEqual(encoded.slots[0].ids, ["F0", "F1"]);
assert.deepEqual(encoded.slots[1].ids, ["F0", "F2"]);

assert.deepEqual(
  resolveEncodedFeatPicks(encoded, [
    { slot: 1, id: "f1" },
    { slot: 2, id: "F2" }
  ]),
  [
    { slot: 1, name: "Toughness" },
    { slot: 2, name: "Incredible Initiative" }
  ],
  "valid IDs must restore exact catalog names"
);

assert.deepEqual(
  resolveEncodedFeatPicks(encoded, [
    { slot: 1, id: "F2" }, // real ID, wrong slot
    { slot: 2, id: "F0" },
    { slot: 2, id: "F2" } // duplicate slot ignored
  ]),
  [{ slot: 2, name: "Fleet" }],
  "cross-slot and duplicate picks must fail closed"
);

console.log("ai-candidate-format.test.mjs: all feat-catalog assertions passed");
