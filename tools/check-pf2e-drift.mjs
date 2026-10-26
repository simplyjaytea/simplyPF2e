#!/usr/bin/env node
/**
 * Opt-in pf2e drift check (needs the network). It compares what this module assumes about upstream
 * foundryvtt/pf2e (pack ids, Compendium.pf2e UUIDs, catalog names, REMASTER_SPELLCASTERS, fixtures)
 * with one ref of that repository. It is deliberately NOT part of tools/check.mjs, which stays offline.
 *
 * Run: node tools/check-pf2e-drift.mjs [--ref <git-ref>] [--json]
 *   --ref   branch, tag or commit of foundryvtt/pf2e (default master), e.g. pf2e-8.5.0
 *   --json  one JSON object (findings, pack mapping, request counts) instead of finding lines
 * Exit: 0 no FAIL, 1 at least one FAIL, 2 the check could not run (network, rate limit, unknown ref).
 * GITHUB_TOKEN, when set, is sent as a bearer token to the REST API and raises the per-reference fetch budget.
 *
 * Requests per run: one REST call (git/trees/<ref>?recursive=1, a single listing of the whole ref, so
 * directory listings cost nothing more), a few raw.githubusercontent.com reads for the system manifest, and
 * one raw read per candidate document (cached within the run). Raw reads do not count against the REST quota.
 *
 * Strategy
 * - Pack map: the ref's system manifest (the first that exists of static/system.json, system.json and
 *   system.pf2e.json) lists each pack's name and path. The directory is that path when it exists in the
 *   tree (master layout: packs/feats), otherwise packs/pf2e/<last path segment> (8.5.0 layout).
 *   A DEFAULT_PACKS id the manifest does not list is FAIL, or WARN when LEGACY_PACK_IDS in scripts/compendium.mjs names it.
 * - Compendium.pf2e.<pack>.Item.<id> references in scripts/*.mjs: a filename is a slug, not an id, so a
 *   document is proven only by reading its own _id. Candidates are read in this order and the first _id
 *   match wins: (1) exact basenames named by nearby text (json paths and quoted or commented phrases in the
 *   reference line and the three lines above, plus the JS identifier, slugified); (2) basenames containing an
 *   identifier word; (3) every JSON file in the pack directory, only when it fits the fetch budget; (4) exact
 *   basenames in other packs, which reports a document that moved. A reference still unresolved is WARN
 *   "unresolvable without a token" when the directory was too large to read, or FAIL "missing" when the whole
 *   directory was read. Tokens that are display names rather than 16-character ids are WARN and never guessed.
 * - Catalog names (pc-multiclass.mjs dedications and feats; pc-tables.mjs REMASTER_SPELLCASTERS): the slug is
 *   slugify(name), also tried with the apostrophes removed because pf2e drops them (the Investigator form
 *   becomes investigators). The basename is searched in the feats or classes directory, read, and its name
 *   compared exactly (a casing-only difference is WARN). Classes also need system.slug, system.publication.title
 *   and system.publication.remaster === true to match the module.
 * - Fixtures (tests/fixtures/**.json with a top-level _id and name, or a _stats.compendiumSource): the upstream
 *   document is located by _id (pack taken from compendiumSource when present, otherwise same-name basenames in
 *   any pack). Then name, system.slug, system.traits and system.rules are compared; differences are WARN.
 *
 * Only the pure helpers are exported, so tests/check-pf2e-drift.test.mjs runs offline. The CLI runs only as main.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
export const UPSTREAM = { owner: "foundryvtt", repo: "pf2e", systemId: "pf2e" };
export const DEFAULT_REF = "master";
const MANIFEST_PATHS = ["static/system.json", "system.json", "system.pf2e.json"];
const CANDIDATE_LIMIT = 8;
const FETCH_BUDGET = { anonymous: 60, token: 300 };
const MODULE_ROOT = fileURLToPath(new URL("../", import.meta.url));
const USAGE = "usage: node tools/check-pf2e-drift.mjs [--ref <git-ref>] [--json]";
const DOCUMENT_ID = /^[A-Za-z0-9]{16}$/;
const COMPENDIUM_UUID = /Compendium\.pf2e\.([A-Za-z0-9-]+)\.Item\.([A-Za-z0-9][A-Za-z0-9 \x27’-]*)/g;
const JSON_STEM = /([a-z0-9][a-z0-9-]*)\.json/gi;
const DOUBLE_QUOTED = /\x22([^\x22\n]+)\x22/g;
const LINE_COMMENT = /\/\/\s?(.*)$/;
export const slugify = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** pf2e drops apostrophes from slugs (the Investigator form is investigators-stratagem), so both forms are tried. */
export const slugCandidates = (name) => {
  const plain = String(name).replace(/[\x27’]/g, "");
  return [...new Set([slugify(name), slugify(plain)])].filter(Boolean);
};

