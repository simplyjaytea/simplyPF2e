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

/**
 * Escape plain multi-paragraph AI text and wrap it in <p> tags (blank-line
 * separated). Returns "" for empty input so callers can drop the field.
 */
export const toHtml = (text) => (text
  ? `<p>${String(text).split(/\n{2,}/).map((p) => esc(p.trim())).filter(Boolean).join("</p><p>")}</p>`
  : "");
