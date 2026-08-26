// Focused provider-setup save checks. The app itself is production code; only
// Foundry's Application shell and settings storage are replaced here.
// Run: node scripts/provider-setup.test.mjs
import assert from "node:assert/strict";
import { MODULE_ID, SETTINGS, registerSettings } from "./settings.mjs";

class FakeApplicationV2 {
  constructor() {}
  render() {}
  async close() {}
}

globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: FakeApplicationV2,
      HandlebarsApplicationMixin: (Base) => class extends Base {}
    }
  }
};

const values = new Map();
const registrations = new Map();
globalThis.game = {
  settings: {
    get: (_moduleId, key) => values.get(key),
    register: (_moduleId, key, config) => registrations.set(key, config),
    registerMenu: () => {},
    set: async (_moduleId, key, value) => {
      values.set(key, value);
      await registrations.get(key)?.onChange?.(value);
      return value;
    }
  },
  i18n: {
    localize: (key) => key,
    format: (key, data) => `${key}:${JSON.stringify(data)}`
  }
};
const notices = { info: [], warn: [], error: [] };
globalThis.ui = { notifications: {
  info: (message) => notices.info.push(message),
  warn: (message) => notices.warn.push(message),
  error: (message) => notices.error.push(message)
} };

registerSettings(class SourcesConfigApp {}, class ProviderSetupApp {});
const { ProviderSetupApp, PROVIDER_PRESETS } = await import("./provider-setup-app.mjs");

assert.deepEqual(
  PROVIDER_PRESETS.filter((provider) => !provider.preserve).map((provider) => provider.id),
  ["deepseek", "openai", "openrouter", "ollama", "lmstudio"],
  "consumer setup must cover the documented cloud and local providers"
);

const presetApp = new ProviderSetupApp();
const baseControl = { value: "https://api.openai.com/v1" };
const modelControl = { value: "gpt-5.6-luna" };
const makeButton = (provider) => ({
  dataset: { provider },
  classList: { toggle: () => {} },
  setAttribute(name, value) { this[name] = value; }
});
const ollamaButton = makeButton("ollama");
const openAIButton = makeButton("openai");
presetApp.element = {
  querySelector: (selector) => selector.includes("apiBaseUrl") ? baseControl : modelControl,
  querySelectorAll: () => [openAIButton, ollamaButton]
};
await ProviderSetupApp.DEFAULT_OPTIONS.actions.chooseProvider.call(presetApp, null, ollamaButton);
assert.equal(baseControl.value, "http://localhost:11434/v1");
assert.equal(modelControl.value, "", "local presets must require a model that is actually installed");
assert.equal(ollamaButton["aria-pressed"], "true");
assert.equal(openAIButton["aria-pressed"], "false");

const setCurrent = ({ baseUrl, model = "old-model", apiKey = "old-secret", bound = baseUrl }) => {
  values.set(SETTINGS.apiBaseUrl, baseUrl);
  values.set(SETTINGS.model, model);
  values.set(SETTINGS.apiKey, apiKey);
  values.set(SETTINGS.apiKeyBaseUrl, bound);
};

const submit = async ({ baseUrl, model, apiKey = "", clearApiKey = false }) => {
  let saved = 0;
  const app = new ProviderSetupApp(() => { saved += 1; });
  const controls = new Map([
    ["[name='apiBaseUrl']", { value: baseUrl }],
    ["[name='model']", { value: model }],
    ["[name='apiKey']", { value: apiKey }],
    ["[name='clearApiKey']", { checked: clearApiKey }]
  ]);
  app.element = { querySelector: (selector) => controls.get(selector) ?? null };
  await ProviderSetupApp.DEFAULT_OPTIONS.form.handler.call(app);
  assert.equal(saved, 1, "successful setup must refresh the calling generator");
};

