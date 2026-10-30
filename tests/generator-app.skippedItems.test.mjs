// Release QA F2/F3, through the real GeneratorApp preview code. The AI's equipment and loot names that have no
// compendium match are dropped by the resolvers and must be named in one localized, escaped preview line; the
// Custom badges they used to show are gone. Loot scrolls are offered only within the rarity cap (F3).
// Run: node tests/generator-app.skippedItems.test.mjs
import { needsExtraPurchasePass } from "../scripts/purchase-pass.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import { completionManifest, assertComplete } from "../scripts/completion.mjs";
import { normalizeConcept, normalizeLoot, parseCoins, parseScroll, computeStats } from "../scripts/builder.mjs";
import { normalizePCConcept } from "../scripts/pc-builder.mjs";
import { normalizeSkillPriorities, skillPriorityOrder } from "../scripts/pc-skills.mjs";

if (!vm.SourceTextModule) {
  const run = spawnSync(process.execPath, ["--experimental-vm-modules", import.meta.filename], { stdio: "inherit" });
  process.exit(run.status ?? 1);
}

// The English strings, read from the shipped lang file, so the assertions check what the GM reads.
const en = JSON.parse(await readFile(new URL("../lang/en.json", import.meta.url), "utf8"));
const lookup = (key) => key.split(".").reduce((node, part) => node?.[part], en) ?? key;
const i18n = {
  localize: (key) => lookup(key),
  format: (key, data = {}) => lookup(key).replace(/\{(\w+)\}/g, (_, name) => String(data[name] ?? `{${name}}`))
};
globalThis.game = { i18n, settings: { get: () => ({}) }, packs: new Map() };

const source = (await readFile(new URL("../scripts/generator-app.mjs", import.meta.url), "utf8"))
  .replace(/#(input|concept|resolved|manifest|error|busy|pcConcept|pcResolved|buildPreviewContext|buildPCPreviewContext|refineLoot|refineEquipment)\b/g, "_test_$1");
const context = vm.createContext({ console: { warn() {}, error() {}, log() {} }, game: globalThis.game });
let scrollOptions = null;
let scrollMax = null;
let failSelection = false;
const warnings = [];
const realLootCandidates = [{ name: "Healing Potion", ref: { packId: "test.equipment", _id: "potion" } }];
const mocks = {
  needsExtraPurchasePass,
  getCreatureFeatCandidates: async () => [], normalizeCreatureFeatName: (name) => String(name ?? "").toLowerCase(),
  MODULE_ID: "simplypf2e",
  getProviderRequestConfig: () => ({}), getProviderAuthWarningKey: () => null,
  AI_TASK: {}, taskMaxTokens: () => 100,
  SpfApp: class {
    _beginProgress() { return new AbortController().signal; }
    async _setStep() {} _skipStep() {} _warnStep(key) { warnings.push(key); } _recordTokens() {} _progressCallback() { return () => {}; }
    _finishRun() {} _throwIfCancelled() {} async render() {}
  },
  normalizeConcept, normalizeLoot, parseCoins, parseScroll, computeStats, completionManifest, assertComplete,
  lootScrollMaxRank: (level) => Math.min(10, Math.max(1, Math.ceil((level + 2) / 2))),
  normalizeSkillPriorities, skillPriorityOrder,
  findPreset: () => null,
  getLootCandidates: async () => { if (failSelection) throw new Error("offline"); return realLootCandidates; },
  getScrollSpellCandidates: async (maxRank, keywords, options) => { scrollOptions = options; scrollMax = maxRank; return []; },
  selectLoot: async () => ({ loot: [], omitted: false }),
  getEquipmentCandidates: async () => { if (failSelection) throw new Error("offline"); return []; }, getAbilityCandidates: async () => [], getSpellCandidates: async () => [],
};
const module = new vm.SourceTextModule(source, { context });
await module.link((specifier) => {
  const imports = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)]
    .filter((match) => match[2] === specifier)
    .flatMap((match) => match[1].split(",").map((name) => name.trim()));
  return new vm.SyntheticModule(imports, function () {
    for (const name of imports) this.setExport(name, mocks[name] ?? (() => { throw new Error(`Unexpected dependency: ${name}`); }));
  }, { context });
});
await module.evaluate();
const App = module.namespace.GeneratorApp;

