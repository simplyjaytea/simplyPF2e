/**
 * Permanent-item slots, safety filters and assignment for a treasure parcel (part 2).
 * Pure: no Foundry globals and no imports except the coin rates. The filters take plain
 * index or document data, so the same function judges the offered pool and the loaded document.
 *
 * Every rule below is quoted from pf2e-8.5.0 in docs/plans/parcel-v2-2026-10-29.md (part 2).
 * Module conventions, not printed values:
 * - A permanent slot holds one published `equipment` item whose item level is an allowed level
 *   of that slot, or a generic wand (item level 2r+1, rank r) built from the pinned wand template.
 * - Mundane items, runed weapons and armor, special published wands, and anything whose safety
 *   cannot be established from trusted fields are not offered. Their slots stay unfilled.
 * - A published item with Rule Elements is not offered: a loot actor cannot host them.
 */
import { COIN_COPPER_RATES } from "./treasure-parcel.mjs";

/** Highest item level a permanent slot can take (pf2e tables stop at 20). */
export const PERMANENT_LEVEL_MAX = 20;
/** Highest generic wand rank (no wand 10 template). */
export const WAND_RANK_MAX = 9;

/** Stable reason codes for an unfilled permanent slot. The app maps each to localized text. */
export const PERMANENT_REASON = Object.freeze({
  NO_CANDIDATES: "no-candidates",
  NO_PICK: "no-pick",
  INVALID_PICK: "invalid-pick",
  UNAVAILABLE: "unavailable",
  BUILD: "build",
  TEMPLATE: "template",
  PROVIDER: "provider"
});

/** Rarity ranks for the Forge's four rarities. An unknown rarity is never at or below the cap. */
const RARITY_RANK = Object.freeze({ common: 0, uncommon: 1, rare: 2, unique: 3 });

/**
 * Traits that exclude an item from a permanent slot. `artifact`, `cursed` and `intelligent` are
 * the module's safety set; `relic`, `mythic` and `apex` need rules this module does not build;
 * `wand` marks the special published wands, which are excluded so generic wands stay unambiguous.
 */
const EXCLUDED_TRAITS = Object.freeze(new Set(["artifact", "cursed", "intelligent", "relic", "mythic", "apex", "wand"]));

/** A magical trait: `magical`, or a magic tradition (pf2e-8.5.0 spell/values.ts MAGIC_TRADITIONS). */
const MAGIC_TRAITS = Object.freeze(new Set(["magical", "arcane", "divine", "occult", "primal"]));

/** pf2e `usage` values for fundamental runes and reinforcing materials, which attach to a host item. */
const ATTACHMENT_USAGE = /^(?:etched-onto|affixed-to)/;

/** Gem and art-object categories a parcel valuable may be. */
export const VALUABLE_CATEGORIES = Object.freeze(["gem", "art-object"]);

/** True when a rarity is known and at or below the Forge's rarity. Unknown values fail closed. */
export function rarityAllowed(rarity, maxRarity) {
  return Object.hasOwn(RARITY_RANK, rarity) && Object.hasOwn(RARITY_RANK, maxRarity)
    && RARITY_RANK[rarity] <= RARITY_RANK[maxRarity];
}

/**
 * Copper pieces of a `system.price.value`, or null. Only pp, gp, sp and cp count; any other positive
 * denomination fails closed. Each value must be a safe non-negative integer, so the result is exact.
 */
export function priceCopper(price) {
  if (!price || typeof price !== "object" || Array.isArray(price)) return null;
  let total = 0;
  for (const [denomination, value] of Object.entries(price)) {
    if (value === undefined || value === null || value === 0) continue;
    if (!Object.hasOwn(COIN_COPPER_RATES, denomination)) return null;
    if (!Number.isSafeInteger(value) || value < 0) return null;
    total += value * COIN_COPPER_RATES[denomination];
  }
  return Number.isSafeInteger(total) && total > 0 ? total : null;
}

/**
 * Why a published equipment item cannot fill a permanent slot at `level`, or null when it can.
 * Works on index entries (no rules field) and on loaded documents; `permanentDocumentProblem`
 * adds the Rule Elements check that only a full document can answer.
 */
