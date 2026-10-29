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
const permanent = await import(R + "scripts/treasure-permanent.mjs");
const runed = await import(R + "scripts/parcel-runed.mjs");
const folderModule = await import(R + "scripts/parcel-folder.mjs");
const runes = await import(R + "scripts/runes.mjs");
const post = await import(R + "scripts/post-create.mjs");
const text = await import(R + "scripts/text.mjs");
const source = readFileSync(new URL(R + "scripts/itemforge-app.mjs"), "utf8");
const fixture = (n) => JSON.parse(readFileSync(new URL(R + "tests/fixtures/consumables/" + n), "utf8"));
const plain = (v) => JSON.parse(JSON.stringify(v));
const RANK_1_SCROLL = fixture("scroll-of-1st-rank-spell.json");
const HEAL = fixture("heal.json");
const SCROLL_1 = consumables.SPELL_CONSUMABLE_TEMPLATES.scroll[1];
const WAND_1_UUID = consumables.SPELL_CONSUMABLE_TEMPLATES.wand[1];
const parcelFixture = (n) => JSON.parse(readFileSync(new URL(R + "tests/fixtures/parcel/" + n + ".json"), "utf8"));
const WAND_1 = parcelFixture("magic-wand-1st-rank-spell");
const HEARING = parcelFixture("magical-hearing-aid");
const SILK = parcelFixture("silk-ceremonial-armor");
const AGATE = parcelFixture("agate");
const MERCY = parcelFixture("wand-of-mercy-1st-rank");
const v3Fixture = (n) => JSON.parse(readFileSync(new URL(R + "tests/fixtures/parcel-v3/" + n + ".json"), "utf8"));
const RUNED_BASE = v3Fixture("longsword");
const COIN_NAMES = { pp: "Platinum Pieces", gp: "Gold Pieces", sp: "Silver Pieces", cp: "Copper Pieces" };
const coinDoc = (denomination) => ({ _id: loot.COIN_UUIDS[denomination].split(".").at(-1), name: COIN_NAMES[denomination], type: "treasure", img: "x.webp",
  system: { category: "coin", price: { value: { [denomination]: 1 } }, quantity: 1, rules: [] } });
