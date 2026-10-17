// Ordinary multiclass (C08): the noncaster archetype catalog and the dedication
// lock. Names are PF2e 8.5.0 source data; every name must match a compendium
// feat exactly, and anything not listed is unavailable.
//
// Lock rules (PF2e archetype rules, evaluated over the ordered feat list):
//   - A dedication cannot be the PC's own class.
//   - A dedication may be taken only when no other package is in progress, or
//     after two other feats of the current package have been taken.
//   - A package feat needs its dedication held and any named feat prerequisite.
// Removing a dedication therefore invalidates its later feats on re-validation.

import { slugify } from "./text.mjs";

/** @type {ReadonlyArray<{slug: string, dedication: string, feats: {name: string, requires: readonly string[]}[]}>} */
export const MULTICLASS_PACKAGES = Object.freeze([
  Object.freeze({
    slug: "fighter",
    dedication: "Fighter Dedication",
    feats: Object.freeze([
      Object.freeze({ name: "Basic Maneuver", requires: Object.freeze([]) }),
      Object.freeze({ name: "Reactive Striker", requires: Object.freeze([]) })
    ])
  }),
  Object.freeze({
    slug: "investigator",
    dedication: "Investigator Dedication",
    feats: Object.freeze([
      Object.freeze({ name: "Basic Deduction", requires: Object.freeze([]) }),
      Object.freeze({ name: "Investigator's Stratagem", requires: Object.freeze([]) }),
      Object.freeze({ name: "Keen Recollection", requires: Object.freeze([]) })
    ])
  }),
  Object.freeze({
    slug: "barbarian",
    dedication: "Barbarian Dedication",
    feats: Object.freeze([
      Object.freeze({ name: "Basic Fury", requires: Object.freeze([]) }),
      Object.freeze({ name: "Instinct Ability", requires: Object.freeze([]) }),
      Object.freeze({ name: "Advanced Fury", requires: Object.freeze(["Basic Fury"]) })
    ])
  }),
  Object.freeze({
    slug: "monk",
    dedication: "Monk Dedication",
    feats: Object.freeze([
      Object.freeze({ name: "Monk Moves", requires: Object.freeze([]) }),
      Object.freeze({ name: "Monk's Flurry", requires: Object.freeze([]) })
    ])
  }),
  Object.freeze({ slug: "ranger", dedication: "Ranger Dedication", feats: Object.freeze([]) })
]);

/**
 * Catalog members deliberately left unavailable, each with the reason. Kept as
 * data so tests and the chunk doc share one list.
 */
export const MULTICLASS_UNAVAILABLE = Object.freeze([
  Object.freeze({ name: "Rogue Dedication", reason: "choice-bearing dedication (compendium-query ChoiceSets cannot be restricted to noncaster options); whole package unavailable" }),
  Object.freeze({ name: "Basic Trickery", reason: "ChoiceSet query includes caster-only class feats; cannot be restricted" }),
  Object.freeze({ name: "Advanced Trickery", reason: "requires Basic Trickery" }),
  Object.freeze({ name: "Sneak Attacker", reason: "requires Rogue Dedication" }),
  Object.freeze({ name: "Uncanny Dodge", reason: "requires Rogue Dedication" }),
  Object.freeze({ name: "Basic Kata", reason: "ChoiceSet query includes caster-only class feats; cannot be restricted" }),
  Object.freeze({ name: "Advanced Kata", reason: "requires Basic Kata" }),
  Object.freeze({ name: "Monk Resiliency", reason: "class-HP prerequisite is not provable by the staged evaluator" }),
  Object.freeze({ name: "Perfection's Path", reason: "expert-save prerequisite is not provable by the staged evaluator" }),
  Object.freeze({ name: "Basic Hunter's Trick", reason: "ChoiceSet query includes caster-only class feats; cannot be restricted" }),
  Object.freeze({ name: "Advanced Hunter's Trick", reason: "requires Basic Hunter's Trick" }),
  Object.freeze({ name: "Master Spotter (Ranger)", reason: "expert Perception prerequisite is not provable by the staged evaluator" }),
  Object.freeze({ name: "Ranger Resiliency", reason: "class-HP prerequisite is not provable by the staged evaluator" }),
  Object.freeze({ name: "Advanced Maneuver", reason: "grants an extra fighter feat with no slot to place it in" }),
  Object.freeze({ name: "Advanced Deduction", reason: "grants an extra investigator feat with no slot to place it in" }),
  Object.freeze({ name: "Fighter Resiliency", reason: "class-HP prerequisite is not provable by the staged evaluator" }),
  Object.freeze({ name: "Diverse Weapon Expert", reason: "expert-weapon prerequisite is not provable by the staged evaluator" }),
  Object.freeze({ name: "Master Spotter (Investigator)", reason: "expert Perception prerequisite is not provable by the staged evaluator" }),
  Object.freeze({ name: "Barbarian Resiliency", reason: "class-HP prerequisite is not provable by the staged evaluator" }),
  Object.freeze({ name: "Juggernaut's Fortitude", reason: "expert-save prerequisite is not provable by the staged evaluator" })
]);

