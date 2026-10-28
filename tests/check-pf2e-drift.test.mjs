import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Importing the tool must not run the CLI or fetch anything.
const realFetch = globalThis.fetch;
const requested = [];
globalThis.fetch = async (url) => {
  requested.push(String(url));
  throw new Error("network is disabled in this test");
};
const tool = await import("../tools/check-pf2e-drift.mjs");
globalThis.fetch = realFetch;
assert.deepEqual(requested, [], "importing the drift tool must not fetch");

const {
  slugify, slugCandidates, isDocumentId, parseDefaultPacks, extractCatalogNames,
  extractSpellcasterProfiles, extractCompendiumRefs, manifestPacks, packDirectory,
  buildIndex, locateById, compareDocuments, classFindings, parseArgs, extractLegacyPackIds, missingPackFinding
} = tool;

// Slugs and document ids.
assert.equal(slugify("Fighter Dedication"), "fighter-dedication");
assert.equal(slugify("  Master Spotter (Ranger)  "), "master-spotter-ranger");
assert.equal(slugify("--Weird__Name!!"), "weird-name");
assert.deepEqual(slugCandidates("Investigator\x27s Stratagem"), ["investigator-s-stratagem", "investigators-stratagem"]);
assert.deepEqual(slugCandidates("Basic Maneuver"), ["basic-maneuver"]);
assert.equal(isDocumentId("dmK1wya8GBi9MmCB"), true);
assert.equal(isDocumentId("Skillful Lessons"), false);

// DEFAULT_PACKS: real entries count, comments do not.
const packsSample = [
  `export const DEFAULT_PACKS = {`,
  `  // comment with -srd and \x22quoted\x22 text`,
  `  abilities: [`,
  `    \x22pf2e.bestiary-ability-glossary-srd\x22,`,
  `    \x22pf2e.bestiary-family-ability-glossary\x22`,
  `  ],`,
  `  feats: [\x22pf2e.feats-srd\x22],`,
  `  // \x22pf2e.commented-out\x22 is not a pack`,
  `};`
].join("\n");
assert.deepEqual(parseDefaultPacks(packsSample), {
  abilities: ["pf2e.bestiary-ability-glossary-srd", "pf2e.bestiary-family-ability-glossary"],
  feats: ["pf2e.feats-srd"]
});

// LEGACY_PACK_IDS: read from source text. A missing legacy alias is a WARN; any other missing pack id is a FAIL.
const legacySample = [
  `export const DEFAULT_PACKS = {`,
  `  abilities: [\x22pf2e.bestiary-family-ability-glossary-srd\x22],`,
  `};`,
  `export const LEGACY_PACK_IDS = Object.freeze(new Set([`,
  `  // \x22quoted\x22 comment text is not an id`,
  `  \x22pf2e.bestiary-family-ability-glossary-srd\x22`,
  `]));`
].join("\n");
assert.deepEqual(extractLegacyPackIds(legacySample), ["pf2e.bestiary-family-ability-glossary-srd"]);
assert.equal(extractLegacyPackIds("export const DEFAULT_PACKS = {\n};"), null, "no LEGACY_PACK_IDS means no legacy aliases");
const compendiumSource = readFileSync(new URL("../scripts/compendium.mjs", import.meta.url), "utf8");
const legacyIds = new Set(extractLegacyPackIds(compendiumSource));
assert.deepEqual([...legacyIds], ["pf2e.bestiary-family-ability-glossary-srd"]);
const defaultIds = Object.values(parseDefaultPacks(compendiumSource)).flat();
for (const id of legacyIds) assert.ok(defaultIds.includes(id), id + " must be a DEFAULT_PACKS id");
const manifestPath = "static/system.json";
const legacyWarn = missingPackFinding({ category: "abilities", id: "pf2e.bestiary-family-ability-glossary-srd", legacyIds, manifestPath, ref: "master" });
assert.equal(legacyWarn.level, "WARN");
assert.equal(legacyWarn.check, "packs");
assert.equal(legacyWarn.message, "DEFAULT_PACKS.abilities: \x22pf2e.bestiary-family-ability-glossary-srd\x22 is a legacy alias not in static/system.json at master (expected for pre-8 compatibility)");
const nonLegacyFail = missingPackFinding({ category: "feats", id: "pf2e.feats-srd", legacyIds, manifestPath, ref: "master" });
assert.equal(nonLegacyFail.level, "FAIL");
assert.equal(nonLegacyFail.message, "DEFAULT_PACKS.feats: \x22pf2e.feats-srd\x22 is not a pack in static/system.json at master");
const withoutMarker = missingPackFinding({ category: "abilities", id: "pf2e.bestiary-family-ability-glossary-srd", legacyIds: new Set(), manifestPath, ref: "master" });
assert.equal(withoutMarker.level, "FAIL", "without the LEGACY_PACK_IDS marker the alias stays a FAIL");

