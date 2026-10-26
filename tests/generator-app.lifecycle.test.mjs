// Production GeneratorApp lifecycle integration with the real SpfApp/progress
// implementation. Foundry documents and AI calls are isolated at import edges.
import assert from "node:assert/strict";
import * as identityHelpers from "../scripts/pc-identity.mjs";
import { getBackgroundLoreOptions } from "../scripts/pc-background-lore.mjs";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import * as progress from "../scripts/progress.mjs";
import * as tokens from "../scripts/tokens.mjs";

if (!vm.SourceTextModule) {
  const run = spawnSync(process.execPath, ["--experimental-vm-modules", import.meta.filename], { stdio: "inherit" });
  process.exit(run.status ?? 1);
}
let writes = 0, creates = 0, starts = 0, finishes = 0, locked = 0, providerCalls = 0, classCalls = 0, equipmentSelections = 0, lootSelections = 0;
let creationAttempts = 0, actorDeletes = 0, folderDeletes = 0, folderCreates = 0;
let releaseWrite = null, writePending = null, failWrite = null, failWriteOnAttempt = null, conceptPending = null, pcConceptPending = null, readinessPending = null, readinessFailure = null;
let pcConceptUsage = { total: 1 }, abcFailure = null, abcResult = null;
let pathDiscovery = null;
let identityClasses = [{ name: "Fighter", ref: { packId: "pf2e.classes", _id: "fighter" } }];
let identityBackgrounds = [];
let offeredBackgrounds = [];
let npcFeats = [], npcFeatFailure = null, gmPrompt = "test brief", encounterDesigns = 0, encounterMemberCount = 1;
let pcEditGate = { complete: true, pending: [], errors: [], unresolved: [], manifest: {} };
let pcEditRefusal = null, pcEditInvalidated = [], pcEditSelections = {};
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
  Folder: { create: async () => ({ id: `folder-${++folderCreates}`, name: "Encounter", async delete() { folderDeletes++; } }) }
});
const baseSource = await readFile(new URL("../scripts/app-base.mjs", import.meta.url), "utf8");
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
let identityControls = null;
const form = {
  querySelector(selector) {
    if (identityControls && selector.startsWith('[name="pcIdentity.')) return identityControls.find((control) => `[name="${control.name}"]` === selector) ?? null;
    if (selector.includes('mode')) return { value: mode };
    if (selector.includes('prompt')) return { value: gmPrompt };
    if (selector.includes('level')) return { value: "1" };
    if (selector.includes('partySize')) return { value: "4" };
    if (selector.includes('threat')) return { value: "moderate" };
    if (selector.includes('allowSpellcasting')) return { checked: false };
    return null;
  }, querySelectorAll: (selector) => selector === ".spf-progress-steps li" ? (progressRows ?? [])
    : identityControls && selector.startsWith('[name^="pcIdentity.classPaths."]') ? identityControls.filter((control) => control.name.startsWith("pcIdentity.classPaths.")) : [],
  contains: () => false
};
const concept = () => ({ name: "Test", level: 1, rarity: "common", spellcasting: null, focusSpells: [], specialAbilities: [], feats: [...npcFeats], equipment: [{ name: "Lantern" }], loot: [{ name: "Silver Ring", quantity: 1 }], strikes: [] });
const actor = () => {
  const value = { id: `actor-${++creates}`, name: "Test", deleteCalls: 0,
    items: { contents: [] }, sheet: { render: async () => {} }, update: async () => {} };
  value.delete = async () => { actorDeletes++; value.deleteCalls++; };
  return value;
};
const create = async () => {
  assert.equal(appUnderTest._test_busy, true, "busy remains true through generation into native creation");
  assert.equal(appUnderTest._canCancel, false, "native write locks cancellation");
  if (writePending) await writePending;
  creationAttempts++;
  if (failWrite && (failWriteOnAttempt === null || failWriteOnAttempt === creationAttempts)) {
    // Model builder-owned package rollback. A successful cleanup throws the
    // original error without a marker; failed cleanup leaves the marker so
    // the outer transaction can report it without deleting twice.
    if (failWrite.cleanedActor) await failWrite.cleanedActor.delete();
    throw failWrite;
  }
  writes++;
  return { actor: actor(), expectedItems: [] };
};
const mocks = {
  ...identityHelpers, getBackgroundLoreOptions, getDocument: async () => pathDiscovery ? { toObject: () => ({}) } : null,
  getClassPathCandidates: async () => pathDiscovery ?? [], validatePCIdentityRequirements: async () => {},
  getCreatureFeatCandidates: async () => [{ id: "charge", name: "Sudden Charge", level: 1, ref: { packId: "pf2e.feats-srd", _id: "charge" } }],
  normalizeCreatureFeatName: (name) => String(name ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(),
  filterNpcAbilityCandidates: async (candidates) => ({ candidates, unavailable: [] }),
  resolveNpcAbilityPackages: async () => ({ cost: 0 }),
  SpfApp: RealSpfApp, MODULE_ID: "simplypf2e", SETTINGS: { freeArchetype: "free" }, AI_TASK: {}, taskMaxTokens: () => 100,
  getProviderRequestConfig: () => ({}), getProviderAuthWarningKey: () => null,
  getCustomPresets: () => [], findPreset: () => null, examplePrompt: () => "", presetPickerGroups: () => ({ selectedId: "", standard: [], custom: [] }),
  randomBrief: () => "random", sourceReadiness: () => ({ ready: true }), supportedClassCandidates: (x) => x,
  getClassCandidates: async () => {
    classCalls++; if (readinessPending) await readinessPending; if (readinessFailure) throw readinessFailure; return identityClasses;
  },
  generateConcept: async () => { providerCalls++; if (conceptPending) await conceptPending; return { concept: concept(), usage: { total: 1 } }; }, normalizeConcept: (x) => x,
  resolveConcept: async (value) => ({ abilities: [], spells: [], feats: [], focusSpells: [],
    equipment: value.equipment.map((item) => ({ ...item, entry: {} })),
    loot: value.loot.map((item) => ({ ...item, entry: {} })) }),
  completionManifest: () => ({}), assertComplete: () => {}, verifyCreatedActor: () => {},
  findBestiaryScaffold: async () => ({ img: null }), createActor: create,
  applyTreasureBudget: async (x) => x, treasureBudget: () => 0, lootValueGp: () => 0,
  composeEncounter: () => ({ budget: 80, spent: 80, members: Array.from({ length: encounterMemberCount }, () => ({ level: 1, count: 1 })) }),
  designEncounter: async () => { encounterDesigns++; return { name: "Encounter", briefs: ["brief"], usage: { total: 1 } }; },
  // PC path: all choice/refinement catalogs are empty, but the real app still
  // crosses the same generate → validated plan → locked create boundary.
  generatePCConcept: async () => { providerCalls++; if (pcConceptPending) await pcConceptPending; return { concept: concept(), usage: pcConceptUsage }; }, normalizePCConcept: (x) => x,
  getAncestryCandidates: async () => [], getBackgroundCandidates: async () => identityBackgrounds, getHeritageCandidates: async () => [],
  selectAncestryBackgroundClass: async ({ backgroundCandidates }) => { offeredBackgrounds = backgroundCandidates; if (abcFailure) throw abcFailure; return abcResult ?? { ancestry: "Human", background: "Worker", class: "Fighter" }; },
  resolvePCConcept: async () => ({ ancestryDoc: { name: "Human" }, classDoc: { name: "Fighter" }, backgroundDoc: { name: "Worker" }, featSlots: [], feats: [], spells: [], equipment: [], loot: [] }),
  pcSpellcastingProfile: () => null, pcStartingWealthGp: () => 0, equipmentValueGp: async () => 0,
  generatePCLoot: async () => ({ loot: [], usage: { total: 1 } }), normalizeLoot: (x) => x,
  dedupeLootAgainstEquipment: (x) => x, enforceNamedLootBudget: (x) => x,
  createCharacterActor: create, reviewUnresolvedChoices: () => ({ choices: [], incomplete: false }),
  validatePCEditCompletion: () => pcEditGate,
  applyPCEdit: async (plan) => { if (pcEditRefusal) throw pcEditRefusal; return { plan, changed: ["classPath"], invalidated: pcEditInvalidated, equipmentGp: 0 }; },
  pcEditFromControl: (control, value) => ({ control, value }),
  pcEditorSelections: () => pcEditSelections, pcEditorInvalidatedControls: (items = []) => items.map((item) => (item.field === "feat" ? `feat.${item.slot}` : item.field)),
  heritageMatchesAncestry: () => true,
  normalizeSkillPriorities: () => [], skillPriorityOrder: () => [], slugify: (x) => x.toLowerCase(),
  getEquipmentCandidates: async () => [{ id: "equipment", name: "Lantern", ref: {} }], getLootCandidates: async () => [{ id: "loot", name: "Silver Ring", ref: {} }], getSpellCandidates: async () => [], getScrollSpellCandidates: async () => [], getFocusSpellCandidates: async () => [], getFeatCandidates: async () => [], getAbilityCandidates: async () => [],
  selectEquipment: async () => { equipmentSelections++; return { equipment: [], omitted: true }; },
  selectLoot: async () => { lootSelections++; return { loot: [], omitted: true }; }, selectSpells: async () => ({ spells: [] }), chooseSpellFocus: async () => ({ keywords: [] }), selectFeats: async () => ({ picks: [] }), resolveFeatPicks: async () => [], selectCreatureFeats: async () => { if (npcFeatFailure) throw npcFeatFailure; return { feats: [], omitted: true }; }, selectCreatureAbilities: async () => ({ abilities: [] }),
  parseCoins: () => null, parseScroll: () => null, normalizeSkillPriorities: () => [], skillPriorityOrder: () => [],
  THREATS: {}, TREASURE_AMOUNT_MULTIPLIER: {}, ManagePresetsApp: class {}, SourcesConfigApp: class {},
  computeStats: () => ({}), completionSummary: () => ({}), pcSpellPlan: () => ({ picks: [], slots: {} }),
  authorizeApiKeyForCurrentBaseUrl: async () => {},
  HAZARD_MIN_LEVEL: -1, HAZARD_MAX_LEVEL: 24,
  generateHazardConcept: async () => { providerCalls++; throw new Error("hazard provider must not be reached"); }, reviewUnresolvedChoices: () => ({ choices: [], incomplete: false })
};
let appUnderTest;
const generatorSource = (await readFile(new URL("../scripts/generator-app.mjs", import.meta.url), "utf8")).replace(/#([A-Za-z]\w*)/g, "_test_$1");
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
// A package builder that successfully removes its partial actor rethrows the
// original error without a marker. The app preserves the draft for a retry and
// does not attempt a second cleanup of the already-removed actor.
mode = "npc"; appUnderTest = app(); await actions.previewPlan.call(appUnderTest);
const npcDraft = appUnderTest._test_concept;
const npcManifest = appUnderTest._test_manifest;
const cleanedNpc = actor();
const npcDeletesBefore = actorDeletes;
failWrite = Object.assign(new Error("native package embedding failed"), { cleanedActor: cleanedNpc });
await actions.createActor.call(appUnderTest);
assert.equal(actorDeletes, npcDeletesBefore + 1, "NPC builder-owned cleanup runs once");
assert.equal(appUnderTest._test_concept, npcDraft, "NPC draft remains available after successful builder cleanup");
assert.equal(appUnderTest._test_manifest, npcManifest, "NPC manifest remains available after successful builder cleanup");
failWrite = null;

// A failed builder cleanup marks the stranded actor. The app reports it,
// discards the retry state, and leaves the marker actor untouched.
appUnderTest = app(); await actions.previewPlan.call(appUnderTest);
const strandedNpc = actor();
failWrite = Object.assign(new Error("native package embedding failed"), { simplyPF2eRollbackActor: strandedNpc });
await actions.createActor.call(appUnderTest);
assert.equal(strandedNpc.deleteCalls, 0, "NPC marker actor is not deleted twice");
assert.equal(appUnderTest._test_concept, null, "NPC draft is discarded when cleanup leaves a survivor");
assert.equal(appUnderTest._test_manifest, null, "NPC manifest is discarded when cleanup leaves a survivor");
assert.match(appUnderTest._test_error, /incomplete actor/);
failWrite = null;

// Encounter cleanup follows the same builder contract. With no survivor, the
// encounter draft remains retryable after all folder/actor cleanup succeeds.
mode = "encounter"; encounterMemberCount = 1; appUnderTest = app(); await actions.previewPlan.call(appUnderTest);
const encounterDraft = appUnderTest._test_encounter;
const cleanedEncounter = actor();
const encounterDeletesBefore = actorDeletes;
const foldersDeletedBefore = folderDeletes;
failWrite = Object.assign(new Error("native package embedding failed"), { cleanedActor: cleanedEncounter });
await actions.createActor.call(appUnderTest);
assert.equal(actorDeletes, encounterDeletesBefore + 1, "encounter builder-owned cleanup runs once");
assert.equal(folderDeletes, foldersDeletedBefore + 1, "encounter folder is removed after successful member cleanup");
assert.equal(appUnderTest._test_encounter, encounterDraft, "encounter draft remains available after successful cleanup");
failWrite = null;

// If a later member strands an actor, earlier newly-created members are still
// rolled back, while the marked actor is reported without a redundant delete.
encounterMemberCount = 2; appUnderTest = app(); await actions.previewPlan.call(appUnderTest);
const strandedEncounter = actor();
const encounterPriorDeletes = actorDeletes;
failWrite = Object.assign(new Error("native package embedding failed"), { simplyPF2eRollbackActor: strandedEncounter });
failWriteOnAttempt = creationAttempts + 2;
await actions.createActor.call(appUnderTest);
assert.equal(actorDeletes, encounterPriorDeletes + 1, "earlier encounter member is rolled back");
assert.equal(strandedEncounter.deleteCalls, 0, "stranded encounter member is not deleted twice");
assert.equal(appUnderTest._test_encounter, null, "encounter draft is discarded when a member survives cleanup");
assert.match(appUnderTest._test_error, /incomplete actor/);
failWrite = null; failWriteOnAttempt = null; encounterMemberCount = 1;
// Invalid grounded NPC selection is reported at its own stage, retaining
// spent tokens exactly once and stopping before equipment, loot or writes.
for (const failureMode of ["npc", "encounter"]) {
  mode = failureMode; appUnderTest = app(); npcFeats = [{ name: "Sudden Charge" }];
  npcFeatFailure = Object.assign(new Error("NPC ability selection returned an unoffered ID"), {
    code: "NPC_FEAT_SELECTION_INVALID", usage: { total: 17 }
  });
  const before = { writes, equipmentSelections, lootSelections };
  await actions.generate.call(appUnderTest);
  assert.equal(writes, before.writes);
  assert.equal(equipmentSelections, before.equipmentSelections);
  assert.equal(lootSelections, before.lootSelections);
  assert.equal(appUnderTest._test_error, npcFeatFailure.message);
  assert.equal(appUnderTest._progress.status, "error");
  assert.equal(appUnderTest._progress.steps.find((step) => step.key === (mode === "npc" ? "feats" : "member0")).state, "error");
  assert.equal(appUnderTest._tokenUsage.reduce((sum, row) => sum + row.usage.total, 0), mode === "npc" ? 18 : 19);
  assert.equal(appUnderTest._test_busy, false);
}
npcFeats = []; npcFeatFailure = null;
// Group-scoped named powers cannot be copied onto every AI-authored member.
// The authoritative theme guard runs before design and member provider spend.
mode = "encounter"; appUnderTest = app();
gmPrompt = "A captain with Sudden Charge, accompanied by an apprentice healer.";
const beforeNamedEncounter = { writes, providerCalls, encounterDesigns };
await actions.generate.call(appUnderTest);
assert.equal(writes, beforeNamedEncounter.writes);
assert.equal(providerCalls, beforeNamedEncounter.providerCalls);
assert.equal(encounterDesigns, beforeNamedEncounter.encounterDesigns);
assert.match(appUnderTest._test_error, /member assignment cannot be verified/);
assert.equal(appUnderTest._progress.steps.find((step) => step.key === "design").state, "error");
assert.equal(appUnderTest._tokenUsage.length, 0);
gmPrompt = "test brief";
console.log("generator-app.lifecycle.test.mjs: real SpfApp one-click, preview, duplicate, error and cancellation lifecycles passed");

// Required choices are resolved before the first billable request and remain
// enforced across the real generator orchestration, even with a faulty selector.
mode = "character";
gmPrompt = "A Fighter who works as a courier";
appUnderTest = app();
let identityBefore = { calls: providerCalls, writes, gear: equipmentSelections };
await appUnderTest._test_runGeneration(false, { create: true });
assert.equal(providerCalls, identityBefore.calls, "ambiguous prose identity stops before the concept request");
assert.equal(writes, identityBefore.writes);
assert.ok(appUnderTest._test_error, "ambiguity has actionable feedback");

const requiredFighter = identityClasses[0];
gmPrompt = "A weathered courier";
appUnderTest = app();
appUnderTest._test_input.pcIdentity = { class: identityHelpers.pcIdentityKey(requiredFighter), name: "Required <b>Name</b>" };
abcResult = { ancestry: "Human", background: "Worker", class: "Rogue", classCandidate: { packId: "pf2e.classes", _id: "rogue" } };
identityBefore = { calls: providerCalls, writes, gear: equipmentSelections };
await appUnderTest._test_runGeneration(false, { create: true });
assert.equal(providerCalls, identityBefore.calls + 1);
assert.equal(writes, identityBefore.writes, "faulty selector cannot create the wrong identity");
assert.equal(equipmentSelections, identityBefore.gear, "wrong identity stops before equipment spending");

appUnderTest = app();
appUnderTest._test_input.pcIdentity = { class: identityHelpers.pcIdentityKey(requiredFighter), name: "Required <b>Name</b>" };
abcResult = { ancestry: "Human", background: "Worker", class: "Fighter", classCandidate: requiredFighter.ref };
await appUnderTest._test_runGeneration(false, { create: false });
assert.equal(appUnderTest._test_error, null);
assert.equal(appUnderTest._test_pcConcept.name, "Required <b>Name</b>", "literal required name survives provider normalization and selection");
assert.equal(appUnderTest._test_pcConcept.classCandidate._id, "fighter");
assert.equal(appUnderTest._test_pcConcept.gmPrompt, gmPrompt);

// A saved stale choice must not be downgraded to automatic selection.
appUnderTest = app();
appUnderTest._test_input.pcIdentity = { class: "pf2e.classes:missing" };
identityBefore = { calls: providerCalls, writes };
await appUnderTest._test_runGeneration(false, { create: true });
assert.equal(providerCalls, identityBefore.calls);
assert.equal(writes, identityBefore.writes);

// Random deliberately ignores both required controls and the typed brief.
appUnderTest = app();
appUnderTest._test_input.pcIdentity = { class: "pf2e.classes:missing", name: "Ignored" };
gmPrompt = "Class: Missing";
abcResult = null;
identityBefore = { calls: providerCalls, writes };
await appUnderTest._test_runGeneration(true, { create: false });
assert.equal(appUnderTest._test_error, null);
assert.equal(providerCalls, identityBefore.calls + 1);
assert.equal(writes, identityBefore.writes);
assert.equal(Object.keys(appUnderTest._test_pcConcept.requiredIdentity).length, 0);

// Editing a requirement after preview cannot create the old plan.
gmPrompt = "A weathered courier";
appUnderTest = app();
await appUnderTest._test_runGeneration(false, { create: false });
identityBefore = { calls: providerCalls, writes };
appUnderTest._test_input.pcIdentity.name = "Changed after preview";
await appUnderTest._test_createCharacterActor();
assert.equal(writes, identityBefore.writes);
assert.equal(providerCalls, identityBefore.calls);
assert.match(appUnderTest._test_error, /PreviewChanged/);

// Two class sources sharing one native bridge must not make a path's exact
// source key ambiguous. The picker retains both class relationships.
identityClasses = [
  { name: "Rogue", ref: { packId: "pf2e.classes", _id: "rogue" } },
  { name: "Rogue", ref: { packId: "module.classes", _id: "rogue" } }
];
pathDiscovery = [{ name: "Thief", ref: { packId: "pf2e.classfeatures", _id: "thief" }, uuid: "Compendium.pf2e.classfeatures.Item.thief" }];
appUnderTest = app();
const sharedCatalog = await appUnderTest._test_identityCatalogs();
assert.equal(sharedCatalog.classPath.length, 1);
assert.equal(sharedCatalog.classPath[0].classKeys.length, 2);
const sharedIdentity = identityHelpers.resolvePCIdentity({ choices: {
  class: identityHelpers.pcIdentityKey(identityClasses[1]), classPath: identityHelpers.pcIdentityKey(pathDiscovery[0])
}, catalogs: sharedCatalog });
assert.equal(sharedIdentity.class.ref.packId, "module.classes");
assert.equal(sharedIdentity.classPath.ref._id, "thief");
pathDiscovery = null;

// A class whose paths come from two bridges (Wizard) gets one identity control
// per bridge, held under pcIdentity.classPaths; the single control stays for
// one-bridge classes and while it still holds a stale choice.
identityClasses = [{ name: "Wizard", ref: { packId: "pf2e.classes", _id: "wizard" } }, { name: "Rogue", ref: { packId: "pf2e.classes", _id: "rogue" } }];
const bridgePath = (name, bridge, id) => ({ name, bridge, ref: { packId: "pf2e.classfeatures", _id: id }, uuid: `Compendium.pf2e.classfeatures.Item.${id}` });
const schoolPath = bridgePath("School of Mentalism", "Arcane School", "mentalism");
const thesisPath = bridgePath("Staff Nexus", "Arcane Thesis", "staff-nexus");
pathDiscovery = [schoolPath, bridgePath("School of Battle Magic", "Arcane School", "battle-magic"), thesisPath];
appUnderTest = app();
const wizardKey = identityHelpers.pcIdentityKey(identityClasses[0]);
appUnderTest._test_input.pcIdentity = { class: wizardKey, classPaths: { "Arcane School": identityHelpers.pcIdentityKey(schoolPath) } };
let bridgeFields = await appUnderTest._test_identityFields();
assert.equal(bridgeFields.some((field) => field.field === "classPath"), false, "the mixed single control is replaced");
const schoolField = bridgeFields.find((field) => field.field === "classPaths.Arcane School");
const thesisField = bridgeFields.find((field) => field.field === "classPaths.Arcane Thesis");
assert.equal(schoolField.labelText, "Arcane School");
assert.equal(schoolField.fieldId, "spf-identity-classPaths-Arcane-School", "the element id has no space");
assert.deepEqual(Array.from(schoolField.options, (option) => option.value), [identityHelpers.pcIdentityKey(schoolPath), "pf2e.classfeatures:battle-magic"],
  "each bridge offers only its own paths");
assert.deepEqual(Array.from(thesisField.options, (option) => option.value), [identityHelpers.pcIdentityKey(thesisPath)]);
assert.equal(schoolField.options.find((option) => option.selected).value, identityHelpers.pcIdentityKey(schoolPath));
assert.equal(thesisField.options.some((option) => option.selected), false);
const idsAreUnique = new Set(bridgeFields.map((field) => field.fieldId)).size === bridgeFields.length;
assert.equal(idsAreUnique, true);
appUnderTest._test_input.pcIdentity.classPath = identityHelpers.pcIdentityKey(thesisPath);
assert.ok((await appUnderTest._test_identityFields()).some((field) => field.field === "classPath"), "a stale single choice stays visible so it can be cleared");
// The nested choices reach the identity contract as per-bridge requirements.
appUnderTest._test_input.pcIdentity = { class: wizardKey, classPaths: { "Arcane School": identityHelpers.pcIdentityKey(schoolPath), "Arcane Thesis": "" } };
const bridgeIdentity = identityHelpers.resolvePCIdentity({ choices: appUnderTest._test_input.pcIdentity, catalogs: await appUnderTest._test_identityCatalogs() });
assert.deepEqual(Object.keys(bridgeIdentity.classPaths), ["Arcane School"]);
assert.equal(bridgeIdentity.classPaths["Arcane School"].ref._id, "mentalism");
// The same catalog serves a one-bridge class with the single control.
pathDiscovery = [bridgePath("Thief", "Rogue's Racket", "thief")];
appUnderTest._test_input.pcIdentity = { class: identityHelpers.pcIdentityKey(identityClasses[1]) };
assert.deepEqual(Array.from((await appUnderTest._test_identityFields()).filter((field) => field.field.startsWith("classPath")), (field) => field.field), ["classPath"]);

// Reading the form: per-bridge controls are kept for the class they belong to
// and dropped when the class changes or the identity section is not shown.
pathDiscovery = null;
mode = "character";
appUnderTest = app();
appUnderTest._test_input.pcIdentity = { class: wizardKey };
identityControls = [
  { name: "pcIdentity.class", value: wizardKey },
  { name: "pcIdentity.classPaths.Arcane School", value: "pf2e.classfeatures:mentalism" },
  { name: "pcIdentity.classPaths.Arcane Thesis", value: "" }
];
appUnderTest._test_readForm();
assert.deepEqual({ ...appUnderTest._test_input.pcIdentity.classPaths }, { "Arcane School": "pf2e.classfeatures:mentalism", "Arcane Thesis": "" });
identityControls[0].value = identityHelpers.pcIdentityKey(identityClasses[1]);
appUnderTest._test_readForm();
assert.equal(Object.hasOwn(appUnderTest._test_input.pcIdentity, "classPaths"), false, "a class change discards the previous class's bridge choices");
appUnderTest._test_input.pcIdentity.classPaths = { "Arcane School": "pf2e.classfeatures:mentalism" };
identityControls = [];
appUnderTest._test_readForm();
assert.deepEqual({ ...appUnderTest._test_input.pcIdentity.classPaths }, { "Arcane School": "pf2e.classfeatures:mentalism" }, "an absent identity section does not erase the choices");
identityControls = null;
identityClasses = [{ name: "Fighter", ref: { packId: "pf2e.classes", _id: "fighter" } }];

// Background Lore choices belong to the exact selected background source.
identityBackgrounds = [
  { name: "Guard", ref: { packId: "pf2e.backgrounds", _id: "6UmhTxOQeqFnppxx" } },
  { name: "Guard", ref: { packId: "custom.backgrounds", _id: "6UmhTxOQeqFnppxx" } }
];
appUnderTest = app();
let loreFields = await appUnderTest._test_identityFields();
assert.equal(loreFields.some((field) => field.field === "backgroundLore"), false);
appUnderTest._test_input.pcIdentity.background = identityHelpers.pcIdentityKey(identityBackgrounds[0]);
loreFields = await appUnderTest._test_identityFields();
let loreField = loreFields.find((field) => field.field === "backgroundLore");
assert.deepEqual(Array.from(loreField.options, (option) => option.value), ["legal", "warfare"]);
assert.equal(loreField.chooseLabel, "SIMPLYPF2E.Identity.ChooseLore");
assert.equal(loreField.hint, "SIMPLYPF2E.Identity.LoreHint");
appUnderTest._test_input.pcIdentity.backgroundLore = "legal";
const loreSnapshot = appUnderTest._test_identityInputSnapshot();
appUnderTest._test_input.pcIdentity.backgroundLore = "warfare";
assert.notEqual(appUnderTest._test_identityInputSnapshot(), loreSnapshot, "changed Lore invalidates an existing preview");
appUnderTest._test_input.pcIdentity.background = identityHelpers.pcIdentityKey(identityBackgrounds[1]);
loreFields = await appUnderTest._test_identityFields();
loreField = loreFields.find((field) => field.field === "backgroundLore");
assert.equal(loreField.options.length, 1, "stale Lore stays visible without offering official choices for a custom source");
assert.equal(loreField.options[0].value, "warfare");
assert.equal(loreField.options[0].label, "SIMPLYPF2E.Identity.Unavailable");
identityBefore = { calls: providerCalls, writes };
await appUnderTest._test_runGeneration(false, { create: true });
assert.equal(providerCalls, identityBefore.calls, "wrong-source Lore stops before provider calls");
assert.equal(writes, identityBefore.writes);
appUnderTest = app();
await appUnderTest._test_runGeneration(true, { create: false });
assert.equal(offeredBackgrounds.some((candidate) => candidate.ref.packId === "pf2e.backgrounds"), false,
  "Random does not spend on a known background whose required Lore is absent");
assert.equal(offeredBackgrounds.some((candidate) => candidate.ref.packId === "custom.backgrounds"), true,
  "same-name custom sources are not treated as the official Guard bridge");
appUnderTest = app();
appUnderTest._test_input.pcIdentity = { background: identityHelpers.pcIdentityKey(identityBackgrounds[0]), backgroundLore: "legal" };
abcResult = { ancestry: "Human", background: "Guard", backgroundCandidate: identityBackgrounds[0].ref, class: "Fighter" };
await appUnderTest._test_runGeneration(false, { create: false });
assert.equal(appUnderTest._test_error, null);
assert.equal(offeredBackgrounds.some((candidate) => candidate.ref.packId === "pf2e.backgrounds"), true);
assert.equal(appUnderTest._test_pcConcept.backgroundLore, "legal");
assert.equal(appUnderTest._test_pcConcept.requiredIdentity.backgroundLore, "legal");
// C06 PC editor: the production apply action consumes drafts on success,
// keeps them on refusal, clears invalidated drafts, and gates native create.
abcResult = null; abcFailure = null; identityBackgrounds = []; offeredBackgrounds = [];
mode = "character"; appUnderTest = app();
await appUnderTest._test_runGeneration(false, { create: false });
assert.equal(appUnderTest._test_error, null, "character preview builds for the PC editor");
assert.ok(appUnderTest._test_pcConcept, "PC editor has a plan to edit");
const editable = await appUnderTest._test_buildPCEditorContext();
assert.equal(editable.blocked, false, "a complete plan leaves Create enabled");
assert.equal(editable.blockers.length, 0, "a complete plan lists no blockers");

// The editor offers one control per path bridge of a multi-bridge class, with element ids free of spaces.
{
  const wizardRef = { name: "Wizard", ref: { packId: "pf2e.classes", _id: "wizard" } };
  const bridged = (name, bridge, id) => ({ name, bridge, ref: { packId: "pf2e.classfeatures", _id: id }, uuid: `Compendium.pf2e.classfeatures.Item.${id}` });
  identityClasses = [wizardRef];
  pathDiscovery = [bridged("School of Mentalism", "Arcane School", "mentalism"), bridged("Staff Nexus", "Arcane Thesis", "staff-nexus")];
  pcEditSelections = { class: identityHelpers.pcIdentityKey(wizardRef), "classPath.Arcane School": "pf2e.classfeatures:mentalism" };
  const bridgeEditor = await appUnderTest._test_buildPCEditorContext();
  const bridgeControls = bridgeEditor.controls.filter((control) => control.control.startsWith("classPath"));
  assert.deepEqual(Array.from(bridgeControls, (control) => control.control), ["classPath.Arcane School", "classPath.Arcane Thesis"]);
  assert.deepEqual(Array.from(bridgeControls, (control) => control.label), ["Arcane School", "Arcane Thesis"]);
  assert.deepEqual(Array.from(bridgeControls, (control) => control.id), ["pc-edit-classPath-Arcane-School", "pc-edit-classPath-Arcane-Thesis"]);
  assert.deepEqual(Array.from(bridgeControls[0].options, (option) => option.value), ["pf2e.classfeatures:mentalism"], "a bridge control offers only its own paths");
  assert.equal(bridgeControls[0].options[0].selected, true);
  assert.equal(bridgeControls[1].options[0].value, "", "an unchosen bridge shows the placeholder");
  identityClasses = [{ name: "Fighter", ref: { packId: "pf2e.classes", _id: "fighter" } }];
  pathDiscovery = null;
  pcEditSelections = {};
}

// Success: the applied control's draft is consumed and an invalidated slot's draft is cleared.
pcEditInvalidated = [{ field: "feat", slot: 1, reason: "slot no longer exists" }];
appUnderTest._test_pcEditDrafts.classPath = "test.pack:path";
appUnderTest._test_pcEditDrafts["feat.1"] = "test.pack:old-feat";
await actions.applyPCEdit.call(appUnderTest, null, { dataset: { control: "classPath" } });
assert.equal(appUnderTest._test_pcEditError, null);
assert.equal(appUnderTest._test_pcEditNotice, "SIMPLYPF2E.PCEdit.Applied slot no longer exists");
assert.equal("classPath" in appUnderTest._test_pcEditDrafts, false, "applied control's draft is consumed");
assert.equal("feat.1" in appUnderTest._test_pcEditDrafts, false, "invalidated control's draft is cleared");
pcEditInvalidated = [];

// Refusal: the contract message is shown and the draft survives for correction.
pcEditRefusal = Object.assign(new Error("PC edit (keyAbility): choose a value first"), { code: "PC_EDIT_INVALID" });
appUnderTest._test_pcEditDrafts.keyAbility = "zzz";
await actions.applyPCEdit.call(appUnderTest, null, { dataset: { control: "keyAbility" } });
assert.equal(appUnderTest._test_pcEditError, "PC edit (keyAbility): choose a value first");
assert.equal(appUnderTest._test_pcEditNotice, null);
assert.equal(appUnderTest._test_pcEditDrafts.keyAbility, "zzz", "refused edit keeps its draft");

// Unexpected failure: a localized generic message, and the draft is still kept.
pcEditRefusal = new Error("provider exploded");
await actions.applyPCEdit.call(appUnderTest, null, { dataset: { control: "keyAbility" } });
assert.equal(appUnderTest._test_pcEditError, "SIMPLYPF2E.PCEdit.Failed");
assert.equal(appUnderTest._test_pcEditDrafts.keyAbility, "zzz", "unexpected failure keeps its draft");
pcEditRefusal = null;

// Commit gate: an incomplete plan disables Create and never reaches the native write.
pcEditGate = { complete: false, pending: [{ field: "classPath", reason: "re-pick" }], errors: [], unresolved: [], manifest: {} };
const blockedEditor = await appUnderTest._test_buildPCEditorContext();
assert.equal(blockedEditor.blocked, true, "an incomplete plan disables Create");
assert.equal(blockedEditor.blockers.length, 1, "the pending choice is listed as a blocker");
const writesBeforeGate = writes;
await appUnderTest._test_createCharacterActor();
assert.equal(writes, writesBeforeGate, "an incomplete plan never reaches native create");
assert.match(appUnderTest._test_error, /PCEdit\.CreateBlocked/);
pcEditGate = { complete: true, pending: [], errors: [], unresolved: [], manifest: {} };

// Hazard mode is experimental. This harness stubs the gate as not open, so a hazard selection is
// refused before readiness, the provider or any write, and the Monster view returns.
mode = "hazard"; appUnderTest = app();
const beforeHazard = { providerCalls, writes, starts, finishes };
await actions.generate.call(appUnderTest);
await actions.previewPlan.call(appUnderTest);
await actions.generateRandom.call(appUnderTest);
assert.deepEqual({ providerCalls, writes, starts, finishes }, beforeHazard, "a closed gate reaches no provider, write or progress run");
assert.equal(appUnderTest._test_input.mode, "monster", "a refused hazard selection returns to the Monster view");
assert.equal(appUnderTest._test_hazard, null);
mode = "npc";
