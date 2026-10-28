// WP6 C1: pinned rank templates, rank rules, and built scrolls and wands against
// the native field map (research section 9) and the published pf2e 8.5.0 samples.
// Run: node tests/spell-consumables.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SPELL_CONSUMABLE_TEMPLATES, spellConsumableTemplateUuid, spellConsumableTemplateRef,
  spellConsumableRankProblem, spellConsumableName, buildSpellConsumable
} from "../scripts/spell-consumables.mjs";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/consumables/${name}`, import.meta.url), "utf8"));
const SCROLL_TEMPLATE = fixture("scroll-of-1st-rank-spell.json");
const WAND_TEMPLATE = fixture("magic-wand-4th-rank-spell.json");
const SPIDER_WAND = fixture("wand-of-the-spider-4th-rank-spell.json");
const HEAL = fixture("heal.json");
const HEAL_UUID = `Compendium.pf2e.spells-srd.Item.${HEAL._id}`;
const withSource = (spell, uuid) => ({ ...structuredClone(spell), _stats: { compendiumSource: uuid } });
// Expected template UUIDs from the research record (section 2.3 ids), not from the module.
const pinnedScroll1 = `Compendium.pf2e.equipment-srd.Item.RjuupS9xyXDLgyIr`;
const pinnedWand4 = `Compendium.pf2e.equipment-srd.Item.Sn7v9SsbEDMUIwrO`;
const SCROLL_1 = withSource(SCROLL_TEMPLATE, pinnedScroll1);
const WAND_4 = withSource(WAND_TEMPLATE, pinnedWand4);

// Expected ids copied from docs/plans/consumables-research-2026-10-26.md section 2.3
// (the 8.5.0 config in section 2.2 names the same ids; section 2.3 says master is identical).
const RECORD_SCROLL_IDS = [
  "RjuupS9xyXDLgyIr", "Y7UD64foDbDMV9sx", "ZmefGBXGJF3CFDbn", "QSQZJ5BC3DeHv153", "tjLvRWklAylFhBHQ",
  "4sGIy77COooxhQuC", "fomEZZ4MxVVK3uVu", "iPki3yuoucnj7bIt", "cFHomF3tty8Wi1e5", "o1XIHJ4MJyroAHfF"
];
const RECORD_WAND_IDS = [
  "UJWiN0K3jqVjxvKk", "vJZ49cgi8szuQXAD", "wrDmWkGxmwzYtfiA", "Sn7v9SsbEDMUIwrO", "5BF7zMnrPYzyigCs",
  "kiXh4SUWKr166ZeM", "nmXPj9zuMRQBNT60", "Qs8RgNH6thRPv2jt", "Fgv722039TVM5JTc"
];
const RECORD_CANTRIP_DECK_ID = "tLa4bewBhyqzi6Ow";
const uuidFor = (id) => `Compendium.pf2e.equipment-srd.Item.${id}`;

// 1. The pinned table equals the research record.
assert.deepEqual({ ...SPELL_CONSUMABLE_TEMPLATES.scroll }, Object.fromEntries(RECORD_SCROLL_IDS.map((id, i) => [i + 1, uuidFor(id)])),
  "scroll templates for ranks 1 to 10 match the research record");
assert.deepEqual({ ...SPELL_CONSUMABLE_TEMPLATES.wand }, Object.fromEntries(RECORD_WAND_IDS.map((id, i) => [i + 1, uuidFor(id)])),
  "wand templates for ranks 1 to 9 match the research record");
assert.equal(SPELL_CONSUMABLE_TEMPLATES.cantripDeck, uuidFor(RECORD_CANTRIP_DECK_ID), "cantrip deck matches the research record");
assert.equal(spellConsumableTemplateUuid("wand", 10), null, "wand rank 10 has no template");
assert.equal(spellConsumableTemplateUuid("scroll", 10), uuidFor("o1XIHJ4MJyroAHfF"), "scroll rank 10 has a template");
for (const [kind, rank] of [["scroll", 0], ["scroll", 11], ["scroll", 1.5], ["wand", 0], ["wand", 10], ["spell-gem", 1], ["toString", 1], ["cantripDeck", 2]]) {
  assert.equal(spellConsumableTemplateUuid(kind, rank), null, `no template for ${kind} rank ${rank}`);
}
assert.deepEqual(spellConsumableTemplateRef("scroll", 1), { packId: "pf2e.equipment-srd", _id: "RjuupS9xyXDLgyIr" });
assert.equal(spellConsumableTemplateRef("wand", 10), null);
// The fixture templates are the table entries they claim to be.
assert.equal(SCROLL_TEMPLATE._id, RECORD_SCROLL_IDS[0], "scroll fixture is the rank 1 template");
assert.equal(WAND_TEMPLATE._id, RECORD_WAND_IDS[3], "wand fixture is the rank 4 template");

// 2. Rank rules, one assertion per branch.
const spell = ({ level = 1, traits = ["healing", "manipulate", "vitality"], ritual } = {}) => ({
  name: "Heal", system: { level: { value: level }, traits: { value: traits, traditions: ["divine", "primal"], rarity: "common" }, ritual }
});
const heal = spell();
assert.equal(spellConsumableRankProblem(heal, "scroll", 1), null, "Heal may be a rank 1 scroll");
assert.equal(spellConsumableRankProblem(heal, "scroll", 10), null, "Heal may be a rank 10 scroll");
assert.equal(spellConsumableRankProblem(heal, "wand", 9), null, "Heal may be a rank 9 wand");
assert.match(spellConsumableRankProblem(heal, "cantripDeck", 1), /requires a cantrip/);
assert.match(spellConsumableRankProblem(heal, "toString", 1), /not a scroll or wand/, "inherited keys are not kinds");
assert.match(spellConsumableRankProblem(heal, "scroll", 0), /whole number from 1 to 10/);
assert.match(spellConsumableRankProblem(heal, "scroll", 11), /whole number from 1 to 10/);
assert.match(spellConsumableRankProblem(heal, "scroll", 1.5), /whole number/);
assert.match(spellConsumableRankProblem(heal, "scroll", "2"), /whole number/);
assert.match(spellConsumableRankProblem(heal, "wand", 10), /from 1 to 9/, "wand rank 10 refused");
assert.match(spellConsumableRankProblem(spell({ level: 3 }), "scroll", 2), /below the spell's base rank 3/);
assert.match(spellConsumableRankProblem(spell({ traits: ["cantrip", "healing"] }), "scroll", 1), /cantrips/);
assert.match(spellConsumableRankProblem(spell({ traits: ["focus", "healing"] }), "scroll", 2), /focus spells/);
assert.match(spellConsumableRankProblem(spell({ ritual: { primary: {}, secondary: {} } }), "scroll", 1), /rituals/);
assert.match(spellConsumableRankProblem(null, "scroll", 1), /missing/);
assert.match(spellConsumableRankProblem({ system: {} }, "scroll", 1), /no base rank/);

// 3. Names.
assert.equal(spellConsumableName("scroll", "Heal", 1), "Scroll of Heal (Rank 1)");
assert.equal(spellConsumableName("wand", "Web", 4), "Wand of Web (Rank 4)");
assert.equal(spellConsumableName("scroll", "Cost $& Co", 2), "Scroll of Cost $& Co (Rank 2)", "spell names are inserted literally");
assert.equal(spellConsumableName("cantripDeck", "Light", 1), "Cantrip Deck of Light (5-pack)", "cantrip deck uses the native name template");

// 4. Scroll built from the pinned rank 1 template and Heal, against the native field map.
const before = structuredClone({ template: SCROLL_1, heal: HEAL });
const scroll = buildSpellConsumable({ kind: "scroll", rank: 1, templateData: SCROLL_1, spellData: withSource(HEAL, HEAL_UUID) });
assert.deepEqual({ template: SCROLL_1, heal: HEAL }, before, "inputs are not mutated");
assert.equal(scroll.type, "consumable");
assert.equal(scroll._id, undefined, "the item carries no _id");
assert.equal(scroll.name, "Scroll of Heal (Rank 1)");
assert.equal(scroll.system.category, "scroll");
assert.deepEqual(scroll.system.uses, { autoDestroy: true, max: 1, value: 1 }, "uses come from the template");
assert.equal(scroll.system.usage.value, "held-in-one-hand");
assert.deepEqual(scroll.system.price.value, { gp: 4 }, "price comes from the template");
assert.equal(scroll.system.level.value, 1, "level comes from the template");
assert.equal(scroll.system.bulk.value, 0.1);
assert.deepEqual(scroll.system.rules, [], "no Rule Elements (invariant 2)");
assert.equal(scroll.system.traits.rarity, "common", "rarity is the spell's rarity");
const uncommonScroll = buildSpellConsumable({
  kind: "scroll", rank: 1, templateData: SCROLL_1,
  spellData: withSource({ ...HEAL, system: { ...HEAL.system, traits: { ...HEAL.system.traits, rarity: "uncommon" } } }, HEAL_UUID)
});
assert.equal(uncommonScroll.system.traits.rarity, "uncommon", "an uncommon spell makes an uncommon scroll on the common template");
// Native union, sorted. "magical" stays: the only magic-tradition words are the spell's traditions
// (system.traits.traditions), which the native check does not read. The published Wand of the Spider
// keeps "magical" while its embedded Web lists arcane and primal under system.traits.traditions.
assert.deepEqual(scroll.system.traits.value, ["consumable", "healing", "magical", "manipulate", "scroll", "vitality"]);
assert.equal(
  scroll.system.description.value,
  `<p>@UUID[${HEAL_UUID}]{Heal}</p><hr>${SCROLL_TEMPLATE.system.description.value}`,
  "description: link paragraph, hr, then the template text (native shape, research section 9)"
);
assert.match(scroll.system.spell._id, /^[A-Za-z0-9]{16}$/, "embedded spell gets a fresh 16-character _id");
assert.notEqual(scroll.system.spell._id, HEAL._id);
assert.deepEqual(scroll.system.spell.system.location, { value: null, heightenedLevel: 1 });
assert.deepEqual(scroll.system.spell.system, { ...HEAL.system, location: { value: null, heightenedLevel: 1 } },
  "the embedded spell keeps every other field of the spell source");
assert.equal(scroll.system.spell._stats.compendiumSource, HEAL_UUID);
assert.notEqual(
  buildSpellConsumable({ kind: "scroll", rank: 1, templateData: SCROLL_1, spellData: withSource(HEAL, HEAL_UUID) }).system.spell._id,
  scroll.system.spell._id, "every build draws a fresh embedded _id"
);

// The link label is enricher text: HTML metacharacters are escaped and braces become entities,
// so a spell name cannot end the label early or inject markup.
const escapedLink = buildSpellConsumable({
  kind: "scroll", rank: 1, templateData: SCROLL_1,
  spellData: withSource({ ...HEAL, name: "Fire & <Ice> {Bolt}" }, HEAL_UUID)
});
assert.ok(escapedLink.system.description.value.startsWith(`<p>@UUID[${HEAL_UUID}]{Fire &amp; &lt;Ice&gt; &#123;Bolt&#125;}</p><hr>`),
  "the link label escapes HTML and braces");

