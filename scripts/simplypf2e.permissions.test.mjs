// The visible Actors-directory entry is GM-only; the public module API must
// enforce the same boundary so a player cannot open a misleading generator or
// hidden item-forge surface from the browser console.
// Run: node scripts/simplypf2e.permissions.test.mjs
import assert from "node:assert/strict";

let renders = 0;
class FakeApplicationV2 {
  render() { renders += 1; }
}

globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: FakeApplicationV2,
      HandlebarsApplicationMixin: (Base) => class extends Base {}
    },
    handlebars: { loadTemplates: () => {} }
  }
};
globalThis.HTMLElement = class {};
globalThis.Handlebars = { helpers: {}, registerHelper: () => {} };

const onceHooks = new Map();
globalThis.Hooks = {
  once: (name, callback) => onceHooks.set(name, callback),
  on: () => {}
};

const moduleRecord = {};
const notices = { warn: [], error: [] };
globalThis.game = {
  system: { id: "pf2e" },
  user: { id: "player", isGM: false },
  modules: new Map([["simplypf2e", moduleRecord]]),
  i18n: { localize: (key) => key }
};
globalThis.ui = { notifications: {
  warn: (message) => notices.warn.push(message),
  error: (message) => notices.error.push(message)
} };

await import("./simplypf2e.mjs");
await onceHooks.get("ready")();

assert.equal(moduleRecord.api.open(), null, "a player cannot open the generator through the public API");
assert.equal(moduleRecord.api.openItemForge(), null, "a player cannot open the hidden item forge through the public API");
assert.equal(renders, 0, "denied API calls must not instantiate or render an app");
assert.equal(notices.warn.length, 2);
assert.ok(notices.warn.every((message) => message === "SIMPLYPF2E.Errors.GMOnly"));

game.user = { id: "gm", isGM: true };
assert.ok(moduleRecord.api.open(), "a GM can open the generator through the public API");
assert.ok(moduleRecord.api.openItemForge(), "a GM retains the documented item-forge console access");
assert.equal(renders, 2);

game.system.id = "dnd5e";
assert.equal(moduleRecord.api.open(), null, "the API also fails closed outside PF2e");
assert.equal(renders, 2);
assert.deepEqual(notices.error, ["SIMPLYPF2E.Errors.WrongSystem"]);

console.log("simplypf2e.permissions.test.mjs: public API permission assertions passed");
