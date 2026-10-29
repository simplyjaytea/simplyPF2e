// The Forge preview shows every property rune the module dropped, with the reason, in the GM's own words
// (en.json, placeholders filled as Foundry does). Drops never block Create. The app, the real
// normalizeRunedItemConcept and the real lang file run; the AI call, the candidate lookups and the document
// build are stubbed. Each case goes through generate and _prepareContext, as the GM sees it.
// Run: node tests/itemforge-app.runedDrops.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import { issueCandidate } from "../scripts/compendium.mjs";
import { normalizeRunedItemConcept, SECONDARY_ADJECTIVE, RUNED_ITEM_KINDS } from "../scripts/item-builder.mjs";

if (!vm.SourceTextModule) {
  const run = spawnSync(process.execPath, ["--experimental-vm-modules", import.meta.filename], { stdio: "inherit" });
  process.exit(run.status ?? 1);
}
const source = readFileSync(new URL("../scripts/itemforge-app.mjs", import.meta.url), "utf8");
const template = readFileSync(new URL("../templates/itemforge.hbs", import.meta.url), "utf8");
const lang = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
const lookup = (key) => key.split(".").reduce((node, part) => node?.[part], lang) ?? key;
// Foundry's localize and format: the English text with {placeholders} filled from the data.
const format = (key, data = {}) => String(lookup(key)).replace(/\{(\w+)\}/g, (_, name) => String(data[name] ?? `{${name}}`));

const candidate = (id, name, fields = {}) => issueCandidate({ packId: "test.runes", _id: id }, { name, ...fields });
const BASES = {
  plate: candidate("full-plate", "Full Plate", { level: 2, category: "heavy" }),
  leather: candidate("leather", "Leather Armor", { level: 0, category: "light" })
};
const POTENCY = [1, 2, 3].map((tier) => candidate(`potency-${tier}`, `Armor Potency (+${tier})`, { tier }));
const RUNES = {
  acid: candidate("acid-resistant", "Acid-Resistant", { level: 8, usage: "etched-onto-armor" }),
  fire: candidate("fire", "Fire", { level: 8, usage: "etched-onto-armor" }),
  invisibility: candidate("invisibility", "Invisibility", { level: 8, usage: "etched-onto-light-armor" }),
  heavyOnly: candidate("heavy-only", "Heavy Only", { level: 8, usage: "etched-onto-heavy-armor" }),
  flaming: candidate("flaming", "Flaming", { level: 8, usage: "etched-onto-armor" }),
  flamingGreater: candidate("flaming-greater", "Flaming (Greater)", { level: 15, usage: "etched-onto-armor" })
};
const CANDIDATES = {
  baseCandidates: Object.values(BASES),
  runeCandidates: Object.values(RUNES),
  potencyCandidates: POTENCY,
  secondaryCandidates: []
};

// The AI's answer for the current case, as the candidate ids it may pick.
let raw = null;
let createCalls = 0;
let created = null;
class MockSpfApp {
  _tokenUsage = [];
  _progress = null;
  _formatLastRunCost() { return null; }
  _buildTokenReport() { return null; }
  _recordTokens() {}
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
const context = vm.createContext({
  console: { log() {}, warn() {}, error() {} },
  game: { i18n: { localize: lookup, format } },
  ui: { notifications: { info() {}, warn() {} } },
  Item: { create: async (data) => {
    createCalls++;
    created = data;
    return { id: "item-0", name: data.name, sheet: { render: async () => {} } };
  } }
});
const mocks = {
  experimentalToolsEnabled: () => false, assertExperimentalToolAccess() {},
  MODULE_ID: "simplypf2e", SpfApp: MockSpfApp,
  AI_TASK: { MAGIC_ITEM_CONCEPT: "magic", RUNED_ITEM_CONCEPT: "runed" }, taskMaxTokens: () => 100,
  RUNED_ITEM_KINDS, SECONDARY_ADJECTIVE, normalizeRunedItemConcept,
  MIN_ITEM_LEVEL: 0, MAX_ITEM_LEVEL: 24,
  getProviderRequestConfig: () => ({ provider: {}, connections: [] }), getProviderAuthWarningKey: () => null,
  getBaseItemCandidates: async () => CANDIDATES.baseCandidates,
  getPropertyRuneCandidates: async () => CANDIDATES.runeCandidates,
  getFundamentalRuneTiers: async () => ({
    potencyTiers: [1, 2, 3], secondaryTiers: [], minPotencyLevel: 5,
    potencyCandidates: CANDIDATES.potencyCandidates, secondaryCandidates: CANDIDATES.secondaryCandidates
  }),
  generateRunedItemConcept: async () => ({ usage: { total: 1 }, concept: raw }),
  // The document build is stubbed: the preview reads its level, rarity, price and runes.
  buildRunedItem: async (concept) => ({
    itemData: { name: `+${concept.potency} ${concept.baseItemName}`, type: "armor",
      system: { traits: { value: [] }, runes: { potency: concept.potency, resilient: 0, property: [] } } },
    preview: { level: 4, rarity: "common", priceGp: 100 }
  })
};
const appModule = new vm.SourceTextModule(source, { context });
await appModule.link((specifier) => {
  const imports = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)]
    .filter((match) => match[2] === specifier).flatMap((match) => match[1].split(",").map((name) => name.trim()));
  return new vm.SyntheticModule(imports, function () {
    for (const name of imports) this.setExport(name, mocks[name] ?? (() => { throw new Error(`Unexpected dependency: ${name}`); }));
  }, { context });
});
await appModule.evaluate();
const App = appModule.namespace.ItemForgeApp;
const actions = App.DEFAULT_OPTIONS.actions;

