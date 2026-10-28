// Production GeneratorApp editor context for a completed PC plan (review G1): the class
// control keeps the current class, so a Wizard plan's control lists Wizard and selects it,
// and a Fighter plan's control excludes Wizard. The editor helpers, identity helpers and
// real Wizard/Fighter class data are the real modules; the provider, the progress UI and
// Foundry documents other than the compendium stand-ins are mocked at the import edge.
// The private plan fields and the editor builder are reached by the same `#` -> `_test_`
// rewrite the encounter hazard harness uses; no production hook is added.
// Run: node tests/generator-app.pcEditorClass.test.mjs
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
const { supportedClassCandidates } = await import("../scripts/pc-support.mjs");
const identityHelpers = await import("../scripts/pc-identity.mjs");
const pcEditor = await import("../scripts/pc-editor.mjs");
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
const FIGHTER_KEY = `pf2e.classes:${fighter._id}`;
const WIZARD_KEY = `pf2e.classes:${wizard._id}`;

// ---- Scenario state read by the mocks.
let classes = [];

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
  _progressCallback() { return () => {}; }
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
  ...identityHelpers, ...pcEditor, getBackgroundLoreOptions, getDocument, getClassPathCandidates, validatePCIdentityRequirements, supportedClassCandidates,
  SpfApp: App, MODULE_ID: "simplypf2e", SETTINGS: { freeArchetype: "freeArchetype" }, reviewUnresolvedChoices, normalizeSkillPriorities, skillPriorityOrder,
  AI_TASK: {}, taskMaxTokens: () => 100, assertComplete, completionManifest, completionSummary,
  getProviderRequestConfig: () => ({}), getProviderAuthWarningKey: () => null, sourceReadiness: () => ({ ready: true, missing: [] }),
  getClassCandidates: async () => classes,
  getAncestryCandidates: () => [], getBackgroundCandidates: () => [], getHeritageCandidates: () => [],
  getEquipmentCandidates: async () => [], parseCoins, heritageMatchesAncestry: () => true, previewSchoolSpells: async () => null,
  validatePCEditCompletion: () => ({ complete: true, pending: [], errors: [], unresolved: [] }),
  applyPCEdit: async (plan) => ({ plan, changed: [], invalidated: [], equipmentGp: 0 })
};

const sources = await readFile(new URL("../scripts/generator-app.mjs", import.meta.url), "utf8");
// Only the generator uses private fields; rewriting them lets the test reach plan state.
const generatorSource = sources.replace(/#([A-Za-z]\w*)/g, "_test_$1");
const generator = new vm.SourceTextModule(generatorSource, { context });
await generator.link((specifier) => {
  const imports = [...generatorSource.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)]
    .filter((match) => match[2] === specifier).flatMap((match) => match[1].split(",").map((name) => name.trim()));
  return new vm.SyntheticModule(imports, function () {
    for (const name of imports) this.setExport(name, mocks[name] ?? (() => { throw new Error(`Unexpected dependency: ${name}`); }));
  }, { context });
});
await generator.evaluate();
const { GeneratorApp } = generator.namespace;

// A completed PC plan as the generator leaves it: the class is a bare ref, as in production.
const setPlan = (app, candidate, classDoc) => {
  app._test_pcConcept = {
    level: 1, classCandidate: candidate.ref, ancestryCandidate: null, heritageCandidate: null, backgroundCandidate: null,
    keyAbility: "int", equipment: [], spellcasting: null, focusSpells: []
  };
  app._test_pcResolved = {
    ancestryDoc: { name: "Human", system: {} }, backgroundDoc: null, classDoc, featSlots: [], feats: [], equipment: [],
    spells: [], focusSpells: [], loot: []
  };
  app._test_pcPending = [];
};
const classControl = async (app) => {
  const editor = await app._test_buildPCEditorContext();
  return editor.controls.find((control) => control.control === "class");
};

// ---- Wizard plan: Wizard is listed and selected; Fighter, the other noncaster, is listed too.
{
  classes = [fighterCandidate, wizardCandidate];
  const app = new GeneratorApp();
  app._preserveForm();
  setPlan(app, wizardCandidate, wizard);
  const control = await classControl(app);
  assert.deepEqual(control.options.map((option) => option.value), [FIGHTER_KEY, WIZARD_KEY],
    "a Wizard plan's class control lists Fighter and the current Wizard");
  const selected = control.options.filter((option) => option.selected).map((option) => option.value);
  assert.deepEqual(selected, [WIZARD_KEY], "the current Wizard is the selected option, with no placeholder");
}

// ---- Fighter plan: the caster is not offered.
{
  classes = [fighterCandidate, wizardCandidate];
  const app = new GeneratorApp();
  app._preserveForm();
  setPlan(app, fighterCandidate, fighter);
  const control = await classControl(app);
  assert.deepEqual(control.options.map((option) => option.value), [FIGHTER_KEY], "a Fighter plan's class control excludes Wizard");
  assert.deepEqual(control.options.filter((option) => option.selected).map((option) => option.value), [FIGHTER_KEY]);
}

console.log("generator-app.pcEditorClass.test.mjs: the class control keeps the current class and excludes casters");
