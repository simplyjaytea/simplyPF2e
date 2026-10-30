// Spellcasting archetype entry for a generated PC (W3, pure: no Foundry globals).
//
// pf2e 8.5.0 creates no spellcasting entry from a dedication: the Wizard Dedication's only
// Rule Element is `ActiveEffectLike system.skills.arcana.rank`, and Basic/Expert/Master
// Wizard Spellcasting carry `rules: []`. The entry is an ordinary `spellcastingEntry` item
// the player adds by hand (`actor/sheet/spellcasting-dialog.ts`), so the module builds the
// same plain document it builds for a class (pc-builder.mjs), from the small table below.
// Every field is transcribed from the published 8.5.0 text, quoted in
// docs/plans/caster-multiclass-2026-10-30.md and pinned by tests/pc-caster-archetype.test.mjs
// against the real feat JSON and the "Spellcasting Archetypes" journal page.
//
//   Wizard Dedication:  "You cast spells like a wizard, gaining a spellbook with four common
//     arcane cantrips of your choice. ... You can prepare two cantrips each day from your
//     spellbook. You're trained in the spell attack modifier and spell DC statistics. Your
//     key spellcasting attribute for wizard archetype spells is Intelligence, and they are
//     arcane wizard spells."
//   Basic Wizard Spellcasting:  "Each time you gain a spell slot of a new rank from the wizard
//     archetype, add two common spells of that rank to your spellbook."
//   Spellcasting Archetypes journal, Basic Spellcasting Feat:  "grant a 1st-rank spell slot.
//     At 6th level, they grant you a 2nd-rank spell slot ... At 8th level, they grant you a
//     3rd-rank spell slot."
//
// Two archetypes are modeled: Wizard (prepared) and Bard (spontaneous, 2026-10-30). Expert and Master
// feats need "master/legendary in <skill>", which the staged prerequisite evaluator cannot prove, so
// the entry never exceeds the Basic benefits (ranks 1 to 3, one slot each).
//
// Bard (packs/pf2e/feats/archetype/bard/level-2/bard-dedication.json): "You gain a spell repertoire with two
// common cantrips from the occult spell list ... Your key spellcasting attribute for bard archetype spells is
// Charisma, and they are occult bard spells." Basic Bard Spellcasting: "Each time you gain a spell slot of a new
// rank from the bard archetype, add a common occult spell of the appropriate rank ... to your repertoire."
// The journal adds, for Basic: "At 6th level ... if you have a spell repertoire, you can select one spell from
// your repertoire as a signature spell." A signature spell is `system.location.signature: true` on a spell in a
// spontaneous entry (spell/data.ts; spellcasting-entry/collection.ts 262-280).
//
// The Bard Dedication also carries a `ChoiceSet` (flag `dedicationMuse`, bard-muse class features, slug values).
// pf2e persists a ChoiceSet answer as `selection` on that rule's source (choice-set/rule-element.ts, preCreate:
// `this.selection = ruleSource.selection = selection.value`), and derives the item flag and roll option from it at
// preparation; this module writes that same `selection` (see applyArchetypeChoice) and nothing else.

import { slugify } from "./text.mjs";

/**
 * @typedef {object} CasterArchetype
 * @property {string} pkg           pc-multiclass.mjs package slug
 * @property {string} label         entry name
 * @property {string} tradition     the archetype's fixed tradition
 * @property {string} ability       key spellcasting attribute
 * @property {"prepared"|"spontaneous"} mode
 * @property {string} dedication
 * @property {string} basic         the Basic Spellcasting feat that grants ranks 1 to 3
 * @property {number} cantripsKnown cantrips in the spellbook from the dedication
 * @property {number} cantripSlots  cantrips prepared per day
 * @property {number} spellsPerRank spells added to the spellbook or repertoire per rank gained
 * @property {number|null} signatureFromLevel level from which one repertoire spell is a signature spell (Basic feat held)
 * @property {string|null} signatureLabelKey editor label for the signature-spell control (null: no signature control)
 * @property {{flag: string, tag: string, excludeTag: string, defaultValue: string, labelKey: string}|null} choice the dedication's ChoiceSet
 */
