// W3: the spellcasting-archetype table and entry builder, pinned to the real pf2e 8.5.0 feats and the
// "Spellcasting Archetypes" journal page (tests/fixtures/pc-caster, README there).
// Run: node tests/pc-caster-archetype.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  BASIC_SPELLCASTING_RANK_LEVELS, CASTER_ARCHETYPES, applyArchetypeChoice, archetypeSignatureControl, assembleCasterArchetypeEntry, casterArchetypeFeat,
  casterArchetypePlans, chooseSignatureIndexes, defaultArchetypeChoice, eligibleArchetypeChoices, isCasterPackage, signatureSpellName
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

// ================= Bard (feat/bard-archetype) =================
const bard = CASTER_ARCHETYPES.bard;
const bardDedication = await load("bard-dedication");
const bardBasic = await load("basic-bard-spellcasting");
const bardExpert = await load("expert-bard-spellcasting");
const bardMaster = await load("master-bard-spellcasting");
assert.equal(bardDedication.name, bard.dedication);
assert.equal(bardBasic.name, bard.basic);
assert.deepEqual(bardDedication.system.prerequisites.value, [{ value: "Charisma +2" }]);
assert.equal(bardDedication.system.level.value, 2);
assert.ok(bardDedication.system.traits.otherTags.includes("spellcasting-multiclass-archetype"));
assert.deepEqual(bardBasic.system.rules, [], "Basic Bard Spellcasting creates no entry");
assert.deepEqual(bardBasic.system.prerequisites.value, [{ value: "Bard Dedication" }]);
assert.equal(bardBasic.system.level.value, 4);
assert.deepEqual(bardExpert.system.prerequisites.value.map((p) => p.value), ["Basic Bard Spellcasting", "master in Occultism"]);
assert.deepEqual(bardMaster.system.prerequisites.value.map((p) => p.value), ["Expert Bard Spellcasting", "legendary in Occultism"]);

// The dedication's rules: a muse ChoiceSet (slug values, bard-muse minus class-archetype), a RollOption reading it,
// two skill upgrades, and no GrantItem (so no muse feature, starting feat or spell is granted).
const bardRules = bardDedication.system.rules;
assert.deepEqual(bardRules.map((rule) => rule.key), ["ChoiceSet", "RollOption", "ActiveEffectLike", "ActiveEffectLike"]);
assert.equal(bardRules[0].flag, bard.choice.flag);
assert.deepEqual(bardRules[0].choices, { filter: [`item:tag:${bard.choice.tag}`, { not: `item:tag:${bard.choice.excludeTag}` }], slugsAsValues: true });
assert.equal(bardRules[1].option, `feature:{item|flags.system.rulesSelections.${bard.choice.flag}}`);
const bardText = plain(bardDedication.system.description.value);
assert.match(bardText, /spell repertoire with two common cantrips from the occult spell list/);
assert.equal(bard.cantripsKnown, 2);
assert.match(bardText, /key spellcasting attribute for bard archetype spells is Charisma, and they are occult bard spells/);
assert.equal(bard.ability, "cha");
assert.equal(bard.tradition, "occult");
assert.equal(bard.mode, "spontaneous");
assert.match(plain(bardBasic.system.description.value), /add a common occult spell of the appropriate rank/);
assert.equal(bard.spellsPerRank, 1);
assert.equal(bard.cantripSlots, 0, "spontaneous cantrips are not slot-based");
assert.match(basicParagraph, /At 6th level, they grant you a 2nd-rank spell slot, and if you have a spell repertoire, you can select one spell from your repertoire as a signature spell/);
assert.equal(bard.signatureFromLevel, 6);

