import { MIN_LEVEL, MAX_LEVEL } from "./tables.mjs";

/**
 * Encounter building math from the GM Core: XP budgets by threat level,
 * per-player adjustments, and creature XP by level relative to the party.
 * The module does this arithmetic so encounters stay within their budget;
 * the AI only themes the roster.
 */

export const THREATS = {
  trivial: { budget: 40, perPlayer: 10 },
  low: { budget: 60, perPlayer: 20 },
  moderate: { budget: 80, perPlayer: 20 },
  severe: { budget: 120, perPlayer: 30 },
  extreme: { budget: 160, perPlayer: 40 }
};

export const XP_BY_RELATIVE_LEVEL = {
  "-4": 10, "-3": 15, "-2": 20, "-1": 30, "0": 40, "1": 60, "2": 80, "3": 120, "4": 160
};

const clampLevel = (level) => Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, level));

/** XP one creature of `level` is worth against a party of `partyLevel`. */
export function creatureXP(level, partyLevel) {
  const rel = Math.min(4, Math.max(-4, level - partyLevel));
  return XP_BY_RELATIVE_LEVEL[String(rel)];
}

export function encounterBudget(threat, partySize) {
  const t = THREATS[threat] ?? THREATS.moderate;
  return Math.max(t.budget + (partySize - 4) * t.perPlayer, 0);
}

/**
 * Compose an encounter to budget: one headline creature whose relative level
 * matches the threat, backed by lesser creatures until the budget is spent.
 * Returns { members: [{role, level, count, xpEach}], budget, spent }.
 */
export function composeEncounter(threat, partySize, partyLevel) {
  const budget = encounterBudget(threat, partySize);
  const bossRel = { trivial: -1, low: 0, moderate: 1, severe: 2, extreme: 3 }[threat] ?? 1;
  const members = [];
  let spent = 0;

  const minimumLevel = Math.max(MIN_LEVEL, partyLevel - 4);
  let bossLevel = clampLevel(partyLevel + bossRel);
  // A fixed four-player boss can exceed the entire smaller-party budget.
  while (bossLevel > minimumLevel && creatureXP(bossLevel, partyLevel) > budget) bossLevel--;
  const bossXP = creatureXP(bossLevel, partyLevel);
  if (bossXP > budget) {
    throw new Error(`The ${budget} XP encounter budget is too small: the lowest supported creature costs ${bossXP} XP. Increase the threat or party size.`);
  }
  members.push({ role: "boss", level: bossLevel, count: 1, xpEach: bossXP });
  spent += bossXP;

  // Keep the two-role shape and prefer the usual party-level-minus-two
  // minions on a tie. Other legal lesser foes may fit larger parties better.
  const lesserLevels = Array.from({ length: Math.max(0, bossLevel - minimumLevel) }, (_, i) => minimumLevel + i)
    .sort((a, b) => Math.abs(a - (partyLevel - 2)) - Math.abs(b - (partyLevel - 2)) || a - b);
  let minion = null;
  for (const level of lesserLevels) {
    const xp = creatureXP(level, partyLevel);
    const count = Math.min(Math.floor((budget - spent) / xp), 8);
    if (count >= 1 && count * xp > (minion?.count ?? 0) * (minion?.xpEach ?? 0)) {
      minion = { role: "minion", level, count, xpEach: xp };
    }
  }
  if (minion) {
    members.push(minion);
    spent += minion.count * minion.xpEach;
  }

  return { members, budget, spent };
}
