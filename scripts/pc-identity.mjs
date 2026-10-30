/*
 * The PC identity boundary is deliberately small. Controls carry opaque
 * source keys, and declaration-shaped prose can bind exact catalog names.
 * Other free prose can only make a request ambiguous; it can never select an
 * ABC document by itself.
 *
 * Class paths. A class has one required-path slot per level-one bridge
 * feature (class-paths.mjs). Every catalog candidate carries `bridge`, the
 * bridge feature's name. Two shapes carry a requirement:
 *   - `classPath`: the single-bridge alias (Rogue's Racket, Investigator's
 *     Methodology). One stable key, as before. It is the alias of
 *     `classPaths[candidate.bridge]` when the candidate names its bridge.
 *     For a class with several bridges (Wizard) there is no single path
 *     control, so resolvePCIdentity moves a bridge-labelled alias into
 *     `classPaths[bridge]`, where the per-bridge control reads it.
 *   - `classPaths`: an object keyed by bridge name ("Arcane School",
 *     "Arcane Thesis"), one issued candidate per bridge. Controls supply
 *     `choices.classPaths = { "<bridge>": "<stable key>" }`; the key must be a
 *     candidate of that very bridge, so a thesis can never fill the school.
 * Declarations: "racket", "methodology" and "class path" bind `classPath`;
 * "school" and "arcane school" bind `classPaths["Arcane School"]`; "thesis"
 * and "arcane thesis" bind `classPaths["Arcane Thesis"]`. Bridge names are
 * matched exactly, so a localized compendium that renames the features
 * resolves no declaration rather than a wrong one. Applied concepts hold
 * `classPaths` (bridge -> name) and `classPathCandidates` (bridge -> ref).
 * Prose never selects a path; a prose mention of a path's full name without a
 * control or declaration is ambiguous, like every other identity mention.
 */

import { getBackgroundLoreOptions } from "./pc-background-lore.mjs";

const CATALOG_FIELDS = Object.freeze(["ancestry", "heritage", "background", "class", "classPath"]);
const BACKGROUND_LORE = Object.freeze({ legal: "legal", warfare: "warfare" });
const ABILITIES = Object.freeze({
  str: "str", dex: "dex", con: "con", int: "int", wis: "wis", cha: "cha",
  strength: "str", dexterity: "dex", constitution: "con", intelligence: "int",
  wisdom: "wis", charisma: "cha"
});

const DECLARATION_FIELDS = Object.freeze({
  name: "name", ancestry: "ancestry", heritage: "heritage", background: "background",
  class: "class", "key ability": "keyAbility", racket: "classPath",
  methodology: "classPath", "class path": "classPath",
  "background lore": "backgroundLore"
});
// Declarations that bind one named bridge of a multi-bridge class (Wizard).
const BRIDGE_DECLARATIONS = Object.freeze({
  school: "Arcane School", "arcane school": "Arcane School",
  thesis: "Arcane Thesis", "arcane thesis": "Arcane Thesis"
});
const BRIDGE_SLOT = "classPaths\u0000";

const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" ? value.trim() : "";
const fieldLabel = (field) => ({ classPath: "class path", classPaths: "class path", keyAbility: "key ability", backgroundLore: "background Lore" })[field] ?? field;
const displayField = (field) => {
  const label = field === "keyAbility" ? "key ability" : fieldLabel(field);
  return label.charAt(0).toLocaleUpperCase() + label.slice(1);
};

function identityError(code, field, detail) {
  const error = new Error(`Required character choices (${displayField(field)}): ${detail}`);
  error.code = code;
  error.field = field;
  return error;
}

function fail(code, field, detail) {
  throw identityError(code, field, detail);
}

/** Return the stable, local source key for an issued candidate. */
export function pcIdentityKey(candidate) {
  const packId = candidate?.ref?.packId;
  const documentId = candidate?.ref?._id;
  return typeof packId === "string" && packId.length > 0
    && typeof documentId === "string" && documentId.length > 0
    ? `${packId}:${documentId}` : "";
}

function candidateUsable(candidate) {
  return isObject(candidate) && typeof candidate.name === "string" && candidate.name.trim().length > 0
    && pcIdentityKey(candidate) !== "";
}

/** Names of the bridges that offer these class-path candidates, in first-seen order. */
export function classPathBridges(candidates) {
  const names = [];
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (typeof candidate?.bridge === "string" && candidate.bridge && !names.includes(candidate.bridge)) names.push(candidate.bridge);
  }
  return names;
}

const bridgeSlot = (bridge) => `${BRIDGE_SLOT}${bridge}`;
const isBridgeSlot = (slot) => typeof slot === "string" && slot.startsWith(BRIDGE_SLOT);

