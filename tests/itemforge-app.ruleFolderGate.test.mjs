// QA F4: the world-folder checkbox in the Forge's read-form path is gated on experimentalToolsEnabled().
// The real gate is earlier (the parcel kind is refused when the tools are off), so this is defensive:
// a checked box in a stale render must not turn the option on. The mutant that drops the gate survived.
// Run: node tests/itemforge-app.ruleFolderGate.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

if (!vm.SourceTextModule) {
  const run = spawnSync(process.execPath, ["--experimental-vm-modules", import.meta.filename], { stdio: "inherit" });
  process.exit(run.status ?? 1);
}

let gateOpen = false;
// Test-only instrumentation exposes #input so the read result can be asserted; method bodies are unchanged.
const source = (await readFile(new URL("../scripts/itemforge-app.mjs", import.meta.url), "utf8"))
  .replace(/#input\b/g, "_test_input");
const context = vm.createContext({
  console: { log() {}, warn() {}, error() {} },
  game: { i18n: { localize: (key) => key, format: (key) => key } },
  ui: { notifications: { info() {}, warn() {} } }
});
class MockSpfApp {}
const mocks = {
  experimentalToolsEnabled: () => gateOpen,
  assertExperimentalToolAccess: () => {},
  MODULE_ID: "simplypf2e", SpfApp: MockSpfApp,
  AI_TASK: {}, taskMaxTokens: () => 100,
  RUNED_ITEM_KINDS: new Set(["weapon", "armor"]), MIN_ITEM_LEVEL: 0, MAX_ITEM_LEVEL: 20,
  TREASURE_MIN_PARTY_LEVEL: 1, TREASURE_MAX_PARTY_LEVEL: 20,
  EFFECT_KINDS: [], COIN_UUIDS: {}, COIN_COPPER_RATES: { pp: 1000, gp: 100, sp: 10, cp: 1 },
  DESTINATION: { LOOT: "loot", FOLDER: "folder" }, LOOT_MANIFEST: {}, LOOT_NAME_MAX: 60
};
const module = new vm.SourceTextModule(source, { context });
await module.link((specifier) => {
  const imports = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)]
    .filter((match) => match[2] === specifier)
    .flatMap((match) => match[1].split(",").map((name) => name.trim()));
  return new vm.SyntheticModule(imports, function () {
    for (const name of imports) this.setExport(name, mocks[name] ?? (() => {}));
  }, { context });
});
await module.evaluate();
const App = module.namespace.ItemForgeApp;

/** An app whose rendered form has the parcel controls, with the world-folder box checked. */
function app({ ruleFolderChecked = true, ruleFolderBox = true } = {}) {
  const instance = new App();
  const controls = {
    prompt: { value: "Tomb parcel" }, level: { value: "5" }, rarity: { value: "common" },
    kind: { value: "parcel" }, valuables: { checked: false }
  };
  if (ruleFolderBox) controls.ruleFolder = { checked: ruleFolderChecked };
  instance.element = { querySelector: (selector) => controls[selector.match(/name="(\w+)"/)?.[1]] ?? null };
  return instance;
}

// Tools off: a checked box from a stale render stays off, and so does a persisted true.
{
  gateOpen = false;
  const instance = app();
  instance._preserveForm();
  assert.equal(instance._test_input.ruleFolder, false, "a checked world-folder box is ignored while experimental tools are off");
  instance._test_input = { ...instance._test_input, ruleFolder: true };
  instance._preserveForm();
  assert.equal(instance._test_input.ruleFolder, false, "a persisted option is cleared while experimental tools are off");
}
// Tools on: the same box is read, so the assertion above is about the gate and not a dead stub.
{
  gateOpen = true;
  const instance = app();
  instance._preserveForm();
  assert.equal(instance._test_input.ruleFolder, true, "a checked world-folder box is read while experimental tools are on");
}
// A missing box (another forge kind's render) keeps the validated value only behind the open gate.
{
  gateOpen = true;
  const instance = app({ ruleFolderBox: false });
  instance._test_input = { ...instance._test_input, ruleFolder: true };
  instance._preserveForm();
  assert.equal(instance._test_input.ruleFolder, true, "the open gate keeps a missing box's previous value");
  gateOpen = false;
  instance._preserveForm();
  assert.equal(instance._test_input.ruleFolder, false, "the closed gate clears it even when the box is absent");
}

console.log("itemforge-app.ruleFolderGate.test.mjs: the read-form world-folder option only turns on behind the experimental-tools gate");
