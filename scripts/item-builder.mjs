/**
 * Item forge assembly: turns a magic-item concept from the AI into real
 * Foundry item data. Two grounding rules keep it honest:
 *
 * 1. Every Rule Element in the output is a CLONE of a real published rule
 *    found by rule-templates.mjs, with only the value / selector / damage
 *    type substituted — never an RE authored from memory (Foundry fails
 *    silently on malformed REs, so recall is not trusted here).
 * 2. The price is an empirical benchmark: the median real compendium price
 *    of items at the concept's level, not a remembered price table.
 */

import { getPacksFor, EQUIPMENT_TYPES, findEntry, getDocument, toItemData } from "./compendium.mjs";
import { priceToGp, slugify, capitalized } from "./builder.mjs";
import {
  RARITY_TREASURE_MULTIPLIER, RESISTANCE, MAX_LEVEL, lookup,
  STRIKE_DAMAGE, SPELL_DC, RARITY_DC_ADJUSTMENT
} from "./tables.mjs";
import { findRuleExemplar, EFFECT_KINDS } from "./rule-templates.mjs";

const RARITIES = new Set(["common", "uncommon", "rare", "unique"]);

/* "ghost-touch" -> "ghostTouch": the transform PF2e's own rune data uses
 * between a rune's kebab-case slug and its system.runes.property array key
 * (verified against foundryvtt/pf2e source: "flaming", "ghostTouch",
 * "ancestralEchoing" all follow this convention). */
const kebabToCamel = (s) => String(s).replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

/* Graded property runes ("Flaming (Greater)", "Fortification (Greater)")
 * are the ONE case where the catalog name and the property-array key don't
 * follow simple kebabToCamel: the grade moves from a trailing "(Greater)"/
 * "(Major)" suffix to a LEADING key prefix — "Flaming (Greater)" is key
 * "greaterFlaming", not "flamingGreater" (verified against multiple real
 * examples in foundryvtt/pf2e's runes.ts: greaterFortification, greaterCorrosive,
 * greaterInvisibility, majorQuenching, ...). */
function propertyRuneKey(name) {
  const match = /^(.+?)\s*\((Greater|Major)\)$/i.exec(String(name).trim());
  if (!match) return kebabToCamel(slugify(name));
  const grade = match[2].toLowerCase();
  const base = kebabToCamel(slugify(match[1]));
  return grade + base.charAt(0).toUpperCase() + base.slice(1);
}

/* Item levels the forge accepts (items start at 1; creature MAX_LEVEL caps it). */
export const MIN_ITEM_LEVEL = 1;
export const MAX_ITEM_LEVEL = MAX_LEVEL;

/* Damage types an effect may reference — the same list enrichDescription()
 * recognizes for creatures, minus the meta-types (precision/untyped) that
 * make no sense as an item's resistance/weakness/immunity. */
export const DAMAGE_TYPES = new Set([
  "acid", "bludgeoning", "cold", "electricity", "fire", "force", "mental",
  "piercing", "poison", "slashing", "sonic", "spirit", "vitality", "void", "bleed"
]);

/* Statistics an item bonus may target: FlatModifier selectors for AC,
 * perception, the three saves, and the standard skills — the same slugs the
 * creature pipeline already uses for skills and saves. */
export const ITEM_BONUS_STATISTICS = new Set([
  "ac", "perception", "fortitude", "reflex", "will",
  "acrobatics", "arcana", "athletics", "crafting", "deception", "diplomacy",
  "intimidation", "medicine", "nature", "occultism", "performance", "religion",
  "society", "stealth", "survival", "thievery"
]);

/* Sense slugs the forge offers (the common passive senses on published gear). */
export const SENSE_TYPES = new Set([
  "darkvision", "greater-darkvision", "low-light-vision", "scent", "tremorsense",
  "echolocation", "see-invisibility", "truesight", "lifesense", "wavesense"
]);

/* BaseSpeed selectors for movement an item can grant. */
export const SPEED_TYPES = new Set(["fly", "swim", "climb", "burrow"]);

/* -------------------- activation (Phase 2) -------------------- */

/* The four activated-effect templates the macro builder knows how to emit. */
export const ACTIVATION_TEMPLATES = new Set(["damage", "heal", "condition", "selfBuff"]);

/* Action costs an activation may declare. */
const ACTION_COSTS = new Set([1, 2, 3, "reaction", "free"]);

/* The three PF2e saving throws an activation may call for. */
export const SAVE_TYPES = new Set(["fortitude", "reflex", "will"]);

/* Conditions an activation may inflict — the standard PF2e condition slugs.
 * Kept to conditions that apply cleanly to a creature via increaseCondition /
 * toggleCondition; excludes book-keeping conditions (dying, wounded via death)
 * that need special handling. */
export const CONDITION_SLUGS = new Set([
  "blinded", "clumsy", "confused", "controlled", "dazzled", "deafened", "doomed",
  "drained", "enfeebled", "fascinated", "fatigued", "fleeing", "frightened",
  "grabbed", "immobilized", "off-guard", "paralyzed", "petrified", "prone",
  "quickened", "restrained", "sickened", "slowed", "stunned", "stupefied",
  "unconscious", "wounded"
]);