/** Catalog candidates offered by exactly this bridge. */
function bridgeCatalog(catalogs, bridge) {
  return catalog(catalogs, "classPath").filter((candidate) => candidate?.bridge === bridge);
}

function catalog(catalogs, field) {
  const value = catalogs?.[field];
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail("PC_IDENTITY_CATALOG", field, "the offered catalog must be an array");
  return value;
}

function normalizedName(value) {
  return text(value).toLocaleLowerCase();
}

function candidateByKey(list, key, field) {
  if (typeof key !== "string" || !key.trim()) {
    fail("PC_IDENTITY_CONTROL", field, "set Required choices to an offered stable key");
  }
  const matches = list.filter((candidate) => candidateUsable(candidate) && pcIdentityKey(candidate) === key);
  if (matches.length !== 1) {
    fail("PC_IDENTITY_UNKNOWN", field, "the selected stable key is stale or was not offered");
  }
  return matches[0];
}

function candidateByName(list, value, field, source = "declaration") {
  const wanted = normalizedName(value);
  if (!wanted) fail("PC_IDENTITY_UNKNOWN", field, `${source} must name an offered candidate`);
  const matches = list.filter((candidate) => candidateUsable(candidate)
    && normalizedName(candidate.name) === wanted);
  if (!matches.length) {
    fail("PC_IDENTITY_UNKNOWN", field, `${source} does not match an offered catalog name`);
  }
  if (matches.length > 1) {
    fail("PC_IDENTITY_DUPLICATE", field, `${source} matches duplicate offered candidates; set Required choices for ${fieldLabel(field)}`);
  }
  return matches[0];
}

function parseAbility(value, field, source) {
  const key = normalizedName(value);
  if (!Object.hasOwn(ABILITIES, key)) {
    fail("PC_IDENTITY_UNKNOWN", field, `${source} must use an offered key ability`);
  }
  return ABILITIES[key];
}

function parseBackgroundLore(value, source) {
  const key = normalizedName(value);
  if (Object.hasOwn(BACKGROUND_LORE, key)) return BACKGROUND_LORE[key];
  if (key === "legal lore") return "legal";
  if (key === "warfare lore") return "warfare";
  fail("PC_IDENTITY_UNKNOWN", "backgroundLore", `${source} must use Legal Lore or Warfare Lore`);
}

function declarationParts(prompt) {
  const free = [];
  const declarations = [];
  const parts = String(prompt ?? "").split(/[;\n]+/);
  const labels = [...Object.keys(DECLARATION_FIELDS), ...Object.keys(BRIDGE_DECLARATIONS)].map((label) => label.replaceAll(" ", "\\s+"));
  const declarationPattern = new RegExp(`^\\s*(${labels.join("|")})\\s*:\\s*(.*?)\\s*$`, "iu");
  for (const part of parts) {
    const match = part.match(declarationPattern);
    if (!match) {
      free.push(part);
      continue;
    }
    const label = match[1].replace(/\s+/g, " ").toLocaleLowerCase();
    if (Object.hasOwn(BRIDGE_DECLARATIONS, label)) {
      declarations.push({ field: "classPaths", bridge: BRIDGE_DECLARATIONS[label], value: match[2] });
    } else {
      declarations.push({ field: DECLARATION_FIELDS[label], value: match[2] });
    }
  }
  return { freeText: free.join(" "), declarations };
}

