// PC level schedules through the real functions: ability boosts at the boost levels, the ability-priority order
// (the key ability first, then the chosen priorities, then the rest in order), the general feat levels, and the
// level-20 boost reaching the modifiers. Pure: the ancestry and background are minimal documents.
// Run: node tests/pc-builder.abilityAndFeats.test.mjs
import assert from "node:assert/strict";
import { plannedAbilitySections, deriveAbilityModifiers } from "../scripts/pc-builder.mjs";
import { ABILITY_BOOST_LEVELS, buildFeatSlots } from "../scripts/pc-tables.mjs";

// The boost levels are the published ones: every five levels from 1 to 20.
assert.deepEqual(ABILITY_BOOST_LEVELS, [1, 5, 10, 15, 20], "the boost levels are 1, 5, 10, 15 and 20");

const doc = (system) => ({ toObject: () => ({ name: "Test", system: structuredClone(system) }) });
const ancestryDoc = doc({ boosts: {}, flaws: {} });
const backgroundDoc = doc({ boosts: {} });

// The key ability leads every boost level; the chosen priorities follow; the rest keep their order.
{
  const sections = plannedAbilitySections(ancestryDoc, backgroundDoc, "dex", ["wis"]);
  const levelSections = sections.filter((s) => s.level > 0);
  assert.deepEqual(levelSections.map((s) => s.level), ABILITY_BOOST_LEVELS, "a boost section exists at each boost level");
  for (const section of levelSections) {
    assert.equal(section.boosts[0], "dex", `level ${section.level}: the key ability is boosted first`);
    assert.equal(section.boosts[1], "wis", `level ${section.level}: the chosen priority comes next`);
    assert.deepEqual(section.boosts, ["dex", "wis", "str", "con"], `level ${section.level}: the four boosts in priority order`);
  }
}

// Without preferences the key ability still leads, and the rest keep the default order.
{
  const sections = plannedAbilitySections(ancestryDoc, backgroundDoc, "cha", []);
  const first = sections.find((s) => s.level === 1);
  assert.deepEqual(first.boosts, ["cha", "str", "dex", "con"], "the key ability leads, then the default order");
}

// The level-20 boost reaches the modifiers: at level 20 the dex boost adds to the others, at level 19 it does not.
{
  const sections = plannedAbilitySections(ancestryDoc, backgroundDoc, "dex", []);
  const at19 = deriveAbilityModifiers(sections, 19);
  const at20 = deriveAbilityModifiers(sections, 20);
  assert.equal(sections.filter((s) => s.level === 20).length, 1, "one boost section at level 20");
  assert.ok(at20.dex > at19.dex, "the level-20 boost raises dex at level 20");
}

// General feat slots: the published general feat levels for a level-20 character.
{
  const general = buildFeatSlots(20).filter((slot) => slot.type === "general").map((slot) => slot.level);
  assert.deepEqual(general, [3, 7, 11, 15, 19], "general feats at 3, 7, 11, 15 and 19");
  assert.deepEqual(buildFeatSlots(18).filter((slot) => slot.type === "general").map((slot) => slot.level), [3, 7, 11, 15],
    "a level-18 character has no 19th-level general feat yet");
}

console.log("pc-builder.abilityAndFeats.test.mjs: boost levels, ability-priority order, the level-20 boost and the general feat levels are pinned");
