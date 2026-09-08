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

import { encodeForgeCandidateGroups, resolveForgeCandidateAliases } from "./ai-candidate-format.mjs";
const forge = encodeForgeCandidateGroups({
  baseCandidates: [{ id: "c-base-a", name: "Longsword" }, { id: "c-base-b", name: "Longsword" }],
  potencyCandidates: [{ id: "c-potency", name: "Weapon Potency (+1)" }],
  secondaryCandidates: [{ id: "c-secondary", name: "Striking" }],
  runeCandidates: [{ id: "c-rune-a", name: "Ghost Touch" }, { id: "c-rune-b", name: "Ghost Touch" }]
});
assert.deepEqual(forge.base.entries.map(({ alias, id }) => [alias, id]), [["B0", "c-base-a"], ["B1", "c-base-b"]],
  "same-name Forge bases retain distinct request aliases");
assert.deepEqual(resolveForgeCandidateAliases(forge, {
  baseItemId: "B1", potencyRuneId: "P0", secondaryRuneId: "none", propertyRuneIds: ["R1"], description: "Quiet steel."
}), {
  baseItemId: "c-base-b", potencyRuneId: "c-potency", secondaryRuneId: "none", propertyRuneIds: ["c-rune-b"], description: "Quiet steel."
}, "Forge aliases restore the exact issued IDs before normalization");
for (const raw of [
  { baseItemId: "P0", potencyRuneId: "P0", secondaryRuneId: "none", propertyRuneIds: [] },
  { baseItemId: "c-base-a", potencyRuneId: "P0", secondaryRuneId: "none", propertyRuneIds: [] },
  { baseItemId: "B0", potencyRuneId: "P0", secondaryRuneId: "S0", propertyRuneIds: ["B0"] }
]) assert.throws(() => resolveForgeCandidateAliases(forge, raw), /unknown .* alias/,
  "wrong-group, original opaque, and unknown Forge aliases fail closed");
console.log("ai-candidate-format.test.mjs: Forge aliases retain exact group identities");

import { encodeCreatureFeatCandidates, resolveCreatureFeatAliases } from "./ai-candidate-format.mjs";
const firstRef = { packId: "first.pack", _id: "one" };
const secondRef = { packId: "second.pack", _id: "two" };
const creature = encodeCreatureFeatCandidates([
  { id: "source-one", name: "Same Name", ref: firstRef },
  { id: "source-two", name: "Same Name", ref: secondRef },
  { id: "source-one", name: "Same Name", ref: firstRef },
  { id: "no-ref", name: "Malformed" }
]);
assert.deepEqual(creature.catalog.map(({ id }) => id), ["F0", "F1"]);
const restored = resolveCreatureFeatAliases(creature, ["F1", "F0"]);
assert.equal(restored[0].candidate, secondRef);
assert.equal(restored[1].candidate, firstRef);
assert.deepEqual(resolveCreatureFeatAliases(creature, []), []);
for (const invalid of [undefined, null, {}, "F0", [0], ["Same Name"], ["source-one"], ["f0"], ["F0", "F0"], ["F0", "F2"]]) {
  assert.throws(() => resolveCreatureFeatAliases(creature, invalid), (error) =>
    error.code === "NPC_FEAT_SELECTION_INVALID", "invalid/mixed/duplicate selections reject the entire batch");
}
assert.throws(() => resolveCreatureFeatAliases(creature, ["F0", "F1"], 1),
  (error) => error.diagnostics.reason === "too-many-picks");
console.log("ai-candidate-format.test.mjs: creature aliases are exact and atomic");
