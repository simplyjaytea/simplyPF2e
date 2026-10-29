// W3: the spellcasting-archetype table and entry builder, pinned to the real pf2e 8.5.0 feats and the
// "Spellcasting Archetypes" journal page (tests/fixtures/pc-caster, README there).
// Run: node tests/pc-caster-archetype.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  BASIC_SPELLCASTING_RANK_LEVELS, CASTER_ARCHETYPES, assembleCasterArchetypeEntry, casterArchetypeFeat,
  casterArchetypePlans, isCasterPackage
} from "../scripts/pc-caster-archetype.mjs";
import { MULTICLASS_PACKAGES, multiclassAbilityBlocker, multiclassPickBlocker } from "../scripts/pc-multiclass.mjs";

const load = async (name) => JSON.parse(await readFile(new URL(`./fixtures/pc-caster/${name}.json`, import.meta.url), "utf8"));
const plain = (html) => String(html).replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const wizard = CASTER_ARCHETYPES.wizard;

// ---- The table is the real text, not a recollection.
const dedication = await load("wizard-dedication");
const basic = await load("basic-wizard-spellcasting");
const expert = await load("expert-wizard-spellcasting");
const master = await load("master-wizard-spellcasting");
const page = (await load("archetypes-spellcasting-page")).pages[0];

assert.equal(dedication.name, wizard.dedication);
assert.equal(basic.name, wizard.basic);
// pf2e creates no spellcasting entry from either feat: the only dedication Rule Element trains Arcana, and Basic has none.
assert.deepEqual(dedication.system.rules, [{ key: "ActiveEffectLike", mode: "upgrade", path: "system.skills.arcana.rank", value: 1 }]);
assert.deepEqual(basic.system.rules, []);
assert.ok(dedication.system.traits.otherTags.includes("spellcasting-multiclass-archetype"));
assert.deepEqual(dedication.system.prerequisites.value, [{ value: "Intelligence +2" }]);
assert.equal(dedication.system.level.value, 2);
assert.equal(basic.system.level.value, 4);
assert.deepEqual(basic.system.prerequisites.value, [{ value: "Wizard Dedication" }]);

const dedicationText = plain(dedication.system.description.value);
assert.match(dedicationText, /spellbook with four common arcane cantrips/, "four spellbook cantrips");
assert.equal(wizard.cantripsKnown, 4);
assert.match(dedicationText, /prepare two cantrips each day/);
assert.equal(wizard.cantripSlots, 2);
assert.match(dedicationText, /key spellcasting attribute for wizard archetype spells is Intelligence, and they are arcane wizard spells/);
assert.equal(wizard.ability, "int");
assert.equal(wizard.tradition, "arcane");
assert.equal(wizard.mode, "prepared", "a spellbook caster that prepares each day");
assert.match(dedicationText, /trained in the spell attack modifier and spell DC/, "the entry rank floor is trained");
assert.match(plain(basic.system.description.value), /add two common spells of that rank to your spellbook/);
assert.equal(wizard.spellsPerRank, 2);

// Expert and Master need a rank the staged evaluator cannot prove, so they are not offered.
assert.deepEqual(expert.system.prerequisites.value.map((p) => p.value), ["Basic Wizard Spellcasting", "master in Arcana"]);
assert.deepEqual(master.system.prerequisites.value.map((p) => p.value), ["Expert Wizard Spellcasting", "legendary in Arcana"]);

// The slot levels are the journal's Basic Spellcasting Feat paragraph.
const journal = plain(page.text.content);
const basicParagraph = /Basic Spellcasting Feat (.*?) Expert Spellcasting Feat/.exec(journal)?.[1] ?? "";
assert.match(basicParagraph, /Usually available at 4th level, these feats grant a 1st-rank spell slot/);
assert.match(basicParagraph, /At 6th level, they grant you a 2nd-rank spell slot/);
assert.match(basicParagraph, /At 8th level, they grant you a 3rd-rank spell slot/);
assert.deepEqual({ ...BASIC_SPELLCASTING_RANK_LEVELS }, { 1: 4, 2: 6, 3: 8 });
assert.doesNotMatch(basicParagraph, /4th-rank/, "Basic never grants a 4th-rank slot");

