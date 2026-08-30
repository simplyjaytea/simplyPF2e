import assert from "node:assert/strict";

const packs = new Map([
  ["pf2e.bestiary-ability-glossary-srd", {}], ["pf2e.equipment-srd", {}], ["pf2e.spells-srd", {}], ["pf2e.ancestries", {}],
  ["pf2e.backgrounds", {}], ["pf2e.classes", {}], ["pf2e.classfeatures", {}], ["pf2e.feats-srd", {}], ["pf2e.pathfinder-monster-core", {}]
]);
globalThis.game = { packs: { get: (id) => packs.get(id) }, settings: { get: () => ({}) } };
const { sourceReadiness } = await import("./compendium.mjs");

const creature = sourceReadiness("monster");
assert.equal(creature.ready, true);
assert.equal(creature.packCount, 5);
packs.delete("pf2e.spells-srd");
assert.deepEqual(sourceReadiness("npc").missing, ["spells"]);
assert.deepEqual(sourceReadiness("npc", { allowSpellcasting: false }).missing, ["spells"],
  "scroll grounding requires spell sources even for a non-caster");
packs.set("pf2e.spells-srd", {});
packs.delete("pf2e.pathfinder-monster-core");
assert.deepEqual(sourceReadiness("monster").missing, ["bestiaryActors"],
  "complete creature generation requires an enabled exact bestiary Actor scaffold source");
packs.set("pf2e.pathfinder-monster-core", {});
assert.equal(sourceReadiness("character").ready, true);
packs.delete("pf2e.classes");
assert.ok(sourceReadiness("character").missing.includes("classes"));
console.log("compendium.readiness.test.mjs: required source preflight passed");
