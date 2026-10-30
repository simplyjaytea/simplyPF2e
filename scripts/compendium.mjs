/**
 * Fuzzy lookups against compendium packs so the AI can reference abilities,
 * spells, feats and equipment by name and we pull the real documents. Which
 * packs each category draws from is configurable (Compendium Sources menu);
 * the PF2e system packs are the defaults.
 */

import { SETTINGS, getSetting } from "./settings.mjs";
import { featPrerequisitesMet } from "./pc-prerequisites.mjs";
import { slugify } from "./text.mjs";
import { createAsyncCache } from "./async-cache.mjs";
import {
  permanentEquipmentProblem, permanentDocumentProblem, valuableProblem,
  priceCopper, wandRankForLevel, rankByBrief, specialWandProblem, rarityAllowed
} from "./treasure-permanent.mjs";
import {
  pinnedTier, runedBaseProblem, runeTierProblem, runedValuation, runedCandidateId, runedDisplayName, SECONDARY_FIELD
} from "./parcel-runed.mjs";

export const CATEGORIES = [
  "abilities", "spells", "feats", "equipment", "ancestries", "backgrounds", "classes", "classFeatures", "heritages", "bestiaryActors"
];

export const DEFAULT_PACKS = {
  // PF2e 8 removed the `-srd` suffix from the family glossary collection.
  // Keep both identifiers so the supported PF2e 6+ range selects whichever
  // version its installed system exposes. Ids named in LEGACY_PACK_IDS (below)
  // are legacy aliases: the drift check warns, not fails, when upstream drops one.
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
  // Class-path features (rackets, methodologies, schools, theses) are
  // selected from this explicitly enabled source. They are not ordinary PC
  // feat candidates: the native class grant graph owns their creation.
  classFeatures: ["pf2e.classfeatures"],
  heritages: ["pf2e.heritages"],
  bestiaryActors: ["pf2e.pathfinder-monster-core", "pf2e.pathfinder-bestiary"]
};

// Ids kept in DEFAULT_PACKS only for older worlds (PF2e 6 and 7). PF2e 8 dropped them, so
// tools/check-pf2e-drift.mjs reports a missing legacy id as a WARN and any other missing id as a FAIL.
export const LEGACY_PACK_IDS = Object.freeze(new Set([
  "pf2e.bestiary-family-ability-glossary-srd"
]));

export const EQUIPMENT_TYPES = new Set([
  "weapon", "armor", "equipment", "consumable", "ammo", "treasure", "backpack", "shield", "kit"
]);
const ABILITY_CANDIDATE_LIMIT = 48;

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

/**
 * Report packs required before spending tokens. Spell sources remain necessary
 * when casting is disabled: all actor modes can still ground scroll loot.
 */
export function sourceReadiness(mode, { allowSpellcasting = true } = {}) {
  const character = mode === "character";
  const required = character
    ? ["ancestries", "backgrounds", "classes", "feats", "equipment", "spells"]
    : ["abilities", "feats", "equipment", "spells", "bestiaryActors"];
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

const detectedPacks = createAsyncCache();

/**
 * Scan every Item compendium in the world and report which packs can serve
 * each category, based on the item types they actually contain.
 * @returns {Promise<Record<string, {id: string, title: string, package: string}[]>>}
 */
export function detectAvailablePacks() {
  return detectedPacks("all", async () => {
    const result = {
      abilities: [], spells: [], feats: [], equipment: [],
      ancestries: [], backgrounds: [], classes: [], classFeatures: [], heritages: [], bestiaryActors: []
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
      if (types.has("feat")) result.classFeatures.push(info);
      if (types.has("heritage")) result.heritages.push(info);
    }
    for (const list of Object.values(result)) list.sort((a, b) => a.title.localeCompare(b.title));
    return result;
  });
}

function normalize(name) {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const indexCache = createAsyncCache();
async function getIndex(packId) {
  const pack = game.packs.get(packId);
  if (!pack) return null;
  return indexCache(pack, async () => {
    const index = await pack.getIndex({
      fields: [
        "name", "type", "system.slug", "system.level.value",
        "system.traits.value", "system.traits.traditions", "system.ritual",
        "system.category", "system.stackGroup", "system.spell", "system.traits.rarity", "system.traits.otherTags", "system.prerequisites.value",
        // Heritages: the owning ancestry (null for versatile heritages), so the ABC prompt can withhold heritages of
        // ancestries that are not offered.
        "system.ancestry"
      ]
    });
    return index.map((entry) => ({ ...entry, packId, normalized: normalize(entry.name) }));
  });
}

const equipmentIndexCache = createAsyncCache();

/**
 * Equipment-pack index extended with level, price, usage and traits — used by
 * the rune helpers (runes.mjs) and the item forge's empirical pricing, both of
 * which need real prices and `usage` strings the default index omits.
 * @returns {Promise<object[]>} index entries, or [] when the pack is missing
 */
export async function getEquipmentIndex(packId) {
  const pack = game.packs.get(packId);
  if (!pack) return [];
  try {
    return await equipmentIndexCache(pack, async () => {
      const index = await pack.getIndex({
        fields: ["name", "type", "system.level.value", "system.price.value", "system.usage.value", "system.traits.value", "system.traits.rarity", "system.category", "system.specific"]
      });
      return [...index];
    });
  } catch (err) {
    console.warn(`simplypf2e | failed to index equipment pack "${packId}"`, err);
    return [];
  }
}

/**
 * Every equipment-pack entry, deduped by name, as lightweight records. One
 * view serves rune lookups and price sampling. Rebuild it from cached pack
 * indexes so source selection changes and retried loads are reflected.
 * @returns {Promise<{name: string, type: string, level: number, gp: number, usage: string|null, category: string|null, specific: boolean}[]>}
 */
export async function getAllEquipmentEntries() {
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
        category: entry.system?.category ?? null,
        // PF2e 8.4.1 weapon/armor isSpecific is true for a non-null
        // system.specific. Missing legacy/homebrew data remains ordinary.
        specific: entry.system?.specific != null
      });
    }
  }
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