export const isDocumentId = (id) => DOCUMENT_ID.test(id);

export const stemOf = (path) => path.slice(path.lastIndexOf("/") + 1).replace(/\.json$/, "");

const lineNumberAt = (text, offset) => text.slice(0, offset).split("\n").length;

/** Text between two markers, plus the 1-based line where it starts. Null when either marker is missing. */
const blockBetween = (text, startMarker, endMarker) => {
  const start = text.indexOf(startMarker);
  const end = start === -1 ? -1 : text.indexOf(endMarker, start);
  if (end === -1) return null;
  return { text: text.slice(start, end), line: lineNumberAt(text, start) };
};

/** Category to pack ids from the DEFAULT_PACKS object literal in scripts/compendium.mjs. Null when absent. */
export const parseDefaultPacks = (text) => {
  const block = blockBetween(text, "export const DEFAULT_PACKS", "\n};");
  if (!block) return null;
  const categories = {};
  let current = null;
  for (const line of block.text.split("\n")) {
    const code = line.replace(/\/\/.*$/, "");
    const key = /^\s*([A-Za-z_]\w*)\s*:/.exec(code);
    if (key) {
      current = key[1];
      categories[current] = [];
    }
    if (current) for (const match of code.matchAll(DOUBLE_QUOTED)) categories[current].push(match[1]);
  }
  return categories;
};

/** Pack ids in the LEGACY_PACK_IDS Set in scripts/compendium.mjs. Null when absent. */
export const extractLegacyPackIds = (text) => {
  const block = blockBetween(text, "export const LEGACY_PACK_IDS", "\n]));");
  if (!block) return null;
  const ids = [];
  for (const line of block.text.split("\n")) {
    const code = line.replace(/\/\/.*$/, "");
    for (const match of code.matchAll(DOUBLE_QUOTED)) ids.push(match[1]);
  }
  return ids;
};

/** Dedication and feat names from MULTICLASS_PACKAGES in scripts/pc-multiclass.mjs. Null when absent. */
export const extractCatalogNames = (text) => {
  const block = blockBetween(text, "export const MULTICLASS_PACKAGES", "\n]);");
  if (!block) return null;
  const names = [];
  block.text.split("\n").forEach((line, offset) => {
    const at = block.line + offset;
    const dedication = /\bdedication:\s*\x22([^\x22]+)\x22/.exec(line);
    if (dedication) names.push({ role: "dedication", name: dedication[1], line: at });
    const feat = /\bname:\s*\x22([^\x22]+)\x22/.exec(line);
    if (feat) names.push({ role: "feat", name: feat[1], line: at });
  });
  return names;
};

