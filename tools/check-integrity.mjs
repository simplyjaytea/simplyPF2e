#!/usr/bin/env node
/** Dependency-free static integrity check for simplyPF2e. */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL("../", import.meta.url));

function walkFiles(dir, suffix) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(path, suffix));
    else if (entry.isFile() && (!suffix || entry.name.endsWith(suffix))) out.push(path);
  }
  return out.sort();
}

function rel(filePath) {
  return relative(root, filePath);
}

const scriptsDir = resolve(root, "scripts");
const testsDir = resolve(root, "tests");
const templatesDir = resolve(root, "templates");
const langPath = resolve(root, "lang", "en.json");

const scriptFiles = walkFiles(scriptsDir, ".mjs");
const testFiles = walkFiles(testsDir, ".mjs");
const templateFiles = walkFiles(templatesDir, ".hbs");
const codeFiles = [...scriptFiles, ...testFiles];

const problems = [];
let importsChecked = 0;
let exportsChecked = 0;
let templatesChecked = 0;

function resolveRelative(fromFile, spec) {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), spec);
  const candidates = [base, `${base}.mjs`, join(base, "index.mjs")];
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    } catch {
      // ignore
    }
  }
  return null;
}

const exportInfoCache = new Map();
function parseExportInfo(filePath) {
  if (exportInfoCache.has(filePath)) return exportInfoCache.get(filePath);
  let content = "";
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    const empty = { direct: new Set(), reexports: [] };
    exportInfoCache.set(filePath, empty);
    return empty;
  }
  const direct = new Set();
  const reexports = [];

  for (const m of content.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) {
    direct.add(m[1]);
  }

  for (const m of content.matchAll(/export\s*\{([^}]*)\}(?:\s*from\s*['"]([^'"]+)['"])?/g)) {
    const body = m[1];
    const from = m[2];
    const names = [];
    for (const part of body.split(",")) {
      const t = part.trim();
      if (!t) continue;
      const asMatch = t.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      if (asMatch) {
        if (from) names.push({ from: asMatch[1], to: asMatch[2] });
        else direct.add(asMatch[2]);
      } else if (/^[A-Za-z_$][\w$]*$/.test(t)) {
        if (from) names.push({ from: t, to: t });
        else direct.add(t);
      }
    }
    if (from && names.length) reexports.push({ target: from, names });
  }

  for (const m of content.matchAll(/export\s*\*\s*from\s*['"]([^'"]+)['"]/g)) {
    reexports.push({ target: m[1], names: null });
  }

  const info = { direct, reexports };
  exportInfoCache.set(filePath, info);
  return info;
}

const resolvedExportsCache = new Map();
function resolveExports(filePath, visited = new Set()) {
  if (resolvedExportsCache.has(filePath)) return resolvedExportsCache.get(filePath);
  if (visited.has(filePath)) return new Set();
  visited.add(filePath);
  const info = parseExportInfo(filePath);
  const result = new Set(info.direct);
  for (const re of info.reexports) {
    const targetPath = resolveRelative(filePath, re.target);
    if (!targetPath) continue;
    const targetExports = resolveExports(targetPath, new Set(visited));
    if (re.names === null) {
      for (const n of targetExports) result.add(n);
    } else {
      for (const { from, to } of re.names) {
        if (targetExports.has(from)) result.add(to);
      }
    }
  }
  resolvedExportsCache.set(filePath, result);
  return result;
}

for (const file of codeFiles) {
  const content = readFileSync(file, "utf8");

  for (const m of content.matchAll(/^\s*import\s+([^;]*?)\s+from\s*['"]([^'"]+)['"]/gm)) {
    const clause = m[1];
    const spec = m[2];
    if (!spec.startsWith(".")) continue;
    importsChecked++;
    const target = resolveRelative(file, spec);
    if (!target) {
      problems.push(`Unresolved import: ${rel(file)} -> ${spec}`);
      continue;
    }
    const braceMatch = clause.match(/\{([^}]*)\}/);
    if (braceMatch) {
      const names = braceMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
      for (const part of names) {
        const asMatch = part.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
        const original = asMatch ? asMatch[1] : part;
        if (!/^[A-Za-z_$][\w$]*$/.test(original)) continue;
        exportsChecked++;
        const exported = resolveExports(target);
        if (!exported.has(original)) {
          problems.push(`Missing export: ${rel(file)} imports '${original}' from ${rel(target)} (not exported)`);
        }
      }
    }
  }

  for (const m of content.matchAll(/^\s*export\s+[^;]*?\s+from\s*['"]([^'"]+)['"]/gm)) {
    const spec = m[1];
    if (!spec.startsWith(".")) continue;
    importsChecked++;
    const target = resolveRelative(file, spec);
    if (!target) {
      problems.push(`Unresolved import: ${rel(file)} -> ${spec}`);
    }
  }

  for (const m of content.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const spec = m[1];
    if (!spec.startsWith(".")) continue;
    importsChecked++;
    const target = resolveRelative(file, spec);
    if (!target) {
      problems.push(`Unresolved import: ${rel(file)} -> ${spec}`);
    }
  }
}

