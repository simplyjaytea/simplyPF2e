// NPC admission/ranking must preserve source identities before any alias or
// package filtering. Native schema evidence: PF2e 8.5.0 Deflect Projectile
// sgaqlDFTVC7Ryurt: type feat, category class, level.value 4, traits.value monk;
// master src/module/item/feat/data.ts defines those same indexed fields.
import assert from "node:assert/strict";
import {
  getCreatureFeatCandidates, getFeatCandidates, isIssuedCandidate,
  rankCreatureFeatCandidates, normalizeCreatureFeatName
} from "./compendium.mjs";

const feat = (id, name, level, trait, category = "class") => ({
  _id: id, name, type: "feat", system: {
    category, level: { value: level }, traits: { value: [trait] }, prerequisites: { value: [] }
  }
});
const sourceA = [
  ...Array.from({ length: 50 }, (_, i) => feat(`fighter-${i}`, `Fighter Ability ${i}`, 14, "fighter")),
  feat("crane", "Crane Stance", 1, "monk"),
  feat("stunning", "Stunning Blows", 2, "monk"),
  feat("deflect", "Deflect Projectile", 4, "monk"),
  feat("monk-other", "Whirling Throw", 6, "monk"),
  feat("wizard", "Spell Substitution", 1, "wizard"),
  feat("rogue", "Nimble Dodge", 1, "rogue"),
  feat("too-high", "Future Power", 16, "monk"),
  feat("general", "Fleet", 1, "general", "general"),
  feat("malformed", "Missing Level", undefined, "monk")
];
const sourceB = [feat("crane-homebrew", "Crane Stance", 1, "monk")];
const requests = [];
const pack = (entries) => ({ getIndex: async ({ fields }) => { requests.push(fields); return structuredClone(entries); } });
globalThis.game = {
  settings: { get: () => ({ feats: ["source.a", "source.b", "source.a"] }) },
  packs: new Map([["source.a", pack(sourceA)], ["source.b", pack(sourceB)]])
};
globalThis.CONFIG = { PF2E: { classTraits: { fighter: "Fighter", monk: "Monk", rogue: "Rogue", wizard: "Wizard" } } };

const args = { level: 15, preferredNames: ["Crane Stance", "Stunning Blows", "Deflect Arrow"], prompt: "A martial artist disguised as a tavern proprietor" };
const catalog = await getCreatureFeatCandidates(args);
assert.equal(catalog.length, 16);
const cranes = catalog.filter((candidate) => candidate.name === "Crane Stance");
assert.equal(cranes.length, 2, "same-name later-pack candidates survive NPC admission and ranking");
assert.notEqual(cranes[0].id, cranes[1].id);
assert.ok(cranes.every((candidate) => isIssuedCandidate(candidate.ref, ["source.a", "source.b"])));
assert.equal(new Set(catalog.map((candidate) => candidate.id)).size, catalog.length, "repeated pack entries do not duplicate source identity");
assert.ok(catalog.some((candidate) => candidate.name === "Deflect Projectile"), "renamed alternatives can be offered without accepting a fuzzy source");
assert.ok(catalog.some((candidate) => candidate.name === "Whirling Throw"), "an exact hit's actual class trait promotes related alternatives");
assert.ok(catalog.slice(0, 3).every((candidate) => ["Crane Stance", "Stunning Blows"].includes(candidate.name)), "exact-name priority precedes alternatives");
assert.ok(!catalog.some((candidate) => ["Future Power", "Fleet", "Missing Level", "Deflect Arrow"].includes(candidate.name)));
assert.equal((await getCreatureFeatCandidates({ ...args, limit: 100 })).length, 16, "provider shortlist cannot exceed the shared cap");
const all = await getCreatureFeatCandidates({ ...args, limit: null });
assert.ok(all.length > 16, "package support must be filtered before the final cap");
assert.ok(all.some((candidate) => candidate.traits.includes("wizard")) && all.some((candidate) => candidate.traits.includes("rogue")), "NPC discovery remains all-class");
assert.equal((await getCreatureFeatCandidates({ level: Number.NaN })).length, 0);
assert.ok(requests.every((fields) => ["system.level.value", "system.category", "system.traits.value"].every((field) => fields.includes(field))));

const pc = await getFeatCandidates({ level: 15, category: "class", traits: ["monk"], preferredNames: ["Crane Stance"] });
assert.equal(pc.filter((candidate) => candidate.name === "Crane Stance").length, 1, "PC slot name deduplication remains unchanged");
assert.ok(pc.every((candidate) => candidate.traits.includes("monk")));

const promptRanked = rankCreatureFeatCandidates(all, { prompt: "wizard spell substitution", classTraits: ["wizard"] });
assert.equal(promptRanked[0].name, "Spell Substitution", "prompt class/name terms improve alternative ranking");
const presetRanked = rankCreatureFeatCandidates(all, { preferredTraits: ["rogue"] });
assert.equal(presetRanked[0].name, "Nimble Dodge");
assert.equal(normalizeCreatureFeatName("  CRANE—Stance "), "crane stance");
assert.notEqual(normalizeCreatureFeatName("Deflect Arrow"), normalizeCreatureFeatName("Deflect Projectile"));
console.log("compendium.creatureFeats.test.mjs: source admission, all-class ranking and PC isolation passed");
