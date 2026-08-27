// Static UI contract checks for the compact provider strip and responsive
// controls. These complement live/browser QA by preventing the two templates
// or the narrow-window overflow fix from silently drifting apart.
// Run: node scripts/ui.layout.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [generator, itemForge, providerSetup, managePresets, progress, generatorApp, itemForgeApp, css] = await Promise.all([
  read("templates/generator.hbs"),
  read("templates/itemforge.hbs"),
  read("templates/provider-setup.hbs"),
  read("templates/manage-presets.hbs"),
  read("templates/_progress.hbs"),
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
  assert.match(template, /notification warning spf-provider-warning" role="status"/, `${name} provider warnings must expose status semantics`);
  assert.match(template, /notification error" role="alert"/, `${name} generation failures must be announced as alerts`);
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
assert.match(
  generator,
  /spf-mode-toggle" role="radiogroup" aria-label=/,
  "generation modes must expose a named native radio group"
);
for (const legendKey of ["ConceptLegend", "EncounterLegend", "CharacterLegend"]) {
  assert.match(
    generator,
    new RegExp(`SIMPLYPF2E\\.Generator\\.${legendKey}`),
    `generation mode must expose its own fieldset legend: ${legendKey}`
  );
}
for (const [mode, preview] of [
  ["single", "preview"],
  ["encounter", "encounterPreview"],
  ["character", "pcPreview"]
]) {
  assert.match(
    generatorApp,
    new RegExp(`${preview}: this\\.#input\\.mode === "${mode}" \\?`),
    `generator must hide other modes' stale previews while ${mode} mode is active`
  );
}
assert.match(
  generatorApp,
  /#modePrompts = \{ single: "", encounter: "", character: "" \}/,
  "each generator mode must keep an independent prompt draft"
);
assert.match(
  generatorApp,
  /this\.#modePrompts\[previousMode\] = renderedPrompt[\s\S]*?this\.#modePrompts\[mode\] \?\? ""/,
  "mode changes must save the old draft and restore the new mode's draft"
);

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
assert.match(
  css,
  /\.simplypf2e \.spf-mode-toggle input\[type="radio"\]\s*\{[^}]*position:\s*absolute;[^}]*clip:/s,
  "mode radios must stay keyboard-accessible while visually hidden"
);
assert.match(
  css,
  /\.simplypf2e \.spf-mode-toggle label:focus-within\s*\{[^}]*outline:/s,
  "keyboard focus on a mode must remain visible on its compact tile"
);
assert.match(
  progress,
  /spf-progress-bar" role="progressbar"[^>]*aria-valuemin="0"[^>]*aria-valuemax="100"[^>]*aria-valuenow="\{\{progress\.percent\}\}"/,
  "visual generation progress must expose its current value to assistive technology"
);
assert.match(
  progress,
  /spf-busy" role="status" aria-live="polite"/,
  "indeterminate generation work must be announced without interrupting the user"
);

console.log("UI layout contract checks passed.");
