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
  const submitButton = makeButton("submit");
  submitButton.disabled = false;
  submitButton.querySelector = () => null;
  const controls = new Map([
    ["[name='apiBaseUrl']", { value: baseUrl, disabled: false }],
    ["[name='model']", { value: model, disabled: false }],
    ["[name='apiKey']", { value: apiKey, disabled: false }],
    ["[name='clearApiKey']", { checked: clearApiKey, disabled: false }],
    ["button[type='submit']", submitButton]
  ]);
  app.element = {
    querySelector: (selector) => controls.get(selector) ?? null,
    querySelectorAll: () => [...controls.values()],
    setAttribute: () => {},
    removeAttribute: () => {}
  };
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
  const modelInput = { value: model, disabled: false };
  const apiKeyInput = { value: "", disabled: false };
  const clearKeyInput = { checked: false, disabled: false };
  const inputListeners = new Map();
  const baseControl = {
    value: baseUrl,
    disabled: false,
    addEventListener: (name, callback) => inputListeners.set(name, callback)
  };
  const controls = new Map([
    ["[name='apiBaseUrl']", baseControl],
    ["[name='model']", modelInput],
    ["[name='apiKey']", apiKeyInput],
    ["[name='clearApiKey']", clearKeyInput],
    ["button[type='submit']", otherButton]
  ]);
  const interactiveControls = [target, otherButton, baseControl, modelInput, apiKeyInput, clearKeyInput];
  const attributes = new Map();
  app.element = {
    querySelector: (selector) => controls.get(selector) ?? null,
    querySelectorAll: (selector) => selector === "button, input, select, textarea" ? interactiveControls : [],
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name)
  };
  app.close = async () => {
    closed += 1;
    // ApplicationV2 clears its element during close. Save & Test must still
    // complete its finally cleanup without dereferencing the destroyed dialog.
    app.element = null;
  };
  return {
    app, target,
    getSaved: () => saved,
    getClosed: () => closed,
    controls: interactiveControls,
    getAttribute: (name) => attributes.get(name),
    changeBaseUrl: (value) => {
      baseControl.value = value;
      inputListeners.get("input")?.({ currentTarget: baseControl });
    }
  };
};

try {
  setCurrent({ baseUrl: "http://localhost:11434/v1", model: "qwen3:8b", apiKey: "", bound: "" });
  const success = makeSaveTestApp({ baseUrl: "http://localhost:11434/v1", model: "qwen3:8b" });
  globalThis.fetch = async () => {
    assert.ok(success.controls.every((control) => control.disabled === true), "save-and-test freezes every setup control during the request");
    assert.equal(success.getAttribute("aria-busy"), "true", "save-and-test exposes its busy state");
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }],
      usage: { prompt_tokens: 6, completion_tokens: 3, total_tokens: 9 }
    }), { headers: { "content-type": "application/json" } });
  };
  await ProviderSetupApp.DEFAULT_OPTIONS.actions.saveAndTest.call(success.app, null, success.target);
  assert.equal(success.getSaved(), 1, "save-and-test must refresh the calling generator after saving");
  assert.equal(success.getClosed(), 1, "a successful connection test closes setup");
  assert.equal(success.target.disabled, false, "the test action restores its button state");
  assert.ok(success.controls.every((control) => control.disabled === false), "save-and-test restores every setup control");
  assert.equal(success.getAttribute("aria-busy"), undefined, "save-and-test clears its busy state");
  assert.ok(notices.info.some((message) => message.includes("SIMPLYPF2E.ProviderSetup.TestSuccess")));

  setCurrent({ baseUrl: "http://localhost:11434/v1", model: "", apiKey: "", bound: "" });
  const discovery = makeSaveTestApp({ baseUrl: "http://localhost:11434/v1", model: "" });
  globalThis.fetch = async () => {
    assert.ok(discovery.controls.every((control) => control.disabled === true), "model discovery freezes every setup control during the request");
    assert.equal(discovery.getAttribute("aria-busy"), "true", "model discovery exposes its busy state");
    return new Response(JSON.stringify({ data: [
      { id: "qwen3:8b" }, { id: "gemma3:4b" }
    ] }), { headers: { "content-type": "application/json" } });
  };
  await ProviderSetupApp.DEFAULT_OPTIONS.actions.loadModels.call(discovery.app, null, discovery.target);
  assert.equal(discovery.getSaved(), 1, "model discovery saves the displayed endpoint before requesting it");
  assert.equal(discovery.getClosed(), 0, "model discovery keeps setup open for selection");
  assert.ok(discovery.controls.every((control) => control.disabled === false), "model discovery restores every setup control");
  assert.deepEqual(
    (await discovery.app._prepareContext()).availableModels,
    ["gemma3:4b", "qwen3:8b"],
    "discovered identifiers become editable datalist suggestions"
  );
  assert.ok(notices.info.some((message) => message.includes("SIMPLYPF2E.ProviderSetup.ModelsLoaded")));
  discovery.app._onRender();
  discovery.changeBaseUrl("http://localhost:1234/v1");
  assert.deepEqual(
    (await discovery.app._prepareContext()).availableModels,
    [],
    "manually changing the endpoint clears model suggestions from the previous provider"
  );

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
