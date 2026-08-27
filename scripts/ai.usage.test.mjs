// Provider request/retry regression test. This drives the production path
// with fake provider responses so failed attempts stay in token reports and
// named compatibility failures remove only the rejected parameter.
// Run: node scripts/ai.usage.test.mjs
import assert from "node:assert/strict";
import { SETTINGS } from "./settings.mjs";

const settings = new Map([
  [SETTINGS.apiBaseUrl, "http://localhost:11434/v1"],
  [SETTINGS.apiKey, ""],
  [SETTINGS.apiKeyBaseUrl, ""],
  [SETTINGS.model, "test-model"],
  [SETTINGS.temperature, 0.8],
  [SETTINGS.maxTokens, 8000],
  [SETTINGS.requestTimeout, 90]
]);

globalThis.game = {
  settings: { get: (_moduleId, key) => settings.get(key) },
  i18n: {
    localize: (key) => key,
    format: (key, data) => `${key}:${JSON.stringify(data)}`
  }
};

const providerReplies = [
  {
    choices: [{
      message: { content: '{"keywords":["fire"' },
      finish_reason: "length"
    }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
  },
  {
    choices: [{
      message: { content: '{"keywords":["fire","control"]}' },
      finish_reason: "stop"
    }],
    usage: { prompt_tokens: 11, completion_tokens: 5, total_tokens: 16 }
  }
];
const requestBodies = [];
const requestHeaders = [];
const requestUrls = [];
const requestMethods = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  requestUrls.push(String(url));
  requestMethods.push(options.method);
  requestBodies.push(options.body ? JSON.parse(options.body) : null);
  requestHeaders.push(options.headers);
  const reply = providerReplies.shift();
  assert.ok(reply, "production path must make exactly the expected provider calls");
  const responseBody = Object.hasOwn(reply, "rawBody")
    ? reply.rawBody
    : JSON.stringify(reply.body ?? reply);
  return new Response(responseBody, {
    status: reply.httpStatus ?? 200,
    headers: { "content-type": reply.contentType ?? "application/json" }
  });
};

