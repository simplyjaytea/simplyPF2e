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
  records.push(...resolvedLines("spell", resolved?.spells));
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
