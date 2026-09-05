// Source excerpts fetched from foundryvtt/pf2e/master/packs/equipment/ on
// 2026-09-05. These test source authorization, not custom-item game balance.
import assert from "node:assert/strict";
import { getForgeEffectCatalog } from "./rule-templates.mjs";
import { normalizeMagicItemConcept } from "./item-builder.mjs";
import { SETTINGS } from "./settings.mjs";

const item = (id, name, level, rarity, traits, price, description, rules, usage = "worn") => ({
  _id: id, name, type: "equipment", system: {
    level: { value: level }, traits: { rarity, value: traits }, price: { value: price },
    description: { value: description }, rules, usage: { value: usage }
  }
});
// final-scalecloak.json: actual level, traits, empty price and simple rules.
const finalScalecloak = item("final", "Final Scalecloak", 20, "unique", ["artifact", "invested", "magical", "mythic"], {},
  "<p>When worn, the <em>Final Scalecloak</em> grants you resistance 15 to physical and precision damage, immunity to electricity, and a Fly speed of 60 feet.</p>",
  [{ key: "Immunity", type: "electricity" }, { key: "BaseSpeed", selector: "fly", value: 60 }], "worncloak");
// splendid-skull-mask.json: a positive-priced level-zero prerequisite item.
const skullMask = item("mask", "Splendid Skull Mask", 0, "common", ["ratfolk"], { gp: 50 },
  "<p>Prerequisite: @UUID[Compendium.pf2e.feats-srd.Item.Skull Creeper].</p>\n<p>The mask grants you a +1 item bonus to Intimidation.</p>",
  [{ key: "FlatModifier", selector: "intimidation", type: "item", value: 1 }], "wornmask");
// boots-of-elvenkind.json: ordinary priced equipment whose investment stays.
const boots = item("boots", "Boots of Elvenkind", 5, "common", ["invested", "magical"], { gp: 145 },
  "<p>When worn, the boots allow you to move more nimbly, granting you a +1 item bonus to Acrobatics checks.</p>",
  [{ key: "FlatModifier", selector: "acrobatics", type: "item", value: 1 }], "wornshoes");
// aeon-stone-preserving.json: real meta-damage type outside forge support.
const preserving = item("preserving", "Aeon Stone (Preserving)", 5, "uncommon", ["invested", "magical"], { gp: 150 },
  "<p>You gain resistance 3 to persistent damage.</p>", [{ key: "Resistance", type: "persistent-damage", value: 3 }]);
// orc-warmask.json: dynamic selector; price/context independently restrict it.
const warmask = item("warmask", "Orc Warmask", 0, "common", ["invested", "magical"], {},
  "<p>Granted by @UUID[Compendium.pf2e.feats-srd.Item.Orc Warmask]</p>",
  [{ key: "FlatModifier", selector: "{item|flags.pf2e.rulesSelections.tradition}", type: "item", value: 1 }], "wornmask");

// Deliberate variants isolate each gate so an exclusion cannot accidentally
// pass only because another property of the published source also excludes it.
const variant = (name, source, patch) => {
  const result = structuredClone(source);
  result._id = name; result.name = name;
  Object.assign(result.system, patch);
  return result;
};
const restrictedVariants = [
  ...["artifact", "mythic", "cursed", "intelligent"].map((trait) => variant(trait, boots, { traits: { rarity: "common", value: [trait] } })),
  ...["Craft Requirements: You are a wizard.", "Requirements: Be a member.", "Access: Members of a lodge.",
    "This gift can only be received from its creator.", "This item cannot be purchased.", "Granted by a class feature."].map((text, i) =>
    variant(`restricted-${i}`, boots, { description: { value: `<p>${text}</p>` } })),
  variant("no-price", boots, { price: { value: {} } }),
  variant("no-traits", boots, { traits: undefined }),
  variant("no-description", boots, { description: undefined }),
  variant("unsupported-travel", boots, { rules: [{ key: "FlatModifier", selector: "travel-speed", type: "item", value: 10 }] }),
  variant("unsupported-dynamic", boots, { rules: warmask.system.rules }),
  variant("unsupported-persistent", boots, { rules: preserving.system.rules })
];
const rareBoots = variant("rare-boots", boots, {
  traits: { rarity: "rare", value: ["invested", "magical"] },
  rules: [{ key: "FlatModifier", selector: "acrobatics", type: "item", value: 2 }]
});
let fields;
const entries = [finalScalecloak, skullMask, preserving, warmask, ...restrictedVariants, boots, rareBoots];
globalThis.game = {
  settings: { get: (_module, key) => key === SETTINGS.sourcePacks ? { equipment: ["qa.source-eligibility"] } : null },
  packs: new Map([["qa.source-eligibility", {
    metadata: { type: "Item" }, async getIndex(options) { fields = options.fields; return entries; }
  }]])
};
const common = await getForgeEffectCatalog(20, "common");
assert.deepEqual(common.map((effect) => effect.exemplar.sourceName), ["Boots of Elvenkind"],
  "restricted/unsupported sources are rejected before dedup; an eligible same-rule source survives");
for (const field of ["system.traits.value", "system.traits.rarity", "system.description.value", "system.usage.value", "system.price.value"]) {
  assert.ok(fields.includes(field), `catalog requests ${field} before authorizing a source`);
}
const rare = await getForgeEffectCatalog(20, "rare");
assert.deepEqual(rare.map((effect) => effect.value), [1, 2], "rarity is capped against the requested item");
assert.deepEqual((await getForgeEffectCatalog(20, "unique")).map((effect) => effect.value), [1, 2],
  "requesting unique still cannot authorize artifacts or other restricted sources");
const effect = { kind: "itemBonus", statistic: "acrobatics", scale: "high" };
const args = { level: 20, rarity: "common", availableKinds: ["itemBonus"], usageOptions: ["worn", "held-in-one-hand"], effectCatalog: rare };
const worn = normalizeMagicItemConcept({ invested: false, usage: "worn", effects: [effect] }, args);
assert.equal(worn.effects[0].value, 1, "normalization rechecks rarity even against a broader issued catalog");
assert.equal(worn.invested, true);
assert.ok(worn.traits.includes("invested"), "the model cannot strip published investment");
const held = normalizeMagicItemConcept({ usage: "held-in-one-hand", effects: [effect] }, args);
assert.deepEqual(held.effects, [], "a held item cannot inherit an effect requiring worn investment");
assert.equal(held.invested, false);
const buff = normalizeMagicItemConcept({ invested: false, usage: "worn", activation: {
  template: "selfBuff", params: { ruleEffectKinds: [effect] }
} }, args);
assert.equal(buff.invested, true, "self-buff source investment is also retained by the parent item");
assert.ok(buff.traits.includes("invested"));
console.log("forge source-context eligibility, supported targets and investment passed");
