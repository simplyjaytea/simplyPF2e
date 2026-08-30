// NPC MeleePF2e accepts only configured damage types and attack traits, and
// stores ranged increments in system.range (PF2e 8.4.1 item/melee/data.ts).
// Run: node scripts/builder.strikeValidation.test.mjs

import assert from "node:assert/strict";

globalThis.CONFIG = {
  PF2E: {
    damageTypes: { bludgeoning: "", fire: "" },
    npcAttackTraits: { agile: "", "reach-10": "", "thrown-20": "" },
    attackEffects: { grab: "", trip: "" }
  }
};
globalThis.CONST = { TOKEN_DISPLAY_MODES: { OWNER_HOVER: 20 } };
globalThis.foundry = { utils: { randomID: () => "test-id" } };

let created = null;
globalThis.Actor = { create: async (data) => {
  created = data;
  return data;
} };

const { normalizeConcept, createActor } = await import("./builder.mjs");

const concept = normalizeConcept({
  name: "Range Test",
  strikes: [
    {
      name: "ember sling",
      type: "ranged",
      damageType: "acid",
      traits: ["agile", "not-a-trait"],
      range: 503,
      attackEffects: ["grab", "invented-effect"]
    },
    {
      name: "fist",
      type: "melee",
      damageType: "fire",
      range: 30,
      traits: ["reach-10"],
      attackEffects: ["trip"]
    },
    {
      name: "throwing knife",
      type: "melee",
      damageType: "piercing",
      range: 30,
      traits: ["thrown-20"],
      attackEffects: []
    }
  ]
}, { level: 5, rarity: "common" });

assert.deepEqual(concept.strikes[0], {
  name: "ember sling", type: "ranged", attackScale: "high", damageScale: "high",
  damageType: "bludgeoning", traits: ["agile"], range: 500, attackEffects: ["grab"]
}, "types absent from the installed PF2e catalog must fail closed and ranged range must clamp to PF2e's 500-foot ceiling");
assert.equal(concept.strikes[1].range, null, "melee strikes must not retain a ranged increment");
assert.deepEqual(
  concept.strikes[2],
  {
    name: "throwing knife", type: "ranged", attackScale: "high", damageScale: "high",
    damageType: "bludgeoning", traits: ["thrown-20"], range: 20, attackEffects: []
  },
  "a valid thrown trait must control the range PF2e will derive during data preparation"
);

await createActor(concept, {
  abilities: [], feats: [], spells: [], focusSpells: [], equipment: [], loot: []
});
const strikes = created.items.filter((item) => item.type === "melee");
assert.deepEqual(
  strikes[0].system.range,
  { increment: 500, max: null },
  "new ranged NPC attacks must use PF2e's structured range data"
);
assert.equal(strikes[1].system.range, null, "new melee NPC attacks must have no range object");
assert.deepEqual(strikes[2].system.range, { increment: 20, max: null }, "thrown attacks must emit their trait-derived range");
assert.deepEqual(strikes[0].system.traits.value, ["agile"], "no legacy range trait may be synthesized");

console.log("builder NPC strike validation regression check: all assertions passed");
