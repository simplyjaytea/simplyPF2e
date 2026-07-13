/**
 * Fuzzy lookups against compendium packs so the AI can reference abilities,
 * spells, feats and equipment by name and we pull the real documents. Which
 * packs each category draws from is configurable (Compendium Sources menu);
 * the PF2e system packs are the defaults.
 */

import { SETTINGS, getSetting } from "./settings.mjs";

export const CATEGORIES = ["abilities", "spells", "feats", "equipment"];

export const DEFAULT_PACKS = {
  abilities: ["pf2e.bestiary-ability-glossary-srd", "pf2e.bestiary-family-ability-glossary-srd"],
  spells: ["pf2e.spells-srd"],
  equipment: ["pf2e.equipment-srd"],
  feats: ["pf2e.feats-srd"]
};

export const EQUIPMENT_TYPES = new Set([
  "weapon", "armor", "equipment", "consumable", "treasure", "backpack", "shield", "kit"
]);

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
  const ids = Array.isArray(stored[category]) && stored[category].length
    ? stored[category]
    : DEFAULT_PACKS[category];
  for (const id of ids) {
    if (!game.packs.get(id)) console.warn(`simplypf2e | configured ${category} pack "${id}" is not available (uninstalled/disabled?) — skipping`);
  }
  const packs = ids.filter((id) => game.packs.get(id));
  if (packs.length || !DEFAULT_PACKS[category]) return packs;
  console.warn(`simplypf2e | no configured ${category} packs are available, falling back to system defaults`);
  return DEFAULT_PACKS[category].filter((id) => game.packs.get(id));
}

let detectedPacks = null;

/**
 * Scan every Item compendium in the world and report which packs can serve
 * each category, based on the item types they actually contain.
 * @returns {Promise<Record<string, {id: string, title: string, package: string}[]>>}
 */
export async function detectAvailablePacks() {
  if (detectedPacks) return detectedPacks;
  const result = { abilities: [], spells: [], feats: [], equipment: [] };
  for (const pack of game.packs) {
    if (pack.metadata.type !== "Item") continue;
    const entries = await getIndex(pack.collection);
    if (!entries?.length) continue;
    const types = new Set(entries.map((e) => e.type));
    const info = { id: pack.collection, title: pack.title ?? pack.metadata.label, package: pack.metadata.packageName };
    if (types.has("action")) result.abilities.push(info);
    if (types.has("spell")) result.spells.push(info);
    if (types.has("feat")) result.feats.push(info);
    if ([...types].some((t) => EQUIPMENT_TYPES.has(t))) result.equipment.push(info);
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
      "system.traits.value", "system.traits.traditions", "system.ritual"
    ]
  });
  const entries = index.map((e) => ({ ...e, packId, normalized: normalize(e.name) }));
  indexCache.set(packId, entries);
  return entries;
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

/** Below this many keyword-filtered results, the filter is discarded as too narrow. */
const MIN_FILTERED_SPELLS = 12;

/**
 * List real, castable spells of a tradition up to a maximum rank, so the AI
 * can choose from the compendium instead of naming spells from memory.
 *
 * When `keywords` are given (descriptor traits / theme words from
 * chooseSpellFocus), the list is narrowed to spells matching at least one
 * keyword in their traits or name — keeping the final selection prompt small
 * — unless that narrows things down to next to nothing, in which case the
 * full tradition list is returned instead.
 * @param {string[]} [keywords]
 * @returns {Promise<{name: string, rank: number, traits: string[]}[]>} sorted by rank then name
 */
export async function getSpellCandidates(tradition, maxRank, keywords = []) {
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
      candidates.push({ name: entry.name, rank, traits });
    }
  }
  candidates.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  if (!keywords.length) return candidates;
  const kw = keywords.map((k) => k.toLowerCase());
  const filtered = candidates.filter((c) =>
    kw.some((k) => c.traits.includes(k) || c.name.toLowerCase().includes(k))
  );
  return filtered.length >= MIN_FILTERED_SPELLS ? filtered : candidates;
}

/* Below this many keyword-filtered equipment results, the filter is discarded
   as too narrow — a bit higher than spells since equipment spans many more
   item families (weapons, armor, gear, consumables) at once. */
const MIN_FILTERED_EQUIPMENT = 20;

/**
 * List real equipment items the creature could carry, so the AI can choose
 * from the compendium instead of naming gear from memory — the equipment
 * counterpart of getSpellCandidates().
 *
 * Treasure is excluded (coins and valuables belong only in loot). The item
 * level is capped at the creature's level, matching resolveConcept()'s
 * equipment filter exactly so every candidate offered can actually resolve.
 *
 * When `keywords` are given (tokens from the first-draft equipment names and
 * strikes), the list is narrowed to items matching at least one keyword in
 * their traits or name — keeping the selection prompt small — unless that
 * narrows things down to next to nothing, in which case the full level-capped
 * list is returned instead.
 * @param {number} level creature level
 * @param {string[]} [keywords]
 * @param {{treasure?: boolean}} [options] include treasure-type items (loot)
 * @returns {Promise<{name: string, type: string, level: number}[]>} sorted by level then name
 */
export async function getEquipmentCandidates(level, keywords = [], { treasure = false } = {}) {
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
      candidates.push({
        name: entry.name,
        type: entry.type,
        level: itemLevel,
        traits: entry.system?.traits?.value ?? []
      });
    }
  }
  candidates.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  const strip = ({ name, type, level: lv }) => ({ name, type, level: lv });
  if (!keywords.length) return candidates.map(strip);
  const kw = keywords.map((k) => k.toLowerCase());
  const filtered = candidates.filter((c) =>
    kw.some((k) => c.traits.includes(k) || c.name.toLowerCase().includes(k))
  );
  return (filtered.length >= MIN_FILTERED_EQUIPMENT ? filtered : candidates).map(strip);
}

/**
 * Loot counterpart of getEquipmentCandidates(): treasure INCLUDED (valuables
 * belong in loot), item level capped at creature level + 2, matching
 * resolveLoot()'s filter exactly so every candidate offered can resolve.
 */
export function getLootCandidates(level, keywords = []) {
  return getEquipmentCandidates(level + 2, keywords, { treasure: true });
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
