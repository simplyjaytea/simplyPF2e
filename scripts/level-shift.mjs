/*
 * Level shifting (experimental, C11): Foundry wiring around the pure policy in
 * level-shift-policy.mjs. Preview is read-only. Creation re-fetches the source,
 * rejects it if it changed since preview, verifies the payload, writes one new
 * world actor, verifies the persisted result, and deletes only that new actor on
 * failure. The experimental gate is checked at every entry and before every
 * native write, including the rollback delete.
 */
import { assertExperimentalToolAccess } from "./experimental-tools.mjs";
import {
  buildShiftedActorData, describeLevelShift, planLevelShift, verifyShiftedActorData
} from "./level-shift-policy.mjs";

export const LEVEL_SHIFT_ERROR_CODES = Object.freeze({
  INVALID_SOURCE: "invalid-source",
  PLAN_REJECTED: "plan-rejected",
  STALE_SOURCE: "stale-source",
  VERIFICATION_FAILED: "verification-failed",
  ROLLBACK_FAILED: "rollback-failed"
});

export class LevelShiftError extends Error {
  constructor(code, message, { cause = null, problems = [] } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "LevelShiftError";
    this.code = code;
    this.problems = problems;
  }
}

/** Only a world NPC document can be shifted. Tokens and compendium copies are refused. */
function assertShiftableActor(actor) {
  if (!actor || actor.type !== "npc" || actor.isToken || actor.pack || typeof actor.uuid !== "string") {
    throw new LevelShiftError(LEVEL_SHIFT_ERROR_CODES.INVALID_SOURCE, "Level shifting needs a world NPC actor.");
  }
}

/** Stable snapshot of the source content, used to detect a change between preview and create. */
function snapshotOf(actor) {
  const data = actor.toObject();
  return JSON.stringify({ name: data.name, system: data.system, items: data.items ?? [] });
}

/**
 * Read-only preview of a shift. Returns the prepared shift, which carries the
 * source UUID and snapshot for createLevelShift(), and the preview data.
 */
export async function prepareLevelShift(actor, targetLevel) {
  assertExperimentalToolAccess();
  assertShiftableActor(actor);
  const plan = planLevelShift(actor.toObject(), targetLevel);
  return {
    sourceUuid: actor.uuid,
    sourceSnapshot: snapshotOf(actor),
    plan,
    preview: describeLevelShift(plan)
  };
}

/**
 * Create the shifted actor from a prepared shift. The source must match its
 * preview snapshot. The source is never written. Returns the new actor.
 */
export async function createLevelShift(prepared) {
  assertExperimentalToolAccess();
  if (!prepared?.plan?.ok) {
    const codes = (prepared?.plan?.problems ?? []).map(({ code }) => code).join(", ") || "no plan";
    throw new LevelShiftError(LEVEL_SHIFT_ERROR_CODES.PLAN_REJECTED, `Level shift rejected: ${codes}.`, {
      problems: prepared?.plan?.problems ?? []
    });
  }
  const current = await fromUuid(prepared.sourceUuid);
  assertShiftableActor(current);
  if (snapshotOf(current) !== prepared.sourceSnapshot) {
    throw new LevelShiftError(LEVEL_SHIFT_ERROR_CODES.STALE_SOURCE, "The source actor changed after this preview. Preview the shift again.");
  }
  const source = current.toObject();
  const data = buildShiftedActorData(source, prepared.plan);
  const preProblems = verifyShiftedActorData(source, data, prepared.plan);
  if (preProblems.length) {
    throw new LevelShiftError(LEVEL_SHIFT_ERROR_CODES.VERIFICATION_FAILED, `Level shift blocked before creation: ${preProblems.join("; ")}.`, { problems: preProblems });
  }

  // Recheck immediately before the write: the GM may have revoked the gate since preview.
  assertExperimentalToolAccess();
  const actor = await Actor.create(data, { keepEmbeddedIds: true, renderSheet: false });

  try {
    if (!actor?.id) throw new LevelShiftError(LEVEL_SHIFT_ERROR_CODES.VERIFICATION_FAILED, "Foundry returned no actor id for the shifted actor.");
    const persistedProblems = verifyShiftedActorData(source, actor.toObject(), prepared.plan);
    const after = await fromUuid(prepared.sourceUuid);
    if (!after || snapshotOf(after) !== prepared.sourceSnapshot) persistedProblems.push("the source actor changed during creation");
    if (persistedProblems.length) {
      throw new LevelShiftError(LEVEL_SHIFT_ERROR_CODES.VERIFICATION_FAILED, `Level shift verification failed: ${persistedProblems.join("; ")}.`, { problems: persistedProblems });
    }
  } catch (error) {
    throw await rollbackNewActor(actor, error);
  }
  return { actor, name: data.name, changes: prepared.plan.changes.length };
}

/** Delete only the actor this call created. A survivor is reported on the returned error, never duplicated. */
async function rollbackNewActor(actor, error) {
  try {
    assertExperimentalToolAccess();
    await actor.delete();
  } catch (cleanupError) {
    console.warn(`simplypf2e | failed to roll back level-shifted actor "${actor?.name}"`, cleanupError);
    const rollbackError = new LevelShiftError(LEVEL_SHIFT_ERROR_CODES.ROLLBACK_FAILED,
      `Level shift verification failed and the new actor could not be removed: ${error.message}`, { cause: error });
    rollbackError.simplyPF2eRollbackActor = actor;
    return rollbackError;
  }
  return error;
}
