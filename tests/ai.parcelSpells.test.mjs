// Production selectParcelSpells through the real request and validation
// path, with a stubbed provider: valid picks round-trip, invalid picks fail
// closed with a console warning, the pick cap holds, and the prompt carries
// only the issued slot and spell ids plus the no-numbers rule.
// Run: node tests/ai.parcelSpells.test.mjs
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
  const reply = replies.shift();
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(reply) }, finish_reason: "stop" }],
    usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 }
  }), { headers: { "content-type": "application/json" } });
};
const originalWarn = console.warn;

const slots = [
  { id: "slot-1", itemLevel: 5, rank: 3 },
  { id: "slot-2", itemLevel: 3, rank: 2 }
];
const candidates = [
  { id: "c-fire", name: "Fireball", rank: 3, traits: ["fire", "evocation"], ref: { packId: "pf2e.spells-srd", _id: "fire" } },
  { id: "c-heal", name: "Heal", rank: 1, traits: ["healing"], ref: { packId: "pf2e.spells-srd", _id: "heal" } },
  { id: "c-shield", name: "Shield", rank: 1, traits: ["force"], ref: { packId: "pf2e.spells-srd", _id: "shield" } },
  { id: "c-sleep", name: "Sleep", rank: 1, traits: ["mental"], ref: { packId: "pf2e.spells-srd", _id: "sleep" } }
];

