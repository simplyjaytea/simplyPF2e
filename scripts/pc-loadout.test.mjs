import assert from "node:assert/strict";
import { applyCharacterLoadout, armorProficiencyRank, planCharacterLoadout, weaponProficiencyRank } from "./pc-loadout.mjs";

globalThis.CONFIG = { PF2E: { equivalentWeapons: { compositeLongbow: "longbow" } } };

function item(id, type, data, source = `Compendium.test.Item.${id}`) {
  return {
    id, type, _stats: { compendiumSource: source }, system: {
      equipped: { carryType: "worn", handsHeld: 0, inSlot: false }, ...data
    },
    getRollOptions: () => ["item:trait:elf"]
  };
}

const leather = item("leather", "armor", { category: "light", usage: { value: "wornarmor" } });
const plate = item("plate", "armor", { category: "heavy", usage: { value: "wornarmor" } });
const bow = item("bow", "weapon", { category: "martial", group: "bow", baseItem: "compositeLongbow", usage: { value: "held-in-two-hands" } });
const rapier = item("rapier", "weapon", { category: "simple", group: "sword", baseItem: "rapier", usage: { value: "held-in-one-hand" } });
const shield = item("shield", "shield", { usage: { value: "held-in-one-hand" } });
const nativeArmor = item("native", "armor", { category: "heavy", usage: { value: "wornarmor" } }, leather._stats.compendiumSource);
const actor = {
  items: new Map([nativeArmor, leather, plate, bow, rapier, shield].map((entry) => [entry.id, entry])),
  system: {
    proficiencies: {
      attacks: { martial: { rank: 1 }, simple: { rank: 0 }, "weapon-group-bow": { rank: 2 }, "weapon-base-longbow": { rank: 1 } },
      defenses: { light: { rank: 1 }, heavy: { rank: 0 } }
    }
  }
};
const expected = [leather, plate, bow, rapier, shield].map((entry) => ({ _id: entry.id, type: entry.type, _stats: entry._stats }));

assert.equal(weaponProficiencyRank(actor, bow), 2, "category, group, and equivalent base ranks use PF2e's maximum-rank rule");
assert.equal(armorProficiencyRank(actor, leather), 1, "armor category ranks come from prepared actor proficiencies");
const syntheticWeapon = item("synthetic", "weapon", { category: "advanced", usage: { value: "held-in-one-hand" } });
actor.system.proficiencies.attacks.familiarity = { rank: 1, definition: { test: (options) => options.has("item:trait:elf") } };
assert.equal(weaponProficiencyRank(actor, syntheticWeapon), 1, "prepared synthetic weapon proficiency predicates are honored");
delete actor.system.proficiencies.attacks.familiarity;

const plan = planCharacterLoadout(actor, expected);
assert.deepEqual(plan.warnings.sort(), ["loadout-hand-conflict", "loadout-untrained-armor", "loadout-untrained-weapon"],
  "untrained and hand-conflicting selections are explicit review warnings");
assert.equal(plan.equipped, 2, "one trained armor and one two-handed weapon are readied");
const byId = new Map(plan.updates.map((patch) => [patch._id, patch]));
assert.equal(byId.get("leather")?.["system.equipped.inSlot"], true, "the trained armor is made active in its slot");
assert.equal(byId.get("plate")?.["system.equipped.carryType"], "stowed");
assert.equal(byId.get("bow")?.["system.equipped.handsHeld"], 2);
assert.equal(byId.get("rapier")?.["system.equipped.carryType"], "stowed");
assert.equal(byId.get("shield")?.["system.equipped.carryType"], "stowed");
assert.ok(!byId.has("native"), "a native item with the same compendium source is never changed");

let written = null;
actor.updateEmbeddedDocuments = async (type, updates) => { written = { type, updates }; };
const applied = await applyCharacterLoadout(actor, expected);
assert.equal(written.type, "Item");
assert.deepEqual(written.updates, applied.updates, "the wrapper writes only the deterministic plan");
assert.deepEqual(planCharacterLoadout({ system: {} }, expected),
  { updates: [], warnings: ["loadout-native-data"], equipped: 0 }, "missing native items fails closed without writes");
console.log("pc-loadout.test.mjs: proficiency-aware armor and hand planning passed");
