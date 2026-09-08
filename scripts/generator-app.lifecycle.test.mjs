// Production GeneratorApp lifecycle integration with the real SpfApp/progress
// implementation. Foundry documents and AI calls are isolated at import edges.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import * as progress from "./progress.mjs";
import * as tokens from "./tokens.mjs";

if (!vm.SourceTextModule) {
  const run = spawnSync(process.execPath, ["--experimental-vm-modules", import.meta.filename], { stdio: "inherit" });
  process.exit(run.status ?? 1);
}
let writes = 0, creates = 0, starts = 0, finishes = 0, locked = 0, providerCalls = 0, classCalls = 0, equipmentSelections = 0, lootSelections = 0;
let releaseWrite = null, writePending = null, failWrite = null, conceptPending = null, pcConceptPending = null, readinessPending = null, readinessFailure = null;
let pcConceptUsage = { total: 1 }, abcFailure = null;
class Application {
  render() { return this; }
  async close() {}
}
const context = vm.createContext({
  AbortController, setInterval: () => 1, clearInterval: () => {},
  console: { log() {}, warn() {}, error() {} },
  foundry: { applications: { api: { ApplicationV2: Application, HandlebarsApplicationMixin: (base) => base } } },
  game: {
    i18n: { localize: (key) => key, format: (key) => key },
    settings: { get: () => false }, packs: null,
    actors: { get: () => null }
  },
  ui: { notifications: { info() {}, warn() {}, error() {} } },
  Folder: { create: async () => ({ id: "folder", name: "Encounter", async delete() {} }) }
});
const baseSource = await readFile(new URL("./app-base.mjs", import.meta.url), "utf8");
const base = new vm.SourceTextModule(baseSource, { context });
const baseImports = (source, specifier) => [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)]
  .filter((match) => match[2] === specifier).flatMap((match) => match[1].split(",").map((name) => name.trim()));
await base.link((specifier) => {
  const names = baseImports(baseSource, specifier);
  const values = specifier === "./progress.mjs" ? progress : specifier === "./tokens.mjs" ? tokens : {
    getProviderRequestConfig: () => ({}), selectProviderConnection: async () => {}, ProviderSetupApp: class {}
  };
  return new vm.SyntheticModule(names, function () { for (const name of names) this.setExport(name, values[name]); }, { context });
});
await base.evaluate();
const RealSpfApp = base.namespace.SpfApp;
const originalBegin = RealSpfApp.prototype._beginProgress;
const originalFinish = RealSpfApp.prototype._finishRun;
const originalLock = RealSpfApp.prototype._lockCreation;
RealSpfApp.prototype._beginProgress = function (...args) { starts++; return originalBegin.apply(this, args); };
RealSpfApp.prototype._finishRun = function (...args) { finishes++; return originalFinish.apply(this, args); };
RealSpfApp.prototype._lockCreation = function (...args) { locked++; return originalLock.apply(this, args); };

