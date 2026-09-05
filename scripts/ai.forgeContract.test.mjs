// Provider-path contract: forge output fields choose enum slugs, never values.
import assert from "node:assert/strict";
import { SETTINGS } from "./settings.mjs";
import { AI_TASK } from "./ai-task-profiles.mjs";
import { taskResponseProblem } from "./ai-response-validation.mjs";

const settings = new Map([
  [SETTINGS.apiBaseUrl, "http://localhost:11434/v1"], [SETTINGS.apiKey, ""],
  [SETTINGS.apiKeyBaseUrl, ""], [SETTINGS.model, "test-model"],
  [SETTINGS.temperature, 0.8], [SETTINGS.maxTokens, 8000], [SETTINGS.requestTimeout, 90]
]);
globalThis.game = {
  settings: { get: (_module, key) => settings.get(key) },
  i18n: { localize: (key) => key, format: (key) => key }
};
const requests = [];
globalThis.fetch = async (_url, options) => {
  requests.push(JSON.parse(options.body));
  const reply = requests.length === 1
    ? { name: "QA Charm", description: "A quiet charm.", rarity: "common", usage: "worn", traits: ["magical"], bulk: "light", invested: true, effects: [] }
    : { baseItemName: "Longsword", potency: "double", secondaryTier: "greater", propertyRunes: [], description: "A quiet blade." };
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(reply) }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
  }), { headers: { "content-type": "application/json" } });
};
const { generateMagicItemConcept, generateRunedItemConcept } = await import("./ai.mjs");
await generateMagicItemConcept({
  prompt: "Quiet charm", level: 3, rarity: "common", usageOptions: ["worn"],
  availableKinds: ["itemBonus"], effectCatalog: [{ kind: "itemBonus", statistic: "stealth", value: 1 }]
});
const magicPrompt = requests[0].messages[0].content;
assert.match(magicPrompt, /"scale": "low"\|"moderate"\|"high"/);
assert.match(magicPrompt, /"kind":"itemBonus","statistic":"stealth"/);
assert.match(magicPrompt, /"actionCost": "single"/);
assert.match(magicPrompt, /"bulk": "negligible"/);
assert.doesNotMatch(magicPrompt, /"(?:level|value|range|dc|durationRounds|durationMinutes)":\s*number/);
assert.doesNotMatch(magicPrompt, /"(?:damageDice|healDice)":/);
await generateRunedItemConcept({
  prompt: "Quiet blade", level: 12, rarity: "common", kind: "weapon",
  baseCandidates: [{ name: "Longsword", level: 0 }], runeCandidates: [],
  potencyTiers: [1, 2], secondaryTiers: [1, 2]
});
const runedPrompt = requests[1].messages[0].content;
assert.match(runedPrompt, /enum: single, double/);
assert.match(runedPrompt, /enum: none, standard, greater/);
assert.doesNotMatch(runedPrompt, /"(?:potency|secondaryTier)":\s*number/);
assert.equal(requests.length, 2, "both forge schemas work through the normal bounded request path");
assert.match(taskResponseProblem(AI_TASK.RUNED_ITEM_CONCEPT, {
  baseItemName: "Longsword", potency: 3, secondaryTier: 1, propertyRunes: [], description: "A sword."
}), /enum slugs/, "numeric rune fields trigger the existing bounded retry");
assert.match(taskResponseProblem(AI_TASK.MAGIC_ITEM_CONCEPT, {
  name: "QA Charm", description: "A charm.", rarity: "common", usage: "worn", traits: [], bulk: 100, invested: true, effects: []
}), /enum slugs/, "numeric bulk cannot pass the provider contract");
console.log("forge provider enum contracts passed");