// Without a source UUID the native code appends the spell text instead of a link (escaped on serialization).
const unsourced = buildSpellConsumable({
  kind: "scroll", rank: 1, templateData: SCROLL_1,
  spellData: { ...structuredClone(HEAL), system: { ...HEAL.system, description: { value: "<p>A & B</p>" } } }
});
assert.equal(unsourced.system.description.value, `<p>&lt;p&gt;A &amp; B&lt;/p&gt;</p><hr>${SCROLL_TEMPLATE.system.description.value}`);

// 5. Wand built from the rank 4 template and the embedded Web of the published Wand of the Spider.
const web = SPIDER_WAND.system.spell;
const wand = buildSpellConsumable({ kind: "wand", rank: 4, templateData: WAND_4, spellData: web });
assert.equal(wand.name, "Wand of Web (Rank 4)");
assert.equal(wand.system.category, "wand", "the published sample is category wand");
assert.deepEqual(wand.system.uses, SPIDER_WAND.system.uses, "uses match the published wand (autoDestroy false)");
assert.equal(wand.system.usage.value, SPIDER_WAND.system.usage.value);
assert.equal(wand.system.traits.rarity, SPIDER_WAND.system.traits.rarity);
assert.deepEqual(wand.system.traits.value, ["concentrate", "magical", "manipulate", "wand"]);
assert.deepEqual(wand.system.price.value, { gp: 700 }, "price from the rank 4 wand template");
assert.equal(wand.system.level.value, 9, "level from the rank 4 wand template");
// The embedded spell equals the published one except for _id, which is fresh.
const { _id: builtId, ...builtSpell } = wand.system.spell;
const { _id: publishedId, ...publishedSpell } = SPIDER_WAND.system.spell;
assert.deepEqual(builtSpell, publishedSpell, "embedded spell matches the published Web, including location {value null, heightenedLevel 4}");
assert.notEqual(builtId, publishedId);
assert.deepEqual(wand.system.rules, []);
assert.equal(wand.system.description.value.startsWith(`<p>@UUID[Compendium.pf2e.spells-srd.Item.9s5tqqXNzcoKamWx]{Web}</p><hr>`), true,
  "the published wand has a bespoke description with no link prefix, so the prefix is checked against the native shape");

