// Experimental-tool gate: system, then GM, then the world setting, with the
// setting enabled only by a real boolean true and every read failure closed.
// Run: node scripts/experimental-tools.test.mjs
import assert from "node:assert/strict";

const stored = new Map();
let readFailure = null;
const game = {
  system: { id: "pf2e" },
  user: { isGM: true },
  settings: {
    get(moduleId, key) {
      if (readFailure) throw readFailure;
      return stored.get(`${moduleId}.${key}`);
    }
  },
  i18n: { localize: (key) => `localized:${key}` }
};
globalThis.game = game;

const { EXPERIMENTAL_REFUSAL, assertExperimentalToolAccess, experimentalToolRefusal, experimentalToolsEnabled } =
  await import("./experimental-tools.mjs");
const SETTING = "simplypf2e.experimentalTools";

// Off by default: an unset setting, which has a registered default of false, refuses.
assert.equal(experimentalToolsEnabled(), false);
assert.deepEqual(experimentalToolRefusal(), { code: "disabled", localizeKey: "SIMPLYPF2E.Experimental.Disabled" });

// Only the exact boolean true enables tools. Truthy look-alikes stay closed.
for (const value of ["true", 1, "1", {}, null, undefined]) {
  stored.set(SETTING, value);
  assert.equal(experimentalToolsEnabled(), false, `${JSON.stringify(value)} does not enable tools`);
}
stored.set(SETTING, true);
assert.equal(experimentalToolRefusal(), null);
assert.equal(assertExperimentalToolAccess(), undefined);

// Requirements are checked in order, so a refusal names the earliest blocker.
game.system.id = "dnd5e";
assert.equal(experimentalToolRefusal().code, EXPERIMENTAL_REFUSAL.WRONG_SYSTEM, "outside PF2e even an enabled setting refuses");
game.system.id = "pf2e";
game.user.isGM = false;
assert.equal(experimentalToolRefusal().code, EXPERIMENTAL_REFUSAL.NOT_GM, "a player is refused even when the setting is on");
stored.set(SETTING, false);
assert.equal(experimentalToolRefusal().code, EXPERIMENTAL_REFUSAL.NOT_GM, "role is reported before the setting");
game.user.isGM = true;
assert.equal(experimentalToolRefusal().code, EXPERIMENTAL_REFUSAL.DISABLED);

// A setting that cannot be read, for example before registration, stays closed
// and does not escape as an exception to the tool's entry point.
stored.set(SETTING, true);
readFailure = new Error("setting is not registered");
assert.equal(experimentalToolsEnabled(), false);
assert.equal(experimentalToolRefusal().code, EXPERIMENTAL_REFUSAL.DISABLED);
readFailure = null;

// The throwing form carries a stable code and a localized, ready-to-show message.
stored.set(SETTING, false);
assert.throws(() => assertExperimentalToolAccess(), (err) => err.code === "disabled"
  && err.localizeKey === "SIMPLYPF2E.Experimental.Disabled"
  && err.message === "localized:SIMPLYPF2E.Experimental.Disabled");

// Checks are live: a tool that passed its entry check is refused again once the GM
// turns the setting off, which is how the write boundary re-authorizes a draft.
stored.set(SETTING, true);
assert.doesNotThrow(() => assertExperimentalToolAccess());
stored.set(SETTING, false);
assert.throws(() => assertExperimentalToolAccess(), (err) => err.code === "disabled");

assert.ok(Object.isFrozen(EXPERIMENTAL_REFUSAL), "refusal codes cannot be reassigned by a caller");
console.log("experimental-tools.test.mjs: gate order, strict enablement, fail-closed reads and live rechecks passed");
