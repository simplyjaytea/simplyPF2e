// Execute production preview mapping and aggregation, not a copied helper.
// Test-only source instrumentation exposes four private seams so fixtures can
// seed the draft without provider calls or Foundry writes; method bodies remain
// unchanged. All other private members and production imports remain in place.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

if (!vm.SourceTextModule) {
  const run = spawnSync(process.execPath, ["--experimental-vm-modules", import.meta.filename], { stdio: "inherit" });
  process.exit(run.status ?? 1);
}
const source = (await readFile(new URL("./generator-app.mjs", import.meta.url), "utf8"))
  .replace(/#(concept|resolved|buildPreviewContext|matchSummary)\b/g, "_test_$1");
const context = vm.createContext({ console, game: { i18n: { format: (_key, { matched, total }) => `${matched}/${total}` } } });
const mocks = { SpfApp: class {}, MODULE_ID: "simplypf2e", computeStats: () => ({}) };
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
const app = new module.namespace.GeneratorApp();
function matchSummary(...groups) {
  const result = app._test_matchSummary(...groups);
  return result && { matched: result.matched, total: result.total };
}
assert.deepEqual(matchSummary([{ found: true }], [{ found: false }, { found: true }], [{ found: true }]), { matched: 3, total: 4 });
assert.deepEqual(matchSummary([{ found: true }, { found: true }], [{ found: true }]), { matched: 3, total: 3 });
assert.deepEqual(matchSummary([{ found: false }], [{ found: false }, { found: false }]), { matched: 0, total: 3 });
assert.equal(matchSummary(), null);
assert.equal(matchSummary([], [], []), null);
assert.deepEqual(matchSummary([null], [{ found: true }, undefined, { found: false }]), { matched: 1, total: 2 });
assert.deepEqual(matchSummary([{ found: true, narrative: true }, { found: false, narrative: false }]), { matched: 0, total: 1 });
assert.equal(matchSummary([{ found: false, narrative: true }]), null);

// The live courier had twelve real matches plus one narrative-only ability.
// This exercises the production caller that previously dropped `narrative`.
app._test_concept = {
  rarity: "common", size: "sm", traits: [], speeds: [], senses: [],
  languages: [], immunities: [], resistances: [], weaknesses: []
};
app._test_resolved = {
  abilities: [{ ability: { name: "Nimble Escape", narrative: true, description: "Custom flavor" }, entry: null }],
  equipment: Array.from({ length: 12 }, (_, i) => ({ name: `Item ${i}`, entry: { name: `Item ${i}` } }))
};
let preview = app._test_buildPreviewContext();
assert.equal(preview.matchSummary.text, "12/12", "narrative marker must survive the production caller mapping");
assert.equal(preview.abilities.length, 1, "narrative ability remains visible");
assert.equal(preview.abilities[0].narrative, true, "narrative-only label remains present");
app._test_resolved.abilities.push({ ability: { name: "Unresolved published ability", narrative: false }, entry: null });
preview = app._test_buildPreviewContext();
assert.equal(preview.matchSummary.text, "12/13", "unresolved non-narrative ability must still count as a miss");
app._test_resolved.equipment.push({ name: "Unresolved equipment", entry: null });
preview = app._test_buildPreviewContext();
assert.equal(preview.matchSummary.text, "12/14", "unresolved required equipment must not disappear from the denominator");
app._test_resolved.abilities = app._test_resolved.abilities.slice(0, 1);
app._test_resolved.equipment = [];
assert.equal(app._test_buildPreviewContext().matchSummary, null, "narrative-only preview has no published-content denominator");
console.log("generator-app.matchSummary.test.mjs: production preview and summary assertions passed");
