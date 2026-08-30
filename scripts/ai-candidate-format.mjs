/**
 * Encode overlapping feat lists once. High-level PCs have many slots whose
 * legal candidates largely repeat; short IDs prevent resending every name for
 * every slot and let invalid cross-slot picks fail closed locally.
 */
export function encodeFeatCandidateSlots(slots) {
  const catalog = [];
  const idByCandidate = new Map();
  const encodedSlots = [];

  for (const [slotIndex, slot] of (Array.isArray(slots) ? slots : []).entries()) {
    const ids = [];
    const seenIds = new Set();
    for (const candidate of Array.isArray(slot?.candidates) ? slot.candidates : []) {
      const name = String(candidate?.name ?? "").trim();
      if (!name) continue;
      const key = String(candidate?.id ?? name.toLocaleLowerCase());
      let id = idByCandidate.get(key);
      if (!id) {
        id = `F${catalog.length.toString(36).toUpperCase()}`;
        idByCandidate.set(key, id);
        catalog.push({ id, name, ...(candidate?.ref ? { candidate: candidate.ref } : {}) });
      }
      if (!seenIds.has(id)) {
        seenIds.add(id);
        ids.push(id);
      }
    }
    encodedSlots.push({
      number: slotIndex + 1,
      type: String(slot?.type ?? "feat"),
      level: Number(slot?.level) || 0,
      ids
    });
  }

  return { catalog, slots: encodedSlots };
}

/** Validate model ID picks against each slot and restore exact feat names. */
export function resolveEncodedFeatPicks(encoded, picks) {
  const candidatesById = new Map(encoded.catalog.map(({ id, name, candidate }) => [id.toUpperCase(), { name, candidate }]));
  const allowedBySlot = new Map(encoded.slots.map((slot) => [
    slot.number,
    new Set(slot.ids.map((id) => id.toUpperCase()))
  ]));
  const resolved = [];
  const seenSlots = new Set();

  for (const pick of Array.isArray(picks) ? picks : []) {
    const slot = Number(pick?.slot);
    const id = String(pick?.id ?? "").trim().toUpperCase();
    if (!Number.isInteger(slot) || seenSlots.has(slot)) continue;
    if (!allowedBySlot.get(slot)?.has(id)) continue;
    const candidate = candidatesById.get(id);
    if (!candidate) continue;
    seenSlots.add(slot);
    resolved.push({ slot, name: candidate.name, ...(candidate.candidate ? { candidate: candidate.candidate } : {}) });
  }
  return resolved;
}