// ---- Catalog wiring.
const pkg = MULTICLASS_PACKAGES.find((entry) => entry.slug === "wizard");
assert.equal(pkg.dedication, wizard.dedication);
assert.deepEqual(pkg.feats.map((feat) => feat.name), [wizard.basic]);
assert.deepEqual(pkg.abilities, [{ key: "int", min: 2 }], "Intelligence +2 is the real prerequisite");
assert.equal(isCasterPackage("wizard"), true);
assert.equal(isCasterPackage("fighter"), false);
assert.equal(casterArchetypeFeat("Wizard Dedication")?.role, "dedication");
assert.equal(casterArchetypeFeat("basic wizard spellcasting")?.role, "basic");
assert.equal(casterArchetypeFeat("Fighter Dedication"), null);
assert.equal(casterArchetypeFeat(null), null);
assert.match(multiclassAbilityBlocker("Wizard Dedication", { int: 1 }), /Intelligence \+2/);
assert.equal(multiclassAbilityBlocker("Wizard Dedication", { int: 2 }), null);
assert.match(multiclassPickBlocker([], "Wizard Dedication", "Wizard"), /own class/, "a Wizard cannot take Wizard Dedication");
assert.match(multiclassPickBlocker([], "Basic Wizard Spellcasting", "Fighter"), /Wizard Dedication first/);
assert.equal(multiclassPickBlocker(["Wizard Dedication"], "Basic Wizard Spellcasting", "Fighter"), null);

// ---- Plans.
const names = (...list) => list;
assert.deepEqual(casterArchetypePlans(names("Fighter Dedication"), 8), [], "no caster feat, no plan");
assert.deepEqual(casterArchetypePlans(names("Basic Wizard Spellcasting"), 8), [], "Basic without its dedication yields nothing");
const planAt = (feats, level) => {
  const [plan] = casterArchetypePlans(feats, level);
  return plan && { slots: plan.slots, picks: plan.picks, maxRank: plan.maxRank };
};
assert.deepEqual(planAt(names("Wizard Dedication"), 2), { slots: { 0: 2 }, picks: { 0: 4 }, maxRank: 0 }, "the dedication alone is cantrips only");
assert.deepEqual(planAt(names("Wizard Dedication"), 20), { slots: { 0: 2 }, picks: { 0: 4 }, maxRank: 0 }, "no rank without the Basic feat");
assert.deepEqual(planAt(names("Wizard Dedication", "Basic Wizard Spellcasting"), 3), { slots: { 0: 2 }, picks: { 0: 4 }, maxRank: 0 }, "before level 4 no rank is gained");
assert.deepEqual(planAt(names("Wizard Dedication", "Basic Wizard Spellcasting"), 4), { slots: { 0: 2, 1: 1 }, picks: { 0: 4, 1: 2 }, maxRank: 1 });
assert.deepEqual(planAt(names("Wizard Dedication", "Basic Wizard Spellcasting"), 5), { slots: { 0: 2, 1: 1 }, picks: { 0: 4, 1: 2 }, maxRank: 1 });
assert.deepEqual(planAt(names("Wizard Dedication", "Basic Wizard Spellcasting"), 6), { slots: { 0: 2, 1: 1, 2: 1 }, picks: { 0: 4, 1: 2, 2: 2 }, maxRank: 2 });
assert.deepEqual(planAt(names("Wizard Dedication", "Basic Wizard Spellcasting"), 8), { slots: { 0: 2, 1: 1, 2: 1, 3: 1 }, picks: { 0: 4, 1: 2, 2: 2, 3: 2 }, maxRank: 3 });
assert.deepEqual(planAt(names("Wizard Dedication", "Basic Wizard Spellcasting"), 20), planAt(names("Wizard Dedication", "Basic Wizard Spellcasting"), 8), "Basic stops at rank 3");
assert.deepEqual(planAt(names("Basic Wizard Spellcasting", "Wizard Dedication"), 6), planAt(names("Wizard Dedication", "Basic Wizard Spellcasting"), 6), "feat order does not matter");

// ---- The entry, from real spells.
const spellFiles = ["detect-magic", "electric-arc", "light", "telekinetic-projectile", "fear", "grim-tendrils", "mirror-image", "fireball"];
const real = Object.fromEntries(await Promise.all(spellFiles.map(async (file) => [file, await load(file)])));
const make = (file, rank, change = null) => {
  const source = structuredClone(real[file]);
  if (change) change(source);
  return { rank, identity: `Compendium.pf2e.spells-srd.Item.${source._id}`, source };
};
let counter = 0;
const newId = () => `spell-${++counter}`;
const planFor = (level, feats = ["Wizard Dedication", "Basic Wizard Spellcasting"]) => casterArchetypePlans(feats, level)[0];