/* Conditions that carry a numeric value (badge). Others are on/off. */
const VALUED_CONDITIONS = new Set([
  "clumsy", "doomed", "drained", "enfeebled", "frightened", "sickened",
  "slowed", "stunned", "stupefied", "wounded"
]);

/** Strip a strike-damage formula down to its dice ("1d8+6" -> "1d8"). */
function diceOnly(formula) {
  return String(formula).match(/^\d+d\d+/)?.[0] ?? "1d6";
}

/**
 * A level-appropriate damage-dice suggestion for an activated item, taken
 * from the GM Core moderate Strike Damage row (dice only, no ability mod).
 * Shared by the schema prompt (ai.mjs) and the normalize clamp so both agree.
 */
export function damageDiceForLevel(level) {
  return diceOnly(lookup(STRIKE_DAMAGE, level, "moderate"));
}

/**
 * A level-appropriate save DC for an activated item: the GM Core moderate
 * Spell DC benchmark for the level, adjusted for rarity (same shape the
 * creature spell DCs use). Reused by the schema prompt and the normalize clamp.
 */
export function saveDcForLevel(level, rarity = "common") {
  return Math.round(lookup(SPELL_DC, level, "moderate") + (RARITY_DC_ADJUSTMENT[rarity] ?? 0));
}

/** Normalize a dice string ("4d6", "2d8+3"); null when it isn't a clean formula. */
function normalizeDice(raw) {
  const m = /^\s*(\d{1,2})d(4|6|8|10|12)\s*(?:\+\s*(\d{1,3}))?\s*$/i.exec(String(raw ?? ""));
  if (!m) return null;
  const count = Math.min(Math.max(Number(m[1]), 1), 12);
  const faces = m[2];
  const bonus = m[3] ? Math.min(Number(m[3]), 99) : 0;
  return `${count}d${faces}${bonus ? `+${bonus}` : ""}`;
}

/** Clamp a save DC to a sane window around the level/rarity benchmark. */
function clampDc(raw, level, rarity) {
  const base = saveDcForLevel(level, rarity);
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return base;
  return Math.min(Math.max(n, base - 6), base + 6);
}

/* -------------------- shared pack index -------------------- */

/* Types that carry meaningful market prices (EQUIPMENT_TYPES minus treasure —
 * coins and valuables ARE value, they don't have one). */
const PRICED_TYPES = new Set([...EQUIPMENT_TYPES].filter((t) => t !== "treasure"));

/* packId -> index entries with the extra fields the forge needs. */
const forgeIndexCache = new Map();

/** Equipment-pack index extended with level, price, usage, and traits. */
async function getForgeIndex(packId) {
  if (forgeIndexCache.has(packId)) return forgeIndexCache.get(packId);
  const pack = game.packs.get(packId);
  if (!pack) {
    forgeIndexCache.set(packId, []);
    return [];
  }
  let entries = [];
  try {
    const index = await pack.getIndex({
      fields: ["name", "type", "system.level.value", "system.price.value", "system.usage.value", "system.traits.value"]
    });
    entries = [...index];
  } catch (err) {
    console.warn(`simplypf2e | itemforge: failed to index pack "${packId}"`, err);
  }
  forgeIndexCache.set(packId, entries);
  return entries;
}

/* -------------------- empirical pricing -------------------- */

/* All priced items across the equipment packs, as {level, gp}. Cached. */
let priceSamplesPromise = null;

async function getPriceSamples() {
  priceSamplesPromise ??= (async () => {
    const samples = [];
    const seen = new Set();
    for (const packId of getPacksFor("equipment")) {
      for (const entry of await getForgeIndex(packId)) {
        if (!PRICED_TYPES.has(entry.type)) continue;
        const key = slugify(entry.name);
        if (seen.has(key)) continue;
        const gp = priceToGp(entry.system?.price?.value);
        if (gp <= 0) continue;
        seen.add(key);
        samples.push({ level: entry.system?.level?.value ?? 0, gp });
      }
    }
    return samples;
  })();
  return priceSamplesPromise;
}

const MIN_PRICE_SAMPLES = 5;

/* level -> median gp of real items at (or near) that level. */
const medianCache = new Map();

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Empirical gp price benchmark for an item of this level and rarity: the
 * median real compendium price of items at the level, times a rarity
 * multiplier (the same one the treasure budget uses — rarer items carry
 * above-baseline value).
 *
 * When a level has fewer than MIN_PRICE_SAMPLES priced items, the window
 * widens symmetrically (±1, ±2 as the normal sparse-level path, and keeps
 * widening as a documented fallback until enough samples exist) — an
 * extrapolation from the nearest levels with real data, never an invented
 * price table. Returns 0 only when the packs hold no priced items at all.
 */
