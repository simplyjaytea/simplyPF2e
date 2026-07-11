/**
 * Benchmark tables from the Pathfinder 2e GM Core "Building Creatures" chapter
 * (Tables: Ability Modifier Scales, Perception, Skills, Armor Class, Saving
 * Throws, Hit Points, Strike Attack Bonus, Strike Damage, Spell DC & Attack,
 * Resistances & Weaknesses), plus Table 10-9 Treasure by Level from the
 * GM Core treasure chapter.
 *
 * Every array is indexed by creature level, from -1 to 24 (use `idx(level)`).
 * Rules data used under the ORC License; see README for attribution.
 */

export const MIN_LEVEL = -1;
export const MAX_LEVEL = 24;

/** Convert a creature level (-1..24) into a table row index. */
function idx(level) {
  const lv = Math.clamp ? Math.clamp(level, MIN_LEVEL, MAX_LEVEL) : Math.min(Math.max(level, MIN_LEVEL), MAX_LEVEL);
  return lv + 1;
}

export const SCALES = ["extreme", "high", "moderate", "low", "terrible"];

/* ------------------------------------------------------------------ */
/* Ability modifiers. Extreme is unavailable below level 1 (falls back
 * to high). */
export const ABILITY_MODIFIER = {
  //        lvl -1  0   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16  17  18  19  20  21  22  23  24
  extreme:  [null, null, 5,  5,  5,  6,  6,  7,  7,  7,  7,  8,  8,  8,  9,  9,  9, 10, 10, 10, 11, 11, 11, 11, 11, 13],
  high:     [3,  3,  4,  4,  4,  5,  5,  5,  6,  6,  6,  7,  7,  7,  8,  8,  8,  9,  9,  9, 10, 10, 10, 10, 10, 12],
  moderate: [2,  2,  3,  3,  3,  3,  4,  4,  4,  4,  4,  5,  5,  5,  5,  5,  6,  6,  6,  6,  6,  7,  7,  8,  8,  9],
  low:      [0,  0,  1,  1,  1,  2,  2,  2,  2,  3,  3,  3,  3,  4,  4,  4,  4,  5,  5,  5,  5,  6,  6,  6,  6,  7]
};

/* Perception and saving throws share the same benchmark numbers. */
export const PERCEPTION_AND_SAVES = {
  extreme:  [9, 10, 11, 12, 14, 15, 17, 18, 20, 21, 23, 24, 26, 27, 29, 30, 32, 33, 35, 36, 38, 39, 41, 43, 44, 46],
  high:     [8,  9, 10, 11, 12, 14, 15, 17, 18, 19, 21, 22, 24, 25, 26, 28, 29, 30, 32, 33, 35, 36, 38, 39, 40, 42],
  moderate: [5,  6,  7,  8,  9, 11, 12, 14, 15, 16, 18, 19, 21, 22, 23, 25, 26, 28, 29, 30, 32, 33, 35, 36, 37, 38],
  low:      [2,  3,  4,  5,  6,  8,  9, 11, 12, 13, 15, 16, 18, 19, 20, 22, 23, 25, 26, 27, 29, 30, 32, 33, 34, 36],
  terrible: [0,  1,  2,  3,  4,  6,  7,  8, 10, 11, 12, 14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32]
};

export const SKILL = {
  extreme:  [8,  9, 10, 11, 13, 15, 16, 18, 20, 21, 23, 25, 26, 28, 30, 31, 33, 35, 36, 38, 40, 41, 43, 45, 46, 48],
  high:     [5,  6,  7,  8, 10, 12, 13, 15, 17, 18, 20, 22, 23, 25, 27, 28, 30, 32, 33, 35, 37, 38, 40, 42, 43, 45],
  moderate: [4,  5,  6,  7,  9, 10, 12, 13, 15, 16, 18, 19, 21, 22, 24, 25, 27, 28, 30, 31, 33, 34, 36, 37, 38, 40],
  low:      [2,  3,  4,  5,  7,  8, 10, 11, 13, 14, 16, 17, 19, 20, 22, 23, 25, 26, 28, 29, 31, 32, 34, 35, 36, 38]
};

export const AC = {
  extreme:  [18, 19, 19, 21, 22, 24, 25, 27, 28, 30, 31, 33, 34, 36, 37, 39, 40, 42, 43, 45, 46, 48, 49, 51, 52, 54],
  high:     [15, 16, 16, 18, 19, 21, 22, 24, 25, 27, 28, 30, 31, 33, 34, 36, 37, 39, 40, 42, 43, 45, 46, 48, 49, 51],
  moderate: [14, 15, 15, 17, 18, 20, 21, 23, 24, 26, 27, 29, 30, 32, 33, 35, 36, 38, 39, 41, 42, 44, 45, 47, 48, 50],
  low:      [12, 13, 13, 15, 16, 18, 19, 21, 22, 24, 25, 27, 28, 30, 31, 33, 34, 36, 37, 39, 40, 42, 43, 45, 46, 48]
};

