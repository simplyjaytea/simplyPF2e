import { assertExperimentalToolAccess, experimentalToolRefusal } from "./experimental-tools.mjs";
import {
  listReskinSourceCandidates, prepareReskinPlan, reskinPlanPreview, commitReskinPlan
} from "./reskin.mjs";
import {
  prepareLevelShift as prepareLevelShiftBackend, createLevelShift as createLevelShiftBackend,
  LevelShiftError, LEVEL_SHIFT_ERROR_CODES
} from "./level-shift.mjs";
import { describeLevelShift } from "./level-shift-policy.mjs";

/*
 * Creature tools (experimental): reskin flows on top of the C03 backend and a
 * native elite/weak adapter. Every exported flow checks the experimental gate
 * first, and every native write checks it again immediately before writing.
 */

/** Authorization callback for the C03 reskin backend. Exactly true only while the gate is open. */
const experimentalAuthorize = () => experimentalToolRefusal() === null;

/** Enabled bestiary NPC sources the GM may reskin. Read-only. */
export async function listCreatureReskinSources() {
  assertExperimentalToolAccess();
  return listReskinSourceCandidates({ authorize: experimentalAuthorize });
}

/** One AI call through the reskin backend. Nothing is written to any document. */
export async function prepareCreatureReskin({ sourceUuid, prompt, signal, onProgress } = {}) {
  assertExperimentalToolAccess();
  const plan = await prepareReskinPlan({ sourceUuid, prompt, authorize: experimentalAuthorize, signal, onProgress });
  return { plan, preview: reskinPlanPreview(plan) };
}

/** Create the reviewed reskin as a new actor. The source actor is never written. */
export async function createCreatureReskin(plan, { present } = {}) {
  assertExperimentalToolAccess();
  return commitReskinPlan(plan, { authorize: experimentalAuthorize, present });
}

/** Stable codes so callers branch on meaning rather than localized text. */
export const CREATURE_CODES = Object.freeze({
  INVALID_TARGET: "invalid-target",
  NOT_ADJUSTABLE: "not-adjustable",
  VERIFICATION_FAILED: "verification-failed",
  ROLLBACK_FAILED: "rollback-failed",
  LEVEL_SHIFT_NOT_ISSUED: "level-shift-not-issued"
});