export const CASTER_ARCHETYPES = Object.freeze({
  wizard: Object.freeze({
    pkg: "wizard",
    noteKey: "SIMPLYPF2E.Preview.PCArchetypeSpells",
    book: "spellbook",
    signatureFromLevel: null,
    signatureLabelKey: null,
    choice: null,
    label: "Wizard Archetype Spells",
    tradition: "arcane",
    ability: "int",
    mode: "prepared",
    dedication: "Wizard Dedication",
    basic: "Basic Wizard Spellcasting",
    cantripsKnown: 4,
    cantripSlots: 2,
    spellsPerRank: 2
  }),
  bard: Object.freeze({
    pkg: "bard",
    noteKey: "SIMPLYPF2E.Preview.PCArchetypeBard",
    book: "repertoire",
    // First level at which the Basic feat lets the PC mark one repertoire spell as a signature spell.
    signatureFromLevel: 6,
    signatureLabelKey: "SIMPLYPF2E.PCEdit.ArchetypeSignature",
    // The dedication's ChoiceSet: rule flag, the class-feature tag its filter selects, the tag it excludes, and the
    // visible default (used only when it is among the eligible choices).
    choice: Object.freeze({
      flag: "dedicationMuse", tag: "bard-muse", excludeTag: "class-archetype", defaultValue: "maestro",
      labelKey: "SIMPLYPF2E.PCEdit.ArchetypeMuse"
    }),
    label: "Bard Archetype Spells",
    tradition: "occult",
    ability: "cha",
    mode: "spontaneous",
    dedication: "Bard Dedication",
    basic: "Basic Bard Spellcasting",
    cantripsKnown: 2,
    cantripSlots: 0,
    spellsPerRank: 1
  })
});

/**
 * Level at which the Basic Spellcasting benefits grant each rank's single slot
 * (journals/archetypes.json, "Basic Spellcasting Feat": 4th, 6th, 8th level).
 */
export const BASIC_SPELLCASTING_RANK_LEVELS = Object.freeze({ 1: 4, 2: 6, 3: 8 });

const BY_FEAT = new Map();
for (const archetype of Object.values(CASTER_ARCHETYPES)) {
  BY_FEAT.set(slugify(archetype.dedication), { archetype, role: "dedication" });
  BY_FEAT.set(slugify(archetype.basic), { archetype, role: "basic" });
}

/** The archetype and role a feat name belongs to, or null for any other feat. */
export function casterArchetypeFeat(name) {
  return typeof name === "string" ? BY_FEAT.get(slugify(name)) ?? null : null;
}

/** Whether a catalog package slug is a spellcasting archetype. */
export function isCasterPackage(pkg) {
  return Object.hasOwn(CASTER_ARCHETYPES, pkg);
}

/**
 * Slots and spellbook size for each spellcasting archetype the PC holds. A dedication yields
 * the cantrips alone; holding its Basic feat adds ranks 1 to 3 as the character reaches
 * levels 4, 6 and 8. Holding a feat without its dedication yields nothing (fail closed).
 * @param {(string|null)[]} featNames held feats, any order
 * @param {number} level character level
 * @returns {{archetype: CasterArchetype, slots: Record<number, number>, picks: Record<number, number>, maxRank: number, signatures: number}[]}
 */
