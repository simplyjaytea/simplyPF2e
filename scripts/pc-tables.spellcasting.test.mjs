import assert from "node:assert/strict";
import { pcSpellcastingProfile, pcSpellSlots, pcSpellPlan, spontaneousSpellSlots } from "./pc-tables.mjs";

const klass = (name, slug, title, remaster = true) => ({ name, system: { slug, publication: { title, remaster } } });
assert.deepEqual(pcSpellcastingProfile(klass("Bard", "bard", "Pathfinder Player Core")),
  { mode: "spontaneous", ability: "cha", tradition: "occult", baseSlots: 2 });
assert.deepEqual(pcSpellcastingProfile(klass("Sorcerer", "sorcerer", "Pathfinder Player Core 2")),
  { mode: "spontaneous", ability: "cha", tradition: null, baseSlots: 3 });
assert.deepEqual(pcSpellcastingProfile(klass("Wizard", "wizard", "Pathfinder Player Core")),
  { mode: "prepared", ability: "int", tradition: "arcane", baseSlots: 2 });
assert.equal(pcSpellcastingProfile(klass("Oracle", "oracle", "Advanced Player's Guide")), null);
assert.equal(pcSpellcastingProfile(klass("Oracle", "oracle", "Pathfinder Player Core 2", false)), null);
assert.equal(pcSpellcastingProfile(klass("Magus", "magus", "Pathfinder Player Core 2")), null);

const bard = pcSpellcastingProfile(klass("Bard", "bard", "Pathfinder Player Core"));
const sorcerer = pcSpellcastingProfile(klass("Sorcerer", "sorcerer", "Pathfinder Player Core 2"));
assert.deepEqual(pcSpellSlots(1, bard), { 0: 5, 1: 2, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 });
assert.equal(pcSpellSlots(2, bard)[1], 3);
assert.equal(pcSpellSlots(5, sorcerer)[3], 3);
assert.equal(pcSpellSlots(6, sorcerer)[3], 4);
assert.equal(pcSpellSlots(19, bard)[10], 1);
assert.equal(pcSpellSlots(20, sorcerer)[10], 1);
assert.deepEqual(pcSpellSlots(5, null), spontaneousSpellSlots(5), "unsupported classes retain legacy fallback");
assert.deepEqual(pcSpellPlan(2, bard).signatureRanks, []);
assert.ok(pcSpellPlan(3, bard).signatureRanks.includes(2));
assert.equal(pcSpellPlan(19, bard).slots[10], 1);
assert.equal(pcSpellPlan(19, bard).picks[10], 2);
assert.deepEqual(pcSpellPlan(20, pcSpellcastingProfile(klass("Wizard", "wizard", "Pathfinder Player Core"))).signatureRanks, []);
console.log("pc spellcasting profiles and slots: all assertions passed");