export async function priceForLevel(level, rarity = "common") {
  const lv = Math.min(Math.max(Math.round(Number(level) || 0), MIN_ITEM_LEVEL), MAX_ITEM_LEVEL);
  if (!medianCache.has(lv)) {
    const samples = await getPriceSamples();
    let base = 0;
    for (let window = 0; window <= MAX_ITEM_LEVEL; window++) {
      const inWindow = samples.filter((s) => Math.abs(s.level - lv) <= window).map((s) => s.gp);
      if (inWindow.length >= MIN_PRICE_SAMPLES) {
        base = median(inWindow);
        if (window > 2) {
          console.log(`simplypf2e | itemforge: few priced items near level ${lv}; price benchmark widened to ±${window} levels`);
        }
        break;
      }
    }
    medianCache.set(lv, base);
  }
  return Math.round(medianCache.get(lv) * (RARITY_TREASURE_MULTIPLIER[rarity] ?? 1));
}

/* -------------------- runed weapons/armor (Phase 3) -------------------- */

/**
 * Fundamental and property runes are all just real Item documents in the
 * equipment compendium (type "equipment", e.g. "Weapon Potency (+1)",
 * "Striking (Greater)", "Flaming") with their own real level and price —
 * verified against the published foundryvtt/pf2e system source. So a runed
 * weapon/armor needs NO empirical price benchmark and NO memorized rune
 * list: pick a real base item plus real rune items and SUM their real
 * prices; the item's overall level is the MAX level among them (the actual
 * PF2e rule). Same "assemble real pieces" principle as equipment grounding
 * and Phase 1's cloned Rule Elements, applied to runes instead.
 */
export const RUNED_ITEM_KINDS = new Set(["weapon", "armor"]);

/* Real system.usage.value strings that mark a property rune item as valid
 * for a weapon vs. armor (verified against several published rune items;
 * shield/ammunition-only runes are deliberately excluded — out of scope). */
const WEAPON_RUNE_USAGE = new Set(["etched-onto-a-weapon"]);
const ARMOR_RUNE_USAGE = new Set(["etched-onto-armor", "etched-onto-light-armor", "etched-onto-med-heavy-armor"]);

/* Catalog names of the fundamental rune items, exactly as published. */
const POTENCY_CATALOG_NAME = {
  weapon: (tier) => `Weapon Potency (+${tier})`,
  armor: (tier) => `Armor Potency (+${tier})`
};
const SECONDARY_CATALOG_NAME = {
  weapon: { 1: "Striking", 2: "Striking (Greater)", 3: "Striking (Major)" },
  armor: { 1: "Resilient", 2: "Resilient (Greater)", 3: "Resilient (Major)" }
};
/* Adjective form used when assembling the full item name ("+2 Greater
 * Striking Flaming Rapier") — differs from the catalog search name above. */
export const SECONDARY_ADJECTIVE = {
  weapon: { 1: "Striking", 2: "Greater Striking", 3: "Major Striking" },
  armor: { 1: "Resilient", 2: "Greater Resilient", 3: "Major Resilient" }
};
/* system.runes field the secondary tier lives on, per kind. */
const SECONDARY_RUNE_FIELD = { weapon: "striking", armor: "resilient" };

/* All equipment-pack index entries, deduped by name, cached. Reused by every
 * candidate/tier lookup below — one scan serves base items, property runes
 * and fundamental rune tiers alike. */
let equipmentEntriesPromise = null;
async function getAllEquipmentEntries() {
  equipmentEntriesPromise ??= (async () => {
    const entries = [];
    const seen = new Set();
    for (const packId of getPacksFor("equipment")) {
      for (const entry of await getForgeIndex(packId)) {
        const key = slugify(entry.name);
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({
          name: entry.name,
          type: entry.type,
          level: entry.system?.level?.value ?? 0,
          usage: entry.system?.usage?.value ?? null
        });
      }
    }
    return entries;
  })();
  return equipmentEntriesPromise;
}

/**
 * Real base weapons/armor at or below a target level, so the AI picks a
 * base item that exists instead of naming one from memory.
 * @returns {Promise<{name: string, level: number}[]>}
 */
export async function getBaseItemCandidates(kind, maxLevel) {
  const entries = await getAllEquipmentEntries();
  return entries
    .filter((e) => e.type === kind && e.level <= maxLevel)
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
    .map((e) => ({ name: e.name, level: e.level }));
}

/* Fundamental rune items share the same "etched onto a weapon/armor" usage
 * string as property runes (e.g. "Weapon Potency (+1)", "Striking (Greater)")
 * — excluded by name so they never leak into the property-rune candidate
 * list and get double-priced/double-picked alongside the dedicated
 * potency/secondary-tier fields. */
function fundamentalRuneNames(kind) {
  const names = new Set([1, 2, 3].map((t) => slugify(POTENCY_CATALOG_NAME[kind](t))));
  for (const t of [1, 2, 3]) names.add(slugify(SECONDARY_CATALOG_NAME[kind][t]));
  return names;
}

/**
 * Real property rune items (by their "etched onto a weapon/armor" usage
 * string) at or below a target level.
 * @returns {Promise<{name: string, level: number}[]>}
 */
export async function getPropertyRuneCandidates(kind, maxLevel) {
  const usageSet = kind === "weapon" ? WEAPON_RUNE_USAGE : ARMOR_RUNE_USAGE;
  const fundamentalNames = fundamentalRuneNames(kind);
  const entries = await getAllEquipmentEntries();
  return entries
    .filter((e) => e.type === "equipment" && usageSet.has(e.usage) && e.level <= maxLevel
      && !fundamentalNames.has(slugify(e.name)))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
    .map((e) => ({ name: e.name, level: e.level }));
}

