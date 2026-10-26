// Fixture coverage for tools/check-links.mjs: broken file and anchor links must be reported at their
// lines, while valid links, images, references, code and ignored targets stay quiet.
// Run: node tests/check-links.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CHECKER = fileURLToPath(new URL("../tools/check-links.mjs", import.meta.url));
const lineOf = (text, needle) => text.split("\n").findIndex((line) => line.includes(needle)) + 1;

const GUIDE_HEAD = ["# Guide", "", "## Setup steps", "", "## Topic", "", "## Topic", ""];
const GUIDE_PASS = [...GUIDE_HEAD, "Back to [project](../README.md#project).", ""].join("\n");
const GUIDE_FAIL = [...GUIDE_HEAD, "Back to [project](../README.md#project) and [elsewhere](../README.md#nothing-here).", ""].join("\n");

const README_PASS = [
  "# Project",
  "",
  "See [guide](docs/guide.md), [steps](docs/guide.md#setup-steps), [topic](docs/guide.md#topic-1) and [query](docs/guide.md?plain=1#setup-steps).",
  "Images: ![logo](docs/logo.png), a [folder](docs/) link and [root copy](/docs/guide.md).",
  "Ignored: [external](https://example.com/page) [mail](mailto:someone@example.com) [same page](#project).",
  "Code is not checked: `[in code](docs/never.md)`.",
  "",
  "```",
  "[in fence](docs/never.md)",
  "```",
  "",
  "[reference]: docs/guide.md#topic",
  ""
].join("\n");

const README_FAIL = [
  "# Project",
  "",
  "See [guide](docs/guide.md), [steps](docs/guide.md#setup-steps) and [root copy](/docs/guide.md).",
  "Missing file: [gone](docs/missing.md).",
  "Missing image: ![chart](docs/chart.png).",
  "Missing anchor: [topic](docs/guide.md#no-such-heading).",
  "Duplicates: [first](docs/guide.md#topic), [second](docs/guide.md#topic-1), [third](docs/guide.md#topic-2).",
  "Ignored: [external](https://example.com/page) [mail](mailto:someone@example.com) [same page](#project).",
  "Code is not checked: `[in code](docs/never.md)`.",
  "",
  "```",
  "[in fence](docs/fenced-missing.md)",
  "```",
  "",
  "[reference]: docs/ref-missing.md",
  "[good reference]: docs/guide.md#setup-steps",
  ""
].join("\n");

const PASS_FILES = { "README.md": README_PASS, "docs/guide.md": GUIDE_PASS, "docs/logo.png": "placeholder\n" };
const FAIL_FILES = {
  "README.md": README_FAIL,
  "docs/guide.md": GUIDE_FAIL,
  "node_modules/dep/README.md": "[ignored](missing.md)\n",
  ".claude/notes.md": "[ignored](missing.md)\n"
};

function runChecker(files) {
  const root = mkdtempSync(join(tmpdir(), "spf-links-"));
  try {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    const result = spawnSync(process.execPath, [CHECKER, "--root", root], { encoding: "utf8" });
    return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const result = runChecker(PASS_FILES);
  assert.equal(result.status, 0, `must-pass fixture should pass:\n${result.stderr}${result.stdout}`);
  assert.equal(result.stderr, "", "must-pass fixture should print no broken links");
  assert.match(result.stdout, /^Links passed: \d+ links in 2 files$/m);
}

{
  const result = runChecker(FAIL_FILES);
  assert.equal(result.status, 1, `must-fail fixture should fail:\n${result.stdout}`);
  assert.match(result.stdout, /^Links failed: 6 broken link\(s\) out of \d+ checked$/m);
  const expected = [
    `README.md:${lineOf(README_FAIL, "[gone](docs/missing.md)")}: broken link -> docs/missing.md`,
    `README.md:${lineOf(README_FAIL, "![chart]")}: broken link -> docs/chart.png`,
    `README.md:${lineOf(README_FAIL, "[topic](docs/guide.md#no-such-heading)")}: broken link -> docs/guide.md#no-such-heading`,
    `README.md:${lineOf(README_FAIL, "[third]")}: broken link -> docs/guide.md#topic-2`,
    `README.md:${lineOf(README_FAIL, "[reference]:")}: broken link -> docs/ref-missing.md`,
    `docs/guide.md:${lineOf(GUIDE_FAIL, "[elsewhere]")}: broken link -> ../README.md#nothing-here`
  ];
  const reported = result.stderr.split("\n").filter(Boolean);
  assert.deepEqual(reported.sort(), expected.sort(), "each broken link is reported once, with its line, and nothing else");
}

console.log("check-links test passed");