try {
  const { selectParcelSpells } = await import("../scripts/ai.mjs");

  replies.push({ picks: [
    { slot: "slot-1", spellId: "c-fire" },
    { slot: "slot-2", spellId: "c-heal" }
  ] });
  const round = await selectParcelSpells("fire and healing", { partyLevel: 5, slots, candidates });
  assert.deepEqual(round.picks.map(({ slotId, spellId, name }) => ({ slotId, spellId, name })), [
    { slotId: "slot-1", spellId: "c-fire", name: "Fireball" },
    { slotId: "slot-2", spellId: "c-heal", name: "Heal" }
  ], "valid picks round-trip with the issued slot id, spell id and name");
  assert.equal(round.picks[0].candidate, candidates[0], "each pick keeps the issued candidate for document resolution");
  assert.equal(round.picks[1].candidate, candidates[1], "every pick keeps its own issued candidate");
  assert.equal(round.usage.total, 30, "the successful request reports its token usage");

  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    replies.push({ picks: [{ slot: "slot-9", spellId: "c-heal" }, { slot: "slot-2", spellId: "c-heal" }] });
    const unknownSlot = await selectParcelSpells("slot", { partyLevel: 5, slots, candidates });
    assert.deepEqual(unknownSlot.picks.map((pick) => pick.slotId), ["slot-2"], "a pick for an unissued slot id is dropped");
    assert.equal(warnings.length, 1, "an unknown slot id produces exactly one warning");
    assert.deepEqual(unknownSlot.dropped, [{ reason: "unknown-slot", slotId: "slot-9" }],
      "the unknown slot id is returned for the preview, not only logged");

    warnings.length = 0;
    replies.push({ picks: [{ slot: "slot-1", spellId: "c-invented" }, { slot: "slot-2", spellId: "Fireball" }] });
    const unknownSpell = await selectParcelSpells("spell", { partyLevel: 5, slots, candidates });
    assert.deepEqual(unknownSpell.picks, [], "a pick for an unissued spell id, or a spell name, is dropped");
    assert.equal(warnings.length, 2, "each unknown spell id produces one warning");
    assert.deepEqual(unknownSpell.dropped, [
      { reason: "unknown-spell", spellId: "c-invented" },
      { reason: "unknown-spell", spellId: "Fireball" }
    ], "each unknown spell id is returned in reply order, so a spell name the AI wrote shows as written");

    replies.push({ picks: [{ slot: "slot-1", spellId: "x".repeat(200) }] });
    const longId = await selectParcelSpells("long", { partyLevel: 5, slots, candidates });
    assert.equal(longId.dropped[0].spellId.length, 60, "an echoed AI id is capped so one reply cannot flood the preview");
    assert.deepEqual(round.dropped, [], "a reply with no unknown ids drops nothing");
  } finally {
    console.warn = originalWarn;
  }

  replies.push({ picks: [
    { slot: "slot-1", spellId: "c-fire" },
    { slot: "slot-2", spellId: "c-heal" },
    { slot: "slot-2", spellId: "c-sleep" }
  ] });
  const capped = await selectParcelSpells("cap", { partyLevel: 5, slots, candidates });
  assert.deepEqual(capped.picks.map((pick) => pick.spellId), ["c-fire", "c-heal"],
    "with two slots, at most two picks are kept, first wins");

  replies.push({ picks: [
    { slot: "slot-1", spellId: "c-fire" },
    { slot: "slot-1", spellId: "c-shield" }
  ] });
  const duplicate = await selectParcelSpells("duplicate", { partyLevel: 5, slots, candidates });
  assert.deepEqual(duplicate.picks.map((pick) => pick.spellId), ["c-fire", "c-shield"],
    "duplicate slots pass through; assignParcelPicks resolves them");

  replies.push({ picks: [] });
  const empty = await selectParcelSpells("nothing fits", { partyLevel: 5, slots, candidates });
  assert.deepEqual(empty.picks, [], "an empty pick list is a valid, empty result");

  const before = requests.length;
  const noCandidates = await selectParcelSpells("no candidates", { partyLevel: 5, slots, candidates: [] });
  assert.deepEqual(noCandidates, { picks: [], dropped: [], usage: null });
  assert.equal(requests.length, before, "no provider request is made without candidates");
  const noSlots = await selectParcelSpells("no slots", { partyLevel: 5, slots: [], candidates });
  assert.deepEqual(noSlots, { picks: [], dropped: [], usage: null });
  assert.equal(requests.length, before, "no provider request is made without slots");

  const firstRequest = requests[0];
  assert.equal(firstRequest.max_tokens, 2048, "the parcel spell task uses its own bounded budget");
  assert.equal(firstRequest.temperature, 0, "picks are deterministic");
  assert.equal(firstRequest.reasoning_effort, "none", "reasoning is disabled for the parcel spell task");
  const [systemMessage, userMessage] = firstRequest.messages;
  assert.ok(systemMessage.content.includes("Do not emit prices, levels, ranks, quantities or any other number; the module supplies them."),
    "the system prompt carries the no-numbers sentence verbatim");
  assert.ok(systemMessage.content.includes('{ "picks": [ { "slot": string, "spellId": string } ] }'),
    "the system prompt states the JSON shape");
  assert.ok(!/c-(fire|heal|shield|sleep)|slot-\d/.test(systemMessage.content), "the system prompt carries no issued ids");

  const userLines = userMessage.content.split("\n");
  const slotLines = userLines.filter((line) => /^slot-\S+ \| scroll rank \d+$/.test(line));
  assert.deepEqual(slotLines, ["slot-1 | scroll rank 3", "slot-2 | scroll rank 2"],
    "the user message lists every issued slot with its scroll rank");
  const candidateLines = userLines.filter((line) => / \| base rank \d+/.test(line));
  assert.deepEqual(candidateLines, [
    "c-fire | Fireball | base rank 3 | traits: fire, evocation",
    "c-heal | Heal | base rank 1 | traits: healing",
    "c-shield | Shield | base rank 1 | traits: force",
    "c-sleep | Sleep | base rank 1 | traits: mental"
  ], "the user message lists every issued candidate with name, base rank and traits");
  assert.ok(userMessage.content.includes("Party level: 5"), "the user message states the party level");
  assert.ok(!userMessage.content.includes("slot-3"), "the user message names no unissued slot");

  replies.push({ picks: [] });
  await selectParcelSpells("filtered", { partyLevel: 5, slots, candidates: [...candidates, { name: "No id", rank: 1 }] });
  assert.ok(!JSON.stringify(requests.at(-1).messages).includes("No id"), "a candidate without an issued id is never offered");

  console.warn = () => {};
  try {
    replies.push("not json", "still not json");
    await assert.rejects(() => selectParcelSpells("prose", { partyLevel: 5, slots, candidates }),
      /./, "a non-JSON reply fails closed after one retry");
    replies.push({ spells: [] }, { picks: "c-fire" });
    await assert.rejects(() => selectParcelSpells("bad shape", { partyLevel: 5, slots, candidates }),
      /./, "a reply without a picks array fails closed after one structural retry");
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(replies.length, 0, "each failing call used exactly its scripted retry replies");
} finally {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
}

console.log("ai.parcelSpells.test.mjs: slot-bound picks, fail-closed drops, pick cap and prompt contract passed");
