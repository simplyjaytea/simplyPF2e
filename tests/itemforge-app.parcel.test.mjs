// Exercise real Forge parcel and loot transactions using isolated Foundry and AI stubs.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
if (!vm.SourceTextModule) {
  const run = spawnSync(process.execPath, ["--experimental-vm-modules", import.meta.filename], { stdio: "inherit" });
  process.exit(run.status ?? 1);
}
import { readFileSync } from "node:fs";
const R = new URL("../", import.meta.url).href;
const consumables = await import(R + "scripts/spell-consumables.mjs");
const { priceToGp, toItemData } = await import(R + "scripts/compendium.mjs");
const tables = await import(R + "scripts/treasure-tables.mjs");
const parcel = await import(R + "scripts/treasure-parcel.mjs");
const loot = await import(R + "scripts/loot-actor.mjs");
const post = await import(R + "scripts/post-create.mjs");
const text = await import(R + "scripts/text.mjs");
const source = readFileSync(new URL(R + "scripts/itemforge-app.mjs"), "utf8");
const fixture = (n) => JSON.parse(readFileSync(new URL(R + "tests/fixtures/consumables/" + n), "utf8"));
const plain = (v) => JSON.parse(JSON.stringify(v));
const RANK_1_SCROLL = fixture("scroll-of-1st-rank-spell.json");
const HEAL = fixture("heal.json");
const SCROLL_1 = consumables.SPELL_CONSUMABLE_TEMPLATES.scroll[1];
const COIN_NAMES = { pp: "Platinum Pieces", gp: "Gold Pieces", sp: "Silver Pieces", cp: "Copper Pieces" };
const coinDoc = (denomination) => ({ _id: loot.COIN_UUIDS[denomination].split(".").at(-1), name: COIN_NAMES[denomination], type: "treasure", img: "x.webp",
  system: { category: "coin", price: { value: { [denomination]: 1 } }, quantity: 1, rules: [] } });
