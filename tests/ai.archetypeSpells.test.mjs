// W3: selectArchetypeSpells asks for ids only against a module-owned plan, and drops everything off-plan.
// Production request path with the network and Foundry settings mocked (as ai.pcSpells.test.mjs).
import assert from "node:assert/strict";
import { SETTINGS } from "../scripts/settings.mjs";

const settings = new Map([
  [SETTINGS.apiBaseUrl, "http://localhost:11434/v1"], [SETTINGS.apiKey, ""],
  [SETTINGS.apiKeyBaseUrl, ""], [SETTINGS.model, "test-model"],
  [SETTINGS.temperature, 0.8], [SETTINGS.maxTokens, 8000], [SETTINGS.requestTimeout, 90]
]);
globalThis.game = { settings: { get: (_module, key) => settings.get(key) }, i18n: { localize: (key) => key, format: (key) => key } };
const requests = [];
const replies = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (_url, options) => {
  requests.push(JSON.parse(options.body));
  assert.ok(replies.length, "unexpected provider request");
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(replies.shift()) }, finish_reason: "stop" }],
    usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 }
  }), { headers: { "content-type": "application/json" } });
};
const warnings = [];
const originalWarn = console.warn;
console.warn = (...args) => { warnings.push(args.join(" ")); };
try {
  const { selectArchetypeSpells } = await import("../scripts/ai.mjs");
  const ref = (id) => ({ packId: "spells", _id: id });
  const candidates = [
    { id: "c1", name: "Detect Magic", rank: 0, ref: ref("dm") }, { id: "c2", name: "Electric Arc", rank: 0, ref: ref("ea") },
    { id: "c3", name: "Light", rank: 0, ref: ref("li") },
    { id: "f1", name: "Fear", rank: 1, ref: ref("fe") }, { id: "f2", name: "Grim Tendrils", rank: 1, ref: ref("gt") },
    { id: "f3", name: "Sure Strike", rank: 1, ref: ref("ss") }
  ];
  const args = {
    concept: { name: "Test", level: 4, class: "Fighter", traits: ["human", "fighter"], gmPrompt: "A bookish swordsman" },
    candidates, plannedPicks: { 0: 2, 1: 2 }, tradition: "arcane", label: "Wizard Archetype Spells"
  };
  replies.push({ spells: [
    { id: "c1" }, { id: "c1" }, // repeat
    { id: "f1", rank: "rank-three" }, // the model's rank is ignored: a spell sits at its listed rank
    { id: "Invented" }, null, {}, // unknown / malformed
    { id: "c2" }, { id: "c3" }, // cantrip plan full after c1, c2
    { id: "f2" }, { id: "f3" } // rank-one plan full after f1, f2
  ] });
  const result = await selectArchetypeSpells(args);
  assert.deepEqual(result.spells, [
    { name: "Detect Magic", candidate: ref("dm"), rank: 0 },
    { name: "Fear", candidate: ref("fe"), rank: 1 },
    { name: "Electric Arc", candidate: ref("ea"), rank: 0 },
    { name: "Grim Tendrils", candidate: ref("gt"), rank: 1 }
  ]);
  assert.ok(warnings.length >= 5, "each excess, repeated or unknown pick is warned");

  // The request: module-owned plan, ids only, no numeric rank asked for, the tradition and every candidate listed.
  const [request] = requests;
  const system = request.messages.find((m) => m.role === "system").content;
  const user = request.messages.find((m) => m.role === "user").content;
  assert.match(system, /Wizard Archetype Spells spellbook/);
  assert.match(system, /\{"cantrip":2,"rank-one":2\}/, "the plan is the module's, in enum slugs");
  assert.match(system, /write no rank and no number/);
  assert.doesNotMatch(system, /"rank": ?(string|number)/, "the response schema asks for no rank");
  assert.match(user, /Tradition: arcane\./);
  assert.match(user, /Original GM request: A bookish swordsman/);
  for (const candidate of candidates) {
    assert.ok(!user.includes(`${candidate.id} |`), `${candidate.name} long id never enters the prompt`);
    assert.ok(user.includes(`| ${candidate.name}`), `${candidate.name} is offered by a short alias`);
  }
  assert.match(user, /cantrip: S0 \| Detect Magic; S1 \| Electric Arc; S2 \| Light/);

  // An invalid plan is refused before any request.
  const before = requests.length;
  await assert.rejects(selectArchetypeSpells({ ...args, plannedPicks: { 0: 9 } }), /Invalid archetype spell plan/);
  await assert.rejects(selectArchetypeSpells({ ...args, plannedPicks: null }), /Invalid archetype spell plan/);
  await assert.rejects(selectArchetypeSpells({ ...args, plannedPicks: { 11: 1 } }), /Invalid archetype spell plan/);
  assert.equal(requests.length, before);
} finally {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
}
console.log("ai.archetypeSpells.test.mjs: archetype spell selection is id-only, plan-bounded and fail-closed");
