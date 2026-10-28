/** Pure parser for the initial spell link in a staged arcane school feature. */
export function isArcaneSchoolSource(source) {
  const tags = source?.system?.traits?.otherTags;
  return Array.isArray(tags) && tags.includes("wizard-arcane-school");
}

export function schoolInitialSpellLink(descriptionHtml) {
  if (typeof descriptionHtml !== "string") return null;
  const headings = [...descriptionHtml.matchAll(/<strong>\s*School Spells\s*<\/strong>/g)];
  if (headings.length !== 1) return null;
  const start = headings[0].index;
  const end = descriptionHtml.indexOf("</p>", start);
  if (end < 0) return null;
  const section = descriptionHtml.slice(start, end);
  const links = [...section.matchAll(/(?:<em>\s*)?initial:\s*(?:<\/em>)?\s*@UUID\[(Compendium\.[^.\]]+\.[^.\]]+\.Item\.[^\]]+)\](?:\{([^}]*)\})?/g)];
  if (links.length !== 1) return null;
  return { uuid: links[0][1].trim(), label: links[0][2] ?? null };
}
