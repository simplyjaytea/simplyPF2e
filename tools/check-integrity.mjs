#!/usr/bin/env node
/**
 * Static integrity gate for simplyPF2e (no dependencies).
 *
 * - Imports, re-exports and named bindings: real ESM linking with vm.SourceTextModule.
 *   Modules are linked, never evaluated, so Foundry globals are never touched.
 * - Dynamic import(), template and partial paths, and localization keys: regex scans over
 *   source with comments blanked (string literals kept, offsets preserved).
 *
 * Run: node tools/check-integrity.mjs [--root <dir>]
 * Needs --experimental-vm-modules; the script re-executes itself with the flag when it is missing.
 *
 * Known gaps:
 * - A regex literal containing an unescaped `//` or a quote can confuse the comment/string scanner.
 * - Dynamic import() whose specifier has a `${}` placeholder is skipped.
 * - Bare specifiers (node:*, packages) get stubs built from the importer's own names, so their
 *   exports are not verified; only relative bindings are checked against real targets.
 * - Relative specifiers must name an exact file (no extension or index probing), matching the
 *   browser loader Foundry uses.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { isBuiltin } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

if (!process.execArgv.includes("--experimental-vm-modules")) {
  const child = spawnSync(
    process.execPath,
    ["--experimental-vm-modules", "--disable-warning=ExperimentalWarning", import.meta.filename, ...process.argv.slice(2)],
    { stdio: "inherit" }
  );
  process.exit(child.status ?? 1);
}

const DEFAULT_ROOT = fileURLToPath(new URL("../", import.meta.url));

function parseRootArgument(args) {
  const at = args.indexOf("--root");
  if (at === -1) return DEFAULT_ROOT;
  if (!args[at + 1]) throw new Error("--root needs a directory");
  return resolve(args[at + 1]);
}

const root = parseRootArgument(process.argv.slice(2));
const rel = (file) => relative(root, file).split("\\").join("/");
const isRelative = (spec) => spec.startsWith("./") || spec.startsWith("../");
const isObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);
const IDENTIFIER_RE = /^[A-Za-z_$][\w$]*$/;

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function walk(dir, suffix) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return walk(path, suffix);
      return entry.isFile() && entry.name.endsWith(suffix) ? [path] : [];
    })
    .sort();
}

/**
 * Blanks // and block comments (keeping line breaks and offsets) and records string and
 * template literals. `${}` placeholders inside templates are scanned as code. `inString[k]` is 1
 * for every character that sits inside a literal's text, so code regexes can skip matches there.
 */
function scanSource(source) {
  const out = source.split("");
  const inString = new Uint8Array(source.length);
  const strings = [];
  const frames = [{ kind: "code", braces: 0, placeholder: false }];
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };
  let i = 0;
  while (i < source.length) {
    const top = frames[frames.length - 1];
    const ch = source[i];
    const next = source[i + 1];
    if (top.kind === "template") {
      if (ch === "\\") {
        inString[i] = 1;
        inString[i + 1] = 1;
        i += 2;
      } else if (ch === "`") {
        strings.push({ quote: "`", start: top.start, end: i, text: source.slice(top.start + 1, i), interpolated: top.interpolated });
        frames.pop();
        i++;
      } else if (ch === "$" && next === "{") {
        top.interpolated = true;
        frames.push({ kind: "code", braces: 0, placeholder: true });
        i += 2;
      } else {
        inString[i] = 1;
        i++;
      }
      continue;
    }
    if (ch === "/" && next === "/") {
      let end = source.indexOf("\n", i);
      if (end === -1) end = source.length;
      blank(i, end);
      i = end;
      continue;
    }
    if (ch === "/" && next === "*") {
      const close = source.indexOf("*/", i + 2);
      const end = close === -1 ? source.length : close + 2;
      blank(i, end);
      i = end;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let end = i + 1;
      while (end < source.length && source[end] !== ch && source[end] !== "\n") end += source[end] === "\\" ? 2 : 1;
      if (end > source.length) end = source.length;
      inString.fill(1, i, Math.min(end + 1, source.length));
      strings.push({ quote: ch, start: i, end, text: source.slice(i + 1, end), interpolated: false });
      i = end + 1;
      continue;
    }
    if (ch === "`") {
      frames.push({ kind: "template", start: i, interpolated: false });
      i++;
      continue;
    }
    if (ch === "{") {
      top.braces++;
    } else if (ch === "}") {
      if (top.placeholder && top.braces === 0) frames.pop();
      else if (top.braces > 0) top.braces--;
    }
    i++;
  }
  return { code: out.join(""), strings, inString };
}