/* Hit points use the midpoint of each printed range. */
export const HP = {
  high:     [9, 18, 25, 38, 56, 75, 94, 119, 144, 169, 194, 219, 244, 269, 294, 319, 344, 369, 394, 419, 444, 469, 500, 538, 575, 625],
  moderate: [7, 15, 20, 30, 45, 60, 75,  95, 115, 135, 155, 175, 195, 215, 235, 255, 275, 295, 315, 335, 355, 375, 400, 430, 460, 500],
  low:      [5, 12, 15, 23, 34, 45, 56,  71,  86, 101, 116, 131, 146, 161, 176, 191, 206, 221, 236, 251, 266, 281, 300, 322, 345, 375]
};

export const STRIKE_ATTACK = {
  extreme:  [10, 10, 11, 13, 14, 16, 17, 19, 20, 22, 23, 25, 27, 28, 29, 31, 32, 34, 35, 37, 38, 40, 41, 43, 44, 46],
  high:     [8,  8,  9, 11, 12, 14, 15, 17, 18, 20, 21, 23, 24, 26, 27, 29, 30, 32, 33, 35, 36, 38, 39, 41, 43, 45],
  moderate: [6,  6,  7,  9, 10, 12, 13, 15, 16, 18, 19, 21, 22, 24, 25, 27, 28, 30, 31, 33, 35, 36, 38, 39, 41, 43],
  low:      [4,  4,  5,  7,  8,  9, 11, 12, 13, 15, 16, 17, 19, 20, 21, 23, 24, 25, 27, 28, 29, 31, 32, 34, 35, 36]
};

/* Strike damage expressed as ready-to-roll dice formulas. */
export const STRIKE_DAMAGE = {
  extreme: [
    "1d6+1", "1d6+2", "1d8+2", "1d12+4", "1d12+8", "2d10+7", "2d12+7", "2d12+10",
    "2d12+12", "2d12+15", "2d12+17", "2d12+20", "2d12+22", "3d12+19", "3d12+21",
    "3d12+24", "3d12+26", "3d12+29", "3d12+31", "3d12+34", "4d12+29", "4d12+32",
    "4d12+34", "4d12+37", "4d12+39", "4d12+42"
  ],
  high: [
    "1d4+2", "1d6+1", "1d6+2", "1d10+4", "1d10+6", "2d8+5", "2d8+7", "2d8+9",
    "2d10+9", "2d10+11", "2d10+13", "2d12+13", "2d12+15", "3d10+14", "3d10+16",
    "3d10+18", "3d10+19", "3d10+21", "3d10+23", "3d10+24", "4d10+20", "4d10+22",
    "4d10+24", "4d10+26", "4d10+27", "4d10+29"
  ],
  moderate: [
    "1d4+1", "1d4+2", "1d6+1", "1d8+4", "1d8+6", "2d6+5", "2d6+6", "2d6+8",
    "2d8+8", "2d8+9", "2d8+11", "2d10+11", "2d10+12", "3d8+12", "3d8+14",
    "3d8+15", "3d8+17", "3d8+18", "3d8+19", "3d8+21", "4d8+17", "4d8+19",
    "4d8+20", "4d8+22", "4d8+23", "4d8+24"
  ],
  low: [
    "1d4", "1d4+1", "1d4+2", "1d6+3", "1d6+5", "2d4+4", "2d4+6", "2d4+7",
    "2d6+6", "2d6+8", "2d6+9", "2d6+10", "2d8+10", "3d6+10", "3d6+11",
    "3d6+13", "3d6+14", "3d6+15", "3d6+16", "3d6+17", "4d6+14", "4d6+15",
    "4d6+17", "4d6+18", "4d6+19", "4d6+21"
  ]
};

export const SPELL_DC = {
  extreme:  [19, 19, 20, 22, 23, 25, 26, 27, 29, 30, 32, 33, 34, 36, 37, 39, 40, 41, 43, 44, 46, 47, 48, 50, 51, 52],
  high:     [16, 16, 17, 18, 20, 21, 22, 24, 25, 26, 28, 29, 30, 32, 33, 34, 36, 37, 38, 40, 41, 42, 44, 45, 46, 48],
  moderate: [13, 13, 14, 15, 17, 18, 19, 21, 22, 23, 25, 26, 27, 29, 30, 31, 33, 34, 35, 37, 38, 39, 41, 42, 43, 45]
};

export const SPELL_ATTACK = {
  extreme:  [11, 11, 12, 14, 15, 17, 18, 19, 21, 22, 24, 25, 26, 28, 29, 31, 32, 33, 35, 36, 38, 39, 40, 42, 43, 44],
  high:     [8,  8,  9, 10, 12, 13, 14, 16, 17, 18, 20, 21, 22, 24, 25, 26, 28, 29, 30, 32, 33, 34, 36, 37, 38, 40],
  moderate: [5,  5,  6,  7,  9, 10, 11, 13, 14, 15, 17, 18, 19, 21, 22, 23, 25, 26, 27, 29, 30, 31, 33, 34, 35, 37]
};

/* Level-based DCs (GM Core), used for Recall Knowledge checks. */
export const LEVEL_DC = {
  dc: [13, 14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 34, 35, 36, 38, 39, 40, 42, 44, 46, 48]
};

