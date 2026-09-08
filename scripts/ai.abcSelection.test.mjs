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
  i18n: { localize: (key) => key, format: (key, data) => `${key}: ${data?.detail ?? data?.fields ?? ""}` }
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

// Required picks must resolve at this request boundary: a display name must
// not rescue an unoffered ID or permit downstream feat/equipment requests.
const selectorArgs = {
  concept,
  ancestryCandidates: candidates.ancestries,
  heritageCandidates: candidates.heritages,
  backgroundCandidates: candidates.backgrounds,
  classCandidates: candidates.classes
};
const validReply = { ancestryId: "A0", heritageId: null, backgroundId: "B0", classId: "C0", keyAbility: "str" };
for (const [field, name] of [["ancestry", "Human"], ["background", "Guard"], ["class", "Fighter"]]) {
  const before = requests.length;
  replies.push({ ...validReply, [`${field}Id`]: "UNOFFERED", [field]: name });
  await assert.rejects(selectAncestryBackgroundClass(selectorArgs), (error) => {
    assert.match(error.message, /ABCSelectionUnresolved/);
    assert.deepEqual(error.details, { fields: [field] });
    assert.equal(error.usage.total, 18, "rejected issued-ID mapping retains the spent request usage");
    assert.equal(error.retryable, false, "membership rejection does not add another provider call");
    assert.equal(error.message.includes("UNOFFERED"), false, "raw provider IDs do not enter feedback");
    return true;
  });
  assert.equal(requests.length, before + 1, "invalid required IDs fail immediately after one request");
}

// Null/unknown heritage remains optional under the established contract.
for (const heritageId of [null, "H-UNOFFERED"]) {
  replies.push({ ...validReply, heritageId });
  const result = await selectAncestryBackgroundClass(selectorArgs);
  assert.equal(result.heritage, null);
  assert.equal(result.heritageCandidate, null);
  assert.equal(result.ancestryCandidate, refs.ancestry);
  assert.equal(result.backgroundCandidate, refs.background);
  assert.equal(result.classCandidate, refs.class);
}

console.log("ai.abcSelection.test.mjs: ABC exact mapping, early required-ID rejection, usage and optional heritage passed");
