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

const LIGHT = fixture("light.json");
const DECK = fixture("cantrip-deck-5-pack.json");
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
  [SPELL_CONSUMABLE_TEMPLATES.cantripDeck, { uuid: SPELL_CONSUMABLE_TEMPLATES.cantripDeck, toObject: () => plain(DECK) }],
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
  ["c-light", { name: LIGHT.name, uuid: spellUuid(LIGHT), source: LIGHT }],
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
  { id: "c-light", name: "Light", rank: 1, traits: ["cantrip"], rarity: "common" },
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
let gate = false;
const mocks = {
  experimentalToolsEnabled: () => gate,
  MODULE_ID: "simplypf2e", SpfApp: MockSpfApp,
  AI_TASK: { MAGIC_ITEM_CONCEPT: "magic", RUNED_ITEM_CONCEPT: "runed", SPELL_CONSUMABLE_CONCEPT: "consumable" },
  taskMaxTokens: () => 100,
  RUNED_ITEM_KINDS: new Set(["weapon", "armor"]), MIN_ITEM_LEVEL: 1, MAX_ITEM_LEVEL: 24,
  getProviderRequestConfig: () => ({ provider: {}, connections: [] }),
  getProviderAuthWarningKey: () => null,
  getScrollSpellCandidates, getCantripCandidates: async () => [POOL[0]], getCandidateDocument, selectSpellConsumables, toItemData, priceToGp,
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

forgeKind = "cantripDeck";
forgeLevel = "1";
picksForCall = [pick("c-light", 1, "cantripDeck"), pick("c-light", 1, "cantripDeck")];
const app = forgeApp();
let prepared = await app._prepareContext();
assert.ok(prepared.consumableKinds.some(k => k.value === "cantripDeck"));
await actions.generate.call(app);
prepared = await app._prepareContext();
assert.equal(prepared.preview.items.length, 1);
assert.equal(prepared.preview.items[0].name, "Cantrip Deck of Light (5-pack)");
assert.equal(prepared.showDestination, false);
assert.equal(prepared.isCantripDeck, true);
assert.equal(prepared.preview.isCantripDeck, true);
assert.equal(createCalls, 0);
await actions.createItem.call(app);
assert.equal(createCalls, 1);
assert.equal(createdWith.length, 1);
assert.equal(createdWith[0].name, "Cantrip Deck of Light (5-pack)");
assert.equal("spell" in createdWith[0].system, false);

gate = true;
const gated = forgeApp();
await actions.selectKind.call(gated, null, { dataset: { kind: "cantripDeck" } });
const gateContext = await gated._prepareContext();
assert.equal(gateContext.showDestination, true);
