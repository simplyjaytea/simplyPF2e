/**
 * Everything the module knows about PF2e runes, in one place.
 *
 * GROUNDING PRINCIPLE (the same one rule-templates.mjs applies to Rule
 * Elements): fundamental and property runes are all real Item documents in the
 * equipment compendium ("Weapon Potency (+1)", "Striking (Greater)",
 * "Flaming"), each with its own real level and price. So this module NEVER
 * hardcodes which rune unlocks at which level or what one costs — it looks the
 * real documents up. A homebrew rune pack is picked up automatically, and a
 * wrong recalled number can't leak in.
 *
 * Used by two very different callers, which is why it lives on its own:
 *   - builder.mjs / pc-builder.mjs, parsing runes OUT of an AI-written item
 *     name ("+1 striking rapier") and re-applying them as real system data;
 *   - item-builder.mjs (item forge Phase 3), assembling a runed item FROM
 *     real component documents chosen by the AI.
 */

import { getPacksFor, getAllEquipmentEntries, findEntry } from "./compendium.mjs";
import { slugify, capitalized } from "./text.mjs";

/* Catalog names of the fundamental rune items, exactly as published. */
export const POTENCY_CATALOG_NAME = {
  weapon: (tier) => `Weapon Potency (+${tier})`,
  armor: (tier) => `Armor Potency (+${tier})`
};
export const SECONDARY_CATALOG_NAME = {
  weapon: { 1: "Striking", 2: "Striking (Greater)", 3: "Striking (Major)" },
  armor: { 1: "Resilient", 2: "Resilient (Greater)", 3: "Resilient (Major)" }
};
/* Adjective form used when assembling a full item name ("+2 Greater Striking
 * Flaming Rapier") — differs from the catalog search name above. */
export const SECONDARY_ADJECTIVE = {
  weapon: { 1: "Striking", 2: "Greater Striking", 3: "Major Striking" },
  armor: { 1: "Resilient", 2: "Greater Resilient", 3: "Major Resilient" }
};
/* The system.runes field the secondary tier lives on, per kind. */
export const SECONDARY_RUNE_FIELD = { weapon: "striking", armor: "resilient" };

/* Item types that can carry runes at all. */
export const RUNED_ITEM_KINDS = new Set(["weapon", "armor"]);

/* Real system.usage.value strings marking a property rune as valid for a
 * weapon vs. armor, with the armor-category constraint each armor usage
 * encodes (null = any category). Verified against the real pf2e config
 * (src/scripts/config/index.ts usages) and published rune items. The three
 * usages that encode a MATERIAL constraint (etched-onto-metal-armor,
 * etched-onto-lm-nonmetal-armor, etched-onto-medium-heavy-metal-armor) are
 * deliberately absent: an armor's metal-ness isn't in the index data, so
 * those runes fail closed out of the candidate list instead of landing on an
 * illegal base. Shield/ammunition-only runes stay out of scope. */
const WEAPON_RUNE_USAGE = new Set(["etched-onto-a-weapon"]);
const ARMOR_RUNE_USAGE_CATEGORIES = new Map([
  ["etched-onto-armor", null],
  ["etched-onto-light-armor", ["light"]],
  ["etched-onto-heavy-armor", ["heavy"]],
  ["etched-onto-med-heavy-armor", ["medium", "heavy"]]
]);
const ARMOR_RUNE_USAGE = new Set(ARMOR_RUNE_USAGE_CATEGORIES.keys());

/**
 * Whether a property rune (by its real usage string) may be etched onto a
 * base item of this kind and system.category. Weapon-rune usages in the
 * candidate list carry no per-weapon constraint; armor usages map to the
 * category table above. An unknown usage or category fails closed.
 */
export function propertyRuneFitsBase(kind, usage, category) {
  if (kind !== "armor") return WEAPON_RUNE_USAGE.has(usage);
  const allowed = ARMOR_RUNE_USAGE_CATEGORIES.get(usage);
  if (allowed === undefined) return false;
  return allowed === null || allowed.includes(category);
}

