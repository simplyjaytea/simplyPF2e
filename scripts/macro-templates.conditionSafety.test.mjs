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
assert.equal(concept.activation.params.duration, null,
  "free-form durations are rejected; the model may only choose module-owned duration enums");

/* -------------------- runtime actor-name escaping regression -------------------- */

const hostileActingName = '<img src=x onerror="acting">';
const hostileTargetName = '<svg onload="target">';
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const messages = [];
const flavors = [];
let activationFlag = { forgeId: "test-forge", uses: { value: 1, max: 1, per: "day" } };
const acting = {
  name: hostileActingName,
  items: [{
    getFlag: () => structuredClone(activationFlag),
    async setFlag(_module, _key, value) { activationFlag = value; }
  }]
};
globalThis.foundry = { utils: {
  mergeObject: (a, b) => ({ ...a, ...b, uses: { ...a.uses, ...b.uses } })
} };
const target = {
  name: hostileTargetName,
  async increaseCondition() {}
};
globalThis.game = {
  user: { character: acting, targets: new Set([{ actor: target }]) }
};
globalThis.canvas = { tokens: { controlled: [] } };
globalThis.ui = { notifications: { warn() {} } };
globalThis.ChatMessage = {
  getSpeaker: () => ({}),
  create: (message) => messages.push(message)
};
globalThis.CONFIG = { Dice: { rolls: [] } };
globalThis.Roll = class {};

const conditionCommand = await buildActivationCommand({
  template: "condition", params: { conditionSlug: "frightened", value: 1, saveType: null, dc: null }
}, { forgeId: "test-forge", itemName: "Test Item", itemLevel: 3 });
await new AsyncFunction(conditionCommand)();
assert.match(messages.at(-1).content, /&lt;svg onload=&quot;target&quot;&gt;/,
  "target actor name must be escaped at ChatMessage construction time");
assert.doesNotMatch(messages.at(-1).content, /<svg/, "raw target HTML must not reach chat content");

globalThis.game.user.targets = new Set();
activationFlag.uses.value = 1; // Separate healing activation scenario.
globalThis.CONFIG.Dice.rolls = [class DamageRoll {
  async evaluate() { return this; }
  async toMessage({ flavor }) { flavors.push(flavor); }
}];
const healCommand = await buildActivationCommand({
  template: "heal", params: { healDice: "2d8" }
}, { forgeId: "test-forge", itemName: "Test Item", itemLevel: 3 });
await new AsyncFunction(healCommand)();
assert.match(flavors.at(-1), /&lt;img src=x onerror=&quot;acting&quot;&gt;/,
  "acting actor name must be escaped at roll-flavor construction time");
assert.doesNotMatch(flavors.at(-1), /<img/, "raw acting HTML must not reach roll flavor");

console.log("macro/item-builder AI-text escaping check: all assertions passed");