/**
 * Which potency/secondary fundamental-rune tiers fit under a target item
 * level, resolved against each tier's REAL compendium item level (never a
 * memorized threshold — a homebrew rune-price module would be picked up
 * automatically). Tier 0 (no secondary rune) is always valid and implicit.
 * `minPotencyLevel` is the level of the +1 potency rune regardless of the
 * filter, so callers can report why no tiers are available at a low level.
 * @returns {Promise<{potencyTiers: number[], secondaryTiers: number[], minPotencyLevel: number}>}
 */
export async function getFundamentalRuneTiers(kind, maxLevel) {
  const entries = await getAllEquipmentEntries();
  const byName = new Map(entries.map((e) => [slugify(e.name), e]));
  const levelOf = (name) => byName.get(slugify(name))?.level ?? Infinity;
  const potencyLevels = [1, 2, 3].map((t) => levelOf(POTENCY_CATALOG_NAME[kind](t)));
  const secondaryLevels = [1, 2, 3].map((t) => levelOf(SECONDARY_CATALOG_NAME[kind][t]));
  return {
    potencyTiers: [1, 2, 3].filter((t) => potencyLevels[t - 1] <= maxLevel),
    secondaryTiers: [1, 2, 3].filter((t) => secondaryLevels[t - 1] <= maxLevel),
    minPotencyLevel: potencyLevels[0]
  };
}

/**
 * Coerce a raw AI runed-item concept into a safe shape. Every name is
 * matched back against the real candidate lists the AI was shown — an
 * unmatched property rune is dropped (with a warning), never invented.
 */
export function normalizeRunedItemConcept(raw, { kind, rarity, baseCandidates, runeCandidates, potencyTiers, secondaryTiers }) {
  const c = typeof raw === "object" && raw !== null ? raw : {};
  const findByName = (list, name) => list.find((x) => slugify(x.name) === slugify(name)) ?? null;

  const base = findByName(baseCandidates, c.baseItemName) ?? baseCandidates[0] ?? null;

  const rawPotency = Math.round(Number(c.potency));
  const potency = potencyTiers.includes(rawPotency) ? rawPotency : potencyTiers[0];

  const rawSecondary = Math.round(Number(c.secondaryTier));
  const secondaryTier = secondaryTiers.includes(rawSecondary) ? rawSecondary : 0;

  const propertyRunes = [];
  const seen = new Set();
  for (const name of Array.isArray(c.propertyRunes) ? c.propertyRunes : []) {
    if (propertyRunes.length >= potency) break;
    const match = findByName(runeCandidates, name);
    if (!match) {
      if (name) console.warn(`simplypf2e | itemforge: dropped unmatched property rune "${name}"`);
      continue;
    }
    const key = slugify(match.name);
    if (seen.has(key)) continue;
    seen.add(key);
    propertyRunes.push(match.name);
  }

  return {
    kind,
    baseItemName: base?.name ?? null,
    potency,
    secondaryTier,
    propertyRunes,
    rarity: RARITIES.has(rarity) ? rarity : RARITIES.has(c.rarity) ? c.rarity : "common",
    description: String(c.description ?? "").slice(0, 800)
  };
}

/**
 * Assemble the Foundry item data for a normalized runed-item concept: the
 * REAL base item document, with system.runes set from the chosen tiers, a
 * price that is the exact sum of every real component's own price, a level
 * that is the max level among them, and a name built from the standard PF2e
 * "+N [secondary] [property runes] [base name]" convention.
 * @returns {Promise<object>} plain item data ready for Item.create()
 */
