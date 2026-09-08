import assert from "node:assert/strict";
import { persistedExpectedItems, verifyCreatedActor } from "./post-create.mjs";

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

// PF2e consumes a kit and writes the trusted physical leaves instead. The
// post-create contract must verify those exact sources, including backpack
// contents, rather than expecting the non-persisted kit document.
const kitUuid = "Compendium.pf2e.equipment-srd.Item.adventurers-pack";
const backpackUuid = "Compendium.pf2e.equipment-srd.Item.backpack";
const ropeUuid = "Compendium.pf2e.equipment-srd.Item.rope";
const chalkUuid = "Compendium.pf2e.equipment-srd.Item.chalk";
const kit = source(kitUuid, {
  name: "Adventurer's Pack", type: "kit", system: { items: {
    backpack: { uuid: backpackUuid, items: {
      rope: { uuid: ropeUuid, items: {} }, chalk: { uuid: chalkUuid, items: {} }
    } }
  } }
});
const kitDocument = (uuid, type, name) => ({
  uuid, type, name, isOfType: (query) => query === type || (query === "physical" && type !== "kit")
});
const kitDocuments = new Map([
  [backpackUuid, kitDocument(backpackUuid, "backpack", "Backpack")],
  [ropeUuid, kitDocument(ropeUuid, "equipment", "Rope")],
  [chalkUuid, kitDocument(chalkUuid, "equipment", "Chalk")]
]);
const kitExpected = await persistedExpectedItems([kit], async (uuid) => kitDocuments.get(uuid) ?? null);
assert.deepEqual(kitExpected.map((item) => item._stats.compendiumSource), [backpackUuid, ropeUuid, chalkUuid],
  "a kit's persisted contract is its exact backpack and nested leaf sources");
assert.deepEqual(verifyCreatedActor(actor([
  source(backpackUuid, { name: "Backpack", type: "backpack" }),
  source(ropeUuid, { name: "Rope", type: "equipment" }),
  source(chalkUuid, { name: "Chalk", type: "equipment" })
]), manifest(), kitExpected), { checked: 3 },
  "native kit expansion satisfies exact leaf verification without accepting the kit itself");
assert.throws(() => verifyCreatedActor(actor([
  source(backpackUuid, { name: "Backpack", type: "backpack" }),
  source(ropeUuid, { name: "Rope", type: "equipment" })
]), manifest(), kitExpected), /chalk/,
  "a dropped kit leaf remains a blocking persistence failure");
const emptyBackpackKit = source(kitUuid, {
  name: "Empty Backpack Kit", type: "kit", system: { items: { backpack: { uuid: backpackUuid, items: {} } } }
});
assert.deepEqual((await persistedExpectedItems([emptyBackpackKit], async (uuid) => kitDocuments.get(uuid) ?? null))
  .map((item) => item._stats.compendiumSource), [backpackUuid],
"a kit's empty backpack persists without inventing a nested leaf expectation");

console.log("post-create verification: exact source and relationship checks passed");
