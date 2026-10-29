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
// Only the Wizard archetype is modeled. Expert and Master Wizard Spellcasting need "master in
// Arcana" / "legendary in Arcana", which the staged prerequisite evaluator cannot prove, so
// the entry never exceeds the Basic benefits (ranks 1 to 3, one slot each).

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
 * @property {number} spellsPerRank spells added to the spellbook per rank gained
 */
export const CASTER_ARCHETYPES = Object.freeze({
  wizard: Object.freeze({
    pkg: "wizard",
    label: "Wizard Archetype Spells",
    tradition: "arcane",
    ability: "int",
    mode: "prepared",
    dedication: "Wizard Dedication",
    basic: "Basic Wizard Spellcasting",
    cantripsKnown: 4,
    cantripSlots: 2,
    spellsPerRank: 2
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
 * @returns {{archetype: CasterArchetype, slots: Record<number, number>, picks: Record<number, number>, maxRank: number}[]}
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
    plans.push({ archetype, slots, picks, maxRank });
  }
  return plans;
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
 * @returns {{entry: object, spells: object[], rejected: {name: string, reason: string}[]}}
 */
export function assembleCasterArchetypeEntry({ plan, entryId, spells, newId }) {
  const { archetype, slots: slotCounts, picks } = plan;
  const slots = {};
  for (let rank = 0; rank <= 10; rank++) slots[`slot${rank}`] = { value: slotCounts[rank] ?? 0, max: slotCounts[rank] ?? 0, prepared: [] };
  const kept = [];
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
    // Prepared: the first picks of each rank fill that rank's slots; the rest stay in the spellbook.
    if ((slots[`slot${rank}`].prepared.length) < (slotCounts[rank] ?? 0)) {
      slots[`slot${rank}`].prepared.push({ id: data._id, expended: false });
    }
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
