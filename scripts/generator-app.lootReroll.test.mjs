// Exercise production reroll/create actions without provider or Foundry writes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import { completionManifest, assertComplete } from "./completion.mjs";
import { normalizeConcept, normalizeLoot, parseCoins, parseScroll } from "./builder.mjs";
import { composeEncounter } from "./encounter.mjs";

if (!vm.SourceTextModule) {
  const run = spawnSync(process.execPath, ["--experimental-vm-modules", import.meta.filename], { stdio: "inherit" });
  process.exit(run.status ?? 1);
}
const source = (await readFile(new URL("./generator-app.mjs", import.meta.url), "utf8"))
  .replace(/#(input|concept|resolved|manifest|error|busy|generateEncounter|readForm|runGeneration|assertGenerationReady|refineEquipment)\b/g, "_test_$1");
const context = vm.createContext({
  console: { warn() {}, error() {}, log() {} },
  game: { i18n: { localize: (key) => key } }
});
let providerFailure;
let selectedLoot = [];
let omittedLoot = false;
let equipmentSelection = { equipment: [], omitted: false };
let budgetTarget;
let resolveOptions;
let writes = 0;
let abortController;
let abortDuringResolve = false;
const ref = { packId: "test.equipment", _id: "potion" };
const mocks = {
  MODULE_ID: "simplypf2e",
  SpfApp: class {
    _beginProgress() { abortController = new AbortController(); return abortController.signal; }
    async _setStep() {}
    _recordTokens() {}
    _finishRun() {}
    _throwIfCancelled() {
      if (abortController.signal.aborted) throw Object.assign(new Error("cancelled"), { cancelled: true });
    }
    async render() {}
  },
  generateLoot: async () => {
    if (providerFailure) throw providerFailure;
    return { loot: [{ name: "Healing Potion", quantity: 1 }] };
  },
  normalizeConcept, normalizeLoot, parseCoins, parseScroll, completionManifest, assertComplete,
  composeEncounter,
  findPreset: () => null,
  generateConcept: async () => ({ concept: { name: "Courier", loot: [], equipment: [] } }),
  resolveConcept: async () => ({ abilities: [], spells: [], feats: [], focusSpells: [], equipment: [], loot: [] }),
  getEquipmentCandidates: async () => [{ name: "Healing Potion", ref }],
  selectEquipment: async () => equipmentSelection,
  getLootCandidates: async () => [{ name: "Healing Potion", ref }],
  selectLoot: async () => ({ loot: selectedLoot, omitted: omittedLoot }),
  resolveLoot: async (concept, options) => {
    resolveOptions = options;
    if (abortDuringResolve) abortController.abort();
    return concept.loot.map((item) => ({ ...item,
      entry: item.candidate === ref || !options?.exactContent ? ref : null
    }));
  },
  applyTreasureBudget: async (loot, target) => { budgetTarget = target; return loot; },
  treasureBudget: () => 10,
  findBestiaryScaffold: async () => ({ img: "test.webp" }),
  createActor: async () => { writes++; throw new Error("native create must not run"); }
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
const App = module.namespace.GeneratorApp;
function preview() {
  const app = new App();
  app._test_concept = { name: "Courier", level: 4, rarity: "common", loot: [{ name: "Gold Pieces", quantity: 5 }] };
  app._test_resolved = { loot: [{ name: "Gold Pieces", quantity: 5, entry: ref }] };
  app._test_manifest = completionManifest({ mode: "npc", concept: app._test_concept, resolved: app._test_resolved });
  return app;
}
function retained(app) {
  return { concept: app._test_concept, resolved: app._test_resolved, manifest: app._test_manifest };
}
function assertRetained(app, before) {
  assert.equal(app._test_concept, before.concept, "failed reroll preserves the accepted concept");
  assert.equal(app._test_resolved, before.resolved, "failed reroll preserves resolved content");
  assert.equal(app._test_manifest, before.manifest, "failed reroll preserves the accepted completion manifest");
  assert.equal(app._test_concept.loot[0].name, "Gold Pieces");
  assert.equal(app._test_busy, false);
}

for (const failure of [new Error("provider unavailable"), Object.assign(new Error("cancelled"), { cancelled: true })]) {
  const app = preview();
  const before = retained(app);
  providerFailure = failure;
  await App.DEFAULT_OPTIONS.actions.rerollLoot.call(app);
  assertRetained(app, before);
  assert.equal(app._test_error, failure.message);
}
providerFailure = null;
{
  const app = preview();
  const before = retained(app);
  selectedLoot = [];
  await App.DEFAULT_OPTIONS.actions.rerollLoot.call(app);
  assert.equal(resolveOptions?.exactContent, true, "rerolls cannot fuzzy-match ungrounded draft loot");
  assertRetained(app, before);
  assert.match(app._test_error, /Generation is incomplete/);
}
{
  const app = preview();
  const before = retained(app);
  app._test_input.mode = "character";
  selectedLoot = [{ name: "Healing Potion", quantity: 1, candidate: ref }];
  await App.DEFAULT_OPTIONS.actions.rerollLoot.call(app);
  assert.notEqual(app._test_concept, before.concept, "successful reroll commits a new concept");
  assert.notEqual(app._test_resolved, before.resolved);
  assert.equal(app._test_resolved.loot[0].entry, ref, "opaque issued reference identity survives staging");
  assert.equal(app._test_manifest.mode, "npc", "a preview retains its original mode after the form mode changes");
  assert.equal(app._test_manifest.complete, true);
  assert.equal(app._test_error, null);
}
{
  const app = preview();
  const before = retained(app);
  abortDuringResolve = true;
  await App.DEFAULT_OPTIONS.actions.rerollLoot.call(app);
  assertRetained(app, before);
  assert.equal(app._test_error, "cancelled", "cancelling during local resolution also preserves the old plan");
  abortDuringResolve = false;
}
{
  const app = preview();
  omittedLoot = true;
  selectedLoot = [];
  await App.DEFAULT_OPTIONS.actions.rerollLoot.call(app);
  assert.equal(app._test_concept.loot.length, 0, "explicitly omitted replacement loot stays empty");
  assert.equal(budgetTarget, 0, "empty requested loot cannot be repopulated by automatic coin padding");
  assert.equal(app._test_manifest.complete, true);
  omittedLoot = false;
}
for (const omitted of [false, true]) {
  const app = new App();
  const concept = { level: 1, equipment: [{ name: "Healing Potion" }], strikes: [] };
  equipmentSelection = { equipment: [], omitted };
  await app._test_refineEquipment(concept);
  assert.equal(concept.equipment.length, omitted ? 0 : 1,
    "only an explicit optional-equipment omission clears the draft");
}
{
  const app = preview();
  app._test_manifest = null;
  await App.DEFAULT_OPTIONS.actions.createActor.call(app);
  assert.equal(writes, 0, "an invalid draft must fail before any actor write");
  assert.match(app._test_error, /Generation is incomplete/);
}
{
  const app = new App();
  Object.assign(app._test_input, { mode: "encounter", level: 1, partySize: 1, threat: "trivial" });
  await app._test_generateEncounter();
  assert.match(app._test_error, /budget is too small/,
    "an unsupported tiny encounter is reported before any provider request");
  assert.equal(app._test_busy, false, "early composition failure must unlock the app");
}
{
  const app = new App();
  const fields = { '[name="mode"]:checked': "encounter", '[name="level"]': "3.7", '[name="partySize"]': "2.4" };
  app.element = { querySelector: (selector) => selector in fields ? { value: fields[selector] } : null };
  app._test_readForm();
  assert.equal(app._test_input.level, 4);
  assert.equal(app._test_input.partySize, 2, "encounter math accepts whole creatures and whole PC levels");
}
{
  const app = new App();
  const gmPrompt = "A minimal courier with no loot.";
  app._test_input.prompt = gmPrompt;
  app.element = { querySelector: () => null };
  app._test_assertGenerationReady = () => true;
  await app._test_runGeneration(false);
  assert.equal(app._test_error, null);
  assert.equal(app._test_concept.gmPrompt, gmPrompt, "normalization retains the original request for every refinement");
  assert.equal(budgetTarget, 0, "initial empty loot remains empty despite default treasure budgets");
}
console.log("generator-app.lootReroll.test.mjs: atomic exact-grounded rerolls and pre-write completion gate passed");