/**
 * Short human-readable note for a category-restricted armor rune usage
 * ("light armor only"), or null when the usage carries no restriction —
 * shown next to each candidate so the AI can pick runes that fit its base.
 */
export function propertyRuneRestrictionNote(usage) {
  const allowed = ARMOR_RUNE_USAGE_CATEGORIES.get(usage);
  return allowed ? `${allowed.join("/")} armor only` : null;
}

/* -------------------- parsing runes out of a name -------------------- */

const STRIKING_RUNES = { "major striking": 3, "greater striking": 2, "striking": 1 };
const RESILIENT_RUNES = { "major resilient": 3, "greater resilient": 2, "resilient": 1 };

/**
 * Parse fundamental runes out of an item name like "+1 striking rapier" or
 * "+2 greater resilient breastplate", so the base item can be found in the
 * compendium and the runes applied as real system data.
 * @returns {{base: string, potency: number, striking: number, resilient: number}}
 */
export function parseRunes(name) {
  const result = { base: String(name).trim(), potency: 0, striking: 0, resilient: 0 };
  const match = /^\s*\+(\d)\s+(.+)$/.exec(result.base);
  if (!match) return result;
  result.potency = Math.min(Number(match[1]), 3);
  let rest = match[2].trim();
  const lower = () => rest.toLowerCase();
  for (const [rune, value] of Object.entries(STRIKING_RUNES)) {
    if (lower().startsWith(`${rune} `)) {
      result.striking = value;
      rest = rest.slice(rune.length + 1);
      break;
    }
  }
  for (const [rune, value] of Object.entries(RESILIENT_RUNES)) {
    if (lower().startsWith(`${rune} `)) {
      result.resilient = value;
      rest = rest.slice(rune.length + 1);
      break;
    }
  }
  result.base = rest.trim();
  return result;
}

/** True when a parsed-rune result actually carries any fundamental rune. */
export const hasRunes = (runes) =>
  Boolean(runes && (runes.potency || runes.striking || runes.resilient));

/**
 * The standard PF2e display name for a runed item: "+2 Greater Striking
 * Rapier". Built from the runes actually applied and the REAL base item's
 * name, so a capped tier (see capRunes) or an imperfectly-worded AI base name
 * can't leave the label disagreeing with the item's own data.
 */
export function runedName(runes, kind, baseName) {
  const secondary = runes[SECONDARY_RUNE_FIELD[kind]];
  return [
    runes.potency ? `+${runes.potency}` : null,
    secondary ? SECONDARY_ADJECTIVE[kind][secondary] : null,
    capitalized(baseName)
  ].filter(Boolean).join(" ");
}

/**
 * Apply parsed fundamental runes to weapon/armor item data in place and rename
 * it to the runed name. The secondary rune is `striking` on weapons and
 * `resilient` on armor; each field keeps whichever value is higher (the item's
 * own or the parsed one). No-ops on other item types.
 *
 * Deliberately does NOT touch system.price or system.level: the PF2e system
 * recomputes both from the runes on every data-prep pass (verified in
 * physical/document.ts, which calls computeLevelRarityPrice), so writing them
 * here would just be overwritten. Module-side budgeting uses runeGp() below
 * instead of reading the item's stored price.
 * @returns {object} the same item data
 */
export function applyRunes(data, runes) {
  const kind = data.type;
  const secondaryField = SECONDARY_RUNE_FIELD[kind];
  if (!secondaryField) return data;
  if (runes.potency || runes[secondaryField]) {
    const applied = {
      potency: Math.max(runes.potency, data.system.runes?.potency ?? 0),
      [secondaryField]: Math.max(runes[secondaryField], data.system.runes?.[secondaryField] ?? 0)
    };
    data.system.runes = { ...data.system.runes, ...applied };
    data.name = runedName(applied, kind, data.name);
  }
  return data;
}

/* -------------------- real rune levels and prices -------------------- */

/* Resolved once per session: kind -> {potency: [{tier, level, gp}], secondary: [...]}. */
const fundamentalCache = new Map();