setCurrent({ baseUrl: "https://old-provider.example/v1" });
await submit({ baseUrl: "http://localhost:11434/v1", model: "qwen3:8b" });
assert.equal(values.get(SETTINGS.apiKey), "", "switching endpoints without a replacement must clear the old secret");
assert.equal(values.get(SETTINGS.apiKeyBaseUrl), "", "a cleared secret must not remain authorized");

setCurrent({ baseUrl: "https://api.openai.com/v1", model: "gpt-5.6-luna" });
await submit({ baseUrl: "https://api.openai.com/v1", model: "gpt-5.6-luna" });
assert.equal(values.get(SETTINGS.apiKey), "old-secret", "saving the same endpoint with a blank key field keeps its secret");
assert.equal(values.get(SETTINGS.apiKeyBaseUrl), "https://api.openai.com/v1");

setCurrent({ baseUrl: "https://old-provider.example/v1" });
await submit({
  baseUrl: "https://api.deepseek.com/v1",
  model: "deepseek-v4-flash",
  apiKey: "new-secret"
});
assert.equal(values.get(SETTINGS.apiKey), "new-secret");
assert.equal(
  values.get(SETTINGS.apiKeyBaseUrl),
  "https://api.deepseek.com/v1",
  "an explicitly entered replacement key must bind only to the displayed new endpoint"
);

// Save & Test uses the production Chat Completions path, closes only on
// success, and leaves the saved dialog open for correction after a failure.
const originalFetch = globalThis.fetch;
const originalError = console.error;
const makeTestButton = () => {
  const icon = { className: "fa-solid fa-signal" };
  return { disabled: false, querySelector: () => icon, icon };
};
const makeSaveTestApp = ({ baseUrl, model }) => {
  let saved = 0;
  let closed = 0;
  const app = new ProviderSetupApp(() => { saved += 1; });
  const target = makeTestButton();
  const otherButton = { disabled: false };
  const controls = new Map([
    ["[name='apiBaseUrl']", { value: baseUrl }],
    ["[name='model']", { value: model }],
    ["[name='apiKey']", { value: "" }],
    ["[name='clearApiKey']", { checked: false }]
  ]);
  app.element = {
    querySelector: (selector) => controls.get(selector) ?? null,
    querySelectorAll: (selector) => selector === "footer button" ? [target, otherButton] : []
  };
  app.close = async () => { closed += 1; };
  return { app, target, getSaved: () => saved, getClosed: () => closed };
};

try {
  setCurrent({ baseUrl: "http://localhost:11434/v1", model: "qwen3:8b", apiKey: "", bound: "" });
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }],
    usage: { prompt_tokens: 6, completion_tokens: 3, total_tokens: 9 }
  }), { headers: { "content-type": "application/json" } });
  const success = makeSaveTestApp({ baseUrl: "http://localhost:11434/v1", model: "qwen3:8b" });
  await ProviderSetupApp.DEFAULT_OPTIONS.actions.saveAndTest.call(success.app, null, success.target);
  assert.equal(success.getSaved(), 1, "save-and-test must refresh the calling generator after saving");
  assert.equal(success.getClosed(), 1, "a successful connection test closes setup");
  assert.equal(success.target.disabled, false, "the test action restores its button state");
  assert.ok(notices.info.some((message) => message.includes("SIMPLYPF2E.ProviderSetup.TestSuccess")));

  console.error = () => {};
  globalThis.fetch = async () => { throw new TypeError("provider offline"); };
  const failure = makeSaveTestApp({ baseUrl: "http://localhost:11434/v1", model: "qwen3:8b" });
  await ProviderSetupApp.DEFAULT_OPTIONS.actions.saveAndTest.call(failure.app, null, failure.target);
  assert.equal(failure.getSaved(), 1, "a failed test must not roll back valid saved settings");
  assert.equal(failure.getClosed(), 0, "a failed test keeps setup open for correction");
  assert.ok(notices.error.some((message) => message.includes("provider offline")));
} finally {
  globalThis.fetch = originalFetch;
  console.error = originalError;
}

console.log("provider-setup.test.mjs: setup save assertions passed");