const docs = new Map([
  [SCROLL_1, { uuid: SCROLL_1, toObject: () => plain(RANK_1_SCROLL) }],
  [WAND_1_UUID, { uuid: WAND_1_UUID, toObject: () => plain(WAND_1) }],
  ...Object.keys(COIN_NAMES).map((d) => [loot.COIN_UUIDS[d], { uuid: loot.COIN_UUIDS[d], toObject: () => plain(coinDoc(d)) }])
]);
let coinAvailable = true; let emptyBuildError = false;
async function fromUuid(uuid) { if (emptyBuildError && uuid === SCROLL_1) throw new Error(""); if (Object.values(loot.COIN_UUIDS).includes(uuid) && !coinAvailable) return null; return docs.get(uuid) ?? null; }
const HEALC = { id: "c-heal", name: HEAL.name, rank: 1, traits: [], rarity: "common" };
// Failure modes for the read and provider paths: an error object is thrown on the next call.
const CLOAK = parcelFixture("aerial-cloak");
let lastCloakSource = null; let lastHearingSource = null; let lastRunedSource = null; let candidateReadError = null; let valuableReadError = null; let parcelMode = "ok";
async function getCandidateDocument(c) {
  if (c?.id === "c-heal") return { name: HEAL.name, uuid: "Compendium.pf2e.spells-srd.Item." + HEAL._id, toObject: () => plain(HEAL) };
  if (c?.id === "c-runedbase") return { name: RUNED_BASE.name, uuid: "Compendium.pf2e.equipment-srd.Item." + RUNED_BASE._id, toObject: () => plain(RUNED_BASE) };
  if (c?.id === "c-mercy") return { name: MERCY.name, uuid: "Compendium.pf2e.equipment-srd.Item." + MERCY._id, toObject: () => plain(MERCY) };
  if (c?.id === "c-cloak") {
    // Rule-bearing (Rule Elements in the real document): the built source is this object, so a test can change it after Generate.
    lastCloakSource = plain(CLOAK);
    return { name: CLOAK.name, uuid: "Compendium.pf2e.equipment-srd.Item." + CLOAK._id, toObject: () => lastCloakSource };
  }
  if (c?.id === "c-cloak2") {
    // A second rule-bearing item (same published cloak under another name) so a parcel can hold two folder items.
    const second = plain(CLOAK); second.name = "Aerial Cloak II";
    return { name: second.name, uuid: "Compendium.pf2e.equipment-srd.Item." + CLOAK._id + "b", toObject: () => second };
  }
  if (c?.id === "c-hearing" && candidateReadError) throw candidateReadError;
  if (c?.id === "c-hearing") {
    // The built source is this object, so a test can change it between Generate and Create.
    const src = plain(HEARING);
    lastHearingSource = src;
    return { name: HEARING.name, uuid: "Compendium.pf2e.equipment-srd.Item." + HEARING._id, toObject: () => src };
  }
  return null;
}
// Permanent slot pools by item level, the AI's picks, and the valuable pool, all controlled per test.
const permanentPools = new Map(); const permanentCalls = []; let permanentPicks = []; let permanentMode = "ok";
const valuablePool = { available: true, candidates: [] };
// A rule-bearing candidate is offered only when the world-folder option asks for it, as the real pool does.
const permanentCandidateCalls = [];
async function getPermanentEquipmentCandidates(level, _keywords, options = {}) {
  permanentCandidateCalls.push({ level, allowRules: options.allowRules === true });
  return (permanentPools.get(level)?.equipment ?? []).filter((candidate) => !candidate.rules || options.allowRules === true);
}
async function getSpecialWandCandidates(level) { return permanentPools.get(level)?.special ?? []; }
// The runed pool is offered in one call across the levels; a test sets it directly.
let runedPool = [];
async function getRunedCandidates() { return runedPool; }
async function getParcelWandCandidates(level) { return permanentPools.get(level)?.wands ?? []; }
async function getValuableCandidates() { return valuablePool; }
async function pickParcelValuables(ranked, budgetCopper) {
  if (valuableReadError) throw valuableReadError;
  const picked = []; const skipped = []; let remaining = budgetCopper;
  for (const entry of ranked) {
    if (picked.length >= 3) break;
    if (entry.copper > remaining) { skipped.push({ name: entry.name, reason: "too-expensive" }); continue; }
    const raw = entry.id === "c-silk" ? SILK : entry.id === "c-agate" ? AGATE : null;
    if (!raw) { skipped.push({ name: entry.name, reason: "unavailable" }); continue; }
    picked.push({ candidate: entry, copper: entry.copper, source: { name: raw.name, type: "treasure", img: "x.webp", system: { category: raw.system.category, price: { value: raw.system.price.value }, quantity: 1, rules: [] } } });
    remaining -= entry.copper;
  }
  return { picked, skipped, remaining };
}
async function selectParcelPermanents(brief, opts) {
  permanentCalls.push(opts);
  if (permanentMode === "fail") throw new Error("provider unavailable");
  return { picks: permanentPicks, dropped: [], usage: null };
}
const candCalls = []; async function getScrollSpellCandidates(maxRank) { candCalls.push(maxRank); return [HEALC]; }
let parcelPicks = []; let parcelDrops = []; const parcelCalls = [];
async function selectParcelSpells(brief, opts) {
  parcelCalls.push(opts);
  if (parcelMode === "fail") throw new Error("provider unavailable");
  if (parcelMode === "abort") throw Object.assign(new Error("aborted"), { name: "AbortError" });
  return { picks: parcelPicks, dropped: parcelDrops, usage: null }; }
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
  ...consumables, ...tables, ...parcel, ...permanent, ...runed, ...loot, ...post, ...text, ...folderModule, applyRunes: runes.applyRunes,
  // Keeps the built runed source, so a test can change the stored draft after Generate (the real stale-draft case).
  runedSourceFrom: (...args) => { lastRunedSource = runed.runedSourceFrom(...args); return lastRunedSource; },
  experimentalToolsEnabled: () => gate,
  assertExperimentalToolAccess: () => { if (!gate) throw Object.assign(new Error("GATE-CLOSED"), { code: "disabled" }); },
  MODULE_ID: "simplypf2e", SpfApp: MockSpfApp,
  AI_TASK: { MAGIC_ITEM_CONCEPT: "m", RUNED_ITEM_CONCEPT: "r", SPELL_CONSUMABLE_CONCEPT: "c", TREASURE_PARCEL_SPELLS: "p" },
  taskMaxTokens: () => 100, RUNED_ITEM_KINDS: new Set(["weapon", "armor"]), MIN_ITEM_LEVEL: 1, MAX_ITEM_LEVEL: 24,
  getProviderRequestConfig: () => ({}), getProviderAuthWarningKey: () => null,
  getScrollSpellCandidates, getCandidateDocument, selectSpellConsumables, selectParcelSpells, toItemData, priceToGp,
  getPermanentEquipmentCandidates, getParcelWandCandidates, getSpecialWandCandidates, getValuableCandidates, pickParcelValuables, selectParcelPermanents,
  getRunedCandidates,
  briefKeywords: () => []
};
let actorBehavior = "ok"; const createCalls = []; const deletes = []; const notices = [];
let worldIds = 0; let itemWrites = 0; const worldItemsWritten = [];
let itemBehavior = "ok"; let folderBehavior = "ok"; const itemDeletes = []; const folderCreates = []; const folderDeletes = [];
const context = vm.createContext({
  console: { log() {}, warn() {}, error() {} }, structuredClone,
  game: { i18n: {
    localize: (k) => ({ "SIMPLYPF2E.Generator.Survivor.Label.LootActor": "loot actor" })[k] ?? k,
    // The survivor sentence reads as English, as the GM sees it; other keys keep the key-and-data form.
    format: (k, d) => (k === "SIMPLYPF2E.Generator.Survivor.Actor"
      ? `${d.label} "${d.name}" still exists. The draft was discarded to prevent a duplicate; remove it manually before trying again.`
      : k + ":" + JSON.stringify(d ?? {}))
  }, actors: { get: () => null } },
  ui: { notifications: { info() {}, warn(message) { notices.push(message); } } },
  Item: { create: async (s) => {
    createCalls.push({ item: s });
    if (itemBehavior === "fail") throw new Error("item create refused");
    // "partial": the world keeps what it wrote before the call failed, as Foundry does for a batch that dies midway
    // ("partial") or for a create that writes the item and then throws ("writeThenThrow"); those items are never returned.
    const makeDoc = (x, i) => {
      const name = itemBehavior === "rename" ? x.name + " (renamed)" : x.name;
      // The persisted copy: a stored modifier or source identity can differ from what was sent (CR HIGH #2).
      const system = plain(x.system);
      if (itemBehavior === "alter") system.rules[0].value = 99;
      const _stats = plain(x._stats ?? {});
      if (itemBehavior === "identity") _stats.compendiumSource = "Compendium.other.Item.x";
      const doc = { id: "i" + (++worldIds), name, folder: x.folder ?? null, system, _stats, sheet: { render: async () => {} },
        delete: async () => { if (itemBehavior === "deleteFail") throw new Error("item delete refused"); doc.deleted = true; itemDeletes.push(name); } };
      return doc;
    };
    const docs = [];
    for (const [i, x] of s.entries()) {
      if (itemBehavior === "partial" && itemWrites >= 1) throw new Error("batch failed midway");
      const doc = makeDoc(x, i);
      itemWrites += 1; worldItemsWritten.push(doc);
      if (itemBehavior === "writeThenThrow" && itemWrites === 2) throw new Error("create threw after writing");
      docs.push(doc);
    }
    return docs;
  } },
  Folder: { create: async (data) => { folderCreates.push(data); return { id: "f1", name: data.name,
    get contents() { return worldItemsWritten.filter((item) => !item.deleted && item.folder === "f1"); },
    delete: async () => {
    folderDeletes.push(data.name); if (folderBehavior === "stuck") throw new Error("nope"); } }; } },
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
  { type: "treasure", name: "Gold Pieces", quantity: 40, rules: [] }
]);
assert.equal(ctx.hasPreview, false); assert.equal(a.outcome, "success");
// Under the 100 gp threshold the currency stays gold: 40 gp is 40 gp, with no pp.
a = app(c); await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext(); assert.equal(ctx.preview.currency, "40 gp");
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

