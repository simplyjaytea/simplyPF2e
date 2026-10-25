import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CHECKER = new URL("../tools/check-integrity.mjs", import.meta.url);

const BAD_IMPORT = 'import { x } from "./' + 'nope.mjs";\n';
const BAD_EXPORT = 'import { nope } from "./' + 'target.mjs";\n';
const TEMPLATE_PATH = '"modules/${MODULE_ID}/templates/' + 'missing.hbs"';
const MISSING_KEY = "SIMPLYPF2E" + ".Missing.Key";
const MISSING_TEMPLATE_KEY = "SIMPLYPF2E" + ".Missing.TemplateKey";
const PARTIAL = "missing" + "-partial";
const INTERP_KEY = "SIMPLYPF2E" + ".Skills.Rank${row.rank}";
const OK_KEY = "SIMPLYPF2E" + ".Foo";

function runChecker(root) {
  return spawnSync(process.execPath, [CHECKER.pathname, root], { encoding: "utf8" });
}

function makeFixture(broken) {
  const root = mkdtempSync(join(tmpdir(), "spf-integrity-"));
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "templates"));
  mkdirSync(join(root, "lang"));
  if (broken) {
    writeFileSync(join(root, "scripts", "bad-import.mjs"), BAD_IMPORT);
    writeFileSync(join(root, "scripts", "bad-export.mjs"), BAD_EXPORT);
    writeFileSync(join(root, "scripts", "target.mjs"), "export const foo = 1;\n");
    writeFileSync(join(root, "scripts", "template.mjs"), "const t = " + TEMPLATE_PATH + ";\n");
    writeFileSync(join(root, "scripts", "key.mjs"), 'game.i18n.localize("' + MISSING_KEY + '");\n');
    writeFileSync(join(root, "scripts", "interp.mjs"), "game.i18n.localize(`" + INTERP_KEY + "`);\n");
    writeFileSync(join(root, "templates", "foo.hbs"), '{{localize "' + MISSING_TEMPLATE_KEY + '"}}\n{{> ' + PARTIAL + "}}\n");
    writeFileSync(join(root, "lang", "en.json"), JSON.stringify({ SIMPLYPF2E: { Foo: "Foo", Skills: { Rank0: "r0" } } }));
  } else {
    writeFileSync(join(root, "scripts", "a.mjs"), 'import { foo } from "./' + 'b.mjs";\nconst t = "modules/${MODULE_ID}/templates/' + 'ok.hbs";\ngame.i18n.localize("' + OK_KEY + '");\ngame.i18n.localize(`' + INTERP_KEY + '`);\n');
    writeFileSync(join(root, "scripts", "b.mjs"), "export const foo = 1;\n");
    writeFileSync(join(root, "templates", "ok.hbs"), '{{localize "' + OK_KEY + '"}}\n');
    writeFileSync(join(root, "lang", "en.json"), JSON.stringify({ SIMPLYPF2E: { Foo: "Foo", Skills: { Rank0: "r0" } } }));
  }
  return root;
}

{
  const root = makeFixture(true);
  try {
    const result = runChecker(root);
    const output = `${result.stdout || ""}\n${result.stderr || ""}`;
    assert.notEqual(result.status, 0, "broken fixture should fail");
    assert.match(output, /nope\.mjs/, "broken import reported");
    assert.match(output, /nope/, "bad named export reported");
    assert.match(output, /missing\.hbs/, "missing template reported");
    assert.match(output, new RegExp(MISSING_KEY.replace(".", "\\.")), "missing key reported");
    assert.match(output, new RegExp(MISSING_TEMPLATE_KEY.replace(".", "\\.")), "missing template key reported");
    assert.match(output, new RegExp(PARTIAL), "unregistered partial reported");
    assert.doesNotMatch(output, /SIMPLYPF2E\.Skills\.Rank/, "interpolated key not reported");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const root = makeFixture(false);
  try {
    const result = runChecker(root);
    const output = `${result.stdout || ""}\n${result.stderr || ""}`;
    assert.equal(result.status, 0, `clean fixture should pass: ${output}`);
    assert.match(output, /Integrity passed:/, "success line printed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log("check-integrity test passed");
