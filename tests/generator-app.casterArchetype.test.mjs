// W3: the production GeneratorApp PC pipeline plans and fills the spellcasting-archetype spellbook after the feat
// picks, previews it, blocks Create when it cannot be filled, and keeps the PC editor from touching it.
// Provider calls, the progress UI and Foundry are mocked at the import edge (as generator-app.schoolSpellPreview.test.mjs);
// the completion manifest, plan derivation, preview mapping and editor context are the real code.
// Run: node tests/generator-app.casterArchetype.test.mjs
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
import { pcEditorSelections } from "../scripts/pc-editor.mjs";
import * as casterArchetype from "../scripts/pc-caster-archetype.mjs";

if (!vm.SourceTextModule) {
  const run = spawnSync(process.execPath, ["--experimental-vm-modules", import.meta.filename], { stdio: "inherit" });
  process.exit(run.status ?? 1);
}

globalThis.foundry = { utils: { randomID: () => "id" } };
globalThis.CONFIG = { PF2E: { languages: {} } };
globalThis.game = { i18n: { localize: (label) => label } };
const { issueCandidate } = await import("../scripts/compendium.mjs");

const feat = (id, name) => issueCandidate({ packId: "test.feats", _id: id, type: "feat", name }, { name, uuid: `Compendium.test.feats.Item.${id}` });
const dedication = feat("wizded", "Wizard Dedication");
const basic = feat("wizbasic", "Basic Wizard Spellcasting");
const toughness = feat("tough", "Toughness");
const bardDedication = feat("barded", "Bard Dedication");
const bardBasic = feat("bardbasic", "Basic Bard Spellcasting");
let museOptions = [{ value: "enigma", label: "Enigma" }, { value: "maestro", label: "Maestro" }, { value: "warrior", label: "Warrior" }];
const spell = (id, name, rank) => ({ id, name, rank, ref: { packId: "test.spells", _id: id } });
const spellCandidates = [spell("dm", "Detect Magic", 0), spell("ea", "Electric Arc", 0), spell("li", "Light", 0), spell("tp", "Telekinetic Projectile", 0), spell("fe", "Fear", 1), spell("gt", "Grim Tendrils", 1), spell("mi", "Mirror Image", 2), spell("hs", "Haste", 3)];

// ---- Scenario state read by the mocks.
let allowSpellcasting = true;
let held = ["Wizard Dedication", "Basic Wizard Spellcasting"];
let level = 4;
let selectFails = false;
let candidatesEmpty = false;
const calls = { resolve: [], select: [], candidates: [] };
const warnings = [];

class App {
  element = { querySelector: (selector) => selector.includes('name="mode"') ? { value: "character" }
    : selector.includes('name="level"') ? { value: String(level) }
      : selector.includes('name="prompt"') ? { value: "A bookish swordsman" }
        : selector.includes('name="allowSpellcasting"') ? { checked: allowSpellcasting } : null, querySelectorAll: () => [] };
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
  ui: { notifications: { info() {}, warn() {} } }
});
const fighterDoc = { name: "Fighter", type: "class", uuid: "Compendium.test.classes.Item.fighter", system: { keyAbility: { value: ["str"] } },
  toObject() { return { name: "Fighter", type: "class", system: { keyAbility: { value: ["str"] } } }; } };