// Compendium references: line numbers, name hints, dynamic and display-name tokens.
const refSample = [
  `// Flurry of Blows`,
  `const FLURRY_FEATURE = \x22Compendium.pf2e.classfeatures.Item.NLHHHiAcdnZ5ohc2\x22;`,
  `const NAMED = \x22Compendium.pf2e.classfeatures.Item.Skillful Lessons\x22;`,
  `const DYNAMIC = \`Compendium.pf2e.\${pack}.Item.\${id}\`;`
].join("\n");
const refs = extractCompendiumRefs(refSample);
assert.deepEqual(refs.map((ref) => [ref.pack, ref.id, ref.line]), [["classfeatures", "NLHHHiAcdnZ5ohc2", 2], ["classfeatures", "Skillful Lessons", 3]]);
assert.ok(refs[0].hints.exact.includes("flurry-of-blows"), "the comment above names the document");
assert.ok(refs[0].hints.words.includes("flurry"), "the identifier contributes words");
assert.equal(isDocumentId(refs[1].id), false);

// Manifest packs and directory mapping (master layout and 8.5.0 layout).
const manifest = { packs: [{ name: "feats-srd", path: "packs/feats" }, { name: "classfeatures", path: "packs/class-features" }] };
assert.equal(manifestPacks(manifest).get("feats-srd").path, "packs/feats");
assert.equal(packDirectory("packs/feats", new Set(["packs/feats"])), "packs/feats");
assert.equal(packDirectory("packs/class-features", new Set(["packs/pf2e/class-features"])), "packs/pf2e/class-features");
assert.equal(packDirectory("packs/conditions", new Set(["packs/pf2e/feats"])), null);

// Catalog names and spellcaster profiles.
const catalogSample = [
  `export const MULTICLASS_PACKAGES = Object.freeze([`,
  `  {`,
  `    slug: \x22fighter\x22,`,
  `    dedication: \x22Fighter Dedication\x22,`,
  `    feats: [`,
  `      { name: \x22Basic Maneuver\x22, requires: [] }`,
  `    ]`,
  `  }`,
  `]);`
].join("\n");
assert.deepEqual(extractCatalogNames(catalogSample), [
  { role: "dedication", name: "Fighter Dedication", line: 4 },
  { role: "feat", name: "Basic Maneuver", line: 6 }
]);
const tablesSample = [
  `const REMASTER_SPELLCASTERS = [`,
  `  { slug: \x22bard\x22, name: \x22Bard\x22, title: \x22Pathfinder Player Core\x22, mode: \x22spontaneous\x22 },`,
  `  { slug: \x22wizard\x22, name: \x22Wizard\x22, title: \x22Pathfinder Player Core\x22, mode: \x22prepared\x22 }`,
  `];`
].join("\n");
assert.deepEqual(extractSpellcasterProfiles(tablesSample).map((p) => [p.slug, p.name, p.title, p.line]), [
  ["bard", "Bard", "Pathfinder Player Core", 2],
  ["wizard", "Wizard", "Pathfinder Player Core", 3]
]);

// Class and name findings: casing is a warning, drift is a failure, an absent slug defers to the name.
const bard = { slug: "bard", name: "Bard", title: "Pathfinder Player Core" };
const remastered = { name: "Bard", system: { slug: "bard", publication: { title: "Pathfinder Player Core", remaster: true } } };
assert.deepEqual(classFindings(bard, remastered), []);
assert.deepEqual(classFindings(bard, { ...remastered, name: "bard" }).map((f) => f.level), ["WARN"]);
const drifted = { ...remastered, system: { slug: "bard", publication: { title: "Pathfinder Player Core (2026)", remaster: false } } };
assert.deepEqual(classFindings(bard, drifted).map((f) => f.level), ["FAIL", "FAIL"]);
assert.deepEqual(classFindings(bard, { ...remastered, system: { publication: { title: "Pathfinder Player Core", remaster: true } } }), []);
assert.equal(classFindings(bard, null)[0].level, "FAIL");

// Fixture comparison names the differing field and count.
const base = { name: "Guard", system: { slug: "guard", traits: { value: [] }, rules: [] } };
assert.deepEqual(compareDocuments(base, structuredClone(base)), []);
const changed = structuredClone(base);
changed.system.rules = [{ key: "GrantItem" }];
assert.deepEqual(compareDocuments(base, changed), ["system.rules differ (0 vs 1 entries)"]);

