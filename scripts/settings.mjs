export const MODULE_ID = "simplypf2e";

export const SETTINGS = {
  apiBaseUrl: "apiBaseUrl",
  apiKey: "apiKey",
  apiKeyBaseUrl: "apiKeyBaseUrl",
  model: "model",
  providerBank: "providerBank",
  temperature: "temperature",
  maxTokens: "maxTokens",
  requestTimeout: "requestTimeout",
  sourcePacks: "sourcePacks",
  customPresets: "customPresets",
  freeArchetype: "freeArchetype"
};

export function registerSettings(SourcesConfigApp, ProviderSetupApp) {
  if (ProviderSetupApp) {
    game.settings.registerMenu(MODULE_ID, "providerSetupMenu", {
      name: "SIMPLYPF2E.ProviderSetup.MenuName",
      label: "SIMPLYPF2E.ProviderSetup.MenuLabel",
      hint: "SIMPLYPF2E.ProviderSetup.MenuHint",
      icon: "fa-solid fa-plug-circle-check",
      type: ProviderSetupApp,
      restricted: true
    });
  }
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

  // Named connection profiles, including each profile's key and exact-URL
  // binding. Client-scoped so secrets stay in this browser and are never
  // world-synced. The ordinary settings form never renders this object.
  game.settings.register(MODULE_ID, SETTINGS.providerBank, {
    scope: "client",
    config: false,
    type: Object,
    default: { activeId: "", connections: [] }
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
    // ProviderSetupApp owns this value alongside the key and model. Keeping
    // it registered but hidden preserves saved worlds and script access
    // without presenting two competing configuration surfaces.
    config: false,
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
    // The ordinary settings form renders String values as visible text.
    // Keep credentials editable only through ProviderSetupApp, which uses a
    // password input and requires explicit endpoint authorization.
    config: false,
    restricted: true,
    type: String,
    default: "",
    onChange: clearApiKeyBindingForChangedKey
  });

  game.settings.register(MODULE_ID, SETTINGS.model, {
    name: "SIMPLYPF2E.Settings.Model.Name",
    hint: "SIMPLYPF2E.Settings.Model.Hint",
    scope: "world",
    // See apiBaseUrl above: provider identity is configured together in the
    // guided provider dialog, not piecemeal in ordinary module settings.
    config: false,
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

  // Free Archetype is a GM campaign-rule choice, so it is world-scoped and
  // restricted. The complete-only builder currently refuses level-2+ requests
  // while its feat prerequisite graph remains unvalidated; level 1 has no
  // variant slot and remains available.
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

/**
 * Resolve the configured API root (or an already-complete Chat Completions
 * endpoint) to the exact request URL. URL.pathname is changed instead of
 * concatenating strings so gateway query parameters remain in the right
 * place. The configured value itself remains the key-binding identity.
 */
export function chatCompletionsUrl(value) {
  const normalized = normalizeApiBaseUrl(value);
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    const path = url.pathname.replace(/\/+$/, "");
    if (!path.endsWith("/chat/completions")) {
      url.pathname = `${path}/chat/completions`;
    }
    url.hash = "";
    return url.href;
  } catch {
    // Preserve the old free-form setting's useful fetch error while avoiding
    // an obvious duplicate suffix when possible.
    return normalized.endsWith("/chat/completions")
      ? normalized
      : `${normalized}/chat/completions`;
  }
}

/** Resolve an API root or full Chat Completions endpoint to its model list. */
export function modelsUrl(value) {
  const normalized = normalizeApiBaseUrl(value);
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    let path = url.pathname.replace(/\/+$/, "");
    if (path.endsWith("/chat/completions")) {
      path = path.slice(0, -"/chat/completions".length);
    }
    if (!path.endsWith("/models")) url.pathname = `${path}/models`;
    url.hash = "";
    return url.href;
  } catch {
    return normalized.endsWith("/models") ? normalized : `${normalized}/models`;
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

function newConnectionId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `conn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function snapshotLiveProviderSettings() {
  return {
    apiBaseUrl: normalizeApiBaseUrl(getSetting(SETTINGS.apiBaseUrl)),
    model: String(getSetting(SETTINGS.model) ?? "").trim(),
    apiKey: String(getSetting(SETTINGS.apiKey) ?? "").trim(),
    apiKeyBaseUrl: normalizeApiBaseUrl(getSetting(SETTINGS.apiKeyBaseUrl))
  };
}

/** Display name inferred from the endpoint, used for the first migrated profile. */
export function defaultConnectionName(baseUrl, model = "") {
  const provider = describeProvider(baseUrl, model);
  return provider.id === "missing" ? "Default" : provider.name;
}

function normalizeProviderConnection(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id ?? "").trim();
  if (!id) return null;
  const apiBaseUrl = normalizeApiBaseUrl(raw.apiBaseUrl);
  const model = String(raw.model ?? "").trim();
  const name = String(raw.name ?? "").trim() || defaultConnectionName(apiBaseUrl, model);
  return {
    id,
    name,
    apiBaseUrl,
    model,
    apiKey: String(raw.apiKey ?? "").trim(),
    apiKeyBaseUrl: normalizeApiBaseUrl(raw.apiKeyBaseUrl)
  };
}

function readProviderBank() {
  let raw;
  try { raw = getSetting(SETTINGS.providerBank); }
  catch { raw = null; }
  const connections = Array.isArray(raw?.connections)
    ? raw.connections.map(normalizeProviderConnection).filter(Boolean)
    : [];
  let activeId = String(raw?.activeId ?? "").trim();
  if (!connections.some((connection) => connection.id === activeId)) {
    activeId = connections[0]?.id ?? "";
  }
  return { activeId, connections };
}

async function persistProviderBank(bank) {
  await game.settings.set(MODULE_ID, SETTINGS.providerBank, {
    activeId: bank.activeId,
    connections: bank.connections.map((connection) => ({
      id: connection.id,
      name: connection.name,
      apiBaseUrl: connection.apiBaseUrl,
      model: connection.model,
      apiKey: connection.apiKey,
      apiKeyBaseUrl: connection.apiKeyBaseUrl
    }))
  });
}

let applyingProviderConnection = false;

async function applyConnectionToSettings(connection) {
  applyingProviderConnection = true;
  try {
    await game.settings.set(MODULE_ID, SETTINGS.apiBaseUrl, connection.apiBaseUrl);
    await game.settings.set(MODULE_ID, SETTINGS.model, connection.model);
    await game.settings.set(MODULE_ID, SETTINGS.apiKey, connection.apiKey);
    await game.settings.set(MODULE_ID, SETTINGS.apiKeyBaseUrl, connection.apiKeyBaseUrl);
  } finally {
    applyingProviderConnection = false;
  }
}

/**
 * Seed the client connection bank from the legacy single endpoint/key/model
 * settings. Existing worlds keep working; the first setup or save creates one
 * named profile instead of inventing a second configuration.
 */
export async function ensureProviderBank() {
  const bank = readProviderBank();
  if (bank.connections.length) return bank;
  const snapshot = snapshotLiveProviderSettings();
  const connection = {
    id: newConnectionId(),
    name: defaultConnectionName(snapshot.apiBaseUrl, snapshot.model),
    ...snapshot
  };
  const next = { activeId: connection.id, connections: [connection] };
  await persistProviderBank(next);
  return next;
}

/** Compact named profiles for the setup list and generator header switch. */
export function listProviderConnections() {
  const bank = readProviderBank();
  return bank.connections.map((connection) => ({
    id: connection.id,
    name: connection.name,
    active: connection.id === bank.activeId
  }));
}

/** Write the live endpoint/key/model into the active named profile. */
export async function upsertActiveProviderConnection(patch = {}) {
  const bank = await ensureProviderBank();
  const active = bank.connections.find((connection) => connection.id === bank.activeId);
  if (!active) return null;
  Object.assign(active, snapshotLiveProviderSettings());
  if (patch.name !== undefined) {
    const name = String(patch.name ?? "").trim();
    if (name) active.name = name;
  }
  await persistProviderBank(bank);
  return active;
}

/**
 * Activate a stored profile. Live settings become that profile's endpoint,
 * model, key, and exact-URL binding; the previous live values are saved onto
 * the profile being left. Unknown ids fail closed.
 */
export async function selectProviderConnection(id) {
  const wanted = String(id ?? "").trim();
  if (!wanted) return false;
  const bank = await ensureProviderBank();
  const next = bank.connections.find((connection) => connection.id === wanted);
  if (!next) return false;
  if (bank.activeId === next.id) return true;
  const leaving = bank.connections.find((connection) => connection.id === bank.activeId);
  if (leaving) Object.assign(leaving, snapshotLiveProviderSettings());
  bank.activeId = next.id;
  await persistProviderBank(bank);
  await applyConnectionToSettings(next);
  return true;
}

/**
 * Add a named profile and make it active. New profiles start with no key —
 * they never copy a secret from a different endpoint.
 */
export async function createProviderConnection({ name, apiBaseUrl, model } = {}) {
  const bank = await ensureProviderBank();
  const leaving = bank.connections.find((connection) => connection.id === bank.activeId);
  if (leaving) Object.assign(leaving, snapshotLiveProviderSettings());
  const snapshot = {
    apiBaseUrl: normalizeApiBaseUrl(apiBaseUrl),
    model: String(model ?? "").trim(),
    apiKey: "",
    apiKeyBaseUrl: ""
  };
  const connection = {
    id: newConnectionId(),
    name: String(name ?? "").trim() || defaultConnectionName(snapshot.apiBaseUrl, snapshot.model),
    ...snapshot
  };
  bank.connections.push(connection);
  bank.activeId = connection.id;
  await persistProviderBank(bank);
  await applyConnectionToSettings(connection);
  return connection;
}

/** Rename a stored profile. Empty names fail closed. */
export async function renameProviderConnection(id, name) {
  const wanted = String(id ?? "").trim();
  const nextName = String(name ?? "").trim();
  if (!wanted || !nextName) return false;
  const bank = await ensureProviderBank();
  const connection = bank.connections.find((entry) => entry.id === wanted);
  if (!connection) return false;
  connection.name = nextName;
  await persistProviderBank(bank);
  return true;
}

/**
 * Remove a stored profile. The last remaining profile cannot be deleted.
 * Deleting the active profile activates another stored connection.
 */
export async function deleteProviderConnection(id) {
  const wanted = String(id ?? "").trim();
  if (!wanted) return false;
  const bank = await ensureProviderBank();
  if (bank.connections.length < 2) return false;
  const remaining = bank.connections.filter((connection) => connection.id !== wanted);
  if (remaining.length === bank.connections.length) return false;
  const wasActive = bank.activeId === wanted;
  bank.connections = remaining;
  if (wasActive) {
    bank.activeId = remaining[0].id;
    await persistProviderBank(bank);
    await applyConnectionToSettings(remaining[0]);
  } else {
    await persistProviderBank(bank);
  }
  return true;
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
  const provider = describeProvider(baseUrl, model);
  const bank = readProviderBank();
  const active = bank.connections.find((connection) => connection.id === bank.activeId) ?? null;
  return {
    baseUrl,
    apiKey: apiKeyIsBound ? configuredApiKey : "",
    hasConfiguredApiKey: Boolean(configuredApiKey),
    apiKeyIsBound,
    keylessLocal: isLikelyKeylessLocalEndpoint(baseUrl),
    model,
    provider,
    connectionId: active?.id ?? "",
    connectionName: active?.name || provider.name,
    connections: bank.connections.map((connection) => ({
      id: connection.id,
      name: connection.name,
      active: connection.id === bank.activeId
    }))
  };
}

/** Localization key for a useful provider-auth warning, or null when ready. */
export function getProviderAuthWarningKey(
  state = getProviderRequestConfig(),
  pageProtocol = globalThis.location?.protocol,
  requireModel = true
) {
  if (!state.baseUrl) return "SIMPLYPF2E.Errors.NoBaseUrl";
  if (requireModel && !String(state.model ?? "").trim()) return "SIMPLYPF2E.Errors.NoModel";
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
    await upsertActiveProviderConnection();
    return false;
  }
  await upsertActiveProviderConnection();
  return true;
}

async function clearApiKeyBindingForChangedKey() {
  if (applyingProviderConnection) return;
  if (getSetting(SETTINGS.apiKeyBaseUrl)) {
    await game.settings.set(MODULE_ID, SETTINGS.apiKeyBaseUrl, "");
  }
}

async function clearApiKeyBindingForChangedBaseUrl(value) {
  if (applyingProviderConnection) return;
  const nextBaseUrl = normalizeApiBaseUrl(value);
  const boundBaseUrl = normalizeApiBaseUrl(getSetting(SETTINGS.apiKeyBaseUrl));
  if (boundBaseUrl && boundBaseUrl !== nextBaseUrl) {
    await game.settings.set(MODULE_ID, SETTINGS.apiKeyBaseUrl, "");
  }
}
