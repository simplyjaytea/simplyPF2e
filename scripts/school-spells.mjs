/** Pure parsers for the school spell links in a staged arcane school and the Advanced School Spell feat. */
export const WIZARD_ARCANE_SCHOOL_TAG = "wizard-arcane-school";

/**
 * Advanced School Spell, a Wizard class feat at level 8 (pf2e-8.5.0
 * packs/pf2e/feats/class/wizard/level-8/advanced-school-spell.json, _id 5hUj7glY8YnO5sBI).
 * Its rules are empty and it has no granted items, so the module adds the advanced spell.
 */
export const ADVANCED_SCHOOL_SPELL_FEAT_ID = "5hUj7glY8YnO5sBI";

export function isArcaneSchoolSource(source) {
  const tags = source?.system?.traits?.otherTags;
  return Array.isArray(tags) && tags.includes(WIZARD_ARCANE_SCHOOL_TAG);
}

/**
 * The link after `<label>:` in the single "School Spells" paragraph of a school description, or null when the
 * heading, the paragraph or the link is missing, duplicated or ambiguous. Accepts the repository name form
 * (`@UUID[...Item.Force Bolt]`) and the built id form with its `{label}`.
 */
function schoolSpellLink(descriptionHtml, label) {
  if (typeof descriptionHtml !== "string") return null;
  const headings = [...descriptionHtml.matchAll(/<strong>\s*School Spells\s*<\/strong>/g)];
  if (headings.length !== 1) return null;
  const start = headings[0].index;
  const end = descriptionHtml.indexOf("</p>", start);
  if (end < 0) return null;
  const section = descriptionHtml.slice(start, end);
  const pattern = new RegExp(`(?:<em>\\s*)?${label}:\\s*(?:<\\/em>)?\\s*@UUID\\[(Compendium\\.[^.\\]]+\\.[^.\\]]+\\.Item\\.[^\\]]+)\\](?:\\{([^}]*)\\})?`, "g");
  const links = [...section.matchAll(pattern)];
  if (links.length !== 1) return null;
  return { uuid: links[0][1].trim(), label: links[0][2] ?? null };
}

export const schoolInitialSpellLink = (descriptionHtml) => schoolSpellLink(descriptionHtml, "initial");
export const schoolAdvancedSpellLink = (descriptionHtml) => schoolSpellLink(descriptionHtml, "advanced");

/**
 * True when a feat reference names the Advanced School Spell feat. Accepts a uuid string, an object with
 * `uuid` or `_stats.compendiumSource`, or a `{ packId, _id }` reference. The id is the 16-character document id.
 */
export function isAdvancedSchoolSpellFeat(reference) {
  if (typeof reference === "string") return reference.endsWith(`.Item.${ADVANCED_SCHOOL_SPELL_FEAT_ID}`);
  if (!reference || typeof reference !== "object") return false;
  const uuid = reference.uuid ?? reference._stats?.compendiumSource;
  if (typeof uuid === "string") return uuid.endsWith(`.Item.${ADVANCED_SCHOOL_SPELL_FEAT_ID}`);
  return reference._id === ADVANCED_SCHOOL_SPELL_FEAT_ID;
}
