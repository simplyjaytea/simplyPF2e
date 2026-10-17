/**
 * Pure policy for the AI reskin engine. Nothing here touches Foundry or a
 * provider, so every rule is node-testable. The model supplies only a name,
 * flavor and biography as plain text. This module rejects anything that could
 * become mechanics, markup or a Foundry enricher, and it proves that a created
 * actor kept the mechanical identity of its published source.
 */
import { toHtml } from "./text.mjs";

const RESKIN_FIELDS = Object.freeze(["name", "flavor", "biography"]);
export const RESKIN_LIMITS = Object.freeze({ prompt: 1000, name: 80, flavor: 400, biography: 2000, blurb: 400, traits: 12 });

// PF2e's custom enrichers need a literal "[" (or "[[") after the name. Source:
// foundryvtt/pf2e src/scripts/hooks/init.ts, identical on master, pf2e-8.5.0 and
// pf2e-8.4.1 (CONFIG.TextEditor.enrichers patterns for @Check|@Localize|@Template,
// @Damage and [[/act ...]]). Foundry core's @UUID/@Embed/inline-roll forms are
// bracket-delimited too, but core source is not in the PF2e repository and was
// not fetched. Native QA must confirm them. The same shape lets comparisons see
// identical tokens on both sides.
const ENRICHER = /@\w+\[(?:[^[\]]|\[[^[\]]*\])*\](?:\{[^}]*\})?|\[\[[^\]]*\]\]|&\w+\[[^\]]*\]/g;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const SAFE_SLUG = /^[a-z][a-z0-9-]{0,39}$/;
// Conservative guard for numbers that read as game mechanics: dice notation,
// stat abbreviations, level and range numbers, and signed bonuses. It is a
// filter, not a rules validator; the schema itself has no numeric fields.
const GAME_STATISTIC = /\b\d*d\d+\b|\b(?:DC|AC|HP)\b|\b(?:Fortitude|Reflex|Will|Perception|Hit\s+Points?)\s*[+-]?\d|\b\d+\s*(?:hit\s+points?|damage)\b|\b\d+(?:st|nd|rd|th)?[- ]level\b|\blevel[\s-]*[+-]?\d|\b\d+[- ]?(?:feet|foot|ft\b)|(?:^|\s)[+-]\d+\b/i;
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

const isPlainObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));

