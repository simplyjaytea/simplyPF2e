import { SETTINGS, getSetting } from "./settings.mjs";

/*
 * Authorization boundary for experimental roadmap tools. A tool calls
 * assertExperimentalToolAccess() at every entry point and again immediately
 * before each native document write: the GM may disable the setting while a
 * run waits, and a console caller can reach a method without any UI check.
 */

/** Stable codes so callers branch on meaning rather than localized text. */
export const EXPERIMENTAL_REFUSAL = Object.freeze({
  WRONG_SYSTEM: "wrong-system",
  NOT_GM: "not-gm",
  DISABLED: "disabled"
});

/** The world setting is read on every check. Any read failure stays closed. */
export function experimentalToolsEnabled() {
  try {
    return getSetting(SETTINGS.experimentalTools) === true;
  } catch {
    return false;
  }
}

/**
 * The first unmet requirement, or null when experimental tools may run. The
 * order is system, role, then setting, so a refusal names the earliest blocker.
 * `localizeKey` is ready for a notification.
 */
export function experimentalToolRefusal() {
  if (globalThis.game?.system?.id !== "pf2e") {
    return { code: EXPERIMENTAL_REFUSAL.WRONG_SYSTEM, localizeKey: "SIMPLYPF2E.Errors.WrongSystem" };
  }
  if (!globalThis.game?.user?.isGM) {
    return { code: EXPERIMENTAL_REFUSAL.NOT_GM, localizeKey: "SIMPLYPF2E.Experimental.GMOnly" };
  }
  if (!experimentalToolsEnabled()) {
    return { code: EXPERIMENTAL_REFUSAL.DISABLED, localizeKey: "SIMPLYPF2E.Experimental.Disabled" };
  }
  return null;
}

/**
 * Throws when experimental tools are unavailable. The error carries `code` and
 * `localizeKey` next to a localized message that is ready to show.
 */
export function assertExperimentalToolAccess() {
  const refusal = experimentalToolRefusal();
  if (!refusal) return;
  throw Object.assign(new Error(globalThis.game.i18n.localize(refusal.localizeKey)), {
    code: refusal.code,
    localizeKey: refusal.localizeKey
  });
}
