export const MODULE_ID = "simplypf2e";

export const SETTINGS = {
  apiBaseUrl: "apiBaseUrl",
  apiKey: "apiKey",
  apiKeyBaseUrl: "apiKeyBaseUrl",
  model: "model",
  temperature: "temperature",
  maxTokens: "maxTokens",
  requestTimeout: "requestTimeout",
  sourcePacks: "sourcePacks",
  customPresets: "customPresets",
  freeArchetype: "freeArchetype"
};

export function registerSettings(SourcesConfigApp) {
  game.settings.registerMenu(MODULE_ID, "sourcesMenu", {
    name: "SIMPLYPF2E.Sources.MenuName",
    label: "SIMPLYPF2E.Sources.MenuLabel",
    hint: "SIMPLYPF2E.Sources.MenuHint",
    icon: "fa-solid fa-book-atlas",
    type: SourcesConfigApp,
    restricted: true
  });

  // Per-category pack selection, managed by the Compendium Sources menu.
  // An unset or empty category means "use the PF2e system defaults".
  game.settings.register(MODULE_ID, SETTINGS.sourcePacks, {
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  // GM-created generation presets, managed from the generator dialog.
  game.settings.register(MODULE_ID, SETTINGS.customPresets, {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  // Security binding for the client-scoped key. This is deliberately a new,
  // hidden setting rather than an automatic migration: existing keys have no
  // trustworthy record of which endpoint they belonged to, so they stay
  // unbound until the user authorizes it for the current endpoint.
  game.settings.register(MODULE_ID, SETTINGS.apiKeyBaseUrl, {
    scope: "client",
    config: false,
    type: String,
    default: ""
  });

  game.settings.register(MODULE_ID, SETTINGS.apiBaseUrl, {
    name: "SIMPLYPF2E.Settings.ApiBaseUrl.Name",
    hint: "SIMPLYPF2E.Settings.ApiBaseUrl.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: "https://api.deepseek.com/v1",
    onChange: clearApiKeyBindingForChangedBaseUrl
  });

  // Client scope on purpose: a world-scope setting syncs to every connected
  // client, letting any player read the key via game.settings.get. A changed
  // key stays disabled until the user confirms the exact rendered endpoint.
  game.settings.register(MODULE_ID, SETTINGS.apiKey, {
    name: "SIMPLYPF2E.Settings.ApiKey.Name",
    hint: "SIMPLYPF2E.Settings.ApiKey.Hint",
    scope: "client",
    config: true,
    restricted: true,
    type: String,
    default: "",
    onChange: clearApiKeyBindingForChangedKey
  });

  game.settings.register(MODULE_ID, SETTINGS.model, {
    name: "SIMPLYPF2E.Settings.Model.Name",
    hint: "SIMPLYPF2E.Settings.Model.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: "deepseek-v4-flash"
  });

  game.settings.register(MODULE_ID, SETTINGS.temperature, {
    name: "SIMPLYPF2E.Settings.Temperature.Name",
    hint: "SIMPLYPF2E.Settings.Temperature.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: Number,
    range: { min: 0, max: 2, step: 0.1 },
    default: 0.8
  });

  game.settings.register(MODULE_ID, SETTINGS.maxTokens, {
    name: "SIMPLYPF2E.Settings.MaxTokens.Name",
    hint: "SIMPLYPF2E.Settings.MaxTokens.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: Number,
    default: 8000
  });

  game.settings.register(MODULE_ID, SETTINGS.requestTimeout, {
    name: "SIMPLYPF2E.Settings.RequestTimeout.Name",
    hint: "SIMPLYPF2E.Settings.RequestTimeout.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: Number,
    default: 90
  });

  // Free Archetype variant rule: a GM campaign-rule choice, so world-scoped
  // and restricted. When on, generated PCs get an extra archetype class-feat
  // slot at every even level (issue #64 item 4b).
  game.settings.register(MODULE_ID, SETTINGS.freeArchetype, {
    name: "SIMPLYPF2E.Settings.FreeArchetype.Name",
    hint: "SIMPLYPF2E.Settings.FreeArchetype.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: Boolean,
    default: false
  });
}

export function getSetting(key) {
  return game.settings.get(MODULE_ID, key);
}

/**
 * Normalize the configured API root for both requests and key binding.
 * The path remains significant: two gateways on one origin must not share a
 * credential merely because their host is the same.
 */
export function normalizeApiBaseUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.href.replace(/\/+$/, "");
  } catch {
    // Preserve compatibility with the old free-form setting. fetch() will
    // still surface a useful network error if the value is not a valid URL.
    return raw.replace(/\/+$/, "");
  }
}

/** True only for DeepSeek's first-party API hostname. */
export function isOfficialDeepSeekEndpoint(value) {
  try {
    const host = new URL(normalizeApiBaseUrl(value)).hostname.toLowerCase().replace(/\.$/, "");
    return host === "api.deepseek.com";
  } catch {
    return false;
  }
}

/** True only for OpenAI's first-party API hostname. */
export function isOfficialOpenAIEndpoint(value) {
  try {
    const host = new URL(normalizeApiBaseUrl(value)).hostname.toLowerCase().replace(/\.$/, "");
    return host === "api.openai.com";
  } catch {
    return false;
  }
}

/**
 * Preserve existing worlds after DeepSeek retired its legacy model aliases.
 * Custom gateways keep their configured identifiers unchanged because those
 * aliases may still be meaningful outside DeepSeek's first-party API.
 */
export function resolveProviderModel(baseUrl, value) {
  const model = String(value ?? "").trim();
  if (
    isOfficialDeepSeekEndpoint(baseUrl)
    && (model === "deepseek-chat" || model === "deepseek-reasoner")
  ) {
    return "deepseek-v4-flash";
  }
  return model;
}

/** True for common keyless Ollama/LM Studio and local gateway addresses. */
export function isLikelyKeylessLocalEndpoint(value) {
  try {
    const url = new URL(normalizeApiBaseUrl(value));
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
    if (host === "::1" || (host.includes(":") && /^(?:fc|fd|fe80:)/.test(host))) return true;
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
    const match172 = /^172\.(\d{1,3})\./.exec(host);
    return Boolean(match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31);
  } catch {
    return false;
  }
}

/**
 * Compact provider metadata for the generator header. This is deliberately
 * inferred from the endpoint instead of stored as a second provider setting,
 * so custom OpenAI-compatible gateways remain first-class and cannot drift
 * out of sync with the URL that actually receives requests.
 */
export function describeProvider(baseUrl, model = "") {
  const normalized = normalizeApiBaseUrl(baseUrl);
  const configuredModel = String(model ?? "").trim();
  if (!normalized) {
    return { id: "missing", name: "Not configured", local: false, model: configuredModel };
  }
  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
    const port = url.port || (url.protocol === "https:" ? "443" : "80");
    if (host === "api.openai.com") return { id: "openai", name: "OpenAI", local: false, model: configuredModel };
    if (host === "api.deepseek.com") return { id: "deepseek", name: "DeepSeek", local: false, model: configuredModel };
    if (host === "openrouter.ai") return { id: "openrouter", name: "OpenRouter", local: false, model: configuredModel };
    const local = isLikelyKeylessLocalEndpoint(normalized);
    if (local && port === "11434") return { id: "ollama", name: "Ollama", local: true, model: configuredModel };
    if (local && port === "1234") return { id: "lmstudio", name: "LM Studio", local: true, model: configuredModel };
    return {
      id: local ? "local" : "custom",
      name: local ? "Local provider" : "Custom provider",
      local,
      model: configuredModel
    };
  } catch {
    return { id: "custom", name: "Custom provider", local: false, model: configuredModel };
  }
}

/**
 * Read provider authentication without exposing an unbound key to callers.
 * `apiKey` is non-empty only when its stored binding exactly matches baseUrl.
 */
export function getProviderRequestConfig() {
  const baseUrl = normalizeApiBaseUrl(getSetting(SETTINGS.apiBaseUrl));
  const model = String(getSetting(SETTINGS.model) ?? "").trim();
  const configuredApiKey = String(getSetting(SETTINGS.apiKey) ?? "").trim();
  const apiKeyBaseUrl = normalizeApiBaseUrl(getSetting(SETTINGS.apiKeyBaseUrl));
  const apiKeyIsBound = Boolean(configuredApiKey && baseUrl && apiKeyBaseUrl === baseUrl);
  return {
    baseUrl,
    apiKey: apiKeyIsBound ? configuredApiKey : "",
    hasConfiguredApiKey: Boolean(configuredApiKey),
    apiKeyIsBound,
    keylessLocal: isLikelyKeylessLocalEndpoint(baseUrl),
    model,
    provider: describeProvider(baseUrl, model)
  };
}

/** Localization key for a useful provider-auth warning, or null when ready. */
export function getProviderAuthWarningKey(
  state = getProviderRequestConfig(),
  pageProtocol = globalThis.location?.protocol
) {
  if (!state.baseUrl) return "SIMPLYPF2E.Errors.NoBaseUrl";
  if (!String(state.model ?? "").trim()) return "SIMPLYPF2E.Errors.NoModel";
  if (state.hasConfiguredApiKey && !state.apiKeyIsBound) {
    return "SIMPLYPF2E.Generator.ApiKeyNotAuthorized";
  }
  if (!state.hasConfiguredApiKey && !state.keylessLocal) {
    return "SIMPLYPF2E.Generator.NoApiKey";
  }
  try {
    if (pageProtocol === "https:" && new URL(state.baseUrl).protocol === "http:") {
      return "SIMPLYPF2E.Errors.MixedContentProvider";
    }
  } catch {
    // Invalid URLs are surfaced by fetch with the ordinary network guidance.
  }
  return null;
}

/**
 * Explicitly authorize the currently stored client key for the endpoint the
 * user was shown. The expected endpoint is checked before and after writing
 * the binding so a concurrent world-setting change fails closed.
 */
export async function authorizeApiKeyForCurrentBaseUrl(expectedBaseUrl) {
  const apiKey = String(getSetting(SETTINGS.apiKey) ?? "").trim();
  const baseUrl = normalizeApiBaseUrl(getSetting(SETTINGS.apiBaseUrl));
  const expected = normalizeApiBaseUrl(expectedBaseUrl);
  if (!apiKey || !baseUrl || !expected || baseUrl !== expected) return false;
  await game.settings.set(MODULE_ID, SETTINGS.apiKeyBaseUrl, baseUrl);
  if (normalizeApiBaseUrl(getSetting(SETTINGS.apiBaseUrl)) !== expected) {
    await game.settings.set(MODULE_ID, SETTINGS.apiKeyBaseUrl, "");
    return false;
  }
  return true;
}

async function clearApiKeyBindingForChangedKey() {
  if (getSetting(SETTINGS.apiKeyBaseUrl)) {
    await game.settings.set(MODULE_ID, SETTINGS.apiKeyBaseUrl, "");
  }
}

async function clearApiKeyBindingForChangedBaseUrl(value) {
  const nextBaseUrl = normalizeApiBaseUrl(value);
  const boundBaseUrl = normalizeApiBaseUrl(getSetting(SETTINGS.apiKeyBaseUrl));
  if (boundBaseUrl && boundBaseUrl !== nextBaseUrl) {
    await game.settings.set(MODULE_ID, SETTINGS.apiKeyBaseUrl, "");
  }
}