try {
  const { chooseSpellFocus, listProviderModels, testProviderConnection } = await import("./ai.mjs");
  const result = await chooseSpellFocus({
    concept: {
      name: "Ember Adept",
      level: 5,
      blurb: "A battlefield fire controller",
      description: "Shapes flame to divide enemies.",
      traits: ["fire", "humanoid"]
    },
    tradition: "arcane"
  });

  assert.deepEqual(result.keywords, ["fire", "control"]);
  assert.deepEqual(
    result.usage,
    { prompt: 21, completion: 25, total: 46, estimated: false },
    "successful retry must include the exact usage from its truncated first attempt"
  );
  assert.equal(requestBodies.length, 2);
  assert.equal(requestBodies[0].max_tokens, 768, "first selector attempt must use its task cap");
  assert.equal(requestBodies[1].max_tokens, 1536, "retry may use its bounded expanded cap");
  assert.equal(requestBodies[0].reasoning_effort, "none");
  assert.equal(
    Object.hasOwn(requestBodies[0], "thinking"),
    false,
    "Ollama/LM Studio-style endpoints must use their OpenAI-compatible reasoning control only"
  );

  settings.set(SETTINGS.apiKey, "local-secret");
  settings.set(SETTINGS.apiKeyBaseUrl, "http://localhost:11434/v1");
  providerReplies.push(
    {
      httpStatus: 400,
      body: { error: { message: `${"gateway preamble ".repeat(20)}Unsupported parameter: reasoning_effort` } }
    },
    {
      choices: [{
        message: { content: '{"keywords":["frost","control"]}' },
        finish_reason: "stop"
      }],
      usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 }
    }
  );
  const compatibilityStart = requestBodies.length;
  const compatibilityResult = await chooseSpellFocus({
    concept: {
      name: "Frost Adept",
      level: 5,
      blurb: "A battlefield frost controller",
      description: "Shapes ice to divide enemies.",
      traits: ["cold", "humanoid"]
    },
    tradition: "arcane"
  });
  assert.deepEqual(compatibilityResult.keywords, ["frost", "control"]);
  const compatibilityBodies = requestBodies.slice(compatibilityStart);
  const compatibilityHeaders = requestHeaders.slice(compatibilityStart);
  assert.equal(compatibilityBodies.length, 2, "named unsupported parameters must retry in-place once");
  assert.equal(compatibilityBodies[0].reasoning_effort, "none");
  assert.equal(
    Object.hasOwn(compatibilityBodies[1], "reasoning_effort"),
    false,
    "compatibility retry must remove only the provider-rejected parameter"
  );
  assert.ok(
    compatibilityHeaders.every((headers) => headers.Authorization === "Bearer local-secret"),
    "compatibility retries must preserve an exactly bound provider key"
  );
  settings.set(SETTINGS.apiKey, "");
  settings.set(SETTINGS.apiKeyBaseUrl, "");

  const estimatedStart = requestBodies.length;
  providerReplies.push(
    {
      choices: [{
        message: { content: '{"keywords":["smoke"' },
        finish_reason: "length"
      }]
    },
    {
      choices: [{
        message: { content: '{"keywords":["smoke","concealment"]}' },
        finish_reason: "stop"
      }]
    }
  );
  const estimatedResult = await chooseSpellFocus({
    concept: {
      name: "Mist Stalker",
      level: 4,
      blurb: "A hunter hidden by smoke",
      description: "Controls sight lines with drifting mist.",
      traits: ["air", "humanoid"]
    },
    tradition: "primal"
  });
  const estimateTokens = (chars) => Math.max(1, Math.round(chars / 4));
  const estimatedBodies = requestBodies.slice(estimatedStart);
  const expectedPrompt = estimatedBodies.reduce(
    (sum, body) => sum + estimateTokens(body.messages.reduce(
      (chars, message) => chars + message.content.length, 0
    )),
    0
  );
  const expectedCompletion = estimateTokens('{"keywords":["smoke"'.length)
    + estimateTokens('{"keywords":["smoke","concealment"]}'.length);
  assert.deepEqual(
    estimatedResult.usage,
    {
      prompt: expectedPrompt,
      completion: expectedCompletion,
      total: expectedPrompt + expectedCompletion,
      estimated: true
    },
    "providers without usage metadata must also retain the truncated attempt estimate"
  );

  providerReplies.push(
    {
      choices: [{
        message: { content: "", reasoning: "reasoning without a final answer" },
        finish_reason: "stop"
      }],
      usage: { prompt_tokens: 13, completion_tokens: 17, total_tokens: 30 }
    },
    {
      choices: [{
        message: { content: '{"keywords":["mist","concealment"]}' },
        finish_reason: "stop"
      }],
      usage: { prompt_tokens: 7, completion_tokens: 4, total_tokens: 11 }
    }
  );
  const emptyAttemptStart = requestBodies.length;
  const emptyRetryResult = await chooseSpellFocus({
    concept: {
      name: "Veiled Hunter",
      level: 4,
      blurb: "A hunter behind a curtain of mist",
      description: "Uses concealment to control the battlefield.",
      traits: ["air", "humanoid"]
    },
    tradition: "primal"
  });
  assert.deepEqual(emptyRetryResult.keywords, ["mist", "concealment"]);
  assert.deepEqual(
    emptyRetryResult.usage,
    { prompt: 20, completion: 21, total: 41, estimated: false },
    "an empty first response must retain its provider-reported usage before retrying"
  );
  assert.equal(requestBodies.length - emptyAttemptStart, 2);

  settings.set(SETTINGS.apiBaseUrl, "https://api.deepseek.com/v1");
  settings.set(SETTINGS.model, "deepseek-chat");
  providerReplies.push(
    {
      httpStatus: 422,
      body: { error: { message: "Unsupported parameter: thinking" } }
    },
    {
      choices: [{
        message: { content: '{"keywords":["force","control"]}' },
        finish_reason: "stop"
      }],
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }
    }
  );
  const deepSeekStart = requestBodies.length;
  await chooseSpellFocus({
    concept: {
      name: "Force Adept",
      level: 5,
      blurb: "A disciplined force mage",
      description: "Shapes force to control enemy movement.",
      traits: ["human", "humanoid"]
    },
    tradition: "arcane"
  });
  const [deepSeekBody, deepSeekRetryBody] = requestBodies.slice(deepSeekStart);
  assert.equal(deepSeekBody.model, "deepseek-v4-flash", "retired first-party aliases must resolve at request time");
  assert.equal(
    Object.hasOwn(deepSeekBody, "reasoning_effort"),
    false,
    "the first-party DeepSeek API must not receive its unsupported reasoning_effort none value"
  );
  assert.deepEqual(deepSeekBody.thinking, { type: "disabled" });
  assert.equal(
    Object.hasOwn(deepSeekRetryBody, "thinking"),
    false,
    "422 compatibility retries must remove a named unsupported thinking control"
  );

  settings.set(SETTINGS.apiBaseUrl, "https://api.openai.com/v1");
  settings.set(SETTINGS.apiKey, "openai-secret");
  settings.set(SETTINGS.apiKeyBaseUrl, "https://api.openai.com/v1");
  settings.set(SETTINGS.model, "gpt-test");
  providerReplies.push(
    {
      httpStatus: 400,
      body: { error: { message: "Unsupported message role: developer" } }
    },
    {
      httpStatus: 400,
      body: { error: { message: "Unsupported parameter: temperature" } }
    },
    {
      choices: [{
        message: { content: '{"keywords":["storm","control"]}' },
        finish_reason: "stop"
      }],
      usage: { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 }
    }
  );
  const openAIStart = requestBodies.length;
  await chooseSpellFocus({
    concept: {
      name: "Storm Adept",
      level: 5,
      blurb: "A disciplined storm mage",
      description: "Shapes wind to control enemy movement.",
      traits: ["air", "humanoid"]
    },
    tradition: "arcane"
  });
  const [openAIBody, openAIRoleRetryBody, openAIParameterRetryBody] = requestBodies.slice(openAIStart);
  assert.equal(openAIBody.messages[0].role, "developer", "first-party OpenAI uses current developer instructions");
  assert.equal(openAIBody.max_completion_tokens, 768, "first-party OpenAI uses the current completion-limit field");
  assert.equal(Object.hasOwn(openAIBody, "max_tokens"), false, "deprecated max_tokens is not sent to OpenAI");
  assert.equal(openAIRoleRetryBody.messages[0].role, "system", "older OpenAI models can reject the developer role by name");
  assert.equal(Object.hasOwn(openAIParameterRetryBody, "temperature"), false, "unsupported sampling controls are removed by name");
  assert.equal(openAIParameterRetryBody.max_completion_tokens, 768, "compatibility retry preserves the output cap");
  assert.equal(requestHeaders[openAIStart].Authorization, "Bearer openai-secret");

  settings.set(SETTINGS.apiBaseUrl, "http://localhost:11434/v1");
  settings.set(SETTINGS.apiKey, "");
  settings.set(SETTINGS.apiKeyBaseUrl, "");
  settings.set(SETTINGS.model, "new-local-model");
  providerReplies.push(
    {
      httpStatus: 400,
      body: { error: { message: "Unsupported parameter: max_tokens; use max_completion_tokens" } }
    },
    {
      choices: [{
        message: { content: '{"keywords":["stone","control"]}' },
        finish_reason: "stop"
      }],
      usage: { prompt_tokens: 7, completion_tokens: 4, total_tokens: 11 }
    }
  );
  const localTokenStart = requestBodies.length;
  await chooseSpellFocus({
    concept: {
      name: "Stone Adept",
      level: 5,
      blurb: "A patient earth mage",
      description: "Raises stone to divide enemy movement.",
      traits: ["earth", "humanoid"]
    },
    tradition: "primal"
  });
  const [localLegacyBody, localModernBody] = requestBodies.slice(localTokenStart);
  assert.equal(localLegacyBody.messages[0].role, "system", "local compatibility keeps the broadly-supported system role");
  assert.equal(localLegacyBody.max_tokens, 768);
  assert.equal(localModernBody.max_completion_tokens, 768, "local providers can negotiate the newer token-limit spelling");
  assert.equal(Object.hasOwn(localModernBody, "max_tokens"), false);

  settings.set(SETTINGS.apiBaseUrl, "http://localhost:11434/v1/chat/completions?tenant=demo");
  providerReplies.push({
    choices: [{
      message: { content: '{"ok":true}' },
      finish_reason: "stop"
    }],
    usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 }
  });
  const testStart = requestBodies.length;
  const testUsage = await testProviderConnection();
  const testBody = requestBodies[testStart];
  assert.deepEqual(testUsage, { prompt: 12, completion: 5, total: 17, estimated: false });
  assert.equal(testBody.max_tokens, 64, "connection checks must use their small task-specific cap");
  assert.equal(testBody.temperature, 0);
  assert.equal(testBody.stream, true, "connection checks must exercise the real streaming request path");
  assert.deepEqual(testBody.response_format, { type: "json_object" });
  assert.equal(
    requestUrls[testStart],
    "http://localhost:11434/v1/chat/completions?tenant=demo",
    "a pasted full endpoint must be requested exactly once with its query intact"
  );

  providerReplies.push({
    rawBody: `data: ${JSON.stringify({
      choices: [{ delta: { content: '{"ok":true}' }, finish_reason: "stop" }],
      usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 }
    })}`,
    contentType: "text/event-stream"
  });
  const unterminatedStreamUsage = await testProviderConnection();
  assert.deepEqual(
    unterminatedStreamUsage,
    { prompt: 4, completion: 3, total: 7, estimated: false },
    "an SSE provider's final data record must be consumed even without a trailing newline"
  );

  providerReplies.push({ data: [
    { id: "qwen3:8b" }, { id: "gemma3:4b" }, { id: "qwen3:8b" }, { id: "" }
  ] });
  const modelsStart = requestBodies.length;
  const models = await listProviderModels();
  assert.deepEqual(models, ["gemma3:4b", "qwen3:8b"], "model IDs are deduped and sorted");
  assert.equal(requestMethods[modelsStart], "GET");
  assert.equal(requestBodies[modelsStart], null, "model discovery sends no request body");
  assert.equal(
    requestUrls[modelsStart],
    "http://localhost:11434/v1/models?tenant=demo",
    "model discovery resolves from a full Chat Completions endpoint"
  );

  providerReplies.push({
    httpStatus: 401,
    body: { error: { message: `invalid key ${"x".repeat(1000)}` } }
  });
  await assert.rejects(
    listProviderModels(),
    (error) => {
      assert.match(error.message, /SIMPLYPF2E\.Errors\.ApiAuthHint/);
      assert.ok(error.message.length < 600, "provider error details must be bounded for compact notifications");
      assert.doesNotMatch(error.message, /x{300}/, "oversized provider payloads must be truncated");
      return true;
    },
    "authorization failures must include key/endpoint recovery guidance"
  );

  providerReplies.push({
    httpStatus: 404,
    rawBody: "<html><body><h1>Not Found</h1><p>unknown compatibility route</p></body></html>",
    contentType: "text/html"
  });
  await assert.rejects(
    listProviderModels(),
    (error) => {
      assert.match(error.message, /SIMPLYPF2E\.Errors\.ApiNotFoundHint/);
      assert.match(error.message, /Not Found unknown compatibility route/);
      assert.doesNotMatch(error.message, /<html>/, "HTML gateway errors must become readable text");
      return true;
    }
  );

  providerReplies.push({ rawBody: "OK", contentType: "text/plain" });
  await assert.rejects(
    testProviderConnection(),
    { message: "SIMPLYPF2E.Errors.InvalidResponse" },
    "a non-JSON success response must explain that the endpoint is not Chat Completions compatible"
  );
  assert.equal(providerReplies.length, 0, "all fake provider responses must be consumed");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("ai.usage.test.mjs: provider request/retry assertions passed");
