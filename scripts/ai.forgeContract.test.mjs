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
let runedReply = { baseItemId: "B0", potencyRuneId: "P0", secondaryRuneId: "S0", propertyRuneIds: [], description: "A quiet blade." };
globalThis.fetch = async (_url, options) => {
  requests.push(JSON.parse(options.body));
  const reply = requests.length === 1
    ? { name: "QA Charm", description: "A quiet charm.", rarity: "common", usage: "worn", traits: ["magical"], bulk: "light", invested: true, effects: [] }
    : runedReply;
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
const runed = await generateRunedItemConcept({
  prompt: "Quiet blade", level: 12, rarity: "common", kind: "weapon",
  baseCandidates: [{ id: "c-base", name: "Longsword", level: 0 }], runeCandidates: [],
  potencyCandidates: [{ id: "c-potency", name: "Weapon Potency (+2)", tier: 2 }],
  secondaryCandidates: [{ id: "c-secondary", name: "Striking (Greater)", tier: 2 }]
});
assert.deepEqual(runed.concept, { baseItemId: "c-base", potencyRuneId: "c-potency", secondaryRuneId: "c-secondary", propertyRuneIds: [], description: "A quiet blade." },
  "short Forge aliases restore original candidate IDs at the AI boundary");
const runedPrompt = requests[1].messages[0].content;
assert.match(runedPrompt, /"baseItemId": string/);
assert.match(runedPrompt, /short alias/, "Forge request exposes short request-local aliases, not source IDs");
assert.doesNotMatch(runedPrompt, /c-base|c-potency|c-secondary/, "Forge source IDs never enter the model-visible catalog");
assert.match(runedPrompt, /B0 \| Longsword/);
assert.match(runedPrompt, /P0 \| Weapon Potency \(\+2\)/);
assert.match(runedPrompt, /S0 \| Striking \(Greater\)/);
assert.doesNotMatch(runedPrompt, /"(?:potency|secondaryTier)":\s*number/);
runedReply = { baseItemId: "c-stale-source-id", potencyRuneId: "P0", secondaryRuneId: "none", propertyRuneIds: [], description: "A rejected blade." };
await assert.rejects(
  generateRunedItemConcept({
    prompt: "Rejected blade", level: 12, rarity: "common", kind: "weapon",
    baseCandidates: [{ id: "c-base", name: "Longsword", level: 0 }], runeCandidates: [],
    potencyCandidates: [{ id: "c-potency", name: "Weapon Potency (+2)", tier: 2 }], secondaryCandidates: []
  }),
  (err) => /unknown base item alias/.test(err.message) && err.usage?.total === 20,
  "a locally rejected Forge alias retains the completed provider usage"
);
assert.equal(requests.length, 3, "both Forge schemas and one local alias rejection use the normal bounded request path");
assert.match(taskResponseProblem(AI_TASK.RUNED_ITEM_CONCEPT, {
  baseItemId: "c-base", potencyRuneId: 3, secondaryRuneId: "none", propertyRuneIds: [], description: "A sword."
}), /fields must be non-empty strings/, "numeric opaque rune IDs trigger the bounded retry");
assert.match(taskResponseProblem(AI_TASK.MAGIC_ITEM_CONCEPT, {
  name: "QA Charm", description: "A charm.", rarity: "common", usage: "worn", traits: [], bulk: 100, invested: true, effects: []
}), /enum slugs/, "numeric bulk cannot pass the provider contract");
console.log("forge provider enum contracts passed");
