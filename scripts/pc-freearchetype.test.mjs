// C09 Free Archetype: archetype slots take only the proven catalog, the
// dedication lock and ability prerequisites are enforced at pick time, and the
// ability-modifier plan mirrors foundryvtt/pf2e 8.5.0 character preparation.

import assert from "node:assert/strict";

const FEATS = [
  ["fighter-dedication", "Fighter Dedication", 2, ["archetype", "dedication"]],
  ["investigator-dedication", "Investigator Dedication", 2, ["archetype", "dedication"]],
  ["barbarian-dedication", "Barbarian Dedication", 2, ["archetype", "dedication"]],
  ["basic-maneuver", "Basic Maneuver", 4, ["archetype"]],
  ["toughness", "Toughness", 2, []]
].map(([_id, name, level, traits]) => ({
  _id, name, type: "feat", system: { level: { value: level }, category: "class", traits: { value: traits } }
}));

globalThis.game = {
  settings: { get: () => ({ equipment: ["test.equipment"], spells: ["test.spells"], feats: ["test.feats"] }) },
  packs: new Map([
    ["test.equipment", { async getIndex() { return []; } }],
    ["test.spells", {}],
    ["test.feats", {
      async getIndex() { return FEATS; },
      async getDocument(id) {
        const entry = FEATS.find((feat) => feat._id === id);
        return entry ? { ...entry, uuid: `Compendium.test.feats.Item.${id}`, toObject: () => structuredClone(entry) } : null;
      }
    }]
  ])
};

const { deriveAbilityModifiers, plannedAbilitySections, resolveFeatPicks } = await import("./pc-builder.mjs");
const { multiclassAbilityBlocker, multiclassPickBlocker } = await import("./pc-multiclass.mjs");

const ok = { str: 2, dex: 2, con: 2, int: 2, wis: 0, cha: 0 };
const none = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
const slot = (level, abilities = ok) => ({ type: "class", level, archetype: true, abilities, candidates: [] });
const pick = (slotNumber, name) => ({ slot: slotNumber, name });

// Catalog-only archetype slots: a feat outside the proven catalog is refused.
{
  const [refused] = await resolveFeatPicks([slot(2)], [pick(1, "Toughness")], { className: "Wizard" });
  assert.equal(refused.entry, null, "a non-catalog feat cannot fill a Free Archetype slot");
}

// Level 2+ is allowed: a level-2 dedication resolves from the catalog.
{
  const [dedication] = await resolveFeatPicks([slot(2)], [pick(1, "Fighter Dedication")], { className: "Wizard" });
  assert.equal(dedication.entry?.name, "Fighter Dedication");
}

// Own-class dedications are never offered, even with the ability prerequisites met.
{
  const [own] = await resolveFeatPicks([slot(2)], [pick(1, "Fighter Dedication")], { className: "Fighter" });
  assert.equal(own.entry, null, "a Fighter cannot take the Fighter Dedication through Free Archetype");
}

// Cross-slot lock: a second dedication needs two more feats from the first package.
{
  const resolved = await resolveFeatPicks(
    [slot(2), slot(2, { ...none, int: 2 })],
    [pick(1, "Fighter Dedication"), pick(2, "Investigator Dedication")],
    { className: "Wizard" }
  );
  assert.equal(resolved[0].entry?.name, "Fighter Dedication");
  assert.equal(resolved[1].entry, null, "a second dedication without two package feats is refused");
}

// A package feat needs its dedication held first, then resolves once it is.
{
  const [blocked] = await resolveFeatPicks([slot(4)], [pick(1, "Basic Maneuver")], { className: "Wizard" });
  assert.equal(blocked.entry, null, "Basic Maneuver needs the Fighter Dedication first");
  const resolved = await resolveFeatPicks(
    [slot(2), slot(4)], [pick(1, "Fighter Dedication"), pick(2, "Basic Maneuver")], { className: "Wizard" }
  );
  assert.equal(resolved[1].entry?.name, "Basic Maneuver");
}

