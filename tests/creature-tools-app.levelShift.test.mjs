import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const template = await readFile(new URL("templates/creature-tools.hbs", root), "utf8");
const lang = JSON.parse(await readFile(new URL("lang/en.json", root), "utf8"));

function extractLocalizeKeys(text) {
  const keys = new Set();
  const re = /\{\{localize "([^"]+)"\}\}/g;
  let m;
  while ((m = re.exec(text)) !== null) keys.add(m[1]);
  return [...keys];
}

const keys = extractLocalizeKeys(template);
for (const key of keys) {
  let node = lang;
  for (const part of key.split(".")) {
    node = node?.[part];
    if (node === undefined) break;
  }
  assert.notEqual(node, undefined, `missing localization key: ${key}`);
}

// fieldset present
assert.match(template, /Level shift \(experimental\)|Shift\.Legend/);
assert.match(template, /data-action="previewShift"/);
assert.match(template, /data-action="createShift"/);
assert.match(template, /data-action="discardShift"/);

console.log("creature-tools app levelShift tests passed");