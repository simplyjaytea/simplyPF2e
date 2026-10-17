// /forge through the real module entry: the registered chat command, GeneratorApp's
// public request, the production provider request builder and the setting
// registration. Foundry globals and the network edge are replaced; no provider is
// contacted. Run: node scripts/simplypf2e.forgeChat.test.mjs
import assert from "node:assert/strict";

const chatCommands = {};
const registeredSettings = new Map();
const storedSettings = new Map();
const hooks = { once: new Map(), on: new Map() };
const moduleRecord = {};
const notices = { warn: [], error: [] };
const logs = [];
const providerCalls = [];
let holdProvider = null;

class FakeApplicationV2 {
  render() { return Promise.resolve(this); }
  async close() {}
}
globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: FakeApplicationV2,
      HandlebarsApplicationMixin: (Base) => class extends Base {}
    },
    handlebars: { loadTemplates: () => {} },
    sidebar: { tabs: { ChatLog: { CHAT_COMMANDS: chatCommands } } }
  }
};
globalThis.Handlebars = { helpers: {}, registerHelper: () => {} };
globalThis.Hooks = {
  once: (name, callback) => hooks.once.set(name, callback),
  on: (name, callback) => hooks.on.set(name, callback)
};
globalThis.game = {
  system: { id: "pf2e" },
  user: { id: "gm", isGM: true },
  modules: new Map([["simplypf2e", moduleRecord]]),
  i18n: { localize: (key) => key, format: (key) => key },
  settings: {
    register(moduleId, key, data) { registeredSettings.set(`${moduleId}.${key}`, data); },
    registerMenu() {},
    get(moduleId, key) {
      const id = `${moduleId}.${key}`;
      if (storedSettings.has(id)) return storedSettings.get(id);
      // Like Foundry, an unregistered setting cannot be read; a registered one returns its default.
      if (!registeredSettings.has(id)) throw new Error(`Setting ${id} is not registered`);
      return structuredClone(registeredSettings.get(id).default);
    },
    async set(moduleId, key, value) { storedSettings.set(`${moduleId}.${key}`, value); return value; }
  }
};
globalThis.ui = { notifications: {
  info() {},
  warn: (message) => notices.warn.push(message),
  error: (message) => notices.error.push(message)
} };
// The network edge: record the request, then fail as an unreachable provider would.
globalThis.fetch = async (url, init) => {
  providerCalls.push({ url, body: JSON.parse(init.body) });
  if (holdProvider) await holdProvider;
  throw new TypeError("provider unreachable in this test");
};
console.error = (...args) => logs.push(args);
console.warn = (...args) => logs.push(args);

await import("./simplypf2e.mjs");
hooks.once.get("init")();

// The setting exists for GMs, is visible, and is off unless a GM turns it on.
const setting = registeredSettings.get("simplypf2e.experimentalTools");
assert.deepEqual(
  { scope: setting.scope, config: setting.config, restricted: setting.restricted, type: setting.type, default: setting.default },
  { scope: "world", config: true, restricted: true, type: Boolean, default: false },
  "the experimental setting is a visible, GM-restricted, world-scoped Boolean that defaults to off"
);

// Provider configuration bound to its endpoint, as a GM would have saved it.
const BASE = "https://api.deepseek.com/v1";
storedSettings.set("simplypf2e.apiBaseUrl", BASE);
storedSettings.set("simplypf2e.apiKey", "test-key");
storedSettings.set("simplypf2e.apiKeyBaseUrl", BASE);
storedSettings.set("simplypf2e.model", "deepseek-v4-flash");

hooks.once.get("ready")();
assert.ok(chatCommands["simplypf2e-forge"], "/forge is registered in PF2e");
const forge = moduleRecord.api.open();

// Emulates ChatLog's documented dispatch: registered patterns are matched in
// insertion order, and a callback returning false keeps the typed line out of the log.
function typeChat(text) {
  for (const [name, command] of Object.entries(chatCommands)) {
    const match = command.rgx.exec(text);
    if (match) return command.fn.call(null, name, match, {}, {}) === false ? "suppressed" : "posted";
  }
  return "posted";
}