function explicitControls(choices, catalogs) {
  if (!isObject(choices)) fail("PC_IDENTITY_CONTROL", "choices", "Required choices must be an object");
  const result = new Map();
  if (has(choices, "name")) {
    if (typeof choices.name === "string" && !choices.name.trim()) {
      // Empty form controls mean "no requirement".  A literal name is
      // authoritative only once the user supplies one.
    } else {
    if (typeof choices.name !== "string" || !text(choices.name)) {
      fail("PC_IDENTITY_CONTROL", "name", "set a non-empty literal name");
    }
    if (choices.name.trim().length > 120) fail("PC_IDENTITY_CONTROL", "name", "literal names are limited to 120 characters");
    result.set("name", choices.name.trim());
    }
  }
  if (has(choices, "keyAbility")) {
    if (typeof choices.keyAbility === "string" && !choices.keyAbility.trim()) {
      // Empty select controls are unconstrained.
    } else {
    if (typeof choices.keyAbility !== "string" || !Object.hasOwn(ABILITIES, choices.keyAbility)) {
      fail("PC_IDENTITY_CONTROL", "keyAbility", "set one of str, dex, con, int, wis, or cha");
    }
    // Controls intentionally accept enum slugs only, even though declarations
    // also accept the display names.
    if (ABILITIES[choices.keyAbility] !== choices.keyAbility || choices.keyAbility.length !== 3) {
      fail("PC_IDENTITY_CONTROL", "keyAbility", "set one of str, dex, con, int, wis, or cha");
    }
    result.set("keyAbility", choices.keyAbility);
    }
  }
  if (has(choices, "backgroundLore") && choices.backgroundLore !== "") {
    if (typeof choices.backgroundLore !== "string") fail("PC_IDENTITY_CONTROL", "backgroundLore", "set legal or warfare");
    if (!Object.hasOwn(BACKGROUND_LORE, choices.backgroundLore)) {
      fail("PC_IDENTITY_CONTROL", "backgroundLore", "set the enum slug legal or warfare");
    }
    result.set("backgroundLore", choices.backgroundLore);
  }
  for (const field of CATALOG_FIELDS) {
    if (!has(choices, field)) continue;
    if (typeof choices[field] === "string" && !choices[field].trim()) continue;
    if (field === "heritage" && (choices[field] === null || normalizedName(choices[field]) === "none")) {
      result.set(field, null);
      continue;
    }
    result.set(field, candidateByKey(catalog(catalogs, field), choices[field], field));
  }
  if (has(choices, "classPaths") && choices.classPaths !== undefined && choices.classPaths !== null) {
    if (!isObject(choices.classPaths)) {
      fail("PC_IDENTITY_CONTROL", "classPaths", "set per-bridge class paths as an object keyed by bridge name");
    }
    for (const [bridge, key] of Object.entries(choices.classPaths)) {
      if (typeof key === "string" && !key.trim()) continue;
      result.set(bridgeSlot(bridge), candidateByKey(bridgeCatalog(catalogs, bridge), key, "classPaths"));
    }
  }
  return result;
}

function declarationValues(parsed, catalogs) {
  const result = new Map();
  for (const declaration of parsed.declarations) {
    const { field, bridge, value } = declaration;
    const slot = bridge === undefined ? field : bridgeSlot(bridge);
    if (result.has(slot)) fail("PC_IDENTITY_DUPLICATE", field, "duplicate identity declarations are ambiguous");
    if (!text(value)) fail("PC_IDENTITY_UNKNOWN", field, "the declaration needs a value");
    if (bridge !== undefined) {
      result.set(slot, candidateByName(bridgeCatalog(catalogs, bridge), value, field));
    } else if (field === "name") {
      if (value.trim().length > 120) fail("PC_IDENTITY_CONTROL", field, "literal names are limited to 120 characters");
      result.set(field, value.trim());
    } else if (field === "keyAbility") {
      result.set(field, parseAbility(value, field, "the declaration"));
    } else if (field === "backgroundLore") {
      result.set(field, parseBackgroundLore(value, "the declaration"));
    } else if (field === "heritage" && normalizedName(value) === "none") {
      result.set(field, null);
    } else {
      result.set(field, candidateByName(catalog(catalogs, field), value, field));
    }
  }
  return result;
}

function sameValue(field, left, right) {
  if (field === "name" || field === "keyAbility" || field === "backgroundLore") return left === right;
  if (left === null || right === null) return left === right;
  return pcIdentityKey(left) !== "" && pcIdentityKey(left) === pcIdentityKey(right);
}

