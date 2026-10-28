// Production GeneratorApp PC run, stopped at spell selection: a class with no modeled
// focus-spell source (Wizard, a complete-only class) requests no focus-spell candidates,
// and a class outside the complete-only registry (Champion) still requests them. The real
// classModelsFocusSpells decides; the real Wizard class data and the real identity
// validation are used. The provider, the progress UI, the spell pass and Foundry documents
// other than the compendium stand-ins are mocked at the import edge, as in
// pc-wizard.generator.test.mjs.
// Run: node tests/generator-app.pcFocusCandidates.test.mjs
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
worlds.use(makeWorld({ [CF]: [...wizardFeatures, ...fighterFeatures], "pf2e.classes": [wizard, fighter] }));

const { issueCandidate, getDocument } = await import("../scripts/compendium.mjs");
const { getClassPathCandidates } = await import("../scripts/class-paths.mjs");
const { validatePCIdentityRequirements } = await import("../scripts/pc-builder.mjs");
const { supportedClassCandidates, classModelsFocusSpells } = await import("../scripts/pc-support.mjs");
const identityHelpers = await import("../scripts/pc-identity.mjs");
const { getBackgroundLoreOptions } = await import("../scripts/pc-background-lore.mjs");
const { parseCoins } = await import("../scripts/builder.mjs");
const { reviewUnresolvedChoices } = await import("../scripts/choice-set.mjs");
const { normalizeSkillPriorities, skillPriorityOrder } = await import("../scripts/pc-skills.mjs");
const { assertComplete, completionManifest, completionSummary } = await import("../scripts/completion.mjs");

const classCandidate = (name, json) => issueCandidate(
  { packId: "pf2e.classes", _id: json._id, type: "class", name },
  { name, uuid: `Compendium.pf2e.classes.Item.${json._id}` }
);
const fighterCandidate = classCandidate("Fighter", fighter);
const wizardCandidate = classCandidate("Wizard", wizard);
// Outside the complete-only registry: never offered, so the AI pick is stood in for below.
const championJson = { _id: "champion", name: "Champion", type: "class", system: {} };
const championCandidate = classCandidate("Champion", championJson);

// ---- Scenario state read by the mocks.
let classes = [];
let chosen = null;
let focusCalls = [];
let selectArgs = null;
const FOCUS_CHAMPION = [{ name: "Champion Focus Spell" }];

