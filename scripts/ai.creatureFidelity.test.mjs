// Assert actual request payloads and optional-selection decoding, no provider spend.
import assert from "node:assert/strict";
import { SETTINGS } from "./settings.mjs";
const settings = new Map([
  [SETTINGS.apiBaseUrl, "http://localhost:11434/v1"], [SETTINGS.apiKey, ""],
  [SETTINGS.apiKeyBaseUrl, ""], [SETTINGS.model, "test-model"],
  [SETTINGS.temperature, 0.8], [SETTINGS.maxTokens, 8000], [SETTINGS.requestTimeout, 90]
]);
globalThis.game = { settings: { get: (_module, key) => settings.get(key) },
  i18n: { localize: (key) => key, format: (key, data) => `${key}:${JSON.stringify(data)}` } };
const requests = [];
let reply;
globalThis.fetch = async (_url, options) => {
  requests.push(JSON.parse(options.body));
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) }, finish_reason: "stop" }] }),
    { headers: { "content-type": "application/json" } });
};
const { generateConcept, generateLoot, chooseSpellFocus, selectSpells, selectEquipment, selectLoot } = await import("./ai.mjs");
const gmPrompt = "A minimal courier with no spellcasting, no equipment, and no loot.";
const concept = { name: "Courier", level: 4, rarity: "common", blurb: "A courier", description: "Carries messages",
  traits: [], strikes: [], equipment: [{ name: "Satchel" }], loot: [{ name: "Potion", quantity: 1 }], gmPrompt,
  spellcasting: { tradition: "occult", spells: [] } };
const candidate = { id: "E0", name: "Potion", type: "consumable", level: 1, ref: {} };
const assertPrompt = () => assert.ok(requests.at(-1).messages[1].content.includes(gmPrompt),
  "every refinement must retain the exact original GM request");
const assertPriority = () => assert.match(requests.at(-1).messages[0].content, /explicit concept constraints override/);

reply = { name: "Courier", description: "A courier", abilityScales: {}, saveScales: {},
  blurb: "", readAloud: "", recallKnowledge: "", size: "med", acScale: "moderate", hpScale: "moderate", perceptionScale: "moderate",
  spellcasting: null, ...Object.fromEntries(["traits", "languages", "speeds", "senses", "skills", "strikes", "specialAbilities",
    "focusSpells", "feats", "equipment", "loot", "resistances", "weaknesses", "immunities"].map((key) => [key, []])) };
await generateConcept({ prompt: gmPrompt, level: 4, rarity: "common", allowSpellcasting: true, preset: "Wizard" });
assertPrompt();
assertPriority();
assert.match(requests.at(-1).messages[1].content, /suggestions only; the GM's explicit concept takes priority/);
reply = { keywords: [] };
await chooseSpellFocus({ concept, tradition: "occult" });
assertPrompt();
reply = { spells: [], focusSpellIds: [] };
await selectSpells({ concept, candidates: [], maxRank: 2 });
assertPrompt();
assertPriority();
reply = { loot: [] };
await generateLoot({ concept });
assertPrompt();
assertPriority();
for (const [call, field] of [[selectEquipment, "equipment"], [selectLoot, "loot"]]) {
  reply = { [field]: [] };
  const omitted = await call({ concept, candidates: [candidate] });
  assert.equal(omitted.omitted, true, "only an explicit empty validated array declines an optional wishlist");
  assertPrompt();
  assertPriority();
  reply = { [field]: [{ id: "invented" }] };
  const invalid = await call({ concept, candidates: [candidate] });
  assert.equal(invalid[field].length, 0);
  assert.equal(invalid.omitted, false, "unresolved nonempty picks cannot masquerade as intentional omission");
}
console.log("ai.creatureFidelity.test.mjs: GM constraints survive refinement; only explicit optional omissions clear plans");
