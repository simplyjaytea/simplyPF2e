import {
  MODULE_ID, SETTINGS, authorizeApiKeyForCurrentBaseUrl,
  describeProvider, getProviderRequestConfig, normalizeApiBaseUrl
} from "./settings.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export const PROVIDER_PRESETS = Object.freeze([
  { id: "deepseek", label: "DeepSeek", icon: "fa-cloud", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-v4-flash" },
  { id: "openai", label: "OpenAI", icon: "fa-cloud", baseUrl: "https://api.openai.com/v1", model: "gpt-5.6-luna" },
  { id: "openrouter", label: "OpenRouter", icon: "fa-cloud", baseUrl: "https://openrouter.ai/api/v1", model: "" },
  { id: "ollama", label: "Ollama", icon: "fa-server", baseUrl: "http://localhost:11434/v1", model: "" },
  { id: "lmstudio", label: "LM Studio", icon: "fa-server", baseUrl: "http://localhost:1234/v1", model: "" },
  { id: "custom", label: "Custom", icon: "fa-sliders", baseUrl: "", model: "", preserve: true }
]);

/** Focused provider setup, reachable both from module settings and the generator. */
export class ProviderSetupApp extends HandlebarsApplicationMixin(ApplicationV2) {
  #onSaved;
  #selectedPreset = null;

  constructor(options = {}, onSaved = null) {
    if (typeof options === "function") {
      onSaved = options;
      options = {};
    }
    super(options);
    this.#onSaved = typeof onSaved === "function" ? onSaved : null;
  }

  static DEFAULT_OPTIONS = {
    id: "simplypf2e-provider-setup",
    tag: "form",
    classes: ["simplypf2e"],
    window: {
      title: "SIMPLYPF2E.ProviderSetup.Title",
      icon: "fa-solid fa-plug-circle-check",
      resizable: true
    },
    position: { width: 520, height: "auto" },
    form: {
      handler: ProviderSetupApp.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true
    },
    actions: {
      chooseProvider: ProviderSetupApp.#onChooseProvider,
      cancel: ProviderSetupApp.#onCancel
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/provider-setup.hbs` }
  };

  async _prepareContext() {
    const state = getProviderRequestConfig();
    const inferred = PROVIDER_PRESETS.some((provider) => provider.id === state.provider.id)
      ? state.provider.id
      : "custom";
    const selected = this.#selectedPreset ?? inferred;
    return {
      providers: PROVIDER_PRESETS.map((provider) => ({
        ...provider,
        selected: provider.id === selected
      })),
      apiBaseUrl: state.baseUrl,
      model: state.model,
      hasApiKey: state.hasConfiguredApiKey,
      localServerHint: game.i18n.format("SIMPLYPF2E.ProviderSetup.LocalServerHint", {
        origin: globalThis.location?.origin ?? "Foundry"
      })
    };
  }

  static async #onChooseProvider(_event, target) {
    const preset = PROVIDER_PRESETS.find((entry) => entry.id === target.dataset.provider);
    if (!preset) return;
    this.#selectedPreset = preset.id;
    for (const button of this.element.querySelectorAll("[data-action='chooseProvider']")) {
      const active = button === target;
      button.classList.toggle("spf-provider-preset-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    if (!preset.preserve) {
      this.element.querySelector("[name='apiBaseUrl']").value = preset.baseUrl;
      this.element.querySelector("[name='model']").value = preset.model;
    }
  }

  static async #onSubmit() {
    const baseUrl = normalizeApiBaseUrl(this.element.querySelector("[name='apiBaseUrl']")?.value);
    const model = String(this.element.querySelector("[name='model']")?.value ?? "").trim();
    const enteredApiKey = String(this.element.querySelector("[name='apiKey']")?.value ?? "").trim();
    const clearApiKey = Boolean(this.element.querySelector("[name='clearApiKey']")?.checked);

    let parsed;
    try { parsed = new URL(baseUrl); }
    catch { throw new Error(game.i18n.localize("SIMPLYPF2E.ProviderSetup.InvalidBaseUrl")); }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(game.i18n.localize("SIMPLYPF2E.ProviderSetup.InvalidBaseUrl"));
    }
    if (!model) throw new Error(game.i18n.localize("SIMPLYPF2E.Errors.NoModel"));

    const currentBaseUrl = normalizeApiBaseUrl(game.settings.get(MODULE_ID, SETTINGS.apiBaseUrl));
    const baseChanged = currentBaseUrl !== baseUrl;
    await game.settings.set(MODULE_ID, SETTINGS.apiBaseUrl, baseUrl);
    await game.settings.set(MODULE_ID, SETTINGS.model, model);

    // A stored key belongs to its old endpoint. Switching providers without
    // entering a replacement clears it instead of silently offering that
    // secret for authorization against a different service.
    if (clearApiKey || baseChanged || enteredApiKey) {
      await game.settings.set(MODULE_ID, SETTINGS.apiKey, clearApiKey ? "" : enteredApiKey);
    }

    const configuredKey = String(game.settings.get(MODULE_ID, SETTINGS.apiKey) ?? "").trim();
    const authorized = configuredKey
      ? await authorizeApiKeyForCurrentBaseUrl(baseUrl)
      : false;
    const provider = describeProvider(baseUrl, model);
    const state = getProviderRequestConfig();
    const messageKey = authorized
      ? "SIMPLYPF2E.ProviderSetup.SavedAuthorized"
      : state.keylessLocal
        ? "SIMPLYPF2E.ProviderSetup.Saved"
        : "SIMPLYPF2E.ProviderSetup.SavedNeedsKey";
    const notify = !authorized && !state.keylessLocal
      ? ui.notifications.warn.bind(ui.notifications)
      : ui.notifications.info.bind(ui.notifications);
    notify(game.i18n.format(
      messageKey,
      { provider: provider.name, model }
    ));
    await this.#onSaved?.();
  }

  static async #onCancel() {
    await this.close();
  }
}