/** Decode the entities that HTML escaping and sanitizers produce, once. */
function decodeEntities(text) {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Readable text of HTML, with enricher tokens removed (compared separately). */
export function plainText(html) {
  return decodeEntities(String(html ?? "").replace(ENRICHER, " ").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ").trim();
}

/** Sorted enricher tokens found in raw HTML, for multiset comparison. */
export function enricherTokens(html) {
  return [...String(html ?? "").matchAll(ENRICHER)].map((match) => match[0]).sort();
}

/**
 * Why one AI text field is unsafe to store, or null. Enrichers need brackets,
 * so rejecting brackets and "@command" text keeps the field inert. Escaping
 * (flavorBlockHtml) then handles HTML. Names stay single-line plain text.
 */
export function reskinTextProblem(field, value) {
  if (typeof value !== "string") return `${field} must be text`;
  const text = value.trim();
  if (!text) return `${field} must not be empty`;
  if (text.length > RESKIN_LIMITS[field]) return `${field} must be at most ${RESKIN_LIMITS[field]} characters`;
  if (CONTROL_CHARACTERS.test(text)) return `${field} contains control characters`;
  if (/[[\]]/.test(text)) return `${field} contains square brackets, which Foundry reads as enrichers`;
  if (field === "name") {
    return /[<>{}@\r\n\t]/.test(text) ? "name contains markup, line breaks, or an @ command" : null;
  }
  if (/@\w/.test(text)) return `${field} contains an @ command`;
  return GAME_STATISTIC.test(text) ? `${field} contains a game statistic` : null;
}

/** Strict schema for the one flavor operation: exactly name, flavor, biography. */
export function reskinOutputProblem(data) {
  if (!isPlainObject(data)) return "root must be a JSON object";
  const unsupported = Object.keys(data).filter((key) => !RESKIN_FIELDS.includes(key));
  if (unsupported.length) return `unsupported fields: ${unsupported.join(", ")}`;
  for (const field of RESKIN_FIELDS) {
    const problem = reskinTextProblem(field, data[field]);
    if (problem) return problem;
  }
  return null;
}

/**
 * The only source facts sent to the model: name, rarity, size, safe trait
 * slugs and the plain blurb. Notes, items, rules, GM-private notes, and any
 * numbers are never sent.
 */
export function reskinContext(actor) {
  const traits = actor?.system?.traits ?? {};
  const slug = (value) => (typeof value === "string" && SAFE_SLUG.test(value) ? value : null);
  return {
    sourceName: plainText(actor?.name).slice(0, RESKIN_LIMITS.name),
    rarity: slug(traits.rarity),
    size: slug(traits.size?.value),
    traits: (Array.isArray(traits.value) ? traits.value : [])
      .map(slug).filter(Boolean).slice(0, RESKIN_LIMITS.traits),
    blurb: plainText(actor?.system?.details?.blurb).slice(0, RESKIN_LIMITS.blurb)
  };
}

/** Escaped, paragraph-wrapped flavor and biography for the appended note area. */
export function flavorBlockHtml({ flavor, biography }) {
  return `<h3>Flavor</h3>${toHtml(flavor)}<h3>Biography</h3>${toHtml(biography)}`;
}

/** Keep the source's published notes byte-for-byte and append the flavor block. */
export function composePublicNotes(sourceNotes, flavorHtml) {
  return typeof sourceNotes === "string" && sourceNotes ? `${sourceNotes}\n${flavorHtml}` : flavorHtml;
}

/** Stable JSON: object keys sorted recursively, arrays kept in order. */
export function canonicalJSON(value) {
  const sortKeys = (node) => {
    if (Array.isArray(node)) return node.map(sortKeys);
    if (isPlainObject(node)) return Object.fromEntries(Object.keys(node).sort().map((key) => [key, sortKeys(node[key])]));
    return node;
  };
  return JSON.stringify(sortKeys(value));
}

/** Short display digest (FNV-1a). Equality checks compare full canonical text. */
export function digestOf(text) {
  let hash = 0x811c9dc5;
  for (const char of String(text)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// Volatile or presentational fields are excluded from mechanics. Foundry
// rewrites them on creation, and the reskin changes only name and notes.
function embeddedMechanics(entry) {
  const copy = { ...entry, compendiumSource: entry._stats?.compendiumSource ?? null };
  for (const key of ["folder", "sort", "ownership", "img", "_stats"]) delete copy[key];
  return copy;
}

function mechanicalItem(item) {
  return {
    _id: item._id,
    type: item.type,
    name: item.name,
    compendiumSource: item._stats?.compendiumSource ?? null,
    system: item.system ?? {},
    flags: item.flags ?? {},
    effects: (item.effects ?? []).map(embeddedMechanics)
  };
}

/**
 * Mechanical identity of an NPC: actor type, system (except the notes this
 * engine appends), flags, effects, and every embedded item's exact identity,
 * system data and rules, including `_stats.compendiumSource` references.
 * `actor` is plain source data with embedded items supplied separately.
 */
export function mechanicalSnapshot({ actor, items }) {
  const system = structuredClone(actor.system ?? {});
  if (isPlainObject(system.details)) delete system.details.publicNotes;
  return {
    type: actor.type ?? null,
    system,
    flags: structuredClone(actor.flags ?? {}),
    effects: (actor.effects ?? []).map(embeddedMechanics),
    items: items.map(mechanicalItem)
  };
}

function embeddedPayload(entry) {
  const copy = structuredClone(entry);
  const compendiumSource = copy._stats?.compendiumSource ?? null;
  for (const key of ["folder", "sort", "ownership", "_stats"]) delete copy[key];
  if (compendiumSource) copy._stats = { compendiumSource };
  return copy;
}

/**
 * The create payload: a deep copy of the published source with only the
 * reskin's changes applied. The name follows the native variantClone
 * schema (src/module/actor/npc/document.ts: name, details.publicNotes, img,
 * and token texture), and the prototype token label follows the new name. The
 * source image and token texture are kept. Items keep `_id`s so spell links
 * and grants stay valid. Creation-time volatile fields are regenerated by Foundry.
 */
export function reskinPayload({ actor, items }, { name, publicNotes }) {
  const payload = structuredClone(actor);
  for (const key of ["_id", "folder", "ownership", "sort", "_stats"]) delete payload[key];
  payload.name = name;
  payload.system.details.publicNotes = publicNotes;
  if (isPlainObject(payload.prototypeToken) && "name" in payload.prototypeToken) {
    payload.prototypeToken.name = name;
  }
  if (Array.isArray(payload.effects)) payload.effects = payload.effects.map(embeddedPayload);
  payload.items = items.map(embeddedPayload);
  return payload;
}

/**
 * Compare a source mechanical snapshot with an actual one. `exact` demands
 * equality for our own pre-create payload. After Foundry persists, Foundry may
 * fill defaults, so `exact:false` checks only that every source value survives.
 * Returns human-readable problem labels.
 */
export function reskinMechanicsProblems(expected, actual, { exact = true } = {}) {
  const problems = [];
  const compare = (label, want, got) => {
    const shaped = exact ? got : projectShape(want, got);
    if (canonicalJSON(want) !== canonicalJSON(shaped)) problems.push(label);
  };
  compare("actor mechanics",
    { type: expected.type, system: expected.system, flags: expected.flags, effects: expected.effects },
    { type: actual.type, system: actual.system, flags: actual.flags, effects: actual.effects });
  if (expected.items.length !== actual.items.length) {
    problems.push(`item count ${actual.items.length} differs from ${expected.items.length}`);
  }
  for (const want of expected.items) {
    const got = actual.items.find((item) => item._id === want._id);
    if (!got) {
      problems.push(`missing ${want.type} "${want.name}"`);
      continue;
    }
    compare(`${want.type} "${want.name}"`, want, got);
  }
  return problems;
}

/** Project `actual` onto the keys `expected` defines; arrays must keep their length. */
function projectShape(expected, actual) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return actual;
    return expected.map((value, index) => projectShape(value, actual[index]));
  }
  if (isPlainObject(expected)) {
    if (!isPlainObject(actual)) return actual;
    return Object.fromEntries(Object.keys(expected).map((key) => [key, projectShape(expected[key], actual[key])]));
  }
  return actual;
}

/**
 * Notes check. The source notes must survive as the same text, and no enricher
 * may be added or dropped. The flavor text must appear once. Sanitizer
 * normalization is tolerated because plain text and enricher tokens are compared.
 */
export function publicNotesProblems({ sourceNotes, actualNotes, flavorHtml }) {
  const problems = [];
  if (enricherTokens(actualNotes).join("\n") !== enricherTokens(sourceNotes).join("\n")) {
    problems.push("publicNotes enricher syntax changed");
  }
  if (!plainText(actualNotes).startsWith(plainText(sourceNotes))) problems.push("publicNotes source text changed");
  if (!plainText(actualNotes).includes(plainText(flavorHtml))) problems.push("publicNotes flavor text missing");
  return problems;
}
