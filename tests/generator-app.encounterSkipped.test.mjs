// Encounter members whose equipment or loot had no compendium match are dropped by the resolvers.
// The encounter preview used to show no sign of that; each member now carries the same one-line,
// escaped skipped-items note the single-creature and character previews show.
// Run: node tests/generator-app.encounterSkipped.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import { normalizeConcept, computeStats } from "../scripts/builder.mjs";

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

// Test-only instrumentation exposes the encounter draft and its preview builder; bodies are unchanged.
const source = (await readFile(new URL("../scripts/generator-app.mjs", import.meta.url), "utf8"))
  .replace(/#(encounter|buildEncounterPreviewContext)\b/g, "_test_$1");
const context = vm.createContext({ console: { warn() {}, error() {}, log() {} }, game: globalThis.game });
const mocks = { SpfApp: class {}, MODULE_ID: "simplypf2e", computeStats };
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

function encounterPreview(members) {
  const app = new App();
  app._test_encounter = { name: "The Lantern Watch", budget: 80, spent: 80, treasureBudget: 40, treasureSpent: 12, members };
  return app._test_buildEncounterPreviewContext();
}
function creature({ skipped, count = 1, role = "boss" } = {}) {
  return {
    role, level: 4, count, xpEach: 80,
    concept: normalizeConcept({ name: "Lantern Warden", blurb: "Carries a lantern." }, { level: 4, rarity: "common" }),
    resolved: { skipped }
  };
}

// Every unmatched name in a member is named once, in the English the GM reads, under that member.
{
  const preview = encounterPreview([creature({ skipped: { equipment: ["Phantom Lantern"], loot: ["Gleaming Rubble"] } })]);
  assert.equal(preview.members[0].skippedItems?.text,
    "2 items were not in your compendium and were skipped: Phantom Lantern, Gleaming Rubble",
    "an encounter member lists its skipped equipment and loot");
}
// The singular wording, and a member with nothing skipped carries no line.
{
  const preview = encounterPreview([
    creature({ skipped: { equipment: ["Phantom Lantern"], loot: [] } }),
    creature({ role: "minion", skipped: { equipment: [], loot: [] } })
  ]);
  assert.equal(preview.members[0].skippedItems?.text,
    "1 item was not in your compendium and was skipped: Phantom Lantern", "the singular wording for one item");
  assert.equal(preview.members[1].skippedItems, null, "a fully matched member has no skipped line");
}
// A name skipped twice (equipment and loot) counts once, as in the single-creature preview.
{
  const preview = encounterPreview([creature({ skipped: { equipment: [], loot: ["Gleaming Rubble", "Gleaming Rubble"] } })]);
  assert.equal(preview.members[0].skippedItems?.text,
    "1 item was not in your compendium and was skipped: Gleaming Rubble", "a repeated name is listed once");
}
// The AI's name is plain text: markup is carried as text, and every rendered line escapes it.
{
  const hostile = "<img src=x onerror=alert(1)>";
  const preview = encounterPreview([creature({ skipped: { equipment: [hostile], loot: [] } })]);
  assert.ok(preview.members[0].skippedItems.text.includes(hostile), "the AI's name reaches the line as text");
  const template = await readFile(new URL("../templates/generator.hbs", import.meta.url), "utf8");
  const lines = template.split("\n").filter((line) => line.includes("skippedItems.text"));
  assert.equal(lines.length, 1, "the encounter member renders the line once");
  assert.doesNotMatch(lines[0], /\{\{\{/, "the encounter skipped line uses escaped output");
}

console.log("generator-app.encounterSkipped.test.mjs: each encounter member names its skipped equipment and loot in one escaped line");