const fighterCandidate = issueCandidate({ packId: "test.classes", _id: "fighter", type: "class", name: "Fighter" }, { name: "Fighter", uuid: "Compendium.test.classes.Item.fighter" });
const featSlots = () => [
  { type: "class", level: 2, archetype: false, abilities: { int: 2 }, candidates: [toughness, dedication, bardDedication] },
  { type: "class", level: 4, archetype: false, abilities: { int: 2 }, candidates: [toughness, dedication, basic, bardDedication, bardBasic] }
];
const mocks = {
  ...casterArchetype, needsExtraPurchasePass, casterArchetypeChoiceOptions: async () => museOptions,
  ...identityHelpers, getBackgroundLoreOptions, getDocument: async () => fighterDoc, getClassPathCandidates: async () => [],
  validatePCIdentityRequirements: async () => {}, supportedClassCandidates: (list) => list, classModelsFocusSpells: () => false,
  reviewUnresolvedChoices, normalizeSkillPriorities, skillPriorityOrder, pcEditorSelections,
  SpfApp: App, MODULE_ID: "simplypf2e", SETTINGS: { freeArchetype: "freeArchetype" },
  AI_TASK: {}, taskMaxTokens: () => 100, assertComplete, completionManifest, completionSummary,
  verifyCreatedActor: () => {}, parseCoins,
  getProviderRequestConfig: () => ({}), getProviderAuthWarningKey: () => null, sourceReadiness: () => ({ ready: true, missing: [] }),
  BUILT_IN_PRESETS: [], getCustomPresets: () => [], findPreset: () => null, examplePrompt: () => "",
  presetPickerGroups: () => ({ selectedId: "", standard: [], custom: [] }),
  THREATS: {}, TREASURE_AMOUNT_MULTIPLIER: {}, randomBrief: () => "A bookish swordsman",
  generatePCConcept: async () => ({ concept: { name: "Test", level, equipment: [], loot: [], class: "Fighter", classCandidate: fighterCandidate.ref, focusSpells: [], traits: [] } }),
  normalizePCConcept: (raw) => raw,
  getAncestryCandidates: () => [], getBackgroundCandidates: () => [], getHeritageCandidates: () => [],
  getClassCandidates: () => [fighterCandidate],
  selectAncestryBackgroundClass: async () => ({ ancestry: "Human", background: "Warrior", class: "Fighter", classCandidate: fighterCandidate.ref, keyAbility: "int" }),
  resolvePCConcept: async (concept, options) => {
    calls.resolve.push({ casterArchetypes: concept.casterArchetypes, archetypeSpells: concept.archetypeSpellcasting?.spells?.length ?? null, options });
    return {
      ancestryDoc: { name: "Human" }, classDoc: fighterDoc, backgroundDoc: { name: "Warrior" }, backgroundLore: [],
      featSlots: featSlots(), feats: [], spells: [], focusSpells: [], equipment: [], loot: [],
      archetypeSpells: (concept.archetypeSpellcasting?.spells ?? []).map((pick) => ({ spell: pick, entry: pick.candidate }))
    };
  },
  selectFeats: async () => ({ picks: [], usage: {} }),
  resolveFeatPicks: async () => held.map((name, index) => ({
    type: "class", level: index === 0 ? 2 : 4, archetype: false, name,
    entry: { packId: "test.feats", _id: { "Wizard Dedication": "wizded", "Basic Wizard Spellcasting": "wizbasic", "Bard Dedication": "barded", "Basic Bard Spellcasting": "bardbasic", Toughness: "tough" }[name] }
  })),
  pcSpellcastingProfile: () => null, pcSpellPlan: () => ({ picks: {}, signatureRanks: [], slots: {} }),
  slugify: (name) => String(name).toLowerCase(),
  selectSpells: async () => ({ spells: [], focusSpells: [], usage: {} }), chooseSpellFocus: async () => ({ keywords: [], usage: {} }),
  getSpellCandidates: async (...args) => {
    calls.candidates.push(args);
    return candidatesEmpty ? [] : spellCandidates;
  },
  getFocusSpellCandidates: async () => [],
  selectArchetypeSpells: async (args) => {
    calls.select.push(args);
    if (selectFails) throw new Error("provider failed");
    // Fill the module's plan in candidate order: the first N candidates of each planned rank.
    const picked = Object.entries(args.plannedPicks).flatMap(([rank, count]) => spellCandidates.filter((c) => c.rank === Number(rank)).slice(0, count));
    return { spells: picked.map((pick) => ({ name: pick.name, candidate: pick.ref, rank: pick.rank })), usage: {} };
  },
  generatePCLoot: async () => ({ loot: [] }), normalizeLoot: (loot) => loot,
  getEquipmentCandidates: async () => [], dedupeLootAgainstEquipment: (loot) => loot, enforceNamedLootBudget: (loot) => loot,
  applyTreasureBudget: async (loot) => loot, pcStartingWealthGp: () => 0, equipmentValueGp: () => 0, lootValueGp: () => 0,
  createCharacterActor: async () => ({ actor: null, skillReport: null }),
  validatePCEditCompletion: (plan) => ({ complete: true, pending: [], errors: [], unresolved: [], manifest: {}, plan }),
  applyPCEdit: async (plan) => ({ plan, changed: [], invalidated: [], equipmentGp: 0 }),
  editableClassCandidates: () => [], pcEditFromControl: (control, value) => ({ control, value }), pcEditorInvalidatedControls: () => [],
  heritageMatchesAncestry: () => true, previewSchoolSpells: async () => null
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
const reset = () => { calls.resolve.length = 0; calls.select.length = 0; calls.candidates.length = 0; warnings.length = 0; };

async function generate() {
  reset();
  const app = new GeneratorApp();
  app._preserveForm();
  await actions.generate.call(app);
  return app;
}

// (a) Dedication + Basic at level 4: the plan comes from the feats, the GM allowed spellcasting, and the preview shows the book.
{
  const app = await generate();
  assert.equal(app.context.error, null, `the run completes (${app.context.error ?? "no error"})`);
  assert.ok(calls.resolve.every((entry) => entry.casterArchetypes === true), "every resolve offers caster feats when spellcasting is allowed");
  assert.equal(calls.select.length, 1, "exactly one archetype spell call");
  const [args] = calls.select;
  assert.deepEqual({ ...args.plannedPicks }, { 0: 4, 1: 2 }, "the module's plan: four cantrips and two first-rank spells at level 4");
  assert.equal(args.tradition, "arcane");
  assert.equal(args.label, "Wizard Archetype Spells");
  assert.equal(JSON.stringify(calls.candidates), JSON.stringify([["arcane", 1, [], { 0: 4, 1: 2 }, { maxRarity: "common" }]]), "candidates: arcane, max rank 1, common only");
  const preview = app.context.pcPreview;
  assert.equal(preview.archetype.label, "Wizard Archetype Spells");
  assert.equal(preview.archetype.tradition, "arcane");
  assert.deepEqual(Array.from(preview.archetype.spells, (row) => [row.name, row.rank, row.found]),
    [["Detect Magic", 0, true], ["Electric Arc", 0, true], ["Light", 0, true], ["Telekinetic Projectile", 0, true], ["Fear", 1, true], ["Grim Tendrils", 1, true]]);
  assert.equal(app.context.pcPreview.concept.archetypeSpellcasting.pkg, "wizard");
  // The editor view: spell editing is deferred, and caster feats are not offered as replacements.
  assert.equal(app.context.pcEditor.spellsDeferred, true);
  const featControls = Array.from(app.context.pcEditor.controls).filter((control) => control.control.startsWith("feat."));
  assert.equal(featControls.length, 2);
  const labelsOf = (control) => Array.from(control.options, (option) => option.label.split(" — ")[0]);
  assert.deepEqual(labelsOf(featControls[0]), ["Toughness", "Wizard Dedication"], "slot 1 keeps its current dedication visible and offers no other caster feat");
  assert.deepEqual(labelsOf(featControls[1]), ["Toughness", "Basic Wizard Spellcasting"], "slot 2 keeps its current Basic feat visible and offers no dedication");
  assert.equal(app.context.pcPreview.archetype.choice, null, "Wizard has no ChoiceSet row");
  assert.ok(!app.context.pcEditor.controls.some((control) => control.control === "archetypeChoice"), "and no muse control");
}

// (b) Dedication only (level 2): cantrips only, no ranked picks.
{
  held = ["Wizard Dedication"];
  level = 2;
  const app = await generate();
  assert.deepEqual({ ...calls.select[0].plannedPicks }, { 0: 4 });
  assert.equal(calls.candidates[0][1], 0, "no ranked spells are requested without the Basic feat");
  assert.equal(app.context.pcPreview.archetype.spells.length, 4, "four cantrips and no ranked picks");
  held = ["Wizard Dedication", "Basic Wizard Spellcasting"];
  level = 4;
}

// (c) No caster feat: no plan, no call, no preview section.
{
  held = ["Toughness"];
  const app = await generate();
  assert.equal(calls.select.length, 0);
  assert.equal(calls.candidates.length, 0);
  assert.equal(app.context.pcPreview.archetype, null);
  assert.equal(app.context.pcPreview.concept.archetypeSpellcasting, null);
  held = ["Wizard Dedication", "Basic Wizard Spellcasting"];
}

// (d) Spellcasting not allowed: caster feats are not offered, and a stray caster pick makes no plan.
{
  allowSpellcasting = false;
  const app = await generate();
  assert.ok(calls.resolve.every((entry) => entry.casterArchetypes === false), "caster feats are not offered when spellcasting is off");
  assert.equal(calls.select.length, 0);
  assert.equal(app.context.pcPreview.archetype, null);
  allowSpellcasting = true;
}

// (e) The selection fails: the plan stays empty, so the completion manifest blocks the run (fail closed).
{
  selectFails = true;
  const app = await generate();
  assert.match(String(app.context.error), /archetype-spell: Rank 0 pick 1/, "missing archetype spells block creation");
  assert.ok(warnings.some((line) => /archetype spell selection failed/.test(line)));
  selectFails = false;
}

// (f) No candidates at all: the same blocked state, without a provider call.
{
  candidatesEmpty = true;
  const app = await generate();
  assert.equal(calls.select.length, 0);
  assert.match(String(app.context.error), /archetype-spell/);
  assert.ok(warnings.some((line) => /no archetype spell candidates/.test(line)));
  candidatesEmpty = false;
}

// ================= Bard =================
{
  held = ["Bard Dedication", "Basic Bard Spellcasting"];
  level = 6;
  const app = await generate();
  assert.equal(app.context.error, null, `the run completes (${app.context.error ?? "no error"})`);
  assert.deepEqual({ ...calls.select[0].plannedPicks }, { 0: 2, 1: 1, 2: 1 }, "two cantrips and one spell per rank at level 6");
  assert.equal(calls.select[0].tradition, "occult");
  assert.equal(calls.select[0].label, "Bard Archetype Spells");
  assert.equal(calls.select[0].repertoire, true, "the prompt says repertoire");
  const preview = app.context.pcPreview;
  assert.equal(preview.concept.archetypeSpellcasting.choice.value, "maestro", "the visible default is Maestro");
  assert.equal(preview.archetype.choice.value, "Maestro");
  assert.equal(preview.archetype.choice.missing, false);
  assert.equal(preview.archetype.note, "SIMPLYPF2E.Preview.PCArchetypeBard");
  const signatures = Array.from(preview.archetype.spells).filter((row) => row.signature).map((row) => [row.name, row.rank]);
  assert.deepEqual(signatures, [["Fear", 1]], "one signature spell, the lowest-rank repertoire spell, from level 6");
  const control = Array.from(app.context.pcEditor.controls).find((entry) => entry.control === "archetypeChoice");
  assert.ok(control, "the muse is an editor control");
  assert.deepEqual(Array.from(control.options, (option) => [option.label, option.selected]), [["Enigma", false], ["Maestro", true], ["Warrior", false]]);
  assert.equal(app.context.pcEditor.blocked, false, "a valid default does not block");
}
{
  // Level 4: no signature spell yet.
  level = 4;
  const app = await generate();
  assert.equal(Array.from(app.context.pcPreview.archetype.spells).filter((row) => row.signature).length, 0);
  level = 6;
}
{
  // Maestro unavailable: no arbitrary substitute; Create is blocked by the completion manifest.
  museOptions = [{ value: "enigma", label: "Enigma" }, { value: "warrior", label: "Warrior" }];
  const app = await generate();
  assert.match(String(app.context.error), /archetype-choice: dedicationMuse/, "a missing muse blocks the run");
  museOptions = [];
  const none = await generate();
  assert.match(String(none.context.error), /archetype-choice/, "no eligible muse at all blocks as well");
  museOptions = [{ value: "enigma", label: "Enigma" }, { value: "maestro", label: "Maestro" }, { value: "warrior", label: "Warrior" }];
}
{
  // Spellcasting not allowed: no plan, no choice, no muse control, no call.
  allowSpellcasting = false;
  const app = await generate();
  assert.equal(calls.select.length, 0);
  assert.equal(app.context.pcPreview.archetype, null);
  allowSpellcasting = true;
}

console.log("generator-app.casterArchetype.test.mjs: the archetype spellbook is planned from the held feats, previewed, blocked when empty, and not editable");
