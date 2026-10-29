// Production GeneratorApp PC pipeline over the real Wizard class data (PF2e 8.5.0 fixtures), with the real
// identity resolution, class-path catalog, compendium stand-ins and previewSchoolSpells. Only provider calls,
// the progress UI and the Foundry platform are mocked, so the preview lines come out of the same draft the
// generator stores. Covers the school-spell preview on both paths: a school the prompt declares (fixed before
// Create) and a class with two closed schools left to Create.
// Run: node tests/generator-app.schoolSpellPreview.test.mjs
import { needsExtraPurchasePass } from "../scripts/purchase-pass.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import * as identityHelpers from "../scripts/pc-identity.mjs";
import { getBackgroundLoreOptions } from "../scripts/pc-background-lore.mjs";
import { parseCoins } from "../scripts/builder.mjs";
import { reviewUnresolvedChoices } from "../scripts/choice-set.mjs";
import { normalizeSkillPriorities, skillPriorityOrder } from "../scripts/pc-skills.mjs";
import { assertComplete, completionManifest, completionSummary } from "../scripts/completion.mjs";
import { classModelsFocusSpells, supportedClassCandidates } from "../scripts/pc-support.mjs";
import { load, makeWorld, installWorld } from "./fixtures/pc-wizard/world.mjs";
import { pcSpellcastingProfile, pcSpellPlan } from "../scripts/pc-tables.mjs";

if (!vm.SourceTextModule) {
  const run = spawnSync(process.execPath, ["--experimental-vm-modules", import.meta.filename], { stdio: "inherit" });
  process.exit(run.status ?? 1);
}

// Main-realm globals the real builder, class-path and compendium modules read.
globalThis.foundry = { utils: { randomID: () => "id" } };
globalThis.CONFIG = { PF2E: { languages: {} } };
globalThis.game = { i18n: { localize: (label) => label } };
const worlds = installWorld();

const { issueCandidate, getDocument } = await import("../scripts/compendium.mjs");
const { getClassPathCandidates } = await import("../scripts/class-paths.mjs");
const { previewSchoolSpells, validatePCIdentityRequirements } = await import("../scripts/pc-builder.mjs");

const CF = "pf2e.classfeatures";
const wizard = await load("wizard");
const features = await Promise.all([
  "wizard-spellcasting", "arcane-school", "arcane-bond", "arcane-thesis", "school-of-battle-magic", "school-of-mentalism", "spell-blending", "staff-nexus"
].map(load));
const forceBolt = await load("force-bolt");
const energyAbsorption = await load("energy-absorption");
const charmingPush = await load("charming-push");
// Two closed schools (Battle Magic and Mentalism) are the fixtures the module can stage at 8.5.0.
const world = makeWorld({ [CF]: features, "pf2e.classes": [wizard], "pf2e.spells-srd": [forceBolt, energyAbsorption, charmingPush] });
worlds.use(world);

const wizardCandidate = issueCandidate(
  { packId: "pf2e.classes", _id: wizard._id, type: "class", name: "Wizard" },
  { name: "Wizard", uuid: `Compendium.pf2e.classes.Item.${wizard._id}` }
);
// The School of Mentalism candidate, as the identity catalog issues it, for the school-swap edit.
const mentalismCandidate = (await getClassPathCandidates(structuredClone(wizard))).find((candidate) => candidate.name === "School of Mentalism");
const wizardDoc = {
  name: "Wizard", type: "class", uuid: `Compendium.pf2e.classes.Item.${wizard._id}`, system: wizard.system,
  toObject: () => structuredClone(wizard)
};

// ---- Scenario state read by the mocks.
let promptText = "A scholar";
let previewFails = false;
let editRebuildsDraft = false;
let editSwapsSchool = false;
const warnings = [];
const notices = [];

