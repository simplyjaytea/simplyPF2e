#!/usr/bin/env node
/**
 * Relative Markdown link check for the gate (no dependencies).
 *
 * Scans every *.md file the repository tracks or would track (ignored files excluded). Outside a
 * version-controlled checkout it walks the root, skipping node_modules and dot-directories other
 * than .github. Covers inline links, images and reference definitions. Code fences, inline code
 * spans and HTML comments are not links.
 *
 * - Absolute URLs (any scheme, or //host) and bare #anchors are not checked.
 * - A relative target, with ?query and #fragment stripped, must name an existing file or directory.
 *   A leading / means the repository root.
 * - A #fragment on a .md target must match a heading slug (lowercase, punctuation removed except
 *   hyphens and underscores, spaces to hyphens, repeats get -1, -2) or an explicit id/name attribute.
 *
 * Run: node tools/check-links.mjs [--root <dir>]
 *
 * Known gaps:
 * - Matching is per line: a destination or link text split across lines is not seen.
 * - Same-file #anchors are not verified.
 * - Heading slugs are computed from Markdown source with links, code ticks and emphasis stripped.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = fileURLToPath(new URL("../", import.meta.url));

function parseRootArgument(args) {
  const at = args.indexOf("--root");
  if (at === -1) return DEFAULT_ROOT;
  if (!args[at + 1]) throw new Error("--root needs a directory");
  return resolve(args[at + 1]);
}

const root = resolve(parseRootArgument(process.argv.slice(2)));
const rel = (file) => relative(root, file).split(sep).join("/");
const SKIPPED_SEGMENTS = new Set(["node_modules"]);
const EXTERNAL_RE = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;
const FENCE_RE = /^[ \t]*(`{3,}|~{3,})(.*)$/;
const ATX_RE = /^ {0,3}#{1,6}(?:[ \t]+(.*?))?[ \t]*$/;
const SETEXT_RE = /^ {0,3}(?:=+|-+)[ \t]*$/;
const LIST_OR_QUOTE_RE = /^\s*(?:[-*+>|]|\d+[.)])(?:\s|$)/;
const CODE_SPAN_RE = /(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g;
const REFERENCE_RE = /^ {0,3}\[(?!\^)[^\]]+\]:[ \t]*(<[^>]*>|\S+)/;
const EXPLICIT_ID_RE = /<[^>]*\b(?:id|name)\s*=\s*["\x27]([^"\x27]+)["\x27][^>]*>/gi;

function statOrNull(path) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

function walkMarkdown(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || (entry.name.startsWith(".") && entry.name !== ".github")) return [];
      return walkMarkdown(path);
    }
    return entry.isFile() && entry.name.endsWith(".md") ? [path] : [];
  });
}

/** Markdown files git tracks or would track, or null when the root is not the top of a checkout. */
function gitMarkdown() {
  const top = spawnSync("git", ["-C", root, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (top.status !== 0 || realpathSync(top.stdout.trim()) !== realpathSync(root)) return null;
  const listed = spawnSync("git", ["-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "*.md"], { encoding: "utf8" });
  if (listed.status !== 0) return null;
  return listed.stdout.split("\0").filter(Boolean).map((path) => resolve(root, path));
}

const markdownFiles = (gitMarkdown() ?? walkMarkdown(root))
  .filter((file) => !file.split(sep).some((segment) => SKIPPED_SEGMENTS.has(segment)))
  .filter((file) => statOrNull(file)?.isFile())
  .sort();

/** Blanks fenced code blocks and HTML comments, keeping line numbers. */
function withoutFencesAndComments(text) {
  const kept = [];
  let fence = null;
  for (const line of text.split(/\r?\n/)) {
    const open = line.match(FENCE_RE);
    if (fence) {
      const closes = open && open[1][0] === fence.char && open[1].length >= fence.length && open[2].trim() === "";
      if (closes) fence = null;
      kept.push("");
    } else if (open && !(open[1][0] === "`" && open[2].includes("`"))) {
      fence = { char: open[1][0], length: open[1].length };
      kept.push("");
    } else {
      kept.push(line);
    }
  }
  return kept
    .join("\n")
    .replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, " "))
    .split("\n");
}

/** GitHub-style heading slug: lowercase, punctuation removed except hyphens and underscores, spaces to hyphens. */
function slugify(text) {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/[`*~]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");
}

function headingTexts(lines) {
  const texts = [];
  lines.forEach((line, index) => {
    const atx = line.match(ATX_RE);
    if (atx) {
      texts.push((atx[1] ?? "").replace(/(?:^|[ \t]+)#+[ \t]*$/, "").trim());
      return;
    }
    const previous = index > 0 ? lines[index - 1] : "";
    const underlined = SETEXT_RE.test(line) && previous.trim() !== "" && !ATX_RE.test(previous) && !SETEXT_RE.test(previous) && !LIST_OR_QUOTE_RE.test(previous);
    if (underlined) texts.push(previous.trim());
  });
  return texts;
}

function anchorsOf(lines) {
  const anchors = new Set();
  const counts = new Map();
  for (const text of headingTexts(lines)) {
    const slug = slugify(text);
    const count = counts.get(slug) ?? 0;
    counts.set(slug, count + 1);
    anchors.add(count === 0 ? slug : `${slug}-${count}`);
  }
  for (const line of lines) for (const match of line.matchAll(EXPLICIT_ID_RE)) anchors.add(match[1]);
  return anchors;
}

/** True when the "](" at index close closes a link text that opens earlier on the same line. */
function hasOpener(line, close) {
  let depth = 0;
  for (let k = close; k >= 0; k--) {
    if (line[k] === "]") depth++;
    else if (line[k] === "[" && --depth === 0) return true;
  }
  return false;
}

/** Destination of an inline link or image whose "(" follows "](", or null when the syntax is not a link. */
function destinationAt(line, start) {
  let i = start;
  while (line[i] === " " || line[i] === "\t") i++;
  let target;
  if (line[i] === "<") {
    const end = line.indexOf(">", i + 1);
    if (end === -1) return null;
    target = line.slice(i + 1, end);
    i = end + 1;
  } else {
    const from = i;
    let depth = 0;
    while (i < line.length && /\S/.test(line[i])) {
      if (line[i] === "(") depth++;
      else if (line[i] === ")") {
        if (depth === 0) break;
        depth--;
      }
      i++;
    }
    target = line.slice(from, i);
  }
  while (line[i] === " " || line[i] === "\t") i++;
  if (line[i] === "\"" || line[i] === "\x27" || line[i] === "(") {
    const end = line.indexOf(line[i] === "(" ? ")" : line[i], i + 1);
    if (end === -1) return null;
    i = end + 1;
    while (line[i] === " " || line[i] === "\t") i++;
  }
  return line[i] === ")" ? target : null;
}

function inlineTargets(line) {
  const found = [];
  for (let at = line.indexOf("]("); at !== -1; at = line.indexOf("](", at + 1)) {
    const target = destinationAt(line, at + 2);
    if (target !== null && hasOpener(line, at)) found.push(target);
  }
  return found;
}

function parseDocument(text) {
  const lines = withoutFencesAndComments(text);
  const targets = [];
  lines.forEach((raw, index) => {
    const line = raw.replace(CODE_SPAN_RE, (span) => " ".repeat(span.length));
    const reference = line.match(REFERENCE_RE);
    if (reference) targets.push({ line: index + 1, target: reference[1].replace(/^<(.*)>$/, "$1") });
    for (const target of inlineTargets(line)) targets.push({ line: index + 1, target });
  });
  return { targets, anchors: anchorsOf(lines) };
}

const documents = new Map();
function documentOf(file) {
  if (!documents.has(file)) documents.set(file, parseDocument(readFileSync(file, "utf8")));
  return documents.get(file);
}

function decode(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function targetExists(file, target) {
  const hash = target.indexOf("#");
  const fragment = hash === -1 ? "" : decode(target.slice(hash + 1));
  const address = hash === -1 ? target : target.slice(0, hash);
  const query = address.indexOf("?");
  const path = decode(query === -1 ? address : address.slice(0, query));
  if (path === "") return true;
  const destination = path.startsWith("/") ? resolve(root, `.${path}`) : resolve(dirname(file), path);
  const stat = statOrNull(destination);
  if (stat === null) return false;
  if (fragment === "" || !stat.isFile() || !destination.toLowerCase().endsWith(".md")) return true;
  return documentOf(destination).anchors.has(fragment);
}

const problems = [];
let checked = 0;
for (const file of markdownFiles) {
  for (const { line, target } of documentOf(file).targets) {
    if (target === "" || target.startsWith("#") || EXTERNAL_RE.test(target)) continue;
    checked++;
    if (!targetExists(file, target)) problems.push(`${rel(file)}:${line}: broken link -> ${target}`);
  }
}

if (problems.length) {
  for (const problem of problems) console.error(problem);
  console.log(`Links failed: ${problems.length} broken link(s) out of ${checked} checked`);
  process.exitCode = 1;
} else {
  console.log(`Links passed: ${checked} links in ${markdownFiles.length} files`);
}
