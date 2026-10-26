/**
 * Building Hazards tables from the Pathfinder GM Core "Building Hazards"
 * chapter (pg. 109): Table 2-13 Stealth and Disable DCs, Table 2-14 Minimum
 * Proficiency, Table 2-15 Defenses and Table 2-16 Offense. Transcribed row for
 * row from the Archives of Nethys GM Core text. Rules data used under the ORC
 * License; see README for attribution.
 *
 * Module conventions, not printed values:
 * - Hazard scales are "extreme", "high" and "low". The hazard tables have no
 *   "moderate" scale.
 * - A printed Low DC range resolves to its upper number ("14 to 13" is 14).
 * - A printed Hardness or HP range resolves to the floor of its midpoint.
 * - The Perception note in Table 2-14 is ignored; proficiency is the listed value.
 *
 * Every function clamps its level into [HAZARD_MIN_LEVEL, HAZARD_MAX_LEVEL]
 * and throws on an unknown scale, tier or kind.
 */

export const HAZARD_MIN_LEVEL = -1;
export const HAZARD_MAX_LEVEL = 24;
export const HAZARD_SCALES = ["extreme", "high", "low"];

/** Clamp a hazard level into the table range; non-integers throw. */
function clampLevel(level) {
  if (Number.isInteger(level)) {
    return Math.min(Math.max(level, HAZARD_MIN_LEVEL), HAZARD_MAX_LEVEL);
  }
  throw new Error(`Hazard level must be an integer, got ${String(level)}`);
}

/** Convert a hazard level (-1..24) into a table row index. */
function idx(level) {
  return clampLevel(level) - HAZARD_MIN_LEVEL;
}

/** Look up a column by scale or kind; throws on an unknown key. */
function column(table, key) {
  if (Object.hasOwn(table, key)) return table[key];
  throw new Error(`Unknown hazard scale or kind: ${String(key)}`);
}

/** Floor of the midpoint of a printed [low, high] range. */
const midpoint = ([low, high]) => Math.floor((low + high) / 2);

/* ------------------------------------------------------------------ */
/* Table 2-13 Stealth and Disable DCs. Every array is indexed by hazard level,
 * from -1 to 24 (use idx(level)). The Low column is printed as a range. */
const DC = {
  extreme: [
    18, 19, 20, 21, 23, 25,
    26, 28, 30, 31, 33, 35,
    36, 38, 40, 41, 43, 45,
    46, 48, 50, 51, 53, 55,
    56, 58
  ],
  high: [
    15, 16, 17, 18, 20, 22,
    23, 25, 27, 28, 30, 32,
    33, 35, 37, 38, 40, 42,
    43, 45, 47, 48, 50, 52,
    53, 55
  ],
  low: [
    [12, 11], [13, 12], [14, 13], [15, 14], [17, 15], [18, 17],
    [20, 18], [21, 19], [23, 21], [24, 22], [26, 23], [27, 25],
    [29, 26], [30, 27], [32, 29], [33, 30], [35, 31], [36, 33],
    [38, 34], [39, 35], [41, 37], [42, 38], [44, 39], [45, 41],
    [46, 42], [48, 43]
  ]
};

/** Stealth or disable DC at a hazard level and scale, from Table 2-13. */
export function hazardDC(level, scale) {
  const row = column(DC, scale)[idx(level)];
  if (scale === "low") return Math.max(row[0], row[1]);
  return row;
}

/* Table 2-14 Minimum Proficiency: [highest level in band, high tier, moderate tier]. */
const PROFICIENCY_BANDS = [
  [0, "untrained", "untrained"],
  [4, "trained", "trained"],
  [8, "expert", "trained"],
  [18, "master", "expert"],
  [99, "legendary", "master"]
];

