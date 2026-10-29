/**
 * Pure string helpers shared across every pipeline. No Foundry globals are
 * used, so these helpers also run directly in Node regression checks.
 */

/** "Ghost Touch" -> "ghost-touch". */
export const slugify = (value) =>
  String(value ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** "ghost touch" -> "Ghost Touch" (per-word, leaves the rest alone). */
export function capitalized(text) {
  return String(text).split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

/**
 * Escape plain text for HTML content and quoted attributes. Every
 * description/notes/chat-message field in this module funnels through here —
 * a generated name or ability description is untrusted input, and it lands in
 * `system.description.value`, actor notes, and macro chat content, all of
 * which Foundry renders as HTML.
 */
export function esc(text) {
  const value = String(text ?? "");
  return value.replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** U+2060 WORD JOINER: zero width, no visible glyph, and not matched by \s or by any enricher pattern. */
const WORD_JOINER = "\u2060";

/**
 * Escape AI prose and make it enricher-inert. Foundry finds enrichers in the stored HTML by their source text:
 * @UUID[…], @Check[…], @Damage[…], @Localize[…], @Embed[…], &Reference[…] and inline rolls [[/r …]]. Escaping
 * leaves those sequences intact. Character references (&#64;, &#91;) do not work either: Foundry enriches text
 * nodes, and an HTML parser decodes those references back to "@" and "[" before the enrichers run. So a
 * word joiner goes after every "@" and before every "[". The bracket syntax then never reads as adjacent
 * characters, whether or not the HTML is parsed first. The page shows the same text. Module-authored mechanics
 * never pass through this helper.
 */
export const inertText = (text) => esc(text)
  .replaceAll("@", `@${WORD_JOINER}`)
  .replaceAll("[", `${WORD_JOINER}[`);

/**
 * Escape plain multi-paragraph AI text and wrap it in <p> tags (blank-line
 * separated). Returns "" for empty input so callers can drop the field.
 */
export const toHtml = (text) => (text
  ? `<p>${String(text).split(/\n{2,}/).map((p) => inertText(p.trim())).filter(Boolean).join("</p><p>")}</p>`
  : "");