{
  const built = assembleCasterArchetypeEntry({
    plan: planFor(8), entryId: "entry-1", newId,
    spells: [
      make("detect-magic", 0), make("electric-arc", 0), make("light", 0), make("telekinetic-projectile", 0),
      make("fear", 1), make("grim-tendrils", 1), make("mirror-image", 2), make("fireball", 3)
    ]
  });
  assert.deepEqual(built.rejected, []);
  const entry = built.entry;
  assert.equal(entry.type, "spellcastingEntry");
  assert.equal(entry._id, "entry-1");
  assert.equal(entry.system.tradition.value, "arcane");
  assert.equal(entry.system.ability.value, "int");
  assert.deepEqual(entry.system.prepared, { value: "prepared", flexible: false });
  assert.equal(entry.system.proficiency.value, 1);
  assert.deepEqual(Object.keys(entry.system.slots), Array.from({ length: 11 }, (_, i) => `slot${i}`));
  assert.deepEqual(Object.entries(entry.system.slots).map(([key, slot]) => [key, slot.max, slot.value]).filter(([, max]) => max > 0),
    [["slot0", 2, 2], ["slot1", 1, 1], ["slot2", 1, 1], ["slot3", 1, 1]]);
  assert.equal(built.spells.length, 8, "all eight spellbook spells are embedded");
  assert.ok(built.spells.every((spell) => spell.system.location.value === "entry-1" && !("heightenedLevel" in spell.system.location)));
  const idByName = Object.fromEntries(built.spells.map((spell) => [spell.name, spell._id]));
  assert.deepEqual(entry.system.slots.slot0.prepared, [{ id: idByName["Detect Magic"], expended: false }, { id: idByName["Electric Arc"], expended: false }],
    "two of the four cantrips are prepared, in pick order");
  assert.deepEqual(entry.system.slots.slot1.prepared, [{ id: idByName.Fear, expended: false }], "one first-rank slot, first pick prepared");
  assert.deepEqual(entry.system.slots.slot3.prepared, [{ id: idByName.Fireball, expended: false }]);
  assert.equal(entry.system.slots.slot4.prepared.length, 0);
}

// Dedication alone: four cantrips, no ranked slot.
{
  const built = assembleCasterArchetypeEntry({
    plan: planFor(2, ["Wizard Dedication"]), entryId: "e", newId,
    spells: [make("detect-magic", 0), make("electric-arc", 0), make("light", 0), make("telekinetic-projectile", 0), make("fear", 1)]
  });
  assert.equal(built.spells.length, 4);
  assert.deepEqual(built.rejected.map((r) => r.reason), ["the archetype has no rank 1 picks"], "no rank-1 picks without the Basic feat");
  assert.equal(built.entry.system.slots.slot1.max, 0);
}

// Fail closed on everything off the plan.
const reasonFor = (spell, level = 8) => assembleCasterArchetypeEntry({ plan: planFor(level), entryId: "e", newId, spells: [spell] }).rejected.map((r) => r.reason);
assert.deepEqual(reasonFor(make("fear", 0)), ["its own rank does not match cantrip"], "a ranked spell is not a cantrip");
assert.deepEqual(reasonFor(make("detect-magic", 1)), ["its own rank does not match rank 1"], "a cantrip is not a ranked spell");
assert.deepEqual(reasonFor(make("fear", 2)), ["its own rank does not match rank 2"], "no heightening: a spell sits at its own rank");
assert.deepEqual(reasonFor(make("fear", 1, (s) => { s.system.traits.traditions = ["divine"]; })), ["not an arcane spell"]);
assert.deepEqual(reasonFor(make("fear", 1, (s) => { s.system.traits.rarity = "uncommon"; })), ["only common spells are added to the spellbook"]);
assert.deepEqual(reasonFor(make("fear", 1, (s) => { s.system.traits.value.push("focus"); })), ["focus spells and rituals use separate casting entries"]);
assert.deepEqual(reasonFor(make("fear", 1, (s) => { s.system.ritual = { primary: { check: "arcana" } }; })), ["focus spells and rituals use separate casting entries"]);
assert.deepEqual(reasonFor(make("fear", 1, (s) => { delete s.system.traits.traditions; })), ["missing spell trait data"]);
assert.deepEqual(reasonFor(make("fear", 1, (s) => { s.type = "feat"; })), ["grounded document is not a spell"]);
assert.deepEqual(reasonFor({ ...make("fear", 1), identity: null }), ["grounded spell identity is missing"]);
assert.deepEqual(reasonFor(make("fireball", 3), 6), ["the archetype has no rank 3 picks"], "rank 3 needs level 8");
assert.deepEqual(reasonFor(make("fireball", 4)), ["the archetype has no rank 4 picks"], "Basic never reaches rank 4");
{
  const built = assembleCasterArchetypeEntry({
    plan: planFor(4), entryId: "e", newId,
    spells: [make("fear", 1), make("fear", 1), make("grim-tendrils", 1), make("grim-tendrils", 1), make("mirror-image", 2)]
  });
  assert.deepEqual(built.rejected.map((r) => r.reason), ["duplicate spell", "duplicate spell", "the archetype has no rank 2 picks"]);
  assert.equal(built.spells.length, 2);
  const cap = assembleCasterArchetypeEntry({
    plan: planFor(4), entryId: "e", newId,
    spells: [make("fear", 1), make("grim-tendrils", 1), { ...make("fear", 1), identity: "Compendium.pf2e.spells-srd.Item.third" }]
  });
  assert.deepEqual(cap.rejected.map((r) => r.reason), ["rank 1 picks are full"], "a third rank-1 spell exceeds the two the feat adds");
}

console.log("pc-caster-archetype.test.mjs: the table matches the real 8.5.0 feats and journal, plans follow the Basic feat by level, and the entry builder fails closed");