// Catalog wiring.
const bardPkg = MULTICLASS_PACKAGES.find((entry) => entry.slug === "bard");
assert.equal(bardPkg.dedication, "Bard Dedication");
assert.deepEqual(bardPkg.feats.map((feat) => feat.name), ["Basic Bard Spellcasting"]);
assert.deepEqual(bardPkg.abilities, [{ key: "cha", min: 2 }]);
assert.equal(isCasterPackage("bard"), true);
assert.equal(multiclassAbilityBlocker("Bard Dedication", { cha: 1 }) !== null, true);
assert.equal(multiclassAbilityBlocker("Bard Dedication", { cha: 2 }), null);
assert.match(multiclassPickBlocker([], "Bard Dedication", "Bard"), /own class/);
assert.match(multiclassPickBlocker([], "Basic Bard Spellcasting", "Fighter"), /Bard Dedication first/);
// One spellcasting archetype per character. The lock already keeps a second dedication out until two more feats of the
// current package are held, and a caster package has only one feat, so this guard is defence in depth; it is reached by an
// order the lock would otherwise allow.
assert.match(multiclassPickBlocker(["Wizard Dedication", "Basic Wizard Spellcasting", "Basic Wizard Spellcasting"], "Bard Dedication", "Fighter"), /only one spellcasting archetype/);
assert.match(multiclassPickBlocker(["Bard Dedication", "Basic Bard Spellcasting", "Basic Bard Spellcasting"], "Wizard Dedication", "Fighter"), /only one spellcasting archetype/);
assert.match(multiclassPickBlocker(["Wizard Dedication", "Basic Wizard Spellcasting"], "Bard Dedication", "Fighter"), /complete Wizard Dedication/, "and a package in progress blocks a second dedication anyway");
assert.equal(multiclassPickBlocker(["Fighter Dedication", "Basic Maneuver", "Reactive Striker"], "Bard Dedication", "Wizard"), null, "a completed noncaster package leaves a Bard dedication open");

// Plans: dedication = two cantrips, Basic adds one slot and one spell per rank by level; signature from level 6.
const bardPlan = (feats, level) => {
  const [plan] = casterArchetypePlans(feats, level);
  return plan && { slots: plan.slots, picks: plan.picks, maxRank: plan.maxRank, signatures: plan.signatures };
};
assert.deepEqual(bardPlan(["Bard Dedication"], 20), { slots: { 0: 0 }, picks: { 0: 2 }, maxRank: 0, signatures: 0 });
assert.deepEqual(bardPlan(["Bard Dedication", "Basic Bard Spellcasting"], 3), { slots: { 0: 0 }, picks: { 0: 2 }, maxRank: 0, signatures: 0 });
assert.deepEqual(bardPlan(["Bard Dedication", "Basic Bard Spellcasting"], 4), { slots: { 0: 0, 1: 1 }, picks: { 0: 2, 1: 1 }, maxRank: 1, signatures: 0 });
assert.deepEqual(bardPlan(["Bard Dedication", "Basic Bard Spellcasting"], 5), { slots: { 0: 0, 1: 1 }, picks: { 0: 2, 1: 1 }, maxRank: 1, signatures: 0 });
assert.deepEqual(bardPlan(["Bard Dedication", "Basic Bard Spellcasting"], 6), { slots: { 0: 0, 1: 1, 2: 1 }, picks: { 0: 2, 1: 1, 2: 1 }, maxRank: 2, signatures: 1 });
assert.deepEqual(bardPlan(["Bard Dedication", "Basic Bard Spellcasting"], 8), { slots: { 0: 0, 1: 1, 2: 1, 3: 1 }, picks: { 0: 2, 1: 1, 2: 1, 3: 1 }, maxRank: 3, signatures: 1 });
assert.deepEqual(bardPlan(["Bard Dedication", "Basic Bard Spellcasting"], 20), bardPlan(["Bard Dedication", "Basic Bard Spellcasting"], 8), "Basic stops at rank 3");
assert.equal(bardPlan(["Basic Bard Spellcasting"], 8), undefined, "Basic without its dedication yields nothing");
assert.equal(casterArchetypePlans(["Wizard Dedication", "Basic Wizard Spellcasting"], 8)[0].signatures, 0, "Wizard has no signature spells");

// Signature choice: the first spell of the lowest ranked rank; none without a plan allowance; never a cantrip.
const ranks = (...list) => list.map((rank) => ({ rank }));
assert.deepEqual([...chooseSignatureIndexes(ranks(0, 0, 1, 2), 1)], [2]);
assert.deepEqual([...chooseSignatureIndexes(ranks(0, 0, 2, 1), 1)], [3], "the lowest ranked spell");
assert.deepEqual([...chooseSignatureIndexes(ranks(0, 0, 1, 1), 1)], [2], "the first of equal ranks");
assert.deepEqual([...chooseSignatureIndexes(ranks(0, 0), 1)], [], "cantrips are never signature spells");
assert.deepEqual([...chooseSignatureIndexes(ranks(1, 2), 0)], []);