// Document location by _id, offline: exact stem, moved pack, missing, budget exhausted, pack unknown.
const index = buildIndex([
  { path: "packs/pf2e/feats", type: "tree" },
  { path: "packs/pf2e/feats/class/monk/stunning-blows.json", type: "blob" },
  { path: "packs/pf2e/feats/class/monk/other.json", type: "blob" },
  { path: "packs/pf2e/conditions/stunned.json", type: "blob" },
  { path: "README.md", type: "blob" }
]);
const files = {
  "packs/pf2e/feats/class/monk/stunning-blows.json": { _id: "8bMmGBO6gsMfWZk3" },
  "packs/pf2e/feats/class/monk/other.json": { _id: "otherIdOtherId00" },
  "packs/pf2e/conditions/stunned.json": { _id: "dfCMdR4wnpbYNTix" }
};
const read = async (path) => files[path] ?? null;
const feats = "packs/pf2e/feats";
const stunning = await locateById({ id: "8bMmGBO6gsMfWZk3", dir: feats, index, hints: { exact: ["stunning-blows"], words: [] }, document: read, budget: 60, scan: true });
assert.equal(stunning.status, "found");
assert.equal(stunning.path, "packs/pf2e/feats/class/monk/stunning-blows.json");
const moved = await locateById({ id: "dfCMdR4wnpbYNTix", dir: feats, index, hints: { exact: ["stunned"], words: [] }, document: read, budget: 60, scan: true });
assert.equal(moved.status, "moved");
assert.equal(moved.path, "packs/pf2e/conditions/stunned.json");
const absent = await locateById({ id: "AAAAAAAAAAAAAAAA", dir: feats, index, hints: { exact: [], words: [] }, document: read, budget: 60, scan: true });
assert.equal(absent.status, "missing");
const tight = await locateById({ id: "AAAAAAAAAAAAAAAA", dir: feats, index, hints: { exact: [], words: [] }, document: read, budget: 1, scan: true });
assert.equal(tight.status, "unresolvable");
const anywhere = await locateById({ id: "dfCMdR4wnpbYNTix", dir: null, index, hints: { exact: ["stunned"], words: [] }, document: read, budget: 60, scan: false });
assert.equal(anywhere.status, "found");

// v14-dev keeps the Wizard schools in a subdirectory of the class-features pack: the pack directory still holds them.
const v14 = buildIndex([
  { path: "packs/pf2e/class-features/wizard", type: "tree" },
  { path: "packs/pf2e/class-features/wizard/school-of-rooted-wisdom.json", type: "blob" },
  { path: "packs/pf2e/class-features/arcane-school.json", type: "blob" }
]);
const schoolFiles = {
  "packs/pf2e/class-features/wizard/school-of-rooted-wisdom.json": { _id: "RootedWisdomId16" },
  "packs/pf2e/class-features/arcane-school.json": { _id: "ArcaneSchoolId016" }
};
const readSchool = async (path) => schoolFiles[path] ?? null;
const rooted = await locateById({ id: "RootedWisdomId16", dir: "packs/pf2e/class-features", index: v14, hints: { exact: [], words: [] }, document: readSchool, budget: 60, scan: true });
assert.equal(rooted.status, "found");
assert.equal(rooted.path, "packs/pf2e/class-features/wizard/school-of-rooted-wisdom.json");

// A token-sized budget scans a whole pack with no name hint; the anonymous budget refuses the same pool.
const big = buildIndex(Array.from({ length: 100 }, (_, n) => ({ path: "packs/pf2e/equipment/item-" + n + ".json", type: "blob" })));
const bigFiles = Object.fromEntries(Array.from({ length: 100 }, (_, n) => ["packs/pf2e/equipment/item-" + n + ".json", { _id: "item-id-" + n }]));
const readBig = async (path) => bigFiles[path] ?? null;
const last = "item-id-99";
const scanned = await locateById({ id: last, dir: "packs/pf2e/equipment", index: big, hints: { exact: [], words: [] }, document: readBig, budget: 10000, scan: true });
assert.equal(scanned.status, "found");
assert.equal(scanned.path, "packs/pf2e/equipment/item-99.json");
const refused = await locateById({ id: last, dir: "packs/pf2e/equipment", index: big, hints: { exact: [], words: [] }, document: readBig, budget: 60, scan: true });
assert.equal(refused.status, "unresolvable");

