// Exercise the production Item Forge scroll and wand path with stubbed compendium,
// AI and spell-consumable modules. Proves that generation writes nothing, that
// previews carry the pinned template level and price, that a rank-problem pick
// is reported and skipped, and that Create calls Item.create once with the plan.
// Run: node tests/itemforge-app.consumables.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

if (!vm.SourceTextModule) {
  const run = spawnSync(process.execPath, ["--experimental-vm-modules", import.meta.filename], { stdio: "inherit" });
  process.exit(run.status ?? 1);
}
const source = await readFile(new URL("../scripts/itemforge-app.mjs", import.meta.url), "utf8");
const notices = [];
const warnings = [];
let createCalls = 0;
let createdWith = null;
let forgeKind = "scroll";
let forgeRarity = "common";
let candidatePool = null;
let picksForCall = [];
const aiCalls = [];
const candidateCalls = [];

// Values built inside the vm realm differ in prototype; compare plain data.
const plain = (value) => JSON.parse(JSON.stringify(value));
const spell = (id, name, rank, extra = {}) => ({ id, name, rank, traits: [], rarity: "common", ref: { packId: "pf2e.spells-srd", _id: id }, ...extra });
const fullPool = [
  spell("c-fire", "Fireball", 3, { traits: ["fire"] }),
  spell("c-heal", "Heal", 1, { traits: ["healing"] }),
  spell("c-focus", "Healing Font", 1, { traits: ["focus", "healing"] }),
  spell("c-rare", "Ancient Ward", 2, { rarity: "rare" }),
  spell("c-ten", "Wish", 10)
];

const templateData = (kind, rank) => ({
  system: { level: { value: 2 * rank - 1 }, price: { value: { gp: 10 * rank } } }
});
async function fromUuid(uuid) {
  const match = /Item\.(scroll|wand)-(\d+)$/.exec(uuid);
  if (!match) return null;
  const rank = Number(match[2]);
  return { toObject: () => templateData(match[1], rank) };
}
const spellConsumableTemplateUuid = (kind, rank) => {
  if (rank < 1 || rank > (kind === "wand" ? 9 : 10)) return null;
  return "Compendium.pf2e.equipment-srd.Item." + kind + "-" + rank;
};
const spellConsumableRankProblem = (spellData, kind, rank) => (rank < spellData.system.level.value ? "rank below base rank" : null);
const spellConsumableName = (kind, name, rank) => (kind === "wand" ? "Wand" : "Scroll") + " of " + name + " (Rank " + rank + ")";
const buildSpellConsumable = ({ kind, rank, templateData: template, spellData }) => ({
  name: spellConsumableName(kind, spellData.name, rank),
  type: "consumable",
  system: { category: kind, level: template.system.level, price: template.system.price, spell: spellData }
});
async function getScrollSpellCandidates(maxRank, keywords) {
  candidateCalls.push({ maxRank, keywords });
  return candidatePool ?? fullPool;
}
async function getCandidateDocument(candidate) {
  const found = fullPool.find((entry) => entry.id === candidate?.id);
  if (!found) return null;
  return { name: found.name, toObject: () => ({ name: found.name, system: { level: { value: found.rank }, traits: { value: found.traits, rarity: found.rarity } } }) };
}
async function selectSpellConsumables(brief, options) {
  aiCalls.push({ brief, options });
  return { picks: picksForCall, usage: { prompt: 5, completion: 5, total: 10, estimated: false } };
}

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
  MODULE_ID: "simplypf2e", SpfApp: MockSpfApp,
  AI_TASK: { MAGIC_ITEM_CONCEPT: "magic", RUNED_ITEM_CONCEPT: "runed", SPELL_CONSUMABLE_CONCEPT: "consumable" },
  taskMaxTokens: () => 100,
  RUNED_ITEM_KINDS: new Set(["weapon", "armor"]), MIN_ITEM_LEVEL: 0, MAX_ITEM_LEVEL: 20,
  getProviderRequestConfig: () => ({ provider: {}, connections: [] }),
  getProviderAuthWarningKey: () => null,
  getScrollSpellCandidates, getCandidateDocument, selectSpellConsumables,
  priceToGp: (value) => Number(value?.gp) || 0,
  RARITY_RANK: { common: 0, uncommon: 1, rare: 2, unique: 3 },
  spellConsumableTemplateUuid, spellConsumableRankProblem, buildSpellConsumable, spellConsumableName
};
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
    prompt: { value: "fire and healing scrolls" }, level: { value: "5" },
    rarity: { value: forgeRarity }, kind: { value: forgeKind }
  };
  instance.element = { querySelector: (selector) => controls[selector.match(/name="(\w+)"/)?.[1]] ?? null };
  return instance;
}

