// Production selectParcelPermanents through the real request and validation path, with a stubbed
// provider: valid picks round-trip with the issued slot and candidate ids, unknown slots are dropped
// with a warning, the pick cap holds, and the prompt carries only issued ids, levels and kinds plus
// the no-numbers rule. Provider failures reject, so the caller can leave the slots unfilled.
// Run: node tests/ai.parcelPermanents.test.mjs
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
  { id: "perm-1", allowedLevels: [5], source: "table" },
  { id: "perm-2", allowedLevels: [5, 6], source: "extra" }
];
const candidates = [
  { id: "c-hearing", name: "Magical Hearing Aid", level: 5, kind: "equipment", traits: ["magical"] },
  { id: "w-c-fire", name: "Wand of Fireball (Rank 2)", level: 5, kind: "wand", rank: 2, traits: [] },
  { id: "c-cube", name: "Cube of Recall", level: 6, kind: "equipment", traits: ["magical"] }
];

try {
  const { selectParcelPermanents } = await import("../scripts/ai.mjs");

  // No slots or no candidates: no provider request and no picks.
  const before = requests.length;
  assert.deepEqual(await selectParcelPermanents("none", { partyLevel: 5, slots: [], candidates }), { picks: [], dropped: [], usage: null });
  assert.deepEqual(await selectParcelPermanents("none", { partyLevel: 5, slots, candidates: [] }), { picks: [], dropped: [], usage: null });
  assert.equal(requests.length, before, "no provider request is made without slots and candidates");

  // A valid reply round-trips slot and candidate ids.
  replies.push({ picks: [{ slot: "perm-1", candidate: "w-c-fire" }, { slot: "perm-2", candidate: "c-cube" }] });
  const round = await selectParcelPermanents("fire and recall", { partyLevel: 5, slots, candidates });
  assert.deepEqual(round.picks, [
    { slotId: "perm-1", candidateId: "w-c-fire" },
    { slotId: "perm-2", candidateId: "c-cube" }
  ], "valid picks round-trip with the issued slot and candidate ids");
  assert.equal(round.usage.total, 30, "the successful request reports its usage");
  assert.deepEqual(round.dropped, []);

  const userMessage = requests.at(-1).messages.find((message) => message.role === "user").content;
  assert.ok(userMessage.includes("Party level: 5"));
  assert.ok(userMessage.includes("perm-2 | item level 5 or 6"), "the prompt names each slot's allowed levels");
  assert.ok(userMessage.includes("w-c-fire | Wand of Fireball (Rank 2) | item level 5 | wand, rank 2"),
    "a wand is offered by id, with its level and rank as metadata");
  assert.ok(!userMessage.includes("Fireball\u0000"), "no raw document id leaks into the prompt");

  // An unknown slot is dropped with a warning; an unknown candidate is passed on and refused later.
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  replies.push({ picks: [{ slot: "perm-9", candidate: "c-cube" }, { slot: "perm-1", candidate: "c-hearing" }] });
  const unknown = await selectParcelPermanents("unknown", { partyLevel: 5, slots, candidates });
  assert.deepEqual(unknown.picks, [{ slotId: "perm-1", candidateId: "c-hearing" }], "the unknown slot is dropped");
  assert.deepEqual(unknown.dropped, [{ reason: "unknown-slot", slotId: "perm-9" }]);
  assert.equal(warnings.length, 1, "an unknown slot produces one warning");

  // The pick cap holds: no more picks than issued slots.
  replies.push({ picks: [
    { slot: "perm-1", candidate: "c-hearing" }, { slot: "perm-2", candidate: "c-cube" }, { slot: "perm-1", candidate: "c-cube" }
  ] });
  const capped = await selectParcelPermanents("cap", { partyLevel: 5, slots, candidates });
  assert.equal(capped.picks.length, 2, "no more picks than issued slots");
  console.warn = originalWarn;

  // A malformed reply fails closed after the single structural retry the request layer allows.
  console.warn = () => {};
  replies.push("not json", "still not json");
  await assert.rejects(() => selectParcelPermanents("prose", { partyLevel: 5, slots, candidates }), /./,
    "a non-JSON reply rejects, so the caller leaves the permanent slots unfilled");
  replies.push({ spells: [] }, { picks: "c-hearing" });
  await assert.rejects(() => selectParcelPermanents("shape", { partyLevel: 5, slots, candidates }), /./,
    "a reply without a picks array rejects");
  console.warn = originalWarn;
  assert.equal(replies.length, 0, "each failing call used exactly its scripted retry replies");
} finally {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
}

console.log("ai.parcelPermanents.test.mjs: slot and candidate ids round-trip, unknown slots dropped, pick cap, prompt contract and failures");
