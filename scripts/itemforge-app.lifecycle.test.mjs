// Exercise production action boundaries with deferred dependencies. No provider
// requests or real Foundry documents are needed to prove cancellation/commit.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

if (!vm.SourceTextModule) {
  const run = spawnSync(process.execPath, ["--experimental-vm-modules", import.meta.filename], { stdio: "inherit" });
  process.exit(run.status ?? 1);
}
const source = await readFile(new URL("./itemforge-app.mjs", import.meta.url), "utf8");
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
let generationCalls = 0;
let createCalls = 0;
let priceStarted;
let pricePending;
let sheetFailure;
let createFailure;
let macroFailure;
let activation = null;
const warnings = [];
const context = vm.createContext({
  console: { log() {}, warn() {}, error() {} },
  game: { i18n: { localize: (key) => key, format: (key) => key } },
  ui: { notifications: { info() {}, warn: (text) => warnings.push(text) } },
  Item: { create: async () => {
    createCalls++;
    if (createFailure) throw createFailure;
    return { id: "forged", name: "QA charm", sheet: { render: async () => { if (sheetFailure) throw sheetFailure; } } };
  } }
});
class MockSpfApp {
  _tokenUsage = [];
  _progress = null;
  _formatLastRunCost() { return null; }
  _buildTokenReport() { return null; }
  _recordTokens() {}
  async render() {}
  _beginProgress() { this.abort = new AbortController(); return this.abort.signal; }
  _throwIfCancelled() {
    if (this.abort?.signal.aborted) throw Object.assign(new Error("cancelled"), { cancelled: true });
  }
  async _setStep() { this._throwIfCancelled(); }
  _cancelGeneration() { this.abort.abort(); }
  _finishRun() { this.abort = null; }
}
const mocks = {
  MODULE_ID: "simplypf2e", SpfApp: MockSpfApp,
  RUNED_ITEM_KINDS: new Set(["weapon", "armor"]), MIN_ITEM_LEVEL: 0, MAX_ITEM_LEVEL: 20,
  getProviderRequestConfig: () => ({ provider: {}, connections: [] }),
  getProviderAuthWarningKey: () => null,
  EFFECT_KINDS: ["itemBonus"], getForgeEffectCatalog: async () => [{ kind: "itemBonus" }],
  getUsageOptions: async () => ["worn"],
  generateMagicItemConcept: async () => { generationCalls++; return { concept: {} }; },
  normalizeMagicItemConcept: () => ({ name: "QA charm", level: 4, rarity: "common", traits: [], effects: [], bulk: 0, activation }),
  priceForLevel: async () => { priceStarted?.resolve(); if (pricePending) await pricePending.promise; return 100; },
  describeActivation: () => "Activation",
  buildMagicItemData: async () => ({ name: "QA charm" }),
  createActivationMacro: async () => { if (macroFailure) throw macroFailure; }
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
const App = module.namespace.ItemForgeApp;
const actions = App.DEFAULT_OPTIONS.actions;
function app() {
  const instance = new App();
  const controls = { prompt: { value: "QA charm" }, level: { value: "4" }, rarity: { value: "common" } };
  instance.element = { querySelector: (selector) => controls[selector.match(/name="(\w+)"/)?.[1]] ?? null };
  return instance;
}

// Re-entrant action dispatch cannot replace the signal or publish a cancelled
// draft while a slow compendium/pricing step is still in flight.
let forge = app();
priceStarted = deferred();
pricePending = deferred();
const running = actions.generate.call(forge);
await priceStarted.promise;
const duplicate = actions.generate.call(forge);
actions.cancelGeneration.call(forge);
pricePending.resolve();
await Promise.all([running, duplicate]);
assert.equal(generationCalls, 1, "double Generate must issue only one provider call");
assert.equal((await forge._prepareContext()).preview, null, "cancellation during final pricing must discard the draft");
priceStarted = pricePending = null;

// A successful document write consumes the draft before fallible presentation.
forge = app();
await actions.generate.call(forge);
sheetFailure = new Error("sheet rendering failed");
await actions.createItem.call(forge);
assert.equal((await forge._prepareContext()).preview, null, "a saved item must not remain available for duplicate creation");
assert.equal((await forge._prepareContext()).error, null, "sheet failure must not be reported as a failed document write");
await actions.createItem.call(forge);
assert.equal(createCalls, 1);
assert.ok(warnings.some((text) => text.includes("CreatedPresentationFailed")));
sheetFailure = null;

// A failed write is retryable; the retry clears the stale error. Macro failure
// preserves the successfully saved item and consumes the draft as well.
forge = app();
activation = { kind: "heal" };
await actions.generate.call(forge);
createFailure = new Error("write failed");
await actions.createItem.call(forge);
assert.ok((await forge._prepareContext()).preview);
assert.equal((await forge._prepareContext()).error, "write failed");
createFailure = null;
macroFailure = new Error("macro failed");
await actions.createItem.call(forge);
assert.equal((await forge._prepareContext()).preview, null);
assert.equal((await forge._prepareContext()).error, null);
assert.ok(warnings.some((text) => text.includes("MacroFailed")));
console.log("itemforge-app.lifecycle.test.mjs: reentry, final-step cancellation, commit and retry passed");
