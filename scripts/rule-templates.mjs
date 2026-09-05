/**
 * Rule Element exemplars harvested from REAL compendium items.
 *
 * SAFETY PRINCIPLE (the reason this file exists): Rule Element JSON is never
 * hand-authored from memory of the PF2e schema. Foundry fails SILENTLY when
 * an RE has a wrong key or field name — the effect just doesn't work and
 * nobody notices. Instead, this module scans the world's actually-installed
 * Item compendiums for published items whose `system.rules` already carry
 * each kind of RE the item forge needs, and hands back a working exemplar
 * to be cloned. The forge's level-filtered catalog preserves each complete
 * rule unchanged. Ground truth from real compendium data beats recalled
 * schema — the same grounding principle as the spell/equipment candidate
 * passes in compendium.mjs.
 *
 * If a kind has no real exemplar in this world's packs, that kind is simply
 * unavailable (a console warning is logged and the concept generator never
 * offers it). There is deliberately NO hand-authored fallback.
 */

import { getPacksFor, priceToGp, RARITY_RANK } from "./compendium.mjs";

// The catalog and its consumer share one supported-target boundary. These
// are also re-exported by item-builder for activation and existing callers.
export const DAMAGE_TYPES = new Set([
  "acid", "bludgeoning", "cold", "electricity", "fire", "force", "mental",
  "piercing", "poison", "slashing", "sonic", "spirit", "vitality", "void", "bleed"
]);
export const ITEM_BONUS_STATISTICS = new Set([
  "ac", "perception", "fortitude", "reflex", "will",
  "acrobatics", "arcana", "athletics", "crafting", "deception", "diplomacy",
  "intimidation", "medicine", "nature", "occultism", "performance", "religion",
  "society", "stealth", "survival", "thievery"
]);
export const SENSE_TYPES = new Set([
  "darkvision", "greater-darkvision", "low-light-vision", "scent", "tremorsense",
  "echolocation", "see-invisibility", "truesight", "lifesense", "wavesense"
]);
export const SPEED_TYPES = new Set(["fly", "swim", "climb", "burrow"]);

/**
 * What each effect kind searches for. `key` is the RE key to match and
 * `allowed` is an exact-shape whitelist: an exemplar rule may contain ONLY
 * these fields, which guarantees the clone carries no baggage from its
 * source item (predicates, labels, alteration modes, aura machinery, ...).
 * `matches` further requires the mechanical fields to hold plain values
 * — e.g. Weakness rules on some published items
 * carry an ARRAY of types, and BaseSpeed values are often roll formulas;
 * those shapes are skipped so the forge can compare concrete magnitudes.
 *
 * The field names below are search FILTERS, not authored output: if any of
 * them were wrong, the scan would simply find no exemplar and the kind
 * would be dropped — it can never produce a malformed Rule Element.
 */
const KIND_SPECS = {
  itemBonus: {
    key: "FlatModifier",
    allowed: ["key", "selector", "type", "value"],
    matches: (r) => r.type === "item" && typeof r.selector === "string" && typeof r.value === "number"
  },
  resistance: {
    key: "Resistance",
    allowed: ["key", "type", "value"],
    matches: (r) => typeof r.type === "string" && typeof r.value === "number"
  },
  weakness: {
    key: "Weakness",
    allowed: ["key", "type", "value"],
    matches: (r) => typeof r.type === "string" && typeof r.value === "number"
  },
  immunity: {
    key: "Immunity",
    allowed: ["key", "type"],
    matches: (r) => typeof r.type === "string"
  },
  sense: {
    key: "Sense",
    // acuity and range are optional on published Sense rules; allowing them
    // means the scan can find a "complete" exemplar that already carries
    // both, so parameterizing acuity/range copies a real shape too.
    allowed: ["key", "selector", "acuity", "range"],
    matches: (r) => typeof r.selector === "string"
  },
  speed: {
    key: "BaseSpeed",
    allowed: ["key", "selector", "value"],
    matches: (r) => typeof r.selector === "string" && typeof r.value === "number"
  },
  // PC focus pool max (character/document.ts zeroes system.resources.focus.max
  // every data-prep pass and rebuilds it ONLY from ActiveEffectLike rules on
  // embedded items — plain actor data is silently discarded). The numeric-value
  // match excludes the predicated variants some subclass features carry; the
  // clean unconditional shape (e.g. Clarity of Focus) is the one to clone.
  focusPool: {
    key: "ActiveEffectLike",
    allowed: ["key", "mode", "path", "priority", "value"],
    matches: (r) => r.mode === "add" && r.path === "system.resources.focus.max" && typeof r.value === "number"
  }
};

/** Every kind the exemplar scan resolves. */
const ALL_KINDS = Object.keys(KIND_SPECS);

/**
 * Kinds offered to the ITEM FORGE's AI schema. focusPool is deliberately
 * excluded: it's a character-builder exemplar (PC focus pool max), not a
 * wondrous-item effect kind.
 */
export const EFFECT_KINDS = ALL_KINDS.filter((k) => k !== "focusPool");