/** Minimum proficiency for a hazard level at tier "high" or "moderate" (Table 2-14). */
export function hazardProficiency(level, tier) {
  const lv = clampLevel(level);
  let col = 0;
  if (tier === "high") col = 1;
  if (tier === "moderate") col = 2;
  if (col === 0) throw new Error("Unknown hazard tier: " + String(tier));
  for (const band of PROFICIENCY_BANDS) {
    if (lv <= band[0]) return band[col];
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Table 2-15 Defenses. AC columns are EAC, HAC and LAC (extreme, high, low).
 * Save columns are the E, H and L saves. Hardness and HP are printed ranges,
 * stored as [low, high]. */
const DEFENSE_AC = {
  extreme: [
    18, 19, 19, 21, 22, 24, 25, 27, 28, 30, 31, 33, 34,
    36, 37, 39, 40, 42, 43, 45, 46, 48, 49, 51, 52, 54
  ],
  high: [
    15, 16, 16, 18, 19, 21, 22, 24, 25, 27, 28, 30, 31,
    33, 34, 36, 37, 39, 40, 42, 43, 45, 46, 48, 49, 51
  ],
  low: [
    12, 13, 13, 15, 16, 18, 19, 21, 22, 24, 25, 27, 28,
    30, 31, 33, 34, 36, 37, 39, 40, 42, 43, 45, 46, 48
  ]
};

const DEFENSE_SAVE = {
  extreme: [
    9, 10, 11, 12, 14, 15, 17, 18, 20, 21, 23, 24, 26,
    27, 29, 30, 32, 33, 35, 36, 38, 39, 41, 43, 44, 46
  ],
  high: [
    8, 9, 10, 11, 12, 14, 15, 17, 18, 19, 21, 22, 24,
    25, 26, 28, 29, 30, 32, 33, 35, 36, 38, 39, 40, 42
  ],
  low: [
    2, 3, 4, 5, 6, 8, 9, 11, 12, 13, 15, 16, 18,
    19, 20, 22, 23, 25, 26, 27, 29, 30, 32, 33, 34, 36
  ]
};

const DEFENSE_HARDNESS = [
  [2, 4], [3, 5], [5, 7], [7, 9], [10, 12], [11, 13],
  [12, 14], [13, 15], [14, 16], [15, 17], [16, 18], [17, 19],
  [19, 21], [20, 22], [21, 23], [22, 24], [23, 25], [25, 27],
  [27, 29], [29, 31], [31, 33], [33, 35], [36, 38], [39, 41],
  [44, 46], [46, 50]
];

const DEFENSE_HP = [
  [11, 13], [15, 17], [23, 25], [30, 34], [42, 46], [46, 50],
  [50, 54], [54, 58], [58, 62], [62, 66], [66, 70], [70, 74],
  [78, 82], [82, 86], [86, 90], [90, 94], [94, 98], [101, 107],
  [109, 115], [117, 123], [125, 131], [133, 139], [144, 152], [156, 164],
  [168, 176], [180, 188]
];

/** Armor Class for a scale at a hazard level (Table 2-15 EAC, HAC or LAC). */
export function hazardAC(level, scale) {
  return column(DEFENSE_AC, scale)[idx(level)];
}

/** Saving throw for a scale at a hazard level (Table 2-15 E, H or L save). */
export function hazardSave(level, scale) {
  return column(DEFENSE_SAVE, scale)[idx(level)];
}

/** Hardness at a hazard level: floor of the printed range midpoint. */
export function hazardHardness(level) {
  return midpoint(DEFENSE_HARDNESS[idx(level)]);
}

/** Hit points at a hazard level: floor of the printed range midpoint. */
export function hazardHP(level) {
  return midpoint(DEFENSE_HP[idx(level)]);
}

/* ------------------------------------------------------------------ */
/* Table 2-16 Offense. Attack columns are S. Atk (simple) and C. Atk (complex).
 * Damage entries are [formula, average] from the printed 2d4+1 (6) form.
 * Save DC columns are EDC (extreme) and HDC (high). */
const OFFENSE_ATTACK = {
  simple: [
    10, 11, 13, 14, 16, 17, 19, 20, 22, 23, 25, 26, 28,
    29, 31, 32, 34, 35, 37, 38, 40, 41, 43, 44, 46, 47
  ],
  complex: [
    8, 8, 9, 11, 12, 14, 15, 17, 18, 20, 21, 23, 24,
    26, 27, 29, 30, 32, 33, 35, 36, 38, 39, 41, 42, 44
  ]
};

const OFFENSE_DAMAGE = {
  simple: [
    ["2d4+1", 6], ["2d6+3", 10], ["2d6+5", 12], ["2d10+7", 18],
    ["2d10+13", 24], ["4d8+10", 28], ["4d8+14", 32], ["4d8+18", 36],
    ["4d10+18", 40], ["4d10+22", 44], ["4d10+26", 48], ["4d12+26", 52],
    ["4d12+30", 56], ["6d10+27", 60], ["6d10+31", 64], ["6d10+35", 68],
    ["6d12+33", 72], ["6d12+35", 74], ["6d12+37", 76], ["6d12+41", 80],
    ["8d10+40", 84], ["8d10+44", 88], ["8d10+48", 92], ["8d10+52", 96],
    ["8d12+48", 100], ["8d12+52", 104]
  ],
  complex: [
    ["1d4+1", 3], ["1d6+2", 5], ["1d6+3", 6], ["1d10+4", 9],
    ["1d10+6", 12], ["2d8+5", 14], ["2d8+7", 16], ["2d8+9", 18],
    ["2d10+9", 20], ["2d10+11", 22], ["2d10+13", 24], ["2d12+13", 26],
    ["2d12+15", 28], ["3d10+14", 30], ["3d10+16", 32], ["3d10+18", 34],
    ["3d12+17", 36], ["3d12+18", 37], ["3d12+19", 38], ["3d12+20", 40],
    ["4d10+20", 42], ["4d10+22", 44], ["4d10+24", 46], ["4d10+26", 48],
    ["4d12+24", 50], ["4d12+26", 52]
  ]
};

const OFFENSE_SAVE_DC = {
  extreme: [
    19, 19, 20, 22, 23, 25, 26, 27, 29, 30, 32, 33, 34,
    36, 37, 39, 40, 41, 43, 44, 46, 47, 48, 50, 51, 52
  ],
  high: [
    16, 16, 17, 18, 20, 21, 22, 24, 25, 26, 28, 29, 30,
    32, 33, 34, 36, 37, 38, 40, 41, 42, 44, 45, 46, 48
  ]
};

/** Attack bonus for a hazard of kind simple or complex (Table 2-16). */
export function hazardAttack(level, kind) {
  return column(OFFENSE_ATTACK, kind)[idx(level)];
}

/** Damage for a hazard of kind simple or complex, as formula and average. */
export function hazardDamage(level, kind) {
  const [formula, average] = column(OFFENSE_DAMAGE, kind)[idx(level)];
  return { formula, average };
}

/** Save DC at a hazard level: EDC for scale extreme, HDC for scale high (Table 2-16). */
export function hazardSaveDC(level, scale) {
  return column(OFFENSE_SAVE_DC, scale)[idx(level)];
}
