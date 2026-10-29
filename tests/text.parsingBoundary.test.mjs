// AI prose survives the parsing boundary as inert text. Foundry enriches the text nodes of a stored HTML page,
// so the check is done on what those text nodes contain: the stored HTML is parsed (entities decoded, tags
// removed) and every enricher pattern is run against the result. The pattern list is quoted from source below.
// Module-authored mechanics (@Check, @Damage) must still match, so the check is not vacuous.
// Run: node tests/text.parsingBoundary.test.mjs
import assert from "node:assert/strict";
import { esc, inertText, toHtml } from "../scripts/text.mjs";
import { enricherTokens } from "../scripts/reskin-policy.mjs";

// Enricher patterns. The pf2e 8.5.0 patterns are copied from src/scripts/hooks/init.ts at tag pf2e-8.5.0
// (github.com/foundryvtt/pf2e). Foundry v14's own patterns are not in any public repository, so the built-in
// families are conservative matchers of the documented syntax (the v10 migration guide shows @UUID[...]{label}).
const PATTERNS = {
  "pf2e @Check/@Localize/@Template": /@(Check|Localize|Template)\[([^\]]+)\](?:{([^}]+)})?/g,
  "pf2e @Damage": /@(Damage)\[((?:[^[\]]|\[[^[\]]*\])*)\](?:{([^}]+)})?/g,
  "pf2e [[/act]]": /\[\[\/(act)\s+(?<slug>[-a-z]+)(?:\s+(?<options>[^\]]+))?\]\](?:\{(?<label>[^}]+)\})?/g,
  "foundry @UUID (documented form)": /@UUID\[([^#\]]+)(?:#([^\]]+))?\](?:{([^}]+)})?/g,
  "foundry @Embed (documented form)": /@Embed\[([^\]]+)\]/g,
  "foundry inline roll [[/r]] (documented form)": /\[\[(\/[a-zA-Z]+\s)?[^\]]+\]\]/g,
  "foundry &Reference (documented form)": /&[A-Za-z]+\[[^\]]*\]/g,
  "module ENRICHER (reskin-policy)": null
};

// What a DOM parser gives Foundry's text nodes for this stored HTML: tags removed, entities decoded.
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function textNodes(html) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_, ref) => {
      if (ref[0] === "#") return String.fromCodePoint(ref[1].toLowerCase() === "x" ? parseInt(ref.slice(2), 16) : Number(ref.slice(1)));
      return ENTITIES[ref.toLowerCase()] ?? `&${ref};`;
    });
}
const enrichersIn = (text) => {
  const hits = [];
  for (const [name, pattern] of Object.entries(PATTERNS)) {
    if (!pattern) {
      hits.push(...enricherTokens(text).map((token) => `${name}: ${token}`));
      continue;
    }
    for (const match of text.matchAll(pattern)) hits.push(`${name}: ${match[0]}`);
  }
  return hits;
};
const WORD_JOINER = "⁠";

// 1. AI prose, every family and the tricky shapes, in a description, a paragraph and a single line.
const AI_PROSE = [
  "Lurks here. @UUID[Compendium.pf2e.spells-srd.Item.Fireball]{Fireball} is a favorite.",
  "A roll: [[/r 1d20]] and a gm roll [[/gm 2d6 + 3]]{fireball}.",
  "Checks @Check[fortitude|dc:20|basic] and @Localize[PF2E.Check.Fortitude].",
  "Damage @Damage[2d6[fire]] and a template @Template[type:burst|distance:20].",
  "Embedded @Embed[JournalEntry.abc] and a reference &Reference[Compendium.x]{y}.",
  "Activity [[/act strike]] and nested [[/r [[/r 1d4]] ]] text.",
  "Markup <img src=x onerror=alert(1)> and & amp &amp; stay visible."
];
for (const prose of AI_PROSE) {
  for (const [label, stored] of [["inertText", inertText(prose)], ["toHtml", toHtml(prose)]]) {
    const text = textNodes(stored);
    assert.deepEqual(enrichersIn(text), [], `${label}: no enricher survives the parsing boundary for: ${prose}`);
  }
  // The visible text is the AI's text: removing the joiners from the parsed text gives the original back.
  assert.equal(textNodes(inertText(prose)).replaceAll(WORD_JOINER, ""), prose, `the visible text is kept for: ${prose}`);
}

// 2. Module-authored mechanics still match at the same boundary: the Recall Knowledge check and the damage check.
{
  const recall = `<p><strong>Occultism</strong> @Check[type:occultism|dc:15]: ${inertText("Known for @UUID[x]{y}.")}</p>`;
  const text = textNodes(recall);
  assert.ok(enrichersIn(text).some((hit) => hit.startsWith("pf2e @Check") && hit.includes("@Check[type:occultism|dc:15]")),
    "the module's @Check stays live at the boundary");
  assert.ok(!enrichersIn(text).some((hit) => hit.includes("@UUID[x]")), "the AI's @UUID beside it is inert");
  const damage = `<p>Hits for @Damage[2d6[fire]] on a bad save.</p>`;
  assert.ok(enrichersIn(textNodes(damage)).some((hit) => hit.startsWith("pf2e @Damage")), "a module @Damage stays live");
}

// 3. The check has teeth: the entity-based neutralization this replaced fails it. A parser decodes &#64;, so
//    the encoded link comes back as a live @UUID. The control shows the oracle catches it.
{
  const oldInertText = (text) => esc(text).replaceAll("@", "&#64;").replaceAll("[", "&#91;");
  const stored = oldInertText("Lurks @UUID[Compendium.pf2e.spells-srd.Item.Fireball]{Fireball}.");
  assert.ok(enrichersIn(textNodes(stored)).some((hit) => hit.includes("@UUID[Compendium")),
    "control: the old entity encoding is caught as a live link at the boundary");
}

console.log(`text.parsingBoundary.test.mjs: ${AI_PROSE.length} AI prose samples have no enricher after parsing; module @Check and @Damage stay live`);
