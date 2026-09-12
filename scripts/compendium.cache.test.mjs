import assert from "node:assert/strict";
import { test } from "node:test";
import { findEntry, getEquipmentIndex, getAllEquipmentEntries, detectAvailablePacks } from "./compendium.mjs";

let sources = {};
const packs = new Map();
globalThis.game = { settings: { get: () => sources }, packs: {
  get: (id) => packs.get(id),
  [Symbol.iterator]: () => packs.values()
} };
const item = (name) => ({ _id: name, name, type: "equipment", system: {
  level: { value: 1 }, price: { value: { gp: 10 } }
} });
function addPack(id, getIndex) {
  const pack = { collection: id, title: id, metadata: { type: "Item" }, getIndex };
  packs.set(id, pack);
  return pack;
}

await test("overlapping name lookups share one index request", async () => {
  const gate = Promise.withResolvers();
  let calls = 0;
  addPack("qa.shared", () => { calls++; return gate.promise; });
  const lookups = [findEntry(["qa.shared"], "Rope"), findEntry(["qa.shared"], "Rope")];
  await Promise.resolve();
  gate.resolve([item("Rope")]);
  const results = await Promise.all(lookups);
  assert.equal(calls, 1);
  assert.deepEqual(results[0], results[1]);
});

await test("equipment scan coalesces concurrent requests and reuses successful indexes", async () => {
  let calls = 0;
  addPack("qa.equipment", async () => { calls++; return [item("Lantern")]; });
  await Promise.all([getEquipmentIndex("qa.equipment"), getEquipmentIndex("qa.equipment")]);
  await getEquipmentIndex("qa.equipment");
  assert.equal(calls, 1);
});

await test("temporary equipment failure can recover through the aggregate catalog", async () => {
  let calls = 0;
  sources = { equipment: ["qa.retry"] };
  addPack("qa.retry", async () => {
    if (++calls === 1) throw new Error("temporary index failure");
    return [item("Recovered")];
  });
  assert.deepEqual(await getAllEquipmentEntries(), []);
  assert.deepEqual((await getAllEquipmentEntries()).map((entry) => entry.name), ["Recovered"]);
  assert.equal(calls, 2);
});

await test("aggregate equipment uses current selected packs and preserves their order", async () => {
  addPack("qa.first", async () => [item("First"), item("Shared")]);
  addPack("qa.second", async () => [item("Second"), item("Shared")]);
  sources = { equipment: ["qa.first"] };
  assert.deepEqual((await getAllEquipmentEntries()).map((entry) => entry.name), ["First", "Shared"]);
  sources = { equipment: ["qa.second", "qa.first"] };
  assert.deepEqual((await getAllEquipmentEntries()).map((entry) => entry.name), ["Second", "Shared", "First"]);
  sources = { equipment: ["qa.second"] };
  assert.deepEqual((await getAllEquipmentEntries()).map((entry) => entry.name), ["Second", "Shared"]);
});

await test("missing or replaced packs cannot reuse the old pack's equipment data", async () => {
  assert.deepEqual(await getEquipmentIndex("qa.later"), []);
  addPack("qa.later", async () => [item("Installed")]);
  assert.equal((await getEquipmentIndex("qa.later"))[0].name, "Installed");
  addPack("qa.later", async () => [item("Replacement")]);
  assert.equal((await getEquipmentIndex("qa.later"))[0].name, "Replacement");
  packs.delete("qa.later");
  assert.deepEqual(await getEquipmentIndex("qa.later"), []);
});

await test("source discovery coalesces and recovers from a failed scan", async () => {
  packs.clear();
  let calls = 0;
  addPack("qa.discovery", async () => {
    if (++calls === 1) throw new Error("temporary discovery failure");
    return [item("Discovered")];
  });
  await assert.rejects(detectAvailablePacks(), /temporary discovery failure/);
  const [first, second] = await Promise.all([detectAvailablePacks(), detectAvailablePacks()]);
  assert.equal(calls, 2);
  assert.equal(first, second);
  assert.equal(first.equipment[0].id, "qa.discovery");
});