export function permanentEquipmentProblem(data, level, maxRarity) {
  if (!data || typeof data !== "object") return "malformed";
  const system = data.system ?? {};
  if (data.type !== "equipment") return "type";
  if (!Number.isInteger(system.level?.value) || system.level.value !== level) return "level";
  if (!rarityAllowed(system.traits?.rarity, maxRarity)) return "rarity";
  const traits = Array.isArray(system.traits?.value) ? system.traits.value : null;
  if (!traits) return "classification";
  if (traits.some((trait) => EXCLUDED_TRAITS.has(trait))) return "classification";
  // A mundane item carries no magic trait at all (GM Core's Chapter 6 items are out of scope).
  if (!traits.some((trait) => MAGIC_TRAITS.has(trait))) return "classification";
  const usage = system.usage?.value;
  if (typeof usage !== "string" || !usage || ATTACHMENT_USAGE.test(usage)) return "attachment";
  if (priceCopper(system.price?.value) === null) return "price";
  return null;
}

/** As permanentEquipmentProblem, plus the loaded document must carry no Rule Elements. */
export function permanentDocumentProblem(data, level, maxRarity) {
  const problem = permanentEquipmentProblem(data, level, maxRarity);
  if (problem) return problem;
  if (!Array.isArray(data.system?.rules) || data.system.rules.length) return "rules";
  return null;
}

/**
 * Create-time check of a built permanent source against its slot. The source must carry no Rule
 * Elements, sit at one of the slot's allowed levels, and have a valid price. Runs again when the
 * loot actor is created, so a source changed after the preview cannot slip through.
 */
export function permanentSourceProblem(source, allowedLevels) {
  if (!source || typeof source !== "object") return "malformed";
  if (!Array.isArray(source.system?.rules) || source.system.rules.length) return "rules";
  if (!Array.isArray(allowedLevels) || !allowedLevels.includes(source.system?.level?.value)) return "level";
  if (priceCopper(source.system?.price?.value) === null) return "price";
  return null;
}

/** Why a published treasure document cannot be a parcel valuable, or null. */
export function valuableProblem(data, maxRarity) {
  if (!data || typeof data !== "object") return "malformed";
  const system = data.system ?? {};
  if (data.type !== "treasure") return "type";
  if (!VALUABLE_CATEGORIES.includes(system.category)) return "classification";
  if (!rarityAllowed(system.traits?.rarity, maxRarity)) return "rarity";
  if (priceCopper(system.price?.value) === null) return "price";
  if (Array.isArray(system.rules) && system.rules.length) return "rules";
  return null;
}

/** Item level a generic wand of rank `rank` sits at (pf2e pinned templates: rank 1 = level 3, rank 9 = level 19). */
export function wandLevelForRank(rank) {
  if (!Number.isInteger(rank) || rank < 1 || rank > WAND_RANK_MAX) return null;
  return 2 * rank + 1;
}

/** The rank of a generic wand at `level`, or null when no generic wand sits at that level. */
export function wandRankForLevel(level) {
  if (!Number.isInteger(level) || level < 3 || level % 2 === 0) return null;
  const rank = (level - 1) / 2;
  return wandLevelForRank(rank) === level ? rank : null;
}

/**
 * Permanent slots for one party treasure row (treasure-tables.mjs `partyTreasureForSize`).
 * Each table count becomes one slot allowing exactly its item level. Each extra PC becomes one
 * slot allowing both of its levels (party level and the next level): one slot, two choices.
 * Ids are "perm-N" in table order, so they are stable for one row and party size.
 */
export function planPermanentSlots(row) {
  const slots = [];
  for (const entry of row?.permanent ?? []) {
    for (let index = 0; index < entry.count; index++) {
      slots.push({ allowedLevels: [entry.level], source: "table" });
    }
  }
  const extra = row?.permanentExtra ?? { count: 0, levels: [] };
  const extraLevels = [...new Set(extra.levels)].sort((a, b) => a - b);
  for (let index = 0; index < extra.count; index++) {
    slots.push({ allowedLevels: [...extraLevels], source: "extra" });
  }
  return slots.map((slot, index) => ({ id: `perm-${index + 1}`, ...slot }));
}

