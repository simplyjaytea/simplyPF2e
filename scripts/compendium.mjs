/**
 * Fuzzy lookups against compendium packs so the AI can reference abilities,
 * spells, feats and equipment by name and we pull the real documents. Which
 * packs each category draws from is configurable (Compendium Sources menu);
 * the PF2e system packs are the defaults.
 */

import { SETTINGS, getSetting } from "./settings.mjs";
import { slugify } from "./text.mjs";

export const CATEGORIES = [
  "abilities", "spells", "feats", "equipment", "ancestries", "backgrounds", "classes", "heritages", "bestiaryActors"
];

export const DEFAULT_PACKS = {
  // PF2e 8 removed the `-srd` suffix from the family glossary collection.
  // Keep both identifiers so the supported PF2e 6+ range selects whichever
  // version its installed system exposes.
  abilities: [
    "pf2e.bestiary-ability-glossary-srd",
    "pf2e.bestiary-family-ability-glossary",
    "pf2e.bestiary-family-ability-glossary-srd"
  ],
  spells: ["pf2e.spells-srd"],
  equipment: ["pf2e.equipment-srd"],
  feats: ["pf2e.feats-srd"],
  ancestries: ["pf2e.ancestries"],
  backgrounds: ["pf2e.backgrounds"],
  classes: ["pf2e.classes"],
  heritages: ["pf2e.heritages"],
  bestiaryActors: ["pf2e.pathfinder-monster-core", "pf2e.pathfinder-bestiary"]
};

export const EQUIPMENT_TYPES = new Set([
  "weapon", "armor", "equipment", "consumable", "treasure", "backpack", "shield", "kit"
]);

/**
 * Convert a PF2e price-value denomination object ({pp, gp, sp, cp}, any
 * subset present) into a single gp number.
 */
export function priceToGp(price) {
  if (!price || typeof price !== "object") return 0;
  return (Number(price.pp) || 0) * 10
    + (Number(price.gp) || 0)
    + (Number(price.sp) || 0) / 10
    + (Number(price.cp) || 0) / 100;
}

/* Ordered common < uncommon < rare < unique. Single source of truth for every
   rarity comparison in the module (the GM's rarity cap, the item forge's
   base-item-vs-requested-rarity pick). */
export const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, unique: 3 };

/**
 * Pack ids a category draws from: the GM's Compendium Sources selection, or
 * the system defaults when the category is unset/empty. Missing packs (e.g.
 * from an uninstalled module) are warned and dropped; if that empties the
 * whole category, falls back to the (filtered) system defaults instead of
 * silently starving downstream pipelines (spell/equipment candidates, etc.)
 * with an empty list.
 */
export function getPacksFor(category) {
  const stored = getSetting(SETTINGS.sourcePacks) ?? {};
  const configured = Array.isArray(stored[category]) && stored[category].length;
  const ids = configured ? stored[category] : DEFAULT_PACKS[category];
  if (configured) {
    for (const id of ids) {
      if (!game.packs.get(id)) console.warn(`simplypf2e | configured ${category} pack "${id}" is not available (uninstalled/disabled?) — skipping`);
    }
  }
  const packs = ids.filter((id) => game.packs.get(id));
  if (packs.length || !DEFAULT_PACKS[category]) return packs;
  console.warn(`simplypf2e | no configured ${category} packs are available, falling back to system defaults`);
  return DEFAULT_PACKS[category].filter((id) => game.packs.get(id));
}

/** Report the enabled packs required before a generation may spend tokens. */
export function sourceReadiness(mode, { allowSpellcasting = true } = {}) {
  const character = mode === "character";
  const required = character
    ? ["ancestries", "backgrounds", "classes", "feats", "equipment", "spells"]
    : ["feats", "equipment", "spells"];
  const categories = required.map((category) => ({ category, packs: getPacksFor(category) }));
  const missing = categories.filter(({ packs }) => !packs.length).map(({ category }) => category);
  return { categories, missing, packCount: categories.reduce((count, item) => count + item.packs.length, 0), ready: missing.length === 0 };
}

