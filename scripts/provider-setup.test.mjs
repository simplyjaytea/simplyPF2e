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
globalThis.ui = { notifications: { info: () => {}, warn: () => {} } };

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

console.log("provider-setup.test.mjs: setup save assertions passed");