export async function buildRunedItemData(concept) {
  const packs = getPacksFor("equipment");

  const baseEntry = await findEntry(packs, concept.baseItemName, (e) => e.type === concept.kind);
  const baseDoc = await getDocument(baseEntry);
  if (!baseDoc) {
    throw new Error(`Base ${concept.kind} "${concept.baseItemName}" could not be resolved against the compendium.`);
  }

  const potencyEntry = await findEntry(packs, POTENCY_CATALOG_NAME[concept.kind](concept.potency), (e) => e.type === "equipment");
  const potencyDoc = await getDocument(potencyEntry);

  let secondaryDoc = null;
  if (concept.secondaryTier) {
    const secondaryEntry = await findEntry(packs, SECONDARY_CATALOG_NAME[concept.kind][concept.secondaryTier], (e) => e.type === "equipment");
    secondaryDoc = await getDocument(secondaryEntry);
  }

  const propertyDocs = [];
  for (const name of concept.propertyRunes) {
    const entry = await findEntry(packs, name, (e) => e.type === "equipment");
    const doc = await getDocument(entry);
    if (doc) propertyDocs.push(doc);
    else console.warn(`simplypf2e | itemforge: property rune "${name}" could not be resolved — dropped`);
  }

  const data = toItemData(baseDoc);
  const baseGp = priceToGp(data.system.price?.value);

  data.system.runes = {
    ...(data.system.runes ?? {}),
    potency: concept.potency,
    [SECONDARY_RUNE_FIELD[concept.kind]]: concept.secondaryTier,
    property: propertyDocs.map((d) => propertyRuneKey(d.name))
  };

  const gp = Math.round(
    baseGp
    + (potencyDoc ? priceToGp(potencyDoc.system.price?.value) : 0)
    + (secondaryDoc ? priceToGp(secondaryDoc.system.price?.value) : 0)
    + propertyDocs.reduce((sum, d) => sum + priceToGp(d.system.price?.value), 0)
  );
  data.system.price = { value: { gp } };

  const level = Math.max(
    data.system.level?.value ?? 0,
    potencyDoc?.system.level?.value ?? 0,
    secondaryDoc?.system.level?.value ?? 0,
    ...propertyDocs.map((d) => d.system.level?.value ?? 0)
  );
  data.system.level = { value: level };

  const nameParts = [`+${concept.potency}`];
  if (concept.secondaryTier) nameParts.push(SECONDARY_ADJECTIVE[concept.kind][concept.secondaryTier]);
  nameParts.push(...propertyDocs.map((d) => d.name));
  nameParts.push(baseDoc.name);
  data.name = nameParts.join(" ");

  const rarityRank = { common: 0, uncommon: 1, rare: 2, unique: 3 };
  const baseRarity = data.system.traits?.rarity ?? "common";
  const rarity = (rarityRank[concept.rarity] ?? 0) > (rarityRank[baseRarity] ?? 0) ? concept.rarity : baseRarity;
  const traits = new Set(data.system.traits?.value ?? []);
  traits.add("magical");
  data.system.traits = { ...(data.system.traits ?? {}), value: [...traits], rarity };

  const esc = (text) => (foundry.utils.escapeHTML ? foundry.utils.escapeHTML(text) : text);
  const paragraphs = String(concept.description ?? "")
    .split(/\n{2,}/).map((p) => `<p>${esc(p.trim())}</p>`).filter((p) => p !== "<p></p>");
  const runeSummary = [
    `+${concept.potency} potency`,
    concept.secondaryTier ? SECONDARY_ADJECTIVE[concept.kind][concept.secondaryTier] : null,
    ...propertyDocs.map((d) => d.name)
  ].filter(Boolean).join(", ");
  paragraphs.push(`<hr /><p><strong>${game.i18n.localize("SIMPLYPF2E.ItemForge.RunesHeading")}</strong> ${runeSummary}.</p>`);
  data.system.description = { value: paragraphs.join("\n") };

  return data;
}

/* -------------------- grounded usage strings -------------------- */

/* Fallback when the AI's usage doesn't match anything harvested. */
const DEFAULT_USAGE = "worn";

let usageOptionsPromise = null;

/**
 * The most common `system.usage.value` strings among real magical equipment
 * items, so the AI picks a usage that actually exists ("wornshoes",
 * "held-in-one-hand", ...) instead of inventing a format. Harvested at
 * runtime from the configured equipment packs; falls back to ["worn"] if
 * nothing harvests (pathological — no equipment packs).
 * @returns {Promise<string[]>} up to 14 usage strings, most common first
 */
export async function getUsageOptions() {
  usageOptionsPromise ??= (async () => {
    const counts = new Map();
    for (const packId of getPacksFor("equipment")) {
      for (const entry of await getForgeIndex(packId)) {
        if (entry.type !== "equipment") continue;
        const traits = entry.system?.traits?.value ?? [];
        if (!traits.includes("magical")) continue;
        const usage = entry.system?.usage?.value;
        if (typeof usage !== "string" || !usage) continue;
        counts.set(usage, (counts.get(usage) ?? 0) + 1);
      }
    }
    const options = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([usage]) => usage);
    return options.length ? options : [DEFAULT_USAGE];
  })();
  return usageOptionsPromise;
}

/** Match the AI's usage answer to a real harvested string (format-tolerant). */
function normalizeUsage(raw, options) {
  const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const query = norm(raw);
  if (query) {
    const hit = options.find((o) => norm(o) === query);
    if (hit) return hit;
  }
  return options.includes(DEFAULT_USAGE) ? DEFAULT_USAGE : options[0] ?? DEFAULT_USAGE;
}

/* -------------------- concept normalization -------------------- */

const clampInt = (value, min, max, fallback) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};

/**
 * Coerce a raw AI magic-item concept into a safe, well-formed shape —
 * the item-forge counterpart of normalizeConcept(). Effects whose kind has
 * no exemplar in this world, or whose fields fail validation, are dropped
 * with a console warning rather than crashing or passing garbage through.
 *
 * @param {object} raw                      parsed AI JSON
 * @param {object} args
 * @param {number} args.level               GM-chosen item level (wins over the AI's)
 * @param {string} args.rarity              GM-chosen rarity
 * @param {string[]} args.availableKinds    kinds rule-templates found exemplars for
 * @param {string[]} args.usageOptions      harvested real usage strings
 */
