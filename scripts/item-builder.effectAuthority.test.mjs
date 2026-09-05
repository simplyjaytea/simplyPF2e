// Exercise published-rule harvesting, exact cloning, and the numeric AI boundary.
import assert from "node:assert/strict";
import { getForgeEffectCatalog } from "./rule-templates.mjs";
import {
  normalizeMagicItemConcept, normalizeRunedItemConcept, cloneRulesForEffects,
  damageDiceForLevel, saveDcForLevel
} from "./item-builder.mjs";
import { SETTINGS } from "./settings.mjs";

const bonus = (value) => ({ key: "FlatModifier", selector: "stealth", type: "item", value });
const entry = (id, level, rule, type = "equipment") => ({
  _id: id, name: id, type, system: {
    level: { value: level }, rules: [rule], traits: { rarity: "common", value: ["magical"] },
    usage: { value: "worn" }, price: { value: { gp: 10 } }, description: { value: "<p>A test source item.</p>" }
  }
});
const entries = [
  entry("minor", 1, bonus(1)), entry("moderate", 3, bonus(2)), entry("major", 5, bonus(3)),
  entry("too-high", 20, bonus(4)), entry("feat", 1, bonus(8), "feat"),
  entry("conditional", 1, { ...bonus(9), predicate: ["hidden"] }),
  entry("unknown-level", undefined, bonus(10)),
  entry("scent", 2, { key: "Sense", selector: "scent", acuity: "imprecise", range: 30 }),
  entry("speed", 2, { key: "BaseSpeed", selector: "swim", value: 15 })
];
let requestedFields;
const pack = { metadata: { type: "Item" }, async getIndex({ fields }) { requestedFields = fields; return entries; } };
globalThis.game = {
  settings: { get: (_module, key) => key === SETTINGS.sourcePacks ? { equipment: ["qa.equipment"] } : null },
  packs: new Map([["qa.equipment", pack]])
};
const catalog = await getForgeEffectCatalog(5);
assert.ok(requestedFields.includes("system.level.value"), "source item levels must be requested from the actual index");
assert.equal(catalog.length, 5, "above-level, non-equipment, conditional and missing-level rules are excluded");
const args = { level: 5, rarity: "common", availableKinds: ["itemBonus", "sense", "speed"], usageOptions: ["worn"], effectCatalog: catalog };
const make = (raw, override = {}) => normalizeMagicItemConcept(raw, { ...args, ...override });
const effects = make({ effects: [
  { kind: "itemBonus", statistic: "stealth", scale: "high", value: 999 },
  { kind: "sense", type: "scent", scale: "high", range: 999, acuity: "precise" },
  { kind: "speed", type: "swim", value: 999 }
] }).effects;
assert.equal(effects[0].value, 3, "the selected high value is an eligible published equipment value");
assert.deepEqual({ range: effects[1].range, acuity: effects[1].acuity }, { range: 30, acuity: "imprecise" });
assert.equal(effects[2].value, 15);
const { rules } = await cloneRulesForEffects(effects);
assert.deepEqual(rules, [bonus(3), entries[7].system.rules[0], entries[8].system.rules[0]],
  "cloning retains the full issued rule unchanged");
rules[0].value = 777;
assert.equal(effects[0].exemplar.rule.value, 3, "output does not mutate catalog authority");
for (const [scale, value] of [["low", 1], ["moderate", 2], ["high", 3]]) {
  assert.equal(make({ effects: [{ kind: "itemBonus", statistic: "stealth", scale }] }).effects[0].value, value);
}
assert.equal(make({ effects: [{ kind: "itemBonus", statistic: "ac", value: 4 }] }).effects.length, 0,
  "a valid selector without matching published authority fails closed");
assert.equal(make({ effects: [{ kind: "itemBonus", statistic: "stealth", scale: "high" }] }, { level: 1 }).effects[0].value, 1,
  "normalization independently rechecks source level");
assert.equal(make({ bulk: 999 }).bulk, 0);
assert.equal(make({ bulk: "light" }).bulk, 0.1);
for (const template of ["damage", "heal"]) {
  const activation = make({ activation: { template, actionCost: 3, params: { damageDice: "12d12+99", healDice: "12d12+99", dc: 99 } } }).activation;
  assert.equal(activation.actionCost, 1, "numeric action costs do not control mechanics");
  assert.equal(activation.params[template === "heal" ? "healDice" : "damageDice"], damageDiceForLevel(5));
  if (template === "damage") assert.equal(activation.params.dc, saveDcForLevel(5));
}
const condition = make({ activation: { template: "condition", actionCost: "two", params: {
  conditionSlug: "frightened", value: 6, saveType: "will", dc: 99, duration: "round", basicSave: true
} } }).activation;
assert.equal(condition.actionCost, 2);
assert.equal(condition.params.value, 1);
assert.equal(condition.params.dc, saveDcForLevel(5));
assert.equal(condition.params.duration, "1 round");
assert.equal(condition.params.basicSave, false, "condition saves negate rather than invent basic-save outcomes");
const buff = make({ activation: { template: "selfBuff", params: {
  durationRounds: 100, durationMinutes: 600,
  ruleEffectKinds: [{ kind: "itemBonus", statistic: "stealth", scale: "low", value: 999 }]
} } }).activation;
assert.equal(buff.params.durationRounds, null);
assert.equal(buff.params.durationMinutes, 1, "a self-buff has a finite module-owned default");
assert.equal(buff.params.ruleEffectKinds[0].value, 1);
const runeArgs = { kind: "weapon", rarity: "common", baseCandidates: [{ name: "Sword" }], runeCandidates: [], potencyTiers: [1, 2, 3], secondaryTiers: [1, 2, 3] };
assert.throws(() => normalizeRunedItemConcept({ baseItemName: "Sword", potency: 3, secondaryTier: 3 }, runeArgs),
  /potency rune/, "numeric rune choices cannot authorize a required tier");
assert.equal(normalizeRunedItemConcept({ baseItemName: "Sword", potency: "double", secondaryTier: "greater" }, runeArgs).secondaryTier, 2);
console.log("forge published-effect and enum-only mechanics authority passed");
