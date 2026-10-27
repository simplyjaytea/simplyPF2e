// Encounter design (designEncounter) with the hazard request (design note 69a22f5, approved
// 2026-10-27). The request is offered only when the caller allows it; a value other than
// none, simple or complex is dropped to none with a warning; the design never returns a
// level or XP. The provider is stubbed at fetch; the module's own request path is real.
// Run: node tests/ai.encounterHazard.test.mjs
import assert from "node:assert/strict";
import { SETTINGS } from "../scripts/settings.mjs";

const settings = new Map();
settings.set(SETTINGS.apiBaseUrl, "http://localhost:11434/v1");
settings.set(SETTINGS.apiKey, "");
settings.set(SETTINGS.apiKeyBaseUrl, "");
settings.set(SETTINGS.model, "test-model");
settings.set(SETTINGS.temperature, 0.8);
settings.set(SETTINGS.maxTokens, 8000);
settings.set(SETTINGS.requestTimeout, 90);
settings.set(SETTINGS.experimentalTools, true);
globalThis.game = { system: { id: "pf2e" }, user: { isGM: true } };
globalThis.game.settings = { get: (_module, key) => settings.get(key) };
globalThis.game.i18n = { localize: (key) => key, format: (key) => key };

const replies = [];
const requests = [];
const warnings = [];
const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
globalThis.fetch = async (_url, options) => {
  requests.push(JSON.parse(options.body));
  assert.ok(replies.length, "unexpected provider request");
  const reply = replies.shift();
  const body = {
    choices: [{ message: { content: JSON.stringify(reply) }, finish_reason: "stop" }],
    usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 }
  };
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
};
console.warn = (...args) => warnings.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));

try {
  const { designEncounter } = await import("../scripts/ai.mjs");
  const slots = [
    { role: "boss", level: 6, count: 1, xpEach: 60 },
    { role: "minion", level: 1, count: 1, xpEach: 10 }
  ];
  const design = (extra, reply) => {
    replies.push(reply);
    return designEncounter({ theme: "a sunken shrine", partyLevel: 5, slots, ...extra });
  };
  const systemOf = (index) => requests[index].messages.find((message) => message.role === "system").content;
  const userOf = (index) => requests[index].messages.find((message) => message.role === "user").content;

  // Allowed: the request is part of the contract and a valid answer is kept.
  const complex = await design({ allowHazard: true }, { name: "Shrine Watch", briefs: ["a crypt warden", "a bone hound"], hazard: "complex" });
  assert.equal(complex.hazard, "complex");
  assert.equal(complex.name, "Shrine Watch");
  assert.deepEqual(complex.briefs, ["a crypt warden", "a bone hound"]);
  assert.match(systemOf(0), /"hazard": "none" \| "simple" \| "complex"/, "an allowed design asks for the hazard field");
  assert.match(userOf(0), /may leave fewer minions/, "an allowed design tells the model the hazard shares the budget");
  assert.deepEqual(Object.keys(complex).sort(), ["briefs", "hazard", "name", "usage"], "the design returns no level or XP");

  // Allowed, but the model invents a value: dropped to none with one warning.
  warnings.length = 0;
  const invented = await design({ allowHazard: true }, { name: "Shrine Watch", briefs: ["a", "b"], hazard: "elite", level: 9, xp: 500 });
  assert.equal(invented.hazard, "none", "an invalid request is treated as none");
  assert.equal(warnings.length, 1, "an invalid request is dropped with a warning");
  assert.match(warnings[0], /hazard request dropped/);
  assert.equal("level" in invented || "xp" in invented, false, "a level or XP from the model is never returned");

  // Allowed, but the field is missing: also none with a warning.
  warnings.length = 0;
  const missing = await design({ allowHazard: true }, { name: "Shrine Watch", briefs: ["a", "b"] });
  assert.equal(missing.hazard, "none");
  assert.equal(warnings.length, 1);

  // Not allowed: the prompt is the no-hazard prompt, and a hazard answer is ignored without a warning.
  warnings.length = 0;
  const notAsked = await design({}, { name: "Shrine Watch", briefs: ["a", "b"], hazard: "simple" });
  assert.equal(notAsked.hazard, "none", "without allowHazard the hazard is none");
  assert.equal(warnings.length, 0, "an unasked hazard is not a warning");
  assert.equal(systemOf(3).includes("hazard"), false, "the no-hazard prompt does not mention hazards");
  assert.match(systemOf(3), /\{ "name": string, "briefs": string\[\] \}/, "the no-hazard schema is unchanged");
  assert.ok(systemOf(3).endsWith("make the boss memorable."), "the no-hazard prompt ends as before");
  assert.equal(userOf(3).includes("may leave fewer minions"), false, "the no-hazard user prompt is unchanged");
} finally {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
}

console.log("ai.encounterHazard.test.mjs: the hazard request is offered only when allowed, invalid values fall back to none, and no level or XP is returned");