/**
 * Every pack that can serve `category`: the configured/default packs UNION all
 * installed Item packs auto-detected to contain that type. Fixes ABC lookups
 * failing when a legit AI pick lives in a Lost Omens / add-on compendium the
 * hardcoded DEFAULT_PACKS list doesn't name (issue #51). Reuses the cached
 * detectAvailablePacks() scan (same runtime-discovery pattern as the item
 * forge's equipment-pack scan), so it does not rescan per lookup.
 */
export async function getAllPacksFor(category) {
  const configured = getPacksFor(category);
  const detected = (await detectAvailablePacks())[category]?.map((p) => p.id) ?? [];
  return [...new Set([...configured, ...detected])];
}

let detectedPacks = null;

/**
 * Scan every Item compendium in the world and report which packs can serve
 * each category, based on the item types they actually contain.
 * @returns {Promise<Record<string, {id: string, title: string, package: string}[]>>}
 */
export async function detectAvailablePacks() {
  if (detectedPacks) return detectedPacks;
  const result = {
    abilities: [], spells: [], feats: [], equipment: [],
    ancestries: [], backgrounds: [], classes: [], heritages: [], bestiaryActors: []
  };
  for (const pack of game.packs) {
    if (pack.metadata.type === "Actor") {
      const entries = await getIndex(pack.collection);
      if (entries?.some((entry) => entry.type === "npc")) {
        result.bestiaryActors.push({ id: pack.collection, title: pack.title ?? pack.metadata.label, package: pack.metadata.packageName });
      }
      continue;
    }
    if (pack.metadata.type !== "Item") continue;
    const entries = await getIndex(pack.collection);
    if (!entries?.length) continue;
    const types = new Set(entries.map((e) => e.type));
    const info = { id: pack.collection, title: pack.title ?? pack.metadata.label, package: pack.metadata.packageName };
    if (types.has("action")) result.abilities.push(info);
    if (types.has("spell")) result.spells.push(info);
    if (types.has("feat")) result.feats.push(info);
    if ([...types].some((t) => EQUIPMENT_TYPES.has(t))) result.equipment.push(info);
    if (types.has("ancestry")) result.ancestries.push(info);
    if (types.has("background")) result.backgrounds.push(info);
    if (types.has("class")) result.classes.push(info);
    if (types.has("heritage")) result.heritages.push(info);
  }
  for (const list of Object.values(result)) list.sort((a, b) => a.title.localeCompare(b.title));
  detectedPacks = result;
  return result;
}

const indexCache = new Map();

