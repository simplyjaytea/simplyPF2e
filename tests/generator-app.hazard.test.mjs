// Hazard mode (WP5 H3b) through the production GeneratorApp: the experimental gate at
// every check point, a preview that writes nothing, one Actor.create for the reviewed
// hazard, a stale preview that cannot be created, and a refused concept that is shown
// as an error. The gate, settings, progress and app-base code are the real modules and
// so are hazard-builder, the GM Core tables and the post-create survival check; only the
// AI provider, the other catalogs and Foundry documents are isolated at the import edges.
// Run: node tests/generator-app.hazard.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

if (!vm.SourceTextModule) {
  const run = spawnSync(process.execPath, ["--experimental-vm-modules", import.meta.filename], { stdio: "inherit" });
  process.exit(run.status ?? 1);
}

const hazardBuilder = await import("../scripts/hazard-builder.mjs");
const hazardTables = await import("../scripts/hazard-tables.mjs");
const postCreate = await import("../scripts/post-create.mjs");
const textHelpers = await import("../scripts/text.mjs");

const GATE = "simplypf2e.experimentalTools";
// Dependency order: each module is linked after everything it imports.
const REAL = [
  "ai-task-profiles.mjs", "settings.mjs", "tokens.mjs", "progress.mjs", "experimental-tools.mjs",
  "forge-command.mjs", "hazard-labels.mjs", "app-base.mjs", "generator-app.mjs"
];
const stored = new Map([
  [GATE, true],
  ["simplypf2e.apiBaseUrl", "https://api.deepseek.com/v1"],
  ["simplypf2e.apiKey", "test-key"],
  ["simplypf2e.apiKeyBaseUrl", "https://api.deepseek.com/v1"],
  ["simplypf2e.model", "deepseek-v4-flash"]
]);
const setGate = (value) => stored.set(GATE, value);
const warnings = [];
const takeWarnings = () => warnings.splice(0);
let gmUser = true;
const game = {
  get system() { return { id: "pf2e" }; },
  get user() { return { id: "gm", isGM: gmUser }; },
  // The survivor sentence and its labels read as English, as the GM sees them.
  i18n: {
    localize: (key) => ({
      "SIMPLYPF2E.Generator.Survivor.Label.UnverifiedHazard": "unverified hazard",
      "SIMPLYPF2E.Generator.Survivor.Label.UnverifiedActor": "unverified actor",
      "SIMPLYPF2E.Generator.Survivor.Label.UnverifiedCharacter": "unverified character",
      "SIMPLYPF2E.Generator.Survivor.Label.EncounterActor": "encounter actor",
      "SIMPLYPF2E.Generator.Survivor.Label.IncompleteActor": "incomplete actor",
      "SIMPLYPF2E.Generator.Survivor.Label.IncompleteCharacter": "incomplete character"
    })[key] ?? key,
    format: (key, data) => {
      if (key === "SIMPLYPF2E.Generator.Survivor.Actor") {
        return `${data.label} "${data.name}" still exists. The draft was discarded to prevent a duplicate; remove it manually before trying again.`;
      }
      return data ? key + " " + JSON.stringify(data) : key;
    }
  },
  settings: { get: (moduleId, key) => stored.get(moduleId + "." + key) },
  packs: null
};
class Application {
  render() { return this; }
  async close() {}
}

const CONFIG = {
  PF2E: {
    hazardTraits: { mechanical: "PF2E.TraitMechanical", trap: "PF2E.TraitTrap", magical: "PF2E.TraitMagical" },
    damageTypes: { slashing: "PF2E.DamageSlashing", fire: "PF2E.DamageFire", piercing: "PF2E.DamagePiercing" },
    skills: { thievery: { label: "PF2E.SkillThievery" }, athletics: { label: "PF2E.SkillAthletics" } }
  }
};

// Foundry document stand-ins. Actor.create is the only native write the hazard path makes.
const actorCreates = [];
const actorDeletes = [];
const sheetRenders = [];
let actorShape = "whole";
let deleteFails = false;
let holdCreate = null;
const Actor = {
  async create(data) {
    if (holdCreate) await holdCreate;
    actorCreates.push(data);
    const actor = {
      id: "hazard-actor-" + actorCreates.length, name: data.name,
      items: { contents: actorShape === "whole" ? data.items.map((item) => ({ ...item })) : [] },
      sheet: { render: async () => { sheetRenders.push(data.name); } },
      async delete() {
        if (deleteFails) throw new Error("cannot delete");
        actorDeletes.push(actor.id);
      }
    };
    return actor;
  }
};

const context = vm.createContext({
  AbortController, URL, setInterval: () => 1, clearInterval: () => {},
  console: { log() {}, warn() {}, error() {} },
  foundry: { applications: { api: { ApplicationV2: Application, HandlebarsApplicationMixin: (base) => base } } },
  game, CONFIG, Actor,
  ui: { notifications: { info() {}, warn: (message) => warnings.push(message), error() {} } }
});

