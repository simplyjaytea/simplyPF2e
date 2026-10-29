// requestJSON retry progress: the retry path ("retrying", then "validating") is safe without an observer, with an
// observer that throws, and never reports after a user cancel. The guard is the observer wrap at the top of
// requestJSON (scripts/ai.mjs); this pins it so a refactor cannot reintroduce an unguarded onProgress call.
// Run: node tests/ai.requestJSON.progress.test.mjs
import assert from "node:assert/strict";
import { SETTINGS } from "../scripts/settings.mjs";

const settings = new Map([
  [SETTINGS.apiBaseUrl, "http://localhost:11434/v1"], [SETTINGS.apiKey, ""], [SETTINGS.apiKeyBaseUrl, ""],
  [SETTINGS.model, "test-model"], [SETTINGS.temperature, 0.8], [SETTINGS.maxTokens, 8000], [SETTINGS.requestTimeout, 90]
]);
globalThis.game = { settings: { get: (_m, key) => settings.get(key) }, i18n: { localize: (key) => key, format: (key, data) => `${key}:${JSON.stringify(data)}` } };
const truncated = () => ({ choices: [{ message: { content: '{"keywords":["fire"' }, finish_reason: "length" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
const good = () => ({ choices: [{ message: { content: '{"keywords":["fire","control"]}' }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
const originalWarn = console.warn;
console.warn = () => {};
const originalError = console.error;
console.error = () => {};
let replies = [];
let calls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  calls += 1;
  const reply = replies.shift();
  assert.ok(reply, "unexpected provider call");
  return new Response(JSON.stringify(reply), { status: 200, headers: { "content-type": "application/json" } });
};
try {
  const { chooseSpellFocus } = await import("../scripts/ai.mjs");
  const args = { concept: { name: "Ember Adept", level: 5, traits: ["fire"] }, tradition: "arcane" };

  // 1. A retry with no progress observer at all succeeds (the retry path calls the guarded wrapper, never undefined).
  replies = [truncated(), good()];
  const bare = await chooseSpellFocus({ ...args });
  assert.deepEqual(bare.keywords, ["fire", "control"]);

  // 2. An observer that throws on the retry-only events cannot fail the call; each event fires exactly once.
  replies = [truncated(), good()];
  const seen = [];
  const noisy = await chooseSpellFocus({ ...args, onProgress: (event) => {
    seen.push(event.phase);
    if (event.phase === "retrying" || event.phase === "validating") throw new Error("broken progress UI");
  } });
  assert.deepEqual(noisy.keywords, ["fire", "control"]);
  assert.equal(seen.filter((phase) => phase === "retrying").length, 1, "retrying fires once");
  assert.equal(seen.filter((phase) => phase === "validating").length, 1, "validating fires once, for the attempt that returned parseable JSON");
  assert.ok(seen.indexOf("retrying") < seen.indexOf("validating"));

  // 3. A user cancel during the first attempt stops the call without a retry or any later progress event.
  replies = [truncated(), good()];
  calls = 0;
  const controller = new AbortController();
  const events = [];
  let abortedAt = null;
  await assert.rejects(chooseSpellFocus({ ...args, signal: controller.signal, onProgress: (event) => {
    events.push(event.phase);
    if (event.phase === "receiving" && abortedAt === null) { abortedAt = events.length; controller.abort(); }
  } }), (error) => error.cancelled === true);
  assert.notEqual(abortedAt, null, "the cancel happened mid-request");
  assert.deepEqual(events.slice(abortedAt).filter((phase) => phase === "retrying" || phase === "validating"), [],
    "no retrying or validating event is reported after the cancel");
  assert.equal(calls, 1, "a cancelled call is not retried");
} finally {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
  console.error = originalError;
}
console.log("ai.requestJSON.progress.test.mjs: retry progress is guarded without an observer, with a throwing observer, and after cancel");
