// Exercise the production caller's optional creature-feat contract without
// provider requests or Foundry writes. Only the private method name is exposed.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

if (!vm.SourceTextModule) {
  const run = spawnSync(process.execPath, ["--experimental-vm-modules", import.meta.filename], { stdio: "inherit" });
  process.exit(run.status ?? 1);
}
const source = (await readFile(new URL("./generator-app.mjs", import.meta.url), "utf8"))
  .replace(/#refineCreatureFeats\b/g, "_test_refineCreatureFeats");
const warnings = [];
const context = vm.createContext({
  console: { warn: (...args) => warnings.push(args) },
  game: { i18n: { localize: (key) => key } }
});
const candidate = { id: "F0", name: "Sudden Charge", ref: { packId: "pf2e.feats-srd", _id: "charge" } };
let candidates = [candidate];
let selection;
let failure;
let calls = 0;
let query;
let receivedSignal;
const tokens = [];
const mocks = {
  SpfApp: class { _recordTokens(label, usage) { tokens.push({ label, usage }); } },
  MODULE_ID: "simplypf2e",
  getFeatCandidates: async (args) => { query = args; return candidates; },
  selectCreatureFeats: async ({ signal }) => {
    calls++;
    receivedSignal = signal;
    if (failure) throw failure;
    return selection;
  }
};
const module = new vm.SourceTextModule(source, { context });
await module.link((specifier) => {
  const imports = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)]
    .filter((match) => match[2] === specifier)
    .flatMap((match) => match[1].split(",").map((name) => name.trim()));
  return new vm.SyntheticModule(imports, function () {
    for (const name of imports) this.setExport(name, mocks[name] ?? (() => { throw new Error(`Unexpected dependency: ${name}`); }));
  }, { context });
});
await module.evaluate();
const app = new module.namespace.GeneratorApp();
const usage = { totalTokens: 30 };
const signal = new AbortController().signal;

for (const name of ["Fleet", "Sneak Attacker"]) {
  const concept = { level: 4, feats: [name] };
  selection = { feats: [], omitted: true, usage };
  await app._test_refineCreatureFeats(concept, signal);
  assert.equal(concept.feats.length, 0, "explicit valid empty selection replaces the ungrounded wishlist");
  assert.equal(query.category, "class", "do not widen creature feat eligibility");
  assert.equal(query.level, 4);
  assert.deepEqual([...query.preferredNames], [name]);
  assert.equal(receivedSignal, signal);
  assert.equal(tokens.at(-1).usage, usage, "intentional omission still records provider cost");
}

const selected = [{ name: candidate.name, candidate: candidate.ref }];
selection = { feats: selected, omitted: false, usage };
let concept = { level: 4, feats: ["Fleet"] };
await app._test_refineCreatureFeats(concept);
assert.equal(concept.feats, selected, "retain exact selected objects without copying references");

for (const result of [{ feats: [], omitted: false, usage }, { feats: [], usage }]) {
  const draft = ["Fleet"];
  concept = { level: 4, feats: draft };
  selection = result;
  await app._test_refineCreatureFeats(concept);
  assert.equal(concept.feats, draft, "empty decoded output without explicit omission must still block completion");
}

const draft = ["Sneak Attacker"];
concept = { level: 4, feats: draft };
candidates = [];
const before = calls;
await app._test_refineCreatureFeats(concept);
assert.equal(calls, before, "no catalog means no provider request");
assert.equal(concept.feats, draft, "missing catalog retains unresolved requirements");
candidates = [candidate];
failure = new Error("provider failed");
await app._test_refineCreatureFeats(concept);
assert.equal(concept.feats, draft);
assert.equal(warnings.length, 1);
failure = Object.assign(new Error("cancelled"), { cancelled: true });
await assert.rejects(app._test_refineCreatureFeats(concept), (error) => error === failure);
assert.equal(concept.feats, draft);
const beforeEmpty = calls;
await app._test_refineCreatureFeats({ level: 4, feats: [] });
assert.equal(calls, beforeEmpty);
console.log("generator-app.creatureFeats.test.mjs: explicit omission and fail-closed boundaries passed");
