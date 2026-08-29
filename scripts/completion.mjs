/**
 * One place to decide whether a generated plan is safe to create. A manifest
 * is transient UI/build data: it is never written to actors or item flags.
 */
const COINS = /^\s*(?:\d+\s*)?(?:pp|gp|sp|cp|platinum|gold|silver|copper)\s+coins?\s*$/i;

function line(category, name, status, required = true) {
  return { category, name: String(name ?? "Unnamed"), status, required };
}

function resolvedLines(category, entries, { allowNarrative = false } = {}) {
  return (Array.isArray(entries) ? entries : []).map((item) => {
    const name = item?.spell?.name ?? item?.ability?.name ?? item?.name;
    if (item?.entry) return line(category, name, "compendium");
    if (allowNarrative) return line(category, name, "custom-narrative", false);
    return line(category, name, "unresolved");
  });
}

/** Spell plans own a fixed number of expected picks. Missing picks are a
 * blocking completion failure rather than an invitation to invent a fallback. */
function spellLines(concept, resolved, character) {
  const spells = Array.isArray(resolved?.spells) ? resolved.spells : [];
  const records = resolvedLines("spell", spells);
  const planned = character ? concept?.spellcasting?.plannedPicks : null;
  if (!planned || typeof planned !== "object" || Array.isArray(planned)) return records;
  const selectedByRank = new Map();
  for (const spell of spells) {
    const rank = Number(spell?.spell?.rank);
    if (Number.isInteger(rank) && rank >= 0) selectedByRank.set(rank, (selectedByRank.get(rank) ?? 0) + 1);
  }
  for (const [rawRank, rawCount] of Object.entries(planned)) {
    const rank = Number(rawRank);
    const count = Number(rawCount);
    if (!Number.isInteger(rank) || !Number.isInteger(count) || rank < 0 || count < 1) continue;
    for (let slot = (selectedByRank.get(rank) ?? 0) + 1; slot <= count; slot++) {
      records.push(line("spell", `Rank ${rank} pick ${slot}`, "unresolved"));
    }
  }
  return records;
}

/** Build the exact/completion report for a resolved creature or character. */
export function completionManifest({ mode, concept, resolved }) {
  const records = [];
  const character = mode === "character";
  if (character) {
    for (const [category, doc] of [["ancestry", resolved?.ancestryDoc], ["background", resolved?.backgroundDoc], ["class", resolved?.classDoc]]) {
      records.push(line(category, doc?.name, doc ? "native" : "unresolved"));
    }
    if (concept?.heritage) records.push(line("heritage", resolved?.heritageDoc?.name ?? concept.heritage,
      resolved?.heritageDoc ? "native" : "unresolved"));
  } else {
    records.push(...resolvedLines("ability", resolved?.abilities, { allowNarrative: true }));
  }
  records.push(...spellLines(concept, resolved, character));
  records.push(...resolvedLines("focus-spell", resolved?.focusSpells));
  records.push(...resolvedLines("feat", resolved?.feats));
  for (const item of resolved?.equipment ?? []) records.push(line("equipment", item.name, item.entry ? "compendium" : "unresolved"));
  for (const item of resolved?.loot ?? []) {
    const built = COINS.test(item.name) ? "module-built" : (item.scroll && item.entry ? "module-built" : null);
    records.push(line("loot", item.name, built ?? (item.entry ? "compendium" : "unresolved")));
  }
  const unresolved = records.filter((record) => record.required && record.status === "unresolved");
  return { mode, records, unresolved, complete: unresolved.length === 0 };
}

export function assertComplete(manifest) {
  if (manifest?.complete) return manifest;
  const labels = (manifest?.unresolved ?? []).map((record) => `${record.category}: ${record.name}`).join(", ");
  throw new Error(`Generation is incomplete; resolve required compendium content before creation${labels ? ` (${labels})` : ""}.`);
}

/**
 * Combine one or more already-validated manifests for the completion card.
 * The result intentionally contains counts only: exact pack/document identity
 * stays in the ephemeral build manifest and is never persisted to an actor.
 */
export function completionSummary(manifests) {
  const summary = { total: 0, compendium: 0, native: 0, moduleBuilt: 0, customNarrative: 0, unresolved: 0 };
  for (const manifest of Array.isArray(manifests) ? manifests : [manifests]) {
    for (const record of manifest?.records ?? []) {
      summary.total++;
      if (record.status === "compendium") summary.compendium++;
      else if (record.status === "native") summary.native++;
      else if (record.status === "module-built") summary.moduleBuilt++;
      else if (record.status === "custom-narrative") summary.customNarrative++;
      else if (record.status === "unresolved") summary.unresolved++;
    }
  }
  return summary;
}
