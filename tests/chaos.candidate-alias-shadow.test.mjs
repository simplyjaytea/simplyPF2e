// Regression test adapted from Troy’s ce8092c reproduction; runs in the gate.
import assert from "node:assert/strict";
import { SETTINGS } from "../scripts/settings.mjs";

const settings = new Map([
  [SETTINGS.apiBaseUrl, "http://localhost:11434/v1"], [SETTINGS.apiKey, ""],
  [SETTINGS.apiKeyBaseUrl, ""], [SETTINGS.model, "test-model"],
  [SETTINGS.temperature, 0.8], [SETTINGS.maxTokens, 8000], [SETTINGS.requestTimeout, 90]
]);
globalThis.game = {
  settings: { get: (_module, key) => settings.get(key) },
  i18n: { localize: (key) => key, format: (key, data) => `${key}:${JSON.stringify(data)}` }
};
let reply = {};
globalThis.fetch = async () => new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify(reply) }, finish_reason: "stop" }],
  usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 }
}), { headers: { "content-type": "application/json" } });

const { encodeCandidateList } = await import("../scripts/ai-candidate-format.mjs");
const { selectCreatureAbilities } = await import("../scripts/ai.mjs");

const ref = (packId, id) => ({ packId, _id: id });
const candidates = [
  { id: "a1", name: "Grab", ref: ref("pf2e.bestiary-ability-glossary-srd", "grab") },
  { id: "a2", name: "Push", ref: ref("pf2e.bestiary-ability-glossary-srd", "push") }
];

// A. The codec must return the entry whose issued id was copied exactly.
const encoding = encodeCandidateList(candidates, "A");
assert.notEqual(encoding.entries[1].alias, "A1", "aliases must not collide with issued IDs under case folding");
assert.equal(encoding.resolve("a1")?.candidate?.name, "Grab",
  `exact issued id "a1" resolved to ${JSON.stringify(encoding.resolve("a1")?.candidate?.name)}`);
assert.equal(encoding.resolve("a2")?.candidate?.name, "Push",
  `exact issued id "a2" resolved to ${JSON.stringify(encoding.resolve("a2")?.candidate?.name)}`);

// B. The live selector shows the same shadowing: the model copies the ID it
// was shown first and gets the second ability back.
const concept = {
  name: "Bog Lurker", level: 3, blurb: "b", description: "d", traits: [],
  strikes: [], equipment: [], loot: [], spellcasting: null,
  specialAbilities: [{ name: "Grab" }], gmPrompt: "grabby thing"
};
reply = { abilityIds: ["a1"] };
const silent = console.warn;
console.warn = () => {};
const { abilities } = await selectCreatureAbilities({ concept, candidates });
console.warn = silent;

assert.deepEqual(abilities.map((ability) => ability.name), ["Grab"],
  `reply "a1" produced ${JSON.stringify(abilities.map((ability) => ability.name))}`);

console.log("chaos.candidate-alias-shadow.test.mjs: exact ids were not shadowed by aliases");
