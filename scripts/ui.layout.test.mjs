// Static UI contract checks for the compact provider strip and responsive
// controls. These complement live/browser QA by preventing the two templates
// or the narrow-window overflow fix from silently drifting apart.
// Run: node scripts/ui.layout.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [generator, itemForge, providerSetup, managePresets, progress, generatorApp, itemForgeApp, css, langJson] = await Promise.all([
  read("templates/generator.hbs"),
  read("templates/itemforge.hbs"),
  read("templates/provider-setup.hbs"),
  read("templates/manage-presets.hbs"),
  read("templates/_progress.hbs"),
  read("scripts/generator-app.mjs"),
  read("scripts/itemforge-app.mjs"),
  read("styles/simplypf2e.css"),
  read("lang/en.json")
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
assert.match(progress, /\{\{#if busyMessage\}\}[\s\S]*?\{\{busyMessage\}\}[\s\S]*?\{\{else if progress\}\}/,
  "native character creation must show an escaped status instead of a model progress percentage");
assert.doesNotMatch(progress, /\{\{\{busyMessage\}\}\}/, "status text must never be rendered as raw HTML");
assert.match(generatorApp, /busyMessage: this\.#busyMessage/, "generator must expose its native creation status");
assert.match(generatorApp, /selectChoices: async \(groups\) =>[\s\S]*?selectCharacterChoices\([\s\S]*?this\._recordTokens\(label, usage\)/,
  "character creation must use the grounded provider selector and record its usage");
assert.match(generatorApp, /finally \{\s*this\.#busy = false;\s*this\.#busyMessage = null;\s*this\._progress = null;/,
  "character success and failure must clear both native and AI progress state");
const messages = JSON.parse(langJson).SIMPLYPF2E;
assert.match(messages.Progress.ApplyingCharacter, /PF2e choice dialogs/);
assert.match(messages.Generator.ChoicesNeedInput, /could not be selected automatically/);

// --- Shared visual system (UI overhaul) ---------------------------------
// One primary action per window, shared icon-button/card/empty-state kit.

for (const [name, template, createAction] of [
  ["generator", generator, "createActor"],
  ["item forge", itemForge, "createItem"]
]) {
  assert.match(
    template,
    /class="spf-primary" data-action="generate"/,
    `${name} generate must be the styled primary action`
  );
  assert.match(
    template,
    new RegExp(`class="spf-primary" data-action="${createAction}"`),
    `${name} create must be the styled primary action`
  );
  assert.match(template, /spf-empty/, `${name} must show an empty state before the first generation`);
  assert.match(template, /spf-inputs spf-card/, `${name} inputs must use the shared card surface`);
}

assert.match(generatorApp, /showEmptyState:/, "generator must expose the empty-state flag");
assert.match(itemForgeApp, /showEmptyState:/, "item forge must expose the empty-state flag");

// Reading order: mode switch → prompt → presets → advanced options → generate.
{
  const promptAt = generator.indexOf('id="spf-generator-prompt"');
  const presetAt = generator.indexOf('id="spf-generator-preset"');
  const modeAt = generator.indexOf("spf-mode-toggle");
  const rowAt = generator.indexOf('class="spf-row"');
  assert.ok(modeAt >= 0 && promptAt >= 0 && presetAt >= 0 && rowAt >= 0, "generator flow anchors must exist");
  assert.ok(modeAt < promptAt, "the mode switch must precede the prompt");
  assert.ok(promptAt < presetAt, "the prompt must precede the preset controls");
  assert.ok(presetAt < rowAt, "presets must precede the advanced options row");
}

assert.match(providerSetup, /class="spf-primary" data-action="saveAndTest"/,
  "provider setup must mark Save & Test as the primary action");

// Progress: the step list and the live-updated detail line form one status system.
assert.match(progress, /spf-progress-steps/, "progress must list the pipeline steps");
assert.match(progress, /spf-step-\{\{this\.state\}\}/, "each progress step must carry its state class");
assert.match(progress, /<p class="spf-progress-detail">\{\{progress\.detail\}\}<\/p>/,
  "the streaming detail line must stay a direct-textContent target for app-base");

for (const rule of ["spf-card", "spf-icon-btn", "spf-empty"]) {
  assert.match(css, new RegExp(`\\.simplypf2e \\.${rule}\\s*\\{`), `shared kit class .${rule} must be defined`);
}
assert.match(css, /\.simplypf2e button\.spf-primary\s*\{/, "the primary button treatment must be defined");
assert.match(
  css,
  /\.simplypf2e :is\(button, input, select, textarea\):focus-visible\s*\{[^}]*outline:/s,
  "every control must have a visible focus state"
);
assert.match(css, /\.simplypf2e button:disabled\s*\{[^}]*opacity/s, "disabled controls must read as disabled");
assert.match(css, /\.application\.simplypf2e\s*\{[^}]*min-width/s,
  "resizable windows must clamp to a usable minimum size");

// --- Cross-app uniformity (UI uniformity pass) --------------------------
// The two apps must share one mental model: same segmented switch, same
// preset slot, same sources gear, same title pattern, same options order.

// 1. The forge's kind selector is the SAME segmented control as the
//    generator's mode switch — a radio group whose name/value contract
//    ("kind": wondrous|weapon|armor) the app reads back.
assert.match(
  itemForge,
  /spf-mode-toggle" role="radiogroup" aria-label=/,
  "item forge kind selector must use the shared segmented control"
);
assert.match(
  itemForge,
  /<input type="radio" name="kind" value="\{\{this\.value\}\}"/,
  "the kind switch must stay a radio group named 'kind'"
);
assert.match(
  itemForgeApp,
  /\[name="kind"\]:checked/,
  "the forge must read the CHECKED kind radio, not the first one"
);
assert.match(
  itemForgeApp,
  /querySelectorAll\('input\[name="kind"\]'\)/,
  "the forge must re-render when the kind switch changes"
);

// 2. The preset row renders in EVERY generator mode (one stable slot; the
//    guidance feeds all three pipelines, Random ignores it like Single's
//    dice button always has).
{
  const presetAt = generator.indexOf('class="form-group spf-preset"');
  assert.ok(presetAt >= 0, "the preset row must exist");
  const before = generator.slice(Math.max(0, presetAt - 400), presetAt);
  assert.ok(
    !before.includes("{{#if singleMode}}"),
    "the preset row must not be gated to Single mode"
  );
}
assert.match(
  generatorApp,
  /preset: isRandom \? null : findPreset\(this\.#input\.preset\)\?\.prompt \?\? null,[\s\S]*?amount: this\.#input\.treasureAmount/,
  "encounter members must honor the selected preset"
);
assert.match(
  generatorApp,
  /generatePCConcept\(\{[\s\S]*?preset: isRandom \? null : findPreset\(this\.#input\.preset\)\?\.prompt \?\? null/,
  "character generation must honor the selected preset"
);

// 3. One compendium-sources gear beside Generate in BOTH apps, wired to the
//    same shared settings app.
for (const [name, template] of [
  ["generator", generator],
  ["item forge", itemForge]
]) {
  const rowAt = template.indexOf('class="spf-generate-row"');
  const gearAt = template.indexOf('data-action="configureSources"');
  const fieldsetEnd = template.indexOf("</fieldset>");
  assert.ok(rowAt >= 0 && gearAt >= 0 && fieldsetEnd >= 0, `${name} must have a generate row and a sources gear`);
  assert.ok(rowAt < gearAt && gearAt < fieldsetEnd, `${name} sources gear must sit in the generate row`);
}
for (const [name, source] of [
  ["generator", generatorApp],
  ["item forge", itemForgeApp]
]) {
  assert.match(source, /configureSources:/, `${name} must register the sources gear action`);
  assert.match(source, /new SourcesConfigApp\(\)\.render\(true\)/, `${name} sources gear must open the shared sources app`);
}

// 4. One stable options order in every mode: Level → rarity control →
//    Treasure → Spellcasting, with encounter extras appended AFTER the
//    shared columns.
{
  const levelAt = generator.indexOf('id="spf-generator-level"');
  const rarityCapAt = generator.indexOf('id="spf-generator-rarity-cap"');
  const rarityAt = generator.indexOf('id="spf-generator-rarity"');
  const treasureAt = generator.indexOf('id="spf-generator-treasure-amount"');
  const spellsAt = generator.indexOf('name="allowSpellcasting"');
  const partyAt = generator.indexOf('id="spf-generator-party-size"');
  const threatAt = generator.indexOf('id="spf-generator-threat"');
  for (const [label, at] of [["level", levelAt], ["rarity cap", rarityCapAt], ["rarity", rarityAt], ["treasure", treasureAt], ["spellcasting", spellsAt], ["party size", partyAt], ["threat", threatAt]]) {
    assert.ok(at >= 0, `options anchor must exist: ${label}`);
  }
  assert.ok(levelAt < rarityCapAt && levelAt < rarityAt, "Level must lead the options row");
  assert.ok(rarityAt < treasureAt && rarityCapAt < treasureAt, "the rarity control must precede Treasure amount");
  assert.ok(treasureAt < spellsAt, "Treasure amount must precede Allow spellcasting");
  assert.ok(spellsAt < partyAt && partyAt < threatAt, "encounter extras must append after the shared columns");
}

// 5. Window titles and prompt labels follow one pattern.
{
  const lang = JSON.parse(langJson).SIMPLYPF2E;
  assert.match(lang.Generator.Title, /^SimplyPF2e — /, "generator title must follow the shared pattern");
  assert.match(lang.ItemForge.Title, /^SimplyPF2e — /, "item forge title must follow the shared pattern");
  for (const [key, value] of [
    ["Generator.Prompt", lang.Generator.Prompt],
    ["Generator.CharacterPrompt", lang.Generator.CharacterPrompt],
    ["ItemForge.Prompt", lang.ItemForge.Prompt]
  ]) {
    assert.match(value, /^Describe the /, `${key} must follow the shared 'Describe the …' pattern`);
  }
  assert.match(lang.Generator.EncounterTheme, /^Describe the encounter theme \(optional\)$/,
    "the encounter label must follow the shared pattern with the surprise hint moved out");
  assert.match(lang.Generator.EncounterThemePlaceholder, /leave blank for a surprise/,
    "the surprise hint must live in the encounter placeholder");
}

// Native-choice review is an escaped, explicitly limited snapshot, not an actor repair.
const reviewCard = generator.slice(generator.indexOf("{{#if characterReview}}"));
assert.match(reviewCard, /role="status"/);
assert.match(reviewCard, /\{\{characterReview.actorName\}\}/);
assert.match(reviewCard, /\{\{this.itemName\}\}/);
assert.match(reviewCard, /\{\{localize this.prompt\}\}/);
assert.doesNotMatch(reviewCard, /\{\{\{/);
for (const action of ["openReviewedCharacter", "dismissCharacterReview"]) {
  assert.match(reviewCard, new RegExp(`data-action="${action}"`));
  assert.match(generatorApp, new RegExp(`${action}: GeneratorApp\\.#on`));
}
const reviewLanguage = JSON.parse(langJson).SIMPLYPF2E.Generator;
assert.match(reviewLanguage.ReviewHint, /snapshot.*not a full character validation/);
assert.match(reviewLanguage.ReviewHint, /conditional or intentionally disabled/);
assert.match(reviewLanguage.ReviewIncomplete, /Not every item/);

console.log("UI layout contract checks passed.");