export function casterArchetypePlans(featNames, level) {
  const held = new Set((featNames ?? []).filter((name) => typeof name === "string").map(slugify));
  const lv = Math.min(Math.max(Math.round(Number(level)) || 1, 1), 20);
  const plans = [];
  for (const archetype of Object.values(CASTER_ARCHETYPES)) {
    if (!held.has(slugify(archetype.dedication))) continue;
    const slots = { 0: archetype.cantripSlots };
    const picks = { 0: archetype.cantripsKnown };
    let maxRank = 0;
    if (held.has(slugify(archetype.basic))) {
      for (const [rank, from] of Object.entries(BASIC_SPELLCASTING_RANK_LEVELS)) {
        if (lv < from) continue;
        slots[rank] = 1;
        picks[rank] = archetype.spellsPerRank;
        maxRank = Number(rank);
      }
    }
    const signatures = held.has(slugify(archetype.basic)) && archetype.signatureFromLevel && lv >= archetype.signatureFromLevel ? 1 : 0;
    plans.push({ archetype, slots, picks, maxRank, signatures });
  }
  return plans;
}

/**
 * Which spells of a list are signature spells: deterministic, so the preview and Create agree. The first `count`
 * ranked (non-cantrip) spells of the lowest rank are chosen, since a low-rank spell gains most from heightening.
 * @param {{rank: number}[]} spells repertoire spells in pick order
 * @param {number} count signatures the plan allows
 * @returns {Set<number>} indexes into `spells`
 */
export function chooseSignatureIndexes(spells, count) {
  const chosen = new Set();
  if (!(count > 0)) return chosen;
  const ranked = spells.map((spell, index) => ({ rank: spell?.rank, index })).filter((entry) => Number.isInteger(entry.rank) && entry.rank >= 1)
    .sort((a, b) => a.rank - b.rank || a.index - b.index);
  for (const entry of ranked.slice(0, count)) chosen.add(entry.index);
  return chosen;
}

/**
 * Name of the repertoire spell that is the signature spell. A stored pick is kept only while it is still one of the
 * ranked repertoire spells; an unknown or stale name yields null (nothing is marked, and Create refuses it), never a
 * silent substitution. With no pick, the deterministic default stands: the first ranked spell of the lowest rank.
 * @param {{name: string, rank: number}[]} spells ranked and cantrip repertoire spells, in pick order
 * @param {number} signatures how many signature spells the plan allows (0 before the Basic feat's level)
 * @param {string|null} [stored] the GM's pick from the editor
 * @returns {string|null}
 */
export function signatureSpellName(spells, signatures, stored = null) {
  const ranked = (spells ?? []).filter((spell) => Number.isInteger(spell?.rank) && spell.rank >= 1);
  if (!(signatures > 0) || !ranked.length) return null;
  if (typeof stored === "string" && stored) {
    return ranked.some((spell) => spell.name === stored) ? stored : null;
  }
  const [index] = [...chooseSignatureIndexes(ranked, signatures)];
  return ranked[index]?.name ?? null;
}

/**
 * Eligible choices of an archetype's ChoiceSet from class-feature candidates, by the dedication's own filter
 * (`item:tag:<tag>` and not `item:tag:<excludeTag>`), as pf2e's `slugsAsValues` names them (`f.slug ?? sluggify(f.name)`, pf2e's choice-set/rule-element.ts queryCompendium).
 * @param {NonNullable<CasterArchetype["choice"]>} choice
 * @param {{name: string, slug?: string|null, tags?: string[]}[]} candidates
 * @returns {{value: string, label: string}[]} sorted by label
 */
