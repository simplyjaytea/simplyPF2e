/**
 * Player Character leveling cadence from the Pathfinder 2e (remaster) Core
 * Rulebook — WHEN a PC gets an ability boost or a feat slot of each kind.
 * Transcribed core rules, same category as tables.mjs's GM Core benchmark
 * numbers: hardcoded from the book, not invented.
 */

export const ABILITY_BOOST_LEVELS = [1, 5, 10, 15, 20];
export const GENERAL_FEAT_LEVELS = [3, 7, 11, 15, 19];
export const ANCESTRY_FEAT_LEVELS = [1, 5, 9, 13, 17];
export const CLASS_FEAT_LEVELS = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
export const SKILL_FEAT_LEVELS = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
// Exported for completeness/documentation of the full cadence; v1 does not
// automate skill increases beyond the trained skills a background/class
// grants at character creation.
// ponytail: skill increases beyond trained-at-creation are not automated —
// the system tolerates absent increases, a GM can add them by hand. Add
// automation here if that's ever wanted.
export const SKILL_INCREASE_LEVELS = [3, 5, 7, 9, 11, 13, 15, 17, 19];

/**
 * The ordered feat slots a PC of `level` has earned, one entry per slot in
 * level order — the shape #generatePC()/pc-builder.mjs feed to
 * getFeatCandidates()/selectFeats().
 * @returns {{type: "ancestry"|"class"|"skill"|"general", level: number}[]}
 */
export function buildFeatSlots(level) {
  const slots = [];
  for (const lv of ANCESTRY_FEAT_LEVELS) if (lv <= level) slots.push({ type: "ancestry", level: lv });
  for (const lv of CLASS_FEAT_LEVELS) if (lv <= level) slots.push({ type: "class", level: lv });
  for (const lv of SKILL_FEAT_LEVELS) if (lv <= level) slots.push({ type: "skill", level: lv });
  for (const lv of GENERAL_FEAT_LEVELS) if (lv <= level) slots.push({ type: "general", level: lv });
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