// Permanent slots (part 2): a published item fills its level's slot; the others stay listed with a reason.
const HEARING_CANDIDATE = { id: "c-hearing", name: "Magical Hearing Aid", level: 1, kind: "equipment", traits: ["magical"], rarity: "common" };
gate = true; actorBehavior = "ok"; parcelPicks = initialPicks; permanentMode = "ok"; permanentCalls.length = 0;
permanentPools.clear(); permanentPools.set(1, { equipment: [HEARING_CANDIDATE], wands: [] });
permanentPicks = [{ slotId: "perm-3", candidateId: "c-hearing" }];
c = ctl(); a = app(c);
await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext();
assert.equal(permanentCalls.length, 1, "one AI call for the permanent slots");
assert.deepEqual(permanentCalls[0].slots.map((slot) => slot.allowedLevels), [[2], [2], [1], [1]], "table slots at four PCs");
assert.equal(ctx.preview.permanents.length, 4, "every permanent slot is listed");
assert.equal(ctx.preview.permanents[2].filled, true);
assert.equal(ctx.preview.permanents[2].name, "Magical Hearing Aid");
assert.equal(ctx.preview.permanents[2].itemLevel, 1, "the filled item reports its actual level");
assert.equal(ctx.preview.permanents[0].reason, "SIMPLYPF2E.ItemForge.Parcel.Reason.no-candidates", "a level with no pool says why");
assert.equal(ctx.preview.permanents[3].reason, "SIMPLYPF2E.ItemForge.Parcel.Reason.no-pick", "an omitted slot with a pool says why");
assert.ok(ctx.preview.permanentSummary.includes('"built":1') && ctx.preview.permanentSummary.includes('"total":4'), "summary counts built and total");
await A.createItem.call(a); ctx = await a._prepareContext();
let created = createCalls.at(-1).actor;
assert.ok(created.items.some((item) => item.type === "equipment" && item.name === "Magical Hearing Aid" && item.system.rules.length === 0),
  "the built item is written as a physical item with no Rule Elements");
assert.ok(created.system.details.description.includes("PermanentUnfilled"), "unfilled permanent slots are described on the actor");
assert.equal(a.outcome, "success");

// An invalid pick (not offered) leaves its slot unfilled with that reason, and the scrolls still build.
permanentPicks = [{ slotId: "perm-3", candidateId: "c-invented" }];
a = app(c); await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext();
assert.equal(ctx.preview.permanents[2].reason, "SIMPLYPF2E.ItemForge.Parcel.Reason.invalid-pick");
assert.ok(ctx.preview.items.length > 0, "a permanent failure never discards the scroll plan");

// A provider failure leaves every permanent slot unfilled without failing the parcel.
permanentMode = "fail";
a = app(c); await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext();
assert.equal(ctx.error, null, "the parcel still generates");
assert.equal(ctx.preview.permanents[2].reason, "SIMPLYPF2E.ItemForge.Parcel.Reason.provider", "a provider failure is reported per slot");
assert.equal(ctx.preview.permanents[0].reason, "SIMPLYPF2E.ItemForge.Parcel.Reason.no-candidates", "slots with no pool keep their own reason");
assert.ok(ctx.preview.items.length > 0, "the scrolls survive a permanent provider failure");
permanentMode = "ok";

// Generic wands: a level-3 slot takes a rank-1 wand, built through the pinned template (item level 3).
permanentPools.clear();
permanentPools.set(3, { equipment: [], wands: [{ id: "w-c-heal", name: "Wand of Heal (Rank 1)", level: 3, rank: 1, kind: "wand", traits: [], spell: HEALC }] });
permanentPicks = [{ slotId: "perm-1", candidateId: "w-c-heal" }];
parcelPicks = [];
c = ctl({ level: { value: "2" } }); a = app(c);
await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext();
assert.equal(ctx.preview.permanents[0].filled, true, "the wand fills its level-3 slot");
assert.equal(ctx.preview.permanents[0].name, "Wand of Heal (Rank 1)");
assert.equal(ctx.preview.permanents[0].itemLevel, 3, "a rank-1 wand is item level 3");
await A.createItem.call(a);
created = createCalls.at(-1).actor;
const wand = created.items.find((item) => item.name === "Wand of Heal (Rank 1)");
assert.ok(wand, "the wand is written to the loot actor");
assert.equal(wand.type, "consumable"); assert.equal(wand.system.category, "wand"); assert.equal(wand.system.level.value, 3);
assert.equal(wand.system.rules.length, 0);
permanentPools.clear();
permanentPicks = [];
parcelPicks = initialPicks;

// Gems and art replace part of the currency: 40 gp with a 10 gp art object leaves 30 gp of coins, 40 gp in all.
const SILK_CANDIDATE = { id: "c-silk", name: "Silk ceremonial armor", copper: 1000, packId: "pf2e.equipment-srd", _id: SILK._id };
valuablePool.candidates = [{ id: "c-agate", name: "Agate", copper: 50, packId: "pf2e.equipment-srd", _id: AGATE._id }, SILK_CANDIDATE];
parcelPicks = []; permanentPicks = [];
// The pool arrives in rankByBrief order (by name with no keywords): Agate before Silk.
valuablePool.candidates = [{ id: "c-agate", name: "Agate", copper: 50, packId: "pf2e.equipment-srd", _id: AGATE._id }, SILK_CANDIDATE];
c = ctl({ valuables: { checked: true } }); a = app(c);
await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext();
// Spec example: 40 gp with a 5 sp agate and a 10 gp art object leaves 29 gp 5 sp of coins; the built total is 40 gp.
assert.deepEqual(ctx.preview.valuables.map((v) => v.name), ["Agate", "Silk ceremonial armor"], "both fit, in the brief's deterministic order");
assert.equal(ctx.preview.valuables[1].price, "10 gp");
assert.equal(ctx.preview.valuableSubtotal, "10.5", "the valuables subtotal is their exact sum, 10.5 gp");
assert.equal(ctx.preview.currency, "29 gp, 5 sp", "the coins are the exact remainder");
assert.equal(ctx.preview.valueGp, 40, "built value counts each valuable and the coins once each");
await A.createItem.call(a);
created = createCalls.at(-1).actor;
assert.deepEqual(created.items.map((item) => [item.type, item.name, item.system.quantity]), [
  ["treasure", "Agate", 1], ["treasure", "Silk ceremonial armor", 1], ["treasure", "Gold Pieces", 29], ["treasure", "Silver Pieces", 5]
], "each valuable is one item and the remainder is gold and silver coins");

// Exact equality: a valuable worth the whole currency leaves no coins at all.
valuablePool.candidates = [{ ...SILK_CANDIDATE, copper: 4000 }];
a = app(c); await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext();
assert.equal(ctx.preview.valuables[0].name, "Silk ceremonial armor");
assert.equal(ctx.preview.currency, "", "no coins remain");
assert.equal(ctx.preview.valueGp, 40, "exact equality keeps the built value at the currency total");

