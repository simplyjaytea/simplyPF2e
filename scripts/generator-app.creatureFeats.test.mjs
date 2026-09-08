// Production NPC integration, with provider/catalog/native writes isolated at
// import edges. The actual caller controls requirement binding and recovery.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

if (!vm.SourceTextModule) {
  const run = spawnSync(process.execPath, ["--experimental-vm-modules", import.meta.filename], { stdio: "inherit" });
  process.exit(run.status ?? 1);
}
const source = (await readFile(new URL("./generator-app.mjs", import.meta.url), "utf8"))
  .replace(/#refineCreatureFeats\b/g, "_test_refineCreatureFeats");
const warnings = [], tokens = [];
const context = vm.createContext({
  console: { warn: (...args) => warnings.push(args) },
  game: { i18n: { localize: (key) => key } }
});
const norm = (name) => String(name ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const candidate = (id, name, level = 1) => ({ id, name, level, ref: { packId: "pf2e.feats-srd", _id: id } });
const charge = candidate("charge", "Sudden Charge");
const parry = candidate("parry", "Dueling Parry");
const unsupported = candidate("stun", "Stunning Blows", 2);
const high = candidate("high", "High Level Ability", 20);
const pick = (item) => ({ name: item.name, candidate: item.ref });
let catalog, selection, failure, query, receivedSignal, offered, filtered, cancelled, planFailure;
let calls = 0, skips = 0, requestConcept, packagePlan;
const usage = { total: 30 };
const mocks = {
  SpfApp: class {
    _recordTokens(label, value) { if (value) tokens.push({ label, usage: value }); }
    _progressCallback() { return () => {}; }
    _skipStep() { skips++; }
    _throwIfCancelled() { if (cancelled) throw Object.assign(new Error("cancelled"), { cancelled: true }); }
  },
  MODULE_ID: "simplypf2e", normalizeCreatureFeatName: norm,
  getCreatureFeatCandidates: async (args) => { query = args; return catalog; },
  filterNpcAbilityCandidates: async (items, { limit }) => {
    filtered = items;
    return { candidates: items.filter((item) => item.id !== "stun").slice(0, limit),
      unavailable: items.filter((item) => item.id === "stun").map((candidate) => ({ candidate, reason: "class DC bridge unavailable" })) };
  },
  resolveNpcAbilityPackages: async (items) => {
    if (planFailure) throw planFailure;
    const cost = items.reduce((sum, item) => sum + (item.candidate._id === "charge" ? 2 : 1), 0);
    if (cost > 3) throw Object.assign(new Error("Whole package budget exceeded"), { code: "NPC_ABILITY_BUDGET_EXCEEDED" });
    packagePlan = { cost, names: items.map((item) => item.name) };
    return packagePlan;
  },
  selectCreatureFeats: async ({ concept, candidates, signal }) => {
    requestConcept = concept;
    calls++; offered = candidates; receivedSignal = signal;
    if (failure) throw failure;
    return selection;
  }
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
const app = new module.namespace.GeneratorApp();
const signal = new AbortController().signal;
const fresh = (extra = {}) => ({ level: 4, gmPrompt: "A master duelist in a tavern", feats: ["Stunning Blows"], ...extra });
function reset() {
  catalog = [unsupported, charge, parry, high];
  selection = { feats: [pick(parry)], status: "selected", omitted: false, usage };
  failure = null; cancelled = false; planFailure = null;
}
reset();
let concept = fresh();
await app._test_refineCreatureFeats(concept, signal);
assert.deepEqual([...concept.feats], selection.feats, "supported source alternative replaces AI-only unsupported suggestions in one request");
assert.equal(query.limit, null, "support filtering happens before bounded offer");
assert.equal(query.level, 24, "full name catalog can discover omitted above-level requirements");
assert.equal(query.prompt, concept.gmPrompt);
assert.deepEqual([...query.preferredNames], ["Stunning Blows"]);
assert.deepEqual(Array.from(offered, (item) => item.name), ["Sudden Charge", "Dueling Parry"]);
assert.equal(receivedSignal, signal);
assert.equal(tokens.at(-1).usage, usage);
assert.equal(packagePlan.cost, 1);

selection = { feats: [], status: "empty", omitted: true, usage };
concept = fresh();
await app._test_refineCreatureFeats(concept);
assert.equal(concept.feats.length, 0, "valid empty selection can omit an AI-only wishlist");

// Provider omission cannot override a locally named source requirement, even
// when the original concept omitted it entirely or called it optional.
concept = fresh({ gmPrompt: "A guard with Sudden Charge.", feats: [] });
await app._test_refineCreatureFeats(concept);
assert.equal(concept.feats[0].candidate._id, "charge");
assert.equal(requestConcept.feats.length, 1, "request gets nonempty required wishlist even if AI draft omitted it");
assert.equal(packagePlan.cost, 2, "required supporting power is charged to union budget");

const duplicate = { ...charge, id: "other-charge", ref: { packId: "world.feats", _id: "other-charge" } };
catalog = [charge, duplicate];
selection = { feats: [pick(duplicate)], status: "selected", usage };
concept = fresh({ gmPrompt: "A warrior with Sudden Charge" });
await app._test_refineCreatureFeats(concept);
assert.equal(concept.feats.length, 1);
assert.equal(concept.feats[0].candidate.packId, "world.feats", "same-name user binding retains selector's exact source identity");

reset();
for (const gmPrompt of ["A guard without Stunning Blows", "Do not give Crane Stance", "Sudden Charge is forbidden", "Don't give Sudden Charge", "Dueling Parry instead of Sudden Charge"]) {
  const before = calls;
  await assert.rejects(app._test_refineCreatureFeats(fresh({ gmPrompt, feats: ["Crane Stance"] })),
    (error) => error.code === "NPC_ABILITY_REQUIREMENT_AMBIGUOUS");
  assert.equal(calls, before, "negated mentions cannot be forced into positive requirements");
}
for (const gmPrompt of [
  "A peaceful tavern keeper named Sudden Charge.",
  'A keeper of the "Sudden Charge" inn.',
  "A storyteller recalls Sudden Charge.",
  "A guard with Sudden Charge painted on a sign."
]) {
  const before = calls;
  const value = fresh({ gmPrompt, feats: [] });
  await assert.rejects(app._test_refineCreatureFeats(value), (error) => error.code === "NPC_ABILITY_REQUIREMENT_AMBIGUOUS");
  assert.equal(calls, before, "narrative source-name mentions cannot grant mechanics");
  assert.equal(value.feats.length, 0);
}
for (const gmPrompt of ["A captain with Sudden Charge, accompanied by an apprentice healer.", "All guards have Sudden Charge."]) {
  const before = calls;
  const value = fresh({ gmPrompt, feats: [] });
  await assert.rejects(app._test_refineCreatureFeats(value, signal, { encounter: true }),
    (error) => error.code === "NPC_ABILITY_ENCOUNTER_REQUIREMENT_AMBIGUOUS");
  assert.equal(calls, before, "a theme cannot authorize assigning the same feat to every encounter member");
  assert.equal(value.feats.length, 0);
}
assert.equal(module.namespace.creatureFeatRequirements("A master of Sudden Chargement", [], [charge]).length, 0,
  "whole-name binding does not treat a substring as a required feat");
for (const options of [
  { gmPrompt: "Must have Stunning Blows", feats: [] },
  { gmPrompt: "Give this NPC Deflect Arrow", feats: [{ name: "Deflect Arrow", required: false }] },
  { gmPrompt: "A guard with High Level Ability", feats: [] }
]) {
  const before = calls;
  concept = fresh(options);
  await assert.rejects(app._test_refineCreatureFeats(concept), (error) => error.code === "NPC_ABILITY_REQUIRED_UNSUPPORTED");
  assert.equal(calls, before, "unsupported explicit requirements stop before selection spend");
  assert.equal(concept.feats, options.feats, "failed requirement keeps original draft untouched");
}

for (const bad of [
  { feats: [], omitted: false, usage }, { feats: [], usage }
]) {
  selection = bad; concept = fresh(); const draft = concept.feats;
  await assert.rejects(app._test_refineCreatureFeats(concept), (error) => error.code === "NPC_FEAT_SELECTION_INVALID");
  assert.equal(concept.feats, draft);
}

reset();
for (const code of ["NPC_FEAT_SELECTION_INVALID", "NPC_FEAT_REQUEST_FAILED"]) {
  failure = Object.assign(new Error("Provider selection rejected"), { code, usage });
  concept = fresh(); const draft = concept.feats, before = calls;
  await assert.rejects(app._test_refineCreatureFeats(concept), (error) => error === failure);
  assert.equal(calls, before + 1, "invalid output cannot trigger a repair request or arbitrary local replacement");
  assert.equal(concept.feats, draft);
  assert.equal(tokens.at(-1).usage, usage, "failed request spend retained at original stage");
}
reset(); catalog = [];
concept = fresh();
await assert.rejects(app._test_refineCreatureFeats(concept), (error) => error.code === "NPC_FEAT_CATALOG_UNAVAILABLE");
reset(); catalog = [unsupported];
await assert.rejects(app._test_refineCreatureFeats(fresh()), (error) => error.code === "NPC_ABILITY_CATALOG_UNAVAILABLE");

reset();
const third = candidate("third", "Third Ability");
catalog.push(third);
selection = { feats: [pick(charge), pick(parry), pick(third)], status: "selected", usage };
concept = fresh({ gmPrompt: "A duelist with Third Ability" });
await app._test_refineCreatureFeats(concept);
assert.deepEqual(Array.from(concept.feats, (item) => item.name), ["Sudden Charge", "Third Ability"], "trim optional power, retain explicit requirement within whole package cost");
assert.equal(packagePlan.cost, 3);
concept = fresh({ gmPrompt: "A warrior with Sudden Charge; with Dueling Parry; with Third Ability" });
const draft = concept.feats;
await assert.rejects(app._test_refineCreatureFeats(concept), (error) => error.code === "NPC_ABILITY_BUDGET_EXCEEDED");
assert.equal(concept.feats, draft, "over-budget requirements fail atomically");

reset(); cancelled = true;
await assert.rejects(app._test_refineCreatureFeats(fresh()), (error) => error.cancelled);
reset();
const before = calls, beforeSkips = skips;
await app._test_refineCreatureFeats(fresh({ feats: [] }));
assert.equal(calls, before);
assert.equal(skips, beforeSkips + 1);
console.log("generator-app.creatureFeats.test.mjs: supported automatic selection, required source binding, budget and failure boundaries passed");