// The stored pick is honored only while it is still a ranked repertoire spell; otherwise the deterministic default
// stands (preview/editor) or null is reported (Create refuses it).
const named = (...list) => list.map(([name, rank]) => ({ name, rank }));
assert.equal(signatureSpellName(named(["Detect Magic", 0], ["Fear", 1], ["Mirror Image", 2]), 1), "Fear", "the default is unchanged");
assert.equal(signatureSpellName(named(["Detect Magic", 0], ["Fear", 1], ["Mirror Image", 2]), 1, "Mirror Image"), "Mirror Image", "a stored pick wins");
assert.equal(signatureSpellName(named(["Detect Magic", 0], ["Fear", 1]), 1, "Haste"), null, "a vanished pick is reported, not replaced");
assert.equal(signatureSpellName(named(["Detect Magic", 0], ["Fear", 1]), 1, "Detect Magic"), null, "a cantrip cannot be a signature spell");
assert.equal(signatureSpellName(named(["Detect Magic", 0], ["Fear", 1]), 0, "Fear"), null, "no allowance before level 6");
assert.equal(signatureSpellName([], 1), null);

// The editor control: offered only while the held plan allows a signature, listing exactly the ranked repertoire
// spells; the stored pick wins, a stale one shows the placeholder instead of a silent default.
const controlFor = (levelValue, spells, signature) => archetypeSignatureControl({
  concept: { level: levelValue, archetypeSpellcasting: { pkg: "bard", ...(signature === undefined ? {} : { signature }) } },
  resolved: {
    feats: [{ name: "Bard Dedication", entry: { packId: "p", _id: "ded" } }, { name: "Basic Bard Spellcasting", entry: { packId: "p", _id: "basic" } }],
    archetypeSpells: spells.map(([name, rank]) => ({ spell: { name, rank }, entry: { name } }))
  }
});
const repertoire = [["Detect Magic", 0], ["Fear", 1], ["Mirror Image", 2]];
assert.equal(controlFor(4, repertoire), null, "no control before the Basic feat's signature level");
assert.deepEqual(controlFor(6, repertoire), { labelKey: "SIMPLYPF2E.PCEdit.ArchetypeSignature",
  options: [{ value: "Fear", label: "Fear" }, { value: "Mirror Image", label: "Mirror Image" }], value: "Fear" }, "the default selection");
assert.equal(controlFor(6, repertoire, "Mirror Image").value, "Mirror Image", "the stored pick");
assert.equal(controlFor(6, repertoire, "Haste").value, null, "a stale pick asks for a new one");
assert.equal(controlFor(6, [["Detect Magic", 0]], null), null, "nothing ranked to choose");
assert.equal(archetypeSignatureControl({ concept: { level: 6, archetypeSpellcasting: { pkg: "wizard" } }, resolved: { feats: [], archetypeSpells: [] } }), null);

// Choice options: the dedication's own filter, slug values, sorted; the default only when eligible.
const loadTagged = async (name) => { const json = await load(name); return { name: json.name, tags: json.system.traits.otherTags }; };
const muses = await Promise.all(["enigma", "maestro", "polymath", "warrior", "zoophonia"].map(loadTagged));
const options = eligibleArchetypeChoices(bard.choice, muses);
assert.deepEqual(options.map((option) => option.value), ["enigma", "maestro", "polymath", "warrior", "zoophonia"]);
assert.deepEqual(options.map((option) => option.label), ["Enigma", "Maestro", "Polymath", "Warrior", "Zoophonia"]);
assert.equal(defaultArchetypeChoice(bard.choice, options), "maestro");
assert.equal(defaultArchetypeChoice(bard.choice, options.filter((option) => option.value !== "maestro")), null, "no arbitrary substitute");
assert.deepEqual(eligibleArchetypeChoices(bard.choice, [...muses, { name: "Archetype Muse", tags: ["bard-muse", "class-archetype"] }, { name: "Not A Muse", tags: ["other"] }, { name: "Untagged" }]).map((o) => o.value),
  ["enigma", "maestro", "polymath", "warrior", "zoophonia"], "class-archetype and untagged features are excluded");
assert.deepEqual(eligibleArchetypeChoices(bard.choice, []), []);
// An explicit indexed slug is the value (pf2e: f.slug ?? sluggify(f.name)); a missing or empty slug falls back to the name.
assert.deepEqual(eligibleArchetypeChoices(bard.choice, [
  { name: "Maestro", slug: "maestro-of-sound", tags: ["bard-muse"] }, { name: "Polymath", slug: null, tags: ["bard-muse"] }, { name: "Warrior", slug: "", tags: ["bard-muse"] }
]).map((o) => [o.value, o.label]), [["maestro-of-sound", "Maestro"], ["polymath", "Polymath"], ["warrior", "Warrior"]]);