/**
 * Bind the AI's permanent picks to slots. A pick must name an issued slot and an offered candidate
 * whose level is one of that slot's allowed levels. The first valid pick per slot wins; a later pick
 * for the same slot is dropped as a duplicate. An invalid pick never claims a slot. A slot left
 * without a valid pick is unfilled, with the reason: no offered candidate fits its levels, an invalid
 * pick was made, or the model omitted it.
 *
 * `offered` maps candidate id to { id, level }. Returns assignments, unfilled and dropped.
 */
export function assignPermanentPicks(slots, picks, offered) {
  if (!Array.isArray(slots)) throw new Error("Permanent slots must be an array");
  // Duck-typed: a Map from another realm (the Forge runs in a module context) is still a Map.
  if (typeof offered?.get !== "function" || typeof offered?.values !== "function") throw new Error("Offered permanent candidates must be a Map");
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  const filled = new Map();
  const invalid = new Set();
  const dropped = [];

  for (const pick of Array.isArray(picks) ? picks : []) {
    const slotId = pick?.slotId;
    const candidateId = pick?.candidateId;
    const slot = slotById.get(slotId);
    if (!slot) {
      dropped.push({ reason: "unknown-slot", slotId });
      continue;
    }
    if (filled.has(slot.id)) {
      dropped.push({ reason: "duplicate-slot", slotId });
      continue;
    }
    const candidate = offered.get(candidateId);
    if (!candidate || !slot.allowedLevels.includes(candidate.level)) {
      invalid.add(slot.id);
      dropped.push({ reason: "unoffered-candidate", slotId, candidateId });
      continue;
    }
    filled.set(slot.id, candidate);
  }

  const assignments = [];
  const unfilled = [];
  for (const slot of slots) {
    if (filled.has(slot.id)) {
      assignments.push({ slot, candidate: filled.get(slot.id) });
      continue;
    }
    const hasPool = [...offered.values()].some((candidate) => slot.allowedLevels.includes(candidate.level));
    let reason = PERMANENT_REASON.NO_PICK;
    if (!hasPool) reason = PERMANENT_REASON.NO_CANDIDATES;
    else if (invalid.has(slot.id)) reason = PERMANENT_REASON.INVALID_PICK;
    unfilled.push({ slot, reason });
  }
  return { assignments, unfilled, dropped };
}

/**
 * The single valuable a parcel may hold: the first candidate, in the caller's deterministic order,
 * whose copper value is positive and no more than the budget. `ranked` entries carry `copper`.
 * Returns the chosen entry, or null with `reason` "none-offered" or "too-expensive".
 */
export function chooseValuable(ranked, budgetCopper) {
  if (!Array.isArray(ranked) || !ranked.length) return { entry: null, reason: "none-offered" };
  if (!Number.isSafeInteger(budgetCopper) || budgetCopper < 0) throw new Error(`Valuable budget must be a whole, non-negative copper amount (got ${String(budgetCopper)})`);
  const entry = ranked.find((candidate) => candidate.copper > 0 && candidate.copper <= budgetCopper);
  return entry ? { entry, reason: null } : { entry: null, reason: "too-expensive" };
}

/**
 * Deterministic ranking by GM brief keywords: more keyword hits first, then name, then id.
 * Keywords are compared with the candidate name and traits, already lower-cased by the caller.
 */
export function rankByBrief(candidates, keywords = []) {
  const words = [...new Set((Array.isArray(keywords) ? keywords : []).map((word) => String(word).toLowerCase()).filter(Boolean))];
  const score = (candidate) => {
    const name = String(candidate.name ?? "").toLowerCase();
    const traits = Array.isArray(candidate.traits) ? candidate.traits : [];
    return words.filter((word) => name.includes(word) || traits.includes(word)).length;
  };
  return [...candidates].sort((a, b) => score(b) - score(a)
    || String(a.name ?? "").localeCompare(String(b.name ?? ""))
    || String(a.id ?? "").localeCompare(String(b.id ?? "")));
}