// 6. Refusals.
assert.throws(() => buildSpellConsumable({ kind: "wand", rank: 10, templateData: WAND_4, spellData: web }), /from 1 to 9/,
  "wand rank 10 is refused");
assert.throws(() => buildSpellConsumable({ kind: "scroll", rank: 1, templateData: SCROLL_1, spellData: spell({ traits: ["cantrip"] }) }), /cantrips/);
assert.throws(() => buildSpellConsumable({ kind: "wand", rank: 4, templateData: SCROLL_1, spellData: web }),
  /must be a consumable with category "wand"/, "a scroll template cannot build a wand");
assert.throws(() => buildSpellConsumable({ kind: "wand", rank: 3, templateData: WAND_4, spellData: web }),
  /not the pinned rank template/, "a rank 4 wand template cannot build a rank 3 wand");
assert.throws(() => buildSpellConsumable({ kind: "scroll", rank: 1, templateData: { ...SCROLL_TEMPLATE, _stats: {} }, spellData: HEAL }),
  /not the pinned rank template/, "a template without its pinned source is refused");
assert.throws(() => buildSpellConsumable({ kind: "scroll", rank: 1, templateData: { ...SCROLL_1, system: { ...SCROLL_1.system, rules: [{ key: "Note" }] } }, spellData: HEAL }),
  /Rule Elements/, "a template that carries Rule Elements is refused");