// applyArchetypeChoice writes pf2e's own persisted shape and nothing else.
{
  const data = structuredClone(bardDedication);
  const before = structuredClone(data.system.rules);
  applyArchetypeChoice(data, bard.choice, "maestro");
  assert.equal(data.system.rules[0].selection, "maestro");
  data.system.rules[0].selection = undefined; delete data.system.rules[0].selection;
  assert.deepEqual(data.system.rules, before, "every other member of every rule is unchanged");
  assert.throws(() => applyArchetypeChoice({ name: "X", system: { rules: [] } }, bard.choice, "maestro"), /exactly one dedicationMuse ChoiceSet/);
  assert.throws(() => applyArchetypeChoice({ name: "X", system: { rules: [bardRules[0], bardRules[0]] } }, bard.choice, "maestro"), /exactly one/);
}

// Entry: spontaneous occult Charisma, slots one per rank, no prepared slots, one signature spell at level 6+.
{
  const spell = async (file) => load(file);
  const mk = async (file, rank) => ({ rank, identity: `Compendium.pf2e.spells-srd.Item.${(await spell(file))._id}`, source: await spell(file) });
  const picks = [await mk("detect-magic", 0), await mk("light", 0), await mk("fear", 1), await mk("mirror-image", 2), await mk("haste", 3)];
  const plan = casterArchetypePlans(["Bard Dedication", "Basic Bard Spellcasting"], 8)[0];
  const built = assembleCasterArchetypeEntry({ plan, entryId: "bard-entry", spells: picks, newId: (() => { let i = 0; return () => `b${++i}`; })() });
  assert.deepEqual(built.rejected, []);
  const system = built.entry.system;
  assert.equal(built.entry.name, "Bard Archetype Spells");
  assert.equal(system.tradition.value, "occult");
  assert.equal(system.ability.value, "cha");
  assert.deepEqual(system.prepared, { value: "spontaneous", flexible: false });
  assert.equal(system.proficiency.value, 1);
  assert.deepEqual(Object.entries(system.slots).filter(([, slot]) => slot.max).map(([key, slot]) => [key, slot.max, slot.value, slot.prepared.length]),
    [["slot1", 1, 1, 0], ["slot2", 1, 1, 0], ["slot3", 1, 1, 0]]);
  assert.equal(built.spells.length, 5);
  assert.ok(built.spells.every((item) => item.system.location.value === "bard-entry" && !("heightenedLevel" in item.system.location)));
  assert.deepEqual(built.spells.filter((item) => item.system.location.signature).map((item) => item.name), ["Fear"], "one signature: the rank-1 spell");
  // The GM's pick replaces the default and nothing else; an identity the entry does not hold fails closed.
  const chosenPicks = [await mk("detect-magic", 0), await mk("light", 0), await mk("fear", 1), await mk("mirror-image", 2), await mk("haste", 3)];
  const chosen = assembleCasterArchetypeEntry({ plan, entryId: "bard-entry", spells: chosenPicks, newId: () => "s", signatureIdentity: chosenPicks[3].identity });
  assert.deepEqual(chosen.spells.filter((item) => item.system.location.signature).map((item) => item.name), ["Mirror Image"], "the picked signature spell");
  assert.throws(() => assembleCasterArchetypeEntry({ plan, entryId: "e", spells: chosenPicks, newId: () => "s", signatureIdentity: "missing" }),
    /not in the archetype's repertoire/, "a pick the entry no longer holds never falls back to the default");
  // Level 4: no signature; arcane-only spell rejected as non-occult.
  const l4 = assembleCasterArchetypeEntry({ plan: casterArchetypePlans(["Bard Dedication", "Basic Bard Spellcasting"], 4)[0], entryId: "e", newId: () => "x",
    spells: [await mk("detect-magic", 0), await mk("light", 0), await mk("fear", 1)] });
  assert.equal(l4.spells.filter((item) => item.system.location.signature).length, 0, "no signature before level 6");
  const wrong = assembleCasterArchetypeEntry({ plan, entryId: "e", newId: () => "x", spells: [await mk("fireball", 3)].filter(Boolean) }).rejected.map((r) => r.reason);
  assert.deepEqual(wrong, ["not an occult spell"], "an arcane/primal-only spell is not an occult bard spell");
}

console.log("pc-caster-archetype.test.mjs: the table matches the real 8.5.0 feats and journal, plans follow the Basic feat by level, and the entry builder fails closed");