/** Slug, name and publication title of each REMASTER_SPELLCASTERS entry in scripts/pc-tables.mjs. Null when absent. */
export const extractSpellcasterProfiles = (text) => {
  const block = blockBetween(text, "const REMASTER_SPELLCASTERS", "\n];");
  if (!block) return null;
  const profiles = [];
  const entry = /\{\s*slug:\s*\x22([^\x22]+)\x22,\s*name:\s*\x22([^\x22]+)\x22,\s*title:\s*\x22([^\x22]+)\x22/g;
  for (const match of block.text.matchAll(entry)) {
    const newlines = block.text.slice(0, match.index).split("\n").length - 1;
    profiles.push({ slug: match[1], name: match[2], title: match[3], line: block.line + newlines });
  }
  return profiles;
};

/**
 * Hints for the document behind a reference: exact basenames (json path stems and quoted or commented phrases
 * in the reference line and the three lines above, plus the declared identifier) and identifier words.
 */
const nameHints = (lines, index, id) => {
  const exact = new Set();
  for (const text of lines.slice(Math.max(0, index - 3), index + 1)) {
    const code = text.split(id).join(" ");
    for (const match of code.matchAll(JSON_STEM)) exact.add(match[1].toLowerCase());
    const phrases = [...code.matchAll(DOUBLE_QUOTED)].map((match) => match[1]);
    const comment = LINE_COMMENT.exec(code);
    if (comment) phrases.push(comment[1]);
    for (const phrase of phrases) {
      if (/[.@]|Compendium/.test(phrase) || phrase.trim().split(/\s+/).length > 6) continue;
      exact.add(slugify(phrase));
    }
  }
  const words = [];
  const declared = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/.exec(lines[index]);
  if (declared) {
    exact.add(slugify(declared[1]));
    for (const word of declared[1].replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z]+/)) {
      if (word.length >= 4) words.push(word);
    }
  }
  exact.delete("");
  return { exact: [...exact], words: [...new Set(words)] };
};

/** Every Compendium.pf2e.<pack>.Item.<token> in a file. Dynamic (${...}) references are not matched. */
export const extractCompendiumRefs = (text) => {
  const lines = text.split("\n");
  const refs = [];
  lines.forEach((line, index) => {
    for (const match of line.matchAll(COMPENDIUM_UUID)) {
      const id = match[2].trim();
      const uuid = "Compendium." + UPSTREAM.systemId + "." + match[1] + ".Item." + id;
      refs.push({ pack: match[1], id, uuid, line: index + 1, hints: nameHints(lines, index, id) });
    }
  });
  return refs;
};

/** Pack name to { name, path } from a system manifest packs array. */
export const manifestPacks = (manifest) => {
  const packs = new Map();
  const list = Array.isArray(manifest?.packs) ? manifest.packs : [];
  for (const pack of list) {
    if (typeof pack?.name === "string") packs.set(pack.name, { name: pack.name, path: String(pack.path ?? "") });
  }
  return packs;
};

/** Directory for a manifest pack path: the path itself, or packs/<system>/<last segment> (8.5.0 layout). */
export const packDirectory = (packPath, directories) => {
  const normalized = packPath.replace(/^\.?\/+/, "").replace(/\/+$/, "");
  const segment = normalized.split("/").pop();
  const candidates = [normalized, "packs/" + UPSTREAM.systemId + "/" + segment];
  return candidates.find((dir) => directories.has(dir)) ?? null;
};

/** Directory set and JSON file list under packs/, from the recursive git tree entries. */
export const buildIndex = (entries) => {
  const directories = new Set();
  const jsonFiles = [];
  for (const entry of entries) {
    if (!entry.path.startsWith("packs/")) continue;
    if (entry.type === "tree") directories.add(entry.path);
    else if (entry.type === "blob" && entry.path.endsWith(".json")) jsonFiles.push(entry.path);
  }
  return { directories, jsonFiles, under: new Map() };
};

export const jsonUnder = (index, dir) => {
  if (!index.under.has(dir)) index.under.set(dir, index.jsonFiles.filter((path) => path.startsWith(dir + "/")));
  return index.under.get(dir);
};

/**
 * Finds the document whose _id is id. The pool is one pack directory, or every pack when dir is null.
 * document(path) reads and parses one file (null when absent). Result status: found, moved (found in another
 * pack), missing (the whole pool was read) or unresolvable (the pool is larger than the fetch budget).
 */