// 7. Migration: loot scrolls are built through buildSpellConsumable via the pinned template. A stub
// pf2e pack pair stands in for Foundry; the focus stub proves NPC loot never picks a focus spell.
const EQUIPMENT_PACK = "pf2e.equipment-srd";
const SPELLS_PACK = "pf2e.spells-srd";
const SPELL_TYPE = "spell";
const CONSUMABLE_TYPE = "consumable";
const COMMON = "common";
const FOCUS_NAME = "Test Focus Spell";
const FOCUS_ID = "focusStub000000001";
const FOCUS_TRAITS = ["focus", "healing"];
const FOCUS_TRADITIONS = ["divine"];
const copyOf = (value) => JSON.parse(JSON.stringify(value));
const focusTraits = {
  value: FOCUS_TRAITS,
  traditions: FOCUS_TRADITIONS,
  rarity: COMMON
};
const focusSystem = {
  level: { value: 1 },
  traits: focusTraits,
  ritual: null
};
const FOCUS_STUB = {
  _id: FOCUS_ID,
  name: FOCUS_NAME,
  type: SPELL_TYPE,
  system: focusSystem
};
const pack = (documents, index) => ({
  async getIndex() { return index; },
  async getDocument(id) { return documents.find((doc) => doc._id === id) ?? null; }
});
const asDocument = (source, uuid) => ({ ...copyOf(source), uuid, toObject: () => copyOf(source) });
const scrollIndexEntry = {
  _id: SCROLL_TEMPLATE._id,
  name: SCROLL_TEMPLATE.name,
  type: CONSUMABLE_TYPE,
  system: SCROLL_TEMPLATE.system
};
const healIndexEntry = {
  _id: HEAL._id,
  name: HEAL.name,
  type: SPELL_TYPE,
  system: HEAL.system
};
const equipmentPack = pack([asDocument(SCROLL_TEMPLATE, pinnedScroll1)], [scrollIndexEntry]);
const spellsPack = pack([asDocument(HEAL, HEAL_UUID), asDocument(FOCUS_STUB, FOCUS_ID)], [healIndexEntry, FOCUS_STUB]);
const settingsStub = { get: () => ({}) };
globalThis.game = {
  settings: settingsStub,
  packs: new Map([
    [EQUIPMENT_PACK, equipmentPack],
    [SPELLS_PACK, spellsPack]
  ])
};
const { buildLootItems, resolveLoot } = await import("../scripts/builder.mjs");
const HEAL_LINE = "Scroll of Heal (Rank 1)";
const scrollRank = {
  rank: 1
};
const healEntry = {
  packId: SPELLS_PACK,
  _id: HEAL._id
};
const healLine = {
  name: HEAL_LINE,
  quantity: 1,
  value: 0,
  entry: healEntry,
  scroll: scrollRank
};
const [built] = await buildLootItems([healLine]);
assert.equal(built.name, HEAL_LINE, "name keeps the native English format");
assert.equal(built.system.category, "scroll");
assert.equal(built.system.traits.rarity, COMMON, "rarity is the spell's rarity");
assert.equal(built.system.description.value.indexOf("@UUID[" + HEAL_UUID + "]") >= 0, true, "description carries the native link");
assert.equal(built.system.price.value.gp, 4, "price from the pinned template");
assert.equal(built._stats.compendiumSource, pinnedScroll1, "item records the pinned template");
assert.equal(built._id, undefined, "no _id on the built item");
assert.equal(built.system.spell._id.length, 16, "embedded spell has a fresh 16-character _id");
const FOCUS_LINE_NAME = "Scroll of Test Focus Spell (Rank 1)";
const focusScroll = {
  rank: 1
};
const focusEntry = {
  packId: SPELLS_PACK,
  _id: FOCUS_ID
};
const focusLine = {
  name: FOCUS_LINE_NAME,
  quantity: 1,
  value: 0,
  entry: focusEntry,
  scroll: focusScroll
};
await assert.rejects(buildLootItems([focusLine]), /focus spells/, "a focus spell is refused at build time");
const healRequest = {
  name: HEAL_LINE,
  quantity: 1,
  value: 0
};
const healConcept = {
  level: 1,
  loot: [healRequest]
};
const [healLoot] = await resolveLoot(healConcept);
assert.equal(healLoot.entry?._id, HEAL._id, "a scroll of a normal spell resolves to that spell");
assert.equal(healLoot.resolvedValue, 4, "loot price comes from the pinned rank 1 template");
const focusRequest = {
  name: FOCUS_LINE_NAME,
  quantity: 1,
  value: 0
};
const focusConcept = {
  level: 1,
  loot: [focusRequest]
};
const [focusLoot] = await resolveLoot(focusConcept);
assert.equal(focusLoot.entry, null, "NPC loot never resolves a focus spell to a scroll");
// Review P3-8: a configured equipment set without the pinned template pack leaves the scroll unresolved,
// so the preview fails closed instead of failing at Create.
game.packs.set("test.equipment-only", pack([], []));
settingsStub.get = () => ({ equipment: ["test.equipment-only"] });
const [unpinned] = await resolveLoot({ level: 1, loot: [healRequest] });
assert.equal(unpinned.entry, null, "without the pinned template pack the scroll stays unresolved");
assert.equal(unpinned.scroll.rank, 1);
settingsStub.get = () => ({});
game.packs.delete("test.equipment-only");
console.log("spell-consumables.test.mjs: template table, rank rules, scroll and wand field map, and loot migration passed");