/**
 * Stable, opaque identifier for a candidate offered to the model. The model
 * never needs a pack name or document id; those stay in this local reference.
 */
function candidateId(entry) {
  const packId = String(entry?.packId ?? "");
  const documentId = String(entry?._id ?? "");
  return packId && documentId ? `c-${btoa(`${packId}\u0000${documentId}`).replaceAll("=", "")}` : null;
}

const issuedCandidateRefs = new WeakSet();

function candidateRecord(entry, fields = {}) {
  if (!candidateId(entry)) throw new TypeError("A candidate needs an exact pack and document identity");
  const ref = Object.freeze({ packId: entry.packId, _id: entry._id });
  issuedCandidateRefs.add(ref);
  return {
    ...fields,
    id: candidateId(entry),
    ref
  };
}

/** Issue a catalog candidate without exposing the private reference registry. */
export { candidateRecord as issueCandidate };

/** True only for the in-memory reference produced by this run's candidate catalog. */
export function isIssuedCandidate(ref, packIds = null) {
  if (!ref?.packId || !ref?._id || !issuedCandidateRefs.has(ref)) return false;
  return !Array.isArray(packIds) || packIds.includes(ref.packId);
}

/** Resolve only an exact, locally-issued candidate reference. */
export async function getCandidateDocument(candidate, packIds = null) {
  const ref = candidate?.ref;
  if (!isIssuedCandidate(ref, packIds)) return null;
  return getDocument(ref);
}

/* Hard ceilings for the name catalogs serialized into AI prompts. These stay
 * deliberately conservative: broad enough to offer real choices, but small
 * enough that installing another content pack cannot silently consume the
 * model's whole context window. */
export const SPELL_CANDIDATE_LIMIT = 96;
const SPELL_CANDIDATES_PER_RANK = 12;
export const SPELL_CANDIDATE_FLOOR = 40;
export const EQUIPMENT_CANDIDATE_LIMIT = 60;
export const LOOT_CANDIDATE_LIMIT = 60;
export const LOOT_SCROLL_CANDIDATE_LIMIT = 24;
export const EQUIPMENT_CANDIDATE_FLOOR = 48;
export const FEAT_CANDIDATE_LIMIT = 16;
const FEAT_CANDIDATES_PER_LEVEL = 8;

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
export function limitSpellCandidates(candidates, keywords = [], limit = SPELL_CANDIDATE_LIMIT, plannedPicks = null, preserveExact = false) {
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
  return withPriority(buckets, priority, preserveExact ? Math.max(target, exact.length) : target)
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
  return withPriority(buckets, exact, Math.max(target, exact.length))
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
export async function getSpellCandidates(tradition, maxRank, keywords = [], plannedPicks = null, { maxRarity = null } = {}) {
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
      if (maxRarity && !rarityAtMost(entry.system?.traits?.rarity ?? "common", maxRarity)) continue;
      if (seen.has(entry.normalized)) continue;
      seen.add(entry.normalized);
      candidates.push(candidateRecord(entry, { name: entry.name, rank, traits, rarity: entry.system?.traits?.rarity }));
    }
  }
  candidates.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return limitSpellCandidates(candidates, keywords, SPELL_CANDIDATE_LIMIT, plannedPicks);
}

/**
 * True when a spell rarity is no rarer than max.
 */
