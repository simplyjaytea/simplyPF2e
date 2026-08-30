// Regression check for issue #64 item 4a: a feat slot whose trait-filtered
// candidate query returns [] must retry once WITHOUT the trait filter before
// giving up, instead of silently dropping the slot. Archetype slots keep their
// trait (loosening would just yield plain class feats).
// Run: node scripts/pc-builder.featslot.test.mjs
//
// The loop lives in resolvePCConcept (reads compendium globals), so the pure
// slice is copied verbatim below (source of truth — keep in sync).

import assert from "node:assert/strict";

// Stub getFeatCandidates: returns [] for any TRAIT-filtered query, but a real
// candidate for the loosened (no-traits) query — reproducing the miss the
// retry is meant to recover.
async function getFeatCandidates({ level, category, traits = [] }) {
  if (traits.length) return []; // trait query misses
  return [{ name: `${category}-feat`, level }]; // loosened query hits
}

const warnings = [];
const origWarn = console.warn;
console.warn = (msg) => warnings.push(msg);

// --- Copied verbatim from scripts/pc-builder.mjs resolvePCConcept() feat loop ---
async function buildSlots(slots, ancestryTrait, classTrait) {
  const featSlots = [];
  for (const slot of slots) {
    const traits = slot.archetype ? ["archetype"]
      : slot.type === "ancestry" ? [ancestryTrait]
      : slot.type === "class" ? [classTrait] : [];
    let candidates = await getFeatCandidates({ level: slot.level, category: slot.type, traits });
    if (!candidates.length && traits.length && !slot.archetype) {
      candidates = await getFeatCandidates({ level: slot.level, category: slot.type });
    }
    if (candidates.length) featSlots.push({ ...slot, candidates });
    else {
      console.warn(`simplypf2e | no feat candidates for a ${slot.type}${slot.archetype ? " (archetype)" : ""} slot at level ${slot.level} — slot remains unresolved`);
      featSlots.push({ ...slot, candidates: [] });
    }
  }
  return featSlots;
}

const slots = [
  { type: "ancestry", level: 1 }, // trait query misses -> loosened retry fills it
  { type: "class", level: 2 },    // trait query misses -> loosened retry fills it
  { type: "skill", level: 2 },    // no traits -> hits directly
  { type: "class", level: 2, archetype: true } // keeps "archetype" trait -> stays empty, warns
];

const built = await buildSlots(slots, "elf", "fighter");
console.warn = origWarn;

// The ancestry, class, and skill slots fill by retry/direct. The archetype
// entitlement is retained as an unresolved empty slot for the manifest.
assert.equal(built.length, 4, "all entitlements survive; archetype remains unresolved");
assert.deepEqual(built.map((s) => s.type), ["ancestry", "class", "skill", "class"], "all slots keep their types");
for (const s of built.slice(0, 3)) assert.ok(s.candidates.length, `${s.type} slot ended up with candidates`);
assert.deepEqual(built[3].candidates, [], "unsupported archetype retains an empty candidate list");

// The archetype slot never loosens, so it warns instead of grabbing plain class feats.
assert.ok(
  warnings.some((w) => w.includes("(archetype)")),
  "an empty archetype slot warns rather than being filled with non-archetype feats"
);

console.log("pc-builder feat-slot retry regression check: all assertions passed");
