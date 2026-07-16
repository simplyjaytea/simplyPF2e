/**
 * Rule Element exemplars harvested from REAL compendium items.
 *
 * SAFETY PRINCIPLE (the reason this file exists): Rule Element JSON is never
 * hand-authored from memory of the PF2e schema. Foundry fails SILENTLY when
 * an RE has a wrong key or field name — the effect just doesn't work and
 * nobody notices. Instead, this module scans the world's actually-installed
 * Item compendiums for published items whose `system.rules` already carry
 * each kind of RE the item forge needs, and hands back a working exemplar
 * to be cloned and parameterized (substituting only the value / selector /
 * damage type). Ground truth from real compendium data beats recalled
 * schema — the same grounding principle as the spell/equipment candidate
 * passes in compendium.mjs.
 *
 * If a kind has no real exemplar in this world's packs, that kind is simply
 * unavailable (a console warning is logged and the concept generator never
 * offers it). There is deliberately NO hand-authored fallback.
 */

import { getPacksFor } from "./compendium.mjs";

/**
 * What each effect kind searches for. `key` is the RE key to match and
 * `allowed` is an exact-shape whitelist: an exemplar rule may contain ONLY
 * these fields, which guarantees the clone carries no baggage from its
 * source item (predicates, labels, alteration modes, aura machinery, ...).
 * `matches` further requires the parameterized fields to hold plain values
 * of the type we substitute — e.g. Weakness rules on some published items
 * carry an ARRAY of types, and BaseSpeed values are often roll formulas;
 * those shapes are skipped so substitution stays strictly like-for-like.
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
    const index = await pack.getIndex({ fields: ["system.rules"] });
    const entries = [...index];
    const indexHasRules = entries.some((e) => Array.isArray(e.system?.rules));
    if (indexHasRules) {
      records = entries
        .filter((e) => Array.isArray(e.system?.rules) && e.system.rules.length)
        .map((e) => ({
          name: e.name,
          uuid: e.uuid ?? `Compendium.${packId}.Item.${e._id}`,
          rules: e.system.rules
        }));
    } else if (entries.length) {
      // Index carried no rules data at all — fall back to full documents.
      const docs = await pack.getDocuments();
      records = docs
        .filter((d) => Array.isArray(d.system?.rules) && d.system.rules.length)
        .map((d) => ({ name: d.name, uuid: d.uuid, rules: d.system.rules }));
    }
  } catch (err) {
    console.warn(`simplypf2e | itemforge: failed to scan pack "${packId}" for rule exemplars`, err);
  }
  rulesEntryCache.set(packId, records);
  return records;
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
