// Provider-auth regression tests. These import production settings helpers so
// key-binding behavior cannot drift away from the test.
// Run: node scripts/settings.auth.test.mjs
import assert from "node:assert/strict";
import {
  MODULE_ID,
  SETTINGS,
  authorizeApiKeyForCurrentBaseUrl,
  chatCompletionsUrl,
  describeProvider,
  getProviderAuthWarningKey,
  getProviderRequestConfig,
  isOfficialDeepSeekEndpoint,
  isOfficialOpenAIEndpoint,
  isLikelyKeylessLocalEndpoint,
  modelsUrl,
  normalizeApiBaseUrl,
  registerSettings,
  resolveProviderModel
} from "./settings.mjs";

const values = new Map();
const registrations = new Map();
let afterNextSet = null;

globalThis.game = {
  settings: {
    get: (_moduleId, key) => values.get(key),
    set: async (_moduleId, key, value) => {
      values.set(key, value);
      const callback = afterNextSet;
      afterNextSet = null;
      if (callback) await callback(key, value);
      return value;
    },
    register: (_moduleId, key, config) => registrations.set(key, config),
    registerMenu: () => {}
  }
};

const setAuth = ({ baseUrl, apiKey = "", apiKeyBaseUrl = "" }) => {
  values.set(SETTINGS.apiBaseUrl, baseUrl);
  values.set(SETTINGS.apiKey, apiKey);
  values.set(SETTINGS.apiKeyBaseUrl, apiKeyBaseUrl);
  values.set(SETTINGS.model, "test-model");
};

assert.equal(
  normalizeApiBaseUrl("  HTTPS://API.Example.COM:443/v1///#fragment  "),
  "https://api.example.com/v1",
  "normalization must canonicalize the host and remove trailing slashes/fragments"
);
assert.equal(
  chatCompletionsUrl("https://api.example.com/v1"),
  "https://api.example.com/v1/chat/completions",
  "an API root must resolve to its Chat Completions route"
);
assert.equal(
  chatCompletionsUrl("https://api.example.com/v1/chat/completions/"),
  "https://api.example.com/v1/chat/completions",
  "a pasted full endpoint must not get a duplicate route"
);
assert.equal(
  chatCompletionsUrl("https://gateway.example/openai/v1?tenant=demo"),
  "https://gateway.example/openai/v1/chat/completions?tenant=demo",
  "gateway query parameters must remain after the appended request path"
);
assert.equal(
  modelsUrl("https://gateway.example/openai/v1/chat/completions?tenant=demo"),
  "https://gateway.example/openai/v1/models?tenant=demo",
  "model discovery must resolve from a pasted full endpoint and preserve its query"
);
assert.equal(modelsUrl("http://localhost:11434/v1"), "http://localhost:11434/v1/models");

assert.equal(isOfficialDeepSeekEndpoint("https://api.deepseek.com/v1"), true);
assert.equal(isOfficialDeepSeekEndpoint("https://api.deepseek.com.evil.example/v1"), false);
assert.equal(isOfficialOpenAIEndpoint("https://api.openai.com/v1"), true);
assert.equal(isOfficialOpenAIEndpoint("https://api.openai.com.evil.example/v1"), false);
assert.deepEqual(
  describeProvider("http://localhost:11434/v1", "qwen3:8b"),
  { id: "ollama", name: "Ollama", local: true, model: "qwen3:8b" }
);
assert.deepEqual(
  describeProvider("https://gateway.example/v1", "hosted-model"),
  { id: "custom", name: "Custom provider", local: false, model: "hosted-model" }
);
assert.equal(
  isLikelyKeylessLocalEndpoint("https://public.example:11434/v1"),
  false,
  "a well-known local-model port must not make an arbitrary public host keyless"
);
assert.deepEqual(
  describeProvider("https://public.example:11434/v1", "hosted-model"),
  { id: "custom", name: "Custom provider", local: false, model: "hosted-model" }
);
assert.equal(
  resolveProviderModel("https://api.deepseek.com/v1", "deepseek-chat"),
  "deepseek-v4-flash",
  "retired aliases must remain usable against DeepSeek's first-party API"
);
assert.equal(
  resolveProviderModel("https://api.deepseek.com/v1", "deepseek-reasoner"),
  "deepseek-v4-flash"
);
assert.equal(
  resolveProviderModel("https://openrouter.ai/api/v1", "deepseek-chat"),
  "deepseek-chat",
  "custom OpenAI-compatible providers must retain their own model identifiers"
);

setAuth({
  baseUrl: "https://api.example.com/v1/",
  apiKey: "legacy-secret",
  apiKeyBaseUrl: ""
});
let state = getProviderRequestConfig();
assert.equal(state.apiKey, "", "legacy unbound keys must never leave settings storage");
assert.equal(state.apiKeyIsBound, false);
assert.equal(
  getProviderAuthWarningKey(),
  "SIMPLYPF2E.Generator.ApiKeyNotAuthorized",
  "legacy keys must explain how to authorize the current endpoint"
);
assert.equal(
  getProviderAuthWarningKey({
    baseUrl: "http://localhost:11434/v1",
    model: "",
    hasConfiguredApiKey: false,
    apiKeyIsBound: false,
    keylessLocal: true
  }, undefined, false),
  null,
  "model discovery may validate an otherwise-ready provider before a model is selected"
);

