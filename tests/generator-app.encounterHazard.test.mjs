// Encounter mode with a hazard member through the production GeneratorApp (design note
// 69a22f5, approved 2026-10-27). The hazard is requested only while experimentalTools is
// open; its concept runs the hazard path and is normalized locally; a mismatched or unfit
// hazard is dropped to the no-hazard composition with a warning; the hazard actor is
// written only through the gated create. composeEncounter and the hazard builder are the
// real modules; the provider, the NPC builder and Foundry documents are isolated at the
// import edges.
// Run: node tests/generator-app.encounterHazard.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import * as progress from "../scripts/progress.mjs";
import * as tokens from "../scripts/tokens.mjs";
import * as postCreate from "../scripts/post-create.mjs";
import * as hazardBuilder from "../scripts/hazard-builder.mjs";
import * as hazardTables from "../scripts/hazard-tables.mjs";
import * as hazardLabels from "../scripts/hazard-labels.mjs";
import { composeEncounter, THREATS } from "../scripts/encounter.mjs";
import { esc } from "../scripts/text.mjs";

if (!vm.SourceTextModule) {
  const run = spawnSync(process.execPath, ["--experimental-vm-modules", import.meta.filename], { stdio: "inherit" });
  process.exit(run.status ?? 1);
}

// Warnings from the module (node realm) and from the generator (vm realm) land in one list.
const warnings = [];
console.warn = (...args) => warnings.push(args.map(String).join(" "));

let gateRefusal = null;
const formState = { mode: "encounter", prompt: "a sunken shrine", level: "5", partySize: "4", threat: "moderate" };
const counts = { designCalls: [], hazardCalls: [], conceptLevels: [], npcCreates: 0, folders: 0, hazardActors: [] };
let designResult = null;
let hazardRaw = null;

// The AI concept as ai.mjs hands it over: words and scale words, no numbers.
const simpleRaw = () => ({
  name: "Scything Pressure Plate",
  description: "A worn flagstone hides a spring-loaded blade that sweeps the corridor.",
  traits: ["mechanical", "trap"], rarity: "common", complex: false,
  stealth: "high", disable: [{ skill: "thievery", scale: "high" }], dispel: false, ac: "high",
  saves: { fortitude: "high", reflex: null, will: null }, hasHP: true,
  reaction: {
    name: "Scything Blade", trigger: "A creature steps on the plate.", effect: "The blade sweeps across the corridor.",
    strike: { name: "Scythe Blade", damageType: "slashing" }, save: null
  },
  routine: null, reset: "The mechanism resets after a minute."
});
const complexRaw = () => ({
  ...simpleRaw(), name: "Whirling Blade Hall", rarity: "uncommon", complex: true, dispel: true,
  reaction: {
    name: "Blades Awaken", trigger: "A creature enters the hall.", effect: "Blades begin to whirl.",
    strike: null, save: { type: "reflex", scale: "high", effect: "The creature is cut by whirling blades." }
  },
  routine: { actions: 2, text: "The blades sweep the hall and cut anyone near.", strike: { name: "Whirling Blade", damageType: "slashing" } }
});
const npcConcept = (level) => ({
  name: `Shrine Watcher ${level}`, level, rarity: "common", spellcasting: null, focusSpells: [],
  specialAbilities: [], feats: [], equipment: [], loot: [], strikes: [], blurb: "a sentinel"
});

const CONFIG = {
  PF2E: {
    hazardTraits: { mechanical: "PF2E.TraitMechanical", trap: "PF2E.TraitTrap", magical: "PF2E.TraitMagical" },
    damageTypes: { slashing: "PF2E.DamageSlashing", fire: "PF2E.DamageFire", piercing: "PF2E.DamagePiercing" },
    skills: { thievery: { label: "PF2E.SkillThievery" }, athletics: { label: "PF2E.SkillAthletics" } }
  }
};
const game = {
  system: { id: "pf2e" }, user: { id: "gm", isGM: true },
  i18n: { localize: (key) => key, format: (key) => key },
  settings: { get: () => false }, packs: null, actors: { get: () => null }
};
class Application {
  render() { return this; }
  async close() {}
}