export function eligibleArchetypeChoices(choice, candidates) {
  const seen = new Set();
  const options = [];
  for (const candidate of candidates ?? []) {
    const tags = Array.isArray(candidate?.tags) ? candidate.tags : [];
    if (!tags.includes(choice.tag) || tags.includes(choice.excludeTag)) continue;
    const value = (typeof candidate.slug === "string" && candidate.slug) || slugify(candidate.name);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    options.push({ value, label: candidate.name });
  }
  return options.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The signature-spell control of the held spellcasting archetype (Bard's Basic feat, from level 6). Exactly one
 * ranked repertoire spell is the signature, so the control lists the archetype entry's ranked spells and shows the
 * stored pick when it is still one of them, otherwise the deterministic default Create will use. Null when the
 * archetype has no signature rule or the plan does not allow one at this level (nothing to choose).
 * @param {{concept: object, resolved: object}} plan
 * @returns {{labelKey: string, options: {value: string, label: string}[], value: string|null}|null}
 */
export function archetypeSignatureControl(plan) {
  const concept = plan?.concept ?? {};
  const planned = concept.archetypeSpellcasting ?? null;
  if (!planned?.pkg) return null;
  const held = (plan.resolved?.feats ?? []).map((pick) => (pick?.entry ? pick.name : null));
  const entry = casterArchetypePlans(held, concept.level).find((item) => item.archetype.pkg === planned.pkg);
  if (!entry || !(entry.signatures > 0) || !entry.archetype.signatureLabelKey) return null;
  const spells = [];
  for (const pick of plan.resolved?.archetypeSpells ?? []) {
    const name = pick?.spell?.name ?? pick?.entry?.name;
    const rank = Number(pick?.spell?.rank);
    // Only a resolved, ranked repertoire spell can be a signature spell; a cantrip or a vanished pick is not offered.
    if (!pick?.entry || !name || !Number.isInteger(rank) || rank < 1 || spells.some((spell) => spell.name === name)) continue;
    spells.push({ name, rank, label: pick.entry.name ?? name });
  }
  if (!spells.length) return null;
  const stored = typeof planned.signature === "string" && planned.signature ? planned.signature : null;
  return {
    labelKey: entry.archetype.signatureLabelKey,
    options: spells.map((spell) => ({ value: spell.name, label: spell.label })),
    value: signatureSpellName(spells, entry.signatures, stored)
  };
}

/** The visible default when it is eligible, else null: never an arbitrary pick. */
export function defaultArchetypeChoice(choice, options) {
  return options.some((option) => option.value === choice.defaultValue) ? choice.defaultValue : null;
}

/**
 * Write the chosen answer onto the dedication's ChoiceSet rule source, exactly as pf2e does when a prompt is
 * answered (`ruleSource.selection = selection.value`); the flag and roll option follow at preparation. Throws unless
 * the dedication carries exactly one ChoiceSet with the archetype's flag, so an unexpected shape is never guessed.
 * @param {object} data the dedication's cloned item data (mutated)
 * @param {NonNullable<CasterArchetype["choice"]>} choice
 * @param {string} value the chosen slug
 */
export function applyArchetypeChoice(data, choice, value) {
  const rules = Array.isArray(data?.system?.rules) ? data.system.rules : [];
  const matches = rules.filter((rule) => rule?.key === "ChoiceSet" && rule.flag === choice.flag);
  if (matches.length !== 1) throw new Error(`${data?.name ?? "dedication"} does not carry exactly one ${choice.flag} ChoiceSet`);
  matches[0].selection = value;
}

const ordinalName = (rank) => (rank === 0 ? "cantrip" : `rank ${rank}`);

/**
 * Build the spellcasting entry and its spells from plan-validated sources. A spell is kept only when
 * it is a real spell of the archetype's tradition at its own rank, common, and not a focus
 * spell or ritual; each rank holds at most `plan.picks[rank]` distinct spells. Anything else
 * is dropped with a reason (the caller warns), never repaired.
 * @param {object} args
 * @param {ReturnType<typeof casterArchetypePlans>[number]} args.plan
 * @param {string} args.entryId   id of the new entry; spells are located on it
 * @param {{rank: number, identity: string, source: object}[]} args.spells cloned spell item data, in pick order
 * @param {() => string} args.newId id for each embedded spell
 * @param {string|null} [args.signatureIdentity] the picked signature spell's identity (null: the deterministic default)
 * @returns {{entry: object, spells: object[], rejected: {name: string, reason: string}[]}}
 */
export function assembleCasterArchetypeEntry({ plan, entryId, spells, newId, signatureIdentity = null }) {
  const { archetype, slots: slotCounts, picks } = plan;
  const slots = {};
  for (let rank = 0; rank <= 10; rank++) slots[`slot${rank}`] = { value: slotCounts[rank] ?? 0, max: slotCounts[rank] ?? 0, prepared: [] };
  const kept = [];
  const keptRanks = [];
  const keptIdentities = [];
  const rejected = [];
  const used = new Map();
  const seen = new Set();
  for (const { rank, identity, source } of spells) {
    const name = source?.name ?? identity ?? "?";
    const reject = (reason) => { rejected.push({ name, reason }); };
    const traits = source?.system?.traits ?? {};
    if (source?.type !== "spell") { reject("grounded document is not a spell"); continue; }
    if (!Array.isArray(traits.value) || !Array.isArray(traits.traditions)) { reject("missing spell trait data"); continue; }
    if (!Number.isInteger(rank) || !Object.hasOwn(picks, rank)) { reject(`the archetype has no ${ordinalName(rank)} picks`); continue; }
    const cantrip = traits.value.includes("cantrip");
    const baseRank = cantrip ? 0 : source.system?.level?.value;
    if (baseRank !== rank) { reject(`its own rank does not match ${ordinalName(rank)}`); continue; }
    if (traits.value.includes("focus") || source.system?.ritual) { reject("focus spells and rituals use separate casting entries"); continue; }
    if (!traits.traditions.includes(archetype.tradition)) { reject(`not an ${archetype.tradition} spell`); continue; }
    if (traits.rarity !== "common") { reject("only common spells are added to the spellbook"); continue; }
    if (!identity) { reject("grounded spell identity is missing"); continue; }
    if (seen.has(identity)) { reject("duplicate spell"); continue; }
    if ((used.get(rank) ?? 0) >= picks[rank]) { reject(`${ordinalName(rank)} picks are full`); continue; }
    seen.add(identity);
    used.set(rank, (used.get(rank) ?? 0) + 1);
    const data = source;
    data._id = newId();
    // A cloned source can carry a stale entry or heightened location; rebuild it.
    data.system.location = { value: entryId };
    kept.push(data);
    keptRanks.push({ rank });
    keptIdentities.push(identity);
    // Prepared: the first picks of each rank fill that rank's slots; the rest stay in the spellbook.
    if (archetype.mode === "prepared" && (slots[`slot${rank}`].prepared.length) < (slotCounts[rank] ?? 0)) {
      slots[`slot${rank}`].prepared.push({ id: data._id, expended: false });
    }
  }
  // Signature spells (Bard, from the level the Basic feat grants one): a flag on the spell, chosen the same way as in the preview.
  // The GM's pick is used only when it is still one of the kept repertoire spells; a vanished pick marks nothing (Create
  // revalidates before this runs, so an absent pick means "not allowed yet", never a silent fallback).
  if (plan.signatures ?? 0) {
    const picked = signatureIdentity ? keptIdentities.indexOf(signatureIdentity) : -1;
    if (signatureIdentity && picked < 0) throw new Error("the chosen signature spell is not in the archetype's repertoire");
    const indexes = picked >= 0 ? [picked] : [...chooseSignatureIndexes(keptRanks, plan.signatures)];
    for (const index of indexes) kept[index].system.location.signature = true;
  }
  return {
    entry: {
      _id: entryId,
      name: archetype.label,
      type: "spellcastingEntry",
      img: "systems/pf2e/icons/default-icons/spellcastingEntry.svg",
      system: {
        tradition: { value: archetype.tradition },
        prepared: { value: archetype.mode, flexible: false },
        ability: { value: archetype.ability },
        proficiency: { value: 1 },
        slots,
        spelldc: { value: 0, dc: 0, mod: 0 },
        showSlotlessLevels: { value: false }
      }
    },
    spells: kept,
    rejected
  };
}
