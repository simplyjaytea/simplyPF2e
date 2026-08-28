// Drive the production choice selector through the real provider request path.
// Only Foundry settings/i18n and the network response are mocked.
import assert from "node:assert/strict";
import { SETTINGS } from "./settings.mjs";

const settings = new Map([
  [SETTINGS.apiBaseUrl, "http://localhost:11434/v1"],
  [SETTINGS.apiKey, ""], [SETTINGS.apiKeyBaseUrl, ""],
  [SETTINGS.model, "test-model"], [SETTINGS.temperature, 0.8],
  [SETTINGS.maxTokens, 8000], [SETTINGS.requestTimeout, 90]
]);
globalThis.game = {
  settings: { get: (_module, key) => settings.get(key) },
  i18n: {
    localize: (key) => ({ "PF2E.Skill.Athletics": "Athletics", "PF2E.Skill.Acrobatics": "Acrobatics" }[key] ?? key),
    format: (key, data) => `${key}:${JSON.stringify(data)}`
  }
};

const groups = ["a", "b", "c", "d"].map((id) => ({
  id: `choice-${id}`, item: "Fighter", flag: "do-not-send-rule-flags", prompt: "Choose a skill",
  options: [
    { id: `${id}-ath`, label: "PF2E.Skill.Athletics", value: "do-not-send-real-values" },
    { id: `${id}-acr`, label: "PF2E.Skill.Acrobatics" }
  ]
}));
const concept = { name: "Trail Guardian", class: "Fighter", keyAbility: "str", blurb: "Protects travelers", equipment: [] };
const replies = [];
const requests = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (_url, options) => {
  requests.push(JSON.parse(options.body));
  assert.ok(replies.length, "no unplanned provider calls");
  const content = replies.shift();
  if (content instanceof Response) return content;
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(content) }, finish_reason: "stop" }],
    usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 }
  }), { headers: { "content-type": "application/json" } });
};

try {
  const { selectCharacterChoices } = await import("./ai.mjs");
  assert.deepEqual(await selectCharacterChoices({ concept, groups: [] }), { picks: [], usage: null });
  assert.equal(requests.length, 0, "no choices means no AI request");

  replies.push({ picks: [
    { choice: "choice-a", option: "a-ath" },
    { choice: "choice-b", option: "a-ath" }, // Another group's valid ID is not valid here.
    { choice: "choice-c", option: "c-ath" },
    { choice: "choice-c", option: "c-acr" }, // Never choose the first conflicting answer.
    { choice: "choice-d", option: 0 },
    { choice: "unknown", option: "d-ath" }
  ] });
  const result = await selectCharacterChoices({ concept, groups });
  assert.deepEqual(result.picks, [{ choice: "choice-a", option: "a-ath" }]);
  assert.deepEqual(result.usage, { prompt: 20, completion: 10, total: 30, estimated: false });
  const body = requests[0];
  assert.equal(body.temperature, 0);
  assert.equal(body.max_tokens, 3072);
  assert.equal(body.reasoning_effort, "none");
  const prompt = body.messages.find((message) => message.role === "user").content;
  const catalog = JSON.parse(prompt);
  assert.equal(catalog.choices[0].options[0].label, "Athletics", "labels must be localized before selection");
  assert.doesNotMatch(prompt, /do-not-send/, "rule values, flags, and destinations stay local");
  assert.deepEqual(catalog.choices.map((group) => group.id), groups.map((group) => group.id));

  replies.push({}, { picks: [{ choice: "choice-d", option: "d-acr" }] });
  const retry = await selectCharacterChoices({ concept, groups });
  assert.deepEqual(retry.picks, [{ choice: "choice-d", option: "d-acr" }]);
  assert.equal(requests.length, 3, "missing required picks gets the shared bounded retry");
  assert.equal(retry.usage.total, 60, "failed attempt usage is included");
  assert.equal(replies.length, 0);

  replies.push({}, {});
  await assert.rejects(selectCharacterChoices({ concept, groups }), (error) => {
    assert.deepEqual(error.usage, { prompt: 40, completion: 20, total: 60, estimated: false },
      "exhausted JSON attempts must expose their usage to the native-fallback caller");
    return true;
  });
  assert.equal(requests.length, 5, "failed selection must stop after the bounded retry");

  replies.push({}, new Response(JSON.stringify({ error: { message: "Unauthorized" } }), {
    status: 401, headers: { "content-type": "application/json" }
  }));
  await assert.rejects(selectCharacterChoices({ concept, groups }), (error) => {
    assert.equal(error.usage.total, 30, "a later nonretryable failure must retain earlier attempt usage");
    return true;
  });
  assert.equal(requests.length, 7);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("ai character choice selection: production request and grounding checks passed");
