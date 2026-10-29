// Regression check for issue #64 item 1: a character's bonus language slots
// are the ancestry's own `additionalLanguages.count` PLUS their Intelligence
// modifier. The old code capped at count only, silently truncating the AI's
// extra language picks for high-Int characters.
// Run: node tests/pc-builder.languages.test.mjs

import assert from "node:assert/strict";

// Minimal globals the real resolveLanguages reads at call time.
const KNOWN = { dwarven: "Dwarven", elven: "Elven", goblin: "Goblin", draconic: "Draconic", common: "Common" };
globalThis.CONFIG = { PF2E: { languages: KNOWN } };
globalThis.game = { i18n: { localize: (label) => label } };

const { resolveLanguages } = await import("../scripts/pc-builder.mjs");

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