function rarityAtMost(rarity, max) {
  return Object.hasOwn(RARITY_RANK, rarity) && RARITY_RANK[rarity] <= (RARITY_RANK[max] ?? 0);
}

/**
 * Bounded exact candidates for spell scrolls and wands. Scroll legality is
 * independent of a creature casting tradition, but it excludes cantrips, focus
 * spells and rituals (spell-consumables.mjs refuses the same), and it carries
 * the published base rank for local validation. maxRarity drops rarer spells
 * before the bounded cut, so the cap is never spent on spells a plan cannot use.
 */
export async function getScrollSpellCandidates(maxRank = 10, keywords = [], { maxRarity = null, limit = SPELL_CANDIDATE_LIMIT } = {}) {
  const candidates = [];
  const seen = new Set();
  for (const packId of getPacksFor("spells")) {
    const entries = await getIndex(packId);
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.type !== "spell" || entry.system?.ritual) continue;
      const traits = entry.system?.traits?.value ?? [];
      if (traits.includes("cantrip") || traits.includes("focus")) continue;
      const rank = entry.system?.level?.value ?? 1;
      if (rank > maxRank || seen.has(entry.normalized)) continue;
      const rarity = entry.system?.traits?.rarity ?? "common";
      if (maxRarity && !rarityAtMost(rarity, maxRarity)) continue;
      seen.add(entry.normalized);
      candidates.push(candidateRecord(entry, { name: entry.name, rank, traits, rarity: entry.system?.traits?.rarity }));
    }
  }
  candidates.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return limitSpellCandidates(candidates, keywords, limit, null, limit === LOOT_SCROLL_CANDIDATE_LIMIT);
}

/**
 * Common, non-focus cantrips from enabled spell packs, up to `maxRarity` (common by default). The caller
 * decides whether uncommon cantrips are in the pool. Focus cantrips and rituals are excluded.
 */
