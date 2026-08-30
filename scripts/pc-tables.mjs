/**
 * Player Character leveling cadence from the Pathfinder 2e (remaster) Core
 * Rulebook — WHEN a PC gets an ability boost or a feat slot of each kind.
 * Transcribed core rules, same category as tables.mjs's GM Core benchmark
 * numbers: hardcoded from the book, not invented.
 */

/**
 * GM Core Table 10-10 "Character Wealth" (Chapter 1: Running the Game >
 * Rewards > Treasure > "Treasure for New Characters", GM Core pg. 61) — the
 * wealth a PC who is *created at* the given level starts with. Indexed by
 * level 1-20 via PC_WEALTH_BY_LEVEL[level - 1].
 *
 * VERIFIED against Archives of Nethys (Remaster GM Core), fetched from
 *   https://2e.aonprd.com/Rules.aspx?ID=2662
 * The table there has three columns — "Permanent Items", "Currency", and
 * "Lump Sum". The column transcribed below is the LUMP SUM column, verbatim:
 *
 *   lvl 1  15 gp        lvl 11   3,200 gp
 *   lvl 2  30 gp        lvl 12   4,500 gp
 *   lvl 3  75 gp        lvl 13   6,400 gp
 *   lvl 4  140 gp       lvl 14   9,300 gp
 *   lvl 5  270 gp       lvl 15  13,500 gp
 *   lvl 6  450 gp       lvl 16  20,000 gp
 *   lvl 7  720 gp       lvl 17  30,000 gp
 *   lvl 8  1,100 gp     lvl 18  45,000 gp
 *   lvl 9  1,600 gp     lvl 19  69,000 gp
 *   lvl 10 2,300 gp     lvl 20 112,000 gp
 *
 * WHY THE LUMP SUM COLUMN: the "Permanent Items" + "Currency" pair is the
 * default allotment — a GM hands the player specific items of listed levels
 * PLUS a little coin. The Lump Sum column is the book's own explicitly
 * sanctioned alternative ("you can allow the player to instead start with a
 * lump sum of currency and buy whatever common items they want, with a
 * maximum item level of 1 lower than the character's level"), and it is
 * exactly what this module does: it buys gear separately out of one pool
 * rather than granting a prescribed item ladder. Its level-1 entry, 15 gp,
 * matches the flat 15 gp every 1st-level character gets at character
 * creation, so level 1 needs no special case any more.
 *
 * The table's PERMANENT-ITEMS component is intentionally NOT modeled. The
 * lump sum is deliberately worth less than items+currency (the book says so),
 * which is the correct trade for a module that lets the buyer pick freely.
 * Modelling the recommended per-level item ladder is part of the separate
 * known equipment gap — HANDOFF.md finding #15.
 *
 * Rules data used under the ORC License; see README for attribution.
 */
export const PC_WEALTH_BY_LEVEL = [
  //  1   2   3    4    5    6    7     8     9     10
  15, 30, 75, 140, 270, 450, 720, 1100, 1600, 2300,
  //  11    12    13    14    15     16     17     18     19      20
  3200, 4500, 6400, 9300, 13500, 20000, 30000, 45000, 69000, 112000
];

export const ABILITY_BOOST_LEVELS = [1, 5, 10, 15, 20];
export const GENERAL_FEAT_LEVELS = [3, 7, 11, 15, 19];
export const ANCESTRY_FEAT_LEVELS = [1, 5, 9, 13, 17];
export const CLASS_FEAT_LEVELS = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
export const SKILL_FEAT_LEVELS = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];

/**
 * The ordered feat slots a PC of `level` has earned, one entry per slot in
 * level order — the shape #generatePC()/pc-builder.mjs feed to
 * getFeatCandidates()/selectFeats(). With `freeArchetype`, adds the Free
 * Archetype variant's extra archetype class-feat slot at every even level
 * (CLASS_FEAT_LEVELS are exactly the even levels 2-20) — issue #64 item 4b.
 * @returns {{type: "ancestry"|"class"|"skill"|"general", level: number, archetype?: boolean}[]}
 */
export function buildFeatSlots(level, { freeArchetype = false } = {}) {
  const slots = [];
  for (const lv of ANCESTRY_FEAT_LEVELS) if (lv <= level) slots.push({ type: "ancestry", level: lv });
  for (const lv of CLASS_FEAT_LEVELS) if (lv <= level) slots.push({ type: "class", level: lv });
  for (const lv of SKILL_FEAT_LEVELS) if (lv <= level) slots.push({ type: "skill", level: lv });
  for (const lv of GENERAL_FEAT_LEVELS) if (lv <= level) slots.push({ type: "general", level: lv });
  if (freeArchetype) {
    for (const lv of CLASS_FEAT_LEVELS) if (lv <= level) slots.push({ type: "class", level: lv, archetype: true });
  }
  return slots.sort((a, b) => a.level - b.level);
}

