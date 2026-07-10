import { MIN_LEVEL, MAX_LEVEL } from "./tables.mjs";

/**
 * Encounter building math from the GM Core: XP budgets by threat level,
 * per-player adjustments, and creature XP by level relative to the party.
 * The module does this arithmetic so encounters always land on budget;
 * the AI only themes the roster.
 */

export const THREATS = {
  trivial: { budget: 40, perPlayer: 10 },
  low: { budget: 60, perPlayer: 15 },
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
  return Math.max(t.budget + (partySize - 4) * t.perPlayer, 10);
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

  const bossLevel = clampLevel(partyLevel + bossRel);
  const bossXP = creatureXP(bossLevel, partyLevel);
  members.push({ role: "boss", level: bossLevel, count: 1, xpEach: bossXP });
  spent += bossXP;

  // Fill the remainder with a single kind of lesser creature. Prefer minions
  // two levels down; fall back to weaker ones if the budget is tight.
  for (const rel of [-2, -3, -4]) {
    const level = clampLevel(partyLevel + rel);
    if (level >= bossLevel) continue;
    const xp = creatureXP(level, partyLevel);
    const count = Math.min(Math.floor((budget - spent) / xp), 6);
    if (count >= 1) {
      members.push({ role: "minion", level, count, xpEach: xp });
      spent += count * xp;
      break;
    }
  }

  return { members, budget, spent };
}