export const locateById = async (options) => {
  const { id, dir, index, hints, document, budget, scan } = options;
  const pool = dir ? jsonUnder(index, dir) : index.jsonFiles;
  const others = dir ? index.jsonFiles.filter((path) => !path.startsWith(dir + "/")) : [];
  const docs = new Map();
  const probe = async (path) => {
    if (!docs.has(path)) docs.set(path, await document(path));
    return docs.get(path)?._id === id;
  };
  const found = (path, status) => ({ status, path, doc: docs.get(path), poolSize: pool.length, fetched: docs.size });
  const named = (list) => list.filter((path) => hints.exact.includes(stemOf(path)));
  for (const path of named(pool).slice(0, CANDIDATE_LIMIT)) if (await probe(path)) return found(path, "found");
  const scored = pool
    .map((path) => ({ path, n: hints.words.filter((word) => stemOf(path).includes(word)).length }))
    .filter((item) => item.n > 0)
    .sort((a, b) => b.n - a.n || a.path.length - b.path.length);
  for (const item of scored.slice(0, CANDIDATE_LIMIT)) if (await probe(item.path)) return found(item.path, "found");
  const unread = pool.filter((path) => !docs.has(path)).length;
  const scannable = scan && unread <= budget - docs.size;
  if (scannable) {
    for (const path of pool) if (!docs.has(path) && (await probe(path))) return found(path, "found");
  }
  for (const path of named(others).slice(0, CANDIDATE_LIMIT)) if (await probe(path)) return found(path, "moved");
  const status = scannable || !dir ? "missing" : "unresolvable";
  return { status, poolSize: pool.length, fetched: docs.size };
};

const short = (value) => {
  const text = JSON.stringify(value) ?? "undefined";
  return text.length > 60 ? text.slice(0, 57) + "..." : text;
};

/** Fields compared between a fixture and its upstream document: name, system.slug, system.traits, system.rules. */
export const compareDocuments = (fixture, upstream) => {
  const diffs = [];
  if (fixture.name !== upstream.name) diffs.push("name " + short(fixture.name) + " vs " + short(upstream.name));
  if (!isDeepStrictEqual(fixture.system?.slug, upstream.system?.slug)) {
    diffs.push("system.slug " + short(fixture.system?.slug) + " vs " + short(upstream.system?.slug));
  }
  if (!isDeepStrictEqual(fixture.system?.traits, upstream.system?.traits)) {
    diffs.push("system.traits " + short(fixture.system?.traits) + " vs " + short(upstream.system?.traits));
  }
  if (!isDeepStrictEqual(fixture.system?.rules, upstream.system?.rules)) {
    const mine = Array.isArray(fixture.system?.rules) ? fixture.system.rules.length : 0;
    const theirs = Array.isArray(upstream.system?.rules) ? upstream.system.rules.length : 0;
    const same = mine === theirs ? ", same count" : "";
    diffs.push("system.rules differ (" + mine + " vs " + theirs + " entries" + same + ")");
  }
  return diffs;
};

/** null when the name matches; WARN for a casing-only difference; FAIL otherwise. */
export const nameFinding = (expected, actual) => {
  if (actual === expected) return null;
  if (typeof actual === "string" && actual.toLowerCase() === String(expected).toLowerCase()) {
    return { level: "WARN", message: "name is " + JSON.stringify(actual) + ", module expects " + JSON.stringify(expected) + " (casing only)" };
  }
  return { level: "FAIL", message: "name is " + JSON.stringify(actual) + ", module expects " + JSON.stringify(expected) };
};

/** Findings for one REMASTER_SPELLCASTERS profile against its upstream class document. */
export const classFindings = (profile, doc) => {
  if (!doc || typeof doc !== "object") return [{ level: "FAIL", message: profile.slug + ".json is missing or unreadable" }];
  const findings = [];
  const naming = nameFinding(profile.name, doc.name);
  if (naming) findings.push(naming);
  const publication = doc.system?.publication ?? {};
  const docSlug = doc.system?.slug;
  if (docSlug && docSlug !== profile.slug) {
    findings.push({ level: "FAIL", message: "system.slug is " + JSON.stringify(docSlug) + ", module expects " + JSON.stringify(profile.slug) });
  }
  if (publication.title !== profile.title) {
    findings.push({ level: "FAIL", message: "system.publication.title is " + JSON.stringify(publication.title) + ", module expects " + JSON.stringify(profile.title) });
  }
  if (publication.remaster !== true) {
    findings.push({ level: "FAIL", message: "system.publication.remaster is " + JSON.stringify(publication.remaster) + ", module expects true" });
  }
  return findings;
};