assert.equal(
  await authorizeApiKeyForCurrentBaseUrl("https://api.example.com/v1"),
  true,
  "explicit authorization must work even when a legacy key value is unchanged"
);
assert.equal(values.get(SETTINGS.apiKeyBaseUrl), "https://api.example.com/v1");
assert.equal(getProviderRequestConfig().apiKey, "legacy-secret");

setAuth({
  baseUrl: "https://current.example/v1",
  apiKey: "client-secret",
  apiKeyBaseUrl: ""
});
assert.equal(
  await authorizeApiKeyForCurrentBaseUrl("https://stale.example/v1"),
  false,
  "authorization must reject an endpoint that changed after it was rendered"
);
assert.equal(values.get(SETTINGS.apiKeyBaseUrl), "", "a stale confirmation must not bind the key");

afterNextSet = async (key) => {
  if (key === SETTINGS.apiKeyBaseUrl) {
    values.set(SETTINGS.apiBaseUrl, "https://changed-during-save.example/v1");
  }
};
assert.equal(
  await authorizeApiKeyForCurrentBaseUrl("https://current.example/v1"),
  false,
  "authorization must fail closed when the endpoint changes while the binding is saved"
);
assert.equal(values.get(SETTINGS.apiKeyBaseUrl), "", "a raced binding must be cleared");

setAuth({
  baseUrl: "https://gateway.example/v1",
  apiKey: "path-secret",
  apiKeyBaseUrl: "https://gateway.example/other"
});
state = getProviderRequestConfig();
assert.equal(state.apiKey, "", "same-origin but different-path endpoints must not share keys");

setAuth({
  baseUrl: "https://API.EXAMPLE.com:443/v1/",
  apiKey: " bound-secret ",
  apiKeyBaseUrl: "https://api.example.com/v1"
});
state = getProviderRequestConfig();
assert.equal(state.apiKey, "bound-secret", "exact normalized binding must release the key for requests");
assert.equal(state.apiKeyIsBound, true);
assert.equal(getProviderAuthWarningKey(), null);

for (const localUrl of [
  "http://localhost:11434/v1",
  "http://127.0.0.1:1234/v1",
  "http://192.168.1.50:1234/v1",
  "http://[::1]:11434/v1"
]) {
  setAuth({ baseUrl: localUrl });
  assert.equal(isLikelyKeylessLocalEndpoint(localUrl), true, `${localUrl} must be recognized as local`);
  assert.equal(getProviderAuthWarningKey(), null, `${localUrl} must not show a missing-key warning`);
}

setAuth({ baseUrl: "http://localhost:11434/v1" });
assert.equal(
  getProviderAuthWarningKey(getProviderRequestConfig(), "https:"),
  "SIMPLYPF2E.Errors.MixedContentProvider",
  "an HTTPS Foundry page must warn before the browser blocks an HTTP local provider"
);
assert.equal(
  getProviderAuthWarningKey(getProviderRequestConfig(), "http:"),
  null,
  "an HTTP local Foundry page can call an HTTP local provider when CORS permits it"
);

setAuth({ baseUrl: "https://api.openai.com/v1" });
assert.equal(
  getProviderAuthWarningKey(),
  "SIMPLYPF2E.Generator.NoApiKey",
  "remote providers must retain useful missing-key guidance"
);

values.set(SETTINGS.model, "");
assert.equal(
  getProviderAuthWarningKey(),
  "SIMPLYPF2E.Errors.NoModel",
  "an empty model identifier must be caught before generation"
);

// Registration is the forward migration: settings saves never authorize a
// key without the exact endpoint confirmation rendered by the generator.
registerSettings(class SourcesConfigApp {});
const keyConfig = registrations.get(SETTINGS.apiKey);
const baseConfig = registrations.get(SETTINGS.apiBaseUrl);
const modelConfig = registrations.get(SETTINGS.model);
assert.equal(keyConfig?.scope, "client", "API keys must remain local to the GM client");
assert.equal(
  keyConfig?.config,
  false,
  "API keys must not appear as plaintext fields in Foundry's ordinary settings form"
);
assert.equal(
  baseConfig?.config,
  false,
  "the guided provider setup must be the only ordinary configuration surface for an API endpoint"
);
assert.equal(
  modelConfig?.config,
  false,
  "the guided provider setup must keep the selected model alongside its provider"
);
assert.equal(
  modelConfig?.default,
  "deepseek-v4-flash",
  "fresh installs must use a current DeepSeek model identifier"
);
assert.ok(keyConfig?.onChange, "API-key setting must register a binding invalidation callback");
assert.ok(baseConfig?.onChange, "base-URL setting must register a binding invalidation callback");

setAuth({
  baseUrl: "https://provider.example/v1",
  apiKey: "saved-secret",
  apiKeyBaseUrl: "https://provider.example/v1"
});
await keyConfig.onChange("saved-secret");
assert.equal(
  values.get(SETTINGS.apiKeyBaseUrl),
  "",
  "saving or changing a key must require a fresh displayed-endpoint confirmation"
);

await baseConfig.onChange("https://other-provider.example/v1");
assert.equal(values.get(SETTINGS.apiKeyBaseUrl), "", "changing provider must invalidate the old binding");

values.set(SETTINGS.apiKeyBaseUrl, "https://provider.example/v1");
await baseConfig.onChange("https://PROVIDER.example:443/v1/");
assert.equal(
  values.get(SETTINGS.apiKeyBaseUrl),
  "https://provider.example/v1",
  "normalization-only URL edits must preserve a valid binding"
);

console.log("settings.auth.test.mjs: all provider-auth assertions passed");