/**
 * PF2e's Free Archetype variant uses its own `archetype` feat group, even
 * though its candidates remain `class` category feats. In 8.4.1
 * CharacterFeats creates slots named `archetype-2`, `archetype-4`, and so on;
 * placing them in `class-N` collides with the character's ordinary class-feat
 * entitlement. Keep the presentation/category distinction here so every
 * builder uses the same native location identifier.
 */
export function featSlotLocation(slot) {
  const group = slot?.archetype === true ? "archetype" : slot?.type;
  const level = Math.round(Number(slot?.level));
  return typeof group === "string" && group && Number.isInteger(level) && level > 0
    ? `${group}-${level}`
    : null;
}

/**
 * Legacy compatibility approximation for unsupported classes. Recognized
 * Remaster classes use pcSpellcastingProfile()/pcSpellSlots() below, grounded
 * in published tables; do not extend this fallback by inference.
 */
export function spontaneousSpellSlots(level) {
  return pcSpellSlots(level, null);
}

const REMASTER_SPELLCASTERS = [
  { slug: "bard", name: "Bard", title: "Pathfinder Player Core", mode: "spontaneous", ability: "cha", tradition: "occult", baseSlots: 2 },
  { slug: "sorcerer", name: "Sorcerer", title: "Pathfinder Player Core 2", mode: "spontaneous", ability: "cha", tradition: null, baseSlots: 3 },
  { slug: "oracle", name: "Oracle", title: "Pathfinder Player Core 2", mode: "spontaneous", ability: "cha", tradition: "divine", baseSlots: 3 },
  { slug: "cleric", name: "Cleric", title: "Pathfinder Player Core", mode: "prepared", ability: "wis", tradition: "divine", baseSlots: 2 },
  { slug: "druid", name: "Druid", title: "Pathfinder Player Core", mode: "prepared", ability: "wis", tradition: "primal", baseSlots: 2 },
  { slug: "witch", name: "Witch", title: "Pathfinder Player Core", mode: "prepared", ability: "int", tradition: null, baseSlots: 2 },
  { slug: "wizard", name: "Wizard", title: "Pathfinder Player Core", mode: "prepared", ability: "int", tradition: "arcane", baseSlots: 2 }
];

/** Conservative Remaster class profile. Class data itself contains only spell
 * proficiency (PF2e class/data.ts), so the published source title qualifies
 * this small verified profile table and prevents legacy lookalikes applying. */
export function pcSpellcastingProfile(classDoc) {
  const slug = String(classDoc?.system?.slug ?? "");
  const name = String(classDoc?.name ?? "");
  const publication = classDoc?.system?.publication ?? {};
  const title = String(publication.title ?? "");
  const profile = publication.remaster === true && REMASTER_SPELLCASTERS.find((p) => p.title === title && (slug === p.slug || (!slug && name === p.name)));
  return profile ? { mode: profile.mode, ability: profile.ability, tradition: profile.tradition, baseSlots: profile.baseSlots } : null;
}

/** Base slots only: seven class tables verified at every level against
 * https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.4.1/packs/pf2e/journals/classes.json
 * and master packs/journals/classes.json. Font/curriculum/feat bonuses are NOT
 * unrestricted base slots. Missing profiles retain the old 2/3 approximation. */
export function pcSpellSlots(level, profile) {
  const baseSlots = profile?.baseSlots === 3 ? 3 : 2;
  const lv = Math.min(Math.max(Math.round(Number(level)) || 1, 1), 20);
  const maxRank = Math.min(Math.ceil(lv / 2), 10);
  const slots = { 0: 5 };
  for (let rank = 1; rank <= 10; rank++) {
    if (rank > maxRank) slots[rank] = 0;
    else if (rank === 10) slots[rank] = lv >= 19 ? 1 : 0;
    else slots[rank] = rank === maxRank && lv % 2 ? baseSlots : baseSlots + 1;
  }
  return slots;
}

/** Spell-list capacity is distinct from native casting slots for spontaneous
 * Remaster casters: their 10th-rank repertoire has two common picks at 19–20
 * while the entry still has one slot. Signature eligibility starts at level 3.
 * Only the three qualified spontaneous profiles above use this policy.
 * Sources (master agrees under packs/classfeatures/):
 * https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.4.1/packs/pf2e/class-features/signature-spells.json
 * Same directory: magnum-opus.json, oracular-clarity.json, bloodline-paragon.json.
 * Signature ranks are learned ranks, including ten; base rank controls native
 * downcasting, not which rank's signature choice is consumed. */
export function pcSpellPlan(level, profile) {
  const slots = pcSpellSlots(level, profile);
  const picks = { ...slots };
  const lv = Math.min(Math.max(Math.round(Number(level)) || 1, 1), 20);
  if (profile?.mode === "spontaneous") {
    if (lv >= 19) picks[10] = 2;
    const signatureRanks = lv >= 3
      ? Object.keys(picks).map(Number).filter((rank) => rank > 0 && picks[rank] > 0)
      : [];
    return { slots, picks, signatureRanks };
  }
  return { slots, picks, signatureRanks: [] };
}
