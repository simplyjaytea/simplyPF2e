// Exercise the production Item Forge scroll and wand path. The spell-consumable builder,
// the rank rules and toItemData are the real modules; the AI call, the candidate lookups,
// fromUuid and Item.create are stubbed. Proves: a real pinned template that arrives as raw
// toObject() data (no compendium source, the review P1) builds through toItemData; a pick
// whose build throws is dropped with a DroppedPick warning while the others build; the Forge
// level caps the rank; a level too low for any rank is refused; a repeated pick is planned once;
// generation writes nothing and Create writes once.
// Run: node tests/itemforge-app.consumables.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import * as consumables from "../scripts/spell-consumables.mjs";
import { priceToGp, toItemData } from "../scripts/compendium.mjs";

if (!vm.SourceTextModule) {
  const run = spawnSync(process.execPath, ["--experimental-vm-modules", import.meta.filename], { stdio: "inherit" });
  process.exit(run.status ?? 1);
}
const source = readFileSync(new URL("../scripts/itemforge-app.mjs", import.meta.url), "utf8");
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/consumables/${name}`, import.meta.url), "utf8"));
const plain = (value) => JSON.parse(JSON.stringify(value));

const RANK_1_SCROLL = fixture("scroll-of-1st-rank-spell.json");
const RANK_4_WAND = fixture("magic-wand-4th-rank-spell.json");
const HEAL = fixture("heal.json");
const WEB = fixture("wand-of-the-spider-4th-rank-spell.json").system.spell;
const { SPELL_CONSUMABLE_TEMPLATES } = consumables;
const SCROLL_1 = SPELL_CONSUMABLE_TEMPLATES.scroll[1];
const SCROLL_2 = SPELL_CONSUMABLE_TEMPLATES.scroll[2];
const WAND_4 = SPELL_CONSUMABLE_TEMPLATES.wand[4];
const FIREBALL = { ...plain(HEAL), _id: "fireballStub00001", name: "Fireball", system: { ...plain(HEAL.system), level: { value: 3 } } };
const spellUuid = (spell) => `Compendium.pf2e.spells-srd.Item.${spell._id}`;

// Pinned template documents. toObject() is the raw source with no compendium source; toItemData()
// must supply it. The rank 2 template carries a Rule Element, so its build throws after the source check.
const brokenRank2 = { ...plain(RANK_1_SCROLL), _id: SCROLL_2.split(".").pop(), system: { ...plain(RANK_1_SCROLL.system), level: { value: 3 }, rules: [{ key: "Note" }] } };
const templates = new Map([
  [SCROLL_1, { uuid: SCROLL_1, toObject: () => plain(RANK_1_SCROLL) }],
  [SCROLL_2, { uuid: SCROLL_2, toObject: () => plain(brokenRank2) }],
  [WAND_4, { uuid: WAND_4, toObject: () => plain(RANK_4_WAND) }]
]);
const fromUuidCalls = [];
async function fromUuid(uuid) {
  fromUuidCalls.push(uuid);
  return templates.get(uuid) ?? null;
}

const spellDocs = new Map([
  ["c-heal", { name: HEAL.name, uuid: spellUuid(HEAL), source: HEAL }],
  ["c-fire", { name: FIREBALL.name, uuid: spellUuid(FIREBALL), source: FIREBALL }],
  ["c-web", { name: WEB.name, uuid: spellUuid(WEB), source: WEB }]
]);
async function getCandidateDocument(candidate) {
  const spell = spellDocs.get(candidate?.id);
  if (!spell) return null;
  return { name: spell.name, uuid: spell.uuid, toObject: () => plain(spell.source) };
}

// Candidates as a common plan would see them. The real query drops focus, cantrip and rarer spells;
// compendium.scrollCandidates.test.mjs covers that filter.
const POOL = [
  { id: "c-heal", name: HEAL.name, rank: HEAL.system.level.value, traits: [], rarity: "common" },
  { id: "c-fire", name: FIREBALL.name, rank: 3, traits: [], rarity: "common" },
  { id: "c-web", name: WEB.name, rank: WEB.system.level.value, traits: [], rarity: "common" }
];
let candidatePool = POOL;
const candidateCalls = [];
async function getScrollSpellCandidates(maxRank, keywords, options) {
  candidateCalls.push({ maxRank, keywords, options });
  return candidatePool;
}
let picksForCall = [];
const aiCalls = [];
async function selectSpellConsumables(brief, options) {
  aiCalls.push({ brief, options });
  return { picks: picksForCall, usage: { prompt: 5, completion: 5, total: 10, estimated: false } };
}
// A pick as the real selectSpellConsumables returns it.
const pick = (id, rank, kind) => ({ spellId: id, name: spellDocs.get(id).name, rank, kind, candidate: POOL.find((entry) => entry.id === id) });
class MockSpfApp {
  _tokenUsage = [];
  _progress = null;
  _formatLastRunCost() { return null; }
  _buildTokenReport() { return null; }
  _recordTokens(label, usage) { if (usage) this._tokenUsage.push({ label, usage }); }
  get _canCancel() { return Boolean(this.abort && !this.abort.signal.aborted); }
  async render() {}
  _beginProgress() { this.abort = new AbortController(); return this.abort.signal; }
  _throwIfCancelled() {
    if (this.abort?.signal.aborted) throw Object.assign(new Error("cancelled"), { cancelled: true });
  }
  async _setStep() { this._throwIfCancelled(); }
  _progressCallback() { return () => {}; }
  _lockCreation() { this._throwIfCancelled(); }
  _finishRun() { this.abort = null; }
}
const mocks = {
  experimentalToolsEnabled: () => false,
  MODULE_ID: "simplypf2e", SpfApp: MockSpfApp,
  AI_TASK: { MAGIC_ITEM_CONCEPT: "magic", RUNED_ITEM_CONCEPT: "runed", SPELL_CONSUMABLE_CONCEPT: "consumable" },
  taskMaxTokens: () => 100,
  RUNED_ITEM_KINDS: new Set(["weapon", "armor"]), MIN_ITEM_LEVEL: 1, MAX_ITEM_LEVEL: 24,
  getProviderRequestConfig: () => ({ provider: {}, connections: [] }),
  getProviderAuthWarningKey: () => null,
  getScrollSpellCandidates, getCandidateDocument, selectSpellConsumables, toItemData, priceToGp,
  spellConsumableTemplateUuid: consumables.spellConsumableTemplateUuid,
  spellConsumableRankProblem: consumables.spellConsumableRankProblem,
  buildSpellConsumable: consumables.buildSpellConsumable,
  spellConsumableName: consumables.spellConsumableName
};
let createCalls = 0;
let createdWith = null;
let forgeKind = "scroll";
let forgeLevel = "5";
const notices = [];
const warnings = [];
const context = vm.createContext({
  console: { log() {}, warn() {}, error() {} },
  game: { i18n: { localize: (key) => key, format: (key, data) => key + ":" + JSON.stringify(data ?? {}) } },
  ui: { notifications: { info: (text) => notices.push(text), warn: (text) => warnings.push(text) } },
  Item: { create: async (sources) => {
    createCalls++;
    createdWith = sources;
    return sources.map((item, index) => ({ id: "item-" + index, name: item.name, sheet: { render: async () => {} } }));
  } },
  fromUuid
});
const module = new vm.SourceTextModule(source, { context });
await module.link((specifier) => {
  const imports = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)]
    .filter((match) => match[2] === specifier)
    .flatMap((match) => match[1].split(",").map((name) => name.trim()));
  return new vm.SyntheticModule(imports, function () {
    for (const name of imports) this.setExport(name, mocks[name] ?? (() => { throw new Error("Unexpected dependency: " + name); }));
  }, { context });
});
await module.evaluate();
const App = module.namespace.ItemForgeApp;
const actions = App.DEFAULT_OPTIONS.actions;
function forgeApp() {
  const instance = new App();
  const controls = {
    prompt: { value: "fire and healing scrolls" }, level: { value: forgeLevel },
    rarity: { value: "common" }, kind: { value: forgeKind }
  };
  instance.element = { querySelector: (selector) => controls[selector.match(/name="(\w+)"/)?.[1]] ?? null };
  return instance;
}
// 1. A raw pinned template (no compendium source in toObject) is refused by the builder on its own,
// which is what the review P1 found. The Forge loads it through toItemData, so it builds below.
assert.equal(plain(templates.get(SCROLL_1).toObject())._stats, undefined, "the raw template carries no compendium source");
assert.throws(() => consumables.buildSpellConsumable({ kind: "scroll", rank: 1, templateData: templates.get(SCROLL_1).toObject(), spellData: HEAL }),
  /not the pinned rank template/, "the raw template is refused");

// 2. A scroll plan at level 5 (rank cap 3). Heal at rank 1 builds from the real template. The broken
// rank 2 template is dropped with its build error, rank 4 is above the cap, and the repeated Heal
// is planned once. Generation writes nothing.
picksForCall = [pick("c-heal", 1, "scroll"), pick("c-heal", 2, "scroll"), pick("c-fire", 4, "scroll"), pick("c-heal", 1, "scroll")];
const scroll = forgeApp();
await actions.generate.call(scroll);
assert.equal(createCalls, 0, "generation writes nothing");
assert.equal(candidateCalls.at(-1).maxRank, 3, "level 5 caps the scroll rank at 3");
assert.deepEqual(plain(candidateCalls.at(-1).options), { maxRarity: "common" }, "the rarity filter goes to the candidate query, before its cut");
assert.equal(aiCalls.at(-1).options.maxRank, 3, "the cap is passed to the AI call");
assert.equal(aiCalls.at(-1).options.kind, "scroll");
assert.equal(aiCalls.at(-1).options.count, 6, "the plan asks for at most six consumables");
let prepared = await scroll._prepareContext();
assert.deepEqual(plain(prepared.preview.items.map(({ name, rank, level, price }) => ({ name, rank, level, price }))), [
  { name: "Scroll of Heal (Rank 1)", rank: 1, level: 1, price: "4 gp" }
], "the built row carries the pinned template level and price");
assert.equal(prepared.preview.warnings.length, 2, "the broken template and the rank above the cap are each reported once");
assert.ok(prepared.preview.warnings[0].includes("DroppedPick") && prepared.preview.warnings[0].includes("Rule Elements"), "a build that throws is one dropped pick");
assert.ok(prepared.preview.warnings[1].includes("RankAboveLevel"), "a rank above the level cap is dropped with that reason");
assert.equal(prepared.hasPreview, true);

// Create writes the planned source once, with the pinned template and a link to the real spell.
await actions.createItem.call(scroll);
assert.equal(createCalls, 1, "Create writes exactly once");
assert.deepEqual(plain(createdWith.map((source) => source.name)), ["Scroll of Heal (Rank 1)"]);
assert.equal(createdWith[0]._stats.compendiumSource, SCROLL_1, "the scroll records its pinned template");
assert.ok(createdWith[0].system.description.value.startsWith(`<p>@UUID[${spellUuid(HEAL)}]{Heal}</p><hr>`), "the description links the real spell by UUID");
assert.deepEqual(plain(createdWith[0].system.rules), [], "no Rule Elements are created");
prepared = await scroll._prepareContext();
assert.equal(prepared.preview, null, "a committed plan is consumed");
assert.deepEqual(plain(prepared.created.names), ["Scroll of Heal (Rank 1)"], "the completion card names the created item");
await actions.createItem.call(scroll);
assert.equal(createCalls, 1, "a second Create does not write again");

// 3. A wand plan at level 9 (rank cap 4). Web at rank 4 builds from the pinned wand template.
// Rank 10 is refused as a dropped pick before any template is loaded.
forgeKind = "wand";
forgeLevel = "9";
picksForCall = [pick("c-web", 4, "wand"), pick("c-web", 10, "wand")];
fromUuidCalls.length = 0;
const wand = forgeApp();
await actions.generate.call(wand);
assert.equal(createCalls, 1, "generating a wand plan writes nothing");
assert.equal(candidateCalls.at(-1).maxRank, 4, "level 9 caps the wand rank at 4");
prepared = await wand._prepareContext();
assert.deepEqual(plain(prepared.preview.items.map(({ name, level, price }) => ({ name, level, price }))), [
  { name: "Wand of Web (Rank 4)", level: 9, price: "700 gp" }
]);
assert.equal(prepared.preview.warnings.length, 1, "only the rank 10 pick is reported");
assert.ok(prepared.preview.warnings[0].includes("DroppedPick"), "rank 10 is a dropped pick, not a missing template");
assert.deepEqual(fromUuidCalls, [WAND_4], "only the rank 4 template is loaded");

// 4. A wand at item level 2 has no rank that fits, so it is refused before any AI request.
forgeLevel = "2";
const callsBeforeLow = aiCalls.length;
const lowWand = forgeApp();
await actions.generate.call(lowWand);
assert.ok((await lowWand._prepareContext()).error.includes("LevelTooLow"), "a wand below item level 3 is refused");
assert.equal(aiCalls.length, callsBeforeLow, "no provider request when no rank fits");

// 5. Nothing buildable is an error, never an empty completion card.
forgeKind = "scroll";
forgeLevel = "5";
picksForCall = [pick("c-heal", 0, "scroll")];
const unbuildable = forgeApp();
await actions.generate.call(unbuildable);
prepared = await unbuildable._prepareContext();
assert.equal(prepared.preview, null);
assert.ok(prepared.error.includes("NoPicks"), "a plan with nothing buildable reports an error");

// 6. No spell candidates means no provider request at all.
candidatePool = [];
const barren = forgeApp();
const callsBeforeBarren = aiCalls.length;
await actions.generate.call(barren);
assert.ok((await barren._prepareContext()).error.includes("NoCandidates"));
assert.equal(aiCalls.length, callsBeforeBarren, "no provider request without spell candidates");
candidatePool = POOL;

// 7. The kind tiles select scroll or wand, and unknown kinds keep the selection.
const picker = forgeApp();
await actions.selectKind.call(picker, null, { dataset: { kind: "wand" } });
prepared = await picker._prepareContext();
assert.equal(prepared.input.kind, "wand");
assert.deepEqual(plain(prepared.consumableKinds.map((kind) => kind.selected)), [false, true]);
assert.equal(prepared.promptLabel, "SIMPLYPF2E.ItemForge.Consumables.PromptLabel");
await actions.selectKind.call(picker, null, { dataset: { kind: "potion" } });
assert.equal((await picker._prepareContext()).input.kind, "wand", "unknown kinds keep the selection");

// The extracted helper reports missing spell and template without losing a valid pick.
forgeKind = "scroll"; forgeLevel = "5";
picksForCall = [pick("c-heal", 1, "scroll"),
  { spellId: "missing", name: "Missing Spell", rank: 1, candidate: { id: "missing" } },
  pick("c-heal", 3, "scroll")];
const missing = forgeApp();
await actions.generate.call(missing);
prepared = await missing._prepareContext();
assert.equal(prepared.preview.items.length, 1);
assert.ok(prepared.preview.warnings.some((warning) => warning.includes("SpellMissing") && warning.includes("Scroll of Missing Spell (Rank 1)")));
assert.ok(prepared.preview.warnings.some((warning) => warning.includes("TemplateMissing") && warning.includes("Scroll of Heal (Rank 3)")));

console.log("itemforge-app.consumables.test.mjs: real template build, per-pick drops, level cap, wand and plan refusals, deferred write and commit passed");
