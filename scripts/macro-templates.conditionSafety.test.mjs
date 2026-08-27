// The condition macro must fail closed when it cannot read a PF2e save result:
// a save-negates effect must never silently become an automatic condition.
// Also covers the two AI-text-into-macro-HTML escaping bugs fixed alongside
// this: an unescaped item name or condition duration lets AI-authored text
// (which the module treats as untrusted, same as any generated description)
// break out of the macro's ChatMessage/notification HTML strings.
// Run: node scripts/macro-templates.conditionSafety.test.mjs
import assert from "node:assert/strict";
import { buildActivationCommand } from "./macro-templates.mjs";
import { normalizeMagicItemConcept } from "./item-builder.mjs";

// text.mjs's esc() defers to foundry.utils.escapeHTML when present; stub the
// real Foundry escaping behavior so normalizeMagicItemConcept's esc() calls
// (via normalizeActivation) behave the same as they would in a live world.
globalThis.foundry = {
  utils: {
    escapeHTML: (text) => String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;")
  }
};

const command = await buildActivationCommand({
  template: "condition",
  params: { conditionSlug: "frightened", value: 1, saveType: "fortitude", dc: 20 }
}, { forgeId: "test-forge", itemName: "Test Item", itemLevel: 3 });

assert.match(command, /const dos = outcome\?\.degreeOfSuccess \?\? outcome\?\.options\?\.degreeOfSuccess;/);
assert.match(command, /skipping auto-apply so the table can adjudicate manually/);
assert.match(command, /applies = false;/);
assert.match(command, /increaseCondition\(P\.conditionSlug, P\.value \? \{ value: P\.value \} : \{\}\)/);
assert.doesNotMatch(command, /result unclear to the macro\).*applied/);

console.log("macro condition safety check: all assertions passed");

/* -------------------- AI-text HTML-escaping regression -------------------- */

// createActivationMacro (the real call site) is the one that must pre-escape
// META.itemName since it's not testable standalone without a Foundry Item/
// Macro/Folder stub, so this exercises buildActivationCommand directly the
// same way that call site does: passing an itemName as it would appear AFTER
// createActivationMacro's esc() call.
const escapedName = "&lt;img src=x onerror=alert(1)&gt;Cursed Blade";
const nameCommand = await buildActivationCommand({
  template: "condition",
  params: { conditionSlug: "frightened", value: 1, saveType: null, dc: null }
}, { forgeId: "test-forge", itemName: escapedName, itemLevel: 3 });

assert.ok(nameCommand.includes(JSON.stringify(escapedName)), "escaped item name must be embedded in META as-is");
assert.doesNotMatch(nameCommand, /<img src=x onerror=alert\(1\)>/, "a raw unescaped item name must never appear in the macro source");

// normalizeActivation (private, exercised through normalizeMagicItemConcept)
// must esc() an AI-supplied condition duration the same way selfBuff already
// escapes effectName/description, since durationText is concatenated
// straight into ChatMessage content in CONDITION_BODY.
const maliciousDuration = '1 minute<script>alert(1)</script>';
const concept = normalizeMagicItemConcept({
  name: "Test Item",
  activation: {
    template: "condition",
    actionCost: 2,
    params: { conditionSlug: "frightened", duration: maliciousDuration }
  }
}, { level: 3, rarity: "common", availableKinds: [], usageOptions: ["held"] });

assert.equal(concept.activation.template, "condition");
assert.ok(!concept.activation.params.duration.includes("<script>"), "AI-supplied duration must be HTML-escaped, never raw");
assert.match(concept.activation.params.duration, /&lt;script&gt;/, "escaped duration should carry HTML entities instead");

console.log("macro/item-builder AI-text escaping check: all assertions passed");
