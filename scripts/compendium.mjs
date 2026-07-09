/**
 * Fuzzy lookups against the PF2e system compendiums so the AI can reference
 * abilities, spells and equipment by name and we pull the real documents.
 */

export const PACKS = {
  abilities: ["pf2e.bestiary-ability-glossary-srd", "pf2e.bestiary-family-ability-glossary-srd"],
  spells: ["pf2e.spells-srd"],
  equipment: ["pf2e.equipment-srd"],
  feats: ["pf2e.feats-srd"]
};

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

function scoreMatch(query, candidate) {
  if (candidate === query) return 3;
  if (candidate.startsWith(query) || query.startsWith(candidate)) return 2;
  const queryTokens = query.split(" ");
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
 * List real, castable spells of a tradition up to a maximum rank, so the AI
 * can choose from the compendium instead of naming spells from memory.
 * @returns {Promise<{name: string, rank: number}[]>} sorted by rank then name
 */
export async function getSpellCandidates(tradition, maxRank) {
  const candidates = [];
  for (const packId of PACKS.spells) {
    const entries = await getIndex(packId);
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.type !== "spell") continue;
      if (entry.system?.ritual) continue;
      const traditions = entry.system?.traits?.traditions ?? [];
      if (!traditions.includes(tradition)) continue;
      const isCantrip = (entry.system?.traits?.value ?? []).includes("cantrip");
      const rank = isCantrip ? 0 : (entry.system?.level?.value ?? 1);
      if (rank > maxRank) continue;
      candidates.push({ name: entry.name, rank });
    }
  }
  candidates.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return candidates;
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
