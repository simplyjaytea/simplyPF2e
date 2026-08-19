import assert from "node:assert/strict";

globalThis.game = {
  i18n: {
    localize: (key) => key,
    format: (key) => key
  }
};

const { AIRequestError, parseConceptJSON } = await import("./ai.mjs");

assert.deepEqual(parseConceptJSON('{"name":"Ash Drake","traits":[]}'), {
  name: "Ash Drake",
  traits: []
});

assert.deepEqual(
  parseConceptJSON('Result:\n```json\n{"keywords":["fire","control"]}\n```'),
  { keywords: ["fire", "control"] },
  "markdown fences from permissive providers should remain supported"
);

const originalError = console.error;
console.error = () => {};
try {
  assert.throws(
    () => parseConceptJSON('{"name":"Incomplete","traits":["fire"'),
    (error) => error instanceof AIRequestError && error.retryable,
    "truncated JSON must fail closed instead of becoming a partial concept"
  );
} finally {
  console.error = originalError;
}

console.log("ai.parseJson.test.mjs: all JSON parsing assertions passed");