async function settle(predicate, label) {
  for (let i = 0; i < 500; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(`timed out waiting for ${label}`);
}

// Ordinary chat is never claimed by the module, even while /forge is registered.
assert.equal(typeChat("Hello table, the hag cackles."), "posted");
assert.equal(typeChat("/roll 1d20"), "posted");
assert.equal(providerCalls.length, 0);

// Off by default: the command is consumed, the GM is told why, and no provider call happens.
assert.equal(typeChat("/forge swamp hag 6"), "suppressed");
assert.deepEqual(notices.warn, ["SIMPLYPF2E.Experimental.Disabled"]);
assert.equal(providerCalls.length, 0, "a disabled gate never reaches the provider");
notices.warn.length = 0;

// Enabled: the whitespace-tolerant command starts one Monster request with the
// typed brief and level, reaching the production request builder.
storedSettings.set("simplypf2e.experimentalTools", true);
assert.equal(typeChat("/forge   swamp hag\n 6 "), "suppressed");
await settle(() => providerCalls.length === 1 && forge._progress?.status === "error", "the first request settles");
const sent = providerCalls[0].body.messages[1].content;
assert.equal(providerCalls[0].url, `${BASE}/chat/completions`);
assert.match(sent, /^Generate a combat-ready Pathfinder 2e monster\./);
assert.ok(sent.includes("Creature level: 6"), "the typed level reaches the provider prompt");
assert.ok(sent.includes("Concept from the GM: swamp hag"), "the brief is normalized and reaches the provider prompt");
assert.ok(!sent.includes("Build preset"), "an explicit /forge brief ignores the selected preset");
assert.deepEqual(notices.warn, [], "a provider failure is shown in the generator, not as a toast");

// The preview option uses the same pipeline and request; it differs only in
// whether the run may create an actor, which the app-level suite proves.
const beforePreview = providerCalls.length;
assert.equal(typeChat("/forge --preview swamp hag 6"), "suppressed");
await settle(() => providerCalls.length === beforePreview + 1 && forge._progress.status === "error", "the preview request settles");
assert.ok(providerCalls.at(-1).body.messages[1].content.includes("Concept from the GM: swamp hag"));

// Malformed commands are reported and consume the line. They start no run, so the
// progress object and the provider are both left exactly as they were.
const beforeMalformed = { calls: providerCalls.length, progress: forge._progress };
const malformed = [
  ["/forge", "SIMPLYPF2E.Chat.ForgeUsage"],
  ["/forge 6", "SIMPLYPF2E.Chat.ForgeNoBrief"],
  ["/forge swamp hag", "SIMPLYPF2E.Chat.ForgeLevel"],
  ["/forge swamp hag 25", "SIMPLYPF2E.Chat.ForgeLevel"],
  ["/forge swamp --preview hag 6", "SIMPLYPF2E.Chat.ForgeOption"]
];
for (const [text, key] of malformed) {
  notices.warn.length = 0;
  assert.equal(typeChat(text), "suppressed", text);
  assert.equal(notices.warn.at(-1), key, text);
}
assert.equal(providerCalls.length, beforeMalformed.calls, "malformed commands never reach the provider");
assert.equal(forge._progress, beforeMalformed.progress, "malformed commands start no run");

// Only the GM can use the command. A player's attempt is refused locally.
game.user = { id: "player", isGM: false };
notices.warn.length = 0;
assert.equal(typeChat("/forge swamp hag 6"), "suppressed");
assert.deepEqual(notices.warn, ["SIMPLYPF2E.Experimental.GMOnly"]);
assert.equal(providerCalls.length, beforeMalformed.calls, "a player's command never reaches the provider");
game.user = { id: "gm", isGM: true };

// A duplicate while a request is in flight is refused as busy. The provider sees
// exactly one request, and the first run settles normally afterwards.
const beforeDuplicate = providerCalls.length;
let releaseProvider;
holdProvider = new Promise((resolve) => { releaseProvider = resolve; });
assert.equal(typeChat("/forge swamp hag 6"), "suppressed");
await settle(() => providerCalls.length === beforeDuplicate + 1, "the held request is in flight");
notices.warn.length = 0;
assert.equal(typeChat("/forge swamp hag 6"), "suppressed");
assert.equal(typeChat("/forge --preview wyrm 9"), "suppressed");
assert.deepEqual(notices.warn, ["SIMPLYPF2E.Chat.ForgeBusy", "SIMPLYPF2E.Chat.ForgeBusy"]);
assert.equal(providerCalls.length, beforeDuplicate + 1, "duplicates never reach the provider");
holdProvider = null;
releaseProvider();
await settle(() => forge._progress.status === "error" && forge._progress !== beforeMalformed.progress, "the held run settles");

// Outside PF2e the module registers no chat command, so /forge is left to Foundry.
const otherChatLog = { CHAT_COMMANDS: {} };
foundry.applications.sidebar.tabs.ChatLog = otherChatLog;
game.system.id = "dnd5e";
hooks.once.get("ready")();
assert.deepEqual(otherChatLog.CHAT_COMMANDS, {}, "outside PF2e no chat command is registered");
assert.equal(moduleRecord.api.open(), null, "outside PF2e the public API stays closed");
game.system.id = "pf2e";

console.log("simplypf2e.forgeChat.test.mjs: registered /forge reaches the production request path and every refusal stays local");