// Cantrip deck expectations from pf2e 8.5.0 sources.
{
  const uuid = "Compendium.pf2e.equipment-srd.Item.tLa4bewBhyqzi6Ow";
  const template = withSource(fixture("cantrip-deck-5-pack.json"), uuid);
  const light = withSource(fixture("light.json"), "Compendium.pf2e.spells-srd.Item.WBmvzNDfpwka3qT4");
  const before = JSON.stringify([template, light]);
  assert.equal(spellConsumableTemplateUuid("cantripDeck", 1), uuid);
  assert.equal(spellConsumableTemplateUuid("cantripDeck", 0), null);
  assert.equal(spellConsumableTemplateUuid("cantripDeck", 2), null);
  const item = buildSpellConsumable({ kind: "cantripDeck", rank: 1, templateData: template, spellData: light });
  assert.equal(item.name, "Cantrip Deck of Light (5-pack)");
  assert.equal(item.system.category, "other");
  assert.deepEqual(item.system.traits.value, ["cantrip", "concentrate", "light", "magical", "manipulate"]);
  assert.equal(item.system.traits.rarity, "common");
  assert.ok(item.system.description.value.startsWith("<p>@UUID[Compendium.pf2e.spells-srd.Item.WBmvzNDfpwka3qT4]{Light}</p><hr>"));
  assert.ok(item.system.description.value.endsWith(template.system.description.value));
  assert.equal("spell" in item.system, false);
  assert.deepEqual(item.system.uses, { autoDestroy: true, max: 5, value: 5 });
  assert.equal(item.system.quantity, 1);
  assert.deepEqual(item.system.price, { per: 1, value: { gp: 5 } });
  assert.deepEqual(item.system.level, { value: 1 });
  assert.deepEqual(item.system.rules, []);
  assert.equal(JSON.stringify([template, light]), before);
  assert.throws(() => buildSpellConsumable({ kind: "cantripDeck", rank: 2, templateData: template, spellData: light }));
  assert.throws(() => buildSpellConsumable({ kind: "cantripDeck", rank: 1, templateData: template, spellData: HEAL }));
  for (const change of [s => s.system.traits.value.push("focus"), s => s.system.traits.rarity = "uncommon", s => s.system.ritual = {}]) {
    const bad = structuredClone(light); change(bad);
    assert.throws(() => buildSpellConsumable({ kind: "cantripDeck", rank: 1, templateData: template, spellData: bad }));
  }
  for (const change of [t => t.system.category = "scroll", t => t._stats.compendiumSource = "wrong"]) {
    const bad = structuredClone(template); change(bad);
    assert.throws(() => buildSpellConsumable({ kind: "cantripDeck", rank: 1, templateData: bad, spellData: light }));
  }
  assert.ok(spellConsumableRankProblem(light, "scroll", 1));
}
