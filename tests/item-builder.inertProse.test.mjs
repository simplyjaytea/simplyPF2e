// Forge prose end to end. A magic item's AI description is enricher-inert. A runed item's summary names its
// property runes from the compendium: a rune whose name is hostile markup or an enricher is escaped and inert,
// and the runed item still builds with its real sources. The compendium is a fixture world, so no Foundry or
// provider call is made.
// Run: node tests/item-builder.inertProse.test.mjs
import assert from "node:assert/strict";
import { enricherTokens } from "../scripts/reskin-policy.mjs";
import { issueCandidate } from "../scripts/compendium.mjs";
import { load, makeWorld, installWorld } from "./fixtures/pc-wizard/world.mjs";

globalThis.foundry = { utils: { randomID: () => "test-id", deepClone: (value) => structuredClone(value) } };
globalThis.CONST = {};
const worlds = installWorld();
globalThis.game.i18n = { localize: (key) => key, format: (key) => key };
// Native preparation stub: the build only needs a level, a price and a rarity back, with the runes carried through.
// Price and level are not under test here (N26 covers the native values).
globalThis.CONFIG = { Item: { documentClass: class {
  constructor(data) { this.system = structuredClone(data.system); this.level = 8; this.price = { value: { gp: 1000 } }; this.rarity = "common"; }
} } };
const { buildMagicItemData, buildRunedItem } = await import("../scripts/item-builder.mjs");

// 1. Magic item: the AI description keeps its words and loses its enrichers.
const magic = await buildMagicItemData({
  name: "Sparkstaff", level: 3, rarity: "common",
  description: "Hums @UUID[Compendium.pf2e.spells-srd.Item.Spark]{Spark} and [[/r 1d4]] at dusk.\n\n@Damage[2d6[fire]] on a [[/gm 1d20]] check.",
  effects: [], traits: [], bulk: 1, usage: "held-in-one-hand", activation: null
});
const magicHtml = magic.system.description.value;
assert.equal(enricherTokens(magicHtml).length, 0, "no AI enricher survives in the magic item description");
assert.ok(magicHtml.includes("Hums &#64;UUID&#91;Compendium.pf2e.spells-srd.Item.Spark]{Spark}"), "the description keeps its readable text");

// 2. Runed item: a compendium rune named with markup and an enricher. Its summary is escaped; the item builds.
const HOSTILE = "<img src=x onerror=alert(1)> @UUID[Compendium.pf2e.feats-srd.Item.Zap]{Zap} [[/r 1d20]]";
const base = { _id: "plate", name: "Full Plate", type: "armor", system: {
  level: { value: 2 }, category: "heavy", price: { value: { gp: 1500 } }, bulk: { value: 4 }, usage: { value: "wornarmor" },
  traits: { value: [], rarity: "common" }, runes: { potency: 0, resilient: 0, property: [] }, specific: null,
  material: { type: null, grade: null }, description: { value: "" } } };
const potency = { _id: "pot1", name: "Armor Potency (+1)", type: "equipment", system: { level: { value: 5 }, price: { value: { gp: 160 } }, usage: { value: "" }, traits: { value: [], rarity: "common" }, description: { value: "" } } };
const rune = { _id: "hostile", name: HOSTILE, type: "equipment", system: { level: { value: 8 }, price: { value: { gp: 500 } }, usage: { value: "etched-onto-armor" }, traits: { value: ["magical"], rarity: "common" }, description: { value: "" } } };
const pack = "pf2e.equipment-srd";
worlds.use(makeWorld({ [pack]: [base, potency, rune] }));

const baseCandidate = issueCandidate({ packId: pack, _id: base._id }, { name: base.name, level: 2, category: "heavy" });
const potencyCandidate = issueCandidate({ packId: pack, _id: potency._id }, { name: potency.name, level: 5, tier: 1 });
const runeCandidate = issueCandidate({ packId: pack, _id: rune._id }, { name: HOSTILE, level: 8, usage: "etched-onto-armor" });
const runed = await buildRunedItem({
  kind: "armor", rarity: "common", description: "A plate with a hostile rune.", maxLevel: 20,
  baseItemCandidate: baseCandidate, baseItemName: base.name, potency: 1, secondaryTier: 0,
  potencyRuneCandidate: potencyCandidate, secondaryRuneCandidate: null,
  propertyRuneCandidates: [runeCandidate], propertyRunes: [HOSTILE]
});
const summary = runed.itemData.system.description.value;
assert.doesNotMatch(summary, /<img/, "the rune name's markup is escaped, never a live tag");
assert.ok(summary.includes("&lt;img src=x onerror=alert(1)&gt;"), "the escaped rune name is what the GM reads");
assert.equal(enricherTokens(summary).length, 0, "the rune name's enricher is inert in the runed summary");
assert.ok(summary.includes("&#64;UUID&#91;Compendium.pf2e.feats-srd.Item.Zap]{Zap}"), "the rune name keeps its readable text");
assert.ok(summary.includes("A plate with a hostile rune."), "the AI description is kept");
// The intended mechanic is the rune itself, which the build keeps as a real rune key.
assert.ok(runed.itemData.system.runes.property.length === 1, "the property rune is still applied as a real rune");

console.log("item-builder.inertProse.test.mjs: magic item prose is inert, and a hostile compendium rune name is escaped in the runed summary");
