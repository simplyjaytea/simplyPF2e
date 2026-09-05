// Exercise the production ItemForgeApp kind action and private input state
// without provider requests, Foundry document writes, or copied selection logic.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

if (!vm.SourceTextModule) {
  const run = spawnSync(process.execPath, ["--experimental-vm-modules", import.meta.filename], { stdio: "inherit" });
  process.exit(run.status ?? 1);
}

const source = await readFile(new URL("./itemforge-app.mjs", import.meta.url), "utf8");
const context = vm.createContext({
  console,
  game: { i18n: { localize: (key) => key, format: (key) => key } },
  ui: { notifications: { info() {}, warn() {} } }
});

class MockSpfApp {
  renders = 0;
  _progress = null;
  get _canCancel() { return false; }
  _formatLastRunCost() { return null; }
  _buildTokenReport() { return null; }
  async render() { this.renders++; }
}

const requestConfig = {
  baseUrl: "https://provider.invalid",
  provider: { name: "Test", model: "test-model" },
  connectionName: "Test",
  connections: [],
  model: "test-model",
  hasConfiguredApiKey: false,
  apiKeyIsBound: false
};
const mocks = {
  MODULE_ID: "simplypf2e",
  SpfApp: MockSpfApp,
  RUNED_ITEM_KINDS: new Set(["weapon", "armor"]),
  MIN_ITEM_LEVEL: 0,
  MAX_ITEM_LEVEL: 20,
  getProviderRequestConfig: () => requestConfig,
  getProviderAuthWarningKey: () => null,
  EFFECT_KINDS: []
};

const appModule = new vm.SourceTextModule(source, { context });
await appModule.link((specifier) => {
  const imports = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)]
    .filter((match) => match[2] === specifier)
    .flatMap((match) => match[1].split(",").map((name) => name.trim()));
  return new vm.SyntheticModule(imports, function () {
    for (const name of imports) {
      this.setExport(name, mocks[name] ?? (() => { throw new Error(`Unexpected dependency: ${name}`); }));
    }
  }, { context });
});
await appModule.evaluate();

const app = new appModule.namespace.ItemForgeApp();
const controls = {
  '[name="prompt"]': { value: "A storm-lit dueling blade" },
  '[name="level"]': { value: "9" },
  '[name="rarity"]': { value: "rare" }
};
app.element = { querySelector: (selector) => controls[selector] ?? null };
const selectKind = appModule.namespace.ItemForgeApp.DEFAULT_OPTIONS.actions.selectKind;

let prepared = await app._prepareContext();
assert.equal(prepared.input.kind, "wondrous");
assert.deepEqual(Array.from(prepared.kinds, (kind) => kind.icon), ["fa-ring", "fa-sword", "fa-shield-halved"]);
assert.deepEqual(Array.from(prepared.kinds, (kind) => kind.selected), [true, false, false]);

await selectKind.call(app, null, { dataset: { kind: "weapon" } });
prepared = await app._prepareContext();
assert.equal(prepared.input.kind, "weapon", "the production action changes the authoritative selected kind");
assert.equal(prepared.input.prompt, "A storm-lit dueling blade", "kind changes preserve the prompt");
assert.equal(prepared.input.level, 9, "kind changes preserve the level");
assert.equal(prepared.input.rarity, "rare", "kind changes preserve rarity");
assert.deepEqual(Array.from(prepared.kinds, (kind) => kind.selected), [false, true, false],
  "only Weapon is highlighted after selecting Weapon");

controls['[name="prompt"]'].value = "Armor wrapped in winter mist";
await selectKind.call(app, null, { dataset: { kind: "armor" } });
prepared = await app._prepareContext();
assert.equal(prepared.input.kind, "armor");
assert.equal(prepared.input.prompt, "Armor wrapped in winter mist");
assert.deepEqual(Array.from(prepared.kinds, (kind) => kind.selected), [false, false, true],
  "only Armor is highlighted after selecting Armor");

const rendersBeforeInvalid = app.renders;
await selectKind.call(app, null, { dataset: { kind: "invented" } });
prepared = await app._prepareContext();
assert.equal(prepared.input.kind, "armor", "invalid kinds fail closed without changing selection");
assert.equal(app.renders, rendersBeforeInvalid, "invalid kinds do not trigger a render");

console.log("itemforge-app.kindSelection.test.mjs: production kind selection and preservation passed");
