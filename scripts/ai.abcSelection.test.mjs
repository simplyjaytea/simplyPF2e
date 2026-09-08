// Production ABC selector contract: the prompt emits issued IDs, the
// validator accepts that shape, and the selector restores exact candidates.
import assert from "node:assert/strict";
import { SETTINGS } from "./settings.mjs";

const settings = new Map([
  [SETTINGS.apiBaseUrl, "http://localhost:11434/v1"], [SETTINGS.apiKey, ""],
  [SETTINGS.apiKeyBaseUrl, ""], [SETTINGS.model, "test-model"],
  [SETTINGS.temperature, 0.8], [SETTINGS.maxTokens, 8000], [SETTINGS.requestTimeout, 90]
]);
globalThis.game = {
  settings: { get: (_module, key) => settings.get(key) },
  i18n: { localize: (key) => key, format: (key, data) => `${key}: ${data?.detail ?? ""}` }
};

const requests = [];
const replies = [];
globalThis.fetch = async (_url, options) => {
  requests.push(JSON.parse(options.body));
  const reply = replies.shift();
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(reply) }, finish_reason: "stop" }],
    usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 }
  }), { headers: { "content-type": "application/json" } });
};

const { selectAncestryBackgroundClass } = await import("./ai.mjs");

const refs = {
  ancestry: { packId: "pf2e.ancestries", _id: "human" },
  heritage: { packId: "pf2e.heritages", _id: "versatile" },
  background: { packId: "pf2e.backgrounds", _id: "guard" },
  class: { packId: "pf2e.classes", _id: "fighter" }
};
const candidates = {
  ancestries: [{ id: "A0", name: "Human", ref: refs.ancestry }],
  heritages: [{ id: "H0", name: "Versatile Heritage", ref: refs.heritage }],
  backgrounds: [{ id: "B0", name: "Guard", ref: refs.background }],
  classes: [{ id: "C0", name: "Fighter", ref: refs.class }]
};
const concept = {
  name: "QA Consumer Fighter", level: 1, ancestry: "Human", heritage: "Versatile Heritage",
  background: "Guard", class: "Fighter", keyAbility: "str"
};

replies.push({ ancestryId: "A0", heritageId: "H0", backgroundId: "B0", classId: "C0", keyAbility: "str" });
const grounded = await selectAncestryBackgroundClass({
  concept,
  ancestryCandidates: candidates.ancestries,
  heritageCandidates: candidates.heritages,
  backgroundCandidates: candidates.backgrounds,
  classCandidates: candidates.classes
});
assert.equal(requests.length, 1, "a valid current ABC response must not trigger a retry");
assert.match(requests[0].messages[0].content, /"ancestryId": string/);
assert.match(requests[0].messages[0].content, /"heritageId": string\|null/);
assert.match(requests[0].messages[1].content, /A0 \| Human/);
assert.match(requests[0].messages[1].content, /H0 \| Versatile Heritage/);
assert.deepEqual(grounded, {
  ancestry: "Human", ancestryCandidate: refs.ancestry,
  heritage: "Versatile Heritage", heritageCandidate: refs.heritage,
  background: "Guard", backgroundCandidate: refs.background,
  class: "Fighter", classCandidate: refs.class,
  keyAbility: "str", usage: { prompt: 11, completion: 7, total: 18, estimated: false }
}, "valid issued IDs must restore exact names and source refs");

// A stale/name-shaped reply is malformed under the emitted contract. The
// shared request boundary retries once, then returns its bounded failure.
const oldShape = { ancestry: "Human", heritage: null, background: "Guard", class: "Fighter", keyAbility: "str" };
replies.push(oldShape, oldShape);
await assert.rejects(
  selectAncestryBackgroundClass({
    concept,
    ancestryCandidates: candidates.ancestries,
    heritageCandidates: candidates.heritages,
    backgroundCandidates: candidates.backgrounds,
    classCandidates: candidates.classes
  }),
  (error) => /missing required fields: ancestryId, heritageId, backgroundId, classId/.test(error.message)
    && error.usage?.total === 36,
  "old name-shaped ABC output must retry once and then fail with both usages retained"
);
assert.equal(requests.length, 3, "a malformed ABC response gets exactly one bounded retry");

// An unoffered ID never falls back to the first candidate. The existing
// caller mapping leaves its name fallback and source reference absent so the
// downstream exact-content resolver can fail closed.
replies.push({ ancestryId: "A-UNOFFERED", heritageId: null, backgroundId: "B0", classId: "C0", keyAbility: "str" });
const unresolved = await selectAncestryBackgroundClass({
  concept,
  ancestryCandidates: candidates.ancestries,
  heritageCandidates: candidates.heritages,
  backgroundCandidates: candidates.backgrounds,
  classCandidates: candidates.classes
});
assert.equal(unresolved.ancestry, concept.ancestry);
assert.equal(unresolved.ancestryCandidate, null, "unoffered ancestry IDs must not gain an issued ref");
assert.equal(unresolved.backgroundCandidate, refs.background, "valid IDs in the same response remain exact");
assert.equal(requests.length, 4, "an otherwise structurally valid unoffered ID does not retry");

console.log("ai.abcSelection.test.mjs: ABC ID validation, exact mapping, retry and fail-closed cases passed");