const sources = new Map();
for (const file of REAL) sources.set(file, await readFile(new URL("../scripts/" + file, import.meta.url), "utf8"));
// Names imported from every module that is not real are exported by an isolated stand-in.
const importRule = /import\s*\{([^}]+)\}\s*from\s*\x22([^\x22]+)\x22/g;
const syntheticNames = new Map();
for (const source of sources.values()) {
  for (const [, names, from] of source.matchAll(importRule)) {
    if (REAL.includes(from.replace(/^\.\//, ""))) continue;
    const list = syntheticNames.get(from) ?? new Set();
    for (const name of names.split(",").map((item) => item.trim()).filter(Boolean)) list.add(name);
    syntheticNames.set(from, list);
  }
}

// The AI concept as ai.mjs hands it over: words and scale words, no numbers.
const simpleRaw = () => ({
  name: "Scything Pressure Plate",
  description: "A worn flagstone hides a spring-loaded blade that sweeps the corridor.",
  traits: ["mechanical", "trap"],
  rarity: "common",
  complex: false,
  stealth: "high",
  disable: [{ skill: "thievery", scale: "high" }],
  dispel: false,
  ac: "high",
  saves: { fortitude: "high", reflex: null, will: null },
  hasHP: true,
  reaction: {
    name: "Scything Blade", trigger: "A creature steps on the plate.", effect: "The blade sweeps across the corridor.",
    strike: { name: "Scythe Blade", damageType: "slashing" }, save: null
  },
  routine: null,
  reset: "The mechanism resets after a minute."
});
const complexRaw = () => ({
  ...simpleRaw(),
  name: "Whirling Blade Hall",
  rarity: "uncommon",
  complex: true,
  dispel: true,
  reaction: {
    name: "Blades Awaken", trigger: "A creature enters the hall.", effect: "Blades begin to whirl.",
    strike: null, save: { type: "reflex", scale: "high", effect: "The creature is cut by whirling blades." }
  },
  routine: { actions: 2, text: "The blades sweep the hall and cut anyone near.", strike: { name: "Whirling Blade", damageType: "slashing" } }
});
const monsterConcept = () => ({
  name: "Swamp Hag", level: 3, rarity: "common", spellcasting: null, focusSpells: [],
  specialAbilities: [], feats: [], equipment: [], loot: [], strikes: []
});

const counts = { hazardCalls: [], monsterCalls: 0, persisted: 0 };
let hazardRaw = simpleRaw;
let onHazard = null;
let onPersist = null;
const mocks = {
  generateHazardConcept: async (brief, options) => {
    counts.hazardCalls.push({ brief, options });
    if (onHazard) await onHazard(brief, options);
    return { concept: hazardRaw(), usage: { total: 11 } };
  },
  HAZARD_DISABLE_SKILLS: hazardBuilder.HAZARD_DISABLE_SKILLS,
  HazardConceptError: hazardBuilder.HazardConceptError,
  normalizeHazardConcept: hazardBuilder.normalizeHazardConcept,
  buildHazardSource: hazardBuilder.buildHazardSource,
  describeHazard: hazardBuilder.describeHazard,
  HAZARD_MIN_LEVEL: hazardTables.HAZARD_MIN_LEVEL,
  HAZARD_MAX_LEVEL: hazardTables.HAZARD_MAX_LEVEL,
  hazardSaveDC: hazardTables.hazardSaveDC,
  verifyCreatedActor: postCreate.verifyCreatedActor,
  persistedExpectedItems: async (items) => {
    counts.persisted += 1;
    if (onPersist) onPersist();
    return postCreate.persistedExpectedItems(items);
  },
  esc: textHelpers.esc,
  generateConcept: async () => { counts.monsterCalls += 1; return { concept: monsterConcept(), usage: { total: 1 } }; },
  normalizeConcept: (raw) => raw,
  resolveConcept: async () => ({ abilities: [], spells: [], feats: [], focusSpells: [], equipment: [], loot: [] }),
  completionManifest: () => ({}), assertComplete: () => {}, completionSummary: () => ({}),
  applyTreasureBudget: async (loot) => loot, treasureBudget: () => 0, lootValueGp: () => 0,
  findBestiaryScaffold: async () => ({ img: null }),
  getCreatureFeatCandidates: async () => [],
  normalizeCreatureFeatName: (name) => String(name ?? "").toLowerCase(),
  selectCreatureFeats: async () => ({ feats: [], omitted: true }),
  getAbilityCandidates: async () => [], selectCreatureAbilities: async () => ({ abilities: [] }),
  getEquipmentCandidates: async () => [], getLootCandidates: async () => [],
  getSpellCandidates: async () => [], getScrollSpellCandidates: async () => [], getFocusSpellCandidates: async () => [],
  sourceReadiness: () => ({ ready: true, missing: [], packCount: 0 }),
  randomBrief: () => "random brief", findPreset: () => null, getCustomPresets: () => [],
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
const labels = realModules.get("hazard-labels.mjs").namespace.HAZARD_LABEL_KEYS;

// The rendered form. Selector strings are built, not typed, so the lookups stay exact.
const Q = String.fromCharCode(34);
const attr = (name) => String.fromCharCode(91) + "name" + String.fromCharCode(61) + Q + name + Q + String.fromCharCode(93);
const formState = { mode: "hazard", prompt: "a scything pressure plate in a crypt", level: "3" };
const listeners = [];
const levelInput = { get value() { return formState.level; }, set value(next) { formState.level = String(next); } };
const form = {
  elements: { namedItem: (name) => ({ addEventListener: (type, handler) => listeners.push({ name, type, handler }) }) },
  querySelector(selector) {
    if (selector === attr("mode") + ":checked") return { value: formState.mode };
    if (selector === attr("prompt")) return { value: formState.prompt };
    if (selector === attr("level")) return { value: formState.level };
    if (selector === "input" + attr("level")) return levelInput;
    if (selector === attr("allowSpellcasting")) return { checked: false };
    return null;
  },
  querySelectorAll: () => []
};
const newApp = () => {
  const app = new GeneratorApp();
  app.element = form; app._test_input.mode = formState.mode;
  return app;
};
const hazardOnly = (before) => ({
  hazardCalls: counts.hazardCalls.length - before.hazardCalls, creates: actorCreates.length - before.creates
});
const mark = () => ({ hazardCalls: counts.hazardCalls.length, creates: actorCreates.length });
// Items without their random damage roll ids, for comparing two builds of one hazard.
const stable = (items) => items.map((item) => (item.system.damageRolls
  ? { ...item, system: { ...item.system, damageRolls: Object.values(item.system.damageRolls) } } : item));

// ---- Gate off: no tile, no mode, and generate and create are refused. ----
setGate(false);
const closed = newApp();
let view = await closed._prepareContext();
assert.equal(view.hazardAvailable, false, "with the gate off the Hazard tile is not offered");
assert.equal(view.hazardMode, false);
assert.equal(view.hazardPreview, null);
const flipped = newApp();
flipped._test_input.mode = "hazard";
view = await flipped._prepareContext();
assert.equal(view.hazardMode, false, "a hazard selection cannot survive a closed gate");
assert.equal(flipped._test_input.mode, "monster", "the Monster view returns when the gate is closed");
setGate(true);
gmUser = false;
view = await newApp()._prepareContext();
assert.equal(view.hazardAvailable, false, "a non-GM is never offered the Hazard tile");
gmUser = true;
view = await newApp()._prepareContext();
assert.equal(view.hazardAvailable, true, "with the gate on the Hazard tile is offered");
assert.equal(view.hazardLabels, labels, "the tile label comes from HAZARD_LABEL_KEYS");
assert.equal(labels.mode, "SIMPLYPF2E.Hazard.Mode");
setGate(false);

formState.mode = "hazard";
const beforeRefused = mark();
for (const action of ["generate", "previewPlan", "generateRandom"]) {
  const app = newApp();
  await actions[action].call(app);
  assert.deepEqual(takeWarnings(), ["SIMPLYPF2E.Experimental.Disabled"], action + " is refused with the experimental refusal");
  assert.equal(app._progress, null, action + " starts no progress run");
  assert.equal(app._test_hazard, null);
  assert.equal(app._test_busy, false);
}
assert.deepEqual(hazardOnly(beforeRefused), { hazardCalls: 0, creates: 0 }, "a closed gate reaches neither the provider nor Foundry");

// Create with the gate off: nothing is written, and the draft is not kept.
const draft = newApp();
draft._test_hazard = Object.freeze({ concept: simpleRaw(), level: 3, brief: formState.prompt, preview: {} });
await actions.createActor.call(draft);
assert.deepEqual(takeWarnings(), ["SIMPLYPF2E.Experimental.Disabled"]);
assert.deepEqual(hazardOnly(beforeRefused), { hazardCalls: 0, creates: 0 }, "a closed gate blocks the native write");
assert.equal(draft._test_hazard, null, "a draft is dropped once the gate is seen closed");
assert.equal(draft._progress, null);
setGate(true);

// ---- Gate on: generate produces a reviewed preview and writes nothing. ----
const encounter = await import("../scripts/encounter.mjs");
const RANKS = ["untrained", "trained", "expert", "master", "legendary"];
const rankKey = (word) => "SIMPLYPF2E.Skills.Rank" + RANKS.indexOf(word);
const dcLine = (dc, word) => "SIMPLYPF2E.Hazard.Preview.DCLine " + JSON.stringify({ dc, rank: rankKey(word) });
const signed = (value) => (value >= 0 ? "+" + value : String(value));
const T = hazardTables;
const plain = (value) => JSON.parse(JSON.stringify(value));
takeWarnings();
formState.mode = "hazard";
formState.prompt = "a scything pressure plate in a crypt";
formState.level = "3";
const reviewed = newApp();
const beforeGenerate = mark();
await actions.generate.call(reviewed);
assert.deepEqual(hazardOnly(beforeGenerate), { hazardCalls: 1, creates: 0 }, "Generate asks the provider once and writes nothing");
const call = counts.hazardCalls.at(-1);
assert.equal(call.brief, formState.prompt);
assert.equal(call.options.level, 3);
assert.deepEqual([...call.options.traitsCatalog], Object.keys(CONFIG.PF2E.hazardTraits), "trait slugs come from CONFIG.PF2E.hazardTraits");
assert.deepEqual([...call.options.damageTypes], Object.keys(CONFIG.PF2E.damageTypes), "damage types come from CONFIG.PF2E.damageTypes");
assert.deepEqual([...call.options.disableSkills], [...hazardBuilder.HAZARD_DISABLE_SKILLS]);
assert.equal(reviewed._progress.status, "success");
assert.equal(reviewed._test_busy, false);
assert.equal(reviewed._test_created, null, "Generate never creates, even from the primary button");
assert.equal(reviewed._test_error, null);
assert.ok(reviewed._test_hazard, "a reviewed hazard was issued");
assert.equal(Object.isFrozen(reviewed._test_hazard), true);
assert.equal(reviewed._tokenUsage.length, 1);
assert.equal(reviewed._tokenUsage[0].usage.total, 11);
assert.deepEqual(takeWarnings(), []);

view = await reviewed._prepareContext();
const shown = view.hazardPreview;
const concept = reviewed._test_hazard.concept;
const described = await hazardBuilder.describeHazard(concept, 3);
assert.equal(view.hazardMode, true);
assert.equal(view.hasPreview, true);
assert.equal(view.showEmptyState, false);
assert.equal(view.levelMin, T.HAZARD_MIN_LEVEL);
assert.equal(view.levelMax, T.HAZARD_MAX_LEVEL);
assert.equal(shown.name, "Scything Pressure Plate");
assert.equal(shown.level, 3);
assert.equal(shown.complexity, labels.complexitySimple);
assert.equal(shown.rarity, "SIMPLYPF2E.Rarity.Common");
assert.deepEqual([...shown.traits], ["PF2E.TraitMechanical", "PF2E.TraitTrap"]);
assert.equal(shown.stealth, dcLine(T.hazardDC(3, "high"), T.hazardProficiency(3, "high")));
assert.equal(shown.disable.length, 1);
assert.equal(shown.disable[0].skill, "PF2E.SkillThievery");
assert.equal(shown.disable[0].text, dcLine(T.hazardDC(3, "high"), T.hazardProficiency(3, "high")));
assert.equal(shown.dispel, null);
assert.equal(shown.ac, T.hazardAC(3, "high"));
assert.equal(shown.acAssumed, false);
assert.deepEqual(plain(shown.saves.map((row) => [row.label, row.value])), [["SIMPLYPF2E.Preview.Fort", signed(T.hazardSave(3, "high"))]]);
assert.equal(shown.hp, T.hazardHP(3));
assert.equal(shown.hardness, T.hazardHardness(3));
assert.equal(shown.strike.name, "Scythe Blade");
assert.equal(shown.strike.bonus, signed(T.hazardAttack(3, "simple")));
assert.equal(shown.strike.formula, T.hazardDamage(3, "simple").formula);
assert.equal(shown.strike.average, T.hazardDamage(3, "simple").average);
assert.equal(shown.strike.damageType, "PF2E.DamageSlashing");
assert.equal(shown.reaction.name, "Scything Blade");
assert.equal(shown.reaction.trigger, "A creature steps on the plate.");
assert.equal(shown.reaction.save, null);
assert.equal(shown.routine, null);
assert.equal(shown.reset, "The mechanism resets after a minute.");
assert.equal(shown.xp, encounter.simpleHazardXP(3, 3), "XP is the simple hazard XP for a same-level party");
assert.equal(shown.xp, described.xp);

// ---- Create: one Actor.create for the reviewed hazard, then the survival check. ----
const issued = reviewed._test_hazard;
const expectedSource = await hazardBuilder.buildHazardSource(issued.concept, { level: 3 });
const beforeCreate = mark();
const persistedBefore = counts.persisted;
await actions.createActor.call(reviewed);
assert.equal(actorCreates.length - beforeCreate.creates, 1, "Create calls Actor.create exactly once");
assert.equal(counts.hazardCalls.length, beforeCreate.hazardCalls, "Create never calls the provider");
assert.equal(counts.persisted - persistedBefore, 1, "the item list goes through the post-create expectation step");
const data = actorCreates.at(-1);
assert.equal(data.type, "hazard");
assert.equal(data.name, "Scything Pressure Plate");
assert.deepEqual(data.system, expectedSource.actor.system, "the actor system data is the reviewed concept built from the tables");
assert.deepEqual(stable(data.items), stable(expectedSource.items), "the created items are the built items");
assert.deepEqual(data.items.map((item) => item.type), ["action", "melee"]);
assert.equal(data.items[1].system.bonus.value, issued.preview.strike.bonus, "the created strike matches the previewed bonus");
assert.equal(Object.values(data.items[1].system.damageRolls)[0].damage, issued.preview.strike.formula);
assert.equal(data.system.attributes.ac.value, issued.preview.ac.value);
assert.equal(data.system.attributes.hp.max, issued.preview.hp);
assert.equal(data.system.details.level.value, 3);
assert.equal(reviewed._test_hazard, null, "the reviewed hazard is consumed by Create");
assert.deepEqual({ name: reviewed._test_created.name, count: reviewed._test_created.count }, { name: "Scything Pressure Plate", count: 1 });
assert.equal(reviewed._test_created.actorId, "hazard-actor-" + actorCreates.length);
assert.deepEqual(sheetRenders.at(-1), "Scything Pressure Plate", "the sheet opens after a successful create");
assert.equal(reviewed._progress.status, "success");
assert.equal(reviewed._test_busy, false);
assert.deepEqual(takeWarnings(), []);
await actions.createActor.call(reviewed);
assert.equal(actorCreates.length - beforeCreate.creates, 1, "a consumed hazard cannot be created twice");

// A complex hazard builds its routine action and its one melee strike.
hazardRaw = complexRaw;
const complexApp = newApp();
await actions.previewPlan.call(complexApp);
view = await complexApp._prepareContext();
assert.equal(view.hazardPreview.complexity, labels.complexityComplex);
assert.equal(view.hazardPreview.rarity, "SIMPLYPF2E.Rarity.Uncommon");
assert.equal(view.hazardPreview.routine.text, "The blades sweep the hall and cut anyone near.");
assert.equal(view.hazardPreview.routine.actions, "SIMPLYPF2E.Hazard.Preview.RoutineActions {" + Q + "count" + Q + ":2}");
assert.equal(view.hazardPreview.dispel, "SIMPLYPF2E.Hazard.Preview.DispelLine " + JSON.stringify({ rank: 2, dc: T.hazardDC(3, "high") }));
assert.equal(view.hazardPreview.reaction.save.text, "SIMPLYPF2E.Hazard.Preview.SaveLine " + JSON.stringify({ save: "SIMPLYPF2E.Preview.Ref", dc: T.hazardSaveDC(3, "high") }));
assert.equal(view.hazardPreview.xp, encounter.creatureXP(3, 3), "a complex hazard uses the creature XP map");
const beforeComplex = mark();
await actions.createActor.call(complexApp);
assert.equal(actorCreates.length - beforeComplex.creates, 1);
assert.deepEqual(actorCreates.at(-1).items.map((item) => item.type), ["action", "melee"]);
assert.equal(actorCreates.at(-1).system.details.isComplex, true);
hazardRaw = simpleRaw;

// ---- A stale preview cannot be created: a changed level or brief spends it. ----
formState.level = "3";
formState.prompt = "a scything pressure plate in a crypt";
const stale = newApp();
await actions.previewPlan.call(stale);
assert.ok(stale._test_hazard);
takeWarnings();
const beforeStale = mark();
formState.level = "4";
await actions.createActor.call(stale);
assert.equal(actorCreates.length, beforeStale.creates, "a changed level makes Create refuse");
assert.deepEqual(takeWarnings(), ["SIMPLYPF2E.Hazard.PreviewChanged"]);
assert.equal(stale._test_hazard, null, "the stale preview is discarded");
assert.equal(stale._test_busy, false);
formState.level = "3";
await actions.createActor.call(stale);
assert.equal(actorCreates.length, beforeStale.creates, "a discarded preview does not come back by restoring the level");

await actions.previewPlan.call(stale);
formState.prompt = "a different hazard entirely";
await actions.createActor.call(stale);
assert.equal(actorCreates.length, beforeStale.creates, "a changed brief makes Create refuse");
assert.deepEqual(takeWarnings(), ["SIMPLYPF2E.Hazard.PreviewChanged"]);
assert.equal(stale._test_hazard, null);

// Whitespace around the brief is not a change.
formState.prompt = "a scything pressure plate in a crypt";
await actions.previewPlan.call(stale);
formState.prompt = "  a scything pressure plate in a crypt  ";
await actions.createActor.call(stale);
assert.equal(actorCreates.length, beforeStale.creates + 1, "whitespace does not spend the reviewed hazard");
formState.prompt = "a scything pressure plate in a crypt";

// Only a hazard this module issued can be created, even if the stored brief and level match.
const forged = newApp();
forged._test_hazard = { concept: simpleRaw(), level: 3, brief: formState.prompt, preview: {} };
takeWarnings();
await actions.createActor.call(forged);
assert.equal(actorCreates.length, beforeStale.creates + 1, "a hazard the module did not issue is never created");
assert.deepEqual(takeWarnings(), ["SIMPLYPF2E.Hazard.PreviewChanged"]);
assert.equal(forged._test_hazard, null);

// The level and brief controls drop a stale preview as soon as they change, and so do the level steppers.
const watched = newApp();
await actions.previewPlan.call(watched);
listeners.length = 0;
watched._onRender({}, {});
const levelWatch = listeners.find((entry) => entry.name === "level" && entry.type === "change");
const promptWatch = listeners.find((entry) => entry.name === "prompt" && entry.type === "change");
assert.ok(levelWatch && promptWatch, "the hazard controls are watched for changes");
await levelWatch.handler();
assert.ok(watched._test_hazard, "an unchanged control keeps the preview");
formState.level = "5";
await levelWatch.handler();
assert.equal(watched._test_hazard, null, "a changed level drops the preview");
formState.level = "3";
await actions.previewPlan.call(watched);
formState.prompt = "something else";
await promptWatch.handler();
assert.equal(watched._test_hazard, null, "a changed brief drops the preview");
formState.prompt = "a scything pressure plate in a crypt";
await actions.previewPlan.call(watched);
actions.levelUp.call(watched);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(formState.level, "4", "the stepper moved the level");
assert.equal(watched._test_hazard, null, "stepping the level drops the preview");
formState.level = "3";

// ---- A refused concept is shown as an error and writes nothing. ----
const field = (key, name) => key + " " + JSON.stringify({ field: name });
const prose = (name, reason) => "SIMPLYPF2E.Hazard.Errors.Prose " + JSON.stringify({ field: name, reason });
const refusals = [
  ["enricher syntax in prose", { ...simpleRaw(), description: "Check @Check[reflex] before you step." },
    prose("description", "contains Foundry enricher syntax, a bracket or an @ command")],
  ["a game number in prose", { ...simpleRaw(), reset: "The blade deals 2d6 damage again." },
    prose("reset", "contains dice notation")],
  ["no way to disable it", { ...simpleRaw(), disable: [], dispel: false },
    field("SIMPLYPF2E.Hazard.Errors.Field", "disable")],
  ["a malformed required flag", { ...simpleRaw(), complex: "yes" },
    field("SIMPLYPF2E.Hazard.Errors.Field", "complex")],
  ["a complex hazard without a routine", { ...simpleRaw(), complex: true, routine: null },
    "SIMPLYPF2E.Hazard.Errors.Routine"]
];
for (const [name, raw, message] of refusals) {
  hazardRaw = () => raw;
  const refused = newApp();
  const beforeRefusal = mark();
  await actions.previewPlan.call(refused);
  assert.equal(refused._test_error, message, name + " is shown with the Hazard error key");
  assert.equal(refused._test_hazard, null, name + " leaves no preview");
  assert.equal(refused._progress.status, "error");
  assert.equal(refused._test_busy, false);
  assert.deepEqual(hazardOnly(beforeRefusal), { hazardCalls: 1, creates: 0 }, name + " writes nothing");
  assert.equal(refused._tokenUsage.length, 1, "the tokens spent on a refused concept are still reported");
  await actions.createActor.call(refused);
  assert.equal(actorCreates.length, beforeRefusal.creates, "there is nothing to create after a refusal");
}
hazardRaw = simpleRaw;

// A provider failure keeps its own message, and its token usage is recorded once.
class AIRequestError extends Error {
  constructor(message, usage) {
    super(message);
    this.name = "AIRequestError";
    this.usage = usage;
    this.retryable = true;
    this.cancelled = false;
  }
}
const providerMessage = "SIMPLYPF2E.Errors.BadStructure " + JSON.stringify({ detail: field("SIMPLYPF2E.Hazard.Errors.Field", "traits") });
onHazard = () => { throw new AIRequestError(providerMessage, { total: 7 }); };
const failing = newApp();
await actions.generate.call(failing);
onHazard = null;
assert.equal(failing._test_error, providerMessage, "an AI request error is shown as it was reported");
assert.equal(failing._test_hazard, null);
assert.deepEqual(plain(failing._tokenUsage.map((entry) => [entry.label, entry.usage.total])), [["SIMPLYPF2E.Hazard.Progress.Concept", 7]]);

// The brief is required, and a missing PF2e catalog is reported before any spend.
formState.prompt = "   ";
const noBrief = newApp();
const beforeNoBrief = mark();
takeWarnings();
await actions.generate.call(noBrief);
assert.deepEqual(takeWarnings(), ["SIMPLYPF2E.Hazard.NoBrief"]);
assert.equal(hazardOnly(beforeNoBrief).hazardCalls, 0, "an empty brief never reaches the provider");
assert.equal(noBrief._test_busy, false);
formState.prompt = "a scything pressure plate in a crypt";
const savedTraits = CONFIG.PF2E.hazardTraits;
CONFIG.PF2E.hazardTraits = {};
const noCatalog = newApp();
await actions.generate.call(noCatalog);
CONFIG.PF2E.hazardTraits = savedTraits;
assert.equal(noCatalog._test_error, "SIMPLYPF2E.Hazard.Errors.Catalog");
assert.equal(hazardOnly(beforeNoBrief).hazardCalls, 0, "an empty trait list never reaches the provider");

// There is no random hazard brief: the dice button does nothing and spends nothing.
const dice = newApp();
await actions.generateRandom.call(dice);
assert.equal(hazardOnly(beforeNoBrief).hazardCalls, 0);
assert.equal(dice._test_hazard, null);
assert.equal(dice._test_busy, false);

// ---- The gate is checked again whenever the GM could have switched it off. ----
// Switched off while the provider runs: the concept is discarded, no preview appears.
onHazard = () => setGate(false);
const midRun = newApp();
await actions.generate.call(midRun);
onHazard = null;
assert.equal(midRun._test_error, "SIMPLYPF2E.Experimental.Disabled");
assert.equal(midRun._test_hazard, null, "a concept that arrives after the gate closed is not kept");
assert.equal(midRun._progress.status, "error");
setGate(true);

// Switched off between preview and Create: refused, nothing written, the draft is dropped.
const between = newApp();
await actions.previewPlan.call(between);
assert.ok(between._test_hazard);
setGate(false);
takeWarnings();
const beforeBetween = mark();
await actions.createActor.call(between);
assert.deepEqual(takeWarnings(), ["SIMPLYPF2E.Experimental.Disabled"]);
assert.equal(actorCreates.length, beforeBetween.creates, "Create is refused once the gate is closed");
assert.equal(between._test_hazard, null);
assert.equal(between._test_input.mode, "monster");
setGate(true);

// Switched off at the last moment, after the source is built: the native write never happens.
const lastMoment = newApp();
await actions.previewPlan.call(lastMoment);
onPersist = () => setGate(false);
const beforeLast = mark();
await actions.createActor.call(lastMoment);
onPersist = null;
assert.equal(actorCreates.length, beforeLast.creates, "the gate is re-checked right before Actor.create");
assert.equal(lastMoment._test_error, "SIMPLYPF2E.Experimental.Disabled");
assert.equal(lastMoment._progress.status, "error");
assert.equal(lastMoment._test_busy, false);
view = await lastMoment._prepareContext();
assert.equal(view.hazardMode, false, "the next render sees the closed gate");
assert.equal(lastMoment._test_hazard, null);
setGate(true);

// ---- The survival check and rollback. ----
// Foundry drops the embedded items: the actor is rolled back and the draft stays for a retry.
const unverified = newApp();
await actions.previewPlan.call(unverified);
actorShape = "empty";
const deletesBefore = actorDeletes.length;
const beforeUnverified = mark();
await actions.createActor.call(unverified);
assert.equal(actorCreates.length - beforeUnverified.creates, 1);
assert.equal(actorDeletes.length - deletesBefore, 1, "an actor that fails verification is deleted");
assert.ok(unverified._test_error.includes("Post-create verification failed"), unverified._test_error);
assert.ok(unverified._test_hazard, "the draft is kept when the rollback succeeded");
assert.equal(unverified._test_created, null);
assert.equal(unverified._progress.status, "error");

// A failed rollback discards the draft so a retry cannot create a second actor.
deleteFails = true;
const stranded = newApp();
await actions.previewPlan.call(stranded);
await actions.createActor.call(stranded);
deleteFails = false;
actorShape = "whole";
assert.equal(stranded._test_hazard, null, "a draft is discarded when its actor could not be removed");
assert.ok(stranded._test_error.includes("still exists"), stranded._test_error);

// ---- Busy and cancellation. ----
// A second Generate while the provider runs cannot start a second request.
let releaseProvider;
onHazard = () => new Promise((resolve) => { releaseProvider = resolve; });
const pendingApp = newApp();
const beforePending = mark();
const firstRun = actions.generate.call(pendingApp);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(hazardOnly(beforePending).hazardCalls, 1, "the first Generate reached the provider");
await actions.generate.call(pendingApp);
assert.equal(hazardOnly(beforePending).hazardCalls, 1, "a duplicate Generate starts no second request");
releaseProvider();
await firstRun;
onHazard = null;
assert.ok(pendingApp._test_hazard);

// Cancelling during the provider call leaves no preview and no error text.
let releaseCancelled;
onHazard = () => new Promise((resolve) => { releaseCancelled = resolve; });
const cancelApp = newApp();
const cancelRun = actions.generate.call(cancelApp);
await new Promise((resolve) => setImmediate(resolve));
actions.cancelGeneration.call(cancelApp);
releaseCancelled();
await cancelRun;
onHazard = null;
assert.equal(cancelApp._progress.status, "cancelled");
assert.equal(cancelApp._test_error, null);
assert.equal(cancelApp._test_hazard, null);

// A second Create while the native write is pending cannot write twice.
const doubleClick = newApp();
await actions.previewPlan.call(doubleClick);
let releaseCreate;
holdCreate = new Promise((resolve) => { releaseCreate = resolve; });
const beforeDouble = mark();
const firstCreate = actions.createActor.call(doubleClick);
await new Promise((resolve) => setImmediate(resolve));
await actions.createActor.call(doubleClick);
releaseCreate();
await firstCreate;
holdCreate = null;
assert.equal(actorCreates.length - beforeDouble.creates, 1, "a duplicate Create cannot write a second actor");
assert.equal(doubleClick._progress.status, "success");

// ---- The other modes are unchanged. ----
// Starting a Monster run discards a pending hazard preview, so two previews never coexist.
const mixed = newApp();
await actions.previewPlan.call(mixed);
assert.ok(mixed._test_hazard);
formState.mode = "monster";
formState.prompt = "a swamp hag";
mixed._test_readForm();
const beforeMonster = mark();
const monstersBefore = counts.monsterCalls;
await actions.previewPlan.call(mixed);
assert.equal(counts.monsterCalls - monstersBefore, 1, "the Monster pipeline still runs");
assert.equal(hazardOnly(beforeMonster).hazardCalls, 0, "a Monster run never calls the hazard provider");
assert.equal(mixed._test_hazard, null, "a Monster run replaces the hazard preview");
assert.ok(mixed._test_concept);
// The monster preview itself needs the creature stat tables; the context below checks the hazard flags only.
mixed._test_concept = null;
view = await mixed._prepareContext();
assert.equal(view.hazardAvailable, true);
assert.equal(view.hazardMode, false);
assert.equal(view.hazardPreview, null);
assert.equal(view.monsterMode, true);
assert.equal(view.levelMin, -1);
assert.equal(view.levelMax, 24);

// Level ranges: hazards use the table range, creatures -1 to 24, characters 1 to 20.
const rangeApp = newApp();
for (const [mode, typed, expected] of [
  ["hazard", "99", T.HAZARD_MAX_LEVEL], ["hazard", "-9", T.HAZARD_MIN_LEVEL], ["hazard", "-1", -1], ["hazard", "12", 12],
  ["monster", "99", 24], ["npc", "-9", -1], ["character", "99", 20], ["character", "-4", 1], ["encounter", "30", 20]
]) {
  formState.mode = mode;
  formState.level = typed;
  rangeApp._test_readForm();
  assert.equal(rangeApp._test_input.level, expected, mode + " clamps " + typed + " to " + expected);
}
formState.mode = "hazard";
formState.level = "3";

// ---- Static contract: the template, the lang file and the README. ----
const template = await readFile(new URL("../templates/generator.hbs", import.meta.url), "utf8");
const lang = JSON.parse(await readFile(new URL("../lang/en.json", import.meta.url), "utf8"));
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
const leaf = (key) => key.split(".").reduce((node, part) => node?.[part], lang);
for (const [, key] of template.matchAll(/\{\{\s*localize\s+\x22([^\x22]+)\x22/g)) {
  assert.equal(typeof leaf(key), "string", "the template names a missing key: " + key);
}
for (const [, name] of template.matchAll(/hazardLabels\.(\w+)/g)) {
  assert.equal(typeof labels[name], "string", "the template reads an unknown hazard label: " + name);
  assert.equal(typeof leaf(labels[name]), "string", "the hazard label has no lang key: " + name);
}
for (const name of ["mode", "level", "stealth", "disable", "defenses", "reaction", "routine", "reset", "xp"]) {
  assert.ok(template.includes("hazardLabels." + name), "the template shows the " + name + " label from HAZARD_LABEL_KEYS");
}
assert.equal(template.split("value=\x22hazard\x22").length, 2, "there is exactly one Hazard mode radio");
assert.match(template, /\{\{#if hazardAvailable\}\}\s*<label[^>]*>\s*<input type=\x22radio\x22 name=\x22mode\x22 value=\x22hazard\x22/,
  "the Hazard tile exists only inside the gate check");
assert.match(template, /\{\{#if hazardMode\}\}\s*<button[^>]*data-action=\x22generate\x22/, "Hazard mode offers Generate");
assert.match(template, /\{\{#if hazardPreview\}\}[\s\S]*data-action=\x22createActor\x22[\s\S]*SIMPLYPF2E\.Hazard\.Create/,
  "the hazard preview carries its own Create button");
assert.match(template, /<div class=\x22spf-advanced-slot\x22 \{\{#if hazardMode\}\}hidden\{\{\/if\}\}>\s*<details class=\x22spf-advanced\x22>/,
  "the creature options stay in the form but are hidden in Hazard mode");
assert.match(template, /\{\{#unless hazardMode\}\}\s*<section class=\x22spf-provider-summary spf-sources-summary/,
  "Hazard mode hides the compendium source strip");
assert.equal(template.includes(String.fromCharCode(123).repeat(3)), false, "no template value is rendered as raw HTML");
const hazardRow = readme.split("\n").find((line) => line.startsWith("| **Hazard** |"));
assert.match(hazardRow, /Built behind .experimentalTools., not native-accepted/);
assert.doesNotMatch(hazardRow, /In development/);
assert.doesNotMatch(readme, /Generator mode, preview and actor creation are not wired yet/);

console.log("generator-app.hazard.test.mjs: gate, preview, create, staleness, refusals, rechecks and rollback passed");
