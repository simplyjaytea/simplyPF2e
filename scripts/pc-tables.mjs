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
// Consumed by pc-builder.mjs's assignSkillRanks() to round-robin proficiency
// rank increases across trained skills (issue #56 item 5).
export const SKILL_INCREASE_LEVELS = [3, 5, 7, 9, 11, 13, 15, 17, 19];

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
 * Spell slots per spell rank for a FULL SPONTANEOUS caster (Sorcerer/Bard/
 * Oracle) at `level`. Returns an object keyed by spell rank 0-10 -> max slots
 * (0 = cantrips, shown with a fixed known count; ranks the character can't yet
 * cast are 0). Derived from the standard PF2e full-caster progression:
 *   - a new top rank unlocks at each odd level with 2 slots, filling to 3 the
 *     following (even) level; all lower ranks sit at 3.
 *   - 10th rank is the single-slot special case (one slot at level 19-20).
 *
 * CAVEAT — RULES-DERIVED, NOT COPIED FROM A VERIFIED TABLE. The real pf2e
 * system computes these via rule elements on each class item, not a static
 * table in its source, so this could not be cross-checked against ground-truth
 * code (only the shape of the consuming `system.slots` field was verified).
 * The "flat 3 per rank" assumption and the single 10th-rank slot should be
 * spot-checked against the Player Core caster table before high-level PCs are
 * trusted in play — same "confidence caveat" spirit as tables.mjs's
 * TREASURE_BY_LEVEL rows 13-20.
 */
export function spontaneousSpellSlots(level) {
  const lv = Math.min(Math.max(Math.round(Number(level)) || 1, 1), 20);
  const maxRank = Math.min(Math.ceil(lv / 2), 10);
  const slots = { 0: 5 }; // cantrips: 5 known, cast at will
  for (let r = 1; r <= 10; r++) {
    if (r === 10) { slots[r] = lv >= 19 ? 1 : 0; continue; }
    if (r > maxRank) { slots[r] = 0; continue; }
    slots[r] = (r === maxRank && lv % 2 === 1) ? 2 : 3;
  }
  return slots;
}