class App {
  element = {
    querySelector: (selector) => selector.includes("name=\"mode\"") ? { value: "character" }
      : selector.includes("name=\"level\"") ? { value: "1" }
        : selector.includes("name=\"prompt\"") ? { value: "A scholar" }
          : selector.includes("name=\"allowSpellcasting\"") ? { checked: true } : null,
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
  console: { log() {}, error() {}, warn() {} },
  game: {
    i18n: { localize: (key) => key, format: (key) => key },
    actors: { get: () => null }, settings: { get: () => false }, packs: { get: () => null }
  },
  ui: { notifications: { info() {}, warn() {} } }
});
const mocks = {
  ...identityHelpers, getBackgroundLoreOptions, getDocument, getClassPathCandidates, validatePCIdentityRequirements, supportedClassCandidates,
  classModelsFocusSpells,
  SpfApp: App, MODULE_ID: "simplypf2e", SETTINGS: { freeArchetype: "freeArchetype" }, reviewUnresolvedChoices, normalizeSkillPriorities, skillPriorityOrder,
  AI_TASK: {}, taskMaxTokens: () => 100, assertComplete, completionManifest, completionSummary,
  verifyCreatedActor: () => {},
  getProviderRequestConfig: () => ({}), getProviderAuthWarningKey: () => null, sourceReadiness: () => ({ ready: true, missing: [] }),
  BUILT_IN_PRESETS: [], getCustomPresets: () => [], findPreset: () => null, examplePrompt: () => "",
  presetPickerGroups: () => ({ selectedId: "", standard: [], custom: [] }),
  THREATS: {}, TREASURE_AMOUNT_MULTIPLIER: {}, randomBrief: () => "A scholar",
  generatePCConcept: async () => ({ concept: { name: "Test", level: 1, equipment: [], loot: [], focusSpells: [] }, usage: {} }),
  normalizePCConcept: (raw) => raw,
  getClassCandidates: async () => classes,
  getAncestryCandidates: () => [], getBackgroundCandidates: () => [], getHeritageCandidates: () => [],
  // Stands in for the AI pick: the chosen class is whatever the scenario names.
  selectAncestryBackgroundClass: async () => ({
    ancestry: "Human", ancestryCandidate: null, heritage: null, heritageCandidate: null,
    background: "Scholar", backgroundCandidate: null, class: chosen.candidate.name, classCandidate: chosen.candidate,
    keyAbility: "int", usage: {}
  }),
  resolvePCConcept: async () => ({
    ancestryDoc: { name: "Human" }, heritageDoc: null, backgroundDoc: null, backgroundLore: null,
    classDoc: chosen.doc, featSlots: [], equipment: [], loot: []
  }),
  // A casting profile for either class, so the run reaches the spell pass.
  pcSpellcastingProfile: () => ({ mode: "prepared", ability: "int", tradition: "arcane", baseSlots: {} }),
  pcSpellPlan: () => ({ picks: [], signatureRanks: [], slots: { 1: 1 } }),
  slugify: (name) => String(name).toLowerCase(),
  chooseSpellFocus: async () => ({ keywords: [], usage: {} }),
  getSpellCandidates: async () => [{ name: "Magic Missile" }],
  getFocusSpellCandidates: async (...args) => {
    focusCalls.push(args);
    return chosen.focusCandidates;
  },
  // Records what the spell pass was given, then stops the run.
  selectSpells: async (args) => {
    selectArgs = args;
    throw Object.assign(new Error("cancelled"), { cancelled: true });
  },
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
const freshApp = () => {
  const app = new GeneratorApp();
  app._preserveForm(); // model the switch into Character mode
  return app;
};
// One Random PC run, stopped at spell selection; returns what the spell pass received.
const runToSpellPass = async ({ offered, pick, focusCandidates }) => {
  classes = offered;
  chosen = { ...pick, focusCandidates };
  focusCalls = [];
  selectArgs = null;
  await actions.generateRandom.call(freshApp());
  assert.ok(selectArgs, "the run reaches the spell pass");
  return selectArgs;
};

// ---- Wizard: a complete-only class with no modeled focus source. No focus-spell lookup,
// and the spell pass receives an empty focus list.
{
  const args = await runToSpellPass({
    offered: [fighterCandidate, wizardCandidate],
    pick: { candidate: wizardCandidate, doc: wizard },
    focusCandidates: [{ name: "Unused" }]
  });
  assert.equal(classModelsFocusSpells(wizard), false, "Wizard has no modeled focus source");
  assert.equal(focusCalls.length, 0, "a Wizard run makes no focus-spell candidate call");
  // Copied out of the vm realm first, so the strict comparison sees a plain array.
  assert.deepStrictEqual([...args.focusCandidates], [], "the spell pass is given no focus candidates");
}

// ---- Champion: outside the complete-only registry, so its focus source is not modeled as
// absent. The focus-spell lookup still runs and its candidates reach the spell pass.
{
  const args = await runToSpellPass({
    offered: [fighterCandidate],
    pick: { candidate: championCandidate, doc: championJson },
    focusCandidates: FOCUS_CHAMPION
  });
  assert.equal(classModelsFocusSpells(championJson), true, "a class outside the registry keeps its focus candidates");
  assert.equal(focusCalls.length, 1, "a Champion run makes one focus-spell candidate call");
  assert.equal(focusCalls[0][0], 1, "the call carries the spell plan's max rank");
  assert.deepEqual(args.focusCandidates, FOCUS_CHAMPION, "the spell pass receives the looked-up candidates");
}

console.log("generator-app.pcFocusCandidates.test.mjs: a class without a modeled focus source requests no focus-spell candidates");