export const parseArgs = (argv) => {
  const options = { ref: DEFAULT_REF, json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--ref" || arg.startsWith("--ref=")) {
      const value = arg === "--ref" ? argv[++i] : arg.slice("--ref=".length);
      if (!value || !/^[A-Za-z0-9._\/-]+$/.test(value)) {
        throw new Error("--ref needs a git ref such as master or pf2e-8.5.0 (got " + (value ?? "") + ")");
      }
      options.ref = value;
    } else {
      throw new Error("unknown argument " + JSON.stringify(arg));
    }
  }
  return options;
};

/** Thin GitHub reader: one REST tree call per run, raw reads cached per path. Never writes. */
const createGitHub = (token, fetchImpl) => {
  const counts = { api: 0, raw: 0 };
  const texts = new Map();
  const jsons = new Map();
  const send = async (url, headers) => {
    try {
      return await fetchImpl(url, { headers });
    } catch (error) {
      throw new Error("network error reaching " + url + ": " + error.message);
    }
  };
  const readText = (ref, path) => {
    const key = ref + "\n" + path;
    if (!texts.has(key)) {
      texts.set(key, (async () => {
        counts.raw += 1;
        const encoded = [...ref.split("/"), ...path.split("/")].map((part) => encodeURIComponent(part)).join("/");
        const url = "https://raw.githubusercontent.com/" + UPSTREAM.owner + "/" + UPSTREAM.repo + "/" + encoded;
        const response = await send(url, {});
        if (response.status === 404) return null;
        if (!response.ok) throw new Error("raw read returned " + response.status + " for " + url);
        return response.text();
      })());
    }
    return texts.get(key);
  };
  const readJson = (ref, path) => {
    const key = ref + "\n" + path;
    if (!jsons.has(key)) {
      jsons.set(key, (async () => {
        const text = await readText(ref, path);
        if (text === null) return null;
        try {
          return JSON.parse(text);
        } catch {
          return undefined;
        }
      })());
    }
    return jsons.get(key);
  };
  const tree = async (ref) => {
    counts.api += 1;
    const url = "https://api.github.com/repos/" + UPSTREAM.owner + "/" + UPSTREAM.repo + "/git/trees/" + encodeURIComponent(ref) + "?recursive=1";
    const headers = { Accept: "application/vnd.github+json", "User-Agent": "simplypf2e-drift-check", "X-GitHub-Api-Version": "2022-11-28" };
    if (token) headers.Authorization = "Bearer " + token;
    const response = await send(url, headers);
    if (response.status === 404) throw new Error("ref " + ref + " does not exist in " + UPSTREAM.owner + "/" + UPSTREAM.repo);
    const limited = response.status === 429 || (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0");
    if (limited) {
      const reset = Number(response.headers.get("x-ratelimit-reset"));
      const when = reset ? " until " + new Date(reset * 1000).toISOString() : "";
      throw new Error("GitHub API rate limit reached" + when + "; set GITHUB_TOKEN or retry later");
    }
    if (!response.ok) throw new Error("GitHub API returned " + response.status + " for " + url);
    const body = await response.json();
    if (body.truncated) throw new Error("git tree for " + ref + " is truncated, so the packs cannot be listed");
    return body.tree;
  };
  return { counts, tree, text: readText, json: readJson };
};

const loadManifest = async (github, ref) => {
  for (const path of MANIFEST_PATHS) {
    const text = await github.text(ref, path);
    if (text === null) continue;
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(path + " at " + ref + " is not valid JSON");
    }
    if (Array.isArray(json?.packs)) return { path, json };
  }
  throw new Error("no system manifest at " + ref + " (tried " + MANIFEST_PATHS.join(", ") + ")");
};

