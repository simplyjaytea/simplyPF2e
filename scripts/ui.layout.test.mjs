// Static UI contract checks for the consumer-facing applications. These checks
// complement live/browser QA by keeping the shared provider/progress chrome,
// responsive layout, and action states aligned across templates and contexts.
// Run: node scripts/ui.layout.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [
  generator, itemForge, providerHeader, providerSetup, sources, managePresets,
  progress, generatorApp, itemForgeApp, providerSetupApp, sourcesApp,
  managePresetsApp, appBase, css, langJson
] = await Promise.all([
  read("templates/generator.hbs"),
  read("templates/itemforge.hbs"),
  read("templates/_provider-header.hbs"),
  read("templates/provider-setup.hbs"),
  read("templates/sources.hbs"),
  read("templates/manage-presets.hbs"),
  read("templates/_progress.hbs"),
  read("scripts/generator-app.mjs"),
  read("scripts/itemforge-app.mjs"),
  read("scripts/provider-setup-app.mjs"),
  read("scripts/sources-app.mjs"),
  read("scripts/manage-presets-app.mjs"),
  read("scripts/app-base.mjs"),
  read("styles/simplypf2e.css"),
  read("lang/en.json")
]);

const messages = JSON.parse(langJson).SIMPLYPF2E;

// Forge choice buttons expose the same exclusive selection that the app
// context owns, with native ApplicationV2 actions and retained form drafts.
assert.match(itemForge, /class="spf-kind-choices" role="group" aria-label=/);
assert.match(itemForge, /<button type="button" class="spf-kind-choice \{\{#if this\.selected\}\}spf-kind-selected/);
assert.match(itemForge, /data-action="selectKind" data-kind="\{\{this\.value\}\}" aria-pressed="\{\{this\.selected\}\}"/);
assert.match(itemForge, /this\.hint/);
assert.match(itemForgeApp, /selectKind: ItemForgeApp\.#onSelectKind/);
assert.match(itemForgeApp, /#input = \{ \.\.\.this\.#input, kind \}/);
assert.doesNotMatch(itemForgeApp, /querySelectorAll\('input\[name="kind"\]'/);
assert.match(itemForge, /localize "SIMPLYPF2E\.ItemForge\.CreatedWarning"/);
assert.doesNotMatch(itemForge, /\{\{created\.warning\}\}/, "a warning flag must render useful copy rather than true");

// The provider identity/status strip is one partial. Keeping it in one place
// prevents the generator and forge from disagreeing about what was configured
// versus what was actually tested.
assert.match(providerHeader, /spf-provider-header/, "provider partial must expose a named header");
for (const key of ["providerReady", "providerTested", "providerFeedback", "provider\\.model", "connectionName"]) {
  assert.match(providerHeader, new RegExp(key), `provider partial must render ${key}`);
}
for (const action of ["configureProvider", "testProvider", "authorizeApiKey"]) {
  assert.match(providerHeader, new RegExp(`data-action="${action}"`), `provider partial must retain ${action}`);
}
assert.match(providerHeader, /name="activeConnection"/, "provider partial must expose the connection switch");
assert.match(providerHeader, /spf-provider-state" role="img" aria-label=/,
  "provider readiness must have a non-color accessible label");
assert.match(providerHeader, /providerFeedback\.text/, "provider test results must be rendered as escaped text");
assert.match(providerHeader, /spf-feedback-\{\{providerFeedback\.kind\}\}/,
  "provider feedback must carry its success/error state");
assert.match(providerHeader, /spf-provider-summary/, "provider partial must identify its configured connection");
for (const [name, template] of [["generator", generator], ["item forge", itemForge]]) {
  assert.match(template, /\{\{>\s*simplypf2e-provider-header/,
    `${name} must consume the shared provider partial`);
  assert.match(template, /data-action="configureSources"/, `${name} must offer source setup`);
  assert.match(template, /notification (?:error|warning)[^>]*role="(?:alert|status)"/s,
    `${name} must expose inline warning/error semantics`);
}

// Every icon-only control needs a name. Text-bearing controls may use their
// visible label; icons inside them are decorative and hidden from AT.
for (const [name, template] of [
  ["generator", generator], ["item forge", itemForge], ["provider setup", providerSetup],
  ["sources", sources], ["preset manager", managePresets]
]) {
  for (const match of template.matchAll(/<button\b([^>]*)>\s*<i\b[^>]*>\s*<\/i>\s*<\/button>/g)) {
    assert.match(match[1], /\baria-label=/,
      `${name} icon-only buttons must have an accessible name: ${match[0]}`);
  }
  for (const icon of template.matchAll(/<i\b([^>]*)>/g)) {
    if (/\brole="img"/.test(icon[1])) continue;
    assert.match(icon[1], /\baria-hidden="true"/,
      `${name} decorative icons must be hidden from assistive technology: ${icon[0]}`);
  }
}

for (const [name, template] of [["generator", generator], ["item forge", itemForge], ["provider setup", providerSetup]]) {
  const ids = new Set([...template.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  for (const match of template.matchAll(/<label\b[^>]*\bfor="([^"]+)"[^>]*>/g)) {
    assert.ok(ids.has(match[1]), `${name} label must target an existing control: ${match[0]}`);
  }
}

// Provider setup keeps its result in the panel and uses the same larger,
// semantic controls as the main apps.
for (const field of ["apiBaseUrl", "model", "connectionName", "activeConnection"]) {
  assert.match(providerSetup, new RegExp(`name="${field}"`), `provider setup must include ${field}`);
}
assert.match(providerSetup, /type="password" name="apiKey"/,
  "the saved key must never be rendered back into the setup form");
for (const action of ["chooseProvider", "createConnection", "deleteConnection", "loadModels", "saveAndTest"]) {
  assert.match(providerSetup, new RegExp(`data-action="${action}"`), `provider setup must retain ${action}`);
}
assert.match(providerSetup, /<datalist id="spf-provider-model-list">/);
assert.match(providerSetup, /spf-feedback-\{\{feedback\.kind\}\}/);
assert.match(providerSetupApp, /feedback: this\.#feedback/);
assert.match(providerSetupApp, /ModelsLoaded/);
assert.match(providerSetupApp, /ModelsFailed/);
assert.match(providerSetupApp, /TestSuccess/);
assert.match(providerSetupApp, /TestFailed/);
assert.match(providerSetupApp, /finally \{[\s\S]*?await this\.render\(\);[\s\S]*?\}/,
  "provider setup must re-render after async feedback updates");
assert.match(providerSetupApp, /closeOnSubmit: true/,
  "ordinary Save & Authorize remains a form submit");
const saveAndTestAt = providerSetupApp.indexOf("static async #onSaveAndTest");
const cancelAt = providerSetupApp.indexOf("static async #onCancel", saveAndTestAt);
assert.ok(saveAndTestAt >= 0 && cancelAt > saveAndTestAt,
  "provider setup must retain a distinct Save & Test action");
assert.doesNotMatch(providerSetupApp.slice(saveAndTestAt, cancelAt), /await this\.close\(\);/,
  "Save & Test must leave its inline result visible");

// Generator flow: the mode, prompt, prominent encounter controls, advanced
// options, and actions stay readable at every intrinsic app width.
assert.match(generator, /spf-mode-toggle" role="radiogroup" aria-label=/);
for (const key of ["ConceptLegend", "NpcLegend", "EncounterLegend", "CharacterLegend"]) {
  assert.match(generator, new RegExp(`SIMPLYPF2E\\.Generator\\.${key}`));
}
assert.match(generator, /EncounterThemeHint/);
assert.match(generator, /CharacterRestriction/);
assert.match(generator, /RandomPreview/);
assert.match(generator, /data-action="generateRandom"/);
assert.match(generator, /data-tooltip="\{\{localize randomTooltipKey\}\}"/);
assert.match(generator, /aria-label="\{\{localize randomTooltipKey\}\}"/);
assert.match(generatorApp, /providerTested: this\._providerTested/);
assert.match(generatorApp, /providerFeedback: this\._providerFeedback/);
assert.match(itemForgeApp, /providerTested: this\._providerTested/);
assert.match(itemForgeApp, /providerFeedback: this\._providerFeedback/);
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

const promptAt = generator.indexOf('id="spf-generator-prompt"');
const levelAt = generator.indexOf('id="spf-generator-level"');
const partyAt = generator.indexOf('id="spf-generator-party-size"');
const threatAt = generator.indexOf('id="spf-generator-threat"');
const advancedAt = generator.indexOf('class="spf-advanced"');
assert.ok(promptAt >= 0 && levelAt > promptAt && advancedAt > levelAt);
assert.ok(partyAt > levelAt && partyAt < advancedAt, "party size must sit beside the prominent level");
assert.ok(threatAt > levelAt && threatAt < advancedAt, "threat must sit beside the prominent level");
assert.match(generator, /<details class="spf-advanced">[\s\S]*?<summary>\{\{localize "SIMPLYPF2E\.Generator\.Advanced"\}\}<\/summary>/);
assert.match(generator, /<optgroup label="\{\{localize 'SIMPLYPF2E\.Presets\.StandardGroup'\}\}">/);
assert.match(generator, /<optgroup label="\{\{localize 'SIMPLYPF2E\.Presets\.CustomGroup'\}\}">/);
assert.match(generator, /spf-preset-trust/);
assert.match(generator, /aria-describedby="spf-generator-preset-trust"/);
assert.doesNotMatch(generator, /\{\{#each presets\}\}/);
assert.doesNotMatch(generator, /data-action="savePreset"|data-action="duplicatePreset"|data-action="deletePreset"/);
assert.match(generatorApp, /#modePrompts = \{ monster: "", npc: "", encounter: "", character: "" \}/);
assert.match(generatorApp, /showEmptyState:/);

const actionRow = generator.slice(generator.indexOf('class="spf-generate-row"'), generator.indexOf("</fieldset>"));
assert.ok(actionRow.indexOf('data-action="generate"') < actionRow.indexOf('data-action="previewPlan"'));
assert.ok(actionRow.indexOf('data-action="previewPlan"') < actionRow.indexOf('data-action="generateRandom"'));
assert.match(generator, /unless hasPreview/);
assert.match(generator, /unless created/);
for (const key of ["GenerateCreateMonster", "GenerateCreateNpc", "GenerateCreateEncounter", "GenerateCreateCharacter",
  "CreateMonster", "CreateNpc", "CreateEncounter", "CreateCharacter"]) {
  assert.match(generator, new RegExp(`SIMPLYPF2E\\.Generator\\.${key}`));
}
assert.match(generator, /created\.grounding\.rows/);
assert.match(generator, /data-action="openCreatedActor"/);
assert.match(generator, /data-action="generateAnother"/);
assert.match(generatorApp, /hasPreview: Boolean/);
assert.match(generatorApp, /created: this\.#created/);
assert.match(itemForge, /unless hasPreview/);
assert.match(itemForge, /data-action="openCreatedItem"/);
assert.match(itemForge, /data-action="forgeAnother"/);
assert.match(itemForgeApp, /showEmptyState:/);
assert.match(itemForgeApp, /hasPreview: Boolean/);

// Token usage is a collapsed secondary disclosure with its total visible in
// the summary. It must not dominate every completed preview.
for (const [name, template] of [["generator", generator], ["item forge", itemForge]]) {
  assert.match(template, /<details class="spf-token-report">[\s\S]*?<summary>[\s\S]*?tokenReport\.totalText/,
    `${name} token usage must be collapsed with the total in its summary`);
  assert.doesNotMatch(template, /<div class="spf-token-report">/,
    `${name} must not render token usage as an always-open block`);
}

// Progress is persistent while work is active and remains meaningful at all
// terminal outcomes. Dynamic text is escaped and patched through textContent.
assert.match(progress, /data-phase="\{\{progress\.phase\}\}" data-status="\{\{progress\.status\}\}"/);
assert.match(progress, /spf-progress-announcement/);
assert.match(progress, /class="spf-sigil"/);
assert.match(progress, /spf-sigil-ring/);
assert.match(progress, /spf-sigil-core/);
assert.match(progress, /class="spf-progress-heading"/);
assert.match(progress, /class="spf-progress-track"/);
assert.match(progress, /role="progressbar"[^>]*aria-valuemin="0"[^>]*aria-valuemax="100"[^>]*aria-valuenow="\{\{progress\.percent\}\}"/);
assert.match(progress, /class="spf-progress-activity"/);
assert.match(progress, /class="spf-progress-step-label"/);
assert.match(progress, /class="spf-step-outcome/);
for (const key of ["Pending", "Active", "Done", "Warning", "Estimated", "Elapsed", "Activity", "Continues",
  "Waiting", "Receiving", "Retrying", "Compatibility", "Validating", "Complete", "Failed", "Cancelled", "SavedWarning", "Skipped", "Working"]) {
  assert.match(langJson, new RegExp(`\"${key}\"`), `progress localization must include ${key}`);
}
assert.match(progress, /\{\{#if progress\}\}[\s\S]*spf-progress-steps/);
for (const [name, template] of [["generator", generator], ["item forge", itemForge]]) {
  assert.match(template, /\{\{#if progress\}\}[\s\S]*\{\{>\s*simplypf2e-progress\s*\}\}[\s\S]*\{\{else if busy\}\}/,
    `${name} must retain the indeterminate busy fallback around progress`);
}
assert.doesNotMatch(progress, /\{\{\{(?:progress|busyMessage)/, "progress status must never be raw HTML");
assert.match(appBase, /_paintProgress\(\)/);
assert.match(appBase, /streamFraction\(\{ phase, prior:/);
assert.match(appBase, /_providerTested/);
assert.match(generatorApp, /busyMessage: this\.#busyMessage/);

// Sources and preset management keep actionable results in their own panels.
assert.match(sources, /spf-feedback-\{\{feedback\.kind\}\}/);
assert.match(sourcesApp, /constructor\(options = \{\}, onSave = null\)/);
assert.match(sourcesApp, /this\.#onSave\?\.\(\)/);
assert.match(sourcesApp, /SaveFailed/);
assert.match(sourcesApp, /closeOnSubmit: false/);
assert.match(managePresets, /ManageHint/);
for (const key of ["EditLabel", "DuplicateLabel", "ExportLabel", "DeleteLabel"]) {
  assert.match(managePresets, new RegExp(`SIMPLYPF2E\\.Presets\\.${key}`));
}
assert.match(managePresets, /spf-feedback-\{\{feedback\.kind\}\}/);
assert.match(managePresetsApp, /feedback: this\.#feedback/);
assert.match(managePresetsApp, /ActionFailed/);
assert.match(managePresetsApp, /static async #onImport/);

// Shared visual system: opaque surfaces, intrinsic grids, one body scroller,
// and no viewport breakpoint that can misclassify a docked Foundry window.
for (const variable of ["--spf-page", "--spf-surface", "--spf-surface-raised", "--spf-brand-dark", "--spf-brand-brass"]) {
  assert.match(css, new RegExp(variable.replaceAll("-", "\\-")));
}
assert.match(css, /\.theme-dark \.simplypf2e[\s\S]*?--spf-surface-raised/);
assert.match(css, /\.application\.simplypf2e[\s\S]*?container-type:\s*inline-size/);
for (const body of ["simplypf2e-generator", "simplypf2e-provider-setup", "simplypf2e-sources", "simplypf2e-manage-presets"]) {
  const block = css.slice(css.indexOf(`.${body}`), css.indexOf(`.${body}`) + 700);
  assert.match(block, /position:\s*relative/,
    `${body} must contain clipped accessibility labels within its scroll region`);
  assert.match(block, /overflow-y:\s*auto/,
    `${body} must be the app's flexible scroll region`);
}
assert.match(css, /\.simplypf2e \.spf-kind-choices\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit/);
assert.match(css, /\.simplypf2e \.spf-row\s*\{[\s\S]*?grid-template-columns:/);
assert.match(css, /\.simplypf2e \.spf-actions\s*\{[\s\S]*?flex-wrap:\s*wrap/);
assert.match(css, /\.simplypf2e \.spf-provider-model\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);
assert.doesNotMatch(css, /@media\s*\(max-width:/,
  "responsive app layout must follow named containers instead of the browser viewport");
for (const name of ["spf-generator", "spf-provider-setup", "spf-presets", "spf-sources"]) {
  assert.match(css, new RegExp(`@container\\s+${name}\\s*\\(max-width:`), `${name} needs a narrow container rule`);
}
for (const status of ["running", "success", "warning", "cancelled", "error"]) {
  assert.match(css, new RegExp(`\\.spf-progress\\[data-status=\\\"${status}\\\"\\]`),
    `progress must style its ${status} terminal/status state`);
}
for (const animation of ["spf-sigil-ring", "spf-sigil-core", "spf-progress-bar-pulse", "spf-step-slide"]) {
  assert.match(css, new RegExp(`@keyframes\\s+${animation}`));
}
assert.match(css, /\.theme-dark \.simplypf2e \.spf-progress\[data-status="running"\] \.spf-sigil[\s\S]*?color:\s*var\(--spf-brand-brass-bright\)/,
  "running progress sigil must remain legible on the dark theme");
assert.match(css, /\.simplypf2e \.spf-sigil\s*\{[\s\S]*?width:\s*64px[\s\S]*?height:\s*64px/);
assert.match(css, /\.simplypf2e \.spf-progress-fill\s*\{[\s\S]*?transition:\s*width/);
assert.match(css, /prefers-reduced-motion:\s*reduce/);
assert.match(css, /\.simplypf2e \.spf-progress\s*\{[\s\S]*?flex:\s*0 0 auto/,
  "progress must keep its card height intrinsic while the app body scrolls");
const reducedMotionAt = css.indexOf("@media (prefers-reduced-motion: reduce)");
assert.ok(reducedMotionAt >= 0, "reduced-motion progress rules must exist");
const reducedMotion = css.slice(reducedMotionAt);
for (const selector of [
  /\.simplypf2e \.spf-progress\[data-status="running"\] \.spf-sigil-ring/,
  /\.simplypf2e \.spf-progress\[data-status="running"\] \.spf-sigil-core/,
  /\.simplypf2e \.spf-progress\[data-status="running"\] \.spf-progress-bar::after/,
  /\.simplypf2e \.spf-progress\[data-status="running"\] \.spf-progress-fill::after/
]) {
  assert.match(reducedMotion, selector,
    "reduced motion must disable each running progress animation");
}

// User-facing text remains escaped at the template boundary. The one
// intentional triple-stache is the pre-escaped activation summary documented
// in itemforge.hbs; no provider/AI feedback uses it.
assert.doesNotMatch(providerHeader, /\{\{\{/);
assert.doesNotMatch(sources, /\{\{\{/);
assert.doesNotMatch(managePresets, /\{\{\{/);

// Copy used by the visual states must exist in the locale rather than falling
// back to raw localization keys in a consumer window.
for (const [group, keys] of Object.entries({
  Generator: ["GenerateCreateMonster", "CreateMonster", "RandomPreview", "CharacterRestriction", "EncounterThemeHint"],
  ItemForge: ["GeneratePlan", "CreatedTitle", "OpenItem", "ForgeAnother"],
  Sources: ["SaveFailed"],
  Presets: ["ManageHint", "EditLabel", "DuplicateLabel", "ExportLabel", "DeleteLabel", "ActionFailed"],
  Progress: ["Pending", "Active", "Done", "Warning", "Estimated", "Elapsed", "Complete", "Failed", "Cancelled"]
})) {
  for (const key of keys) assert.ok(messages[group]?.[key], `locale must define ${group}.${key}`);
}

// Native-choice review is an escaped, explicitly limited snapshot, not an actor repair.
const reviewCard = generator.slice(generator.indexOf("{{#if characterReview}}"));
assert.match(reviewCard, /role="status"/);
assert.match(reviewCard, /\{\{characterReview\.actorName\}\}/);
assert.match(reviewCard, /\{\{this\.itemName\}\}/);
assert.match(reviewCard, /\{\{localize this\.prompt\}\}/);
assert.doesNotMatch(reviewCard, /\{\{\{/);
for (const action of ["openReviewedCharacter", "dismissCharacterReview"]) {
  assert.match(reviewCard, new RegExp(`data-action="${action}"`));
  assert.match(generatorApp, new RegExp(`${action}: GeneratorApp\\.#on`));
}
assert.match(messages.Generator.ReviewHint, /snapshot.*not a full character validation/);
assert.match(messages.Generator.ReviewHint, /conditional or intentionally disabled/);
assert.match(messages.Generator.ReviewIncomplete, /Not every item/);
assert.match(generator, /pcPreview\.skillPriorities/);
assert.match(generator, /pcPreview\.automaticSkills/);
assert.match(reviewCard, /characterReview\.skills\.rows/);
assert.match(reviewCard, /\{\{this\.name\}\} — \{\{this\.rank\}\}/);
assert.match(reviewCard, /characterReview\.skills\.warnings/);
assert.match(messages.Skills.Snapshot, /not a full character validation/);

console.log("UI layout contract checks passed.");