function normalize(name) {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function getIndex(packId) {
  if (indexCache.has(packId)) return indexCache.get(packId);
  const pack = game.packs.get(packId);
  if (!pack) {
    indexCache.set(packId, null);
    return null;
  }
  const index = await pack.getIndex({
    fields: [
      "name", "type", "system.slug", "system.level.value",
      "system.traits.value", "system.traits.traditions", "system.ritual",
      "system.category", "system.traits.rarity"
    ]
  });
  const entries = index.map((e) => ({ ...e, packId, normalized: normalize(e.name) }));
  indexCache.set(packId, entries);
  return entries;
}

/* packId -> index entries carrying the extra fields the equipment-heavy
   callers need (price/usage), which the shared index above doesn't request. */
const equipmentIndexCache = new Map();

/**
 * Equipment-pack index extended with level, price, usage and traits — used by
 * the rune helpers (runes.mjs) and the item forge's empirical pricing, both of
 * which need real prices and `usage` strings the default index omits.
 * @returns {Promise<object[]>} index entries, or [] when the pack is missing
 */
export async function getEquipmentIndex(packId) {
  if (equipmentIndexCache.has(packId)) return equipmentIndexCache.get(packId);
  const pack = game.packs.get(packId);
  if (!pack) {
    equipmentIndexCache.set(packId, []);
    return [];
  }
  let entries = [];
  try {
    const index = await pack.getIndex({
      fields: ["name", "type", "system.level.value", "system.price.value", "system.usage.value", "system.traits.value", "system.category"]
    });
    entries = [...index];
  } catch (err) {
    console.warn(`simplypf2e | failed to index equipment pack "${packId}"`, err);
  }
  equipmentIndexCache.set(packId, entries);
  return entries;
}

/**
 * Every equipment-pack entry, deduped by name, as lightweight records. One
 * scan serves rune lookups, base-item candidates and price sampling alike.
 * @returns {Promise<{name: string, type: string, level: number, gp: number, usage: string|null, category: string|null}[]>}
 */
let equipmentEntriesPromise = null;
export function getAllEquipmentEntries() {
  equipmentEntriesPromise ??= (async () => {
    const entries = [];
    const seen = new Set();
    for (const packId of getPacksFor("equipment")) {
      for (const entry of await getEquipmentIndex(packId)) {
        const key = slugify(entry.name);
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({
          name: entry.name,
          type: entry.type,
          level: entry.system?.level?.value ?? 0,
          gp: priceToGp(entry.system?.price?.value),
          usage: entry.system?.usage?.value ?? null,
          category: entry.system?.category ?? null
        });
      }
    }
    return entries;
  })();
  return equipmentEntriesPromise;
}

/* Filler words that shouldn't block a token match ("Potion of Invisibility"
   must still find "Invisibility Potion"). */
const STOPWORDS = new Set(["of", "the", "a", "an"]);

function scoreMatch(query, candidate) {
  if (candidate === query) return 3;
  if (candidate.startsWith(query) || query.startsWith(candidate)) return 2;
  const queryTokens = query.split(" ").filter((t) => !STOPWORDS.has(t));
  const candidateTokens = new Set(candidate.split(" "));
  if (queryTokens.length && queryTokens.every((t) => candidateTokens.has(t))) return 1;
  return 0;
}

/**
 * Find the best-matching index entry for `name` across `packIds`.
 * @param {string[]} packIds
 * @param {string} name
 * @param {(entry: object) => boolean} [filter]
 * @returns {Promise<object|null>} index entry with `packId`, or null
 */
export async function findEntry(packIds, name, filter) {
  const query = normalize(name);
  if (!query) return null;
  let best = null;
  let bestScore = 0;
  for (const packId of packIds) {
    const entries = await getIndex(packId);
    if (!entries) continue;
    for (const entry of entries) {
      if (filter && !filter(entry)) continue;
      const score = scoreMatch(query, entry.normalized);
      if (score > bestScore) {
        best = entry;
        bestScore = score;
        if (score === 3) return best;
      }
    }
  }
  return best;
}

/** Fetch the full document for an index entry returned by findEntry(). */
export async function getDocument(entry) {
  if (!entry) return null;
  const pack = game.packs.get(entry.packId);
  if (!pack) return null;
  return pack.getDocument(entry._id);
}

/**
 * Stable, opaque identifier for a candidate offered to the model. The model
 * never needs a pack name or document id; those stay in this local reference.
 */
export function candidateId(entry) {
  const packId = String(entry?.packId ?? "");
  const documentId = String(entry?._id ?? "");
  return packId && documentId ? `c-${btoa(`${packId}\u0000${documentId}`).replaceAll("=", "")}` : null;
}

function candidateRecord(entry, fields = {}) {
  return {
    id: candidateId(entry),
    ref: { packId: entry.packId, _id: entry._id },
    ...fields
  };
}

/** Resolve only an exact, locally-issued candidate reference. */
export async function getCandidateDocument(candidate, packIds = null) {
  const ref = candidate?.ref;
  if (!ref?.packId || !ref?._id) return null;
  if (Array.isArray(packIds) && !packIds.includes(ref.packId)) return null;
  return getDocument(ref);
}

/* Hard ceilings for the name catalogs serialized into AI prompts. These stay
 * deliberately conservative: broad enough to offer real choices, but small
 * enough that installing another content pack cannot silently consume the
 * model's whole context window. */
export const SPELL_CANDIDATE_LIMIT = 96;
export const SPELL_CANDIDATES_PER_RANK = 12;
export const SPELL_CANDIDATE_FLOOR = 40;
export const EQUIPMENT_CANDIDATE_LIMIT = 120;
export const LOOT_CANDIDATE_LIMIT = 120;
export const EQUIPMENT_CANDIDATE_FLOOR = 48;
export const FEAT_CANDIDATE_LIMIT = 16;
export const FEAT_CANDIDATES_PER_LEVEL = 8;

const normalizedKeywords = (keywords) => [...new Set(
  (Array.isArray(keywords) ? keywords : [])
    .map((keyword) => normalize(keyword))
    .filter((keyword) => keyword && !STOPWORDS.has(keyword))
)];

/* Exact names win, then name/trait matches. This is intentionally lexical:
 * candidate generation must stay deterministic and model-free. */
function relevanceScore(candidate, keywords) {
  if (!keywords.length) return 0;
  const name = normalize(candidate.name);
  const nameTokens = new Set(name.split(" ").filter(Boolean));
  const traits = new Set(
    (Array.isArray(candidate.traits) ? candidate.traits : []).map(normalize).filter(Boolean)
  );
  let score = 0;
  for (const keyword of keywords) {
    if (name === keyword) score += 10000;
    else if (name.includes(keyword)) score += 1000;
    if (traits.has(keyword)) score += 800;
    const tokens = keyword.split(" ").filter((token) => !STOPWORDS.has(token));
    if (tokens.length && tokens.every((token) => nameTokens.has(token))) score += 400;
  }
  return score;
}

function roundRobin(buckets, limit) {
  const capped = Math.max(Math.floor(Number(limit) || 0), 0);
  if (!capped) return [];
  const offsets = buckets.map(() => 0);
  const selected = [];
  let advanced = true;
  while (selected.length < capped && advanced) {
    advanced = false;
    for (let i = 0; i < buckets.length && selected.length < capped; i++) {
      if (offsets[i] >= buckets[i].length) continue;
      selected.push(buckets[i][offsets[i]++]);
      advanced = true;
    }
  }
  return selected;
}

function withPriority(buckets, priority, limit) {
  const capped = Math.max(Math.floor(Number(limit) || 0), 0);
  const selected = priority.slice(0, capped);
  const used = new Set(selected);
  const remaining = buckets.map((bucket) => bucket.filter((candidate) => !used.has(candidate)));
  selected.push(...roundRobin(remaining, capped - selected.length));
  return selected;
}

/** Pure bounded selector used by getSpellCandidates() and its regression test. */
export function limitSpellCandidates(candidates, keywords = [], limit = SPELL_CANDIDATE_LIMIT, plannedPicks = null) {
  const list = Array.isArray(candidates) ? candidates : [];
  const kw = normalizedKeywords(keywords);
  const exactNames = new Set(kw);
  const byRank = new Map();
  for (const candidate of list) {
    const rank = Number(candidate.rank) || 0;
    if (!byRank.has(rank)) byRank.set(rank, []);
    byRank.get(rank).push(candidate);
  }
  const buckets = [...byRank.entries()]
    // Start each round at the highest rank so top-rank options survive even
    // when an unusual caller supplies a very small override limit.
    .sort(([a], [b]) => b - a)
    .map(([, entries]) => entries
      .sort((a, b) => relevanceScore(b, kw) - relevanceScore(a, kw)
        || a.name.localeCompare(b.name))
      .slice(0, SPELL_CANDIDATES_PER_RANK));
  const exact = list
    .filter((candidate) => exactNames.has(normalize(candidate.name)))
    .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name));
  const matchedCount = kw.length
    ? list.filter((candidate) => relevanceScore(candidate, kw) > 0).length
    : limit;
  // A PC needs enough distinct candidates to fill its base plan, especially
  // five cantrips. Exact first-draft names alone can starve other ranks.
  // Reserve relevant choices per rank before those names, within the same cap.
  const reserved = plannedPicks ? buckets.flatMap((bucket) => bucket.slice(0,
    Math.min(SPELL_CANDIDATES_PER_RANK, Math.max(0, Number(plannedPicks[bucket[0]?.rank]) || 0)))) : [];
  // Ordinary rank-ten repertoires require common spells. Keep enough common
  // ranked options even when rare exact-name matches occupy the top buckets.
  // Lower-base spells can legally be learned heightened; cantrips cannot.
  const commonOptions = plannedPicks?.[10] > 0 ? list
    .filter((candidate) => candidate.rarity === "common" && candidate.rank > 0 && candidate.rank <= 10)
    .sort((a, b) => relevanceScore(b, kw) - relevanceScore(a, kw)
      || b.rank - a.rank || a.name.localeCompare(b.name))
    .slice(0, Math.min(SPELL_CANDIDATES_PER_RANK, plannedPicks[10])) : [];
  const priority = [...new Set([...commonOptions, ...reserved, ...exact])];
  const target = kw.length
    ? Math.min(limit, Math.max(SPELL_CANDIDATE_FLOOR, matchedCount, new Set([...commonOptions, ...reserved]).size))
    : limit;
  return withPriority(buckets, priority, target)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}

