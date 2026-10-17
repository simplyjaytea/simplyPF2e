// Experimental /forge through the production GeneratorApp: the public request
// entry, the gate re-checked at entry, reroll and the native write, GM drafts kept
// across a request, and duplicate or invalid requests never reaching generation.
// The gate, settings, progress, busy and creation code are the real modules; only
// the AI, catalog and Foundry-document collaborators are isolated at import edges.
// Run: node scripts/generator-app.experimental.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

if (!vm.SourceTextModule) {
  const run = spawnSync(process.execPath, ["--experimental-vm-modules", import.meta.filename], { stdio: "inherit" });
  process.exit(run.status ?? 1);
}

const GATE = "simplypf2e.experimentalTools";
// Dependency order: each module is linked after everything it imports.
const REAL = [
  "ai-task-profiles.mjs", "settings.mjs", "tokens.mjs", "progress.mjs", "experimental-tools.mjs",
  "forge-command.mjs", "app-base.mjs", "generator-app.mjs"
];

const stored = new Map([
  [GATE, true],
  ["simplypf2e.apiBaseUrl", "https://api.deepseek.com/v1"],
  ["simplypf2e.apiKey", "test-key"],
  ["simplypf2e.apiKeyBaseUrl", "https://api.deepseek.com/v1"],
  ["simplypf2e.model", "deepseek-v4-flash"]
]);
const warnings = [];
const counts = { writes: 0, conceptCalls: [], lootCalls: 0 };
let onConcept = null;
let gmUser = true;
let systemId = "pf2e";
const game = {
  get system() { return { id: systemId }; },
  get user() { return { id: "gm", isGM: gmUser }; },
  i18n: { localize: (key) => key, format: (key) => key },
  settings: { get: (moduleId, key) => stored.get(`${moduleId}.${key}`) },
  packs: null
};
const setGate = (value) => stored.set(GATE, value);
const takeWarnings = () => warnings.splice(0);

class Application {
  render() { return this; }
  async close() {}
}
const context = vm.createContext({
  AbortController, URL,
  setInterval: () => 1, clearInterval: () => {},
  console: { log() {}, warn() {}, error() {} },
  foundry: { applications: { api: { ApplicationV2: Application, HandlebarsApplicationMixin: (base) => base } } },
  game,
  ui: { notifications: { info() {}, warn: (message) => warnings.push(message), error() {} } }
});

const sources = new Map();
for (const file of REAL) sources.set(file, await readFile(new URL(`./${file}`, import.meta.url), "utf8"));

