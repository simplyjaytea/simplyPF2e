// Token estimate / usage-normalization helpers.
// Run: node scripts/tokens.test.mjs
import assert from "node:assert/strict";
import { coarsenTokenEstimate, estimateTokens, normalizeUsage } from "./tokens.mjs";

assert.equal(estimateTokens(""), 0);
assert.equal(estimateTokens(0), 0);
assert.equal(estimateTokens("abcd"), 1, "four prose characters is about one token");
assert.ok(
  estimateTokens('{"keywords":["fire"]}') > estimateTokens("a".repeat('{"keywords":["fire"]}'.length)),
  "JSON punctuation should raise the estimate above same-length prose"
);

assert.equal(coarsenTokenEstimate(0), 0);
assert.equal(coarsenTokenEstimate(12), 12, "small estimates keep ones precision");
assert.equal(coarsenTokenEstimate(84), 85);
assert.equal(coarsenTokenEstimate(1847), 1850);
assert.equal(coarsenTokenEstimate(1844), 1840);

assert.deepEqual(
  normalizeUsage(
    { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    { content: "{}", system: "sys", user: "user" }
  ),
  { prompt: 10, completion: 20, total: 30, estimated: false },
  "complete provider usage must win over the fallback estimator"
);

assert.deepEqual(
  normalizeUsage(
    { total_tokens: 44 },
    { content: "{}", system: "sys", user: "user" }
  ),
  { prompt: 0, completion: 0, total: 44, estimated: false },
  "a total-only usage block is exact, without a fake prompt/completion split"
);

const partial = normalizeUsage(
  { completion_tokens: 9 },
  { content: '{"ok":true}', system: "You are a tester.", user: "Return JSON." }
);
assert.equal(partial.completion, 9);
assert.equal(partial.estimated, true, "a one-sided usage block must stay labeled estimated");
assert.ok(partial.prompt > 0, "the missing prompt side is filled from the request text");

const estimated = normalizeUsage(null, {
  content: '{"keywords":["smoke"]}',
  system: "system prompt text",
  user: "user prompt text",
  reasoningChars: 12
});
assert.equal(estimated.estimated, true);
assert.equal(
  estimated.prompt,
  estimateTokens("system prompt textuser prompt text")
);
assert.equal(
  estimated.completion,
  estimateTokens('{"keywords":["smoke"]}') + estimateTokens(12)
);
assert.equal(estimated.total, estimated.prompt + estimated.completion);

const empty = normalizeUsage({}, { content: "", system: "", user: "" });
assert.equal(empty.estimated, true);
assert.equal(empty.prompt, 0);
assert.equal(empty.completion, 0);
assert.equal(empty.total, 0);

console.log("tokens.test.mjs: estimate and usage-normalization assertions passed");
