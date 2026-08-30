import assert from "node:assert/strict";
import { verifyCreatedActor } from "./post-create.mjs";

const source = (uuid, data = {}) => ({ ...data, _stats: { ...(data._stats ?? {}), compendiumSource: uuid } });
const actor = (items) => ({ id: "created", items: { contents: items } });
const manifest = () => ({ complete: true, mode: "monster", records: [] });

const expected = [
  source("Compendium.pf2e.feats-srd.Item.power", { name: "Power Attack", type: "action" }),
  source("Compendium.pf2e.spells-srd.Item.fireball", {
    name: "Fireball", type: "spell", system: { location: { value: "arcane" } }
  }),
  { _id: "arcane", name: "Arcane Spells", type: "spellcastingEntry" },
  { name: "Gold Pieces", type: "treasure" },
  { name: "Narrative: Eerie Howl", type: "action" }
];
const created = [
  source("Compendium.pf2e.feats-srd.Item.power", { name: "Power Attack", type: "action" }),
  source("Compendium.pf2e.spells-srd.Item.fireball", {
    name: "Fireball", type: "spell", system: { location: { value: "arcane" } }
  }),
  { id: "arcane", name: "Arcane Spells", type: "spellcastingEntry" },
  { name: "Gold Pieces", type: "treasure" },
  { name: "Narrative: Eerie Howl", type: "action" }
];

assert.deepEqual(
  verifyCreatedActor(actor(created), manifest(), expected),
  { checked: 5 },
  "exact compendium clones, module-built items, narrative items, and spell links survive"
);

assert.throws(
  () => verifyCreatedActor(actor([
    source("Compendium.pf2e.feats-srd.Item.other", { name: "Power Attack", type: "action" })
  ]), manifest(), [expected[0]]),
  /Compendium\.pf2e\.feats-srd\.Item\.power/,
  "a duplicate display name from another compendium document never satisfies exact grounding"
);

assert.throws(
  () => verifyCreatedActor(actor([
    source("Compendium.pf2e.spells-srd.Item.fireball", {
      name: "Fireball", type: "spell", system: { location: { value: "missing-entry" } }
    })
  ]), manifest(), [expected[1]]),
  /spell location did not resolve/,
  "a spell whose persisted location does not resolve blocks commit"
);

assert.throws(
  () => verifyCreatedActor(actor([]), manifest(), expected),
  /expected documents missing/,
  "a dropped embedded document blocks commit"
);
assert.throws(
  () => verifyCreatedActor({ id: "created" }, manifest(), expected), /items are unavailable/);
assert.throws(
  () => verifyCreatedActor(actor([]), manifest()), /transaction item list/);

console.log("post-create verification: exact source and relationship checks passed");