const simplyPath = resolve(root, "scripts", "simplypf2e.mjs");
const registeredPartials = new Set();
if (existsSync(simplyPath)) {
  const c = readFileSync(simplyPath, "utf8");
  const m = c.match(/loadTemplates\s*\(\s*\{([\s\S]*?)\}\s*\)/);
  if (m) {
    for (const km of m[1].matchAll(/['"]([^'"]+)['"]\s*:/g)) registeredPartials.add(km[1]);
    for (const km of m[1].matchAll(/([A-Za-z0-9_-]+)\s*:/g)) registeredPartials.add(km[1]);
  }
}

const templatePathRegex = /modules\/\$\{MODULE_ID\}\/templates\/([^\s'"`)]+\.hbs)|\btemplates\/([A-Za-z0-9_./-]+\.hbs)/g;
for (const file of codeFiles) {
  const content = readFileSync(file, "utf8");
  for (const m of content.matchAll(templatePathRegex)) {
    templatesChecked++;
    const name = m[1] || m[2];
    const target = resolve(root, "templates", name);
    if (!existsSync(target)) {
      problems.push(`Missing template: ${rel(file)} references templates/${name}`);
    }
  }
}

for (const file of templateFiles) {
  const content = readFileSync(file, "utf8");
  for (const m of content.matchAll(/\{\{>\s*([A-Za-z0-9_-]+)/g)) {
    templatesChecked++;
    const partial = m[1];
    if (!registeredPartials.has(partial)) {
      problems.push(`Unregistered partial: ${rel(file)} uses {{> ${partial}}}`);
    }
  }
}

const keyRegex = /SIMPLYPF2E(?:\.(?:[A-Za-z0-9_]+(?:\$\{[^}]*\})?|\$\{[^}]*\}))+/g;

let lang = {};
try {
  lang = JSON.parse(readFileSync(langPath, "utf8"));
} catch {
  problems.push(`Cannot parse ${rel(langPath)}`);
}

function getLeaf(obj, dotted) {
  const parts = dotted.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && Object.prototype.hasOwnProperty.call(cur, p)) {
      cur = cur[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

function flattenLeaves(obj, prefix = "") {
  const out = [];
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    const keys = Object.keys(obj);
    if (keys.length === 0) {
      if (prefix) out.push(prefix);
      return out;
    }
    for (const k of keys) {
      out.push(...flattenLeaves(obj[k], prefix ? `${prefix}.${k}` : k));
    }
  } else {
    if (prefix) out.push(prefix);
  }
  return out;
}

const allLeaves = flattenLeaves(lang);
const usedLeaves = new Set();

function markSubtree(path) {
  const node = path ? getLeaf(lang, path) : lang;
  if (!node || typeof node !== "object") {
    if (path) usedLeaves.add(path);
    return;
  }
  for (const leaf of flattenLeaves(node, path)) usedLeaves.add(leaf);
}

const usedKeys = new Set();
for (const file of [...codeFiles, ...templateFiles]) {
  const content = readFileSync(file, "utf8");
  for (const m of content.matchAll(keyRegex)) usedKeys.add(m[0]);
}

let localizationChecked = 0;
for (const key of usedKeys) {
  localizationChecked++;
  if (key.includes("${")) {
    const idx = key.indexOf("${");
    const prefix = key.slice(0, idx);
    let ok = false;
    let markPath = null;
    let markParent = null;
    let markPartial = null;
    if (prefix.endsWith(".")) {
      const parentPath = prefix.slice(0, -1);
      const parent = parentPath ? getLeaf(lang, parentPath) : lang;
      ok = !!parent && typeof parent === "object";
      if (ok && parentPath && parentPath !== "SIMPLYPF2E") {
        markPath = parentPath;
      }
    } else {
      const parts = prefix.split(".");
      const partial = parts.pop();
      const parentPath = parts.join(".");
      const parent = parentPath ? getLeaf(lang, parentPath) : lang;
      if (parent && typeof parent === "object") {
        ok = Object.keys(parent).some((k) => k.startsWith(partial));
        if (ok && parentPath) {
          markParent = parentPath;
          markPartial = partial;
        }
      }
    }
    if (!ok) {
      problems.push(`Missing localization key: ${key}`);
    } else {
      if (markPath) markSubtree(markPath);
      if (markParent && markPartial) {
        const node = markParent ? getLeaf(lang, markParent) : lang;
        if (node && typeof node === "object") {
          for (const k of Object.keys(node)) {
            if (k.startsWith(markPartial)) {
              const leafPath = markParent ? `${markParent}.${k}` : k;
              markSubtree(leafPath);
            }
          }
        }
      }
    }
  } else {
    const val = getLeaf(lang, key);
    if (val === undefined) {
      problems.push(`Missing localization key: ${key}`);
    } else {
      markSubtree(key);
    }
  }
}

const unusedCount = allLeaves.filter((k) => !usedLeaves.has(k)).length;

if (problems.length) {
  for (const p of problems) {
    console.error(p);
    console.log(p);
  }
  process.exitCode = 1;
} else {
  console.log(`Integrity passed: ${importsChecked} imports, ${exportsChecked} exports, ${templatesChecked} templates, ${localizationChecked} localization keys; ${unusedCount} unused keys`);
}