// Arguments.
assert.deepEqual(parseArgs([]), { ref: "pf2e-8.5.0", json: false, help: false });
assert.deepEqual(parseArgs(["--ref", "pf2e-8.5.0", "--json"]), { ref: "pf2e-8.5.0", json: true, help: false });
assert.equal(parseArgs(["--ref=pf2e-8.5.0"]).ref, "pf2e-8.5.0");
assert.throws(() => parseArgs(["--ref"]), /needs a git ref/);
assert.throws(() => parseArgs(["--bogus"]), /unknown argument/);

// Raw reads retry 429 and 5xx responses and thrown network errors, then give up with the last response or error.
const response = (status, body = "{}") => ({ status, ok: status >= 200 && status < 300, headers: { get: () => null }, text: async () => body, json: async () => JSON.parse(body) });
const scripted = (steps) => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step instanceof Error) throw step;
    return step;
  };
  return { calls, fetchImpl };
};
{
  const once = scripted([response(503), response(200, "ok")]);
  const got = await tool.fetchWithRetry(once.fetchImpl, "https://example.test/a", {}, 0);
  assert.equal(got.status, 200, "a 503 followed by a 200 succeeds on the retry");
  assert.equal(once.calls.length, 2);
  const always = scripted([response(503)]);
  const last = await tool.fetchWithRetry(always.fetchImpl, "https://example.test/b", {}, 0);
  assert.equal(last.status, 503, "a 503 on every attempt returns the last response");
  assert.equal(always.calls.length, 3, "three attempts in all");
  const flaky = scripted([new Error("socket reset"), response(200, "ok")]);
  assert.equal((await tool.fetchWithRetry(flaky.fetchImpl, "https://example.test/c", {}, 0)).status, 200, "a thrown network error is retried");
  const broken = scripted([new Error("socket reset")]);
  await assert.rejects(tool.fetchWithRetry(broken.fetchImpl, "https://example.test/d", {}, 0), /network error reaching https:\/\/example\.test\/d: socket reset/);
  assert.equal(broken.calls.length, 3, "a thrown error is retried before it gives up");
  const notFound = scripted([response(404)]);
  assert.equal((await tool.fetchWithRetry(notFound.fetchImpl, "https://example.test/e", {}, 0)).status, 404, "a 404 is not retried");
  assert.equal(notFound.calls.length, 1);
}

// A whole run where one document returns 503 on every read: the reference becomes a WARN and the run completes.
// The tree listing and the manifest answer normally, so the run is not an exit-2 failure.
{
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = mkdtempSync(join(tmpdir(), "drift-test-"));
  try {
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "tests", "fixtures"), { recursive: true });
    writeFileSync(join(root, "tests", "fixtures", ".keep"), "");
    writeFileSync(join(root, "scripts", "compendium.mjs"), 'export const DEFAULT_PACKS = {\n  feats: ["pf2e.feats-srd"]\n};\nexport const LEGACY_PACK_IDS = new Set([\n]));\n');
    writeFileSync(join(root, "scripts", "pc-multiclass.mjs"), "export const MULTICLASS_PACKAGES = Object.freeze([\n]);\n");
    writeFileSync(join(root, "scripts", "pc-tables.mjs"), "const REMASTER_SPELLCASTERS = [\n];\n");
    writeFileSync(join(root, "scripts", "refs.mjs"), 'export const DOC = "Compendium.pf2e.feats-srd.Item.AAAAAAAAAAAAAAAA";\n');
    const json = (body) => response(200, JSON.stringify(body));
    const treeBody = { truncated: false, tree: [{ path: "packs/feats", type: "tree" }, { path: "packs/feats/doc.json", type: "blob" }] };
    const fetchImpl = async (url) => {
      const text = String(url);
      if (text.includes("/git/trees/")) return json(treeBody);
      if (text.endsWith("/static/system.json")) return json({ packs: [{ name: "feats-srd", path: "packs/feats" }] });
      if (text.endsWith("/packs/feats/doc.json")) return response(503, "unavailable");
      return response(404);
    };
    const result = await tool.runDriftCheck({ ref: "pf2e-8.5.0", token: "", fetchImpl, root, retryDelayMs: 0 });
    assert.equal(result.failures, 0, "an unreadable document is not a failure");
    const warned = result.findings.filter((finding) => finding.level === "WARN" && /could not be read from upstream/.test(finding.message));
    assert.equal(warned.length, 1, "the unreadable reference is one WARN");
    assert.match(warned[0].message, /scripts\/refs\.mjs:1: Compendium\.pf2e\.feats-srd\.Item\.AAAAAAAAAAAAAAAA could not be read from upstream: raw read returned 503/);
    assert.equal(result.checked > 0, true, "the run finished every check");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log("check-pf2e-drift helper tests passed");