function combine(explicit, declared) {
  const result = new Map(explicit);
  for (const [field, value] of declared) {
    if (result.has(field) && !sameValue(field, result.get(field), value)) {
      fail("PC_IDENTITY_CONFLICT", isBridgeSlot(field) ? "classPaths" : field, "Required choices conflict with the declared constraint");
    }
    if (!result.has(field)) result.set(field, value);
  }
  return result;
}

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentions(textValue, field, list) {
  const names = new Map();
  for (const candidate of list) {
    if (!candidateUsable(candidate)) continue;
    const key = normalizedName(candidate.name);
    const existing = names.get(key) ?? { field, name: candidate.name, candidates: [] };
    existing.candidates.push(candidate);
    names.set(key, existing);
  }
  const found = [];
  for (const entry of names.values()) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped(text(entry.name))}(?![\\p{L}\\p{N}_])`, "giu");
    for (const match of textValue.matchAll(pattern)) {
      found.push({ ...entry, start: match.index, end: match.index + match[0].length });
    }
  }
  return found;
}

function overlapping(a, b) {
  return a.start < b.end && b.start < a.end;
}

function proseAmbiguity(parsed, resolved, catalogs) {
  const freeText = parsed.freeText;
  const allMentions = CATALOG_FIELDS.flatMap((field) => mentions(freeText, field, catalog(catalogs, field)))
    .sort((a, b) => b.name.length - a.name.length || a.start - b.start);
  const chosenMentions = [];
  for (const mention of allMentions) {
    if (!chosenMentions.some((chosen) => overlapping(chosen, mention))) chosenMentions.push(mention);
  }
  const pathResolved = (mention) => mention.field === "classPath"
    && mention.candidates.some((candidate) => typeof candidate.bridge === "string" && resolved.has(bridgeSlot(candidate.bridge)));
  for (const mention of chosenMentions) {
    if (resolved.has(mention.field) || pathResolved(mention)) continue;
    if (mention.candidates.length > 1) {
      fail("PC_IDENTITY_DUPLICATE", mention.field, `prose names duplicate offered candidates; set Required choices for ${fieldLabel(mention.field)}`);
    }
    fail("PC_IDENTITY_AMBIGUOUS", mention.field, `prose mentions an identity; set Required choices for ${fieldLabel(mention.field)}`);
  }

  const markerChecks = [
    ["classPath", /\b(?:racket|methodology|class\s+path)\b/iu],
    ["name", /\b(?:character|hero|adventurer)\s+(?:named|called)\b/iu],
    ["keyAbility", /\bkey\s+ability\b/iu]
  ];
  // Only "racket", "methodology" and "class path" mark a class-path request in
  // prose. "school" and "thesis" are ordinary backstory words, so they bind
  // only through a control or a declaration.
  const anyPath = resolved.has("classPath") || [...resolved.keys()].some(isBridgeSlot);
  for (const [field, pattern] of markerChecks) {
    if (!(field === "classPath" ? anyPath : resolved.has(field)) && pattern.test(freeText)) {
      fail("PC_IDENTITY_AMBIGUOUS", field, `prose marks an identity request; set Required choices for ${fieldLabel(field)}`);
    }
  }

}

/**
 * Whether a bridge-labelled alias belongs in the per-bridge map: its class has
 * several path bridges (Wizard). The class is the resolved class, else the
 * classes the catalog candidate is related to (`classKeys`); without either
 * the class is unknown and the alias stays as given.
 */
function aliasBelongsToBridgeMap(alias, classCandidate, catalogs) {
  const classKeys = classCandidate ? [pcIdentityKey(classCandidate)] : Array.isArray(alias.classKeys) ? alias.classKeys : null;
  if (!classKeys) return false;
  const scoped = catalog(catalogs, "classPath").filter((candidate) =>
    !Array.isArray(candidate?.classKeys) || candidate.classKeys.some((key) => classKeys.includes(key)));
  return classPathBridges(scoped).length > 1;
}

/** Resolve only explicit controls/declarations into a bounded PC identity. */
export function resolvePCIdentity({ prompt = "", choices = {}, catalogs = {}, isRandom = false } = {}) {
  if (isRandom) return {};
  const controls = explicitControls(choices, catalogs);
  const parsed = declarationParts(prompt);
  const declared = declarationValues(parsed, catalogs);
  const resolved = combine(controls, declared);
  const alias = resolved.get("classPath");
  if (alias && typeof alias.bridge === "string" && resolved.has(bridgeSlot(alias.bridge))
    && !sameValue("classPaths", resolved.get(bridgeSlot(alias.bridge)), alias)) {
    fail("PC_IDENTITY_CONFLICT", "classPath", `the class path conflicts with the class path required for ${alias.bridge}`);
  }
  // A bridge-labelled alias of a multi-bridge class (Wizard) is the requirement
  // for that bridge: normalize it into the per-bridge map so the Arcane School
  // or Arcane Thesis control, which reads only that map, shows it selected.
  if (alias && typeof alias.bridge === "string" && alias.bridge && !resolved.has(bridgeSlot(alias.bridge))
    && aliasBelongsToBridgeMap(alias, resolved.get("class") ?? null, catalogs)) {
    resolved.set(bridgeSlot(alias.bridge), alias);
    resolved.delete("classPath");
  }
  if (resolved.has("backgroundLore")) {
    if (!resolved.has("background") || !getBackgroundLoreOptions(resolved.get("background")).length) {
      fail("PC_IDENTITY_CONFLICT", "backgroundLore", "Background Lore requires the exact published Guard background");
    }
  }
  proseAmbiguity(parsed, resolved, catalogs);

  const identity = {};
  for (const field of ["name", "keyAbility", "backgroundLore", ...CATALOG_FIELDS]) {
    if (resolved.has(field)) identity[field] = resolved.get(field);
  }
  const paths = [...resolved].filter(([slot]) => isBridgeSlot(slot)).map(([, candidate]) => [candidate.bridge, candidate]);
  if (paths.length) identity.classPaths = Object.fromEntries(paths);
  return identity;
}

function applyCandidate(concept, field, candidate) {
  if (!candidateUsable(candidate)) fail("PC_IDENTITY_APPLY", field, "identity contains an invalid candidate record");
  concept[field] = candidate.name;
  concept[`${field}Candidate`] = candidate.ref;
}

/** Apply a resolved identity to a module-owned concept in place. */
export function applyPCIdentity(concept, identity = {}) {
  if (!isObject(concept) || !isObject(identity)) fail("PC_IDENTITY_APPLY", "concept", "concept and identity must be objects");
  if (has(identity, "name")) concept.name = identity.name;
  if (has(identity, "keyAbility")) concept.keyAbility = identity.keyAbility;
  if (has(identity, "backgroundLore")) concept.backgroundLore = identity.backgroundLore;
  for (const field of CATALOG_FIELDS) {
    if (!has(identity, field)) continue;
    if (field === "heritage" && identity[field] === null) {
      concept.heritage = null;
      concept.heritageCandidate = null;
    } else {
      applyCandidate(concept, field, identity[field]);
    }
  }
  if (has(identity, "classPaths")) {
    if (!isObject(identity.classPaths)) fail("PC_IDENTITY_APPLY", "classPaths", "identity class paths must be an object keyed by bridge name");
    const entries = Object.entries(identity.classPaths);
    if (!entries.every(([, candidate]) => candidateUsable(candidate))) {
      fail("PC_IDENTITY_APPLY", "classPaths", "identity contains an invalid candidate record");
    }
    concept.classPaths = Object.fromEntries(entries.map(([bridge, candidate]) => [bridge, candidate.name]));
    concept.classPathCandidates = Object.fromEntries(entries.map(([bridge, candidate]) => [bridge, candidate.ref]));
  }
  return concept;
}

function conceptRef(value) {
  if (value?.ref && pcIdentityKey(value) !== "") return value.ref;
  return value;
}

/** Assert that a concept retained every constrained identity value exactly. */
export function assertPCIdentity(concept, identity = {}) {
  if (!isObject(concept) || !isObject(identity)) fail("PC_IDENTITY_ASSERT", "concept", "concept and identity must be objects");
  if (has(identity, "name") && concept.name !== identity.name) {
    fail("PC_IDENTITY_ASSERT", "name", "concept name does not match the required literal");
  }
  if (has(identity, "keyAbility") && concept.keyAbility !== identity.keyAbility) {
    fail("PC_IDENTITY_ASSERT", "keyAbility", "concept key ability does not match the required value");
  }
  if (has(identity, "backgroundLore") && concept.backgroundLore !== identity.backgroundLore) {
    fail("PC_IDENTITY_ASSERT", "backgroundLore", "concept background Lore does not match the required value");
  }
  for (const field of CATALOG_FIELDS) {
    if (!has(identity, field)) continue;
    const expected = identity[field];
    if (field === "heritage" && expected === null) {
      if (concept.heritage !== null || concept.heritageCandidate != null) {
        fail("PC_IDENTITY_ASSERT", field, "concept must retain an explicit null heritage");
      }
      continue;
    }
    if (!candidateUsable(expected)
      || concept[field] !== expected.name
      || pcIdentityKey({ ref: conceptRef(concept[`${field}Candidate`]) }) !== pcIdentityKey(expected)) {
      fail("PC_IDENTITY_ASSERT", field, "concept candidate does not retain the required source identity");
    }
  }
  if (has(identity, "classPaths")) {
    if (!isObject(identity.classPaths)) fail("PC_IDENTITY_ASSERT", "classPaths", "identity class paths must be an object keyed by bridge name");
    const names = isObject(concept.classPaths) ? concept.classPaths : {};
    const refs = isObject(concept.classPathCandidates) ? concept.classPathCandidates : {};
    for (const [bridge, expected] of Object.entries(identity.classPaths)) {
      if (!candidateUsable(expected)
        || !Object.hasOwn(names, bridge) || names[bridge] !== expected.name
        || !Object.hasOwn(refs, bridge) || pcIdentityKey({ ref: conceptRef(refs[bridge]) }) !== pcIdentityKey(expected)) {
        fail("PC_IDENTITY_ASSERT", "classPaths", `concept class path for ${bridge} does not retain the required source identity`);
      }
    }
  }
  return true;
}
