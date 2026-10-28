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
let candidateReadError = null; let valuableReadError = null; let parcelMode = "ok";
async function getCandidateDocument(c) {
  if (c?.id === "c-heal") return { name: HEAL.name, uuid: "Compendium.pf2e.spells-srd.Item." + HEAL._id, toObject: () => plain(HEAL) };
  if (c?.id === "c-hearing" && candidateReadError) throw candidateReadError;
  if (c?.id === "c-hearing") return { name: HEARING.name, uuid: "Compendium.pf2e.equipment-srd.Item." + HEARING._id, toObject: () => plain(HEARING) };
  return null;
}
// Permanent slot pools by item level, the AI's picks, and the valuable pool, all controlled per test.
const permanentPools = new Map(); const permanentCalls = []; let permanentPicks = []; let permanentMode = "ok";
const valuablePool = { available: true, candidates: [] };
async function getPermanentEquipmentCandidates(level) { return permanentPools.get(level)?.equipment ?? []; }
async function getParcelWandCandidates(level) { return permanentPools.get(level)?.wands ?? []; }
async function getValuableCandidates() { return valuablePool; }
async function pickParcelValuable(ranked, budgetCopper) {
  if (valuableReadError) throw valuableReadError;
  const { entry, reason } = permanent.chooseValuable(ranked, budgetCopper);
  if (!entry) return { reason };
  const raw = entry.id === "c-silk" ? SILK : AGATE;
  return { candidate: entry, copper: entry.copper, source: { name: raw.name, type: "treasure", img: "x.webp", system: { category: raw.system.category, price: { value: raw.system.price.value }, quantity: 1, rules: [] } } };
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
  ...consumables, ...tables, ...parcel, ...permanent, ...loot, ...post, ...text,
  experimentalToolsEnabled: () => gate,
  assertExperimentalToolAccess: () => { if (!gate) throw Object.assign(new Error("GATE-CLOSED"), { code: "disabled" }); },
  MODULE_ID: "simplypf2e", SpfApp: MockSpfApp,
  AI_TASK: { MAGIC_ITEM_CONCEPT: "m", RUNED_ITEM_CONCEPT: "r", SPELL_CONSUMABLE_CONCEPT: "c", TREASURE_PARCEL_SPELLS: "p" },
  taskMaxTokens: () => 100, RUNED_ITEM_KINDS: new Set(["weapon", "armor"]), MIN_ITEM_LEVEL: 1, MAX_ITEM_LEVEL: 24,
  getProviderRequestConfig: () => ({}), getProviderAuthWarningKey: () => null,
  getScrollSpellCandidates, getCandidateDocument, selectSpellConsumables, selectParcelSpells, toItemData, priceToGp,
  getPermanentEquipmentCandidates, getParcelWandCandidates, getValuableCandidates, pickParcelValuable, selectParcelPermanents,
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
valuablePool.candidates = [SILK_CANDIDATE, { id: "c-agate", name: "Agate", copper: 50, packId: "pf2e.equipment-srd", _id: AGATE._id }];
parcelPicks = []; permanentPicks = [];
c = ctl({ valuables: { checked: true } }); a = app(c);
await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext();
assert.equal(ctx.preview.valuable.name, "Silk ceremonial armor");
assert.equal(ctx.preview.valuable.price, "10 gp");
assert.equal(ctx.preview.currency, "30 gp", "the coins are the exact remainder");
assert.equal(ctx.preview.valueGp, 40, "built value counts the valuable and the coins once each");
await A.createItem.call(a);
created = createCalls.at(-1).actor;
assert.deepEqual(created.items.map((item) => [item.type, item.name, item.system.quantity]), [
  ["treasure", "Silk ceremonial armor", 1], ["treasure", "Gold Pieces", 30]
], "the valuable is one item and the remainder is gold coins");

// Exact equality: a valuable worth the whole currency leaves no coins at all.
valuablePool.candidates = [{ ...SILK_CANDIDATE, copper: 4000 }];
a = app(c); await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext();
assert.equal(ctx.preview.valuable.name, "Silk ceremonial armor");
assert.equal(ctx.preview.currency, "", "no coins remain");
assert.equal(ctx.preview.valueGp, 40, "exact equality keeps the built value at the currency total");

// A valuable that costs more than the currency is not added, and the preview says why.
valuablePool.candidates = [{ ...SILK_CANDIDATE, copper: 5000 }];
a = app(c); await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext();
assert.equal(ctx.preview.valuable, null);
assert.ok(ctx.preview.valuableNote.includes("ValuableNone") && ctx.preview.valuableNote.includes("ValuableReason.too-expensive"),
  "a fitting valuable that is missing names the reason");
assert.equal(ctx.preview.currency, "40 gp", "the full currency stays as coins");

// With the box off, no valuable is sought and no note appears.
c = ctl(); a = app(c);
await A.selectKind.call(a, null, { dataset: { kind: "parcel" } }); await A.generate.call(a);
ctx = await a._prepareContext();
assert.equal(ctx.preview.valuable, null); assert.equal(ctx.preview.valuableNote, null);

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
assert.equal(ctx.preview.valuable.name, "Silk ceremonial armor", "the built valuable is kept");
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
assert.equal(ctx.preview.valuable, null);
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
