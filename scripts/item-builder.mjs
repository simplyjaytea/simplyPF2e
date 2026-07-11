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

import { getPacksFor, EQUIPMENT_TYPES } from "./compendium.mjs";
import { priceToGp, slugify, capitalized } from "./builder.mjs";
import { RARITY_TREASURE_MULTIPLIER, RESISTANCE, MAX_LEVEL, lookup } from "./tables.mjs";
import { findRuleExemplar, EFFECT_KINDS } from "./rule-templates.mjs";

const RARITIES = new Set(["common", "uncommon", "rare", "unique"]);

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

  return {
    name: String(c.name || "Unnamed Item").slice(0, 120),
    description: String(c.description ?? ""),
    level: clampedLevel,
    rarity: RARITIES.has(rarity) ? rarity : RARITIES.has(c.rarity) ? c.rarity : "common",
    usage,
    traits: [...traits],
    bulk,
    invested,
    effects
  };
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

/* -------------------- rule cloning & item assembly -------------------- */

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
  const rules = [];
  const applied = [];
  for (const effect of concept.effects ?? []) {
    try {
      const exemplar = await findRuleExemplar(effect.kind);
      if (!exemplar) {
        console.warn(`simplypf2e | itemforge: no exemplar for "${effect.kind}" — effect skipped`);
        continue;
      }
      // Clone the real rule, substitute only the concept's parameters.
      rules.push(parameterizeRule(structuredClone(exemplar.rule), effect));
      applied.push(effect);
      console.debug(
        `simplypf2e | itemforge: "${effect.kind}" rule cloned from "${exemplar.sourceName}" (${exemplar.sourceUuid})`
      );
    } catch (err) {
      console.warn(`simplypf2e | itemforge: failed to build "${effect.kind}" effect — skipped`, err);
    }
  }

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

  return {
    name: capitalized(concept.name),
    type: "equipment",
    img: "icons/svg/item-bag.svg",
    system: {
      level: { value: concept.level },
      description: { value: descriptionParts.join("\n") },
      traits: { value: concept.traits, rarity: concept.rarity },
      usage: { value: concept.usage },
      bulk: { value: concept.bulk },
      price: { value: { gp: await priceForLevel(concept.level, concept.rarity) } },
      rules
    }
  };
}
