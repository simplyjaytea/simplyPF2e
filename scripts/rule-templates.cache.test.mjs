import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { getForgeEffectCatalog, findRuleExemplar } from "./rule-templates.mjs";

const boots = JSON.parse(readFileSync(new URL("../tests/fixtures/forge/boots-of-elvenkind.json", import.meta.url), "utf8"));
let sourceId;
const packs = new Map();
globalThis.game = { settings: { get: () => ({ equipment: [sourceId] }) }, packs: {
  get: (id) => packs.get(id), [Symbol.iterator]: () => packs.values()
} };
function selectPack(id, getIndex, getDocuments) {
  sourceId = id;
  packs.set(id, { collection: id, metadata: { type: "Item" }, getIndex, getDocuments });
}

await test("simultaneous forge catalogs share their rule-source scan", async () => {
  let calls = 0;
  selectPack("qa.shared-rules", async () => { calls++; return [boots]; });
  const [first, second] = await Promise.all([getForgeEffectCatalog(5), getForgeEffectCatalog(5)]);
  assert.equal(calls, 1);
  assert.deepEqual(first, second);
  assert.equal(first[0].exemplar.sourceName, boots.name);
  first[0].exemplar.rule.value = 999;
  assert.equal(second[0].exemplar.rule.value, 1, "catalog consumers still receive independent real-rule clones");
});

await test("a failed rules index is retried on the next catalog request", async () => {
  let calls = 0;
  selectPack("qa.retry-rules", async () => {
    if (++calls === 1) throw new Error("temporary rules failure");
    return [boots];
  });
  assert.deepEqual(await getForgeEffectCatalog(5), []);
  assert.equal((await getForgeEffectCatalog(5))[0]?.exemplar.sourceName, boots.name);
  assert.equal(calls, 2);
});

await test("full-document fallback is shared and failed fallback remains retryable", async () => {
  let calls = 0;
  let documents = 0;
  selectPack("qa.fallback-rules", async () => { calls++; return [{ _id: boots._id }]; }, async () => {
    if (++documents === 1) throw new Error("temporary document failure");
    return [boots];
  });
  assert.deepEqual(await getForgeEffectCatalog(5), []);
  const catalogs = await Promise.all([getForgeEffectCatalog(5), getForgeEffectCatalog(5)]);
  assert.equal(calls, 2);
  assert.equal(documents, 2);
  assert.ok(catalogs.every((catalog) => catalog.length === 1));
});

await test("replacing a pack refreshes its cached rule records", async () => {
  selectPack("qa.replaced-rules", async () => [boots]);
  assert.equal((await getForgeEffectCatalog(5)).length, 1);
  selectPack("qa.replaced-rules", async () => []);
  assert.deepEqual(await getForgeEffectCatalog(5), []);
});

await test("exemplar preference follows current equipment source order", async () => {
  packs.clear();
  selectPack("qa.exemplar-first", async () => [boots]);
  assert.equal((await findRuleExemplar("itemBonus")).sourceUuid, `Compendium.qa.exemplar-first.Item.${boots._id}`);
  selectPack("qa.exemplar-second", async () => [boots]);
  assert.equal((await findRuleExemplar("itemBonus")).sourceUuid, `Compendium.qa.exemplar-second.Item.${boots._id}`);
});
