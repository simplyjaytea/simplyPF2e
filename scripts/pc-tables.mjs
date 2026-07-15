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