export async function getCantripCandidates(keywords = [], { maxRarity = "common" } = {}) {
  const candidates = [];
  const seen = new Set();
  for (const packId of getPacksFor("spells")) {
    const entries = await getIndex(packId);
    if (!entries) continue;
    for (const entry of entries) {
      const traits = entry.system?.traits?.value ?? [];
      if (entry.type !== "spell" || entry.system?.ritual || !traits.includes("cantrip") || traits.includes("focus") || !rarityAtMost(entry.system?.traits?.rarity, maxRarity) || seen.has(entry.normalized)) continue;
      seen.add(entry.normalized);
      candidates.push(candidateRecord(entry, { name: entry.name, rank: entry.system?.level?.value ?? 1, traits, rarity: entry.system.traits.rarity }));
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
export async function getFocusSpellCandidates(maxRank, keywords = [], { maxRarity = null } = {}) {
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
      if (maxRarity && !rarityAtMost(entry.system?.traits?.rarity ?? "common", maxRarity)) continue;
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
 * @param {{treasure?: boolean, includeCoins?: boolean, limit?: number}} [options]
 * treasure inclusion, optional coin inclusion, and hard result cap
 * @returns {Promise<{name: string, type: string, level: number}[]>} sorted by level then name
 */
export async function getEquipmentCandidates(
  level, keywords = [], { treasure = false, includeCoins = true, limit = EQUIPMENT_CANDIDATE_LIMIT, maxRarity = null } = {}
) {
  const maxLevel = Math.max(level, 0);
  const candidates = [];
  const seen = new Set();
  for (const packId of getPacksFor("equipment")) {
    const entries = await getIndex(packId);
    if (!entries) continue;
    for (const entry of entries) {
      if (!EQUIPMENT_TYPES.has(entry.type) || (!treasure && entry.type === "treasure")) continue;
      // PF2e coins are published as treasure, but they are module-built
      // currency in loot and must not be offered as ordinary selector picks.
      // Callers that need the full treasure catalog can leave includeCoins at
      // its default; getLootCandidates() deliberately leaves coins out.
      if (!includeCoins && entry.type === "treasure"
        && (entry.system?.category === "coin" || entry.system?.stackGroup === "coins")) continue;
      // PF2e's published scroll consumables are blank rank templates: their
      // category is "scroll" and system.spell is null/absent. They are only
      // an internal builder source, not a selectable finished item. A scroll
      // with an embedded spell remains eligible for packs that publish one.
      if (entry.type === "consumable" && entry.system?.category === "scroll" && entry.system?.spell == null) continue;
      const itemLevel = entry.system?.level?.value ?? 0;
      if (itemLevel > maxLevel) continue;
      if (maxRarity && !rarityAtMost(entry.system?.traits?.rarity ?? "common", maxRarity)) continue;
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
 * Loot counterpart of getEquipmentCandidates(): non-coin treasure INCLUDED
 * (valuables belong in loot), item level capped at creature level + 2,
 * matching resolveLoot()'s filter exactly so every candidate offered can
 * resolve. Coins are preserved from the first draft and resolved as sheet
 * currency, so they are intentionally absent from this selector catalog.
 */
export function getLootCandidates(level, keywords = [], { maxRarity = null } = {}) {
  return getEquipmentCandidates(level + 2, keywords, {
    treasure: true, includeCoins: false, limit: LOOT_CANDIDATE_LIMIT, maxRarity
  });
}

/**
 * Full unfiltered index of a category's packs, restricted to one item type —
 * used for ancestries/backgrounds/classes/heritages, which are small (dozens
 * of entries), so no keyword-narrowing threshold is needed like the spell/
 * equipment candidate lists above.
 * @param {string} category
 * @param {string} type
 * @param {string} [maxRarity] drop entries rarer than this ("common"|"uncommon"|"rare"|"unique")
 * @param {{distinctSources?: boolean}} [options] retain same-name entries from distinct sources
 */
async function getFullCandidates(category, type, maxRarity, { distinctSources = false } = {}) {
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
      const identity = distinctSources ? `${entry.packId}\u0000${entry._id}` : entry.normalized;
      if (seen.has(identity)) continue;
      seen.add(identity);
      candidates.push(candidateRecord(entry, {
        name: entry.name,
        traits: entry.system?.traits?.value ?? [],
        // Heritages carry the ancestry they belong to; ancestry-agnostic
        // (versatile) heritages have none. The ABC selector uses this to
        // withhold heritages of ancestries that are not on offer.
        ...(type === "heritage" && entry.system?.ancestry?.name
          ? { ancestry: entry.system.ancestry.name }
          : {})
      }));
    }
  }
  candidates.sort((a, b) => a.name.localeCompare(b.name));
  return candidates;
}

/** Bounded exact bestiary-action candidates for creature ability selection. */
export async function getAbilityCandidates(keywords = []) {
  const candidates = [];
  const seen = new Set();
  for (const packId of getPacksFor("abilities")) {
    const entries = await getIndex(packId);
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.type !== "action" || seen.has(entry.normalized)) continue;
      seen.add(entry.normalized);
      candidates.push(candidateRecord(entry, {
        name: entry.name,
        traits: entry.system?.traits?.value ?? [],
        actionType: entry.system?.actionType?.value ?? "passive"
      }));
    }
  }
  const words = normalizedKeywords(keywords);
  const ranked = candidates.slice().sort((a, b) => relevanceScore(b, words) - relevanceScore(a, words)
    || a.name.localeCompare(b.name));
  const exact = ranked.filter((candidate) => words.includes(normalize(candidate.name)));
  return [...new Set([...exact, ...ranked])].slice(0, Math.max(ABILITY_CANDIDATE_LIMIT, exact.length));
}

/**
 * @param {string} [maxRarity]
 * @returns {Promise<{name: string, traits: string[]}[]>} every ancestry at or below maxRarity
 */
export function getAncestryCandidates(maxRarity, options) {
  return getFullCandidates("ancestries", "ancestry", maxRarity, options);
}

/**
 * @param {string} [maxRarity]
 * @returns {Promise<{name: string, traits: string[]}[]>} every background at or below maxRarity
 */
export function getBackgroundCandidates(maxRarity, options) {
  return getFullCandidates("backgrounds", "background", maxRarity, options);
}

/** @returns {Promise<{name: string, traits: string[]}[]>} every class */
export function getClassCandidates(options) {
  return getFullCandidates("classes", "class", undefined, options);
}

/**
 * Exact, enabled-source class-feature candidates carrying one native path
 * tag (for example `rogue-racket`). These are deliberately separate from
 * ordinary feats: the class's own grant graph creates them.
 */
export async function getClassFeatureCandidates(tag) {
  if (typeof tag !== "string" || !tag) return [];
  const candidates = [];
  const seen = new Set();
  for (const packId of getPacksFor("classFeatures")) {
    const entries = await getIndex(packId);
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.type !== "feat" || entry.system?.category !== "classfeature") continue;
      const tags = entry.system?.traits?.otherTags;
      if (!Array.isArray(tags) || !tags.includes(tag)) continue;
      const identity = `${entry.packId}\u0000${entry._id}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      candidates.push(candidateRecord(entry, {
        name: entry.name,
        type: entry.type,
        level: entry.system?.level?.value ?? 0,
        traits: entry.system?.traits?.value ?? [],
        tags: entry.system.traits.otherTags,
        slug: entry.system?.slug ?? null,
        uuid: `Compendium.${entry.packId}.Item.${entry._id}`
      }));
    }
  }
  return candidates.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * @param {string} [maxRarity]
 * @returns {Promise<{name: string, traits: string[]}[]>} every heritage at or below maxRarity
 */
export function getHeritageCandidates(maxRarity, options) {
  return getFullCandidates("heritages", "heritage", maxRarity, options);
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
 * @param {boolean} [args.requireNoPrerequisites] empty-array gate when no staged context is supplied
 * @param {object} [args.prerequisiteContext] staged-actor snapshot from `stagedActorContext()`
 * @param {number} [args.limit]      sampling cap (default FEAT_CANDIDATE_LIMIT); exact allow-lists pass a larger cap
 * @returns {Promise<{name: string, level: number, traits: string[]}[]>} sorted by level then name
 */
export async function getFeatCandidates({
  level, category, traits = [], preferredNames = [], requireNoPrerequisites = false, prerequisiteContext = null,
  limit = FEAT_CANDIDATE_LIMIT, maxRarity = null
} = {}) {
  const candidates = [];
  const seen = new Set();
  for (const packId of getPacksFor("feats")) {
    const entries = await getIndex(packId);
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.type !== "feat") continue;
      if ((entry.system?.level?.value ?? 0) > level) continue;
      if (category && entry.system?.category !== category) continue;
      if (maxRarity && !rarityAtMost(entry.system?.traits?.rarity ?? "common", maxRarity)) continue;
      // PF2e stores prerequisite text as authored strings, not an eligibility
      // API. Complete-only catalogs evaluate that text against a staged actor
      // when one is supplied; otherwise they still accept only an explicit
      // empty list. NPC/legacy callers omit both flags and stay permissive.
      if (prerequisiteContext) {
        if (!featPrerequisitesMet(entry, prerequisiteContext)) continue;
      } else if (requireNoPrerequisites && !(Array.isArray(entry.system?.prerequisites?.value)
        && entry.system.prerequisites.value.length === 0)) continue;
      const entryTraits = entry.system?.traits?.value ?? [];
      if (traits.length && !traits.some((t) => entryTraits.includes(t))) continue;
      if (seen.has(entry.normalized)) continue;
      seen.add(entry.normalized);
      candidates.push(candidateRecord(entry, { name: entry.name, level: entry.system?.level?.value ?? 0, traits: entryTraits }));
    }
  }
  candidates.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  return limitFeatCandidates(candidates, limit, preferredNames);
}

/** Exact normalization for NPC requirement binding; this does not fuzzy-match. */
export function normalizeCreatureFeatName(name) {
  return normalize(String(name ?? ""));
}

/**
 * Rank a source-preserving NPC catalog. Relevance only controls which real
 * candidates are offered; selection still requires an issued request alias.
 * `limit: null` lets package admission run before the provider shortlist cap.
 */
export function rankCreatureFeatCandidates(candidates, {
  preferredNames = [], prompt = "", preferredTraits = [], classTraits = [], limit = FEAT_CANDIDATE_LIMIT
} = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  const exactNames = new Set(normalizedKeywords(preferredNames));
  const tokens = (text) => normalizeCreatureFeatName(text).split(" ").filter((word) => word.length > 2 && !STOPWORDS.has(word));
  const draftTerms = new Set(preferredNames.flatMap(tokens));
  const promptTerms = new Set(tokens(prompt));
  const knownClassTraits = new Set(classTraits);
  const relatedTraits = new Set(preferredTraits);
  for (const candidate of list) {
    for (const trait of candidate.traits ?? []) {
      if (knownClassTraits.has(trait) && (exactNames.has(normalize(candidate.name)) || promptTerms.has(trait))) {
        relatedTraits.add(trait);
      }
    }
  }
  const score = (candidate) => {
    const name = normalize(candidate.name);
    const words = new Set(tokens(name));
    return [
      Number(exactNames.has(name)),
      [...words].filter((word) => draftTerms.has(word)).length,
      Number((candidate.traits ?? []).some((trait) => relatedTraits.has(trait))),
      [...words].filter((word) => promptTerms.has(word)).length
    ];
  };
  const ranked = list.map((candidate) => ({ candidate, score: score(candidate) }))
    .sort((a, b) => {
      for (let i = 0; i < a.score.length; i++) {
        if (a.score[i] !== b.score[i]) return b.score[i] - a.score[i];
      }
      return b.candidate.level - a.candidate.level || a.candidate.name.localeCompare(b.candidate.name)
        || String(a.candidate.id).localeCompare(String(b.candidate.id));
    }).map(({ candidate }) => candidate);
  return limit === null ? ranked : ranked.slice(0, Math.max(0, Math.min(FEAT_CANDIDATE_LIMIT, Number(limit) || 0)));
}

/**
 * All-class NPC admission deduplicates source identity, never display name.
 * Separate from PC slot admission so that its established sampling, category,
 * trait and staged-prerequisite semantics remain unchanged.
 */
export async function getCreatureFeatCandidates({
  level, preferredNames = [], prompt = "", preferredTraits = [], limit = FEAT_CANDIDATE_LIMIT, maxRarity = null
} = {}) {
  if (!Number.isFinite(level)) return [];
  const candidates = [];
  const seen = new Set();
  for (const packId of getPacksFor("feats")) {
    const entries = await getIndex(packId);
    for (const entry of entries ?? []) {
      const itemLevel = entry.system?.level?.value;
      const traits = entry.system?.traits?.value;
      if (entry.type !== "feat" || entry.system?.category !== "class"
        || !Number.isInteger(itemLevel) || itemLevel < 1 || itemLevel > level || !Array.isArray(traits)) continue;
      if (maxRarity && !rarityAtMost(entry.system?.traits?.rarity ?? "common", maxRarity)) continue;
      const identity = candidateId(entry);
      if (!identity || seen.has(identity)) continue;
      seen.add(identity);
      candidates.push(candidateRecord(entry, { name: entry.name, level: itemLevel, traits }));
    }
  }
  return rankCreatureFeatCandidates(candidates, {
    preferredNames, prompt, preferredTraits, limit,
    classTraits: Object.keys(globalThis.CONFIG?.PF2E?.classTraits ?? {})
  });
}

/**
 * Full item data for one indexed entry, or null when it cannot be read. A failed read or conversion
 * is one unavailable candidate, so the search goes on; a user abort still propagates.
 */
async function readItemData(packId, _id) {
  try {
    const doc = await getDocument({ packId, _id });
    return doc ? toItemData(doc) : null;
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    console.warn(`simplypf2e | could not read ${packId} item ${_id}`, err);
    return null;
  }
}

/** Offered published items per permanent slot level (part 2 parcel); the pool is bounded before any AI call. */
export const PERMANENT_EQUIPMENT_LIMIT = 12;
/** Full documents loaded per level while filling that pool: a bound on compendium reads, not a cap on the result. */
const PERMANENT_LOAD_FACTOR = 3;
/** Generic wands offered per wand level, kept separate from equipment so truncation cannot erase a kind. */
export const PARCEL_WAND_LIMIT = 6;
/** Published special wands (the `wand` trait) offered per level, reserved apart from generic wands. */
export const SPECIAL_WAND_LIMIT = 6;
/** The one pack valuables come from (the PF2e SRD equipment pack that holds the published gems and art objects). */
export const VALUABLE_PACK_ID = "pf2e.equipment-srd";
/** Valuable documents loaded before the search gives up; a bound on compendium reads. */
const VALUABLE_LOAD_ATTEMPTS = 12;

/**
 * Published equipment that may fill a permanent slot at `level`. Index filters first (type, exact level,
 * rarity, classification, usage, price), then full documents are loaded in ranked order and must carry
 * no Rule Elements unless `allowRules` (the Forge's world-folder option) is set. Only documents that pass
 * are offered; each is issued as an opaque candidate.
 */
export async function getPermanentEquipmentCandidates(level, keywords = [], { maxRarity = "common", limit = PERMANENT_EQUIPMENT_LIMIT, allowRules = false } = {}) {
  const indexed = [];
  const seen = new Set();
  for (const packId of getPacksFor("equipment")) {
    for (const entry of await getEquipmentIndex(packId)) {
      if (permanentEquipmentProblem(entry, level, maxRarity)) continue;
      const key = `${packId}\u0000${entry._id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      indexed.push({ packId, _id: entry._id, name: entry.name, traits: entry.system?.traits?.value ?? [] });
    }
  }
  const offered = [];
  let loads = 0;
  for (const item of rankByBrief(indexed.map((entry) => ({ ...entry, id: `${entry.packId}/${entry._id}` })), keywords)) {
    if (offered.length >= limit || loads >= limit * PERMANENT_LOAD_FACTOR) break;
    loads += 1;
    const data = await readItemData(item.packId, item._id);
    if (!data || permanentDocumentProblem(data, level, maxRarity, { allowRules })) continue;
    offered.push(candidateRecord(item, { name: item.name, type: "equipment", level, traits: item.traits, rarity: data.system.traits.rarity, kind: "equipment" }));
  }
  return offered;
}

/**
 * Published special wands at `level` (parcel v3): equipment with the `wand` trait, from the configured
 * equipment packs. Index filters first, then each full document must pass specialWandProblem (no Rule
 * Elements, safe traits, the exact level). The generic 2r+1 rule does not apply to these.
 */
export async function getSpecialWandCandidates(level, keywords = [], { maxRarity = "common", limit = SPECIAL_WAND_LIMIT } = {}) {
  const indexed = [];
  const seen = new Set();
  for (const packId of getPacksFor("equipment")) {
    for (const entry of await getEquipmentIndex(packId)) {
      if (!(entry.system?.traits?.value ?? []).includes("wand")) continue;
      if (permanentEquipmentProblem(entry, level, maxRarity, { allowWand: true })) continue;
      const key = `${packId}\u0000${entry._id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      indexed.push({ packId, _id: entry._id, name: entry.name, traits: entry.system?.traits?.value ?? [] });
    }
  }
  const offered = [];
  let loads = 0;
  for (const item of rankByBrief(indexed.map((entry) => ({ ...entry, id: `${entry.packId}/${entry._id}` })), keywords)) {
    if (offered.length >= limit || loads >= limit * PERMANENT_LOAD_FACTOR) break;
    loads += 1;
    const data = await readItemData(item.packId, item._id);
    if (!data || specialWandProblem(data, level, maxRarity)) continue;
    offered.push(candidateRecord(item, { name: item.name, type: "equipment", level, traits: item.traits, rarity: data.system.traits.rarity, kind: "special-wand" }));
  }
  return offered;
}

/** Ordinary base documents read per parcel for runed items, and runed candidates offered per level. */
export const RUNED_BASE_LOADS = 12;
export const RUNED_LIMIT_PER_LEVEL = 8;

/** Parse a pinned `Compendium.<pack>.Item.<id>` UUID into the `{ packId, _id }` form getDocument takes. */
function parsePinnedUuid(uuid) {
  const match = /^Compendium\.([^.]+\.[^.]+)\.Item\.([A-Za-z0-9]+)$/.exec(uuid);
  return match ? { packId: match[1], _id: match[2] } : null;
}

/**
 * Fundamental-runed candidates (parcel v3) for the given item levels. Ordinary base weapons and armor are
 * read from the configured equipment packs, ranked by the brief and loaded in a bounded number. Each base
 * that passes runedBaseProblem is combined with each tier pair (potency 1 to 3, with an optional secondary
 * 1 to 3) whose pinned tiers are verified against their real documents. A combination is offered at its
 * computed pf2e level and only when that level is one the caller asked for. The value and level are
 * computed from the pinned tiers; nothing is read from a stored price.
 */
export async function getRunedCandidates(levels, keywords = [], { maxRarity = "common", limitPerLevel = RUNED_LIMIT_PER_LEVEL } = {}) {
  const wanted = new Set(levels);
  if (!wanted.size) return [];
  const verified = new Map();
  const tierVerified = async (kind, field, tier) => {
    const key = `${kind}/${field}/${tier}`;
    if (!verified.has(key)) {
      const pinned = pinnedTier(kind, field, tier);
      const ref = pinned ? parsePinnedUuid(pinned.uuid) : null;
      const data = ref ? await readItemData(ref.packId, ref._id) : null;
      const ok = Boolean(pinned && data && !runeTierProblem(data, pinned));
      if (!ok) console.warn(`simplypf2e | fundamental ${kind} ${field} tier ${tier} could not be verified against its document`);
      verified.set(key, ok);
    }
    return verified.get(key);
  };
  const bases = [];
  for (const kind of ["weapon", "armor"]) {
    for (const packId of getPacksFor("equipment")) {
      for (const entry of await getEquipmentIndex(packId)) {
        if (entry.type !== kind || entry.system?.specific) continue;
        bases.push({ kind, packId, _id: entry._id, name: entry.name, id: `${kind}/${packId}/${entry._id}` });
      }
    }
  }
  const offered = new Map([...wanted].map((level) => [level, []]));
  let loads = 0;
  for (const base of rankByBrief(bases, keywords)) {
    if (loads >= RUNED_BASE_LOADS) break;
    loads += 1;
    const data = await readItemData(base.packId, base._id);
    if (!data || runedBaseProblem(data, base.kind) || !rarityAllowed(data.system.traits.rarity, maxRarity)) continue;
    const baseRecord = candidateRecord({ packId: base.packId, _id: base._id }, { name: data.name, type: base.kind, level: data.system.level.value, kind: "runed-base" });
    const field = SECONDARY_FIELD[base.kind];
    for (let potency = 1; potency <= 3; potency++) {
      if (!(await tierVerified(base.kind, "potency", potency))) continue;
      for (let secondary = 0; secondary <= 3; secondary++) {
        if (secondary && !(await tierVerified(base.kind, field, secondary))) continue;
        const computed = runedValuation({ kind: base.kind, baseLevel: data.system.level.value, baseRarity: data.system.traits.rarity, potency, secondary });
        if (!computed || !offered.has(computed.level) || !rarityAllowed(computed.rarity, maxRarity)) continue;
        const list = offered.get(computed.level);
        if (list.length >= limitPerLevel) continue;
        list.push({
          id: runedCandidateId(baseRecord.id, potency, secondary),
          name: runedDisplayName(base.kind, data.name, potency, secondary),
          level: computed.level,
          rarity: computed.rarity,
          kind: "runed",
          traits: [],
          runeKind: base.kind,
          base: baseRecord,
          baseName: data.name,
          computed: { baseLevel: data.system.level.value, baseRarity: data.system.traits.rarity, potency, secondary, copper: computed.copper, level: computed.level, rarity: computed.rarity }
        });
      }
    }
  }
  return [...offered.values()].flat();
}

/**
 * Generic wands for a permanent slot at `level`: one per spell of exactly the wand's rank (level 2r+1
 * is rank r), from the configured spell packs. Each wand is an opaque candidate that names the issued
 * spell candidate; the spell and template are resolved again when the wand is built.
 */
export async function getParcelWandCandidates(level, keywords = [], { maxRarity = "common", limit = PARCEL_WAND_LIMIT } = {}) {
  const rank = wandRankForLevel(level);
  if (!rank) return [];
  const spells = (await getScrollSpellCandidates(rank, keywords, { maxRarity })).filter((spell) => spell.rank === rank);
  return rankByBrief(spells, keywords).slice(0, limit).map((spell) => ({
    id: `w-${spell.id}`,
    name: spell.name,
    level,
    rank,
    kind: "wand",
    traits: spell.traits ?? [],
    spell
  }));
}

/**
 * The published gems and art objects a parcel may use as a valuable, ranked by the brief. Empty with
 * `available: false` when the valuable pack is not installed, so the caller can say why.
 */
export async function getValuableCandidates(keywords = [], { maxRarity = "common" } = {}) {
  if (!game.packs.get(VALUABLE_PACK_ID)) return { available: false, candidates: [] };
  const indexed = [];
  for (const entry of await getEquipmentIndex(VALUABLE_PACK_ID)) {
    if (valuableProblem(entry, maxRarity)) continue;
    const copper = priceCopper(entry.system?.price?.value);
    indexed.push({ packId: VALUABLE_PACK_ID, _id: entry._id, name: entry.name, traits: [], copper, id: `${VALUABLE_PACK_ID}/${entry._id}` });
  }
  return { available: true, candidates: rankByBrief(indexed, keywords) };
}

/** Most valuables one parcel may hold (parcel v3). */
export const PARCEL_VALUABLE_LIMIT = 3;

/**
 * Up to `limit` distinct valuables, taken in the caller's deterministic order. Each is taken only when its
 * exact copper value is no more than the budget left (equality is allowed) and its full document still passes
 * valuableProblem. A candidate that is too expensive, unpriced or unreadable is skipped and the search goes on,
 * within a bounded number of document loads. Returns the picks in order, the skipped reasons and what is left.
 */
export async function pickParcelValuables(ranked, budgetCopper, maxRarity = "common", { limit = PARCEL_VALUABLE_LIMIT, attempts = VALUABLE_LOAD_ATTEMPTS } = {}) {
  if (!Number.isSafeInteger(budgetCopper) || budgetCopper < 0) throw new Error(`Valuable budget must be a whole, non-negative copper amount (got ${String(budgetCopper)})`);
  const picked = [];
  const skipped = [];
  const seen = new Set();
  let remaining = budgetCopper;
  let loads = 0;
  for (const entry of Array.isArray(ranked) ? ranked : []) {
    if (picked.length >= limit || loads >= attempts) break;
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    if (!(entry.copper > 0)) { skipped.push({ name: entry.name, reason: "unpriced" }); continue; }
    if (entry.copper > remaining) { skipped.push({ name: entry.name, reason: "too-expensive" }); continue; }
    loads += 1;
    const data = await readItemData(entry.packId, entry._id);
    if (!data) { skipped.push({ name: entry.name, reason: "unavailable" }); continue; }
    const copper = priceCopper(data.system?.price?.value);
    if (valuableProblem(data, maxRarity) || copper === null || copper > remaining) {
      skipped.push({ name: entry.name, reason: "invalid" });
      continue;
    }
    data.system.quantity = 1;
    picked.push({ candidate: entry, source: data, copper });
    remaining -= copper;
  }
  return { picked, skipped, remaining };
}

export function toItemData(doc) {
  const data = doc.toObject();
  delete data._id;
  delete data.folder;
  delete data.ownership;
  data._stats ??= {};
  data._stats.compendiumSource = doc.uuid;
  return data;
}
