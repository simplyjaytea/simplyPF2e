// A cancel or a timeout while a non-streaming provider's JSON body is still arriving must be reported as that
// cancel or timeout. Before the fix, the body read's AbortError was turned into InvalidResponse, so the GM saw a
// bad-response error. A genuine bad body still reports InvalidResponse (the negative control).
// Run: node tests/ai.abortBody.test.mjs
import assert from "node:assert/strict";
import { SETTINGS } from "../scripts/settings.mjs";
import { generateConcept } from "../scripts/ai.mjs";

// The minimum request timeout is 10 seconds, so the timeout case takes that long.
const settings = new Map([
  [SETTINGS.apiBaseUrl, "http://localhost:11434/v1"],
  [SETTINGS.apiKey, ""],
  [SETTINGS.apiKeyBaseUrl, ""],
  [SETTINGS.model, "test-model"],
  [SETTINGS.temperature, 0.8],
  [SETTINGS.maxTokens, 8000],
  [SETTINGS.requestTimeout, 10]
]);
globalThis.game = {
  settings: { get: (_moduleId, key) => settings.get(key) },
  i18n: { localize: (key) => key, format: (key, data) => `${key}:${JSON.stringify(data)}` }
};

// A reply whose headers arrive at once and whose JSON body never finishes until the request is aborted.
// The abort rejects the body read with an AbortError, as a real fetch does.
const originalFetch = globalThis.fetch;
function stalledBodyFetch() {
  globalThis.fetch = async (_url, options) => ({
    status: 200,
    ok: true,
    headers: new Headers({ "content-type": "application/json" }),
    body: null,
    json: () => new Promise((_, reject) => {
      options.signal.addEventListener("abort", () => reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" })), { once: true });
    })
  });
}

try {
  // User cancel mid-body: the GM gets the quiet cancel, not an invalid-response error.
  stalledBodyFetch();
  const userCancel = new AbortController();
  setTimeout(() => userCancel.abort(), 50);
  await assert.rejects(generateConcept({ prompt: "a cat", level: 1, rarity: "common", signal: userCancel.signal }), (err) => {
    assert.equal(err.cancelled, true, "a user cancel is reported as cancelled");
    assert.equal(err.message, "SIMPLYPF2E.Errors.Cancelled");
    return true;
  });

  // Timeout mid-body: the GM gets the timeout message with the configured seconds.
  stalledBodyFetch();
  await assert.rejects(generateConcept({ prompt: "a cat", level: 1, rarity: "common" }), (err) => {
    assert.equal(err.cancelled, false, "a timeout is not a cancel");
    assert.equal(err.message, 'SIMPLYPF2E.Errors.Timeout:{"seconds":10}', "the timeout reports the configured seconds");
    return true;
  });

  // Negative control: a body that is simply not JSON still reports the invalid response.
  globalThis.fetch = async () => ({
    status: 200,
    ok: true,
    headers: new Headers({ "content-type": "application/json" }),
    body: null,
    json: async () => { throw new SyntaxError("Unexpected token < in JSON"); }
  });
  await assert.rejects(generateConcept({ prompt: "a cat", level: 1, rarity: "common" }), (err) => {
    assert.equal(err.message, "SIMPLYPF2E.Errors.InvalidResponse", "a genuine bad body is still an invalid response");
    return true;
  });
} finally {
  globalThis.fetch = originalFetch;
}

console.log("ai.abortBody.test.mjs: a cancel or timeout during a non-streaming body is reported as that, and a bad body stays an invalid response");