/** Does `rule` qualify as an exemplar for `kind`? */
function ruleMatchesKind(rule, kind) {
  const spec = KIND_SPECS[kind];
  if (!rule || typeof rule !== "object" || rule.key !== spec.key) return false;
  if (!Object.keys(rule).every((k) => spec.allowed.includes(k))) return false;
  return spec.matches(rule);
}

/** An exemplar carrying every allowed field can't be improved on — stop looking. */
function isComplete(rule, kind) {
  return KIND_SPECS[kind].allowed.every((k) => k in rule);
}

/* -------------------- pack scanning -------------------- */

/* packId -> [{name, uuid, rules}] for entries that carry any rules. */
const rulesEntryCache = new Map();

const ruleRecord = (entry, packId) => ({
  name: entry.name,
  uuid: entry.uuid ?? `Compendium.${packId}.Item.${entry._id}`,
  type: entry.type,
  level: entry.system?.level?.value,
  traits: entry.system?.traits?.value,
  rarity: entry.system?.traits?.rarity,
  description: entry.system?.description?.value,
  usage: entry.system?.usage?.value,
  price: entry.system?.price?.value,
  rules: entry.system.rules
});

/**
 * All entries of an Item pack that carry a non-empty `system.rules`, as
 * lightweight {name, uuid, rules} records. Rule data is not in the default
 * compendium index, so a custom-field index is requested; if the index
 * comes back without rules data entirely (defensive — some pack sources
 * may not serve nested fields), the full documents are loaded instead.
 * Cached per pack for the session: the same exemplars are reused across
 * many generations.
 */
async function getRulesEntries(packId) {
  if (rulesEntryCache.has(packId)) return rulesEntryCache.get(packId);
  const pack = game.packs.get(packId);
  if (!pack || pack.metadata.type !== "Item") {
    rulesEntryCache.set(packId, []);
    return [];
  }
  let records = [];
  try {
    const index = await pack.getIndex({ fields: [
      "system.rules", "system.level.value", "system.traits.value", "system.traits.rarity",
      "system.description.value", "system.usage.value", "system.price.value"
    ] });
    const entries = [...index];
    const indexHasRules = entries.some((e) => Array.isArray(e.system?.rules));
    if (indexHasRules) {
      records = entries
        .filter((e) => Array.isArray(e.system?.rules) && e.system.rules.length)
        .map((e) => ruleRecord(e, packId));
    } else if (entries.length) {
      // Index carried no rules data at all — fall back to full documents.
      const docs = await pack.getDocuments();
      records = docs
        .filter((d) => Array.isArray(d.system?.rules) && d.system.rules.length)
        .map((d) => ruleRecord(d, packId));
    }
  } catch (err) {
    console.warn(`simplypf2e | itemforge: failed to scan pack "${packId}" for rule exemplars`, err);
  }
  rulesEntryCache.set(packId, records);
  return records;
}

/**
 * Exact equipment effects within level/rarity limits, excluding sources with
 * unsupported access conditions. This conservative filter is not a complete
 * rules-text eligibility parser or proof of a custom combination's balance.
 * PC focus-pool discovery keeps using the broader exemplar scan below.
 */