const docs = new Map([
  [SCROLL_1, { uuid: SCROLL_1, toObject: () => plain(RANK_1_SCROLL) }],
  ...Object.keys(COIN_NAMES).map((d) => [loot.COIN_UUIDS[d], { uuid: loot.COIN_UUIDS[d], toObject: () => plain(coinDoc(d)) }])
]);
let coinAvailable = true; let emptyBuildError = false;
async function fromUuid(uuid) { if (emptyBuildError && uuid === SCROLL_1) throw new Error(""); if (Object.values(loot.COIN_UUIDS).includes(uuid) && !coinAvailable) return null; return docs.get(uuid) ?? null; }
const HEALC = { id: "c-heal", name: HEAL.name, rank: 1, traits: [], rarity: "common" };
async function getCandidateDocument(c) { return c?.id === "c-heal" ? { name: HEAL.name, uuid: "Compendium.pf2e.spells-srd.Item." + HEAL._id, toObject: () => plain(HEAL) } : null; }
const candCalls = []; async function getScrollSpellCandidates(maxRank) { candCalls.push(maxRank); return [HEALC]; }
let parcelPicks = []; let parcelDrops = []; const parcelCalls = [];
async function selectParcelSpells(brief, opts) { parcelCalls.push(opts); return { picks: parcelPicks, dropped: parcelDrops, usage: null }; }
async function selectSpellConsumables() { return { picks: [{ spellId: "c-heal", name: HEAL.name, rank: 1, kind: "scroll", candidate: HEALC }], usage: null }; }
let gate = true;
class MockSpfApp {
  _tokenUsage = []; _formatLastRunCost() { return null; } _buildTokenReport() { return null; }
  _recordTokens() {} get _canCancel() { return false; } async render() {}
  _beginProgress() { this.abort = new AbortController(); return this.abort.signal; }
  _throwIfCancelled() { if (this.abort?.signal.aborted) throw Object.assign(new Error("cancelled"), { cancelled: true }); }
  async _setStep() {} _progressCallback() { return () => {}; }
  _lockCreation() { this._throwIfCancelled(); } _finishRun(o) { this.outcome = o; }
}
const mocks = {
  ...consumables, ...tables, ...parcel, ...loot, ...post, ...text,
  experimentalToolsEnabled: () => gate,
  assertExperimentalToolAccess: () => { if (!gate) throw Object.assign(new Error("GATE-CLOSED"), { code: "disabled" }); },
  MODULE_ID: "simplypf2e", SpfApp: MockSpfApp,
  AI_TASK: { MAGIC_ITEM_CONCEPT: "m", RUNED_ITEM_CONCEPT: "r", SPELL_CONSUMABLE_CONCEPT: "c", TREASURE_PARCEL_SPELLS: "p" },
  taskMaxTokens: () => 100, RUNED_ITEM_KINDS: new Set(["weapon", "armor"]), MIN_ITEM_LEVEL: 1, MAX_ITEM_LEVEL: 24,
  getProviderRequestConfig: () => ({}), getProviderAuthWarningKey: () => null,
  getScrollSpellCandidates, getCandidateDocument, selectSpellConsumables, selectParcelSpells, toItemData, priceToGp,
  briefKeywords: () => []
};
let actorBehavior = "ok"; const createCalls = []; const deletes = []; const notices = [];
const context = vm.createContext({
  console: { log() {}, warn() {}, error() {} }, structuredClone,
  game: { i18n: { localize: (k) => k, format: (k, d) => k + ":" + JSON.stringify(d ?? {}) }, actors: { get: () => null } },
  ui: { notifications: { info() {}, warn(message) { notices.push(message); } } },
  Item: { create: async (s) => { createCalls.push({ item: s }); return s.map((x, i) => ({ id: "i" + i, name: x.name, sheet: { render: async () => {} } })); } },
  Actor: { create: async (data) => {
    createCalls.push({ actor: data });
    const items = actorBehavior.startsWith("dropItem") ? data.items.slice(1) : data.items;
    return { id: "a1", name: data.name, items: plain(items), sheet: { render: async () => { if (actorBehavior === "presentation") throw new Error("sheet failed"); } },
      delete: async () => { deletes.push(1); if (actorBehavior === "dropItem-stuck") throw new Error("nope"); } };
  } },
  fromUuid
});
const mod = new vm.SourceTextModule(source, { context });
await mod.link((spec) => {
  const names = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)].filter((m) => m[2] === spec).flatMap((m) => m[1].split(",").map((n) => n.trim()));
  return new vm.SyntheticModule(names, function () { for (const n of names) this.setExport(n, mocks[n] ?? (() => { throw new Error("Unexpected dependency: " + n); })); }, { context });
});
await mod.evaluate();
const App = mod.namespace.ItemForgeApp; const A = App.DEFAULT_OPTIONS.actions;
function app(controls) { const a = new App(); a.element = { querySelector: (s) => controls[s.match(/name="(\w+)"/)?.[1]] ?? null }; return a; }
const ctl = (o = {}) => ({ prompt: { value: "healing" }, level: { value: "1" }, rarity: { value: "common" }, partySize: { value: "4" }, containerName: { value: "" }, ...o });
const j = (v) => JSON.stringify(v);