let mode = "npc";
let progressRows = null;
const form = {
  querySelector(selector) {
    if (selector.includes('mode')) return { value: mode };
    if (selector.includes('prompt')) return { value: "test brief" };
    if (selector.includes('level')) return { value: "1" };
    if (selector.includes('partySize')) return { value: "4" };
    if (selector.includes('threat')) return { value: "moderate" };
    if (selector.includes('allowSpellcasting')) return { checked: false };
    return null;
  }, querySelectorAll: (selector) => selector === ".spf-progress-steps li" ? (progressRows ?? []) : [], contains: () => false
};
const concept = () => ({ name: "Test", level: 1, rarity: "common", spellcasting: null, focusSpells: [], specialAbilities: [], feats: [], equipment: [{ name: "Lantern" }], loot: [{ name: "Silver Ring", quantity: 1 }], strikes: [] });
const actor = () => ({ id: `actor-${++creates}`, name: "Test", items: { contents: [] }, sheet: { render: async () => {} }, update: async () => {}, delete: async () => {} });
const create = async () => {
  assert.equal(appUnderTest._test_busy, true, "busy remains true through generation into native creation");
  assert.equal(appUnderTest._canCancel, false, "native write locks cancellation");
  if (writePending) await writePending;
  if (failWrite) throw failWrite;
  writes++;
  return { actor: actor(), expectedItems: [] };
};
const mocks = {
  SpfApp: RealSpfApp, MODULE_ID: "simplypf2e", SETTINGS: { freeArchetype: "free" }, AI_TASK: {}, taskMaxTokens: () => 100,
  getProviderRequestConfig: () => ({}), getProviderAuthWarningKey: () => null,
  getCustomPresets: () => [], findPreset: () => null, examplePrompt: () => "", presetPickerGroups: () => ({ selectedId: "", standard: [], custom: [] }),
  randomBrief: () => "random", sourceReadiness: () => ({ ready: true }), supportedClassCandidates: (x) => x,
  freeArchetypeNeedsPrerequisiteValidation: () => false, getClassCandidates: async () => {
    classCalls++; if (readinessPending) await readinessPending; if (readinessFailure) throw readinessFailure; return [{ name: "Fighter" }];
  },
  generateConcept: async () => { providerCalls++; if (conceptPending) await conceptPending; return { concept: concept(), usage: { total: 1 } }; }, normalizeConcept: (x) => x,
  resolveConcept: async (value) => ({ abilities: [], spells: [], feats: [], focusSpells: [],
    equipment: value.equipment.map((item) => ({ ...item, entry: {} })),
    loot: value.loot.map((item) => ({ ...item, entry: {} })) }),
  completionManifest: () => ({}), assertComplete: () => {}, verifyCreatedActor: () => {},
  findBestiaryScaffold: async () => ({ img: null }), createActor: create,
  applyTreasureBudget: async (x) => x, treasureBudget: () => 0, lootValueGp: () => 0,
  composeEncounter: () => ({ budget: 80, spent: 80, members: [{ level: 1, count: 1 }] }),
  designEncounter: async () => ({ name: "Encounter", briefs: ["brief"], usage: { total: 1 } }),
  // PC path: all choice/refinement catalogs are empty, but the real app still
  // crosses the same generate → validated plan → locked create boundary.
  generatePCConcept: async () => { providerCalls++; if (pcConceptPending) await pcConceptPending; return { concept: concept(), usage: pcConceptUsage }; }, normalizePCConcept: (x) => x,
  getAncestryCandidates: async () => [], getBackgroundCandidates: async () => [], getHeritageCandidates: async () => [],
  selectAncestryBackgroundClass: async () => { if (abcFailure) throw abcFailure; return { ancestry: "Human", background: "Worker", class: "Fighter" }; },
  resolvePCConcept: async () => ({ ancestryDoc: { name: "Human" }, classDoc: { name: "Fighter" }, backgroundDoc: { name: "Worker" }, featSlots: [], feats: [], spells: [], equipment: [], loot: [] }),
  pcSpellcastingProfile: () => null, pcStartingWealthGp: () => 0, equipmentValueGp: async () => 0,
  generatePCLoot: async () => ({ loot: [], usage: { total: 1 } }), normalizeLoot: (x) => x,
  dedupeLootAgainstEquipment: (x) => x, enforceNamedLootBudget: (x) => x,
  createCharacterActor: create, reviewUnresolvedChoices: () => ({ choices: [], incomplete: false }),
  normalizeSkillPriorities: () => [], skillPriorityOrder: () => [], slugify: (x) => x.toLowerCase(),
  getEquipmentCandidates: async () => [{ id: "equipment", name: "Lantern", ref: {} }], getLootCandidates: async () => [{ id: "loot", name: "Silver Ring", ref: {} }], getSpellCandidates: async () => [], getScrollSpellCandidates: async () => [], getFocusSpellCandidates: async () => [], getFeatCandidates: async () => [], getAbilityCandidates: async () => [],
  selectEquipment: async () => { equipmentSelections++; return { equipment: [], omitted: true }; },
  selectLoot: async () => { lootSelections++; return { loot: [], omitted: true }; }, selectSpells: async () => ({ spells: [] }), chooseSpellFocus: async () => ({ keywords: [] }), selectFeats: async () => ({ picks: [] }), resolveFeatPicks: async () => [], selectCreatureFeats: async () => ({ feats: [], omitted: true }), selectCreatureAbilities: async () => ({ abilities: [] }),
  parseCoins: () => null, parseScroll: () => null, normalizeSkillPriorities: () => [], skillPriorityOrder: () => [],
  THREATS: {}, TREASURE_AMOUNT_MULTIPLIER: {}, ManagePresetsApp: class {}, SourcesConfigApp: class {},
  computeStats: () => ({}), completionSummary: () => ({}), pcSpellPlan: () => ({ picks: [], slots: {} }),
  authorizeApiKeyForCurrentBaseUrl: async () => {}, reviewUnresolvedChoices: () => ({ choices: [], incomplete: false })
};
let appUnderTest;
const generatorSource = (await readFile(new URL("./generator-app.mjs", import.meta.url), "utf8")).replace(/#([A-Za-z]\w*)/g, "_test_$1");
const generator = new vm.SourceTextModule(generatorSource, { context });
await generator.link((specifier) => {
  if (specifier === "./app-base.mjs") return base;
  const names = baseImports(generatorSource, specifier);
  return new vm.SyntheticModule(names, function () {
    for (const name of names) this.setExport(name, mocks[name] ?? (() => undefined));
  }, { context });
});
await generator.evaluate();
const { GeneratorApp } = generator.namespace;
const actions = GeneratorApp.DEFAULT_OPTIONS.actions;
function app() { const value = new GeneratorApp(); value.element = form; value._test_input.mode = mode; return value; }

for (const nextMode of ["npc", "character", "encounter"]) {
  mode = nextMode;
  appUnderTest = app();
  const before = { starts, finishes, writes, locked };
  await appUnderTest._test_runGeneration(false, { create: true });
  assert.equal(starts, before.starts + 1, `${nextMode}: one outer progress run`);
  assert.equal(finishes, before.finishes + 1, `${nextMode}: one terminal finish`);
  assert.equal(writes, before.writes + (nextMode === "encounter" ? 1 : 1));
  assert.equal(locked, before.locked + 1, `${nextMode}: exactly one native-write lock`);
  assert.equal(appUnderTest._test_busy, false);
  assert.equal(appUnderTest._progress.percent, 100);
  assert.equal(appUnderTest._progress.steps.some((step) => step.state === "pending"), false,
    `${nextMode}: declared unused work is explicitly skipped before success`);
}
// Selector fallbacks during encounter construction run under memberN. A
// repeated member update must retain the warning flag until terminal settle.
const warningApp = app();
warningApp._beginProgress([["member0", "Member"], ["match", "Match"]]);
await warningApp._setStep("member0");
warningApp._test_warnToleratedStage("spells");
await warningApp._setStep("member0", "retrying member selection");
await warningApp._setStep("match");
assert.equal(warningApp._progress.steps[0].state, "warning",
  "a member selector fallback remains warning after repeated member status updates");
warningApp._finishRun("warning");

// Readiness itself is asynchronous in Character mode. The first click owns
// the synchronous busy reservation; a second click cannot reach the provider.
mode = "character"; appUnderTest = app(); let releaseReadiness;
readinessPending = new Promise((resolve) => { releaseReadiness = resolve; });
const beforeReadinessProvider = providerCalls;
const readinessFirst = actions.generate.call(appUnderTest);
await new Promise((resolve) => setImmediate(resolve));
const readinessDuplicate = actions.generate.call(appUnderTest);
releaseReadiness(); await Promise.all([readinessFirst, readinessDuplicate]); readinessPending = null;
assert.equal(providerCalls, beforeReadinessProvider + 1,
  "a deferred readiness check admits one Generate/provider call");
// A rejected readiness check releases its reservation and the same app retries.
appUnderTest = app(); readinessFailure = new Error("class catalog unavailable");
await actions.generate.call(appUnderTest);
assert.equal(appUnderTest._test_busy, false, "failed readiness releases busy");
assert.equal(appUnderTest._test_error, "class catalog unavailable");
readinessFailure = null; const beforeRetry = providerCalls;
await actions.generate.call(appUnderTest);
assert.equal(providerCalls, beforeRetry + 1, "generation retries after readiness failure");
// Explicit Create is public and must remain blocked while its native write is
// pending; it never receives the one-click continuation token.
mode = "npc"; appUnderTest = app(); await actions.previewPlan.call(appUnderTest);
const beforeExplicitCreate = writes; let releaseExplicit;
writePending = new Promise((resolve) => { releaseExplicit = resolve; });
const explicitFirst = actions.createActor.call(appUnderTest);
await new Promise((resolve) => setImmediate(resolve));
const explicitDuplicate = actions.createActor.call(appUnderTest);
releaseExplicit(); await Promise.all([explicitFirst, explicitDuplicate]); writePending = null;
assert.equal(writes, beforeExplicitCreate + 1, "duplicate public Create cannot duplicate a pending native write");

// A completed no-spell NPC and a new no-spell PC both have seven progress
// rows. A matching stale DOM list must not suppress the first full render:
// the outer shell owns busy-disabled controls and clears the old completion.
mode = "character"; appUnderTest = app();
appUnderTest._test_created = { name: "Old NPC", count: 1 };
progressRows = Array.from({ length: 7 }, () => ({ className: "", setAttribute() {}, querySelector: () => null }));
let releasePCConcept;
pcConceptPending = new Promise((resolve) => { releasePCConcept = resolve; });
let firstPCShellRenders = 0;
const realRender = appUnderTest.render;
appUnderTest.render = async function (...args) { firstPCShellRenders++; return realRender.apply(this, args); };
const firstPC = actions.generate.call(appUnderTest);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(firstPCShellRenders, 1,
  "a same-length stale progress list still receives one full shell render before the provider call");
assert.equal(appUnderTest._test_busy, true);
assert.equal(appUnderTest._test_created, null, "the new run clears a prior completion before provider work begins");
releasePCConcept(); await firstPC;
pcConceptPending = null;
progressRows = null;

// A failed validated ABC response still consumed provider tokens. The outer
// PC catch records that usage under the active ABC stage exactly once.
mode = "character"; appUnderTest = app();
pcConceptUsage = { total: 5 };
abcFailure = Object.assign(new Error("invalid ABC response"), { usage: { total: 17 } });
await actions.previewPlan.call(appUnderTest);
abcFailure = null;
pcConceptUsage = { total: 1 };
const abcEntries = appUnderTest._tokenUsage.filter(({ label }) => label === "SIMPLYPF2E.Progress.ABC");
assert.equal(abcEntries.length, 1, "failed ABC usage is recorded once");
assert.equal(abcEntries[0].usage.total, 17, "failed ABC usage is recorded under the ABC stage");
assert.equal(appUnderTest._lastRunCost.total, 22, "failed ABC usage contributes to the run total");

// Module-owned disabled categories clear a noncompliant concept before its
// selector/budget path; provider prose cannot reintroduce gear or treasure.
mode = "npc"; appUnderTest = app();
appUnderTest._test_input.includeEquipment = false;
appUnderTest._test_input.includeLoot = false;
const beforeDisabledSelectors = [equipmentSelections, lootSelections];
await actions.previewPlan.call(appUnderTest);
assert.deepEqual([equipmentSelections, lootSelections], beforeDisabledSelectors,
  "disabled creature categories skip equipment and loot selectors");
assert.equal(appUnderTest._test_concept.equipment.length, 0);
assert.equal(appUnderTest._test_concept.loot.length, 0);
assert.equal(appUnderTest._test_resolved.equipment.length, 0);
assert.equal(appUnderTest._test_resolved.loot.length, 0);

// Encounter members receive the same module-owned controls before each
// member's refinement and encounter-wide treasure split.
mode = "encounter"; appUnderTest = app();
appUnderTest._test_input.includeEquipment = false;
appUnderTest._test_input.includeLoot = false;
const beforeEncounterSelectors = [equipmentSelections, lootSelections];
await actions.previewPlan.call(appUnderTest);
assert.deepEqual([equipmentSelections, lootSelections], beforeEncounterSelectors,
  "disabled encounter categories skip every member selector");
assert.equal(appUnderTest._test_encounter.members.length, 1);
for (const member of appUnderTest._test_encounter.members) {
  assert.equal(member.concept.equipment.length, 0);
  assert.equal(member.concept.loot.length, 0);
  assert.equal(member.resolved.equipment.length, 0);
  assert.equal(member.resolved.loot.length, 0);
  assert.equal(member.treasureBudgetEach, 0);
}

// Preview and random generation validate plans but never create a document.
mode = "npc"; appUnderTest = app(); const noWrite = writes;
await actions.previewPlan.call(appUnderTest); await actions.generateRandom.call(appUnderTest);
assert.equal(writes, noWrite, "preview/random never write");
// A duplicate user action while the first native write is pending cannot begin
// another run or create twice; cancellation has already been locked out.
appUnderTest = app(); writePending = new Promise((resolve) => { releaseWrite = resolve; });
const first = actions.generate.call(appUnderTest);
await new Promise((resolve) => setImmediate(resolve));
const duplicate = actions.generate.call(appUnderTest);
assert.equal(appUnderTest._canCancel, false);
releaseWrite(); await Promise.all([first, duplicate]); writePending = releaseWrite = null;
assert.equal(writes, noWrite + 1, "duplicate action is blocked during creation");
// A native creation failure is terminal below 100; a cancelled preview is also
// terminal below 100 and retains no error copy.
appUnderTest = app(); failWrite = new Error("write failed"); await actions.generate.call(appUnderTest); failWrite = null;
assert.equal(appUnderTest._progress.status, "error"); assert.ok(appUnderTest._progress.percent < 100);
let releaseConcept; conceptPending = new Promise((resolve) => { releaseConcept = resolve; });
appUnderTest = app(); const running = actions.previewPlan.call(appUnderTest);
await new Promise((resolve) => setImmediate(resolve)); actions.cancelGeneration.call(appUnderTest); releaseConcept(); await running; conceptPending = null;
assert.equal(appUnderTest._progress.status, "cancelled"); assert.ok(appUnderTest._progress.percent < 100); assert.equal(appUnderTest._test_error, null);
console.log("generator-app.lifecycle.test.mjs: real SpfApp one-click, preview, duplicate, error and cancellation lifecycles passed");
