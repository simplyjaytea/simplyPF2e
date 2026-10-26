// Production selectSpellConsumables through the real request and validation
// path, with a stubbed provider: valid picks round-trip, invalid picks fail
// closed with a console warning, the kind is forced, the count caps the list,
// and the prompt carries only the issued ids and the no-numbers rule.
// Run: node tests/ai.spellConsumables.test.mjs
import assert from "node:assert/strict";
import { SETTINGS } from "../scripts/settings.mjs";

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
const originalWarn = console.warn;

const candidates = [
  { id: "c-fire", name: "Fireball", rank: 3, traits: ["fire", "evocation"], ref: { packId: "pf2e.spells-srd", _id: "fire" } },
  { id: "c-heal", name: "Heal", rank: 1, traits: ["healing"], ref: { packId: "pf2e.spells-srd", _id: "heal" } },
  { id: "c-shield", name: "Shield", rank: 1, traits: ["force"], ref: { packId: "pf2e.spells-srd", _id: "shield" } },
  { id: "c-sleep", name: "Sleep", rank: 1, traits: ["mental"], ref: { packId: "pf2e.spells-srd", _id: "sleep" } }
];

try {
  const { selectSpellConsumables } = await import("../scripts/ai.mjs");

  replies.push({ picks: [
    { spellId: "c-fire", rank: 4, kind: "scroll" },
    { spellId: "c-heal", rank: 1, kind: "scroll" }
  ] });
  const round = await selectSpellConsumables("fire and healing", { level: 5, kind: "scroll", candidates });
  assert.deepEqual(round.picks.map(({ spellId, name, rank, kind }) => ({ spellId, name, rank, kind })), [
    { spellId: "c-fire", name: "Fireball", rank: 4, kind: "scroll" },
    { spellId: "c-heal", name: "Heal", rank: 1, kind: "scroll" }
  ], "valid picks round-trip with the issued id, name, integer rank and requested kind");
  assert.equal(round.picks[0].candidate, candidates[0], "each pick keeps the issued candidate for document resolution");
  assert.equal(round.usage.total, 30, "the successful request reports its token usage");

  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    replies.push({ picks: [
      { spellId: "c-invented", rank: 2, kind: "scroll" },
      { spellId: "Fireball", rank: 3, kind: "scroll" },
      { spellId: "c-shield", rank: "2", kind: "scroll" },
      { spellId: "c-shield", rank: 2.5, kind: "scroll" },
      { spellId: "c-shield", rank: 11, kind: "scroll" },
      { spellId: "c-shield", rank: 0, kind: "scroll" },
      null,
      { spellId: "c-sleep", rank: 1, kind: "scroll" }
    ] });
    const mixed = await selectSpellConsumables("mixed", { level: 5, kind: "scroll", candidates });
    assert.deepEqual(mixed.picks.map((pick) => pick.spellId), ["c-sleep"],
      "unknown ids, names, non-integer, out-of-range and empty picks are all dropped");
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 7, "every dropped pick is reported with console.warn");

  replies.push({ picks: [{ spellId: "c-fire", rank: 3, kind: "wand" }] });
  const forced = await selectSpellConsumables("a wand", { level: 5, kind: "wand", candidates });
  assert.equal(forced.picks[0].kind, "wand", "the requested kind is forced onto every pick");

  replies.push({ picks: [
    { spellId: "c-fire", rank: 3, kind: "scroll" },
    { spellId: "c-heal", rank: 1, kind: "scroll" },
    { spellId: "c-shield", rank: 1, kind: "scroll" },
    { spellId: "c-sleep", rank: 1, kind: "scroll" }
  ] });
  const capped = await selectSpellConsumables("cap", { level: 5, kind: "scroll", candidates, count: 2 });
  assert.deepEqual(capped.picks.map((pick) => pick.spellId), ["c-fire", "c-heal"], "count caps the kept picks");

  replies.push({ picks: [] });
  const empty = await selectSpellConsumables("nothing fits", { level: 5, kind: "scroll", candidates });
  assert.deepEqual(empty.picks, [], "an empty pick list is a valid, empty result");

  const before = requests.length;
  const none = await selectSpellConsumables("no candidates", { level: 5, kind: "scroll", candidates: [] });
  assert.deepEqual(none, { picks: [], usage: null });
  assert.equal(requests.length, before, "no provider request is made without candidates");

  await assert.rejects(() => selectSpellConsumables("x", { level: 5, kind: "potion", candidates }), TypeError);

  const firstRequest = requests[0];
  assert.equal(firstRequest.max_tokens, 1536, "the spell consumable task uses its own bounded budget");
  assert.equal(firstRequest.temperature, 0, "picks are deterministic");
  const prompt = JSON.stringify(firstRequest.messages);
  assert.ok(prompt.includes("c-fire | Fireball | base rank 3 | traits: fire, evocation"), "prompt lists issued ids with name, base rank and traits");
  assert.ok(prompt.includes("Item kind: scroll") && prompt.includes("Item level: 5"), "prompt states the kind and item level");
  assert.ok(prompt.includes("Return at most 6 picks"), "prompt states the default count");
  assert.ok(prompt.includes("Do not emit any prices, item levels, DCs, damage, or other numbers beyond the rank"),
    "prompt forbids every number except the rank");
  assert.ok(prompt.includes("Choose ONLY spell IDs from the provided list"), "prompt restricts the model to listed ids");

  replies.push({ picks: [] });
  await selectSpellConsumables("cap the rank", { level: 5, kind: "scroll", candidates, maxRank: 3 });
  assert.ok(JSON.stringify(requests.at(-1).messages).includes("Highest rank allowed: 3"), "the item level caps the rank the prompt allows");
  assert.ok(JSON.stringify(requests.at(-1).messages).includes("up to 3. Do not emit"), "the system prompt states the same cap");
  replies.push({ picks: [] });
  await selectSpellConsumables("wand ceiling", { level: 20, kind: "wand", candidates, maxRank: 12 });
  assert.ok(JSON.stringify(requests.at(-1).messages).includes("Highest rank allowed: 9"), "a wand never offers rank 10, whatever the level");
  replies.push({ picks: [] });
  await selectSpellConsumables("no level cap", { level: 5, kind: "scroll", candidates });
  assert.ok(JSON.stringify(requests.at(-1).messages).includes("Highest rank allowed: 10"), "without a level cap the scroll ceiling is 10");
  replies.push({ spells: [] }, { spells: [] });
  await assert.rejects(() => selectSpellConsumables("bad shape", { level: 5, kind: "scroll", candidates }),
    "a response without picks fails closed after one structural retry");
  assert.equal(replies.length, 0, "the structural retry used exactly the two scripted replies");
} finally {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
}

console.log("ai.spellConsumables.test.mjs: picks, fail-closed drops, kind, count and prompt contract passed");
