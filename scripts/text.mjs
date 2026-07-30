/**
 * Pure string helpers shared across every pipeline. No Foundry globals are
 * touched at import time (foundry.utils.escapeHTML is looked up lazily), so
 * this module is safe to import from a plain `node` self-check.
 */

/** "Ghost Touch" -> "ghost-touch". */
export const slugify = (value) =>
  String(value ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** "ghost touch" -> "Ghost Touch" (per-word, leaves the rest alone). */
export function capitalized(text) {
  return String(text).split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

/**
 * Escape AI-written text before it goes anywhere near an HTML string. Every
 * description/notes/chat-message field in this module funnels through here —
 * a generated name or ability description is untrusted input, and it lands in
 * `system.description.value`, actor notes, and macro chat content, all of
 * which Foundry renders as HTML.
 */
export const esc = (text) =>
  (foundry.utils.escapeHTML ? foundry.utils.escapeHTML(String(text ?? "")) : String(text ?? ""));

/**
 * Escape plain multi-paragraph AI text and wrap it in <p> tags (blank-line
 * separated). Returns "" for empty input so callers can drop the field.
 */
export const toHtml = (text) => (text
  ? `<p>${String(text).split(/\n{2,}/).map((p) => esc(p.trim())).filter(Boolean).join("</p><p>")}</p>`
  : "");