class CreatureToolsError extends Error {
  constructor(code, message, { cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "CreatureToolsError";
    this.code = code;
  }
}

/** The three choices a GM can make. "normal" is stored natively as null. */
export const CREATURE_ADJUSTMENTS = Object.freeze(["elite", "weak", "normal"]);

/** The stored PF2e adjustment as one of the three choices. Any other stored value reads as normal. */
function currentAdjustment(actor) {
  const stored = actor?.system?.attributes?.adjustment;
  return stored === "elite" || stored === "weak" ? stored : "normal";
}

const nativeValue = (choice) => (choice === "normal" ? null : choice);

function adjustmentState(actor) {
  return {
    name: actor.name,
    adjustment: currentAdjustment(actor),
    hp: Number(actor.system?.attributes?.hp?.value ?? 0),
    hpMax: Number(actor.system?.attributes?.hp?.max ?? 0)
  };
}

function normalizeTarget(target) {
  if (!CREATURE_ADJUSTMENTS.includes(target)) {
    throw new CreatureToolsError(CREATURE_CODES.INVALID_TARGET, game.i18n.localize("SIMPLYPF2E.CreatureTools.Errors.InvalidTarget"));
  }
  return target;
}

/** Only an existing world NPC can be adjusted: no compendium copies, token copies, or other types. */
function assertAdjustableNpc(actor) {
  const adjustable = actor && actor.type === "npc" && !actor.isToken && !actor.pack
    && typeof actor.applyAdjustment === "function";
  if (!adjustable) {
    throw new CreatureToolsError(CREATURE_CODES.NOT_ADJUSTABLE, game.i18n.localize("SIMPLYPF2E.CreatureTools.Errors.NotAdjustable"));
  }
}

/** Read-only preview of the requested transition. Native PF2e recalculates the stats on apply. */
export async function previewCreatureAdjustment(actor, target) {
  assertExperimentalToolAccess();
  const wanted = normalizeTarget(target);
  assertAdjustableNpc(actor);
  return { from: adjustmentState(actor), to: wanted, changes: wanted !== currentAdjustment(actor) };
}

/** Gate, then the native write. Used for every write so the gate is rechecked right before it. */
async function writeAdjustment(actor, choice) {
  assertExperimentalToolAccess();
  await actor.applyAdjustment(nativeValue(choice));
}

export { LEVEL_SHIFT_ERROR_CODES } from "./level-shift.mjs";

const LEVEL_SHIFT_ERROR_KEYS = Object.freeze({
  [LEVEL_SHIFT_ERROR_CODES.INVALID_SOURCE]: "SIMPLYPF2E.CreatureTools.Errors.LevelShiftInvalidSource",
  [LEVEL_SHIFT_ERROR_CODES.PLAN_REJECTED]: "SIMPLYPF2E.CreatureTools.Errors.LevelShiftPlanRejected",
  [LEVEL_SHIFT_ERROR_CODES.STALE_SOURCE]: "SIMPLYPF2E.CreatureTools.Errors.LevelShiftStaleSource",
  [LEVEL_SHIFT_ERROR_CODES.VERIFICATION_FAILED]: "SIMPLYPF2E.CreatureTools.Errors.LevelShiftVerificationFailed",
  [LEVEL_SHIFT_ERROR_CODES.ROLLBACK_FAILED]: "SIMPLYPF2E.CreatureTools.Errors.LevelShiftRollbackFailed"
});

function mapLevelShiftError(error) {
  if (error instanceof LevelShiftError) {
    const key = LEVEL_SHIFT_ERROR_KEYS[error.code];
    const message = key ? game.i18n.localize(key) : error.message;
    const mapped = new CreatureToolsError(error.code, message);
    mapped.problems = error.problems;
    if (error.simplyPF2eRollbackActor) mapped.simplyPF2eRollbackActor = error.simplyPF2eRollbackActor;
    return mapped;
  }
  return error;
}

/** Prepared shifts issued by prepareCreatureLevelShift in this session. Creation accepts only these objects. */
const issuedLevelShifts = new WeakSet();

/** The typed refusal for a shift this module did not issue. */
function notIssuedError() {
  return new CreatureToolsError(CREATURE_CODES.LEVEL_SHIFT_NOT_ISSUED,
    game.i18n.localize("SIMPLYPF2E.CreatureTools.Errors.LevelShiftNotIssued"));
}

/** Asserts the experimental gate, then prepares a level shift and its preview. */
export async function prepareCreatureLevelShift(actor, targetLevel) {
  assertExperimentalToolAccess();
  try {
    const prepared = await prepareLevelShiftBackend(actor, targetLevel);
    issuedLevelShifts.add(prepared);
    return { prepared, preview: describeLevelShift(prepared.plan) };
  } catch (error) {
    throw mapLevelShiftError(error);
  }
}

/** Asserts the experimental gate, then creates the level-shifted actor from an issued preview only. */
export async function createCreatureLevelShift(prepared) {
  assertExperimentalToolAccess();
  if (!issuedLevelShifts.has(prepared)) {
    throw notIssuedError();
  }
  try {
    return await createLevelShiftBackend(prepared);
  } catch (error) {
    throw mapLevelShiftError(error);
  }
}

/**
 * Apply elite, weak, or normal through PF2e's native applyAdjustment, which owns
 * every stat change. The adapter only selects the target, refuses non-world
 * NPCs, and verifies the persisted state. When the target does not persist, it
 * restores the captured state through the same native call and reports the result.
 */
export async function applyCreatureAdjustment(actor, target) {
  assertExperimentalToolAccess();
  const wanted = normalizeTarget(target);
  assertAdjustableNpc(actor);
  const before = adjustmentState(actor);
  if (before.adjustment === wanted) return { before, after: before, changed: false };

  await writeAdjustment(actor, wanted);
  const after = adjustmentState(actor);
  if (after.adjustment === wanted) return { before, after, changed: true };

  try {
    await writeAdjustment(actor, before.adjustment);
  } catch (cause) {
    throw new CreatureToolsError(CREATURE_CODES.ROLLBACK_FAILED,
      game.i18n.localize("SIMPLYPF2E.CreatureTools.Errors.RollbackFailed"), { cause });
  }
  if (currentAdjustment(actor) !== before.adjustment) {
    throw new CreatureToolsError(CREATURE_CODES.ROLLBACK_FAILED, game.i18n.localize("SIMPLYPF2E.CreatureTools.Errors.RollbackFailed"));
  }
  throw new CreatureToolsError(CREATURE_CODES.VERIFICATION_FAILED,
    game.i18n.localize("SIMPLYPF2E.CreatureTools.Errors.VerificationFailed"));
}