const IMPORT_RE = /(?<![\w$.])import\s*(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\*\s*as\s+[A-Za-z_$][\w$]*\s*|\{([^}]*)\}\s*)?(?:from\s*)?(["'])([^"'\n]+)\3/g;
const EXPORT_FROM_RE = /(?<![\w$.])export\s*(?:\{([^}]*)\}|\*(?:\s*as\s+[A-Za-z_$][\w$]*)?)\s*from\s*(["'])([^"'\n]+)\2/g;
const DYNAMIC_IMPORT_RE = /(?<![\w$.])import\s*\(\s*(["'`])((?:\\.|(?!\1)[^\\\n])*)\1\s*\)/g;

function importedNames(body) {
  return body
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split(/\s+as\s+/)[0].trim());
}

/** Static import and re-export declarations of comment-stripped code, with the names they bind. */
function parseStatements(code, inString) {
  const statements = [];
  for (const m of code.matchAll(IMPORT_RE)) {
    if (inString[m.index]) continue;
    const names = [];
    if (m[1]) names.push("default");
    if (m[2] !== undefined) names.push(...importedNames(m[2]));
    statements.push({ spec: m[4], names });
  }
  for (const m of code.matchAll(EXPORT_FROM_RE)) {
    if (inString[m.index]) continue;
    statements.push({ spec: m[3], names: m[1] === undefined ? [] : importedNames(m[1]) });
  }
  return statements;
}

const infoCache = new Map();
function fileInfo(file) {
  if (!infoCache.has(file)) {
    const { code, strings, inString } = scanSource(readFileSync(file, "utf8"));
    infoCache.set(file, { code, strings, statements: parseStatements(code, inString), inString });
  }
  return infoCache.get(file);
}

const problems = new Set();
const report = (message) => problems.add(message);
const brokenFiles = new Set();

function namesRequested(importerFile, spec) {
  const names = new Set();
  for (const statement of fileInfo(importerFile).statements) {
    if (statement.spec === spec) for (const name of statement.names) names.add(name);
  }
  return [...names];
}

/**
 * One fresh link graph (own context and cache). Relative specifiers resolve to exact files.
 * Missing or unparseable targets become stubs exporting exactly the names the importer requests,
 * so the only report for them is the root cause, not a cascade of missing-export errors.
 */
function createGraph() {
  const context = vm.createContext({});
  const sources = new Map();

  const stub = (names, identifier) => {
    const exported = [...new Set(names)];
    return new vm.SyntheticModule(
      exported,
      function evaluateStub() {
        for (const name of exported) this.setExport(name, undefined);
      },
      { identifier, context }
    );
  };

  const sourceModule = (file) => {
    if (sources.has(file)) return sources.get(file);
    let mod = null;
    if (!brokenFiles.has(file)) {
      try {
        mod = new vm.SourceTextModule(readFileSync(file, "utf8"), { identifier: file, context });
      } catch (error) {
        if (error?.name !== "SyntaxError") throw error;
        brokenFiles.add(file);
        report(`Syntax error: ${rel(file)}: ${error.message}`);
      }
    }
    sources.set(file, mod);
    return mod;
  };

  const linker = (specifier, referencing) => {
    const importer = referencing.identifier;
    const names = namesRequested(importer, specifier);
    if (!isRelative(specifier)) return stub(names, `bare:${specifier}`);
    const target = resolve(dirname(importer), specifier);
    if (!isFile(target)) {
      report(`Unresolved import: ${rel(importer)} -> ${specifier}`);
      return stub(names, target);
    }
    return sourceModule(target) ?? stub(names, target);
  };

  return { context, sources, linker, sourceModule };
}

/** Node versions that split linking from instantiation leave the module unlinked after link(). */
function instantiateIfPending(mod) {
  if (mod.status === "unlinked" && typeof mod.instantiate === "function") mod.instantiate();
}

const isMissingExport = (error) => error?.name === "SyntaxError" && /does not provide an export named/.test(error.message);

/** True when `import { name } from spec` fails on its own, resolved from the importer's file. */
async function edgeFails(importerFile, spec, name) {
  const graph = createGraph();
  const probe = new vm.SourceTextModule(`import { ${name} as __probe } from ${JSON.stringify(spec)};\n`, {
    identifier: importerFile,
    context: graph.context
  });
  try {
    await probe.link(graph.linker);
    instantiateIfPending(probe);
    return false;
  } catch (error) {
    return isMissingExport(error) && error.message.includes(`'${spec}'`) && error.message.includes(`'${name}'`);
  }
}

/** After a root graph fails, reports every named relative edge that fails on its own. */
async function attributeMissingExports(graph) {
  let found = 0;
  for (const [importerFile, mod] of graph.sources) {
    if (!mod) continue;
    for (const statement of fileInfo(importerFile).statements) {
      if (!isRelative(statement.spec)) continue;
      for (const name of statement.names) {
        if (!IDENTIFIER_RE.test(name)) continue;
        if (await edgeFails(importerFile, statement.spec, name)) {
          report(`Missing export: ${rel(importerFile)} imports '${name}' from ${statement.spec}`);
          found++;
        }
      }
    }
  }
  return found;
}

/** Links one root module as its own graph. Never evaluates. */
async function linkRoot(file) {
  const graph = createGraph();
  const mod = graph.sourceModule(file);
  if (!mod) return;
  try {
    await mod.link(graph.linker);
    instantiateIfPending(mod);
  } catch (error) {
    if (!isMissingExport(error)) {
      report(`Link failed: ${rel(file)}: ${error.message}`);
      return;
    }
    const attributed = await attributeMissingExports(graph);
    if (!attributed) report(`Missing export (unattributed): ${rel(file)}: ${error.message}`);
  }
}

function checkDynamicImports(codeFiles) {
  for (const file of codeFiles) {
    const { code, inString } = fileInfo(file);
    for (const m of code.matchAll(DYNAMIC_IMPORT_RE)) {
      if (inString[m.index]) continue;
      const spec = m[2];
      if (spec.includes("${")) continue;
      if (isRelative(spec)) {
        if (!isFile(resolve(dirname(file), spec))) report(`Unresolved dynamic import: ${rel(file)} -> ${spec}`);
      } else if (!isBuiltin(spec)) {
        report(`Unresolved dynamic import: ${rel(file)} -> ${spec}`);
      }
    }
  }
}

function braceBody(code, open) {
  let depth = 0;
  for (let k = open; k < code.length; k++) {
    if (code[k] === "{") depth++;
    else if (code[k] === "}") {
      depth--;
      if (depth === 0) return code.slice(open + 1, k);
    }
  }
  return code.slice(open + 1);
}

function topLevelEntries(body) {
  const entries = [];
  let depth = 0;
  let current = "";
  for (const ch of body) {
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    if (ch === "," && depth === 0) {
      entries.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) entries.push(current);
  return entries;
}

/** Keys of the first loadTemplates({...}) object literal in scripts/simplypf2e.mjs. */
function registeredPartials() {
  const partials = new Set();
  const file = resolve(root, "scripts", "simplypf2e.mjs");
  if (!isFile(file)) return partials;
  const code = fileInfo(file).code;
  const start = code.indexOf("loadTemplates(");
  if (start === -1) return partials;
  const open = code.indexOf("{", start);
  if (open === -1) return partials;
  for (const entry of topLevelEntries(braceBody(code, open))) {
    const m = entry.match(/^\s*(?:(["'`])([^"'`]+)\1|([A-Za-z_$][\w$-]*))\s*:/);
    if (m) partials.add(m[2] ?? m[3]);
  }
  return partials;
}

const TEMPLATE_PATH_RE = /modules\/\$\{MODULE_ID\}\/templates\/([^\s'"`)]+\.hbs)|\btemplates\/([A-Za-z0-9_./-]+\.hbs)/g;
const KEY_RE = /^SIMPLYPF2E(?:\.[A-Za-z0-9_]+)+$/;
const PREFIX_RE = /^SIMPLYPF2E(?:\.[A-Za-z0-9_]+)*\.?$/;
const CONCAT_RE = /^\s*(?:\+|\.concat\s*\()/;

const scripts = walk(join(root, "scripts"), ".mjs");
const tests = walk(join(root, "tests"), ".mjs");
const codeFiles = [...scripts, ...tests];
const templateFiles = walk(join(root, "templates"), ".hbs");

let importsChecked = 0;
let exportsChecked = 0;
for (const file of codeFiles) {
  for (const statement of fileInfo(file).statements) {
    if (!isRelative(statement.spec)) continue;
    importsChecked++;
    exportsChecked += statement.names.length;
  }
}

let templatesChecked = 0;
for (const file of scripts) {
  for (const m of fileInfo(file).code.matchAll(TEMPLATE_PATH_RE)) {
    const name = m[1] ?? m[2];
    if (name.includes("${")) continue;
    templatesChecked++;
    if (!isFile(resolve(root, "templates", name))) report(`Missing template: ${rel(file)} references templates/${name}`);
  }
}

const partials = registeredPartials();
for (const file of templateFiles) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/\{\{>\s*([A-Za-z0-9_-]+)/g)) {
    templatesChecked++;
    if (!partials.has(m[1])) report(`Unregistered partial: ${rel(file)} uses {{> ${m[1]}}}`);
  }
  for (const m of text.matchAll(/\{\{>\s*(["'])([^"'\n]+)\1/g)) {
    templatesChecked++;
    const path = m[2];
    const at = path.lastIndexOf("templates/");
    const name = at === -1 ? path : path.slice(at + "templates/".length);
    if (!isFile(resolve(root, "templates", name))) report(`Missing partial template: ${rel(file)} -> ${path}`);
  }
}

// Localization.
let lang = {};
try {
  lang = JSON.parse(readFileSync(join(root, "lang", "en.json"), "utf8"));
} catch {
  report(`Cannot parse ${rel(join(root, "lang", "en.json"))}`);
}

function getLeaf(obj, dotted) {
  let cur = obj;
  for (const part of dotted.split(".")) {
    if (isObject(cur) && Object.prototype.hasOwnProperty.call(cur, part)) cur = cur[part];
    else return undefined;
  }
  return cur;
}

const nodeAt = (path) => (path ? getLeaf(lang, path) : lang);

function flattenLeaves(obj, prefix = "") {
  if (isObject(obj)) {
    const keys = Object.keys(obj);
    if (keys.length === 0) return prefix ? [prefix] : [];
    return keys.flatMap((k) => flattenLeaves(obj[k], prefix ? `${prefix}.${k}` : k));
  }
  return prefix ? [prefix] : [];
}

const allLeaves = flattenLeaves(lang);
const usedLeaves = new Set();
function markSubtree(path) {
  const node = nodeAt(path);
  if (!isObject(node)) {
    usedLeaves.add(path);
    return;
  }
  for (const leaf of flattenLeaves(node, path)) usedLeaves.add(leaf);
}

const checkedKeys = new Set();
const missingKey = (key, file) => report(`Missing localization key: ${key} (${rel(file)})`);

function checkCompleteKey(key, file) {
  checkedKeys.add(key);
  const value = getLeaf(lang, key);
  if (value === undefined) missingKey(key, file);
  else if (typeof value !== "string") report(`Non-string localization key: ${key} (${rel(file)})`);
  else markSubtree(key);
}

/** Prefix mode: a dynamic or concatenated key must resolve to an object, or to a key family. */
function checkPrefixKey(key, prefix, file) {
  checkedKeys.add(key);
  if (prefix.endsWith(".")) {
    const parentPath = prefix.slice(0, -1);
    if (!isObject(nodeAt(parentPath))) return missingKey(key, file);
    if (parentPath !== "SIMPLYPF2E") markSubtree(parentPath);
    return undefined;
  }
  const direct = nodeAt(prefix);
  if (direct !== undefined) return markSubtree(prefix);
  const cut = prefix.lastIndexOf(".");
  const parentPath = prefix.slice(0, cut);
  const partial = prefix.slice(cut + 1);
  const parent = nodeAt(parentPath);
  if (!isObject(parent)) return missingKey(key, file);
  const matches = Object.keys(parent).filter((k) => k.startsWith(partial));
  if (!matches.length) return missingKey(key, file);
  for (const k of matches) markSubtree(parentPath ? `${parentPath}.${k}` : k);
  return undefined;
}

for (const file of scripts) {
  const { code, strings } = fileInfo(file);
  for (const literal of strings) {
    if (!literal.text.startsWith("SIMPLYPF2E.")) continue;
    if (literal.interpolated) {
      const prefix = literal.text.slice(0, literal.text.indexOf("${"));
      if (PREFIX_RE.test(prefix)) checkPrefixKey(literal.text, prefix, file);
    } else if (CONCAT_RE.test(code.slice(literal.end + 1, literal.end + 40))) {
      if (PREFIX_RE.test(literal.text)) checkPrefixKey(literal.text, literal.text, file);
    } else if (KEY_RE.test(literal.text)) {
      checkCompleteKey(literal.text, file);
    }
  }
}

for (const file of templateFiles) {
  for (const m of readFileSync(file, "utf8").matchAll(/\{\{\s*localize\s+(["'])([^"'\n]*)\1/g)) {
    if (KEY_RE.test(m[2])) checkCompleteKey(m[2], file);
  }
}

for (const file of codeFiles) await linkRoot(file);
checkDynamicImports(codeFiles);

const unusedCount = allLeaves.filter((k) => !usedLeaves.has(k)).length;

if (problems.size) {
  for (const problem of problems) console.error(problem);
  console.log(`Integrity failed: ${problems.size} problem(s)`);
  process.exitCode = 1;
} else {
  console.log(
    `Integrity passed: ${importsChecked} imports, ${exportsChecked} exports, ${templatesChecked} templates, ${checkedKeys.size} localization keys; ${unusedCount} unused keys`
  );
}