// Ability gate: Barbarian Dedication needs Strength +2 and Constitution +2.
{
  const [short] = await resolveFeatPicks([slot(2, { ...none, str: 2, con: 1 })], [pick(1, "Barbarian Dedication")], { className: "Wizard" });
  assert.equal(short.entry, null, "Barbarian Dedication is refused below Constitution +2");
  const [met] = await resolveFeatPicks([slot(2, { ...none, str: 2, con: 2 })], [pick(1, "Barbarian Dedication")], { className: "Wizard" });
  assert.equal(met.entry?.name, "Barbarian Dedication");
}
assert.equal(multiclassAbilityBlocker("Barbarian Dedication", { ...none, str: 2, con: 1 }), "Barbarian Dedication needs Constitution +2");
assert.equal(multiclassAbilityBlocker("Barbarian Dedication", null), "Barbarian Dedication needs ability modifiers that are not known");
assert.equal(multiclassAbilityBlocker("Toughness", none), null, "non-dedication feats carry no ability prerequisite");
assert.match(multiclassPickBlocker([], "Fighter Dedication", "Fighter"), /own class/);

// Ability-modifier plan: a boost adds 1 below +4 and 0.5 from +4, a flaw
// subtracts 1, values clamp to [-5, 10], and sections apply only at their level.
{
  const mods = deriveAbilityModifiers([{ level: 0, boosts: ["str"] }], 1);
  assert.equal(mods.str, 1);
  assert.equal(deriveAbilityModifiers([{ level: 0, boosts: Array(5).fill("str") }], 0).str, 4.5,
    "the fifth boost from +4 adds only half a point");
  assert.equal(deriveAbilityModifiers([{ level: 0, boosts: [], flaws: Array(6).fill("dex") }], 0).dex, -5, "flaws clamp at -5");
  const gated = [{ level: 0, boosts: ["str"] }, { level: 5, boosts: ["dex"] }];
  assert.equal(deriveAbilityModifiers(gated, 4).dex, 0, "a level-5 boost does not apply to a level-4 slot");
  assert.equal(deriveAbilityModifiers(gated, 5).dex, 1, "a level-5 boost applies at level 5");
  assert.throws(() => deriveAbilityModifiers([{ level: 0, boosts: ["luck"] }], 1), /unknown ability "luck"/);
}

// Plan mirror: ancestry slot boosts and flaws, background boost, and class key.
const doc = (system) => ({ toObject: () => ({ name: "Test", type: "item", system: structuredClone(system) }) });
const blank = { boosts: {}, flaws: {}, alternateAncestryBoosts: null, voluntary: null };
{
  const sections = plannedAbilitySections(
    doc({ ...blank, boosts: { 0: { value: ["cha"] } }, flaws: { 0: { value: ["str"] } } }),
    doc({ ...blank, boosts: { 0: { value: ["wis"] } } }),
    "str", []
  );
  const mods = deriveAbilityModifiers(sections, 0);
  assert.deepEqual(
    [mods.cha, mods.wis, mods.str, mods.dex],
    [1, 1, 0, 0],
    "ancestry boost cha, ancestry flaw str, background wis, class key str"
  );
  const total = (value) => Object.values(value).reduce((sum, n) => sum + n, 0);
  assert.equal(total(deriveAbilityModifiers(sections, 1)) - total(mods), 4,
    "level 1 adds four boosts from the class's priority list");
}
{
  const sections = plannedAbilitySections(
    doc({ ...blank, boosts: { 0: { value: ["cha"] } }, flaws: { 0: { value: ["str"] } },
      voluntary: { boost: "dex", flaws: ["con"] } }),
    doc(blank), "str", []
  );
  const mods = deriveAbilityModifiers(sections, 0);
  assert.deepEqual([mods.dex, mods.con, mods.str], [1, -1, 0], "voluntary boost and flaw are applied");
}
{
  const sections = plannedAbilitySections(
    doc({ ...blank, boosts: { 0: { value: ["cha"] } }, flaws: { 0: { value: ["str"] } },
      alternateAncestryBoosts: ["int", "wis"] }),
    doc(blank), "str", []
  );
  const mods = deriveAbilityModifiers(sections, 0);
  assert.deepEqual([mods.int, mods.wis, mods.cha, mods.str], [1, 1, 0, 1],
    "alternate ancestry boosts replace slot boosts and suppress slot flaws");
}

console.log("pc-freearchetype.test.mjs: Free Archetype catalog, lock, ability gate, and plan passed");