class App {
  element = { querySelector: (selector) => selector.includes('name="mode"') ? { value: "character" }
    : selector.includes('name="level"') ? { value: "1" }
      : selector.includes('name="prompt"') ? { value: promptText }
        : selector.includes('name="allowSpellcasting"') ? { checked: true } : null, querySelectorAll: () => [] };
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
  console: { log() {}, warn: (...args) => { warnings.push(args.map(String).join(" ")); }, error() {} },
  game: {
    i18n: { localize: (key) => key, format: (key, data) => `${key} ${JSON.stringify(data ?? {})}` },
    actors: { get: () => null }, settings: { get: () => false }, packs: { get: () => null }
  },
  ui: { notifications: Object.fromEntries(["info", "warn"].map((kind) => [kind, (text) => notices.push([kind, text])])) }
});
const resolved = () => ({
  ancestryDoc: { name: "Dwarf" }, classDoc: wizardDoc, backgroundDoc: { name: "Warrior" },
  featSlots: [], feats: [], spells: [], focusSpells: [], equipment: [], loot: []
});
const mocks = {
  needsExtraPurchasePass,
  ...identityHelpers, getBackgroundLoreOptions, getDocument, getClassPathCandidates, validatePCIdentityRequirements,
  supportedClassCandidates, classModelsFocusSpells, reviewUnresolvedChoices, normalizeSkillPriorities, skillPriorityOrder,
  SpfApp: App, MODULE_ID: "simplypf2e", SETTINGS: { freeArchetype: "freeArchetype" },
  AI_TASK: {}, taskMaxTokens: () => 100, assertComplete, completionManifest, completionSummary,
  verifyCreatedActor: () => {}, parseCoins,
  getProviderRequestConfig: () => ({}), getProviderAuthWarningKey: () => null, sourceReadiness: () => ({ ready: true, missing: [] }),
  BUILT_IN_PRESETS: [], getCustomPresets: () => [], findPreset: () => null, examplePrompt: () => "",
  presetPickerGroups: () => ({ selectedId: "", standard: [], custom: [] }),
  THREATS: {}, TREASURE_AMOUNT_MULTIPLIER: {}, randomBrief: () => "A scholar",
  generatePCConcept: async () => ({
    concept: { name: "Test", level: 1, equipment: [], loot: [], class: "Wizard", classCandidate: wizardCandidate.ref, spellcasting: { tradition: "arcane", spells: [] } }
  }),
  normalizePCConcept: (raw) => raw,
  getAncestryCandidates: () => [], getBackgroundCandidates: () => [], getHeritageCandidates: () => [],
  getClassCandidates: () => [wizardCandidate],
  selectAncestryBackgroundClass: async () => ({ ancestry: "Dwarf", background: "Warrior", class: "Wizard", classCandidate: wizardCandidate.ref, keyAbility: "int" }),
  resolvePCConcept: async () => resolved(), pcSpellcastingProfile, pcSpellPlan: (level, profile) => ({ ...pcSpellPlan(level, profile), picks: [] }), slugify: (name) => name.toLowerCase(),
  selectSpells: async () => ({ spells: [], usage: {} }), chooseSpellFocus: async () => ({ keywords: [], usage: {} }),
  generatePCLoot: async () => ({ loot: [] }), normalizeLoot: (loot) => loot,
  getEquipmentCandidates: async () => [], dedupeLootAgainstEquipment: (loot) => loot, enforceNamedLootBudget: (loot) => loot,
  applyTreasureBudget: async (loot) => loot,
  pcStartingWealthGp: () => 0, equipmentValueGp: () => 0,
  lootValueGp: () => 0,
  createCharacterActor: async () => ({ actor: null, skillReport: null }),
  validatePCEditCompletion: () => ({ complete: true, pending: [], errors: [], unresolved: [], manifest: {} }),
  // An edit that rebuilds the draft as a new object, as a feat or class-path swap does.
  // An edit that rebuilds the draft as a new object, as a feat or class-path swap does. A school swap rebinds the
  // identity's Arcane School candidate to another school.
  applyPCEdit: async (plan) => {
    if (editSwapsSchool) {
      const concept = { ...plan.concept, requiredIdentity: { ...plan.concept.requiredIdentity, classPaths: { "Arcane School": mentalismCandidate } } };
      return { plan: { ...plan, concept, resolved: { ...plan.resolved } }, changed: ["classPath"], invalidated: [], equipmentGp: 0 };
    }
    return { plan: editRebuildsDraft ? { ...plan, resolved: { ...plan.resolved } } : plan, changed: [], invalidated: [], equipmentGp: 0 };
  },
  editableClassCandidates: () => [],
  pcEditFromControl: (control, value) => ({ control, value }),
  pcEditorSelections: () => ({}), pcEditorInvalidatedControls: () => [],
  heritageMatchesAncestry: () => true,
  // The real previewSchoolSpells, with a switch that makes it throw, for the advisory-failure check.
  previewSchoolSpells: (...args) => {
    if (previewFails) throw new Error("preview broke");
    return previewSchoolSpells(...args);
  }
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

// A Random run drives the whole PC pipeline; the draft it stores is what the preview renders.
async function generate(prompt) {
  promptText = prompt;
  const app = new GeneratorApp();
  app._preserveForm();
  await actions.generate.call(app);
  assert.equal(app.context.error, null, `the run completes (${app.context.error ?? "no error"})`);
  assert.ok(app.context.pcPreview, "the run seeds the PC draft");
  return app;
}
// The generator runs in a vm realm, so its arrays are copied into this realm before a strict comparison.
const schoolLines = (app) => (app.context.pcPreview.schoolSpells ? Array.from(app.context.pcPreview.schoolSpells.lines) : null);

// (a) The prompt declares the school, so it is fixed before Create: the initial spell is named in the preview.
{
  const named = await generate("Class: Wizard\nSchool: School of Battle Magic");
  assert.deepEqual(schoolLines(named), [`SIMPLYPF2E.Preview.SchoolSpell ${JSON.stringify({ school: "School of Battle Magic", spell: "Force Bolt" })}`],
    "a named school shows its initial spell in the preview");
  assert.equal(warnings.filter((line) => /school spell/.test(line)).length, 0, "no school-spell warning on the named path");
}

// (b) No school named and two closed schools: the school is chosen at Create, and the preview says so.
{
  const atCreate = await generate("Class: Wizard");
  assert.deepEqual(schoolLines(atCreate), ["SIMPLYPF2E.Preview.SchoolSpellAtCreate"], "the preview says the school is chosen at Create");
}

// (d) A PC editor edit that rebuilds the draft runs the real edit path and keeps the school-spell line for the
// edited draft. The notice is the editor's own outcome: the edit was applied and nothing changed.
{
  const edited = await generate("Class: Wizard\nSchool: School of Battle Magic");
  editRebuildsDraft = true;
  await actions.applyPCEdit.call(edited, null, { dataset: { control: "class" } });
  editRebuildsDraft = false;
  // Render the edited draft fresh, rather than trusting the context captured before the edit.
  const afterEdit = await edited._prepareContext();
  assert.equal(afterEdit.pcEditor?.notice, "SIMPLYPF2E.PCEdit.Unchanged", "the editor reports the edit as applied");
  assert.deepEqual(Array.from(afterEdit.pcPreview.schoolSpells.lines), [`SIMPLYPF2E.Preview.SchoolSpell ${JSON.stringify({ school: "School of Battle Magic", spell: "Force Bolt" })}`],
    "the edited draft still shows its school spell");
}

// (e) An editor edit that swaps the Arcane School shows the new school's spell, so the preview follows the draft.
{
  const edited = await generate("Class: Wizard\nSchool: School of Battle Magic");
  editSwapsSchool = true;
  await actions.applyPCEdit.call(edited, null, { dataset: { control: "classPath" } });
  editSwapsSchool = false;
  const afterEdit = await edited._prepareContext();
  assert.equal(afterEdit.pcEditor?.notice, "SIMPLYPF2E.PCEdit.Applied", "the swap is reported as applied");
  assert.deepEqual(Array.from(afterEdit.pcPreview.schoolSpells.lines), [`SIMPLYPF2E.Preview.SchoolSpell ${JSON.stringify({ school: "School of Mentalism", spell: "Charming Push" })}`],
    "the swapped school's spell is shown, not the old one");
}

// (c) A preview that throws warns and shows no school line, and the run still completes (advisory, fail closed).
{
  previewFails = true;
  const before = warnings.length;
  const broken = await generate("Class: Wizard\nSchool: School of Battle Magic");
  previewFails = false;
  assert.equal(schoolLines(broken), null, "a failed preview shows no school line");
  assert.ok(warnings.slice(before).some((line) => /school spell preview unavailable/.test(line)), "the failure is warned");
  assert.ok(broken.context.pcPreview.concept, "the rest of the preview is still built");
}

console.log("generator-app.schoolSpellPreview.test.mjs: the school spell preview reaches the PC preview for a named school and for a school left to Create, and a failed preview warns without stopping the run");
