// Fixture coverage for tools/check-integrity.mjs: every must-fail case must be reported and
// every must-pass construct must stay quiet. Run: node tests/check-integrity.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CHECKER = fileURLToPath(new URL("../tools/check-integrity.mjs", import.meta.url));

const PASS_FIXTURE = {
  "lang/en.json": JSON.stringify({ SIMPLYPF2E: { Foo: "Foo", Skills: { Rank: { 0: "r0", 1: "r1" } } } }),
  "scripts/simplypf2e.mjs": [
    'import "./side.mjs";',
    'import { gen } from "./gen.mjs";',
    'import { b1, renamedB } from "./names.mjs";',
    'import { barrelName } from "./barrel.mjs";',
    'import { labels } from "./labels.mjs";',
    "/* import { commentedOut } from \"./does-not-exist.mjs\"; */",
    'export const MODULE_ID = "simplypf2e";',
    "foundry.applications.handlebars.loadTemplates({",
    '  "simplypf2e-progress": `modules/${MODULE_ID}/templates/_progress.hbs`',
    "});",
    "export { gen, b1, renamedB, barrelName, labels };",
    ""
  ].join("\n"),
  "scripts/side.mjs": "globalThis.simplypf2eSideEffect = true;\n",
  "scripts/gen.mjs": "export function* gen() {\n  yield 1;\n}\n",
  "scripts/names.mjs": "export const a1 = 1, b1 = 2;\nconst renamed = 3;\nexport { renamed as renamedB };\n",
  "scripts/barrel.mjs": 'export * from "./hidden.mjs";\n',
  "scripts/hidden.mjs": 'export const barrelName = "barrel";\n',
  "scripts/labels.mjs": [
    'const MODULE_ID = "simplypf2e";',
    "const kind = \"progress\";",
    "export function labels(row) {",
    "  const path = `modules/${MODULE_ID}/templates/${kind}.hbs`;",
    '  const plus = game.i18n.localize("SIMPLYPF2E.Skills.Rank" + 1);',
    "  const interp = game.i18n.localize(`SIMPLYPF2E.Skills.Rank${row.rank}`);",
    '  const foo = game.i18n.localize("SIMPLYPF2E.Foo");',
    '  return [path, plus, interp, foo, "modules/simplypf2e/templates/_progress.hbs", a1];',
    "}",
    'import { a1 } from "./names.mjs";',
    ""
  ].join("\n"),
  "tests/gen.test.mjs": 'import { gen } from "../scripts/gen.mjs";\nconsole.log(typeof gen);\n',
  "templates/_progress.hbs": '{{localize "SIMPLYPF2E.Foo"}}\n{{> simplypf2e-progress}}\n'
};

const FAIL_FIXTURE = {
  "lang/en.json": JSON.stringify({ SIMPLYPF2E: { Foo: "Foo", CreatureTools: { Title: "Creature" } } }),
  "scripts/simplypf2e.mjs": [
    'export const MODULE_ID = "simplypf2e";',
    "foundry.applications.handlebars.loadTemplates({",
    '  "simplypf2e-progress": `modules/${MODULE_ID}/templates/_progress.hbs`',
    "});",
    ""
  ].join("\n"),
  // (a) side-effect import of a missing file
  "scripts/a-side-effect.mjs": 'import "./nope-side-effect.mjs";\n',
  // (b) re-export of a name the target does not export
  "scripts/b-reexport.mjs": 'export { doesNotExist } from "./text.mjs";\n',
  // (c) multi-line import with a comment inside the braces and a bogus name
  "scripts/c-multiline.mjs": [
    "import {",
    "  textValue, // helper, see text.mjs",
    "  bogusName",
    '} from "./text.mjs";',
    "export const usedInC = [textValue, bogusName];",
    ""
  ].join("\n"),
  "scripts/text.mjs": 'export const textValue = "text";\n',
  // (d) a commented-out export is not an export
  "scripts/d-commented-export.mjs": 'import { ghostExport } from "./target.mjs";\nexport const usedInD = ghostExport;\n',
  "scripts/target.mjs": "// export function ghostExport() {}\nexport const realValue = 1;\n",
  // (e) literal key that resolves to an object
  "scripts/e-localize.mjs": 'game.i18n.localize("SIMPLYPF2E.CreatureTools");\n',
  // (f) relative dynamic imports, string and placeholder-free template literal
  "scripts/f-dynamic.mjs": "export const loaders = [import(\"./missing.mjs\"), import(`./missing-template.mjs`)];\n",
  // Computed-free template path to a file that does not exist
  "scripts/g-path.mjs": 'export const path = "modules/simplypf2e/templates/absent.hbs";\n',
  "templates/broken.hbs": '{{> "modules/simplypf2e/templates/_nope.hbs"}}\n',
  "templates/_progress.hbs": "{{> simplypf2e-progress}}\n"
};

function runChecker(files) {
  const root = mkdtempSync(join(tmpdir(), "spf-integrity-"));
  try {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    const result = spawnSync(
      process.execPath,
      ["--experimental-vm-modules", "--disable-warning=ExperimentalWarning", CHECKER, "--root", root],
      { encoding: "utf8" }
    );
    return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const result = runChecker(PASS_FIXTURE);
  assert.equal(result.status, 0, `must-pass fixture should pass:\n${result.stderr}${result.stdout}`);
  assert.match(result.stdout, /^Integrity passed: \d+ imports, \d+ exports, \d+ templates, \d+ localization keys; \d+ unused keys$/m);
}

{
  const result = runChecker(FAIL_FIXTURE);
  assert.equal(result.status, 1, `must-fail fixture should fail:\n${result.stdout}`);
  assert.match(result.stdout, /^Integrity failed: \d+ problem\(s\)$/m);
  const expectations = [
    [/Unresolved import: .*nope-side-effect/, "(a) side-effect import of a missing file"],
    [/Missing export: .*'doesNotExist'/, "(b) re-export of a missing name"],
    [/Missing export: .*'bogusName'/, "(c) multi-line import with a bogus name"],
    [/Missing export: .*'ghostExport'/, "(d) commented-out export treated as real"],
    [/Non-string localization key: SIMPLYPF2E\.CreatureTools/, "(e) literal key resolving to an object"],
    [/Unresolved dynamic import: .*missing\.mjs/, "(f) relative dynamic import, string literal"],
    [/Unresolved dynamic import: .*missing-template\.mjs/, "(f) relative dynamic import, template literal"],
    [/partial.*_nope\.hbs/, "quoted partial pointing at a missing template"],
    [/Missing template: .*absent\.hbs/, "literal template path to a missing file"]
  ];
  for (const [pattern, label] of expectations) assert.match(result.stderr, pattern, label);
  assert.doesNotMatch(result.stderr, /imports 'textValue'|imports 'realValue'|simplypf2e-progress/, "valid bindings stay quiet");
}

console.log("check-integrity test passed");
