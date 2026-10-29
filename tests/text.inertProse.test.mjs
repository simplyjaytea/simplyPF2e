// AI prose is enricher-inert. Every Foundry enrichment family is written in the stored HTML with "@" and "["
// as character references, so the page shows the same text and no enricher sequence remains. The check
// uses the same enricher matcher as the reskin and loot guards.
// Run: node tests/text.inertProse.test.mjs
import assert from "node:assert/strict";
import { esc, inertText, toHtml } from "../scripts/text.mjs";
import { enricherTokens } from "../scripts/reskin-policy.mjs";

// Each family Foundry enriches: a link, checks, damage, a template, a localized string, and inline rolls.
const TOKENS = [
  "@UUID[Compendium.pf2e.spells-srd.Item.Fireball]{Fireball}",
  "@Check[fortitude|dc:20|basic]",
  "@Damage[2d6[fire]]",
  "@Template[type:burst|distance:20]",
  "@Localize[PF2E.Check.Fortitude]",
  "[[/r 1d20]]",
  "[[/gm 2d6 + 3]]{fireball}",
  "@Embed[JournalEntry.abc]"
];

for (const token of TOKENS) {
  const html = inertText(`Before ${token} after.`);
  assert.equal(enricherTokens(html).length, 0, `${token} leaves no enricher sequence`);
  assert.doesNotMatch(html, /@|\[/, `${token} has no @ or [ left in the stored HTML`);
  // The visible characters are kept: decoding the two references gives back the original text, escaped.
  const decoded = html.replaceAll("&#64;", "@").replaceAll("&#91;", "[");
  assert.equal(decoded, esc(`Before ${token} after.`), `${token} keeps its visible text`);
}

// Escaping still applies: markup from the AI is escaped, and ampersands are not double-escaped.
assert.equal(inertText(`<img src=x onerror=alert(1)> & "quotes"`), "&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quotes&quot;");

// toHtml wraps each paragraph and keeps the policy for every paragraph.
const html = toHtml("First @UUID[Compendium.pf2e.feats-srd.Item.Demo].\n\nSecond [[/r 1d6]] paragraph.");
assert.equal(html, "<p>First &#64;UUID&#91;Compendium.pf2e.feats-srd.Item.Demo].</p><p>Second &#91;&#91;/r 1d6]] paragraph.</p>");
assert.equal(enricherTokens(html).length, 0);

// Empty input stays empty, so callers can drop the field.
assert.equal(toHtml(""), "");
assert.equal(toHtml(undefined), "");

console.log(`text.inertProse.test.mjs: ${TOKENS.length} enricher families come out inert with their visible text kept`);