export const RARITY_DC_ADJUSTMENT = { common: 0, uncommon: 2, rare: 5, unique: 10 };

/** The DC to identify/recall knowledge about a creature of this level+rarity. */
export function identificationDC(level, rarity = "common") {
  return lookup(LEVEL_DC, level, "dc", []) + (RARITY_DC_ADJUSTMENT[rarity] ?? 0);
}

export const RESISTANCE = {
  maximum: [1, 3, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 23, 24, 24, 26],
  minimum: [1, 1, 2, 2, 3, 4, 4, 5,  5,  6,  6,  7,  7,  8,  8,  9,  9,  9, 10, 10, 10, 11, 11, 11, 12, 12]
};

/* ------------------------------------------------------------------ */
/* Treasure budgets.
 *
 * PF2e GM Core / Core Rulebook Table 10-9 Treasure by Level (Total Value
 * column), ORC-licensed reference data — see README attribution section,
 * same as the other benchmark tables in this file.
 *
 * The published table covers CHARACTER levels 1-20 only (this is a
 * party-progression table, not a creature table): it is the total treasure a
 * party should accumulate across a whole level of play. The -1/0 and 21-24
 * rows are OUR extrapolation so the table indexes like every other table in
 * this file: level 0 ≈ half of level 1, level -1 ≈ half of level 0; levels
 * 21-24 continue the late-game compounding curve at ~1.45x per level
 * (consistent with the 17-19 trend). These edge rows are a reasoned
 * assumption, not published data.
 *
 * Transcription-confidence note: levels 1-12 were recalled with high
 * confidence; the exact digits for 13-20 are less certain (the order of
 * magnitude and shape are right). One shape anomaly worth flagging rather
 * than silently "fixing": the 19→20 step (355,000 → 490,000, ×1.38) breaks
 * the accelerating ×1.55/×1.63/×1.71 run just before it. That may well be
 * how the book prints it (level 20 is the campaign's final level), but if a
 * high-level game feels off, this row is the one to re-check against the
 * book. */
export const TREASURE_BY_LEVEL = {
  //      lvl  -1   0    1    2    3    4     5     6     7     8     9    10
  total: [    45,  90, 175, 300, 500, 850, 1350, 2000, 2900, 4000, 5700, 8000,
  //      lvl  11     12     13     14     15     16      17      18      19      20
          11500, 16500, 25000, 36500, 54500, 82500, 128000, 208000, 355000, 490000,
  //      lvl     21       22       23       24   (extrapolated, see above)
          710000, 1030000, 1500000, 2200000]
};

/* Uncommon/rare/unique creatures carry above-average treasure for their
 * level — module design choice layered on top of the level baseline. */
export const RARITY_TREASURE_MULTIPLIER = { common: 1, uncommon: 1.5, rare: 2.5, unique: 4 };

/* How many "significant", treasure-bearing encounters a party plays per
 * level. GM Core's general pacing guidance is roughly 4; this converts the
 * per-level total above into a per-encounter (per-creature) share. It is a
 * reasoned pacing assumption, not a hard rule — adjust if treasure feels too
 * rich or too thin. */
export const ENCOUNTERS_PER_LEVEL = 4;

/* The per-generation "Treasure amount" control (Stingy/Standard/Generous),
 * applied on top of the level + rarity budget. */
export const TREASURE_AMOUNT_MULTIPLIER = { stingy: 0.5, standard: 1, generous: 1.5 };

/**
 * Expected gp value of one creature's carried treasure: the per-encounter
 * share of the level's total, scaled by creature rarity and the GM's
 * per-generation Treasure amount setting. In encounter mode, pass the PARTY
 * level (treasure is calibrated to the players receiving it), not each
 * member's own creature level.
 */
export function treasureBudget(level, rarity = "common", amount = "standard") {
  const perEncounter = lookup(TREASURE_BY_LEVEL, level, "total", []) / ENCOUNTERS_PER_LEVEL;
  return Math.round(
    perEncounter
    * (RARITY_TREASURE_MULTIPLIER[rarity] ?? 1)
    * (TREASURE_AMOUNT_MULTIPLIER[amount] ?? 1)
  );
}

/* ------------------------------------------------------------------ */

/**
 * Look up a benchmark value.
 * @param {object} table   One of the exported table objects.
 * @param {number} level   Creature level (-1..24).
 * @param {string} scale   Scale name (extreme/high/moderate/low/terrible).
 * @param {string[]} fallbacks  Scales to try if the requested one is missing.
 */
export function lookup(table, level, scale, fallbacks = ["high", "moderate", "low"]) {
  const i = idx(level);
  const chain = [scale, ...fallbacks];
  for (const s of chain) {
    const column = table[s];
    if (column && column[i] !== null && column[i] !== undefined) return column[i];
  }
  const first = Object.values(table)[0];
  return first[i];
}

/** Average value of a dice formula like "2d8+9" (for preview display). */
export function averageDamage(formula) {
  const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(formula.replaceAll(" ", ""));
  if (!m) return null;
  const [, n, faces, mod] = m;
  return Math.floor(Number(n) * (Number(faces) + 1) / 2 + Number(mod ?? 0));
}