export function normalizeMagicItemConcept(raw, { level, rarity, availableKinds, usageOptions }) {
  const c = typeof raw === "object" && raw !== null ? raw : {};
  const clampedLevel = clampInt(level, MIN_ITEM_LEVEL, MAX_ITEM_LEVEL, 1);
  const usage = normalizeUsage(c.usage, usageOptions ?? [DEFAULT_USAGE]);
  // Only worn items are invested in PF2e; held/affixed gear never is.
  const invested = Boolean(c.invested) && usage.startsWith("worn");

  const traits = new Set((Array.isArray(c.traits) ? c.traits : []).map(slugify).filter(Boolean));
  traits.add("magical");
  if (invested) traits.add("invested");
  else traits.delete("invested");

  const rawBulk = Number(c.bulk);
  const bulk = !Number.isFinite(rawBulk) || rawBulk <= 0 ? 0
    : rawBulk < 1 ? 0.1
    : Math.min(Math.round(rawBulk), 10);

  const available = new Set(availableKinds ?? EFFECT_KINDS);
  const effects = (Array.isArray(c.effects) ? c.effects : [])
    .map((e) => normalizeEffect(e, { level: clampedLevel, available }))
    .filter(Boolean)
    .slice(0, 3);

  const resolvedRarity = RARITIES.has(rarity) ? rarity : RARITIES.has(c.rarity) ? c.rarity : "common";
  const activation = normalizeActivation(c.activation, {
    level: clampedLevel, rarity: resolvedRarity, available
  });

  return {
    name: String(c.name || "Unnamed Item").slice(0, 120),
    description: String(c.description ?? ""),
    level: clampedLevel,
    rarity: resolvedRarity,
    usage,
    traits: [...traits],
    bulk,
    invested,
    effects,
    activation
  };
}

/**
 * Validate and clamp the optional `activation` field into one of the four
 * known macro templates, or null when absent/unrecognizable. Every numeric
 * parameter is clamped to a level-appropriate benchmark and every enum is
 * whitelisted — the AI supplies only numbers and slugs, never code, so the
 * generated macro is assembled from a fixed, tested script body.
 */
function normalizeActivation(raw, { level, rarity, available }) {
  if (!raw || typeof raw !== "object") return null;
  const template = raw.template;
  if (!ACTIVATION_TEMPLATES.has(template)) {
    if (template) console.warn(`simplypf2e | itemforge: dropped activation of unknown template "${template}"`);
    return null;
  }

  let ac = raw.actionCost;
  if (typeof ac === "string" && /^[123]$/.test(ac)) ac = Number(ac);
  const actionCost = ACTION_COSTS.has(ac) ? ac : 1;

  const p = raw.params && typeof raw.params === "object" ? raw.params : {};
  let params = null;

  switch (template) {
    case "damage": {
      const saveType = SAVE_TYPES.has(p.saveType) ? p.saveType : null;
      params = {
        damageDice: normalizeDice(p.damageDice) ?? damageDiceForLevel(level),
        damageType: DAMAGE_TYPES.has(slugify(p.damageType)) ? slugify(p.damageType) : "force",
        saveType,
        dc: clampDc(p.dc, level, rarity),
        basicSave: saveType ? p.basicSave !== false : false
      };
      break;
    }
    case "heal": {
      params = { healDice: normalizeDice(p.healDice) ?? damageDiceForLevel(level) };
      break;
    }
    case "condition": {
      const conditionSlug = slugify(p.conditionSlug);
      if (!CONDITION_SLUGS.has(conditionSlug)) {
        console.warn(`simplypf2e | itemforge: dropped condition activation with unknown condition "${p.conditionSlug}"`);
        return null;
      }
      const saveType = SAVE_TYPES.has(p.saveType) ? p.saveType : null;
      const duration = typeof p.duration === "string" && p.duration.trim()
        ? p.duration.trim().slice(0, 40) : null;
      params = {
        conditionSlug,
        value: VALUED_CONDITIONS.has(conditionSlug) ? clampInt(p.value, 1, 6, 1) : null,
        duration,
        saveType,
        dc: saveType ? clampDc(p.dc, level, rarity) : null,
        basicSave: saveType ? Boolean(p.basicSave) : false
      };
      break;
    }
    case "selfBuff": {
      const rounds = Number(p.durationRounds) > 0 ? clampInt(p.durationRounds, 1, 100, null) : null;
      const minutes = !rounds && Number(p.durationMinutes) > 0 ? clampInt(p.durationMinutes, 1, 600, null) : null;
      const ruleEffectKinds = (Array.isArray(p.ruleEffectKinds) ? p.ruleEffectKinds : [])
        .map((e) => normalizeEffect(e, { level, available }))
        .filter(Boolean)
        .slice(0, 3);
      // These two are AI free text concatenated into the macro's chat/effect
      // HTML — escape here at build time, same esc() pattern as elsewhere.
      const esc = (text) => (foundry.utils.escapeHTML ? foundry.utils.escapeHTML(text) : text);
      params = {
        effectName: esc(String(p.effectName || "Magic Effect").slice(0, 80)),
        description: esc(String(p.description ?? "").slice(0, 600)),
        durationRounds: rounds,
        durationMinutes: minutes,
        ruleEffectKinds
      };
      break;
    }
  }

  return { template, actionCost, params };
}

