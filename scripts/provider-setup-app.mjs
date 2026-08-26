import {
  MODULE_ID, SETTINGS, authorizeApiKeyForCurrentBaseUrl,
  describeProvider, getProviderAuthWarningKey, getProviderRequestConfig, normalizeApiBaseUrl
} from "./settings.mjs";
import { listProviderModels, testProviderConnection } from "./ai.mjs";

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
  #availableModels = [];

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
      loadModels: ProviderSetupApp.#onLoadModels,
      saveAndTest: ProviderSetupApp.#onSaveAndTest,
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
      availableModels: this.#availableModels,
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

  static async #saveSettings({ notify = true, requireModel = true } = {}) {
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
    if (requireModel && !model) throw new Error(game.i18n.localize("SIMPLYPF2E.Errors.NoModel"));

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
    if (notify) {
      const notifySaved = !authorized && !state.keylessLocal
        ? ui.notifications.warn.bind(ui.notifications)
        : ui.notifications.info.bind(ui.notifications);
      notifySaved(game.i18n.format(
        messageKey,
        { provider: provider.name, model }
      ));
    }
    await this.#onSaved?.();
    return { provider, model, state };
  }

  static async #onSubmit() {
    await ProviderSetupApp.#saveSettings.call(this);
  }

  /** Save/bind the displayed endpoint first, then populate model suggestions. */
  static async #onLoadModels(_event, target) {
    if (target.disabled) return;
    const buttons = [...new Set([target, ...this.element.querySelectorAll("button")])];
    const icon = target.querySelector("i");
    const originalClass = icon?.className;
    for (const button of buttons) button.disabled = true;
    if (icon) icon.className = "fa-solid fa-spinner fa-spin";
    try {
      const { state } = await ProviderSetupApp.#saveSettings.call(this, {
        notify: false,
        requireModel: false
      });
      const warningKey = getProviderAuthWarningKey(
        state, globalThis.location?.protocol, false
      );
      if (warningKey) throw new Error(game.i18n.localize(warningKey));
      this.#availableModels = await listProviderModels();
      await this.render();
      ui.notifications.info(game.i18n.format("SIMPLYPF2E.ProviderSetup.ModelsLoaded", {
        count: this.#availableModels.length
      }));
    } catch (err) {
      console.error("simplypf2e | provider model discovery failed", err);
      ui.notifications.error(game.i18n.format("SIMPLYPF2E.ProviderSetup.ModelsFailed", {
        message: err?.message ?? String(err)
      }));
    } finally {
      for (const button of buttons) button.disabled = false;
      if (icon && originalClass) icon.className = originalClass;
    }
  }

  /** Save first, then exercise the exact production request path. */
  static async #onSaveAndTest(_event, target) {
    if (target.disabled) return;
    const buttons = [...this.element.querySelectorAll("footer button")];
    const icon = target.querySelector("i");
    const originalClass = icon?.className;
    for (const button of buttons) button.disabled = true;
    if (icon) icon.className = "fa-solid fa-spinner fa-spin";
    try {
      const { provider, model, state } = await ProviderSetupApp.#saveSettings.call(this, { notify: false });
      const warningKey = getProviderAuthWarningKey(state);
      if (warningKey) throw new Error(game.i18n.localize(warningKey));
      const usage = await testProviderConnection();
      ui.notifications.info(game.i18n.format("SIMPLYPF2E.ProviderSetup.TestSuccess", {
        provider: provider.name,
        model,
        total: usage.total.toLocaleString()
      }));
      await this.close();
    } catch (err) {
      console.error("simplypf2e | provider save-and-test failed", err);
      ui.notifications.error(game.i18n.format("SIMPLYPF2E.ProviderSetup.TestFailed", {
        message: err?.message ?? String(err)
      }));
    } finally {
      for (const button of buttons) button.disabled = false;
      if (icon && originalClass) icon.className = originalClass;
    }
  }

  static async #onCancel() {
    await this.close();
  }
}