// 1. A scroll plan offers only real, eligible spells and writes nothing until Create.
picksForCall = [
  { spellId: "c-fire", name: "Fireball", rank: 4, kind: "scroll", candidate: fullPool[0] },
  { spellId: "c-heal", name: "Heal", rank: 0, kind: "scroll", candidate: fullPool[1] },
  { spellId: "c-heal", name: "Heal", rank: 2, kind: "scroll", candidate: fullPool[1] }
];
const scroll = forgeApp();
await actions.generate.call(scroll);
assert.equal(createCalls, 0, "generation writes nothing");
assert.equal(candidateCalls.at(-1).maxRank, 10, "scrolls may use spell ranks up to 10");
assert.deepEqual(plain(aiCalls.at(-1).options.candidates.map((candidate) => candidate.id)), ["c-fire", "c-heal", "c-ten"],
  "focus spells and spells rarer than the chosen rarity are never offered");
assert.equal(aiCalls.at(-1).options.kind, "scroll");
assert.equal(aiCalls.at(-1).options.count, 6, "the plan asks for at most six consumables");
let prepared = await scroll._prepareContext();
assert.equal(prepared.preview.consumable, true);
assert.deepEqual(plain(prepared.preview.items.map(({ name, rank, level, price }) => ({ name, rank, level, price }))), [
  { name: "Scroll of Fireball (Rank 4)", rank: 4, level: 7, price: "40 gp" },
  { name: "Scroll of Heal (Rank 2)", rank: 2, level: 3, price: "20 gp" }
], "each row carries the built name and the pinned template level and price");
assert.equal(prepared.preview.warnings.length, 1, "the rank-problem pick is reported, not built");
assert.ok(prepared.preview.warnings[0].includes("DroppedPick"));
assert.equal(prepared.hasPreview, true);

// Create writes the planned sources in one call, in plan order, then consumes the draft.
await actions.createItem.call(scroll);
assert.equal(createCalls, 1, "Create writes exactly once");
assert.deepEqual(plain(createdWith.map((source) => source.name)), ["Scroll of Fireball (Rank 4)", "Scroll of Heal (Rank 2)"]);
prepared = await scroll._prepareContext();
assert.equal(prepared.preview, null, "a committed plan is consumed");
assert.deepEqual(plain(prepared.created.names), ["Scroll of Fireball (Rank 4)", "Scroll of Heal (Rank 2)"], "the completion card names every created item");
await actions.createItem.call(scroll);
assert.equal(createCalls, 1, "a second Create does not write again");

// 2. A wand plan stops at rank 9 and refuses a rank-10 pick (no pinned template).
forgeKind = "wand";
picksForCall = [
  { spellId: "c-ten", name: "Wish", rank: 10, kind: "wand", candidate: fullPool[4] },
  { spellId: "c-fire", name: "Fireball", rank: 9, kind: "wand", candidate: fullPool[0] }
];
const wand = forgeApp();
await actions.generate.call(wand);
assert.equal(createCalls, 1, "generating a wand plan writes nothing");
assert.equal(candidateCalls.at(-1).maxRank, 9, "wands stop at spell rank 9");
prepared = await wand._prepareContext();
assert.deepEqual(plain(prepared.preview.items.map((item) => item.name)), ["Wand of Fireball (Rank 9)"]);
assert.ok(prepared.preview.warnings.some((text) => text.includes("TemplateMissing")), "a rank-10 wand has no template and is refused");

// 3. Nothing buildable is an error, never an empty completion card.
forgeKind = "scroll";
picksForCall = [{ spellId: "c-heal", name: "Heal", rank: 0, kind: "scroll", candidate: fullPool[1] }];
const unbuildable = forgeApp();
await actions.generate.call(unbuildable);
prepared = await unbuildable._prepareContext();
assert.equal(prepared.preview, null);
assert.ok(prepared.error.includes("NoPicks"), "a plan with nothing buildable reports an error");

// 4. No spell candidates means no provider request at all.
candidatePool = [];
const barren = forgeApp();
const callsBefore = aiCalls.length;
await actions.generate.call(barren);
assert.ok((await barren._prepareContext()).error.includes("NoCandidates"));
assert.equal(aiCalls.length, callsBefore, "no provider request without spell candidates");
candidatePool = null;

// 5. The kind tiles select scroll or wand, and unknown kinds keep the selection.
const picker = forgeApp();
await actions.selectKind.call(picker, null, { dataset: { kind: "wand" } });
prepared = await picker._prepareContext();
assert.equal(prepared.input.kind, "wand");
assert.deepEqual(plain(prepared.consumableKinds.map((kind) => kind.selected)), [false, true]);
assert.equal(prepared.promptLabel, "SIMPLYPF2E.ItemForge.Consumables.PromptLabel");
await actions.selectKind.call(picker, null, { dataset: { kind: "potion" } });
assert.equal((await picker._prepareContext()).input.kind, "wand", "unknown kinds keep the selection");

console.log("itemforge-app.consumables.test.mjs: scroll and wand plans, rank drops, deferred write and commit passed");
