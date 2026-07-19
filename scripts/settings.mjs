export const MODULE_ID = "simplypf2e";

export const SETTINGS = {
  apiBaseUrl: "apiBaseUrl",
  apiKey: "apiKey",
  model: "model",
  temperature: "temperature",
  maxTokens: "maxTokens",
  requestTimeout: "requestTimeout",
  sourcePacks: "sourcePacks",
  customPresets: "customPresets"
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
  game.settings.register(MODULE_ID, SETTINGS.apiBaseUrl, {
    name: "SIMPLYPF2E.Settings.ApiBaseUrl.Name",
    hint: "SIMPLYPF2E.Settings.ApiBaseUrl.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: "https://api.deepseek.com/v1"
  });

  // Client scope on purpose: a world-scope setting syncs to every connected
  // client, letting any player read the key via game.settings.get.
  game.settings.register(MODULE_ID, SETTINGS.apiKey, {
    name: "SIMPLYPF2E.Settings.ApiKey.Name",
    hint: "SIMPLYPF2E.Settings.ApiKey.Hint",
    scope: "client",
    config: true,
    restricted: true,
    type: String,
    default: ""
  });

  game.settings.register(MODULE_ID, SETTINGS.model, {
    name: "SIMPLYPF2E.Settings.Model.Name",
    hint: "SIMPLYPF2E.Settings.Model.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: "deepseek-chat"
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
}

export function getSetting(key) {
  return game.settings.get(MODULE_ID, key);
}
