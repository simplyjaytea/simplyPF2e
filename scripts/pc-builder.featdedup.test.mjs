// Regression check for the audit finding that resolveFeatPicks had no
// cross-slot deduplication. PF2e feats aren't repeatable, and BOTH failure
// modes converged on the same name: the batched selectFeats() call can hand
// one feat to two slots, and the fallback was `candidates[0]`, which — sorted
// by level then name — is IDENTICAL for every slot of a category. A level-20
// character whose feat call came back empty got ten copies of one class feat.
// Run: node scripts/pc-builder.featdedup.test.mjs
//
// resolveFeatPicks calls findEntry against the compendium, so the loop is
// copied verbatim below with a stub findEntry (source of truth — keep in sync).

import assert from "node:assert/strict";
import { slugify } from "./text.mjs";

/* Stub compendium: every candidate name is a real feat of the right category. */
const findEntry = async (_packs, name, filter) => {
  const entry = { name, type: "feat", system: { category: name.split(":")[0], level: { value: 1 } } };
  return filter(entry) ? entry : null;
};
const getPacksFor = () => [];

const origWarn = console.warn;
console.warn = () => {};

// --- Copied verbatim from scripts/pc-builder.mjs resolveFeatPicks() ---
async function resolveFeatPicks(featSlots, picks) {
  const bySlot = new Map(picks.map((p) => [p.slot, p.name]));
  const taken = new Set();
  const resolved = [];
  const resolveFor = (slot, name) => findEntry(
    getPacksFor("feats"),
    name,
    (e) => e.type === "feat"
      && e.system?.category === slot.type
      && (e.system?.level?.value ?? 0) <= slot.level
      && !taken.has(slugify(e.name))
  );
  for (let i = 0; i < featSlots.length; i++) {
    const slot = featSlots[i];
    let name = bySlot.get(i + 1) ?? null;
    let entry = name ? await resolveFor(slot, name) : null;
    if (!entry) {
      for (const candidate of slot.candidates ?? []) {
        entry = await resolveFor(slot, candidate.name);
        if (entry) { name = entry.name; break; }
      }
    }
    if (entry) taken.add(slugify(entry.name));
    resolved.push({ type: slot.type, level: slot.level, name: name ?? `${slot.type} feat`, entry });
  }
  return resolved;
}

const candidates = [{ name: "class:Alpha" }, { name: "class:Beta" }, { name: "class:Gamma" }];
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
