import assert from "node:assert/strict";

globalThis.game = {
  i18n: {
    localize: (key) => key,
    format: (key) => key
  }
};

const { AIRequestError, parseConceptJSON } = await import("./ai.mjs");

const originalWarn = console.warn;
const warnCalls = [];
console.warn = (...args) => { warnCalls.push(args); };

function assertBadJson(input, message) {
  assert.throws(
    () => parseConceptJSON(input),
    (error) => error instanceof AIRequestError && error.retryable
      && error.message === "SIMPLYPF2E.Errors.BadJson",
    message
  );
}

try {
  assert.deepEqual(parseConceptJSON('{"name":"Ash Drake","traits":[]}'), {
    name: "Ash Drake",
    traits: []
  });

  assert.deepEqual(
    parseConceptJSON('Result:\n```json\n{"keywords":["fire","control"]}\n```'),
    { keywords: ["fire", "control"] },
    "markdown fences from permissive providers should remain supported"
  );

  assert.deepEqual(
    parseConceptJSON('{"outer":{"inner":{"k":1}},"traits":["fire"]}'),
    { outer: { inner: { k: 1 } }, traits: ["fire"] },
    "nested objects must parse from their matching braces"
  );

  assert.deepEqual(
    parseConceptJSON('{"name":"Ash","desc":"uses } in combat","nested":{"note":"still } ok"}}'),
    { name: "Ash", desc: "uses } in combat", nested: { note: "still } ok" } },
    "braces inside strings are not object delimiters"
  );

  assert.deepEqual(
    parseConceptJSON('Here is the JSON: {"keywords":["fire","control"]} trailing } prose'),
    { keywords: ["fire", "control"] },
    "a complete object must survive trailing prose that contains extra braces"
  );

  assert.deepEqual(
    parseConceptJSON('Use {fire} then return {"keywords":["fire","control"]}'),
    { keywords: ["fire", "control"] },
    "a complete object after an invalid closed brace pair is still recoverable"
  );

  assert.deepEqual(
    parseConceptJSON('{"keywords":["fire"]}{"keywords":["ignored"]}'),
    { keywords: ["fire"] },
    "the first complete JSON object is the response; trailing extra objects are ignored"
  );

  assert.deepEqual(
    parseConceptJSON('"{\\"keywords\\":[\\"fire\\",\\"control\\"]}"'),
    { keywords: ["fire", "control"] },
    "a JSON-encoded object string unwraps once"
  );

  assert.deepEqual(
    parseConceptJSON([
      { type: "text", text: '{"keywords":["fire"' },
      { type: "text", text: ',"control"]}' }
    ]),
    { keywords: ["fire", "control"] },
    "Chat Completions text-part arrays must join into one JSON object"
  );

  assertBadJson(
    '{"name":"Incomplete","traits":["fire"',
    "truncated JSON must fail closed instead of becoming a partial concept"
  );

  assertBadJson(
    '{"name":"Ash","nested":{"foo":1},"traits":["fire"',
    "an unclosed root must not salvage a nested complete object"
  );

  assertBadJson(
    "```json\n{\"keywords\":[\"fire\"\n```\n}",
    "a closed markdown fence with truncated JSON must not steal a later brace"
  );

  assertBadJson("no object here", "prose without JSON remains BadJson");
  assertBadJson("", "empty content remains BadJson");

  const huge = `${"x".repeat(800)} not json`;
  try {
    parseConceptJSON(huge);
    assert.fail("oversized invalid content must throw");
  } catch (error) {
    assert.ok(error instanceof AIRequestError);
    assert.ok(error.details.preview.length < huge.length);
    assert.equal(error.details.contentLength, huge.length);
    assert.ok(error.details.preview.endsWith("…"));
  }

  assert.ok(
    warnCalls.some((args) => String(args[0]).includes("Failed to parse AI response")),
    "parse failures must log a diagnostic warning instead of dumping the raw payload via console.error"
  );
  assert.ok(
    warnCalls.every((args) => !String(args[0] ?? "").includes("x".repeat(800))),
    "diagnostics must not print the full oversized payload"
  );
} finally {
  console.warn = originalWarn;
}

console.log("ai.parseJson.test.mjs: all JSON parsing assertions passed");