const context = vm.createContext({
  AbortController, setInterval: () => 1, clearInterval: () => {},
  console: { log() {}, warn: (...args) => warnings.push(args.map(String).join(" ")), error() {} },
  foundry: { applications: { api: { ApplicationV2: Application, HandlebarsApplicationMixin: (base) => base } } },
  game, CONFIG,
  ui: { notifications: { info() {}, warn() {}, error() {} } },
  Folder: {
    create: async ({ name }) => {
      counts.folders++;
      return { id: `folder-${counts.folders}`, name, async delete() {} };
    }
  },
  Actor: {
    create: async (data) => {
      counts.hazardActors.push(data);
      return {
        id: `hazard-actor-${counts.hazardActors.length}`, name: data.name, type: data.type,
        items: { contents: data.items.map((item) => ({ ...item })) },
        sheet: { render: async () => {} }, update: async () => {}, delete: async () => {}
      };
    }
  }
});

// Real SpfApp, as the lifecycle harness loads it.
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

const npcCreate = async (concept) => {
  counts.npcCreates++;
  return { actor: { id: `npc-${counts.npcCreates}`, name: concept.name, type: "npc", update: async () => {}, delete: async () => {} }, expectedItems: [] };
};
const mocks = {
  SpfApp: RealSpfApp, MODULE_ID: "simplypf2e", SETTINGS: { freeArchetype: "free" }, AI_TASK: { HAZARD_CONCEPT: "hazardConcept" },
  taskMaxTokens: (task) => (task === "hazardConcept" ? 2000 : 100),
  getProviderRequestConfig: () => ({}), getProviderAuthWarningKey: () => null, authorizeApiKeyForCurrentBaseUrl: async () => {},
  getCustomPresets: () => [], findPreset: () => null, examplePrompt: () => "", presetPickerGroups: () => ({ selectedId: "", standard: [], custom: [] }),
  randomBrief: () => "random", sourceReadiness: () => ({ ready: true }), createProgress: progress.createProgress,
  // Real encounter math; the AI pass and the NPC builder are isolated.
  composeEncounter, THREATS,
  designEncounter: async (args) => { counts.designCalls.push(args); return designResult; },
  generateConcept: async ({ level }) => { counts.conceptLevels.push(level); return { concept: npcConcept(level), usage: { total: 1 } }; },
  normalizeConcept: (raw) => raw,
  resolveConcept: async (value) => ({
    abilities: [], spells: [], feats: [], focusSpells: [],
    equipment: value.equipment.map((item) => ({ ...item, entry: {} })), loot: value.loot.map((item) => ({ ...item, entry: {} }))
  }),
  completionManifest: () => ({}), assertComplete: () => {}, completionSummary: () => ({}),
  findBestiaryScaffold: async () => ({ img: null }), createActor: npcCreate,
  applyTreasureBudget: async (loot) => loot, treasureBudget: () => 0, lootValueGp: () => 0,
  computeStats: () => ({ ac: 14, saves: { fortitude: 4, reflex: 5, will: 3 }, hp: 20, perception: 3, strikes: [], spellDC: null }),
  getCreatureFeatCandidates: async () => [], normalizeCreatureFeatName: (name) => String(name ?? "").toLowerCase(),
  selectCreatureFeats: async () => ({ feats: [], omitted: true }), selectCreatureAbilities: async () => ({ abilities: [] }),
  getAbilityCandidates: async () => [], getEquipmentCandidates: async () => [], getLootCandidates: async () => [],
  selectEquipment: async () => ({ equipment: [], omitted: true }), selectLoot: async () => ({ loot: [], omitted: true }),
  getSpellCandidates: async () => [], getScrollSpellCandidates: async () => [], getFocusSpellCandidates: async () => [],
  selectSpells: async () => ({ spells: [] }), chooseSpellFocus: async () => ({ keywords: [] }),
  // Experimental gate: the real experimental-tools.mjs needs the settings module; here the gate is driven directly.
  experimentalToolRefusal: () => (gateRefusal ? { code: "disabled", localizeKey: "SIMPLYPF2E.Experimental.Disabled" } : null),
  assertExperimentalToolAccess: () => { if (gateRefusal) throw Object.assign(new Error("experimental tools are off"), { code: "disabled" }); },
  // Hazard path: the provider call is isolated; normalization, the GM Core tables and the source are real.
  generateHazardConcept: async (brief, options) => {
    counts.hazardCalls.push({ brief, options });
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
  HAZARD_LABEL_KEYS: hazardLabels.HAZARD_LABEL_KEYS,
  verifyCreatedActor: (actor, manifest, expectedItems) => (actor.type === "hazard"
    ? postCreate.verifyCreatedActor(actor, manifest, expectedItems) : undefined),
  persistedExpectedItems: (items) => postCreate.persistedExpectedItems(items),
  esc,
  treasureBudget: () => 0
};

const sources = await readFile(new URL("../scripts/generator-app.mjs", import.meta.url), "utf8");
// Only the generator uses private fields; rewriting them lets the test reach state.
const generatorSource = sources.replace(/#([A-Za-z]\w*)/g, "_test_$1");
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

// The rendered form. Level and party size come from the same selectors the generator reads.
const form = {
  querySelector(selector) {
    if (selector.includes("mode")) return { value: formState.mode };
    if (selector.includes("prompt")) return { value: formState.prompt };
    if (selector.includes("partySize")) return { value: formState.partySize };
    if (selector.includes("threat")) return { value: formState.threat };
    if (selector.includes("level")) return { value: formState.level };
    if (selector.includes("allowSpellcasting")) return { checked: false };
    return null;
  },
  querySelectorAll: () => [],
  contains: () => false
};

// Arrays built inside the vm realm fail deepStrictEqual across realms; a JSON copy compares by value.
const plain = (list) => JSON.parse(JSON.stringify(list));
const pick = (member) => ({ role: member.role, level: member.level, count: member.count, xpEach: member.xpEach, complex: member.complex });
const resetCounts = () => {
  counts.designCalls.length = 0; counts.hazardCalls.length = 0; counts.conceptLevels.length = 0;
  counts.npcCreates = 0; counts.folders = 0; counts.hazardActors.length = 0;
  warnings.length = 0;
};

// Plan an encounter (no create) and return the app with its reviewed plan.
async function plan({ level = "5", partySize = "4", threat = "moderate", design, hazard = null }) {
  resetCounts();
  formState.level = level; formState.partySize = partySize; formState.threat = threat;
  designResult = design;
  hazardRaw = hazard;
  const app = new GeneratorApp();
  app.element = form;
  app._test_input.mode = "encounter";
  await app._test_runGeneration(false, { create: false });
  return app;
}

const boss = (level) => ({ role: "boss", level, count: 1, xpEach: 60 });

// ---- A. A simple hazard fits: boss, hazard at party level, minion from the rest. ----
{
  gateRefusal = null;
  const app = await plan({
    design: { name: "Shrine Watch", briefs: ["a crypt warden", "a bone hound"], hazard: "simple", usage: { total: 1 } },
    hazard: simpleRaw
  });
  assert.equal(counts.designCalls.at(-1).allowHazard, true, "the hazard is requested while experimentalTools is open");
  assert.deepEqual(counts.conceptLevels, [6, 1], "boss and minion run the NPC path at the composed levels");
  assert.equal(counts.hazardCalls.length, 1, "the hazard runs the hazard path exactly once");
  assert.equal(counts.hazardCalls[0].options.level, 5, "the hazard level is the module's nearest feasible level");
  assert.match(counts.hazardCalls[0].brief, /Shrine Watch/, "the hazard brief names the encounter");
  assert.match(counts.hazardCalls[0].brief, /\bsimple\b/, "the hazard concept request carries the selected simple kind");
  assert.doesNotMatch(counts.hazardCalls[0].brief, /\bcomplex\b/, "the hazard concept request names only the selected kind");
  const members = app._test_encounter.members;
  assert.deepEqual(plain(members).map((m) => m.role), ["boss", "hazard", "minion"]);
  assert.deepEqual(pick(members[1]), { role: "hazard", level: 5, count: 1, xpEach: 8, complex: false });
  assert.equal(app._test_encounter.spent, 78, "hazard and creature XP stay within the 80 XP budget");
  assert.ok(app._test_encounter.spent <= app._test_encounter.budget);
  assert.equal(members[1].hazard.concept.name, "Scything Pressure Plate", "the hazard member carries its reviewed concept");
  assert.deepEqual(plain(app._progress.steps).map((step) => step.key), ["design", "member0", "member1", "member2", "match"],
    "the progress plan follows the composed members");
  assert.deepEqual(plain(app._progress.steps).map((step) => step.weight), [100, 600, 2000, 600, 1600],
    "the hazard member is weighted by the hazard token cap; creature members keep the creature sum");
  assert.ok(app._progress.steps.every((step) => step.state === "done"), "no declared step is left pending");

  // The preview row for the hazard member is built from the reviewed concept; no NPC stat block is used for it.
  const row = app._test_buildEncounterPreviewContext().members[1];
  assert.equal(row.name, "Scything Pressure Plate");
  assert.equal(row.role, hazardLabels.HAZARD_LABEL_KEYS.complexitySimple, "a simple hazard is labelled as one");
  assert.equal(row.tag, hazardLabels.HAZARD_LABEL_KEYS.mode, "a hazard row is tagged as a hazard, not a creature");
  assert.equal(app._test_buildEncounterPreviewContext().members[0].tag, "SIMPLYPF2E.Generator.Creature", "a creature row keeps the creature tag");
  assert.equal(row.level, 5);
  assert.match(row.statline, /^AC \d+/, "the hazard row shows its table-built AC");

  // The hazard member is one copy: the stepper cannot add a second hazard.
  await app._test_stepMemberCount(1, 3);
  assert.equal(app._test_encounter.members[1].count, 1, "a hazard stays at one copy");
  assert.equal(app._test_encounter.spent, 78);

  // Create writes the hazard actor through the hazard source and the NPC members through the builder.
  const outcome = await app._test_createEncounterActors();
  assert.equal(outcome, "success");
  assert.deepEqual(counts.hazardActors.map((data) => data.type), ["hazard"], "one hazard actor is written");
  assert.equal(counts.hazardActors[0].system.details.level.value, 5, "the hazard actor carries the module level");
  assert.equal(counts.npcCreates, 2, "boss and minion are written through the NPC builder");
  assert.equal(counts.folders, 1);
}

// ---- B. Complex requested, simple concept returned: dropped with a warning, output equals the none composition. ----
{
  gateRefusal = null;
  const app = await plan({
    design: { name: "Shrine Watch", briefs: ["a crypt warden", "a bone hound"], hazard: "complex", usage: { total: 1 } },
    hazard: simpleRaw
  });
  assert.equal(counts.hazardCalls.length, 1, "the concept is generated before the drop is known");
  assert.match(counts.hazardCalls[0].brief, /\bcomplex\b/, "the hazard concept request carries the selected complex kind");
  assert.doesNotMatch(counts.hazardCalls[0].brief, /\bsimple\b/, "the hazard concept request does not name the returned kind");
  assert.deepEqual(counts.conceptLevels, [6, 3], "the minion is composed from the no-hazard budget after the drop");
  assert.deepEqual(plain(app._test_encounter.members).map((m) => m.role), ["boss", "minion"]);
  const none = composeEncounter("moderate", 4, 5);
  assert.deepEqual(plain(app._test_encounter.members).map((m) => pick(m)), none.members.map((m) => pick(m)),
    "a dropped hazard leaves the none composition");
  assert.equal(app._test_encounter.spent, none.spent);
  assert.ok(warnings.some((line) => /hazard dropped/.test(line)), "the mismatch is reported with a warning");
  assert.deepEqual(plain(app._progress.steps).map((step) => step.key), ["design", "member0", "member1", "match"],
    "the progress plan is rebuilt for the two members");
  assert.deepEqual(plain(app._progress.steps).map((step) => step.weight), [100, 600, 600, 1600], "both creature members keep the creature sum");
  assert.ok(app._progress.steps.every((step) => step.state === "done"));
  const outcome = await app._test_createEncounterActors();
  assert.equal(outcome, "success");
  assert.equal(counts.hazardActors.length, 0, "a dropped hazard is never written");
}

// ---- C. No level fits: the hazard is dropped by the module; the hazard path never runs. ----
{
  gateRefusal = null;
  const app = await plan({
    level: "1", partySize: "1", threat: "moderate",
    design: { name: "Lone Watch", briefs: ["a crypt warden"], hazard: "simple", usage: { total: 1 } },
    hazard: simpleRaw
  });
  assert.equal(counts.hazardCalls.length, 0, "an unfit hazard never reaches the provider");
  assert.deepEqual(plain(app._test_encounter.members).map((m) => m.role), ["boss"]);
  assert.equal(app._test_encounter.spent, composeEncounter("moderate", 1, 1).spent);
  assert.ok(warnings.some((line) => /no level fits/.test(line)), "the unfit hazard is reported with a warning");
}

// ---- D. Gate closed: the hazard is not requested, and a hazard answer is ignored. ----
{
  gateRefusal = "disabled";
  const app = await plan({
    design: { name: "Shrine Watch", briefs: ["a crypt warden", "a bone hound"], hazard: "simple", usage: { total: 1 } },
    hazard: simpleRaw
  });
  assert.equal(counts.designCalls.at(-1).allowHazard, false, "the hazard is not requested while experimentalTools is closed");
  assert.equal(counts.hazardCalls.length, 0, "no hazard concept call while the gate is closed");
  assert.deepEqual(plain(app._test_encounter.members).map((m) => m.role), ["boss", "minion"]);
  gateRefusal = null;
}

// ---- E. none: the output equals the no-hazard composition, with no hazard call. ----
{
  gateRefusal = null;
  const app = await plan({
    design: { name: "Shrine Watch", briefs: ["a crypt warden", "a bone hound"], hazard: "none", usage: { total: 1 } },
    hazard: simpleRaw
  });
  assert.equal(counts.hazardCalls.length, 0);
  assert.deepEqual(counts.conceptLevels, [6, 3], "none composes the same minion as before");
  const none = composeEncounter("moderate", 4, 5);
  assert.deepEqual(plain(app._test_encounter.members).map((m) => pick(m)), none.members.map((m) => pick(m)));
  assert.equal(app._test_encounter.spent, none.spent);
}

// ---- F. The gate closes between plan and create: nothing is written. ----
{
  gateRefusal = null;
  const app = await plan({
    design: { name: "Shrine Watch", briefs: ["a crypt warden", "a bone hound"], hazard: "simple", usage: { total: 1 } },
    hazard: simpleRaw
  });
  gateRefusal = "disabled";
  const outcome = await app._test_createEncounterActors();
  assert.equal(outcome, "error", "create refuses while the gate is closed");
  assert.equal(counts.folders, 0, "no folder is written while the gate is closed");
  assert.equal(counts.hazardActors.length, 0, "no hazard actor is written while the gate is closed");
  assert.ok(app._test_encounter, "the reviewed plan is kept for a retry");
  gateRefusal = null;
}

// ---- G. A level or XP in the AI's concept never reaches the hazard member. ----
{
  gateRefusal = null;
  const app = await plan({
    design: { name: "Shrine Watch", briefs: ["a crypt warden", "a bone hound"], hazard: "simple", usage: { total: 1 } },
    hazard: () => ({ ...simpleRaw(), level: 99, xp: 500 })
  });
  assert.equal(counts.hazardCalls[0].options.level, 5, "the module picks the hazard level, not the concept");
  assert.equal(app._test_encounter.members[1].xpEach, 8, "the module computes the hazard XP");
  const concept = app._test_encounter.members[1].hazard.concept;
  assert.equal("level" in concept || "xp" in concept, false, "the normalized concept carries no level or XP");
  assert.equal(app._test_encounter.spent, 78);
}

// ---- Static contract: the encounter member tag labels a hazard as a hazard. ----
const template = await readFile(new URL("../templates/generator.hbs", import.meta.url), "utf8");
assert.match(template, /class="spf-member-tag">\{\{localize this\.tag\}\} \{\{this\.level\}\}/,
  "the encounter member tag reads the row's own tag, not a fixed creature label");

console.log("generator-app.encounterHazard.test.mjs: hazard members run the hazard path, drop without changing the none output, and write only through the gated create");