// Console warnings from the real normalizer, kept per run so the tests can check them too.
let consoleWarnings = [];
// One runed run: the GM picks the kind and generates; the context is what the preview renders.
async function preview({ base, potency, propertyRuneIds, secondaryRuneId = "none" }) {
  const realWarn = console.warn;
  console.warn = (...args) => consoleWarnings.push(args.join(" "));
  consoleWarnings = [];
  try {
    return await runPreview({ base, potency, propertyRuneIds, secondaryRuneId });
  } finally {
    console.warn = realWarn;
  }
}
async function runPreview({ base, potency, propertyRuneIds, secondaryRuneId }) {
  raw = {
    baseItemId: base.id, potencyRuneId: POTENCY[potency - 1].id, secondaryRuneId,
    propertyRuneIds: propertyRuneIds.map((rune) => rune.id), description: ""
  };
  const form = { prompt: { value: "a runed piece" }, level: { value: "8" }, rarity: { value: "common" }, destination: { value: "items" } };
  const app = new App();
  app.element = { querySelector: (selector) => form[selector.match(/name="(\w+)"/)?.[1]] ?? null };
  await actions.selectKind.call(app, null, { dataset: { kind: "armor" } });
  await actions.generate.call(app);
  assert.equal(app.context?.error ?? null, null, "the runed run completes");
  return { app, context: await app._prepareContext() };
}

// Overflow: potency +1 holds one property rune, and the second pick is dropped with the slot reason.
{
  const { context } = await preview({ base: BASES.plate, potency: 1, propertyRuneIds: [RUNES.acid, RUNES.fire] });
  assert.deepEqual(context.preview.droppedRunes,
    ["Fire was not kept: a potency +1 rune leaves 1 property-rune slot(s) for this item."],
    "the preview says which rune was not kept, and why");
  assert.ok(consoleWarnings.some((line) => /dropped property rune "Fire"/.test(line)), "the console warning is still written");
  assert.deepEqual(context.preview.propertyRunes, ["Acid-Resistant"], "the kept rune is listed as before");
}

// Family: Flaming and Flaming (Greater) share a family, so the lesser grade is dropped and the greater is kept.
{
  const { context } = await preview({ base: BASES.plate, potency: 1, propertyRuneIds: [RUNES.flaming, RUNES.flamingGreater] });
  assert.deepEqual(context.preview.droppedRunes,
    ["Flaming was not kept: only the greater, major or true grade of its rune family is kept."],
    "the preview says the lesser grade was dropped for its family");
  assert.deepEqual(context.preview.propertyRunes, ["Flaming (Greater)"]);
}

// Duplicate: the same rune picked twice is kept once, and the preview says so.
{
  const { context } = await preview({ base: BASES.plate, potency: 2, propertyRuneIds: [RUNES.acid, RUNES.acid] });
  assert.deepEqual(context.preview.droppedRunes, ["Acid-Resistant was picked more than once; it is kept once."]);
  assert.deepEqual(context.preview.propertyRunes, ["Acid-Resistant"]);
}

// Category: a heavy-only rune on a light base is dropped with the base category named.
{
  const { context } = await preview({ base: BASES.leather, potency: 2, propertyRuneIds: [RUNES.heavyOnly, RUNES.acid] });
  assert.deepEqual(context.preview.droppedRunes,
    ["Heavy Only was not kept: it cannot be etched onto this light base."]);
  assert.deepEqual(context.preview.propertyRunes, ["Acid-Resistant"]);
}

// A valid item shows no dropped-rune line, and Create still writes it.
{
  const { app, context } = await preview({ base: BASES.plate, potency: 2, propertyRuneIds: [RUNES.acid, RUNES.fire] });
  assert.deepEqual(context.preview.droppedRunes, [], "a valid item has no dropped-rune line");
  assert.deepEqual(context.preview.propertyRunes, ["Acid-Resistant", "Fire"]);
  await actions.createItem.call(app);
  assert.equal(createCalls, 1, "Create writes the item");
  assert.equal(created?.name, "+2 Full Plate", "the created item is the previewed one");
}

// A drop never blocks Create: the overflow run still creates, with the kept runes only.
{
  createCalls = 0;
  const { app, context } = await preview({ base: BASES.plate, potency: 1, propertyRuneIds: [RUNES.acid, RUNES.fire] });
  assert.equal(context.preview.droppedRunes.length, 1, "the drop is shown");
  await actions.createItem.call(app);
  assert.equal(createCalls, 1, "Create is not blocked by a dropped rune");
}

// The preview wiring: the lines are rendered with the escaping Handlebars applies to {{this}}, and only there.
{
  const block = template.match(/\{\{#each preview\.droppedRunes\}\}([\s\S]*?)\{\{\/each\}\}/);
  assert.ok(block, "the runed preview renders the dropped-rune lines");
  assert.match(block[1], /\{\{this\}\}/, "the lines use the escaped {{this}} form");
  assert.doesNotMatch(block[1], /\{\{\{/, "no unescaped output for rune names");
  assert.ok(template.indexOf("droppedRunes") > template.indexOf("{{#if preview.runed}}"), "the lines sit in the runed section");
}
assert.ok(source.includes("droppedRunes: droppedRuneLines("), "the preview context carries the dropped runes");

console.log("itemforge-app.runedDrops.test.mjs: the preview shows each dropped rune with its reason; a drop never blocks Create");
