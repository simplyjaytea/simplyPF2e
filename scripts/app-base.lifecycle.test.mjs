// Production SpfApp lifetime with fake clock/platform; no browser or provider.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
if (!vm.SourceTextModule) {
  const run = spawnSync(process.execPath, ["--experimental-vm-modules", import.meta.filename], { stdio: "inherit" });
  process.exit(run.status ?? 1);
}
let now = 1000;
let timerId = 0;
const timers = new Map();
let providerConfig = { connectionId: "a", baseUrl: "http://localhost/a", model: "model-a", apiKey: "", provider: { name: "A" } };
let probe = async () => ({ total: 10 });
const notices = [];
class Application {
  renders = 0;
  element = null;
  render() {
    this.renders++;
    this.element = { querySelector: () => null, querySelectorAll: () => [], contains: () => false };
    this._onRender();
    return this;
  }
  async close() { this.element = null; }
}
const context = vm.createContext({
  console, AbortController, Date: { now: () => now },
  setInterval: (fn) => { timers.set(++timerId, fn); return timerId; },
  clearInterval: (id) => timers.delete(id),
  ui: { notifications: { info: (message) => notices.push(message), error: (message) => notices.push(message) } },
  foundry: { applications: { api: { ApplicationV2: Application, HandlebarsApplicationMixin: (base) => base } } },
  game: { i18n: { localize: (key) => key, format: (key, data) => `${key}:${JSON.stringify(data)}` } }
});
const source = await readFile(new URL("./app-base.mjs", import.meta.url), "utf8");
const root = new vm.SourceTextModule(source, { context });
await root.link(async (specifier) => {
  const names = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)]
    .filter((match) => match[2] === specifier).flatMap((match) => match[1].split(",").map((name) => name.trim()));
  const values = ["./progress.mjs", "./tokens.mjs"].includes(specifier) ? await import(specifier) : {
    getProviderRequestConfig: () => providerConfig,
    selectProviderConnection: async (id) => { providerConfig = { ...providerConfig, connectionId: id }; },
    testProviderConnection: () => probe()
  };
  return new vm.SyntheticModule(names, function () {
    for (const name of names) this.setExport(name, values[name] ?? (() => {}));
  }, { context });
});
await root.evaluate();
const App = root.namespace.SpfApp;
const app = new App();
const signal = app._beginProgress([["concept", "Concept"], ["spells", "Spells"], ["apply", "Create"]]);
await app._setStep("concept");
const id = app._runId;
const oldCallback = app._progressCallback();
oldCallback({ phase: "writing", tokens: 100 });
const before = app._progress.percent;
app._skipStep("spells");
await app._setStep("apply", "Applying native data");
app._lockCreation();
app._cancelGeneration();
assert.equal(signal.aborted, false, "Cancel cannot abort native creation");
assert.equal(app._runId, id);
assert.ok(app._progress.percent >= before && app._progress.percent < 100);
assert.equal(app._progress.steps[1].state, "skipped");
const nativeDetail = app._progress.detail;
oldCallback({ phase: "thinking", tokens: 999 });
assert.equal(app._progress.detail, nativeDetail, "late prior-stage progress cannot replace native status");
now = 65000;
for (const tick of timers.values()) tick();
assert.equal(app._progress.elapsed, "1:04");
await app.close();
assert.equal(timers.size, 0, "close stops display timers without stopping the run");
assert.equal(app._runActive, true);
assert.equal(signal.aborted, false);
const renders = app.renders;
await app.render();
assert.equal(app.renders, renders, "background work cannot reopen a hidden window");
await app.render(true);
assert.equal(timers.size, 1);
app._recordTokens("Concept", { total: 100 });
app._finishRun("warning", id);
assert.equal(app._progress.percent, 100);
assert.equal(app._progress.status, "warning");
assert.equal(timers.size, 0);
assert.equal(app._runActive, false);
const elapsed = app._progress.elapsed;
now = 100000;
app._finishRun("error", id);
assert.equal(app._progress.status, "warning", "presentation failure cannot reclassify a committed result");
assert.equal(app._progress.elapsed, elapsed);
const firstCost = app._lastRunCost.total;
app._recordTokens("late completed request", { total: 999 }, id);
assert.equal(app._tokenUsage.length, 1, "terminal runs reject same-run late usage");
app._beginProgress([["concept", "Another concept"]]);
await app._setStep("concept");
oldCallback({ phase: "writing", tokens: 20000 });
app._finishRun("success", id);
app._recordTokens("stale", { total: 20000 }, id);
assert.equal(app._progress.status, "running", "a stale finisher cannot settle a newer run");
assert.equal(app._lastRunCost.total, firstCost);
assert.equal(app._tokenUsage.length, 1);
const cancellation = app._generationAbort.signal;
app._cancelGeneration();
assert.equal(cancellation.aborted, true);
assert.throws(() => app._throwIfCancelled(), (error) => error.cancelled === true);
app._finishRun("cancelled");
assert.ok(app._progress.percent < 100);
assert.equal(app._progress.status, "cancelled");
assert.equal(timers.size, 0);
// Separate windows never share cancellation or late-event guards.
const a = new App(), b = new App();
a._beginProgress([["concept", "A"]]);
b._beginProgress([["concept", "B"]]);
a._cancelGeneration();
assert.equal(b._generationAbort.signal.aborted, false);
a._finishRun("cancelled");
b._finishRun("error");
assert.equal(timers.size, 0);
// The module body owns scrolling; the outer Foundry content clips it.
const bodyBefore = { scrollTop: 420 };
const outerBefore = { scrollTop: 0 };
const detailsBefore = { id: "", dataset: { stateKey: "generation-activity" }, open: true };
app.element = {
  querySelector: (selector) => selector === ".simplypf2e-generator" ? bodyBefore : outerBefore,
  querySelectorAll: (selector) => selector === "details" ? [detailsBefore] : [],
  contains: () => false
};
app._captureUiState();
const bodyAfter = { scrollTop: 0 };
const detailsAfter = { ...detailsBefore, open: false };
app.element = {
  querySelector: (selector) => selector === ".simplypf2e-generator" ? bodyAfter : { scrollTop: 0 },
  querySelectorAll: (selector) => selector === "details" ? [detailsAfter] : [],
  contains: () => false
};
app._restoreUiState();
assert.equal(bodyAfter.scrollTop, 420, "rerenders preserve the actual scrolling body");
assert.equal(detailsAfter.open, true, "rerenders preserve the expanded activity list");
// A connection may change while its probe is waiting. Late success must not
// label the newly selected connection as tested or emit misleading feedback.
let resolveProbe;
probe = () => new Promise((resolve) => { resolveProbe = resolve; });
const target = { disabled: false, querySelector: () => null };
let currentDraft = "before probe", savedDraft;
app._preserveForm = () => { savedDraft = currentDraft; };
const pendingProbe = app._testProvider(target);
currentDraft = "edited while probe is pending";
providerConfig = { ...providerConfig, connectionId: "b", model: "model-b" };
resolveProbe({ total: 10 });
await pendingProbe;
assert.equal(app._providerTested, false);
assert.equal(app._providerFeedback, null);
assert.equal(notices.length, 0);
assert.equal(target.disabled, false);
assert.equal(savedDraft, currentDraft, "probe completion preserves text entered while waiting");
probe = async () => ({ total: 10 });
await app._testProvider(target);
assert.equal(app._providerTested, true);
assert.equal(app._providerFeedback.kind, "success");
assert.equal(notices.length, 1);
await app._switchActiveConnection("c");
assert.equal(app._providerTested, false);
assert.equal(app._providerFeedback, null, "switching clears feedback for the former connection");
console.log("app-base.lifecycle.test.mjs: identity, cancellation, close/reopen, timing and terminal outcomes passed");