const EQUIPMENT_LEVEL_BANDS = ["high", "mid", "low", "zero"];

function equipmentLevelBand(level, maxLevel) {
  const lv = Math.max(Number(level) || 0, 0);
  if (lv === 0) return "zero";
  if (maxLevel <= 1 || lv / maxLevel > 2 / 3) return "high";
  if (lv / maxLevel > 1 / 3) return "mid";
  return "low";
}

/** Pure bounded selector used for both carried equipment and dropped loot. */
export function limitEquipmentCandidates(candidates, keywords = [], limit = EQUIPMENT_CANDIDATE_LIMIT) {
  const list = Array.isArray(candidates) ? candidates : [];
  const kw = normalizedKeywords(keywords);
  const exactNames = new Set(kw);
  const maxLevel = list.reduce(
    (highest, candidate) => Math.max(highest, Number(candidate.level) || 0), 0
  );
  const types = [
    ...[...EQUIPMENT_TYPES].filter((type) => list.some((candidate) => candidate.type === type)),
    ...[...new Set(list.map((candidate) => candidate.type).filter(Boolean))]
      .filter((type) => !EQUIPMENT_TYPES.has(type)).sort()
  ];
  const grouped = new Map();
  for (const candidate of list) {
    const key = `${candidate.type}\u0000${equipmentLevelBand(candidate.level, maxLevel)}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(candidate);
  }
  const buckets = [];
  for (const band of EQUIPMENT_LEVEL_BANDS) {
    for (const type of types) {
      const entries = grouped.get(`${type}\u0000${band}`);
      if (!entries?.length) continue;
      buckets.push(entries.sort((a, b) => relevanceScore(b, kw) - relevanceScore(a, kw)
        || b.level - a.level || a.name.localeCompare(b.name)));
    }
  }
  const exact = list
    .filter((candidate) => exactNames.has(normalize(candidate.name)))
    .sort((a, b) => relevanceScore(b, kw) - relevanceScore(a, kw)
      || b.level - a.level || a.name.localeCompare(b.name));
  const matchedCount = kw.length
    ? list.filter((candidate) => relevanceScore(candidate, kw) > 0).length
    : limit;
  const target = kw.length
    ? Math.min(limit, Math.max(EQUIPMENT_CANDIDATE_FLOOR, matchedCount))
    : limit;
  return withPriority(buckets, exact, target)
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

function evenlySpaced(entries, limit) {
  if (entries.length <= limit) return entries;
  if (limit <= 1) return entries.slice(0, Math.max(limit, 0));
  return Array.from({ length: limit }, (_, i) =>
    entries[Math.round(i * (entries.length - 1) / (limit - 1))]);
}

/** Pure per-slot feat limiter. Balances levels and samples each alphabetic
 * level list evenly so the cap does not permanently favor A-prefixed feats. */
export function limitFeatCandidates(
  candidates, limit = FEAT_CANDIDATE_LIMIT, preferredNames = []
) {
  const list = Array.isArray(candidates) ? candidates : [];
  const preferred = new Set(normalizedKeywords(preferredNames));
  const byLevel = new Map();
  for (const candidate of list) {
    const level = Number(candidate.level) || 0;
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level).push(candidate);
  }
  const buckets = [...byLevel.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, entries]) => evenlySpaced(
      entries.sort((a, b) => a.name.localeCompare(b.name)),
      FEAT_CANDIDATES_PER_LEVEL
    ));
  const exact = list
    .filter((candidate) => preferred.has(normalize(candidate.name)))
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  return withPriority(buckets, exact, limit)
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

/**
 * List real, castable spells of a tradition up to a maximum rank, so the AI
 * can choose from the compendium instead of naming spells from memory.
 *
 * Keyword/name matches rank first. The returned list is hard-capped and
 * balanced across spell ranks; narrow matches are padded with bounded real
 * options instead of falling back to the full tradition catalog.
 * @param {string[]} [keywords]
 * @param {object} [plannedPicks] module-owned PC base plan; reserves rank candidates
 * @returns {Promise<{name: string, rank: number, traits: string[]}[]>} sorted by rank then name
 */
export async function getSpellCandidates(tradition, maxRank, keywords = [], plannedPicks = null) {
  const candidates = [];
  const seen = new Set();
  for (const packId of getPacksFor("spells")) {
    const entries = await getIndex(packId);
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.type !== "spell") continue;
      if (entry.system?.ritual) continue;
      const traditions = entry.system?.traits?.traditions ?? [];
      if (!traditions.includes(tradition)) continue;
      const traits = entry.system?.traits?.value ?? [];
      const isCantrip = traits.includes("cantrip");
      const rank = isCantrip ? 0 : (entry.system?.level?.value ?? 1);
      if (rank > maxRank) continue;
      if (seen.has(entry.normalized)) continue;
      seen.add(entry.normalized);
      candidates.push(candidateRecord(entry, { name: entry.name, rank, traits, rarity: entry.system?.traits?.rarity }));
    }
  }
  candidates.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return limitSpellCandidates(candidates, keywords, SPELL_CANDIDATE_LIMIT, plannedPicks);
}

/**
 * Bounded exact candidates for spell scrolls. Scroll legality is independent
 * of a creature's casting tradition, but it still excludes cantrips/rituals
 * and carries the published base rank for local validation.
 */
export async function getScrollSpellCandidates(maxRank = 10, keywords = []) {
  const candidates = [];
  const seen = new Set();
  for (const packId of getPacksFor("spells")) {
    const entries = await getIndex(packId);
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.type !== "spell" || entry.system?.ritual) continue;
      const traits = entry.system?.traits?.value ?? [];
      if (traits.includes("cantrip")) continue;
      const rank = entry.system?.level?.value ?? 1;
      if (rank > maxRank || seen.has(entry.normalized)) continue;
      seen.add(entry.normalized);
      candidates.push(candidateRecord(entry, { name: entry.name, rank, traits, rarity: entry.system?.traits?.rarity }));
    }
  }
  candidates.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return limitSpellCandidates(candidates, keywords, SPELL_CANDIDATE_LIMIT);
}

/**
 * Bounded exact candidates for focus spells. Focus spells deliberately do not
 * filter by tradition: published focus spells commonly carry no tradition in
 * their trait data, and their legal source is established by the class/grant
 * pipeline rather than the spell's own tradition field.
 */
export async function getFocusSpellCandidates(maxRank, keywords = []) {
  const candidates = [];
  const seen = new Set();
  for (const packId of getPacksFor("spells")) {
    const entries = await getIndex(packId);
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.type !== "spell" || entry.system?.ritual) continue;
      const traits = entry.system?.traits?.value ?? [];
      if (!traits.includes("focus")) continue;
      const rank = traits.includes("cantrip") ? 0 : (entry.system?.level?.value ?? 1);
      if (rank > maxRank || seen.has(entry.normalized)) continue;
      seen.add(entry.normalized);
      candidates.push(candidateRecord(entry, { name: entry.name, rank, traits, rarity: entry.system?.traits?.rarity }));
    }
  }
  candidates.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return limitSpellCandidates(candidates, keywords, SPELL_CANDIDATE_LIMIT);
}

/**
 * List real equipment items the creature could carry, so the AI can choose
 * from the compendium instead of naming gear from memory — the equipment
 * counterpart of getSpellCandidates().
 *
 * Treasure is excluded (coins and valuables belong only in loot). The item
 * level is capped at the creature's level, matching resolveConcept()'s
 * equipment filter exactly so every candidate offered can actually resolve.
 *
 * Keyword/name matches rank first. The returned list is hard-capped and
 * balanced across item types and low/mid/high level bands, so custom packs
 * cannot make the prompt grow without bound.
 * @param {number} level creature level
 * @param {string[]} [keywords]
 * @param {{treasure?: boolean, limit?: number}} [options] treasure inclusion and hard result cap
 * @returns {Promise<{name: string, type: string, level: number}[]>} sorted by level then name
 */
export async function getEquipmentCandidates(
  level, keywords = [], { treasure = false, limit = EQUIPMENT_CANDIDATE_LIMIT } = {}
) {
  const maxLevel = Math.max(level, 0);
  const candidates = [];
  const seen = new Set();
  for (const packId of getPacksFor("equipment")) {
    const entries = await getIndex(packId);
    if (!entries) continue;
    for (const entry of entries) {
      if (!EQUIPMENT_TYPES.has(entry.type) || (!treasure && entry.type === "treasure")) continue;
      const itemLevel = entry.system?.level?.value ?? 0;
      if (itemLevel > maxLevel) continue;
      if (seen.has(entry.normalized)) continue;
      seen.add(entry.normalized);
      candidates.push(candidateRecord(entry, {
        name: entry.name,
        type: entry.type,
        level: itemLevel,
        traits: entry.system?.traits?.value ?? []
      }));
    }
  }
  candidates.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  const strip = ({ id, ref, name, type, level: lv }) => ({ id, ref, name, type, level: lv });
  return limitEquipmentCandidates(candidates, keywords, limit).map(strip);
}

/**
 * Loot counterpart of getEquipmentCandidates(): treasure INCLUDED (valuables
 * belong in loot), item level capped at creature level + 2, matching
 * resolveLoot()'s filter exactly so every candidate offered can resolve.
 */
export function getLootCandidates(level, keywords = []) {
  return getEquipmentCandidates(level + 2, keywords, { treasure: true, limit: LOOT_CANDIDATE_LIMIT });
}

/**
 * Full unfiltered index of a category's packs, restricted to one item type —
 * used for ancestries/backgrounds/classes/heritages, which are small (dozens
 * of entries), so no keyword-narrowing threshold is needed like the spell/
 * equipment candidate lists above.
 * @param {string} category
 * @param {string} type
 * @param {string} [maxRarity] drop entries rarer than this ("common"|"uncommon"|"rare"|"unique")
 */
async function getFullCandidates(category, type, maxRarity) {
  const maxRank = RARITY_RANK[maxRarity] ?? RARITY_RANK.unique;
  const candidates = [];
  const seen = new Set();
  for (const packId of getPacksFor(category)) {
    const entries = await getIndex(packId);
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.type !== type) continue;
      const rarity = entry.system?.traits?.rarity ?? "common";
      if ((RARITY_RANK[rarity] ?? 0) > maxRank) continue;
      if (seen.has(entry.normalized)) continue;
      seen.add(entry.normalized);
      candidates.push(candidateRecord(entry, { name: entry.name, traits: entry.system?.traits?.value ?? [] }));
    }
  }
  candidates.sort((a, b) => a.name.localeCompare(b.name));
  return candidates;
}

/**
 * @param {string} [maxRarity]
 * @returns {Promise<{name: string, traits: string[]}[]>} every ancestry at or below maxRarity
 */
export function getAncestryCandidates(maxRarity) {
  return getFullCandidates("ancestries", "ancestry", maxRarity);
}

/**
 * @param {string} [maxRarity]
 * @returns {Promise<{name: string, traits: string[]}[]>} every background at or below maxRarity
 */
export function getBackgroundCandidates(maxRarity) {
  return getFullCandidates("backgrounds", "background", maxRarity);
}

/** @returns {Promise<{name: string, traits: string[]}[]>} every class */
export function getClassCandidates() {
  return getFullCandidates("classes", "class");
}

/**
 * @param {string} [maxRarity]
 * @returns {Promise<{name: string, traits: string[]}[]>} every heritage at or below maxRarity
 */
export function getHeritageCandidates(maxRarity) {
  return getFullCandidates("heritages", "heritage", maxRarity);
}

/**
 * List real feats a PC could take for one feat slot, drawn from the existing
 * feats packs (pf2e.feats-srd, already wired via getPacksFor("feats")).
 * Filters by item level <= the slot's level, and (when given) by the feat's
 * `system.category` ("ancestry"|"class"|"skill"|"general" — the PF2e system's
 * own discriminator) and a trait intersection (e.g. the ancestry's own trait
 * slug for ancestry feats, the class's trait slug for class feats).
 * @param {object} args
 * @param {number} args.level        max item level (the slot's level)
 * @param {string} [args.category]   "ancestry"|"class"|"skill"|"general"
 * @param {string[]} [args.traits]   at least one must appear on the feat
 * @param {string[]} [args.preferredNames] exact legal first-draft picks kept before sampling
 * @returns {Promise<{name: string, level: number, traits: string[]}[]>} sorted by level then name
 */
export async function getFeatCandidates({ level, category, traits = [], preferredNames = [] } = {}) {
  const candidates = [];
  const seen = new Set();
  for (const packId of getPacksFor("feats")) {
    const entries = await getIndex(packId);
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.type !== "feat") continue;
      if ((entry.system?.level?.value ?? 0) > level) continue;
      if (category && entry.system?.category !== category) continue;
      const entryTraits = entry.system?.traits?.value ?? [];
      if (traits.length && !traits.some((t) => entryTraits.includes(t))) continue;
      if (seen.has(entry.normalized)) continue;
      seen.add(entry.normalized);
      candidates.push(candidateRecord(entry, { name: entry.name, level: entry.system?.level?.value ?? 0, traits: entryTraits }));
    }
  }
  candidates.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  return limitFeatCandidates(candidates, FEAT_CANDIDATE_LIMIT, preferredNames);
}

/** Clone a compendium document into plain item data ready for embedding. */
export function toItemData(doc) {
  const data = doc.toObject();
  delete data._id;
  delete data.folder;
  delete data.ownership;
  data._stats ??= {};
  data._stats.compendiumSource = doc.uuid;
  return data;
}
