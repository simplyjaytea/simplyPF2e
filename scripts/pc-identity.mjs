/*
 * The PC identity boundary is deliberately small. Controls carry opaque
 * source keys, and declaration-shaped prose can bind exact catalog names.
 * Other free prose can only make a request ambiguous; it can never select an
 * ABC document by itself.
 */

import { getBackgroundLoreOptions } from "./pc-background-lore.mjs";

const CATALOG_FIELDS = Object.freeze(["ancestry", "heritage", "background", "class", "classPath"]);
const BACKGROUND_LORE = Object.freeze({ legal: "legal", warfare: "warfare" });
const ABILITIES = Object.freeze({
  str: "str", dex: "dex", con: "con", int: "int", wis: "wis", cha: "cha",
  strength: "str", dexterity: "dex", constitution: "con", intelligence: "int",
  wisdom: "wis", charisma: "cha"
});
const ABILITY_NAMES = Object.freeze(Object.keys(ABILITIES).filter((key) => key.length > 3));

const DECLARATION_FIELDS = Object.freeze({
  name: "name", ancestry: "ancestry", heritage: "heritage", background: "background",
  class: "class", "key ability": "keyAbility", racket: "classPath",
  methodology: "classPath", "class path": "classPath",
  "background lore": "backgroundLore"
});

const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" ? value.trim() : "";
const fieldLabel = (field) => ({ classPath: "class path", keyAbility: "key ability", backgroundLore: "background Lore" })[field] ?? field;
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
  const labels = Object.keys(DECLARATION_FIELDS).map((label) => label.replaceAll(" ", "\\s+"));
  const declarationPattern = new RegExp(`^\\s*(${labels.join("|")})\\s*:\\s*(.*?)\\s*$`, "iu");
  for (const part of parts) {
    const match = part.match(declarationPattern);
    if (!match) {
      free.push(part);
      continue;
    }
    const label = match[1].replace(/\s+/g, " ").toLocaleLowerCase();
    declarations.push({ field: DECLARATION_FIELDS[label], value: match[2] });
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
  return result;
}

function declarationValues(parsed, catalogs) {
  const result = new Map();
  for (const declaration of parsed.declarations) {
    const { field, value } = declaration;
    if (result.has(field)) fail("PC_IDENTITY_DUPLICATE", field, "duplicate identity declarations are ambiguous");
    if (!text(value)) fail("PC_IDENTITY_UNKNOWN", field, "the declaration needs a value");
    if (field === "name") {
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
      fail("PC_IDENTITY_CONFLICT", field, "Required choices conflict with the declared constraint");
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
  for (const mention of chosenMentions) {
    if (resolved.has(mention.field)) continue;
    if (mention.candidates.length > 1) {
      fail("PC_IDENTITY_DUPLICATE", mention.field, `prose names duplicate offered candidates; set Required choices for ${fieldLabel(mention.field)}`);
    }
    fail("PC_IDENTITY_AMBIGUOUS", mention.field, `prose mentions an identity; set Required choices for ${fieldLabel(mention.field)}`);
  }

  const markerChecks = [
    ["classPath", /\b(?:racket|methodology|class\s+path)\b/iu],
    ["class", /\bclass\b/iu], ["ancestry", /\bancestry\b/iu],
    ["heritage", /\bheritage\b/iu], ["background", /\bbackground\b/iu],
    ["name", /\b(?:named|called)\b/iu], ["keyAbility", /\bkey\s+ability\b/iu]
  ];
  for (const [field, pattern] of markerChecks) {
    if (!resolved.has(field) && pattern.test(freeText)) {
      fail("PC_IDENTITY_AMBIGUOUS", field, `prose marks an identity request; set Required choices for ${fieldLabel(field)}`);
    }
  }
  if (!resolved.has("keyAbility")) {
    const fullAbility = new RegExp(`\\b(?:${ABILITY_NAMES.join("|")})\\b`, "iu");
    if (fullAbility.test(freeText)) {
      fail("PC_IDENTITY_AMBIGUOUS", "keyAbility", "prose mentions an ability; set Required choices for key ability");
    }
  }
}

/** Resolve only explicit controls/declarations into a bounded PC identity. */
export function resolvePCIdentity({ prompt = "", choices = {}, catalogs = {}, isRandom = false } = {}) {
  if (isRandom) return {};
  const controls = explicitControls(choices, catalogs);
  const parsed = declarationParts(prompt);
  const declared = declarationValues(parsed, catalogs);
  const resolved = combine(controls, declared);
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
  return true;
}