/** Validate and clamp one effect; null drops it (with a warning). */
function normalizeEffect(e, { level, available }) {
  const kind = e?.kind;
  if (!available.has(kind)) {
    if (kind) console.warn(`simplypf2e | itemforge: dropped effect of unavailable kind "${kind}"`);
    return null;
  }
  // Resistance/weakness magnitudes follow the GM Core Resistances &
  // Weaknesses benchmarks for the item's level (same table creatures use).
  const maxRW = Math.max(lookup(RESISTANCE, level, "maximum", ["minimum"]) ?? 1, 1);
  switch (kind) {
    case "itemBonus": {
      const statistic = slugify(e.statistic);
      if (!ITEM_BONUS_STATISTICS.has(statistic)) break;
      return { kind, statistic, value: clampInt(e.value, 1, 4, 1) };
    }
    case "resistance":
    case "weakness": {
      const damageType = slugify(e.damageType);
      if (!DAMAGE_TYPES.has(damageType)) break;
      return { kind, damageType, value: clampInt(e.value, 1, maxRW, Math.ceil(maxRW / 2)) };
    }
    case "immunity": {
      const damageType = slugify(e.damageType);
      if (!DAMAGE_TYPES.has(damageType)) break;
      return { kind, damageType };
    }
    case "sense": {
      const type = slugify(e.type);
      if (!SENSE_TYPES.has(type)) break;
      const acuity = ["precise", "imprecise", "vague"].includes(e.acuity) ? e.acuity : null;
      const range = Number(e.range) > 0 ? Math.min(Math.round(Number(e.range) / 5) * 5, 120) : null;
      return { kind, type, acuity, range };
    }
    case "speed": {
      const type = slugify(e.type);
      if (!SPEED_TYPES.has(type)) break;
      return { kind, type, value: clampInt(Math.round(Number(e.value) / 5) * 5, 5, 100, 20) };
    }
  }
  console.warn(`simplypf2e | itemforge: dropped malformed "${kind}" effect`, e);
  return null;
}

/* -------------------- plain-English effect summaries -------------------- */

/** One readable line per effect ("Resistance 5 to fire"), for preview + description. */
export function describeEffect(effect) {
  switch (effect.kind) {
    case "itemBonus":
      return game.i18n.format("SIMPLYPF2E.ItemForge.EffectItemBonus", {
        value: effect.value,
        statistic: effect.statistic === "ac" ? "AC" : capitalized(effect.statistic)
      });
    case "resistance":
      return game.i18n.format("SIMPLYPF2E.ItemForge.EffectResistance", { value: effect.value, type: effect.damageType });
    case "weakness":
      return game.i18n.format("SIMPLYPF2E.ItemForge.EffectWeakness", { value: effect.value, type: effect.damageType });
    case "immunity":
      return game.i18n.format("SIMPLYPF2E.ItemForge.EffectImmunity", { type: effect.damageType });
    case "sense": {
      const parts = [capitalized(effect.type.replaceAll("-", " "))];
      if (effect.acuity) parts.push(`(${effect.acuity}${effect.range ? `, ${effect.range} ft.` : ""})`);
      else if (effect.range) parts.push(`(${effect.range} ft.)`);
      return parts.join(" ");
    }
    case "speed":
      return game.i18n.format("SIMPLYPF2E.ItemForge.EffectSpeed", {
        type: capitalized(effect.type), value: effect.value
      });
    default:
      return effect.kind;
  }
}

/* Plain-English action-cost labels for an activation summary. */
const ACTION_COST_LABEL = {
  1: "1 action", 2: "2 actions", 3: "3 actions",
  reaction: "reaction", free: "free action"
};

/**
 * One readable "Activate (2 actions) — deal 4d6 fire damage, DC 22 basic
 * Reflex save (1/day)" line, for the preview and the item description.
 * @param {object} activation  normalized activation
 * @param {object} [opts]
 * @param {boolean} [opts.charged=true]  append the "(1/day)" frequency note
 */
export function describeActivation(activation, { charged = true } = {}) {
  if (!activation) return "";
  const cost = ACTION_COST_LABEL[activation.actionCost] ?? "1 action";
  const p = activation.params ?? {};
  let summary;
  switch (activation.template) {
    case "damage": {
      const save = p.saveType ? `, DC ${p.dc} ${p.basicSave ? "basic " : ""}${p.saveType} save` : "";
      summary = `deal ${p.damageDice} ${p.damageType} damage${save}`;
      break;
    }
    case "heal":
      summary = `restore ${p.healDice} Hit Points`;
      break;
    case "condition": {
      const val = p.value ? ` ${p.value}` : "";
      const dur = p.duration ? ` for ${p.duration}` : "";
      const save = p.saveType && p.dc ? ` (DC ${p.dc} ${p.basicSave ? "basic " : ""}${p.saveType} negates)` : "";
      summary = `inflict ${p.conditionSlug}${val}${dur}${save}`;
      break;
    }
    case "selfBuff": {
      const dur = p.durationRounds ? ` for ${p.durationRounds} round${p.durationRounds === 1 ? "" : "s"}`
        : p.durationMinutes ? ` for ${p.durationMinutes} minute${p.durationMinutes === 1 ? "" : "s"}`
        : "";
      summary = `gain ${p.effectName}${dur}`;
      break;
    }
    default:
      summary = activation.template;
  }
  const freq = charged ? " (1/day)" : "";
  return `${game.i18n.localize("SIMPLYPF2E.ItemForge.Activate")} (${cost}) — ${summary}${freq}`;
}