/** Absolute paths of every file under a directory that ends with the suffix, sorted. */
const walk = (directory, suffix) => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path, suffix);
    return entry.isFile() && entry.name.endsWith(suffix) ? [path] : [];
  })
  .sort();

const countBy = (list, level) => list.filter((finding) => finding.level === level).length;

/**
 * A DEFAULT_PACKS id that the ref system manifest does not list. A documented legacy alias (LEGACY_PACK_IDS in
 * scripts/compendium.mjs) is a WARN, because upstream dropped it on purpose. Any other missing id is a FAIL.
 */
export const missingPackFinding = ({ category, id, legacyIds, manifestPath, ref }) => {
  const where = "DEFAULT_PACKS." + category + ": " + JSON.stringify(id);
  if (legacyIds.has(id)) {
    return { level: "WARN", check: "packs", message: where + " is a legacy alias not in " + manifestPath + " at " + ref + " (expected for pre-8 compatibility)" };
  }
  return { level: "FAIL", check: "packs", message: where + " is not a pack in " + manifestPath + " at " + ref };
};

/**
 * Runs every check against ref. Reads the module checkout and GitHub only; never writes.
 * Returns { ref, manifest, checked, failures, warnings, findings, packs, requests }.
 */
export const runDriftCheck = async (options = {}) => {
  const { ref = DEFAULT_REF, token = "", fetchImpl = globalThis.fetch, root = MODULE_ROOT } = options;
  const github = createGitHub(token, fetchImpl);
  const index = buildIndex(await github.tree(ref));
  const manifest = await loadManifest(github, ref);
  const manifestPackMap = manifestPacks(manifest.json);
  const budget = token ? FETCH_BUDGET.token : FETCH_BUDGET.anonymous;
  const document = (path) => github.json(ref, path);
  const readSource = (relativePath) => readFileSync(join(root, relativePath), "utf8");
  const findings = [];
  const add = (level, check, message) => findings.push({ level, check, message });
  const packs = {};
  const resolved = new Map();
  let checked = 0;

  const resolvePack = (name) => {
    if (!resolved.has(name)) {
      const entry = manifestPackMap.get(name);
      const dir = entry ? packDirectory(entry.path, index.directories) : null;
      resolved.set(name, entry ? { name, path: entry.path, dir } : null);
    }
    return resolved.get(name);
  };

  // 1. DEFAULT_PACKS ids against the system manifest and the tree.
  const compendiumSource = readSource("scripts/compendium.mjs");
  const categories = parseDefaultPacks(compendiumSource);
  const legacyIds = new Set(extractLegacyPackIds(compendiumSource) ?? []);
  if (!categories) add("FAIL", "packs", "scripts/compendium.mjs has no DEFAULT_PACKS object to check");
  for (const [category, ids] of Object.entries(categories ?? {})) {
    for (const id of ids) {
      checked += 1;
      const dot = id.indexOf(".");
      if (dot < 0 || id.slice(0, dot) !== UPSTREAM.systemId) {
        add("FAIL", "packs", "DEFAULT_PACKS." + category + ": " + JSON.stringify(id) + " is not a " + UPSTREAM.systemId + " pack id");
        continue;
      }
      const name = id.slice(dot + 1);
      const target = resolvePack(name);
      if (!target) {
        const finding = missingPackFinding({ category, id, legacyIds, manifestPath: manifest.path, ref });
        add(finding.level, finding.check, finding.message);
        packs[id] = { category, error: "not in system manifest", legacy: legacyIds.has(id) };
      } else if (!target.dir) {
        add("FAIL", "packs", "DEFAULT_PACKS." + category + ": " + JSON.stringify(id) + " maps to " + target.path + ", which has no directory at " + ref);
        packs[id] = { category, pack: name, path: target.path, error: "no directory" };
      } else {
        packs[id] = { category, pack: name, path: target.path, dir: target.dir };
      }
    }
  }
  const categoryDir = (category) => Object.values(packs).find((item) => item.category === category && item.dir)?.dir ?? null;

  // 2. Compendium.pf2e references in scripts.
  const memo = new Map();
  const references = [];
  for (const file of walk(join(root, "scripts"), ".mjs")) {
    const location = relative(root, file).split("\\").join("/");
    for (const reference of extractCompendiumRefs(readFileSync(file, "utf8"))) {
      checked += 1;
      const where = location + ":" + reference.line;
      const tail = reference.uuid + "";
      if (!isDocumentId(reference.id)) {
        add("WARN", "uuid", where + ": " + tail + " is not a 16-character document id, so no document can match it (not resolved)");
        continue;
      }
      const target = resolvePack(reference.pack);
      if (!target || !target.dir) {
        const reason = target ? "has no directory at " + ref : "is not in " + manifest.path + " at " + ref;
        add("FAIL", "uuid", where + ": " + tail + " names pack " + JSON.stringify(reference.pack) + ", which " + reason);
        continue;
      }
      const key = target.dir + "\n" + reference.id;
      if (!memo.has(key)) {
        memo.set(key, await locateById({ id: reference.id, dir: target.dir, index, hints: reference.hints, document, budget, scan: true }));
      }
      const outcome = memo.get(key);
      references.push({ location: where, uuid: reference.uuid, status: outcome.status, path: outcome.path ?? null });
      if (outcome.status === "found") continue;
      if (outcome.status === "moved") {
        add("FAIL", "uuid", where + ": " + tail + " - document " + reference.id + " is in " + outcome.path + ", not in " + target.dir);
      } else if (outcome.status === "missing") {
        add("FAIL", "uuid", where + ": " + tail + " - no document with _id " + reference.id + " in " + target.dir + " (" + outcome.poolSize + " files read)");
      } else {
        const hint = token ? "" : " (set GITHUB_TOKEN to raise the budget)";
        add("WARN", "uuid", where + ": " + tail + " unresolvable without a token: " + target.dir + " holds " + outcome.poolSize + " files, more than the " + budget + "-fetch budget" + hint);
      }
    }
  }

  // 3. Catalog dedications and feats, each name checked against a real document in the feats directory.
  const checkCatalogName = async (label, name, dir, where) => {
    const slugs = slugCandidates(name);
    if (!dir) {
      add("FAIL", "catalog", where + ": " + label + " " + JSON.stringify(name) + " cannot be checked, its pack has no directory at " + ref);
      return;
    }
    const files = jsonUnder(index, dir).filter((path) => slugs.includes(stemOf(path)));
    if (!files.length) {
      add("FAIL", "catalog", where + ": " + label + " " + JSON.stringify(name) + " has no " + slugs.map((slug) => slug + ".json").join(" or ") + " under " + dir);
      return;
    }
    const docs = [];
    for (const path of files.slice(0, CANDIDATE_LIMIT)) {
      const doc = await document(path);
      if (doc) docs.push({ path, doc });
    }
    if (docs.some((entry) => entry.doc.name === name)) return;
    const near = docs.find((entry) => typeof entry.doc.name === "string" && entry.doc.name.toLowerCase() === name.toLowerCase());
    if (near) {
      add("WARN", "catalog", where + ": " + label + " " + JSON.stringify(name) + " is " + JSON.stringify(near.doc.name) + " in " + near.path + " (casing only)");
      return;
    }
    const first = docs[0];
    const was = first ? first.path + " (name " + JSON.stringify(first.doc.name) + ")" : files[0] + " (unreadable)";
    add("FAIL", "catalog", where + ": " + label + " " + JSON.stringify(name) + " does not match " + was);
  };
  const catalog = extractCatalogNames(readSource("scripts/pc-multiclass.mjs"));
  if (!catalog) add("FAIL", "catalog", "scripts/pc-multiclass.mjs has no MULTICLASS_PACKAGES catalog to check");
  for (const entry of catalog ?? []) {
    checked += 1;
    await checkCatalogName(entry.role, entry.name, categoryDir("feats"), "scripts/pc-multiclass.mjs:" + entry.line);
  }

  // 4. REMASTER_SPELLCASTERS against the classes directory.
  const profiles = extractSpellcasterProfiles(readSource("scripts/pc-tables.mjs"));
  if (!profiles) add("FAIL", "class", "scripts/pc-tables.mjs has no REMASTER_SPELLCASTERS table to check");
  for (const profile of profiles ?? []) {
    checked += 1;
    const where = "scripts/pc-tables.mjs:" + profile.line;
    const dir = categoryDir("classes");
    const file = dir ? jsonUnder(index, dir).find((path) => stemOf(path) === profile.slug) : undefined;
    if (!file) {
      add("FAIL", "class", where + ": no " + profile.slug + ".json under " + (dir ?? "the classes pack") + " at " + ref);
      continue;
    }
    for (const finding of classFindings(profile, await document(file))) {
      add(finding.level, "class", where + " vs " + file + ": " + finding.message);
    }
  }

  // 5. Fixtures: every document-shaped JSON under tests/fixtures, compared with its upstream document.
  for (const file of walk(join(root, "tests", "fixtures"), ".json")) {
    const rel = relative(root, file).split("\\").join("/");
    let fixture;
    try {
      fixture = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      checked += 1;
      add("WARN", "fixture", rel + ": not valid JSON");
      continue;
    }
    const sourceText = typeof fixture?._stats?.compendiumSource === "string" ? fixture._stats.compendiumSource : null;
    const shaped = typeof fixture?._id === "string" && typeof fixture?.name === "string";
    if (!sourceText && !shaped) continue;
    checked += 1;
    const match = sourceText ? /^Compendium\.pf2e\.([^.]+)\.Item\.(.+)$/.exec(sourceText) : null;
    const pack = match ? resolvePack(match[1]) : null;
    if (match && !pack?.dir) {
      add("WARN", "fixture", rel + ": compendiumSource names pack " + JSON.stringify(match[1]) + ", which is not in " + manifest.path + " at " + ref);
      continue;
    }
    const id = match ? match[2] : fixture._id;
    const names = typeof fixture.name === "string" ? slugCandidates(fixture.name) : [];
    const fileStem = stemOf(file).replace(/-(?:\d+\.)+\d+$/, "").replace(/-master$/, "");
    const hints = { exact: [...new Set([...names, fileStem])].filter(Boolean), words: [] };
    const located = await locateById({ id, dir: pack ? pack.dir : null, index, hints, document, budget, scan: Boolean(pack) });
    if (located.status === "missing" || located.status === "unresolvable") {
      const why = located.status === "missing" ? "not found by _id" : "unresolvable without a token";
      add("WARN", "fixture", rel + ": upstream document " + id + " " + why);
      continue;
    }
    if (located.status === "moved") add("WARN", "fixture", rel + ": upstream document " + id + " is now in " + located.path);
    const diffs = compareDocuments(fixture, located.doc);
    if (diffs.length) add("WARN", "fixture", rel + " differs from " + located.path + " at " + ref + ": " + diffs.join("; "));
  }

  const failures = countBy(findings, "FAIL");
  return {
    ref,
    manifest: manifest.path,
    checked,
    failures,
    warnings: findings.length - failures,
    findings,
    packs,
    references,
    requests: { ...github.counts }
  };
};

export const main = async (argv, out) => {
  const log = out ? out.log : console.log;
  const errorOut = out ? out.error : console.error;
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    errorOut("pf2e drift: " + error.message + "\n" + USAGE);
    return 2;
  }
  if (options.help) {
    log(USAGE);
    return 0;
  }
  let result;
  try {
    result = await runDriftCheck({ ref: options.ref, token: process.env.GITHUB_TOKEN ?? "" });
  } catch (error) {
    errorOut("pf2e drift: could not run: " + error.message);
    return 2;
  }
  if (options.json) {
    log(JSON.stringify(result, null, 2));
  } else {
    for (const finding of result.findings) log(finding.level + " " + finding.check + ": " + finding.message);
    log("pf2e drift: " + result.checked + " checked, " + result.failures + " failures, " + result.warnings + " warnings (ref " + result.ref + ")");
  }
  return result.failures > 0 ? 1 : 0;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
