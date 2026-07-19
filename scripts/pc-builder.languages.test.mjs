// Regression check for issue #64 item 1: a character's bonus language slots
// are the ancestry's own `additionalLanguages.count` PLUS their Intelligence
// modifier. The old code capped at count only, silently truncating the AI's
// extra language picks for high-Int characters.
// Run: node scripts/pc-builder.languages.test.mjs
//
// resolveLanguages isn't exported and reads CONFIG/game globals, so the pure
// slice is copied verbatim below (source of truth — keep in sync). If the real
// logic diverges, update BOTH places.

import assert from "node:assert/strict";

// slugify copied from builder.mjs (source of truth).
const slugify = (value) =>
  String(value ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Minimal globals the copied slice reads.
const KNOWN = { dwarven: "Dwarven", elven: "Elven", goblin: "Goblin", draconic: "Draconic", common: "Common" };
globalThis.CONFIG = { PF2E: { languages: KNOWN } };
globalThis.game = { i18n: { localize: (label) => label } };

// --- Copied verbatim from scripts/pc-builder.mjs resolveLanguages() ---
function resolveLanguages(names, ancestryDoc, bonus = 0) {
  const known = CONFIG?.PF2E?.languages ?? {};
  const bySlug = new Set(Object.keys(known));
  const byLabel = new Map(
    Object.entries(known).map(([slug, label]) => [String(game.i18n.localize(label)).toLowerCase(), slug])
  );
  const additional = ancestryDoc?.system?.additionalLanguages ?? {};
  const max = Math.max(0, Math.round(Number(additional.count) || 0)) + Math.max(0, Math.round(Number(bonus) || 0));
  const allowed = Array.isArray(additional.value) && additional.value.length ? new Set(additional.value) : null;
  const automatic = new Set(ancestryDoc?.system?.languages?.value ?? []);

  const resolved = [];
  for (const raw of names) {
    if (resolved.length >= max) break;
    const text = String(raw).trim();
    if (!text) continue;
    const slug = bySlug.has(slugify(text)) ? slugify(text) : byLabel.get(text.toLowerCase()) ?? null;
    if (!slug || automatic.has(slug) || resolved.includes(slug)) continue;
    if (allowed && !allowed.has(slug)) continue;
    resolved.push(slug);
  }
  return resolved;
}

// Ancestry with 1 bonus-language slot and Common as an automatic language.
const ancestry = { system: { additionalLanguages: { count: 1 }, languages: { value: ["common"] } } };
const wishlist = ["Dwarven", "Elven", "Goblin", "Draconic"];

// bonus 0 -> only the ancestry's 1 slot is honored (the OLD, buggy behavior).
assert.deepEqual(resolveLanguages(wishlist, ancestry, 0), ["dwarven"], "count-only cap keeps just 1 language");

// bonus 2 (Int +2) -> 1 + 2 = 3 languages kept: the fix.
assert.deepEqual(resolveLanguages(wishlist, ancestry, 2), ["dwarven", "elven", "goblin"], "count + Int-mod bonus raises the cap to 3");

// A negative/garbage bonus never lowers the base count.
assert.deepEqual(resolveLanguages(wishlist, ancestry, -5), ["dwarven"], "negative bonus does not shrink the base cap");

// Automatic languages are never re-listed even if the AI names them.
assert.deepEqual(resolveLanguages(["Common", "Elven"], ancestry, 2), ["elven"], "automatic Common is skipped, not counted");

// Allowed-list restriction still applies on top of the raised cap.
const restricted = { system: { additionalLanguages: { count: 3, value: ["elven", "draconic"] }, languages: { value: [] } } };
assert.deepEqual(resolveLanguages(wishlist, restricted, 2), ["elven", "draconic"], "allowed-list still filters even with bonus slots");

console.log("pc-builder languages (Int-bonus) regression check: all assertions passed");
