/* Regression coverage for production candidate-payload limiters.
 * Run: node scripts/compendium.candidateCaps.test.mjs */
import assert from "node:assert/strict";
import {
  EQUIPMENT_CANDIDATE_LIMIT,
  EQUIPMENT_CANDIDATE_FLOOR,
  FEAT_CANDIDATE_LIMIT,
  LOOT_CANDIDATE_LIMIT,
  SPELL_CANDIDATE_LIMIT,
  SPELL_CANDIDATE_FLOOR,
  limitEquipmentCandidates,
  limitFeatCandidates,
  limitSpellCandidates
} from "./compendium.mjs";

const names = (items) => items.map((item) => item.name);

/* Spells: a narrow exact match must survive without returning the unbounded
 * source list; every rank remains represented and top-rank choices survive. */
const spells = [];
for (let rank = 0; rank <= 10; rank++) {
  for (let i = 0; i < 40; i++) {
    spells.push({
      name: `Rank ${rank} Spell ${String(i).padStart(2, "0")}`,
      rank,
      traits: i % 13 === 0 ? ["fire"] : ["utility"]
    });
  }
}
spells.push({ name: "Exact Ember", rank: 5, traits: ["fire"] });
const exactSpellNames = ["Exact Ember", ...spells
  .filter((spell) => spell.rank === 5)
  .slice(0, 15)
  .map((spell) => spell.name)];
const limitedSpells = limitSpellCandidates(spells, exactSpellNames);
assert.ok(limitedSpells.length <= SPELL_CANDIDATE_LIMIT, "spell catalog must obey hard cap");
assert.equal(limitedSpells.length, SPELL_CANDIDATE_FLOOR, "narrow spell matches must use bounded floor, not full cap");
assert.ok(limitedSpells.length < spells.length, "narrow spell match must not restore full catalog");
for (const exactName of exactSpellNames) {
  assert.ok(names(limitedSpells).includes(exactName), `exact spell-name match must survive: ${exactName}`);
}
assert.deepEqual(
  [...new Set(limitedSpells.map((spell) => spell.rank))],
  Array.from({ length: 11 }, (_, rank) => rank),
  "spell result must retain every available rank"
);
assert.ok(limitedSpells.some((spell) => spell.rank === 10), "highest spell rank must survive");
assert.deepEqual(
  limitSpellCandidates(spells, exactSpellNames), limitedSpells,
  "spell limiting must be deterministic"
);

/* Equipment/loot: the cap balances every supported type and every broad level
 * band while ranking an exact requested item ahead of filler in its bucket. */
const equipmentTypes = ["weapon", "armor", "equipment", "consumable", "treasure", "backpack", "shield", "kit"];
const equipment = [];
for (const type of equipmentTypes) {
  for (let level = 0; level <= 20; level++) {
    for (let i = 0; i < 3; i++) {
      equipment.push({
        name: `${type} L${level} Item ${i}`,
        type,
        level,
        traits: i === 0 ? [type] : []
      });
    }
  }
}
equipment.push({ name: "Needle of Exactness", type: "weapon", level: 1, traits: ["needle"] });
const exactMundaneNames = ["Rope", "Crowbar", "Torch", "Rations", "Waterskin", "Grappling Hook"];
for (const name of exactMundaneNames) equipment.push({ name, type: "equipment", level: 0, traits: [] });
const exactEquipmentNames = ["Needle of Exactness", ...exactMundaneNames];
const limitedEquipment = limitEquipmentCandidates(equipment, exactEquipmentNames);
assert.ok(limitedEquipment.length <= EQUIPMENT_CANDIDATE_LIMIT, "equipment catalog must obey hard cap");
assert.equal(limitedEquipment.length, EQUIPMENT_CANDIDATE_FLOOR, "narrow equipment matches must use bounded floor, not full cap");
assert.ok(limitedEquipment.length < equipment.length, "equipment limiter must not return full catalog");
for (const exactName of exactEquipmentNames) {
  assert.ok(names(limitedEquipment).includes(exactName), `exact equipment-name match must survive: ${exactName}`);
}
assert.deepEqual(
  [...new Set(limitedEquipment.map((item) => item.type))].sort(),
  [...equipmentTypes].sort(),
  "equipment result must retain every available item type"
);
assert.ok(limitedEquipment.some((item) => item.level === 0), "mundane level-zero equipment must survive");
assert.ok(limitedEquipment.some((item) => item.level >= 14), "useful high-level equipment must survive");
assert.deepEqual(
  limitEquipmentCandidates(equipment, exactEquipmentNames), limitedEquipment,
  "equipment limiting must be deterministic"
);
assert.equal(LOOT_CANDIDATE_LIMIT, EQUIPMENT_CANDIDATE_LIMIT, "loot currently uses same bounded catalog size");

/* Feats: every call is capped per slot, highest-level options survive, and
 * round-robin selection retains a spread of legal levels. */
const feats = [];
for (let level = 1; level <= 20; level++) {
  for (let i = 0; i < 30; i++) {
    feats.push({ name: `Feat ${level}-${String(i).padStart(2, "0")}`, level, traits: ["class"] });
  }
}
const limitedFeats = limitFeatCandidates(feats);
assert.equal(limitedFeats.length, FEAT_CANDIDATE_LIMIT, "feat catalog must fill, but never exceed, hard cap");
assert.ok(limitedFeats.some((feat) => feat.level === 20), "highest legal feat level must survive");
assert.ok(new Set(limitedFeats.map((feat) => feat.level)).size > 10, "feat result must span many legal levels");
assert.deepEqual(limitFeatCandidates(feats), limitedFeats, "feat limiting must be deterministic");
const preferredFeat = feats.find((feat) => feat.name === "Feat 1-29");
assert.ok(
  names(limitFeatCandidates(feats, FEAT_CANDIDATE_LIMIT, [preferredFeat.name])).includes(preferredFeat.name),
  "legal first-draft feat names must survive per-slot sampling"
);

console.log("compendium.candidateCaps.test.mjs: all candidate-cap assertions passed");