export async function getForgeEffectCatalog(level, rarity = "common") {
  const catalog = [];
  const seen = new Set();
  for (const packId of getPacksFor("equipment")) {
    for (const entry of await getRulesEntries(packId)) {
      if (!eligibleForgeSource(entry, level, rarity)) continue;
      for (const rule of entry.rules) {
        const kind = EFFECT_KINDS.find((candidate) => ruleMatchesKind(rule, candidate) && supportedForgeTarget(rule, candidate));
        if (!kind) continue;
        if ("value" in rule && (!Number.isFinite(rule.value) || rule.value <= 0)) continue;
        if (kind === "sense" && "range" in rule && (!Number.isFinite(rule.range) || rule.range <= 0)) continue;
        const requiresInvestment = entry.traits.includes("invested");
        const key = `${kind}:${requiresInvestment}:${JSON.stringify(rule)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const effect = kind === "itemBonus" ? { statistic: rule.selector, value: rule.value }
          : ["resistance", "weakness", "immunity"].includes(kind)
            ? { damageType: rule.type, ...(kind === "immunity" ? {} : { value: rule.value }) }
            : kind === "sense" ? { type: rule.selector, acuity: rule.acuity ?? null, range: rule.range ?? null }
              : { type: rule.selector, value: rule.value };
        catalog.push({
          kind, ...effect,
          exemplar: {
            rule: structuredClone(rule), sourceName: entry.name, sourceUuid: entry.uuid,
            sourceLevel: entry.level, sourceRarity: entry.rarity, requiresInvestment
          }
        });
      }
    }
  }
  return catalog;
}

const EXCLUDED_FORGE_TRAITS = new Set(["artifact", "mythic", "cursed", "intelligent"]);

function eligibleForgeSource(entry, level, rarity) {
  if (entry.type !== "equipment" || !Number.isFinite(entry.level) || entry.level < 0 || entry.level > level) return false;
  if (!Object.hasOwn(RARITY_RANK, entry.rarity) || RARITY_RANK[entry.rarity] > (RARITY_RANK[rarity] ?? 0)) return false;
  if (!Array.isArray(entry.traits) || entry.traits.some((trait) => EXCLUDED_FORGE_TRAITS.has(trait))) return false;
  if (typeof entry.usage !== "string" || !entry.usage) return false;
  if (entry.traits.includes("invested") && !entry.usage.startsWith("worn")) return false;
  if (!(priceToGp(entry.price) > 0) || typeof entry.description !== "string" || !entry.description.trim()) return false;
  const text = entry.description.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ");
  // Published sources use headings such as Prerequisite, Craft Requirements,
  // and Access. Reject the whole source rather than detach a simple RE from
  // those conditions. Unpriced gifts are also excluded by the price gate.
  if (/\b(?:prerequisites?|requirements?|access)\b/i.test(text)) return false;
  if (/\b(?:granted|given|bestowed) by\b/i.test(text)) return false;
  if (/\b(?:gift[- ]only|only (?:as a |a )?gift|(?:cannot|can't) be (?:bought|purchased|crafted))\b/i.test(text)) return false;
  if (/\b(?:given|granted|bestowed|received)\b[^.!?]{0,100}\bonly\b|\bonly\b[^.!?]{0,100}\b(?:given|granted|bestowed|received)\b/i.test(text)) return false;
  return true;
}

function supportedForgeTarget(rule, kind) {
  if (kind === "itemBonus") return ITEM_BONUS_STATISTICS.has(rule.selector);
  if (["resistance", "weakness", "immunity"].includes(kind)) return DAMAGE_TYPES.has(rule.type);
  if (kind === "sense") return SENSE_TYPES.has(rule.selector)
    && (rule.acuity === undefined || ["precise", "imprecise", "vague"].includes(rule.acuity));
  return kind === "speed" && SPEED_TYPES.has(rule.selector);
}

/**
 * Packs to scan, in preference order: the configured equipment packs first
 * (magic items are the best source of item-flavored REs), then feats and
 * bestiary abilities, then every other Item pack in the world.
 */
function scanPackOrder() {
  const ordered = [
    ...getPacksFor("equipment"),
    ...getPacksFor("feats"),
    ...getPacksFor("abilities")
  ];
  const seen = new Set(ordered);
  for (const pack of game.packs) {
    if (pack.metadata.type !== "Item") continue;
    if (!seen.has(pack.collection)) ordered.push(pack.collection);
  }
  return ordered;
}

/* Resolved once per session: { [kind]: {rule, sourceName, sourceUuid} | null } */
let exemplarPromise = null;

/**
 * Find one real, published exemplar rule for every effect kind, scanning
 * packs until each kind has a "complete" exemplar (every allowed field
 * present) or the packs run out. A partial match (e.g. a Sense rule with
 * no acuity/range) is kept but can be upgraded by a later, more complete
 * one. Kinds with no exemplar at all resolve to null and are logged.
 *
 * @returns {Promise<Record<string, {rule: object, sourceName: string, sourceUuid: string}|null>>}
 */
export async function findRuleExemplars() {
  exemplarPromise ??= (async () => {
    const found = Object.fromEntries(ALL_KINDS.map((k) => [k, null]));
    const incomplete = () => ALL_KINDS.filter((k) => !found[k] || !isComplete(found[k].rule, k));
    for (const packId of scanPackOrder()) {
      if (!incomplete().length) break;
      const entries = await getRulesEntries(packId);
      for (const entry of entries) {
        const open = incomplete();
        if (!open.length) break;
        for (const rule of entry.rules) {
          for (const kind of open) {
            if (!ruleMatchesKind(rule, kind)) continue;
            // Keep the first match; upgrade only to a more complete shape.
            if (found[kind] && Object.keys(rule).length <= Object.keys(found[kind].rule).length) continue;
            found[kind] = {
              rule: structuredClone(rule),
              sourceName: entry.name,
              sourceUuid: entry.uuid
            };
          }
        }
      }
    }
    for (const kind of ALL_KINDS) {
      if (found[kind]) {
        console.debug(
          `simplypf2e | itemforge: "${kind}" rule exemplar from "${found[kind].sourceName}" (${found[kind].sourceUuid})`
        );
      } else {
        console.warn(
          `simplypf2e | itemforge: no real ${KIND_SPECS[kind].key} rule exemplar found in any installed compendium — the "${kind}" effect kind is unavailable in this world`
        );
      }
    }
    return found;
  })();
  return exemplarPromise;
}

/**
 * The exemplar for one effect kind, or null when this world's compendiums
 * hold no real example of it.
 * @returns {Promise<{rule: object, sourceName: string, sourceUuid: string}|null>}
 */
export async function findRuleExemplar(kind) {
  const exemplars = await findRuleExemplars();
  return exemplars[kind] ?? null;
}

/** Effect kinds that actually have a real exemplar in this world. */
export async function availableEffectKinds() {
  const exemplars = await findRuleExemplars();
  return EFFECT_KINDS.filter((kind) => exemplars[kind]);
}