// Names imported from every module that is not real are exported by an isolated stand-in.
const syntheticNames = new Map();
for (const source of sources.values()) {
  for (const [, names, from] of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)) {
    if (REAL.includes(from.replace(/^\.\//, ""))) continue;
    const list = syntheticNames.get(from) ?? new Set();
    for (const name of names.split(",").map((item) => item.trim()).filter(Boolean)) list.add(name);
    syntheticNames.set(from, list);
  }
}

const concept = () => ({
  name: "Swamp Hag", level: 6, rarity: "common", spellcasting: null, focusSpells: [],
  specialAbilities: [], feats: [], equipment: [], loot: [], strikes: []
});
const mocks = {
  generateConcept: async (options) => {
    counts.conceptCalls.push(options);
    if (onConcept) await onConcept(options);
    return { concept: concept(), usage: { total: 1 } };
  },
  normalizeConcept: (raw) => raw,
  generateLoot: async () => { counts.lootCalls += 1; return { loot: [], usage: { total: 1 } }; },
  resolveConcept: async () => ({ abilities: [], spells: [], feats: [], focusSpells: [], equipment: [], loot: [] }),
  completionManifest: () => ({}), assertComplete: () => {}, completionSummary: () => ({}),
  applyTreasureBudget: async (loot) => loot, treasureBudget: () => 0, lootValueGp: () => 0,
  findBestiaryScaffold: async () => ({ img: null }),
  createActor: async () => {
    counts.writes += 1;
    return { actor: { id: `actor-${counts.writes}`, name: "Swamp Hag", sheet: { render: async () => {} } }, expectedItems: [] };
  },
  verifyCreatedActor: () => {},
  getCreatureFeatCandidates: async () => [],
  normalizeCreatureFeatName: (name) => String(name ?? "").toLowerCase(),
  selectCreatureFeats: async () => ({ feats: [], omitted: true }),
  getAbilityCandidates: async () => [],
  selectCreatureAbilities: async () => ({ abilities: [] }),
  getEquipmentCandidates: async () => [], getLootCandidates: async () => [],
  getSpellCandidates: async () => [], getScrollSpellCandidates: async () => [], getFocusSpellCandidates: async () => [],
  sourceReadiness: () => ({ ready: true, missing: [], packCount: 0 }),
  randomBrief: () => "random brief", findPreset: (id) => (id ? { prompt: `preset ${id}` } : null), getCustomPresets: () => [],
  presetPickerGroups: () => ({ selectedId: "", standard: [], custom: [] }), examplePrompt: () => "",
  composeEncounter: () => ({ members: [] }), THREATS: {}, TREASURE_AMOUNT_MULTIPLIER: {},
  testProviderConnection: async () => ({ total: 1 }), ProviderSetupApp: class {},
  SourcesConfigApp: class {}, ManagePresetsApp: class {}
};

const synthetic = new Map();
for (const [specifier, names] of syntheticNames) {
  synthetic.set(specifier, new vm.SyntheticModule([...names], function () {
    for (const name of names) this.setExport(name, mocks[name] ?? (() => undefined));
  }, { context, identifier: specifier }));
}
const realModules = new Map();
for (const file of REAL) {
  // Only the generator uses private fields; rewriting them lets the test reach state.
  const source = file === "generator-app.mjs" ? sources.get(file).replace(/#([A-Za-z]\w*)/g, "_test_$1") : sources.get(file);
  realModules.set(file, new vm.SourceTextModule(source, { context, identifier: file }));
}
const lookup = (specifier) => {
  const file = specifier.replace(/^\.\//, "");
  return REAL.includes(file) ? realModules.get(file) : synthetic.get(specifier);
};
for (const module of realModules.values()) if (module.status === "unlinked") await module.link(lookup);
await realModules.get("generator-app.mjs").evaluate();
const { GeneratorApp } = realModules.get("generator-app.mjs").namespace;
const actions = GeneratorApp.DEFAULT_OPTIONS.actions;

// The rendered form. Its values are what the GM last saw, read by the app's own form reader.
const formState = { mode: "monster", prompt: "", level: "3" };
const form = {
  querySelector(selector) {
    if (selector === '[name="mode"]:checked') return { value: formState.mode };
    if (selector === '[name="prompt"]') return { value: formState.prompt };
    if (selector === '[name="level"]') return { value: formState.level };
    if (selector === '[name="allowSpellcasting"]') return { checked: false };
    return null;
  },
  querySelectorAll: () => []
};
const newApp = () => {
  const app = new GeneratorApp();
  app.element = form;
  return app;
};
const VALID = { prompt: "swamp hag", level: 6, intent: "preview" };

// Entry: a disabled gate, bad input and a missing role or system are refused before
// any state changes, provider call or progress begins.
setGate(false);
formState.mode = "monster"; formState.prompt = "GM monster draft"; formState.level = "3";
const refused = newApp();
refused._test_readForm();
const formBefore = { input: { ...refused._test_input }, prompts: { ...refused._test_modePrompts } };
assert.equal(await refused.startExperimentalMonsterRequest(VALID), false);
assert.deepEqual(takeWarnings(), ["SIMPLYPF2E.Experimental.Disabled"]);
assert.equal(refused._progress, null, "a refused request starts no progress");
assert.deepEqual({ ...refused._test_input }, formBefore.input, "a refused request leaves the form state unchanged");
assert.deepEqual({ ...refused._test_modePrompts }, formBefore.prompts);

setGate(true);
const invalid = [
  [{ prompt: "   ", level: 6, intent: "preview" }, "SIMPLYPF2E.Chat.ForgeNoBrief"],
  [{ prompt: "swamp", level: "6", intent: "preview" }, "SIMPLYPF2E.Chat.ForgeLevel"],
  [{ prompt: "swamp", level: 25, intent: "generate" }, "SIMPLYPF2E.Chat.ForgeLevel"],
  [{ prompt: "swamp", level: 6 }, "SIMPLYPF2E.Chat.ForgeIntent"],
  [undefined, "SIMPLYPF2E.Chat.ForgeNoBrief"]
];
for (const [request, key] of invalid) {
  assert.equal(await refused.startExperimentalMonsterRequest(request), false, `refused ${JSON.stringify(request)}`);
  assert.deepEqual(takeWarnings(), [key]);
}
gmUser = false;
assert.equal(await refused.startExperimentalMonsterRequest(VALID), false);
assert.deepEqual(takeWarnings(), ["SIMPLYPF2E.Experimental.GMOnly"], "a console caller who is not a GM is refused");
gmUser = true;
systemId = "dnd5e";
assert.equal(await refused.startExperimentalMonsterRequest(VALID), false);
assert.deepEqual(takeWarnings(), ["SIMPLYPF2E.Errors.WrongSystem"], "outside PF2e the entry refuses");
systemId = "pf2e";
assert.equal(counts.conceptCalls.length, 0, "no refused or invalid request reached the provider");

// Readiness is reused unchanged: a missing key stops the request before any
// provider call or progress run, and the call reports that no run began.
stored.set("simplypf2e.apiKey", "");
stored.set("simplypf2e.apiKeyBaseUrl", "");
assert.equal(await refused.startExperimentalMonsterRequest(VALID), false);
assert.deepEqual(takeWarnings(), ["SIMPLYPF2E.Generator.NoApiKey"]);
assert.equal(counts.conceptCalls.length, 0, "a missing key never reaches the provider");
assert.equal(refused._progress, null, "a readiness stop begins no progress run");
stored.set("simplypf2e.apiKey", "test-key");
stored.set("simplypf2e.apiKeyBaseUrl", "https://api.deepseek.com/v1");

// A pending Character or Encounter preview is never replaced by a request, and the
// refusal happens before any provider call. The result stays in place for Create.
const pendingResult = newApp();
pendingResult._test_pcConcept = { name: "Waiting PC" };
const conceptsBeforePending = counts.conceptCalls.length;
assert.equal(await pendingResult.startExperimentalMonsterRequest(VALID), false);
assert.deepEqual(takeWarnings(), ["SIMPLYPF2E.Chat.ForgeResultPending"]);
assert.equal(counts.conceptCalls.length, conceptsBeforePending, "a pending preview blocks the request before any spend");
assert.deepEqual(pendingResult._test_pcConcept, { name: "Waiting PC" }, "the pending Character preview is kept");
pendingResult._test_pcConcept = null;
pendingResult._test_encounter = { name: "Waiting encounter" };
assert.equal(await pendingResult.startExperimentalMonsterRequest(VALID), false);
assert.deepEqual(takeWarnings(), ["SIMPLYPF2E.Chat.ForgeResultPending"]);
assert.deepEqual(pendingResult._test_encounter, { name: "Waiting encounter" }, "the pending Encounter preview is kept");
pendingResult._test_encounter = null;

// A preview keeps every GM draft, shows the Monster result and never writes.
setGate(true);
formState.mode = "monster"; formState.prompt = "GM monster draft"; formState.level = "3";
const preview = newApp();
preview._test_readForm();
// The GM switches to Character; the change handler saves the Monster text first.
formState.mode = "character"; formState.prompt = "GM monster draft"; formState.level = "3";
preview._test_readForm();
// The GM types a Character draft before asking for the Monster request. A selected
// preset is GM state too: the explicit brief must not inherit its suggestions.
formState.prompt = "courier draft";
preview._test_input.preset = "brute";
const writesBeforePreview = counts.writes;
assert.equal(await preview.startExperimentalMonsterRequest(VALID), true);
const sent = counts.conceptCalls.at(-1);
assert.deepEqual([sent.prompt, sent.level, sent.preset, sent.intent], ["swamp hag", 6, null, "monster"],
  "the request supplies its own brief and level, with no preset, as a Monster");
assert.equal(preview._test_input.preset, "brute", "the GM's selected preset is left as it was");
assert.equal(counts.writes, writesBeforePreview, "a preview never writes");
assert.equal(preview._test_experimentalDraft, true, "the draft is marked as experimental");
assert.equal(preview._test_concept.gmPrompt, "swamp hag", "the brief stays with the draft");
assert.equal(preview._test_input.mode, "monster", "the result is shown in the Monster view");
assert.equal(preview._test_input.prompt, "GM monster draft", "the Monster draft returns to the view unchanged");
assert.equal(preview._test_modePrompts.character, "courier draft", "the typed Character draft is kept");
assert.equal(preview._test_modePrompts.monster, "GM monster draft", "the Monster draft is kept");
assert.equal(preview._test_input.level, 3, "the GM's level control is not overwritten by the request");
assert.equal(preview._progress.status, "success");
assert.equal(preview._test_busy, false);

// Creating a previewed draft is refused once the GM disables the gate. The draft is
// kept; re-enabling the gate allows the same reviewed draft to be created.
setGate(false);
const writesBeforeRefusedCreate = counts.writes;
await actions.createActor.call(preview);
assert.equal(counts.writes, writesBeforeRefusedCreate, "a disabled gate blocks the native write");
assert.equal(preview._test_error, "SIMPLYPF2E.Experimental.Disabled");
assert.equal(preview._progress.status, "error");
assert.ok(preview._test_concept, "the reviewed draft is kept for a later authorized create");
setGate(true);
await actions.createActor.call(preview);
assert.equal(counts.writes, writesBeforeRefusedCreate + 1, "the same draft creates once the gate is re-enabled");
assert.equal(preview._test_concept, null);
assert.equal(preview._test_error, null);

// A one-click request whose gate is disabled during generation is refused at the
// native write boundary. Nothing is written and the draft remains for review.
setGate(true);
formState.mode = "monster"; formState.prompt = "GM monster draft"; formState.level = "3";
const oneClick = newApp();
onConcept = () => setGate(false);
const writesBeforeOneClick = counts.writes;
assert.equal(await oneClick.startExperimentalMonsterRequest({ prompt: "wyrm", level: 9, intent: "generate" }), true);
onConcept = null;
assert.equal(counts.writes, writesBeforeOneClick, "a gate disabled during generation blocks creation");
assert.equal(oneClick._test_error, "SIMPLYPF2E.Experimental.Disabled");
assert.equal(oneClick._progress.steps.find((step) => step.key === "apply").state, "error");
assert.ok(oneClick._test_concept, "the refused draft remains available for review");

// Reroll spends provider tokens on an experimental draft, so the gate is checked there too.
setGate(false);
const lootBefore = counts.lootCalls;
await actions.rerollLoot.call(oneClick);
assert.equal(counts.lootCalls, lootBefore, "a disabled gate blocks a reroll that would spend tokens");
assert.equal(warnings.at(-1), "SIMPLYPF2E.Experimental.Disabled");
setGate(true);

// The supported Monster path is unchanged with the gate off: it reads the form and
// creates normally, and it is never marked as an experimental draft.
setGate(false);
formState.mode = "monster"; formState.prompt = "A giant frog"; formState.level = "2";
const supported = newApp();
supported._test_input.preset = "brute";
await actions.previewPlan.call(supported);
const supportedCall = counts.conceptCalls.at(-1);
assert.deepEqual([supportedCall.prompt, supportedCall.level, supportedCall.preset], ["A giant frog", 2, "preset brute"],
  "the supported path reads the form and still applies the selected preset");
assert.equal(supported._test_experimentalDraft, false);
const writesBeforeSupported = counts.writes;
await actions.createActor.call(supported);
assert.equal(counts.writes, writesBeforeSupported + 1, "a supported draft creates with the experimental setting off");
setGate(true);

// A duplicate or concurrent request cannot start a second run while one is pending.
// The normal Generate button is also blocked, so one provider request is in flight.
let releaseConcept;
onConcept = () => new Promise((resolve) => { releaseConcept = resolve; });
const running = newApp();
const conceptsBeforeRun = counts.conceptCalls.length;
const pending = running.startExperimentalMonsterRequest(VALID);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(counts.conceptCalls.length, conceptsBeforeRun + 1, "the first request reached the provider once");
assert.equal(await running.startExperimentalMonsterRequest({ prompt: "wyrm", level: 9, intent: "generate" }), false);
assert.equal(takeWarnings().at(-1), "SIMPLYPF2E.Chat.ForgeBusy");
await actions.generate.call(running);
assert.equal(counts.conceptCalls.length, conceptsBeforeRun + 1, "no duplicate provider request starts");
releaseConcept();
onConcept = null;
assert.equal(await pending, true);
assert.equal(running._progress.status, "success");

// The first chat request arrives before the window has ever rendered. It starts
// without a form to read, and its brief and level are used.
const unrendered = new GeneratorApp();
assert.equal(await unrendered.startExperimentalMonsterRequest({ prompt: "ghoul", level: 4, intent: "preview" }), true);
assert.equal(counts.conceptCalls.at(-1).prompt, "ghoul");
assert.equal(unrendered._test_input.mode, "monster");
assert.equal(unrendered._progress.status, "success");

console.log("generator-app.experimental.test.mjs: entry, drafts, duplicate guards, reroll and write-boundary rechecks passed");
