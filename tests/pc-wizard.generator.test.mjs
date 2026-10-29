// Production GeneratorApp over the real Wizard class data (PF2e 8.5.0 fixtures) and the
// real identity validation. A class the builder cannot stage (master two-entry Arcane
// School filter) is not offered, so no run spends provider tokens on a build that must
// refuse at Create; an explicitly required one fails before any provider call; 8.5.0
// data offers Wizard everywhere. The provider, the progress UI and Foundry documents
// other than the compendium stand-ins are mocked at the import edge, as in
// generator-app.review.test.mjs.
// Run: node tests/pc-wizard.generator.test.mjs
import { needsExtraPurchasePass } from "../scripts/purchase-pass.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import { load, makeWorld, installWorld } from "./fixtures/pc-wizard/world.mjs";

if (!vm.SourceTextModule) {
  const run = spawnSync(process.execPath, ["--experimental-vm-modules", import.meta.filename], { stdio: "inherit" });
  process.exit(run.status ?? 1);
}

// Main-realm globals the real builder, class-path and compendium modules read.
globalThis.foundry = { utils: { randomID: () => "id" } };
globalThis.CONFIG = { PF2E: { languages: {} } };
globalThis.game = { i18n: { localize: (label) => label } };
const worlds = installWorld();

const CF = "pf2e.classfeatures";
const loadAll = (names) => Promise.all(names.map((name) => load(name)));
const wizard = await load("wizard");
const fighter = await load("precedent/fighter-class");
const wizardFeatures = await loadAll([
  "wizard-spellcasting", "arcane-school", "arcane-bond", "arcane-thesis", "school-of-battle-magic", "school-of-mentalism", "spell-blending", "staff-nexus"
]);
const fighterFeatures = await loadAll(["precedent/reactive-strike", "precedent/shield-block"]);
const arcaneSchoolMaster = await load("arcane-school-master");
const buildWorld = (swapSchool) => makeWorld({
  [CF]: [...wizardFeatures.map((json) => (swapSchool && json._id === arcaneSchoolMaster._id ? arcaneSchoolMaster : json)), ...fighterFeatures],
  "pf2e.classes": [wizard, fighter]
});
const world = buildWorld(false);
const masterWorld = buildWorld(true);

const { issueCandidate } = await import("../scripts/compendium.mjs");
const { getDocument } = await import("../scripts/compendium.mjs");
const { getClassPathCandidates } = await import("../scripts/class-paths.mjs");
const { validatePCIdentityRequirements } = await import("../scripts/pc-builder.mjs");
const { supportedClassCandidates } = await import("../scripts/pc-support.mjs");
const identityHelpers = await import("../scripts/pc-identity.mjs");
const { getBackgroundLoreOptions } = await import("../scripts/pc-background-lore.mjs");
const classCandidate = (json) => issueCandidate(
  { packId: "pf2e.classes", _id: json._id, type: "class", name: json.name },
  { name: json.name, uuid: `Compendium.pf2e.classes.Item.${json._id}` }
);
const fighterCandidate = classCandidate(fighter);
const wizardCandidate = classCandidate(wizard);
const { parseCoins } = await import("../scripts/builder.mjs");
const { reviewUnresolvedChoices } = await import("../scripts/choice-set.mjs");
const { normalizeSkillPriorities, skillPriorityOrder } = await import("../scripts/pc-skills.mjs");
const { assertComplete, completionManifest, completionSummary } = await import("../scripts/completion.mjs");

// ---- Scenario state read by the mocks.
let classes = [];
let prompt = "A scholar";
let providerCalls = 0;
let abcCalls = 0;
let abcOffered = null;
const notices = [];
const warnings = [];

