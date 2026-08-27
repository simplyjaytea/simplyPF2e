// PF2e renamed the creature-family glossary in v8. The module supports PF2e
// 6+, so its defaults must accept either collection without warning users.
// Run: node scripts/compendium.packDefaults.test.mjs
import assert from "node:assert/strict";

let storedSources = {};
const installed = new Map();
globalThis.game = {
  settings: { get: () => storedSources },
  packs: installed
};

const { getPacksFor } = await import("./compendium.mjs");
const originalWarn = console.warn;
const warnings = [];
console.warn = (message) => warnings.push(message);

try {
  installed.set("pf2e.bestiary-ability-glossary-srd", {});
  installed.set("pf2e.bestiary-family-ability-glossary", {});
  assert.deepEqual(getPacksFor("abilities"), [
    "pf2e.bestiary-ability-glossary-srd",
    "pf2e.bestiary-family-ability-glossary"
  ]);
  assert.deepEqual(warnings, [], "version-alternative defaults must not emit missing-pack warnings");

  installed.delete("pf2e.bestiary-family-ability-glossary");
  installed.set("pf2e.bestiary-family-ability-glossary-srd", {});
  assert.deepEqual(getPacksFor("abilities"), [
    "pf2e.bestiary-ability-glossary-srd",
    "pf2e.bestiary-family-ability-glossary-srd"
  ], "older PF2e installs must retain their family glossary default");
  assert.deepEqual(warnings, []);

  storedSources = { abilities: ["module.missing-abilities"] };
  assert.deepEqual(getPacksFor("abilities"), [
    "pf2e.bestiary-ability-glossary-srd",
    "pf2e.bestiary-family-ability-glossary-srd"
  ], "an unavailable custom selection must fall back to installed system defaults");
  assert.equal(warnings.length, 2, "a missing configured pack and its fallback must remain visible to the GM");
  assert.match(warnings[0], /module\.missing-abilities/);
  assert.match(warnings[1], /falling back to system defaults/);
} finally {
  console.warn = originalWarn;
}

console.log("compendium.packDefaults.test.mjs: PF2e pack-version assertions passed");