// A valuable that costs more than the currency is not added, and the preview says why.
valuablePool.candidates = [{ ...SILK_CANDIDATE, copper: 5000 }];
a = app(c); await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext();
assert.equal(ctx.preview.valuables.length, 0);
assert.ok(ctx.preview.valuableNote.includes("ValuableNone") && ctx.preview.valuableNote.includes("ValuableReason.too-expensive"),
  "a fitting valuable that is missing names the reason");
assert.equal(ctx.preview.currency, "40 gp", "the full currency stays as coins");

// With the box off, no valuable is sought and no note appears.
c = ctl(); a = app(c);
await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext();
assert.equal(ctx.preview.valuables.length, 0); assert.equal(ctx.preview.valuableNote, null);

// The valuable pack is not installed: the preview gives that reason and the currency stays whole.
valuablePool.available = false; valuablePool.candidates = [];
c = ctl({ valuables: { checked: true } }); a = app(c);
await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext();
assert.ok(ctx.preview.valuableNote.includes("ValuableReason.pack"));
valuablePool.available = true;

permanentPools.clear(); permanentPicks = []; valuablePool.candidates = [];

// The preview and the template keep the table/checkbox/escaping contracts.
assert.match(template, /name="valuables"/, "the valuables box is in the parcel form");
assert.match(template, /{{#each preview\.permanents}}<tr><td>{{this\.levels}}<\/td><td>{{#if this\.filled}}{{this\.name}}/,
  "permanent names are escaped by Handlebars");
assert.match(template, /<th scope="col">{{localize "SIMPLYPF2E\.ItemForge\.Parcel\.PermanentLevels"}}<\/th>/, "headers are real column headers with scope");
assert.match(template, /spf-table-scroll/, "wide tables scroll within their card");

// A coin that cannot load keeps the valuable (it was built) and reports the missing coin value; no coin is invented.
valuablePool.candidates = [SILK_CANDIDATE];
parcelPicks = []; permanentPicks = []; permanentPools.clear();
coinAvailable = false;
c = ctl({ valuables: { checked: true } }); a = app(c);
await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext();
assert.equal(ctx.preview.valuables[0].name, "Silk ceremonial armor", "the built valuable is kept");
assert.equal(ctx.preview.currency, null, "no partial coin is written");
assert.ok(ctx.preview.coinsMissing.includes("CoinsMissing"), "the missing coin value is reported");
assert.equal(ctx.preview.valueGp, 10, "built value counts only the valuable, not the missing coins");
await A.createItem.call(a);
created = createCalls.at(-1).actor;
assert.deepEqual(created.items.map((item) => [item.name, item.system.quantity]), [["Silk ceremonial armor", 1]],
  "the loot actor holds the valuable and no coins");
coinAvailable = true;
valuablePool.candidates = [];

// An unavailable wand template leaves its slot visibly unfilled with the template reason; nothing is fabricated.
const wandTemplate = docs.get(WAND_1_UUID);
docs.delete(WAND_1_UUID);
permanentPools.set(3, { equipment: [], wands: [{ id: "w-c-heal", name: "Wand of Heal (Rank 1)", level: 3, rank: 1, kind: "wand", traits: [], spell: HEALC }] });
permanentPicks = [{ slotId: "perm-1", candidateId: "w-c-heal" }];
parcelPicks = []; c = ctl({ level: { value: "2" } }); a = app(c);
await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext();
assert.equal(ctx.preview.permanents[0].filled, false);
assert.equal(ctx.preview.permanents[0].reason, "SIMPLYPF2E.ItemForge.Parcel.Reason.template", "a missing template is named, not replaced");
docs.set(WAND_1_UUID, wandTemplate);
permanentPools.clear(); permanentPicks = []; parcelPicks = initialPicks;

// Read and provider failures (release repair): each failing part is its own problem, and a user abort still stops.
// A rejected document read for the chosen permanent item leaves that slot unavailable; the scrolls and currency build.
candidateReadError = new Error("pack damaged");
permanentPools.clear(); permanentPools.set(1, { equipment: [HEARING_CANDIDATE], wands: [] });
permanentPicks = [{ slotId: "perm-3", candidateId: "c-hearing" }]; parcelPicks = initialPicks;
c = ctl(); a = app(c);
await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext();
assert.equal(ctx.error, null, "a rejected document read does not fail the parcel");
assert.equal(ctx.preview.permanents[2].reason, "SIMPLYPF2E.ItemForge.Parcel.Reason.unavailable", "the slot says why it is unavailable");
assert.ok(ctx.preview.items.length > 0, "the scrolls survive a failed permanent read");
assert.ok(ctx.preview.currency, "the currency survives a failed permanent read");
candidateReadError = null;

// A failed valuable search keeps the full currency as coins, with the reason shown.
valuablePool.candidates = [SILK_CANDIDATE];
valuableReadError = new Error("valuable damaged");
parcelPicks = []; permanentPicks = []; permanentPools.clear();
c = ctl({ valuables: { checked: true } }); a = app(c);
await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext();
assert.equal(ctx.error, null, "a failed valuable search does not fail the parcel");
assert.equal(ctx.preview.valuables.length, 0);
assert.ok(ctx.preview.valuableNote.includes("ValuableReason.unavailable"), "the valuable's failure is named");
assert.equal(ctx.preview.currency, "40 gp", "the full currency stays as coins");
valuableReadError = null;

// A user abort during the valuable search still stops generation.
valuableReadError = Object.assign(new Error("aborted"), { name: "AbortError" });
a = app(c); await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext();
assert.equal(ctx.preview, null, "an abort is not swallowed into a warning");
assert.ok(ctx.error && ctx.error.includes("aborted"), "the abort surfaces as the run's error");
valuableReadError = null; valuablePool.candidates = [];

// A scroll provider failure leaves the scroll slots unfilled and still builds permanent items and currency.
parcelMode = "fail";
permanentPools.clear(); permanentPools.set(1, { equipment: [HEARING_CANDIDATE], wands: [] });
permanentPicks = [{ slotId: "perm-3", candidateId: "c-hearing" }];
c = ctl(); a = app(c);
await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext();
assert.equal(ctx.error, null, "a scroll provider failure does not fail the parcel");
assert.equal(ctx.preview.items.length, 0, "no scroll is built when the selection failed");
assert.ok(ctx.preview.unfilled.length > 0, "every scroll slot is listed as unfilled");
assert.ok(ctx.preview.warnings.some((w) => w.includes("ScrollProvider")), "the failure is named in the preview");
assert.equal(ctx.preview.permanents[2].filled, true, "the permanent item still builds");
assert.equal(ctx.preview.currency, "40 gp", "the currency still builds");
await A.createItem.call(a);
created = createCalls.at(-1).actor;
assert.deepEqual(created.items.map((item) => [item.type, item.name]), [["equipment", "Magical Hearing Aid"], ["treasure", "Gold Pieces"]],
  "the loot actor holds the permanent item and the coins, with no scrolls");
parcelMode = "abort";
a = app(c); await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext();
assert.equal(ctx.preview, null, "a scroll-phase abort is not swallowed");
assert.ok(ctx.error && ctx.error.includes("aborted"));
parcelMode = "ok"; permanentPools.clear(); permanentPicks = []; parcelPicks = initialPicks;

// Create revalidates each built permanent source with the same predicate as Generate, and writes nothing when it fails.
permanentPools.clear(); permanentPools.set(1, { equipment: [HEARING_CANDIDATE], wands: [] });
permanentPicks = [{ slotId: "perm-3", candidateId: "c-hearing" }]; parcelPicks = initialPicks;
const changes = [
  ["a rule added after Generate", (src) => { src.system.rules = [{ key: "Fake" }]; }],
  ["the level changed after Generate", (src) => { src.system.level.value = 5; }],
  ["the rarity raised after Generate", (src) => { src.system.traits.rarity = "rare"; }],
];
for (const [label, change] of changes) {
  c = ctl(); a = app(c);
  await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
  assert.equal((await a._prepareContext()).preview.permanents[2].filled, true, `${label}: the item is built first`);
  change(lastHearingSource);
  const writes = createCalls.length;
  await A.createItem.call(a); ctx = await a._prepareContext();
  assert.equal(createCalls.length, writes, `${label}: nothing is written`);
  assert.equal(ctx.error, "SIMPLYPF2E.ItemForge.Parcel.Revalidate", `${label}: Create refuses`);
}
// An unchanged source still creates, so the check is not refusing everything.
c = ctl(); a = app(c);
await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
const writesBefore = createCalls.length;
await A.createItem.call(a);
assert.equal(createCalls.length, writesBefore + 1, "an unchanged source is created");
permanentPools.clear(); permanentPicks = [];

// Published special wands (parcel v3): a level-4 slot takes the Wand of Mercy unchanged, at its own level 4.
const MERCY_CANDIDATE = { id: "c-mercy", name: "Wand of Mercy (1st-rank)", level: 4, kind: "special-wand", traits: ["magical", "wand"], rarity: "common" };
permanentPools.clear(); permanentPools.set(4, { equipment: [], wands: [], special: [MERCY_CANDIDATE] });
permanentPicks = [{ slotId: "perm-3", candidateId: "c-mercy" }]; parcelPicks = [];
c = ctl({ level: { value: "4" } }); a = app(c);
await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext();
assert.equal(ctx.preview.permanents[2].filled, true, "the special wand fills its level-4 slot");
assert.equal(ctx.preview.permanents[2].name, "Wand of Mercy (1st-rank)");
assert.equal(ctx.preview.permanents[2].itemLevel, 4, "the published wand keeps its own level");
assert.equal(ctx.preview.permanents[2].kind, "SIMPLYPF2E.ItemForge.Parcel.PermanentKind.special-wand", "the row says it is a published wand");
await A.createItem.call(a);
created = createCalls.at(-1).actor;
const mercyItem = created.items.find((item) => item.name === "Wand of Mercy (1st-rank)");
assert.ok(mercyItem, "the wand is written to the loot actor");
assert.equal(mercyItem.type, "equipment"); assert.equal(mercyItem.system.level.value, 4); assert.deepEqual(mercyItem.system.rules, []);
assert.equal(mercyItem.system.price.value.gp, 75, "the published price is carried unchanged");
permanentPools.clear(); permanentPicks = []; parcelPicks = initialPicks; c = ctl();

// The pinned tier documents the runed build verifies (the same pinned uuids as scripts/parcel-runed.mjs).
docs.set(runed.RUNE_TIERS.weapon.potency[1].uuid, { uuid: runed.RUNE_TIERS.weapon.potency[1].uuid, toObject: () => plain(v3Fixture("weapon-potency-1")) });
docs.set(runed.RUNE_TIERS.weapon.striking[1].uuid, { uuid: runed.RUNE_TIERS.weapon.striking[1].uuid, toObject: () => plain(v3Fixture("striking")) });
// Fundamental-runed items (parcel v3): a level-4 slot takes a +1 striking longsword built from verified tiers.
const RUNED_CANDIDATE = { id: "rn-c-runedbase-p1s1", name: "+1 Striking Longsword", level: 4, rarity: "common", kind: "runed", traits: [],
  runeKind: "weapon", base: { id: "c-runedbase", name: "Longsword" }, baseName: "Longsword",
  computed: { baseLevel: 0, baseRarity: "common", potency: 1, secondary: 1, copper: 10000, level: 4, rarity: "common" } };
const runedFlow = async (candidate) => {
  runedPool = [candidate]; permanentPools.clear(); permanentPicks = [{ slotId: "perm-3", candidateId: candidate.id }]; parcelPicks = [];
  const cc = ctl({ level: { value: "4" } }); const aa = app(cc);
  await A.selectKind.call(aa, null, { dataset: { kind: "parcel" } }); await A.generate.call(aa);
  return { cc, aa, ctx: await aa._prepareContext() };
};
{
  const { cc, aa, ctx: rctx } = await runedFlow(RUNED_CANDIDATE);
  assert.equal(rctx.preview.permanents[2].filled, true, "the runed item fills its level-4 slot");
  assert.equal(rctx.preview.permanents[2].name, "+1 Striking Longsword");
  assert.equal(rctx.preview.permanents[2].itemLevel, 4, "the item level is the computed pf2e level");
  assert.equal(rctx.preview.permanents[2].price, "100 gp", "the value is the two rune prices, with no base added");
  assert.ok(rctx.preview.permanents[2].kind.includes("PermanentKind.runed"), "the row says it is runed");
  assert.ok(rctx.preview.permanents[2].detail.includes("PermanentBase") && rctx.preview.permanents[2].detail.includes("Longsword"), "the base is shown");
  const writes = createCalls.length;
  await A.createItem.call(aa);
  const built = createCalls.at(-1).actor.items.find((item) => item.name === "+1 Striking Longsword");
  assert.ok(built, "the runed item is written to the loot actor");
  assert.equal(built.type, "weapon"); assert.equal(built.system.runes.potency, 1); assert.equal(built.system.runes.striking, 1);
  assert.deepEqual(built.system.rules, []); assert.ok(built.system.traits.value.includes("magical"));
  assert.equal(createCalls.length, writes + 1, "one write for the actor");
}

// A stored value that disagrees with the recomputed valuation is refused at build; the slot says so and nothing is invented.
{
  const wrong = { ...RUNED_CANDIDATE, computed: { ...RUNED_CANDIDATE.computed, copper: 9999 } };
  const { ctx: wctx } = await runedFlow(wrong);
  assert.equal(wctx.preview.permanents[2].filled, false, "a disagreeing value is not built");
  assert.equal(wctx.preview.permanents[2].reason, "SIMPLYPF2E.ItemForge.Parcel.Reason.build", "the reason is a build failure");
}

// A rune document that cannot be read leaves the slot unavailable, with its reason.
{
  const striking = runed.RUNE_TIERS.weapon.striking[1].uuid;
  const saved = docs.get(striking); docs.delete(striking);
  const { ctx: uctx } = await runedFlow(RUNED_CANDIDATE);
  docs.set(striking, saved);
  assert.equal(uctx.preview.permanents[2].filled, false);
  assert.equal(uctx.preview.permanents[2].reason, "SIMPLYPF2E.ItemForge.Parcel.Reason.unavailable", "a missing rune document is unavailable, not guessed");
}
// A rune document whose value no longer matches the pinned tier is refused at build, not used.
{
  const striking = runed.RUNE_TIERS.weapon.striking[1].uuid;
  const saved = docs.get(striking);
  docs.set(striking, { uuid: striking, toObject: () => { const tampered = plain(v3Fixture("striking")); tampered.system.price.value = { gp: 66 }; return tampered; } });
  const { ctx: tctx } = await runedFlow(RUNED_CANDIDATE);
  docs.set(striking, saved);
  assert.equal(tctx.preview.permanents[2].filled, false, "a tampered rune document is not built");
  assert.equal(tctx.preview.permanents[2].reason, "SIMPLYPF2E.ItemForge.Parcel.Reason.unavailable", "its slot says the tier could not be verified");
}
// Create refuses a runed item whose stored source changed after Generate, and writes nothing.
for (const [label, change, reason] of [
  ["base level set to 20", (source) => { source.system.level.value = 20; }, "base-level"],
  ["a shoddy tag added", (source) => { source.system.traits.otherTags = ["shoddy"]; }, "base-otherTags"]
]) {
  const { aa: staleApp, ctx: staleCtx } = await runedFlow(RUNED_CANDIDATE);
  assert.equal(staleCtx.preview.permanents[2].filled, true, `${label}: the runed item is built first`);
  change(lastRunedSource);
  const writesBeforeStale = createCalls.length;
  await A.createItem.call(staleApp); const sctx = await staleApp._prepareContext();
  assert.equal(createCalls.length, writesBeforeStale, `${label}: nothing is written`);
  assert.equal(sctx.error, "SIMPLYPF2E.ItemForge.Parcel.Revalidate", `${label}: Create refuses the changed base`);
}
runedPool = []; permanentPools.clear(); permanentPicks = []; parcelPicks = initialPicks; c = ctl();

// Gate-off defences in the Forge's #readForm (release repair): with experimentalTools closed, a parcel's Merchant
// sheet and valuables box read as Loot and off, even when the form still shows them as chosen. The read happens in
// Generate, before the gate check refuses the run, so the input is what the form would have sent.
{
  gate = true;
  c = ctl({ lootSheetType: { value: "Merchant" }, valuables: { checked: true } }); a = app(c);
  await A.selectKind.call(a, null, { dataset: { kind: "parcel" } });
  gate = false;
  await A.generate.call(a);
  const gateCtx = await a._prepareContext();
  assert.equal(gateCtx.input.sheetType, "Loot", "with the gate closed the Merchant sheet reads as Loot");
  assert.equal(gateCtx.input.valuables, false, "with the gate closed the valuables box reads as off");
  assert.equal(gateCtx.error, "GATE-CLOSED", "and generation is refused");
  gate = true;
  // The same form with the gate open keeps both choices.
  a = app(c); await A.selectKind.call(a, null, { dataset: { kind: "parcel" } });
  await A.generate.call(a);
  const openCtx = await a._prepareContext();
  assert.equal(openCtx.input.sheetType, "Merchant", "with the gate open the Merchant sheet is kept");
  assert.equal(openCtx.input.valuables, true, "with the gate open the valuables box is kept");
  permanentPools.clear(); permanentPicks = []; parcelPicks = initialPicks; c = ctl();
}

// Values built inside the VM context have another realm's prototypes, so compare their serialized form.
const same = (actual, expected, message) => assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
// Rule Elements destination (feat/re-folder): with "Items with rules go to a world folder" on, a rule-bearing permanent item
// is created as an unchanged world item in a folder named after the parcel, and never on the loot actor.
const CLOAK_CANDIDATE = { id: "c-cloak", name: "Aerial Cloak", level: 3, kind: "equipment", traits: ["air", "invested", "magical"], rarity: "common", rules: true };
const PARCEL_NAME = "SIMPLYPF2E.ItemForge.Loot.DefaultName";
const resetFolderRun = () => {
  gate = true; actorBehavior = "ok"; itemBehavior = "ok"; folderBehavior = "ok"; parcelPicks = initialPicks; permanentMode = "ok";
  permanentPools.clear(); permanentPools.set(3, { equipment: [CLOAK_CANDIDATE], wands: [] }); permanentPicks = [{ slotId: "perm-1", candidateId: "c-cloak" }];
  permanentCandidateCalls.length = 0; createCalls.length = 0; itemWrites = 0; worldItemsWritten.length = 0; itemDeletes.length = 0; folderCreates.length = 0; folderDeletes.length = 0;
};
const folderRun = async (controls = {}) => {
  const run = app(ctl({ level: { value: "2" }, ...controls }));
  await A.selectKind.call(run, null, { dataset: { kind: "parcel" } }); await A.generate.call(run);
  return run;
};
const folderOn = { ruleFolder: { checked: true } };

// Option off (default): the pool asks for no rule-bearing items, and the cloak is never built.
resetFolderRun();
a = await folderRun();
ctx = await a._prepareContext();
assert.ok(permanentCandidateCalls.length && permanentCandidateCalls.every((call) => call.allowRules === false), "option off: the pool never admits rule-bearing items");
assert.equal(ctx.preview.permanents[0].filled, false, "option off: the rule-bearing cloak is not built");
assert.equal(ctx.preview.permanents[0].reason, "SIMPLYPF2E.ItemForge.Parcel.Reason.no-candidates", "option off: the pool holds no rule-bearing item, so the slot has no candidates");
assert.equal(ctx.preview.ruleFolder, null, "option off: no world-folder section");
assert.equal(ctx.input.ruleFolder, false, "option off: the box is off by default");
await A.createItem.call(a);
assert.equal(folderCreates.length, 0, "option off: no folder is created");
assert.equal(createCalls.filter((call) => call.item).length, 0, "option off: no world item is created");

// Option on, cloak picked: folder plus items created, the loot actor holds no rule-bearing item, totals exact across both.
resetFolderRun();
a = await folderRun(folderOn);
ctx = await a._prepareContext();
assert.equal(ctx.input.ruleFolder, true, "the box is read as on");
assert.ok(permanentCandidateCalls.some((call) => call.allowRules === true), "option on: the pool admits rule-bearing items");
assert.equal(ctx.preview.permanents[0].filled, true, "option on: the cloak fills its slot");
assert.equal(ctx.preview.permanents[0].destination, "SIMPLYPF2E.ItemForge.Parcel.RuleFolder.Folder", "the row names its destination");
same(ctx.preview.ruleFolder.items.map((item) => item.name), ["Aerial Cloak"], "the folder section lists the world items");
assert.equal(ctx.preview.ruleFolder.folderGp, "60 gp", "the folder subtotal is the cloak's real price");
const lootGp = Number(ctx.preview.ruleFolder.lootGp.replace(/[^0-9.]/g, ""));
assert.ok(Math.abs(lootGp + 60 - ctx.preview.valueGp) < 1e-9, "loot actor plus world folder equals the built total, exactly");
await A.createItem.call(a); ctx = await a._prepareContext();
assert.equal(ctx.error, null, "option on: the create succeeds");
same(folderCreates, [{ name: PARCEL_NAME, type: "Item" }], "a world folder named after the parcel, typed Item, is created once");
const worldWrite = createCalls.find((call) => call.item);
assert.equal(worldWrite.item.length, 1, "one world item is written");
assert.equal(worldWrite.item[0].name, "Aerial Cloak");
assert.equal(worldWrite.item[0].folder, "f1", "the world item is inside the folder");
assert.equal(worldWrite.item[0].system.rules.length, CLOAK.system.rules.length, "the world item keeps every Rule Element");
assert.ok(worldWrite.item[0]._stats?.compendiumSource, "the clone keeps its compendium source");
const actorWrite = createCalls.at(-1).actor;
assert.ok(!actorWrite.items.some((item) => item.name === "Aerial Cloak"), "the loot actor never holds the rule-bearing item");
same(folderDeletes, [], "a successful create rolls nothing back");
assert.ok(createCalls.indexOf(worldWrite) < createCalls.indexOf(createCalls.find((call) => call.actor)), "the folder items are written before the loot actor");

// Rollback: the world item create fails, so no loot actor is written and the folder is removed.
resetFolderRun(); itemBehavior = "fail";
a = await folderRun(folderOn); await A.createItem.call(a); ctx = await a._prepareContext();
assert.ok(ctx.error.includes("item create refused"), "the failure is reported");
assert.equal(createCalls.filter((call) => call.actor).length, 0, "no loot actor is written when a world item create fails");
same(folderDeletes, [PARCEL_NAME], "the folder is removed");
assert.equal(ctx.hasPreview, true, "a failed create keeps the draft for a retry");

// Rollback: the loot actor fails verification after the world items exist, so the items and folder are removed too.
resetFolderRun(); actorBehavior = "dropItem";
a = await folderRun(folderOn); await A.createItem.call(a); ctx = await a._prepareContext();
assert.ok(ctx.error.includes("Post-create verification failed"), "the actor failure is reported");
same(itemDeletes, ["Aerial Cloak"], "the world item is removed after the actor rollback");
same(folderDeletes, [PARCEL_NAME], "the folder is removed last");
actorBehavior = "ok";

// A world item or folder that cannot be removed is reported as a survivor, never silently left behind.
resetFolderRun(); actorBehavior = "dropItem"; folderBehavior = "stuck";
a = await folderRun(folderOn); await A.createItem.call(a); ctx = await a._prepareContext();
assert.ok(ctx.error.includes("SIMPLYPF2E.ItemForge.Parcel.RuleFolder.SurvivorFolder"), "a folder that survives the rollback is named in the error");
actorBehavior = "ok"; folderBehavior = "ok";

// Revalidation: a rule-bearing source that stops passing its checks after Generate is refused before anything is written.
resetFolderRun();
a = await folderRun(folderOn);
lastCloakSource.system.level.value = 9;
await A.createItem.call(a); ctx = await a._prepareContext();
assert.equal(ctx.error, "SIMPLYPF2E.ItemForge.Parcel.Revalidate", "a changed rule-bearing source is refused");
assert.equal(folderCreates.length, 0, "nothing is written after a failed revalidation");
assert.equal(createCalls.length, 0, "no item and no actor after a failed revalidation");

// Verification: a world item that comes back different from what was sent blocks the create and is rolled back.
resetFolderRun(); itemBehavior = "rename";
a = await folderRun(folderOn); await A.createItem.call(a); ctx = await a._prepareContext();
assert.ok(ctx.error.includes("SIMPLYPF2E.ItemForge.Parcel.RuleFolder.Verify"), "a mismatched world item is reported");
assert.equal(createCalls.filter((call) => call.actor).length, 0, "no loot actor is written after a mismatched world item");
same(itemDeletes, ["Aerial Cloak (renamed)"], "the mismatched world item is removed");
same(folderDeletes, [PARCEL_NAME], "the folder is removed");
itemBehavior = "ok";

// Merchant sheet: the folder sits next to the Merchant actor in the same create.
resetFolderRun();
a = await folderRun({ ...folderOn, lootSheetType: { value: "Merchant" } });
await A.createItem.call(a); ctx = await a._prepareContext();
assert.equal(ctx.error, null);
assert.equal(createCalls.at(-1).actor.system.lootSheetType, "Merchant", "the Merchant sheet is kept");
assert.equal(folderCreates.length, 1, "the folder is created next to the Merchant actor");

// The gate stays authoritative: with experimental tools closed the option is ignored and nothing is written.
resetFolderRun();
a = await folderRun(folderOn);
gate = false; await A.createItem.call(a); ctx = await a._prepareContext();
assert.equal(ctx.error, "GATE-CLOSED", "a closed gate refuses the create");
assert.equal(folderCreates.length, 0, "a closed gate writes no folder");
gate = true;
resetFolderRun();

// CR HIGH #1 and #2 (fix/re-folder-gate): a same-count altered rule or a mismatched identity is refused and rolled back;
// a survivor of the rollback discards the draft, so a second Create writes nothing.
resetFolderRun(); itemBehavior = "alter";
a = await folderRun(folderOn); await A.createItem.call(a); ctx = await a._prepareContext();
assert.ok(String(ctx.error).includes("SIMPLYPF2E.ItemForge.Parcel.RuleFolder.Verify"), "a same-count altered rule is refused at Create");
assert.equal(createCalls.filter((call) => call.actor).length, 0, "no loot actor is written for an altered world item");
same(itemDeletes, ["Aerial Cloak"], "the altered world item is rolled back");
same(folderDeletes, [PARCEL_NAME], "the folder is rolled back");
itemBehavior = "ok";

resetFolderRun(); itemBehavior = "identity";
a = await folderRun(folderOn); await A.createItem.call(a); ctx = await a._prepareContext();
assert.ok(String(ctx.error).includes("SIMPLYPF2E.ItemForge.Parcel.RuleFolder.Verify"), "a mismatched source identity is refused at Create");
assert.equal(createCalls.filter((call) => call.actor).length, 0, "no loot actor is written for a mismatched identity");
same(itemDeletes, ["Aerial Cloak"], "the mismatched world item is rolled back");
itemBehavior = "ok";

// A failed world-item delete leaves a survivor: the draft is discarded, and a second Create writes nothing.
resetFolderRun(); itemBehavior = "deleteFail"; actorBehavior = "dropItem";
a = await folderRun(folderOn); await A.createItem.call(a); ctx = await a._prepareContext();
assert.ok(String(ctx.error).includes("SIMPLYPF2E.ItemForge.Parcel.RuleFolder.SurvivorItem"), "the surviving world item is named");
assert.equal(ctx.hasPreview, false, "a surviving world item discards the draft");
const writesBeforeRetry = createCalls.length; const foldersBeforeRetry = folderCreates.length;
await A.createItem.call(a); ctx = await a._prepareContext();
assert.equal(createCalls.length, writesBeforeRetry, "a second Create after a surviving world item writes nothing");
assert.equal(folderCreates.length, foldersBeforeRetry, "a second Create after a surviving world item creates no folder");
itemBehavior = "ok"; actorBehavior = "ok";

// A failed folder delete leaves a survivor folder: the draft is discarded, and a second Create writes nothing.
resetFolderRun(); folderBehavior = "stuck"; actorBehavior = "dropItem";
a = await folderRun(folderOn); await A.createItem.call(a); ctx = await a._prepareContext();
assert.ok(String(ctx.error).includes("SIMPLYPF2E.ItemForge.Parcel.RuleFolder.SurvivorFolder"), "the surviving folder is named");
assert.equal(ctx.hasPreview, false, "a surviving folder discards the draft");
const writesBeforeFolderRetry = createCalls.length; const foldersBeforeFolderRetry = folderCreates.length;
await A.createItem.call(a); ctx = await a._prepareContext();
assert.equal(createCalls.length, writesBeforeFolderRetry, "a second Create after a surviving folder writes nothing");
assert.equal(folderCreates.length, foldersBeforeFolderRetry, "a second Create after a surviving folder creates no second folder");
folderBehavior = "ok"; actorBehavior = "ok";
resetFolderRun()// N44: a world-item write that fails partway leaves no untracked survivor. Two rule-bearing items; the second create fails,
// or writes and then throws. Every item the world holds is removed, the folder goes, and a retry starts clean.
const twoCloaks = () => {
  resetFolderRun();
  permanentPools.set(3, { equipment: [CLOAK_CANDIDATE, { ...CLOAK_CANDIDATE, id: "c-cloak2", name: "Aerial Cloak II" }], wands: [] });
  permanentPicks = [{ slotId: "perm-1", candidateId: "c-cloak" }, { slotId: "perm-2", candidateId: "c-cloak2" }];
};
const survivorsInWorld = () => worldItemsWritten.filter((item) => !item.deleted).map((item) => item.name);
twoCloaks();
a = await folderRun(folderOn); ctx = await a._prepareContext();
same(ctx.preview.ruleFolder.items.map((item) => item.name), ["Aerial Cloak", "Aerial Cloak II"], "the setup holds two folder items");
await A.createItem.call(a); ctx = await a._prepareContext();
assert.equal(ctx.error, null, "two folder items create cleanly");
assert.equal(worldItemsWritten.length, 2, "both items are written when nothing fails");

for (const mode of ["partial", "writeThenThrow"]) {
  twoCloaks(); itemBehavior = mode;
  a = await folderRun(folderOn); await A.createItem.call(a); ctx = await a._prepareContext();
  assert.ok(String(ctx.error).length > 0, `${mode}: the failure is reported`);
  assert.equal(worldItemsWritten.length >= 1, true, `${mode}: the world did write an item before the failure`);
  same(survivorsInWorld(), [], `${mode}: no world item survives the rollback`);
  same(folderDeletes, [PARCEL_NAME], `${mode}: the folder is removed`);
  assert.equal(createCalls.filter((call) => call.actor).length, 0, `${mode}: no loot actor is written`);
  assert.equal(ctx.hasPreview, true, `${mode}: a clean rollback keeps the draft for a retry`);
  // The retry succeeds and holds exactly the two items, not duplicates of the earlier write.
  itemBehavior = "ok"; itemWrites = 0; worldItemsWritten.length = 0; itemDeletes.length = 0; folderDeletes.length = 0; createCalls.length = 0;
  await A.createItem.call(a); ctx = await a._prepareContext();
  assert.equal(ctx.error, null, `${mode}: the retry creates`);
  same(survivorsInWorld(), ["Aerial Cloak", "Aerial Cloak II"], `${mode}: the retry leaves exactly the two planned items`);
}
resetFolderRun();