class App {
  element = {
    querySelector: (selector) => selector.includes("name=\"mode\"") ? { value: "character" }
      : selector.includes("name=\"level\"") ? { value: "1" }
        : selector.includes("name=\"prompt\"") ? { value: prompt }
          : selector.includes("name=\"allowSpellcasting\"") ? { checked: false } : null,
    querySelectorAll: () => []
  };
  async render() { this.context = await this._prepareContext(); }
  _beginProgress() { this.abort = new AbortController(); return this.abort.signal; }
  async _setStep() {}
  _skipStep() {}
  _warnStep() {}
  _recordTokens() {}
  _progressCallback() { return () => {}; }
  _lockCreation() { this._throwIfCancelled(); }
  _buildTokenReport() { return null; }
  _formatLastRunCost() { return null; }
  _finishRun() { this._progress = null; }
  _cancelGeneration() { this.abort?.abort(); }
  _throwIfCancelled() {
    if (this.abort?.signal.aborted) throw Object.assign(new Error("cancelled"), { cancelled: true });
  }
}
const context = vm.createContext({
  console: { log() {}, error() {}, warn: (...args) => { warnings.push(args.map(String).join(" ")); } },
  game: {
    i18n: { localize: (key) => key, format: (key) => key },
    actors: { get: () => null }, settings: { get: () => false }, packs: { get: () => null }
  },
  ui: { notifications: { info() {}, warn: (text) => notices.push(text) } }
});
const mocks = {
  needsExtraPurchasePass,
  ...identityHelpers, getBackgroundLoreOptions, getDocument, getClassPathCandidates, validatePCIdentityRequirements, supportedClassCandidates,
  SpfApp: App, MODULE_ID: "simplypf2e", SETTINGS: { freeArchetype: "freeArchetype" }, reviewUnresolvedChoices, normalizeSkillPriorities, skillPriorityOrder,
  AI_TASK: {}, taskMaxTokens: () => 100, assertComplete, completionManifest, completionSummary,
  verifyCreatedActor: () => {},
  getProviderRequestConfig: () => ({}), getProviderAuthWarningKey: () => null, sourceReadiness: () => ({ ready: true, missing: [] }),
  BUILT_IN_PRESETS: [], getCustomPresets: () => [], findPreset: () => null, examplePrompt: () => "",
  presetPickerGroups: () => ({ selectedId: "", standard: [], custom: [] }),
  THREATS: {}, TREASURE_AMOUNT_MULTIPLIER: {}, randomBrief: () => "A scholar",
  generatePCConcept: async () => {
    providerCalls++;
    return { concept: { name: "Test", level: 1, equipment: [], loot: [] }, usage: {} };
  },
  normalizePCConcept: (raw) => raw,
  getAncestryCandidates: () => [], getBackgroundCandidates: () => [], getHeritageCandidates: () => [], getClassCandidates: async () => classes,
  // Stops the run at ABC selection, recording the classes it was allowed to choose from.
  selectAncestryBackgroundClass: async ({ classCandidates }) => {
    abcCalls++;
    abcOffered = classCandidates.map((candidate) => candidate.name);
    throw new Error("stop at ABC selection");
  },
  resolvePCConcept: async () => { throw new Error("not reached"); },
  pcSpellcastingProfile: () => null, slugify: (name) => name.toLowerCase(),
  getEquipmentCandidates: async () => [], parseCoins, heritageMatchesAncestry: () => true, previewSchoolSpells: async () => null,
  validatePCEditCompletion: () => ({ complete: true, pending: [], errors: [], unresolved: [], manifest: {} }),
  applyPCEdit: async (plan) => ({ plan, changed: [], invalidated: [], equipmentGp: 0 }),
  pcEditFromControl: (control, value) => ({ control, value }), pcEditorSelections: () => ({}), pcEditorInvalidatedControls: () => []
};
const source = await readFile(new URL("../scripts/generator-app.mjs", import.meta.url), "utf8");
const appModule = new vm.SourceTextModule(source, { context });
await appModule.link((specifier) => {
  const imports = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)]
    .filter((match) => match[2] === specifier).flatMap((match) => match[1].split(",").map((name) => name.trim()));
  return new vm.SyntheticModule(imports, function () {
    for (const name of imports) this.setExport(name, mocks[name] ?? (() => { throw new Error(`Unexpected dependency: ${name}`); }));
  }, { context });
});
await appModule.evaluate();
const { GeneratorApp } = appModule.namespace;
const actions = GeneratorApp.DEFAULT_OPTIONS.actions;