const initialPicks = [{ slotId: "slot-1", spellId: "c-heal" }, { slotId: "slot-2", spellId: "c-heal" }, { slotId: "slot-3", spellId: "c-heal" }];
parcelPicks = initialPicks;
let c = ctl(); let a = app(c);
await A.selectKind.call(a, null, { dataset: { kind: "parcel" } });
await A.generate.call(a);
let ctx = await a._prepareContext();
assert.equal(ctx.preview.items[0].level, 1);
assert.equal(ctx.preview.items[0].itemLevels, "2, 2, 1");
assert.equal(ctx.preview.items[0].quantity, 3);
assert.equal(ctx.maxLevel, 20);
// Closed gate preserves this loot draft without writes.
gate = false; await A.createItem.call(a); ctx = await a._prepareContext();
assert.equal(createCalls.length, 0); assert.equal(ctx.error, "GATE-CLOSED"); assert.ok(ctx.hasPreview);
// Preserve a newly typed prompt when generation is refused.
c.prompt.value = "new typed prompt"; await A.generate.call(a); ctx = await a._prepareContext();
assert.equal(ctx.input.prompt, "new typed prompt"); assert.equal(ctx.error, "GATE-CLOSED");
// Verification failure rolls back, and failed rollback discards the draft.
gate = true; actorBehavior = "dropItem"; await A.createItem.call(a); ctx = await a._prepareContext();
assert.equal(deletes.length, 1); assert.ok(ctx.error.includes("Post-create verification failed")); assert.ok(ctx.hasPreview);
actorBehavior = "dropItem-stuck"; await A.createItem.call(a); ctx = await a._prepareContext();
assert.equal(deletes.length, 2); assert.ok(ctx.error.includes("still exists")); assert.equal(ctx.hasPreview, false);
// A successful transaction sends exactly the intended shape and literal quantities.
a = app(c); await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
actorBehavior = "ok"; await A.createItem.call(a); ctx = await a._prepareContext();
const payload = createCalls.at(-1).actor;
assert.deepEqual(Object.keys(payload).sort(), ["img", "items", "name", "system", "type"]);
assert.deepEqual(Object.keys(payload.system).sort(), ["details", "hiddenWhenEmpty", "lootSheetType"]);
assert.equal(payload.type, "loot");
assert.deepEqual(plain(payload.items.map((item) => ({ type: item.type, name: item.name, quantity: item.system.quantity, rules: item.system.rules }))), [
  { type: "consumable", name: "Scroll of Heal (Rank 1)", quantity: 3, rules: [] },
  { type: "treasure", name: "Platinum Pieces", quantity: 4, rules: [] }
]);
assert.equal(ctx.hasPreview, false); assert.equal(a.outcome, "success");
// Currency is whole pp, the remainder in gp; 40 gp is exactly 4 pp and no gp coin.
a = app(c); await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext(); assert.equal(ctx.preview.currency, "4 pp");
assert.ok(ctx.preview.warnings.length === 0);
// A level-5 four-PC parcel (320 gp) is 32 pp; a party of 5 (+80 gp) is 40 pp.
c.level.value = "5"; a = app(c); await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext(); assert.equal(ctx.preview.currency, "32 pp");
c.partySize.value = "5"; a = app(c); await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext(); assert.equal(ctx.preview.currency, "40 pp");
c.partySize.value = "4"; c.level.value = "1";
// A coin document that cannot load drops the whole currency: no partial coin, and a visible warning.
coinAvailable = false; a = app(c); await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext(); assert.equal(ctx.preview.currency, null);
assert.ok(ctx.preview.warnings.some((w) => w.includes("CurrencyDrop")));
coinAvailable = true;
// Presentation errors happen after commit and do not permit another create.
a = app(c); await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
actorBehavior = "presentation"; await A.createItem.call(a); ctx = await a._prepareContext();
assert.equal(a.outcome, "warning"); assert.equal(ctx.created.warning, true); assert.equal(ctx.hasPreview, false);
assert.ok(notices.includes("SIMPLYPF2E.ItemForge.CreatedPresentationFailed"));
// Existing loot draft refuses, but a fresh gate-off scroll plan writes Items.
gate = true; c = ctl({ level: { value: "5" }, destination: { value: "loot" } }); a = app(c);
await A.selectKind.call(a, null, { dataset: { kind: "scroll" } }); await A.generate.call(a);
gate = false; delete c.destination; let before = createCalls.length;
await A.createItem.call(a); ctx = await a._prepareContext();
assert.equal(createCalls.length, before); assert.equal(ctx.error, "GATE-CLOSED"); assert.ok(ctx.hasPreview);
await A.generate.call(a); ctx = await a._prepareContext(); assert.equal(ctx.preview.destination, null);
await A.createItem.call(a); assert.equal(createCalls.length, before + 1); assert.ok(createCalls.at(-1).item);
// An empty build exception cannot produce a source-less planned item.
emptyBuildError = true; a = app(ctl({ level: { value: "5" } }));
await A.selectKind.call(a, null, { dataset: { kind: "scroll" } }); before = createCalls.length;
await A.generate.call(a); ctx = await a._prepareContext();
assert.equal(ctx.hasPreview, false); assert.ok(ctx.error.includes("build failed"));
await A.createItem.call(a); assert.equal(createCalls.length, before); emptyBuildError = false;
// Raw out-of-range level is rejected before a provider call, while form controls clamp.
gate = true; c = ctl({ level: { value: "21" }, partySize: { value: "" } }); a = app(c);
await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); const aiBefore = parcelCalls.length;
await A.generate.call(a); ctx = await a._prepareContext();
assert.equal(ctx.error, "SIMPLYPF2E.ItemForge.Parcel.LevelRange"); assert.equal(parcelCalls.length, aiBefore);
assert.equal(ctx.input.level, 20); assert.equal(ctx.input.partySize, 4);
c.partySize.value = "6"; a._preserveForm(); c.partySize.value = ""; a._preserveForm();
assert.equal((await a._prepareContext()).input.partySize, 6);
c.partySize.value = "invalid"; a._preserveForm(); assert.equal((await a._prepareContext()).input.partySize, 6);
c.level.value = "20"; await A.levelUp.call(a); assert.equal(c.level.value, 20);
// Extra-party preview explicitly selects the four-PC comparison.
c = ctl({ partySize: { value: "5" } }); a = app(c);
await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext(); assert.equal(ctx.preview.extraPcs, 1);
const template = readFileSync(new URL("../templates/itemforge.hbs", import.meta.url), "utf8");
assert.match(template, /#if preview.extraPcs}}{{localize "SIMPLYPF2E.ItemForge.Parcel.ValueExtra"/);
const lang = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
assert.equal(lang.SIMPLYPF2E.ItemForge.Parcel.ValueExtra, "Built {value} gp of four-PC table total {total} gp.");
assert.match(template, /Parcel.SlotLevels/);
assert.match(template, /<td>{{this.level}}<\/td><td>{{this.itemLevels}}/);
// Unknown ids the AI wrote reach the preview as data. The template prints each warning with {{this}} (escaped).
parcelDrops = [
  { reason: "unknown-slot", slotId: "slot-9" },
  { reason: "unknown-spell", spellId: "<img src=x onerror=alert(1)>" },
  { reason: "unknown-spell", spellId: "Fireball" }
];
c = ctl(); a = app(c);
await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext();
assert.equal(ctx.preview.warnings.length, 3, "one preview line per dropped AI pick");
assert.ok(ctx.preview.warnings[0].includes("UnknownSlot") && ctx.preview.warnings[0].includes("slot-9"));
assert.ok(ctx.preview.warnings[1].includes("UnknownSpell") && ctx.preview.warnings[1].includes("<img src=x onerror=alert(1)>"),
  "the raw AI string is passed through, escaped only at render time");
assert.ok(ctx.preview.warnings[2].includes("Fireball"));
assert.equal(ctx.preview.items[0].quantity, 3, "the parcel is still built from the valid picks");
assert.match(template, /{{#each preview.warnings}}<p class="notification warning">{{this}}<\/p>{{\/each}}/, "parcel warnings render through escaping {{this}}");
parcelDrops = [];
// Merchant is opt-in: the Forge sends the chosen sheet to the loot actor, and the default stays Loot.
gate = true; actorBehavior = "ok";
c = ctl({ lootSheetType: { value: "Merchant" } }); a = app(c);
await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
await A.createItem.call(a); ctx = await a._prepareContext();
assert.equal(createCalls.at(-1).actor.system.lootSheetType, "Merchant");
assert.equal(a.outcome, "success");
c = ctl(); a = app(c);
await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
await A.createItem.call(a);
assert.equal(createCalls.at(-1).actor.system.lootSheetType, "Loot", "no sheet control means the Loot default");
// With the gate closed no Merchant sheet is ever written: creation is refused before any payload is built.
gate = true; c = ctl({ lootSheetType: { value: "Merchant" } }); a = app(c);
await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
gate = false; const beforeMerchant = createCalls.length;
await A.createItem.call(a); ctx = await a._prepareContext();
assert.equal(createCalls.length, beforeMerchant); assert.equal(ctx.error, "GATE-CLOSED");
gate = true;
assert.match(template, /name="lootSheetType"/);
assert.ok(lang.SIMPLYPF2E.ItemForge.Loot.SheetMerchant === "Merchant" && lang.SIMPLYPF2E.ItemForge.Loot.Sheet === "Actor sheet");