/**
 * The real level and price of every fundamental rune tier for `kind`, read
 * from the compendium documents themselves. Tiers with no matching document
 * (an odd content set) are simply absent.
 * @param {"weapon"|"armor"} kind
 */
export async function fundamentalRunes(kind) {
  if (fundamentalCache.has(kind)) return fundamentalCache.get(kind);
  const entries = await getAllEquipmentEntries();
  const byName = new Map(entries.map((e) => [slugify(e.name), e]));
  const lookup = (name) => byName.get(slugify(name)) ?? null;
  const collect = (nameFor) => [1, 2, 3]
    .map((tier) => ({ tier, entry: lookup(nameFor(tier)) }))
    .filter(({ entry }) => entry)
    .map(({ tier, entry }) => ({ tier, level: entry.level, gp: entry.gp }));
  const result = {
    potency: collect((t) => POTENCY_CATALOG_NAME[kind](t)),
    secondary: collect((t) => SECONDARY_CATALOG_NAME[kind][t])
  };
  fundamentalCache.set(kind, result);
  return result;
}

/**
 * Which fundamental-rune tiers fit under a target item level, resolved against
 * each tier's REAL compendium item level. Tier 0 (no secondary rune) is always
 * valid and implicit. `minPotencyLevel` is the +1 potency rune's own level
 * regardless of the filter, so callers can explain why nothing is available.
 * @returns {Promise<{potencyTiers: number[], secondaryTiers: number[], minPotencyLevel: number}>}
 */
export async function getFundamentalRuneTiers(kind, maxLevel) {
  const { potency, secondary } = await fundamentalRunes(kind);
  return {
    potencyTiers: potency.filter((r) => r.level <= maxLevel).map((r) => r.tier),
    secondaryTiers: secondary.filter((r) => r.level <= maxLevel).map((r) => r.tier),
    minPotencyLevel: potency.find((r) => r.tier === 1)?.level ?? Infinity
  };
}

/**
 * Clamp parsed runes to the tiers a `level` item may actually carry, using the
 * real rune documents' own levels. Without this the AI's item name is the only
 * gate: a level-1 character asked for "+1 striking longsword" could be handed
 * "+3 major striking" instead, silently smuggling a level-19 item onto a
 * level-1 sheet. Anything above the level cap steps down to the best legal
 * tier (0 = no rune), never up.
 * @returns {Promise<object>} a new runes object; the input is left untouched
 */
export async function capRunes(runes, kind, level) {
  if (!RUNED_ITEM_KINDS.has(kind) || !hasRunes(runes)) return { ...runes };
  const { potency, secondary } = await fundamentalRunes(kind);
  const best = (tiers, requested) => {
    const legal = tiers.filter((r) => r.level <= level && r.tier <= requested);
    return legal.length ? Math.max(...legal.map((r) => r.tier)) : 0;
  };
  const field = SECONDARY_RUNE_FIELD[kind];
  return {
    ...runes,
    potency: best(potency, runes.potency),
    [field]: best(secondary, runes[field])
  };
}

/**
 * The gp the fundamental runes on an item add on top of its base price, summed
 * from the real rune documents. The module's treasure/starting-wealth budgets
 * need this: a "+1 striking longsword" resolves to the plain longsword's
 * compendium entry (1 gp), while the item the PF2e system actually renders on
 * the sheet is worth ~1,000 gp — budgeting on the base price alone let a
 * generation overshoot its wealth target by orders of magnitude.
 * @returns {Promise<number>} 0 when the item carries no runes
 */
export async function runeGp(runes, kind) {
  if (!RUNED_ITEM_KINDS.has(kind) || !hasRunes(runes)) return 0;
  const { potency, secondary } = await fundamentalRunes(kind);
  const gpFor = (tiers, tier) => tiers.find((r) => r.tier === tier)?.gp ?? 0;
  return gpFor(potency, runes.potency) + gpFor(secondary, runes[SECONDARY_RUNE_FIELD[kind]]);
}

/* -------------------- item forge candidate lists -------------------- */

