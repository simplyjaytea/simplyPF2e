// Regression check for the confirmed bug: heritage was resolved via
// findEntry with only `e.type === "heritage"` — nothing checked that the
// resolved heritage's `system.ancestry` link actually matched the resolved
// ancestry, so a fuzzy-matched or non-compliant AI pick could silently embed
// another ancestry's heritage (e.g. a Dwarf character with the Cavern Elf
// heritage).
//
// Verified against real pf2e source (foundryvtt/pf2e master):
//   - src/module/item/heritage/data.ts (HeritageSystemSchema): `ancestry` is
//     a SchemaField, `{required: true, nullable: true, initial: null}`, with
//     sub-fields `{name: StringField, slug: SlugField, uuid:
//     DocumentUUIDField}`.
//   - packs/heritages/dwarf/rock-dwarf.json: a normal heritage —
//     `"ancestry": {"name": "Dwarf", "slug": "dwarf", "uuid":
//     "Compendium.pf2e.ancestries.Item.BYj5ZvlXZdpaEgA6"}`.
//   - packs/heritages/versatile-heritages/dhampir.json: a versatile
//     heritage — `"ancestry": null` (valid for ANY ancestry).
//   - src/module/item/base/data/model.ts: every item also has a base
//     `system.slug` (nullable, auto-derived from name).
//
// heritageMatchesAncestry() is pure (no foundry/game globals) so this
// imports the real function directly.
// Run: node scripts/pc-builder.heritageAncestry.test.mjs

import assert from "node:assert/strict";
import { heritageMatchesAncestry } from "./pc-builder.mjs";

const dwarfAncestry = {
  name: "Dwarf",
  uuid: "Compendium.pf2e.ancestries.Item.BYj5ZvlXZdpaEgA6",
  system: { slug: "dwarf" }
};
const elfAncestry = {
  name: "Elf",
  uuid: "Compendium.pf2e.ancestries.Item.SomeElfId0000",
  system: { slug: "elf" }
};

const rockDwarfHeritage = {
  system: { ancestry: { name: "Dwarf", slug: "dwarf", uuid: "Compendium.pf2e.ancestries.Item.BYj5ZvlXZdpaEgA6" } }
};
const cavernElfHeritage = {
  system: { ancestry: { name: "Elf", slug: "elf", uuid: "Compendium.pf2e.ancestries.Item.SomeElfId0000" } }
};
const dhampirHeritage = { system: { ancestry: null } };

// 1. Matching heritage (same uuid) is accepted.
assert.equal(
  heritageMatchesAncestry(rockDwarfHeritage, dwarfAncestry), true,
  "a heritage whose ancestry link uuid matches the resolved ancestry is accepted"
);

// 2. Mismatched heritage (this is the bug) is rejected.
assert.equal(
  heritageMatchesAncestry(cavernElfHeritage, dwarfAncestry), false,
  "an Elf-only heritage must be rejected for a Dwarf ancestry — this was the silent-embed bug"
);

// 3. A versatile heritage (system.ancestry === null) is valid for ANY ancestry.
assert.equal(
  heritageMatchesAncestry(dhampirHeritage, dwarfAncestry), true,
  "a versatile heritage (ancestry: null) is valid for any ancestry"
);
assert.equal(
  heritageMatchesAncestry(dhampirHeritage, elfAncestry), true,
  "a versatile heritage stays valid when checked against a different ancestry"
);

// 4. Slug fallback: uuid doesn't match (different pack/id) but slug does.
const rockDwarfBySlugOnly = {
  system: { ancestry: { name: "Dwarf", slug: "dwarf", uuid: "Compendium.some-other-pack.ancestries.Item.XXXX" } }
};
assert.equal(
  heritageMatchesAncestry(rockDwarfBySlugOnly, dwarfAncestry), true,
  "a heritage whose ancestry link uuid differs but slug matches is still accepted"
);

// 5. Ancestry doc missing system.slug falls back to slugify(name).
const dwarfAncestryNoSlug = { name: "Dwarf", uuid: "Compendium.pf2e.ancestries.Item.BYj5ZvlXZdpaEgA6", system: {} };
assert.equal(
  heritageMatchesAncestry(rockDwarfHeritage, dwarfAncestryNoSlug), true,
  "an ancestry doc with no system.slug still matches via slugify(name) fallback"
);

// 6. No ancestry doc at all — fail closed, never crash.
assert.equal(
  heritageMatchesAncestry(rockDwarfHeritage, null), false,
  "a null ancestryDoc is rejected rather than throwing"
);

console.log("pc-builder heritage/ancestry regression check: all assertions passed");
