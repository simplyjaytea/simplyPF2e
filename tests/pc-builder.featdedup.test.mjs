// Regression check for the audit finding that resolveFeatPicks had no
// cross-slot deduplication. PF2e feats aren't repeatable, and BOTH failure
// modes converged on the same name: the batched selectFeats() call can hand
// one feat to two slots, and the fallback was `candidates[0]`, which — sorted
// by level then name — is IDENTICAL for every slot of a category. A level-20
// character whose feat call came back empty got ten copies of one class feat.
// Run: node tests/pc-builder.featdedup.test.mjs
//
// The real resolveFeatPicks runs against a stub feats pack (index only), so
// findEntry and the duplicate guard are the production code paths.

import assert from "node:assert/strict";

/* Stub feats pack: every candidate name is a real feat of the right category. */
const feat = (name) => ({
  _id: name.replace(/\W/g, ""), name, type: "feat", system: { category: name.split(":")[0], level: { value: 1 }, traits: { value: [] } }
});
const names = ["class:Alpha", "class:Beta", "class:Gamma"];
const pack = { collection: "test.feats", metadata: { type: "Item", label: "Feats" }, getIndex: async () => names.map(feat) };
globalThis.game = {
  settings: { get: () => ({ feats: ["test.feats"] }) },
  packs: { get: (id) => (id === "test.feats" ? pack : undefined), [Symbol.iterator]: () => [pack].values() }
};
const { resolveFeatPicks } = await import("../scripts/pc-builder.mjs");

const origWarn = console.warn;
console.warn = () => {};

const candidates = names.map((name) => ({ name }));
const classSlots = [
  { type: "class", level: 2, candidates },
  { type: "class", level: 4, candidates },
  { type: "class", level: 6, candidates }
];

/* 1. No picks at all — the old fallback gave every slot candidates[0]. */
const allFallback = await resolveFeatPicks(classSlots, []);
const fallbackNames = allFallback.map((f) => f.entry?.name);
assert.deepEqual(
  fallbackNames, ["class:Alpha", "class:Beta", "class:Gamma"],
  "with no AI picks each slot walks to the next unused candidate instead of repeating the first"
);
assert.equal(new Set(fallbackNames).size, 3, "no duplicate feats across slots");

/* 2. The AI names the SAME feat for two slots. */
const duplicatePicks = await resolveFeatPicks(classSlots, [
  { slot: 1, name: "class:Beta" },
  { slot: 2, name: "class:Beta" },
  { slot: 3, name: "class:Gamma" }
]);
assert.equal(duplicatePicks[0].entry.name, "class:Beta", "the first slot keeps the AI's pick");
assert.notEqual(duplicatePicks[1].entry.name, "class:Beta", "the repeat is rejected, not embedded twice");
assert.equal(duplicatePicks[2].entry.name, "class:Gamma", "an unaffected slot still gets its own pick");
assert.equal(
  new Set(duplicatePicks.map((f) => f.entry.name)).size, 3,
  "all three slots end up with distinct feats"
);

/* 3. Exhausted category: more slots than candidates leaves the tail empty
      rather than duplicating, and keeps a name so the preview shows intent. */
const exhausted = await resolveFeatPicks(
  [...classSlots, { type: "class", level: 8, candidates }], []
);
assert.equal(exhausted[3].entry, null, "a slot with no unused candidate left resolves to no entry");
assert.ok(exhausted[3].name, "an unfilled slot still carries a name for the preview");

console.warn = origWarn;
console.log("pc-builder feat-dedup regression check: all assertions passed");