/**
 * Real base weapons/armor at or below a target level, so the AI picks a base
 * item that exists instead of naming one from memory. `category` is the base
 * item's real system.category (light/medium/heavy for armor), which gates
 * category-restricted property runes downstream.
 * @returns {Promise<{name: string, level: number, category: string|null}[]>}
 */
export async function getBaseItemCandidates(kind, maxLevel) {
  const entries = await getAllEquipmentEntries();
  return entries
    .filter((e) => e.type === kind && e.level <= maxLevel)
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
    .map((e) => ({ name: e.name, level: e.level, category: e.category ?? null }));
}

/* Fundamental rune items share the same "etched onto a weapon/armor" usage
 * string as property runes, so they're excluded by name — otherwise they'd
 * leak into the property-rune candidate list and get double-picked alongside
 * the dedicated potency/secondary-tier fields. */
function fundamentalRuneNames(kind) {
  const names = new Set([1, 2, 3].map((t) => slugify(POTENCY_CATALOG_NAME[kind](t))));
  for (const t of [1, 2, 3]) names.add(slugify(SECONDARY_CATALOG_NAME[kind][t]));
  return names;
}

/**
 * Real property rune items (identified by their "etched onto a weapon/armor"
 * usage string) at or below a target level. `usage` is the rune's real
 * system.usage.value, kept so callers can check category-restricted armor
 * runes against the chosen base (see propertyRuneFitsBase).
 * @returns {Promise<{name: string, level: number, usage: string}[]>}
 */
export async function getPropertyRuneCandidates(kind, maxLevel) {
  const usageSet = kind === "weapon" ? WEAPON_RUNE_USAGE : ARMOR_RUNE_USAGE;
  const excluded = fundamentalRuneNames(kind);
  const entries = await getAllEquipmentEntries();
  return entries
    .filter((e) => e.type === "equipment" && usageSet.has(e.usage) && e.level <= maxLevel
      && !excluded.has(slugify(e.name)))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
    .map((e) => ({ name: e.name, level: e.level, usage: e.usage }));
}

/* -------------------- property rune keys -------------------- */

/* "ghost-touch" -> "ghostTouch": the transform PF2e's own rune data uses
 * between a rune's kebab-case slug and its system.runes.property array key
 * (verified against foundryvtt/pf2e source: "flaming", "ghostTouch",
 * "ancestralEchoing" all follow this convention). */
const kebabToCamel = (s) => String(s).replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

/**
 * The system.runes.property key for a catalog rune name. Graded runes
 * ("Flaming (Greater)") are the ONE case where the catalog name and the key
 * don't follow simple kebabToCamel: the grade moves from a trailing suffix to
 * a LEADING key prefix — "Flaming (Greater)" is `greaterFlaming`, not
 * `flamingGreater` (verified against multiple real examples in
 * foundryvtt/pf2e's runes.ts: greaterFortification, greaterCorrosive,
 * greaterInvisibility, majorQuenching, ...). All five grade words that
 * appear as leading key prefixes in that source were confirmed by grepping
 * it directly: greater*, major*, true* (trueQuenching, trueRooting,
 * trueStanching), and lesser-/moderate- (lesserDread, moderateDread).
 */
export function propertyRuneKey(name) {
  const match = /^(.+?)\s*\((Greater|Major|True|Lesser|Moderate)\)$/i.exec(String(name).trim());
  if (!match) return kebabToCamel(slugify(name));
  const grade = match[2].toLowerCase();
  const base = kebabToCamel(slugify(match[1]));
  return grade + base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * Resolve one fundamental rune's compendium index entry, so the item forge can
 * load the real document and sum its actual price and level.
 * @param {"weapon"|"armor"} kind
 * @param {"potency"|"secondary"} slot
 * @param {number} tier
 */
export function findFundamentalRune(kind, slot, tier) {
  const name = slot === "potency"
    ? POTENCY_CATALOG_NAME[kind](tier)
    : SECONDARY_CATALOG_NAME[kind][tier];
  return findEntry(getPacksFor("equipment"), name, (e) => e.type === "equipment");
}