const BY_SLUG = new Map();
for (const pkg of MULTICLASS_PACKAGES) {
  BY_SLUG.set(slugify(pkg.dedication), { name: pkg.dedication, pkg: pkg.slug, role: "dedication", requires: [] });
  for (const feat of pkg.feats) {
    BY_SLUG.set(slugify(feat.name), { name: feat.name, pkg: pkg.slug, role: "feat", requires: [...feat.requires] });
  }
}

/** Exact catalog names (dedications and feats), for compendium allow-listing. */
export function multiclassCatalogNames() {
  return [...BY_SLUG.values()].map((entry) => entry.name);
}

/** @returns {{name: string, pkg: string, role: "dedication"|"feat", requires: string[]}|null} */
export function multiclassFeatInfo(name) {
  if (typeof name !== "string") return null;
  return BY_SLUG.get(slugify(name)) ?? null;
}

/**
 * Walk an ordered feat-name list (slot order; null for empty slots) and return
 * every catalog pick that violates the lock. Non-catalog names are ignored here:
 * ordinary feat rules are enforced by the existing prerequisite path. Blocked
 * picks are not counted as held, so their dependents are blocked too.
 * @param {(string|null)[]} names
 * @param {string} className the PC's primary complete class
 * @returns {{index: number, name: string, reason: string}[]}
 */
export function multiclassBlockers(names, className) {
  const ownClass = slugify(String(className ?? ""));
  const blocked = [];
  const held = new Set();
  let current = null;
  let others = 0;
  names.forEach((name, index) => {
    const info = multiclassFeatInfo(name);
    if (!info) return;
    let reason = null;
    if (info.role === "dedication") {
      if (info.pkg === ownClass) reason = `${info.name} is a dedication of your own class`;
      else if (current && current.pkg === info.pkg) reason = `${info.name} is already held`;
      else if (current && others < 2) reason = `complete ${current.name} (two more feats) before ${info.name}`;
    } else if (!current || current.pkg !== info.pkg) {
      reason = `${info.name} needs ${packageDedication(info.pkg)} first`;
    } else {
      const missing = info.requires.find((req) => !held.has(slugify(req)));
      if (missing) reason = `${info.name} needs ${missing} first`;
    }
    if (reason) {
      blocked.push({ index, name, reason });
      return;
    }
    held.add(slugify(info.name));
    if (info.role === "dedication") {
      current = { name: info.name, pkg: info.pkg };
      others = 0;
    } else {
      others += 1;
    }
  });
  return blocked;
}

/**
 * Reason the candidate cannot be placed after `priorNames`, or null when it can.
 * @param {(string|null)[]} priorNames accepted feat names before this slot, in slot order
 * @param {string} name candidate feat name
 * @param {string} className
 * @returns {string|null}
 */
export function multiclassPickBlocker(priorNames, name, className) {
  const list = [...priorNames, name];
  const hit = multiclassBlockers(list, className).find((entry) => entry.index === list.length - 1);
  return hit?.reason ?? null;
}

function packageDedication(slug) {
  return MULTICLASS_PACKAGES.find((pkg) => pkg.slug === slug)?.dedication ?? slug;
}