// ---- Scenario helpers.
const reset = (nextClasses, nextPrompt = "A scholar") => {
  classes = nextClasses;
  prompt = nextPrompt;
  providerCalls = 0;
  abcCalls = 0;
  abcOffered = null;
  notices.length = 0;
};
const freshApp = () => {
  const app = new GeneratorApp();
  app._preserveForm(); // model the switch into Character mode
  return app;
};
const classOptions = async (app) => (await app._prepareContext()).pcIdentityFields
  .find((field) => field.field === "class").options.map((option) => option.label.split(" — ")[0]);
const NO_CLASSES = "SIMPLYPF2E.Generator.NoSupportedClasses";
const GUARD = "simplypf2e | class path \"Arcane School\" has an unsupported choice shape; refusing a one-click build";

// ---- master-shaped Arcane School, Wizard the only installed class: it is not offered
// and no run reaches the provider.
worlds.use(masterWorld);
{
  reset([wizardCandidate]);
  let app = freshApp();
  assert.deepEqual(await classOptions(app), [], "the Required choices control does not offer Wizard");
  await actions.generateRandom.call(app);
  assert.deepEqual(notices, [NO_CLASSES], "a Random run stops at readiness");
  assert.equal(providerCalls, 0, "with no provider call");
  assert.equal(abcCalls, 0);
  assert.ok(warnings.some((line) => /simplypf2e \| Wizard is not offered/.test(line)), "the refusal is warned");

  reset([wizardCandidate], "Class: Wizard");
  app = freshApp();
  await actions.generate.call(app);
  assert.deepEqual(notices, [NO_CLASSES], "so is a run that requires Wizard");
  assert.equal(providerCalls, 0);
}

// ---- master-shaped data with Fighter installed too: Random is never offered Wizard
// at ABC selection, and an explicitly required Wizard fails validation before the
// concept request or ABC selection.
{
  reset([fighterCandidate, wizardCandidate]);
  let app = freshApp();
  assert.deepEqual(await classOptions(app), ["Fighter"]);
  await actions.generateRandom.call(app);
  assert.equal(providerCalls, 1, "Random reaches the concept request");
  assert.equal(abcCalls, 1);
  assert.deepEqual(abcOffered, ["Fighter"], "ABC selection is never offered Wizard");
  assert.equal(app.context.error, "stop at ABC selection");

  reset([fighterCandidate, wizardCandidate], "Class: Wizard");
  app = freshApp();
  await actions.generate.call(app);
  assert.equal(app.context.error, GUARD, "the named guard error, not a generic one");
  assert.equal(providerCalls, 0, "before any provider call");
  assert.equal(abcCalls, 0, "and before ABC selection");
}

// ---- PF2e 8.5.0 data: Wizard is offered everywhere and a required Wizard proceeds.
worlds.use(world);
{
  reset([fighterCandidate, wizardCandidate]);
  let app = freshApp();
  assert.deepEqual(await classOptions(app), ["Fighter", "Wizard"]);
  await actions.generateRandom.call(app);
  assert.equal(providerCalls, 1);
  assert.deepEqual(abcOffered, ["Fighter", "Wizard"]);

  reset([fighterCandidate, wizardCandidate], "Class: Wizard");
  app = freshApp();
  await actions.generate.call(app);
  assert.equal(providerCalls, 1, "a required Wizard passes validation and reaches the concept request");
  assert.equal(abcCalls, 1);
  assert.equal(app.context.error, "stop at ABC selection");
}

assert.equal(warnings.filter((line) => /Wizard is not offered/.test(line)).length, 1, "the refusal is reported once, not on every render");

console.log("pc-wizard.generator.test.mjs: a class the builder cannot stage is not offered, and a required one fails before any provider call");