const ref = { packId: "test.equipment", _id: "lantern", name: "Lantern" };
function npcPreview(skipped) {
  const app = new App();
  const concept = normalizeConcept({ name: "Courier", equipment: [{ name: "Lantern", quantity: 1 }], loot: [] }, { level: 2, rarity: "common" });
  app._test_concept = concept;
  app._test_resolved = {
    abilities: [], spells: [], feats: [], focusSpells: [],
    equipment: [{ name: "Lantern", quantity: 1, runes: {}, entry: ref }], loot: [],
    skipped
  };
  app._test_input = { ...app._test_input, rarityCap: null };
  return app;
}

// F2 for PC starting gear: the same line, from the character's resolved equipment.
{
  const app = new App();
  app._test_pcConcept = normalizePCConcept({ name: "Tamsin", ancestry: "Human", background: "Scholar", class: "Rogue", level: 3 }, { level: 3 });
  app._test_pcResolved = { equipment: [], loot: [], skipped: { equipment: ["Phantom Lantern"], loot: [] }, feats: [], spells: [], focusSpells: [] };
  const ctx = app._test_buildPCPreviewContext();
  assert.equal(ctx.skipped?.text, "1 item was not in your compendium and was skipped: Phantom Lantern", "PC starting gear names its skipped items");
}
// F2: the names the resolvers skipped appear in one line, in the English the GM reads.
{
  const ctx = npcPreview({ equipment: ["Phantom Lantern"], loot: ["Gleaming Rubble"] })._test_buildPreviewContext();
  assert.equal(ctx.skipped?.text, "2 items were not in your compendium and were skipped: Phantom Lantern, Gleaming Rubble",
    "every skipped name is listed, equipment first");
}
{
  const ctx = npcPreview({ equipment: ["Phantom Lantern"], loot: [] })._test_buildPreviewContext();
  assert.equal(ctx.skipped?.text, "1 item was not in your compendium and was skipped: Phantom Lantern", "the singular wording for one item");
}
{
  const ctx = npcPreview({ equipment: [], loot: ["Gleaming Rubble", "Gleaming Rubble"] })._test_buildPreviewContext();
  assert.equal(ctx.skipped?.text, "1 item was not in your compendium and was skipped: Gleaming Rubble",
    "a name skipped twice (equipment and loot) counts once");
}
{
  const ctx = npcPreview({ equipment: [], loot: [] })._test_buildPreviewContext();
  assert.equal(ctx.skipped, null, "no line when nothing was skipped");
}
// The AI's name is plain text: markup in it is carried as text, and the template escapes it (double-stash only).
{
  const hostile = "<img src=x onerror=alert(1)>";
  const ctx = npcPreview({ equipment: [hostile], loot: [] })._test_buildPreviewContext();
  assert.ok(ctx.skipped.text.includes(hostile), "the AI's name reaches the line as text");
  const template = await readFile(new URL("../templates/generator.hbs", import.meta.url), "utf8");
  const lines = template.split("\n").filter((line) => line.includes("skipped.text"));
  assert.equal(lines.length, 2, "NPC and PC previews each render the line");
  for (const line of lines) assert.doesNotMatch(line, /\{\{\{/, "the skipped line uses escaped output");
}
// The Custom badges are gone: a matched row shows only its check.
{
  const template = await readFile(new URL("../templates/generator.hbs", import.meta.url), "utf8");
  assert.doesNotMatch(template, /EquipmentCustom|LootCustom/, "the dead Custom badge branches are removed");
}

// F3: the loot-refinement scroll candidates honor the rarity cap, as the loot candidates already do.
{
  const app = npcPreview({ equipment: [], loot: [] });
  app._test_input = { ...app._test_input, rarityCap: "uncommon" };
  const concept = { name: "Courier", level: 4, rarity: "common", traits: [], blurb: "",
    equipment: [], loot: [{ name: "Scroll of Fireball (Rank 3)", quantity: 1 }] };
  scrollOptions = null;
  await app._test_refineLoot(concept);
  assert.equal(scrollMax, 3, "level 4 scrolls are offered only through rank 3");
  assert.equal(scrollOptions?.maxRarity, "uncommon", "scroll candidates are offered only within the rarity cap");
}

// A tolerated provider/catalog failure must remain visible on its owning progress step.
{
  const app = npcPreview({ equipment: [], loot: [] });
  const concept = {level: 1, equipment: [{name: "Sword"}], strikes: [], loot: [{name: "Lantern"}]};
  warnings.length = 0; failSelection = true;
  await app._test_refineEquipment(concept);
  await app._test_refineLoot(concept);
  failSelection = false;
  assert.deepEqual(warnings, ["equipment", "loot"]);
}

console.log("generator-app.skippedItems.test.mjs: skipped names are listed in one escaped line; scroll candidates honor the rarity cap");
