// Static UI contract checks for the compact provider strip and responsive
// controls. These complement live/browser QA by preventing the two templates
// or the narrow-window overflow fix from silently drifting apart.
// Run: node scripts/ui.layout.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [generator, itemForge, providerSetup, managePresets, generatorApp, itemForgeApp, css] = await Promise.all([
  read("templates/generator.hbs"),
  read("templates/itemforge.hbs"),
  read("templates/provider-setup.hbs"),
  read("templates/manage-presets.hbs"),
  read("scripts/generator-app.mjs"),
  read("scripts/itemforge-app.mjs"),
  read("styles/simplypf2e.css")
]);

for (const [name, template] of [
  ["generator", generator],
  ["item forge", itemForge]
]) {
  assert.match(template, /spf-provider-summary/, `${name} must identify the active provider`);
  assert.match(template, /provider\.model/, `${name} must show the exact model identifier`);
  assert.match(template, /providerReady/, `${name} must expose provider readiness at a glance`);
  assert.match(template, /data-action="configureProvider"/, `${name} must offer direct provider setup`);
  assert.match(template, /data-action="testProvider"/, `${name} must offer a connection check`);
  assert.match(
    template,
    /spf-provider-state" role="img" aria-label=/,
    `${name} provider readiness must not depend on color or a tooltip`
  );
}

for (const [name, template] of [
  ["generator", generator],
  ["item forge", itemForge],
  ["preset manager", managePresets]
]) {
  for (const match of template.matchAll(/<button\b([^>]*)>\s*<i\b[^>]*><\/i>\s*<\/button>/g)) {
    assert.match(
      match[1],
      /\baria-label=/,
      `${name} icon-only buttons must have an accessible name: ${match[0]}`
    );
  }
}

for (const [name, template] of [
  ["generator", generator],
  ["item forge", itemForge]
]) {
  const ids = new Set([...template.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  for (const match of template.matchAll(/<label\b[^>]*\bfor="([^"]+)"[^>]*>/g)) {
    assert.ok(ids.has(match[1]), `${name} label must target an existing control: ${match[0]}`);
  }
  for (const match of template.matchAll(/<(?:input|select|textarea)\b([^>]*)\bname="[^"]+"[^>]*>/g)) {
    if (/type="(?:checkbox|radio)"/.test(match[0])) continue;
    assert.match(match[1], /\bid="[^"]+"/, `${name} named fields must have a label target: ${match[0]}`);
  }
}

assert.match(providerSetup, /data-provider="\{\{this\.id\}\}"/, "provider setup must render preset choices");
assert.match(providerSetup, /name="apiBaseUrl"/);
assert.match(providerSetup, /name="model"/);
assert.match(providerSetup, /type="password" name="apiKey"/, "the saved key must never be rendered back into the form");
assert.match(providerSetup, /data-action="saveAndTest"/, "provider setup must offer direct save-and-test");
assert.match(providerSetup, /data-action="loadModels"/, "provider setup must offer authorized model discovery");
assert.match(providerSetup, /<datalist id="spf-provider-model-list">/, "discovered models must remain editable suggestions");

for (const [name, source] of [
  ["generator", generatorApp],
  ["item forge", itemForgeApp]
]) {
  assert.match(
    source,
    /static async #onAuthorizeApiKey\([^)]*\)\s*\{\s*(?:\/\/[^\n]*\n\s*)+this\.#readForm\(\);/,
    `${name} must preserve unsaved form input before authorization re-renders the app`
  );
}

assert.match(
  css,
  /\.simplypf2e \.spf-row\s*\{[^}]*flex-wrap:\s*wrap;/s,
  "control rows must wrap instead of overflowing a compact Foundry window"
);
assert.match(
  css,
  /@media \(max-width: 520px\)[\s\S]*?\.simplypf2e \.spf-row \.form-group\s*\{[^}]*flex-basis:\s*calc\(50%/s,
  "narrow windows must use a readable two-column control layout"
);
assert.match(css, /\.simplypf2e \.spf-provider-model\s*\{[^}]*text-overflow:\s*ellipsis;/s);
assert.match(css, /\.simplypf2e \.spf-provider-presets\s*\{[^}]*grid-template-columns:\s*repeat\(3/s);
assert.match(css, /\.simplypf2e \.spf-actions\s*\{[^}]*flex-wrap:\s*wrap;/s,
  "action rows must wrap when localized labels do not fit");
assert.match(css, /\.simplypf2e \.spf-model-picker\s*\{[^}]*flex-wrap:\s*wrap;/s,
  "the model input and discovery action must wrap in narrow windows");

console.log("UI layout contract checks passed.");
