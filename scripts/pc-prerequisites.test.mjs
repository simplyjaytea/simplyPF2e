// Conservative PC prerequisite boundary: only an explicit empty PF2e
// prerequisite list is eligible for the one-click catalog. This avoids
// pretending display text is an actor eligibility API.
import assert from "node:assert/strict";

globalThis.game = { settings: { get: () => ({ feats: ["test.feats"] }) }, packs: new Map([
  ["test.feats", { async getIndex() { return [
    { _id: "free", name: "Free Feat", type: "feat", system: { level: { value: 1 }, category: "class", traits: { value: [] }, prerequisites: { value: [] } } },
    { _id: "dependent", name: "Dependent Feat", type: "feat", system: { level: { value: 1 }, category: "class", traits: { value: [] }, prerequisites: { value: [{ value: "Fighter" }] } } },
    { _id: "missing", name: "Unreadable Feat", type: "feat", system: { level: { value: 1 }, category: "class", traits: { value: [] } } }
  ]; } }]
]) };

const { getFeatCandidates } = await import("./compendium.mjs");
const candidates = await getFeatCandidates({ level: 1, category: "class", requireNoPrerequisites: true });
assert.deepEqual(candidates.map((candidate) => candidate.name), ["Free Feat"],
  "dependent or unreadable prerequisite data is excluded from the complete-only catalog");
const legacy = await getFeatCandidates({ level: 1, category: "class" });
assert.deepEqual(legacy.map((candidate) => candidate.name), ["Dependent Feat", "Free Feat", "Unreadable Feat"],
  "NPC and legacy callers retain prerequisite-bearing candidates");

const { resolveFeatPicks } = await import("./pc-builder.mjs");
const { completionManifest } = await import("./completion.mjs");
const unresolved = await resolveFeatPicks([{ type: "class", level: 1, candidates: [] }], [], { exactContent: true });
const manifest = completionManifest({ mode: "character", concept: {}, resolved: {
  ancestryDoc: { name: "Human" }, backgroundDoc: { name: "Scholar" }, classDoc: { name: "Fighter" }, feats: unresolved
} });
assert.equal(manifest.complete, false, "an earned empty feat slot remains a blocking unresolved record");
assert.equal(manifest.unresolved.some((record) => record.category === "feat"), true,
  "the completion manifest identifies the unsupported entitlement");
console.log("pc-prerequisites.test.mjs: conservative prerequisite gate passed");
