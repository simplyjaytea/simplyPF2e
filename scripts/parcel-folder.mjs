/**
 * Where a parcel's permanent item is created (feat/re-folder, opt-in, behind experimentalTools).
 *
 * pf2e's loot actor never hosts Rule Elements (`actor/loot/document.ts`: `canHostRuleElements` is false, and
 * `prepareDerivedData` sets `rules = []`), so a rule-bearing item cannot live on the loot actor. With the GM's
 * "Items with rules go to a world folder" option on, that item is created as an unchanged world Item in a folder
 * named after the parcel, and the GM drags it onto a PC. Its Rule Elements stay intact, because a world item is
 * not prepared (`item/base/document.ts` `prepareRuleElements` returns [] without an embedding actor that can host them).
 *
 * These helpers hold the pure decisions; the Foundry writes stay in itemforge-app.mjs.
 */

export const DESTINATION = Object.freeze({ LOOT: "loot", FOLDER: "folder" });

/** True when a source carries at least one Rule Element. */
export function hasRuleElements(source) {
  return Array.isArray(source?.system?.rules) && source.system.rules.length > 0;
}

/** The destination of one built permanent source: rule-bearing items go to the world folder, all others to the loot actor. */
export function destinationFor(source) {
  return hasRuleElements(source) ? DESTINATION.FOLDER : DESTINATION.LOOT;
}

/** Split built permanent entries (`{ filled, source }`) by destination. Unfilled entries are ignored. */
export function splitPermanents(entries) {
  const loot = [];
  const folder = [];
  for (const entry of entries ?? []) {
    if (!entry?.filled) continue;
    (destinationFor(entry.source) === DESTINATION.FOLDER ? folder : loot).push(entry);
  }
  return { loot, folder };
}

/**
 * The world items Foundry returned must be the sources that were sent: the same count and order, the same names,
 * the same number of Rule Elements (an unchanged clone), and each one inside the new folder. Returns a problem
 * code, or null when they match.
 */
export function folderItemProblem(created, sources, folderId) {
  if (!Array.isArray(created) || created.length !== sources.length) return "count";
  for (let index = 0; index < sources.length; index++) {
    const item = created[index];
    const source = sources[index];
    if (!item?.id) return "missing";
    if (item.name !== source.name) return "name";
    if ((item.system?.rules?.length ?? 0) !== source.system.rules.length) return "rules";
    if ((item.folder?.id ?? item.folder) !== folderId) return "folder";
  }
  return null;
}
