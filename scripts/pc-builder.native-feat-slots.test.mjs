import assert from "node:assert/strict";
import { buildFeatSlots } from "./pc-tables.mjs";

// PF2e 8.5.0 ClassPF2e#grantedFeatSlots reads these four class-owned arrays.
// Published Fighter/Rogue/Investigator arrays come from:
// https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/classes/<class>.json
const common = {
  ancestryFeatLevels: { value: [1, 5, 9, 13, 17] },
  classFeatLevels: { value: [1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20] },
  generalFeatLevels: { value: [3, 7, 11, 15, 19] }
};
const classes = {
  Fighter: { ...common, skillFeatLevels: { value: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20] } },
  Rogue: { ...common, skillFeatLevels: { value: Array.from({ length: 20 }, (_, index) => index + 1) } },
  Investigator: { ...common, skillFeatLevels: { value: Array.from({ length: 19 }, (_, index) => index + 2) } }
};
for (const [name, classSystem] of Object.entries(classes)) {
  for (let level = 1; level <= 20; level++) {
    const slots = buildFeatSlots(level, { classSystem });
    for (const type of ["ancestry", "class", "skill", "general"]) {
      assert.deepEqual(slots.filter((slot) => slot.type === type).map((slot) => slot.level),
        classSystem[`${type}FeatLevels`].value.filter((earnedLevel) => earnedLevel <= level),
        `${name} level ${level} retains every native ${type} entitlement`);
    }
  }
}
assert.deepEqual(buildFeatSlots(1, { classSystem: classes.Fighter }).map((slot) => slot.type), ["ancestry", "class"],
  "a level-one Fighter gets its class feat in addition to its ancestry feat");
assert.deepEqual(buildFeatSlots(3, { classSystem: classes.Rogue }).filter((slot) => slot.type === "skill").map((slot) => slot.level),
  [1, 2, 3], "a Rogue's skill feats are not reduced to even levels");
const variant = buildFeatSlots(3, { classSystem: classes.Rogue, freeArchetype: true });
assert.deepEqual(variant.filter((slot) => slot.archetype).map((slot) => slot.level), [2],
  "native class level-one feats do not add a level-one Free Archetype slot");
for (const broken of [{}, { ...classes.Fighter, classFeatLevels: { value: null } },
  { ...classes.Fighter, skillFeatLevels: { value: [2, "4"] } },
  { ...classes.Fighter, generalFeatLevels: { value: [0, 3] } }]) {
  assert.throws(() => buildFeatSlots(5, { classSystem: broken }), /feat schedule/,
    "unreadable native schedules fail closed rather than silently losing entitlements");
}

const source = (name, type, system) => ({ _id: name, name, type, system });
const entries = {
  ancestry: source("Human", "ancestry", {}),
  background: source("Scholar", "background", { trainedSkills: { value: ["society"], lore: [] } }),
  class: source("Rogue", "class", { ...classes.Rogue, trainedSkills: { value: ["stealth"], additional: 7 },
    items: { deny: { level: 3, name: "Deny Advantage", uuid: "Compendium.pf2e.classfeatures.Item.Deny Advantage" } } })
};
const packMap = new Map();
for (const [category, entry] of Object.entries(entries)) {
  const id = `test.${category}`;
  packMap.set(id, {
    collection: id, metadata: { type: "Item", label: category },
    getIndex: async () => [entry],
    getDocument: async () => ({ ...entry, uuid: `Compendium.${id}.Item.${entry._id}` })
  });
}
const feats = ["ancestry", "class", "skill", "general"].map((category) =>
  source(`${category} feat`, "feat", { level: { value: 1 }, category,
    traits: { value: ["human", "rogue", "investigator"] }, prerequisites: { value: [] } }));
feats.push(...["Society", "Stealth", "Arcana or Stealth"].map((skill) =>
  source(`${skill} feat`, "feat", { level: { value: 1 }, category: "skill",
    traits: { value: [] }, prerequisites: { value: [{ value: `trained in ${skill}` }] } })));
feats.push(source("Later feature feat", "feat", { level: { value: 1 }, category: "class",
  traits: { value: ["rogue"] }, prerequisites: { value: [{ value: "Deny Advantage" }] } }));
packMap.set("test.feats", { collection: "test.feats", metadata: { type: "Item", label: "Feats" }, getIndex: async () => feats });
globalThis.game = {
  settings: { get: (_module, key) => key === "freeArchetype" ? false : {
    ancestries: ["test.ancestry"], backgrounds: ["test.background"], classes: ["test.class"], feats: ["test.feats"]
  } },
  packs: { get: (id) => packMap.get(id), [Symbol.iterator]: () => packMap.values() }
};
const { resolvePCConcept } = await import("./pc-builder.mjs");
const concept = { ancestry: "Human", background: "Scholar", class: "Rogue", level: 3,
  feats: [], focusSpells: [], equipment: [], loot: [] };
const resolved = await resolvePCConcept(concept);
assert.deepEqual(resolved.featSlots.map(({ type, level }) => ({ type, level })),
  buildFeatSlots(3, { classSystem: classes.Rogue }), "production resolution carries every native entitlement to selection");
assert.ok(resolved.featSlots.every((slot) => slot.candidates.length), "each supported Rogue entitlement reaches its candidate catalog");
assert.ok(!resolved.featSlots.filter((slot) => slot.type === "class").some((slot) =>
  slot.candidates.some((candidate) => candidate.name === "Later feature feat")),
"a later native class grant cannot satisfy a feat's earlier earned slot");

entries.class.name = "Investigator";
entries.class.system = { ...classes.Investigator, trainedSkills: { value: ["stealth"], additional: 4 },
  items: { skillful: { level: 3, name: "Skillful Lessons", uuid: "Compendium.pf2e.classfeatures.Item.dmK1wya8GBi9MmCB" } } };
const investigator = await resolvePCConcept(concept);
assert.deepEqual(investigator.featSlots.filter((slot) => slot.type === "skill").map((slot) => slot.level), [2, 3]);
assert.deepEqual(investigator.featSlots.find((slot) => slot.type === "skill" && slot.level === 3).candidates.map((candidate) => candidate.name),
  ["Society feat"], "published Skillful Lessons receives only a provable qualifying mental-skill candidate");
assert.ok(investigator.featSlots.find((slot) => slot.type === "skill" && slot.level === 2).candidates.some((candidate) => candidate.name === "Stealth feat"),
  "ordinary even-level skill feats keep their normal prerequisite catalog");
entries.class.system.skillFeatLevels = null;
await assert.rejects(resolvePCConcept(concept), /feat schedule/, "production resolution refuses unreadable native schedules");

console.log("pc-builder.native-feat-slots.test.mjs: native feat schedules and production resolution passed");