/* -------------------- rule cloning & item assembly -------------------- */

/**
 * Clone a real published Rule Element for every effect in `effects` and
 * parameterize it (value/selector/damage-type only). Shared by both the
 * passive item assembly below and the selfBuff activation macro, so the
 * Phase 1 "clone, never hand-author" guarantee holds for activated buffs too.
 * @returns {Promise<{rules: object[], applied: object[]}>}
 */
export async function cloneRulesForEffects(effects) {
  const rules = [];
  const applied = [];
  for (const effect of effects ?? []) {
    try {
      const exemplar = await findRuleExemplar(effect.kind);
      if (!exemplar) {
        console.warn(`simplypf2e | itemforge: no exemplar for "${effect.kind}" — effect skipped`);
        continue;
      }
      rules.push(parameterizeRule(structuredClone(exemplar.rule), effect));
      applied.push(effect);
      console.debug(
        `simplypf2e | itemforge: "${effect.kind}" rule cloned from "${exemplar.sourceName}" (${exemplar.sourceUuid})`
      );
    } catch (err) {
      console.warn(`simplypf2e | itemforge: failed to build "${effect.kind}" effect — skipped`, err);
    }
  }
  return { rules, applied };
}

/**
 * Parameterize a cloned exemplar rule with the concept's effect. ONLY the
 * fields verified by the exemplar filter are touched, with values of the
 * same primitive type the real rule carried — the structure is otherwise
 * exactly the published item's.
 */
function parameterizeRule(rule, effect) {
  switch (effect.kind) {
    case "itemBonus":
      rule.selector = effect.statistic;
      rule.value = effect.value;
      break;
    case "resistance":
    case "weakness":
      rule.type = effect.damageType;
      rule.value = effect.value;
      break;
    case "immunity":
      rule.type = effect.damageType;
      break;
    case "sense":
      rule.selector = effect.type;
      if (effect.acuity) rule.acuity = effect.acuity;
      else delete rule.acuity;
      if (effect.range) rule.range = effect.range;
      else delete rule.range;
      break;
    case "speed":
      rule.selector = effect.type;
      rule.value = effect.value;
      break;
  }
  return rule;
}

/**
 * Assemble the Foundry item data for a normalized magic-item concept:
 * type "equipment" (the generic wondrous-item type), priced from the
 * empirical level benchmark, with `system.rules` built exclusively from
 * cloned real exemplars. A missing exemplar or a failed clone skips that
 * one effect with a warning — one bad effect never sinks the item.
 * @returns {Promise<object>} plain item data ready for Item.create()
 */
export async function buildMagicItemData(concept) {
  const { rules, applied } = await cloneRulesForEffects(concept.effects);

  const esc = (text) => (foundry.utils.escapeHTML ? foundry.utils.escapeHTML(text) : text);
  const paragraphs = String(concept.description ?? "")
    .split(/\n{2,}/).map((p) => esc(p.trim())).filter(Boolean);
  const descriptionParts = paragraphs.map((p) => `<p>${p}</p>`);
  if (applied.length) {
    // Plain-English mechanical summary so the GM can read what the item
    // does without opening the rules tab.
    descriptionParts.push(
      `<hr /><p><strong>${game.i18n.localize("SIMPLYPF2E.ItemForge.EffectsHeading")}</strong> ${applied.map(describeEffect).join("; ")}.</p>`
    );
  }

  const system = {
    level: { value: concept.level },
    description: { value: descriptionParts.join("\n") },
    traits: { value: concept.traits, rarity: concept.rarity },
    usage: { value: concept.usage },
    bulk: { value: concept.bulk },
    price: { value: { gp: await priceForLevel(concept.level, concept.rarity) } },
    rules
  };

  const data = {
    name: capitalized(concept.name),
    type: "equipment",
    img: "icons/svg/item-bag.svg",
    system
  };

  // An activated item carries: a per-copy forgeId (so its companion macro
  // finds THIS actor's copy for charge-tracking), a 1/day charge counter the
  // macro decrements, and a plain-English activation summary in the
  // description. The clickable @UUID[Macro.…]{Activate} link is appended
  // after the macro is created (see macro-templates.createActivationMacro).
  if (concept.activation) {
    descriptionParts.push(
      `<hr /><p><strong>${game.i18n.localize("SIMPLYPF2E.ItemForge.ActivationHeading")}</strong> ${describeActivation(concept.activation)}.</p>`
    );
    system.description.value = descriptionParts.join("\n");
    // Best-effort native frequency (for the sheet's own display); the
    // authoritative per-copy counter lives in the module flag below, which
    // the macro reads and decrements.
    system.frequency = { max: 1, per: "day", value: 1 };
    data.flags = {
      simplypf2e: {
        forge: {
          forgeId: foundry.utils.randomID(),
          template: concept.activation.template,
          uses: { value: 1, max: 1, per: "day" }
        }
      }
    };
  }

  return data;
}
