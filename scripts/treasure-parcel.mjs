/**
 * Treasure parcel planning: turns an adjusted GM Core "Party Treasure by Level"
 * row into consumable scroll slots, assigns the AI's spell picks to those
 * slots, stacks repeats and values the currency. Pure: no Foundry globals and
 * no imports. Row data is transcribed in docs/plans/sprint-2026-10-27.md §2.10.
 *
 * Module conventions, not printed values:
 * - Consumable slots hold scrolls only. Scroll rank r sits at item level 2r-1.
 * - An even-level slot takes the scroll one level lower, never above the table.
 * - Unfilled slots are not back-filled. A pick is never reassigned or guessed.
 * - Permanent items are not built in v1. They are copied through for the preview.
 */

export const PARCEL_DROP = Object.freeze({
  UNKNOWN_SLOT: "unknown-slot",
  DUPLICATE_SLOT: "duplicate-slot",
  UNKNOWN_SPELL: "unknown-spell",
  RANK_ABOVE_SLOT: "rank-above-slot"
});

/** Scroll rank for an item level: floor((level + 1) / 2), capped at 10. */
export function scrollRankForItemLevel(itemLevel) {
  if (Number.isInteger(itemLevel) && itemLevel >= 1) {
    return Math.min(10, Math.floor((itemLevel + 1) / 2));
  }
  throw new Error(`Item level must be an integer of at least 1, got ${String(itemLevel)}`);
}

/** Expand an adjusted treasure row into one scroll slot per consumable count. */
export function planParcelSlots(adjustedRow) {
  if (!adjustedRow || typeof adjustedRow !== "object") throw new Error("Parcel row must be an object");
  const { level, consumables, totalGp, currencyGp } = adjustedRow;
  if (!Number.isInteger(level)) throw new Error(`Parcel level must be an integer, got ${String(level)}`);
  if (!Array.isArray(consumables)) throw new Error("Parcel consumables must be an array");
  if (!Number.isFinite(totalGp)) throw new Error(`Parcel totalGp must be finite, got ${String(totalGp)}`);
  if (!Number.isFinite(currencyGp)) throw new Error(`Parcel currencyGp must be finite, got ${String(currencyGp)}`);

  const itemLevels = [];
  for (const entry of consumables) {
    if (!entry || !Number.isInteger(entry.level) || !Number.isInteger(entry.count) || entry.count < 0) {
      throw new Error(`Malformed consumable entry: ${JSON.stringify(entry)}`);
    }
    for (let count = 0; count < entry.count; count++) itemLevels.push(entry.level);
  }
  itemLevels.sort((a, b) => b - a);

  return {
    slots: itemLevels.map((itemLevel, index) => ({
      id: `slot-${index + 1}`,
      itemLevel,
      rank: scrollRankForItemLevel(itemLevel)
    })),
    permanent: structuredClone(adjustedRow.permanent),
    permanentExtra: structuredClone(adjustedRow.permanentExtra ?? { count: 0, levels: [] }),
    currencyGp,
    totalGp,
    partyLevel: level
  };
}

/**
 * Bind picks to slots. The first valid pick per slot wins; later picks for the
 * same slot drop as duplicates. Invalid picks never claim a slot.
 */
export function assignParcelPicks(slots, picks, candidates) {
  if (!Array.isArray(slots)) throw new Error("Parcel slots must be an array");
  if (!Array.isArray(candidates)) throw new Error("Parcel candidates must be an array");
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const filled = new Map();
  const dropped = [];

  for (const pick of Array.isArray(picks) ? picks : []) {
    const { slotId, spellId } = pick ?? {};
    const drop = (reason) => dropped.push({ slotId, spellId, reason });
    const slot = slotById.get(slotId);
    if (!slot) {
      drop(PARCEL_DROP.UNKNOWN_SLOT);
      continue;
    }
    if (filled.has(slot.id)) {
      drop(PARCEL_DROP.DUPLICATE_SLOT);
      continue;
    }
    const candidate = candidateById.get(spellId);
    if (!candidate) {
      drop(PARCEL_DROP.UNKNOWN_SPELL);
      continue;
    }
    if (candidate.rank > slot.rank) {
      drop(PARCEL_DROP.RANK_ABOVE_SLOT);
      continue;
    }
    filled.set(slot.id, candidate);
  }

  return {
    assignments: slots.filter((slot) => filled.has(slot.id)).map((slot) => ({ slot, candidate: filled.get(slot.id) })),
    unfilled: slots.filter((slot) => !filled.has(slot.id)),
    dropped
  };
}

/** Group assignments by spell and slot rank. The scroll is built at the slot rank. */
export function stackParcelAssignments(assignments) {
  if (!Array.isArray(assignments)) throw new Error("Parcel assignments must be an array");
  const stacks = new Map();
  for (const { slot, candidate } of assignments) {
    const key = JSON.stringify([candidate.id, slot.rank]);
    if (!stacks.has(key)) stacks.set(key, { candidate, rank: slot.rank, quantity: 0, slotIds: [] });
    const stack = stacks.get(key);
    stack.quantity += 1;
    stack.slotIds.push(slot.id);
  }
  return [...stacks.values()];
}

/** Whole-gp value of built items plus party currency; non-finite input throws. */
export function parcelValueGp({ items, currencyGp }) {
  if (!Array.isArray(items)) throw new Error("Parcel items must be an array");
  if (!Number.isFinite(currencyGp)) throw new Error(`Parcel currencyGp must be finite, got ${String(currencyGp)}`);
  let itemsGp = 0;
  for (const { priceGp, quantity } of items) {
    if (!Number.isFinite(priceGp) || !Number.isFinite(quantity)) {
      throw new Error(`Parcel item needs finite priceGp and quantity, got ${String(priceGp)} x ${String(quantity)}`);
    }
    itemsGp += priceGp * quantity;
  }
  return Math.round(itemsGp + currencyGp);
}
