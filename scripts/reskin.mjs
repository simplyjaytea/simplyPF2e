/**
 * AI cosmetic reskin of one exact, enabled compendium bestiary NPC. A reskin
 * creates one new world actor. Mechanics come from the published source and
 * are verified against it: stat block, embedded items, rule elements, UUID
 * references and enrichers. The AI supplies only a name plus plain flavor and
 * biography, appended to the source's public notes. Art, stat generation and
 * the creature builder are not used. Only commitReskinPlan() writes, after it
 * re-fetches and re-verifies the source.
 */
import { getPacksFor } from "./compendium.mjs";
import { generateReskinFlavor } from "./ai.mjs";
import { MODULE_ID } from "./settings.mjs";
import {
  RESKIN_LIMITS, canonicalJSON, composePublicNotes, digestOf, flavorBlockHtml, mechanicalSnapshot,
  publicNotesProblems, reskinContext, reskinMechanicsProblems, reskinOutputProblem, reskinPayload
} from "./reskin-policy.mjs";

/** Compendium Actor uuid: Compendium.<package>.<pack>.Actor.<16-character id>. */
const SOURCE_UUID = /^Compendium\.([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\.Actor\.([A-Za-z0-9]{16})$/;
const CANDIDATE_FIELDS = ["type", "system.details.level.value", "system.traits.rarity", "system.traits.size.value"];
/** Plans issued by prepareReskinPlan(). Commit accepts only these exact objects. */
const issuedPlans = new WeakSet();

export const RESKIN_CODES = Object.freeze({
  UNAUTHORIZED: "unauthorized",
  CANCELLED: "cancelled",
  INVALID_PROMPT: "invalid-prompt",
  INVALID_SOURCE: "invalid-source",
  INVALID_OUTPUT: "invalid-output",
  INVALID_PLAN: "invalid-plan",
  STALE_SOURCE: "stale-source",
  VERIFICATION_FAILED: "verification-failed"
});

/**
 * Failure with a stable `code` for UI mapping. `cancelled` and `usage` mirror
 * AIRequestError so one error boundary serves both. Messages are developer
 * English, and C04 maps `code` to localized text.
 */
class ReskinError extends Error {
  constructor(message, { code, cancelled = false, usage = null } = {}) {
    super(message);
    this.name = "ReskinError";
    this.code = code;
    this.cancelled = Boolean(cancelled);
    this.usage = usage;
  }
}

const reskinError = (code, message, options) => new ReskinError(message, { code, ...options });

/**
 * Explicit caller authorization is mandatory and fails closed. The module
 * still requires a GM in a PF2e world. The injected callback supplies the
 * experimental gate and must return exactly `true`. It is checked before spend
 * and again before every write.
 */
async function assertAuthorized(authorize) {
  if (game.user?.isGM !== true || game.system?.id !== "pf2e") {
    throw reskinError(RESKIN_CODES.UNAUTHORIZED, "Reskinning requires a GM in a PF2e world.");
  }
  if (typeof authorize !== "function") {
    throw reskinError(RESKIN_CODES.UNAUTHORIZED, "Reskinning requires an authorization check from the caller.");
  }
  let allowed = false;
  try {
    allowed = (await authorize()) === true;
  } catch (error) {
    console.warn(`${MODULE_ID} | reskin authorization check failed`, error);
  }
  if (!allowed) throw reskinError(RESKIN_CODES.UNAUTHORIZED, "Reskinning is not enabled for this session.");
}

function throwIfCancelled(signal, usage = null) {
  if (signal?.aborted) {
    throw new ReskinError(game.i18n.localize("SIMPLYPF2E.Errors.Cancelled"), {
      code: RESKIN_CODES.CANCELLED, cancelled: true, usage
    });
  }
}

function assertIssuedPlan(plan) {
  if (!issuedPlans.has(plan)) {
    throw reskinError(RESKIN_CODES.INVALID_PLAN, "Only a reskin plan prepared in this session can be used.");
  }
}

/** Embedded documents from a Foundry item collection, without assuming its class. */
function embeddedItems(actor) {
  const items = actor?.items;
  if (Array.isArray(items?.contents)) return items.contents;
  if (Array.isArray(items)) return items;
  if (typeof items?.values === "function") return [...items.values()];
  return [];
}

/** Paragraph breaks must be "\n\n" for toHtml(), so CRLF replies are normalized first. */
const normalizedText = (text) => text.replace(/\r\n?/g, "\n").trim();

function reskinDirection(prompt) {
  const text = typeof prompt === "string" ? prompt.trim() : "";
  if (text.length < 3) throw reskinError(RESKIN_CODES.INVALID_PROMPT, "Describe how the creature should be reskinned.");
  if (text.length > RESKIN_LIMITS.prompt) {
    throw reskinError(RESKIN_CODES.INVALID_PROMPT, `Keep the reskin direction under ${RESKIN_LIMITS.prompt} characters.`);
  }
  return text;
}

/**
 * Load one exact enabled bestiary NPC and snapshot its mechanics. Nothing
 * here writes. The uuid must name a compendium Actor in an enabled bestiary
 * source, the entry must be an NPC, and the snapshot is canonical text.
 */
async function loadReskinSource(uuid) {
  const match = typeof uuid === "string" ? SOURCE_UUID.exec(uuid) : null;
  if (!match) throw reskinError(RESKIN_CODES.INVALID_SOURCE, "Choose an NPC from an enabled bestiary source.");
  const [, collection, id] = match;
  if (!getPacksFor("bestiaryActors").includes(collection)) {
    throw reskinError(RESKIN_CODES.INVALID_SOURCE, `${collection} is not an enabled bestiary source.`);
  }
  const pack = game.packs.get(collection);
  if (pack?.metadata?.type !== "Actor") {
    throw reskinError(RESKIN_CODES.INVALID_SOURCE, `${collection} is not an actor compendium.`);
  }
  const index = await pack.getIndex({ fields: ["type"] });
  const entry = [...index].find((candidate) => candidate._id === id);
  if (entry?.type !== "npc") throw reskinError(RESKIN_CODES.INVALID_SOURCE, "The selected bestiary entry is not an NPC.");
  const doc = await pack.getDocument(id);
  if (doc?.type !== "npc" || doc.uuid !== uuid) {
    throw reskinError(RESKIN_CODES.INVALID_SOURCE, "The selected bestiary entry could not be loaded exactly.");
  }
  const actor = doc.toObject();
  const items = Array.isArray(actor.items) ? actor.items : embeddedItems(doc).map((item) => item.toObject());
  delete actor.items;
  if (!actor.system || typeof actor.system.details !== "object" || actor.system.details === null) {
    throw reskinError(RESKIN_CODES.INVALID_SOURCE, "The selected bestiary entry has an unsupported NPC shape.");
  }
  const mechanics = mechanicalSnapshot({ actor, items });
  // The appended note copies the source's public notes at commit time, and the
  // preview never shows them. They therefore belong in the stale-source baseline.
  const snapshot = canonicalJSON({ mechanics, publicNotes: actor.system.details.publicNotes ?? "" });
  return { uuid, name: doc.name, actor, items, mechanics, snapshot };
}

/**
 * Enabled bestiary NPCs, for the UI to choose from. Only exact compendium
 * uuids are returned. Each one still passes loadReskinSource() before use.
 * @returns {Promise<{uuid: string, name: string, packId: string, packTitle: string, level: number|null, rarity: string|null, size: string|null}[]>}
 */
export async function listReskinSourceCandidates({ authorize } = {}) {
  await assertAuthorized(authorize);
  const candidates = [];
  for (const packId of getPacksFor("bestiaryActors")) {
    const pack = game.packs.get(packId);
    if (pack?.metadata?.type !== "Actor") continue;
    const index = await pack.getIndex({ fields: CANDIDATE_FIELDS });
    for (const entry of index) {
      const uuid = `Compendium.${packId}.Actor.${entry._id}`;
      if (entry.type !== "npc" || !SOURCE_UUID.test(uuid)) continue;
      candidates.push({
        uuid,
        name: entry.name,
        packId,
        packTitle: pack.title ?? pack.metadata?.label ?? packId,
        level: entry.system?.details?.level?.value ?? null,
        rarity: entry.system?.traits?.rarity ?? null,
        size: entry.system?.traits?.size?.value ?? null
      });
    }
  }
  return candidates.sort((a, b) => a.name.localeCompare(b.name) || a.uuid.localeCompare(b.uuid));
}

/**
 * Generate the reskin text for one source. This is the only provider spend,
 * and it happens after authorization and exact source validation. The result
 * is an issued, frozen plan. Nothing is written to any actor.
 * @returns {Promise<object>} plan, accepted only by commitReskinPlan()
 */
export async function prepareReskinPlan({ sourceUuid, prompt, authorize, signal, onProgress } = {}) {
  await assertAuthorized(authorize);
  const direction = reskinDirection(prompt);
  throwIfCancelled(signal);
  const source = await loadReskinSource(sourceUuid);
  throwIfCancelled(signal);
  // AI errors (AIRequestError) keep their own usage and cancellation fields.
  const generated = await generateReskinFlavor({
    context: reskinContext(source.actor), prompt: direction, onProgress, signal
  });
  const { usage } = generated;
  const flavor = generated.flavor;
  const problem = reskinOutputProblem(flavor);
  if (problem) {
    throw reskinError(RESKIN_CODES.INVALID_OUTPUT, `The reskin response was rejected: ${problem}.`, { usage });
  }
  throwIfCancelled(signal, usage);
  const plan = Object.freeze({
    sourceUuid: source.uuid,
    sourceName: source.name,
    sourceSnapshot: source.snapshot,
    sourceDigest: digestOf(source.snapshot),
    itemCount: source.items.length,
    name: normalizedText(flavor.name),
    flavor: normalizedText(flavor.flavor),
    biography: normalizedText(flavor.biography),
    usage: Object.freeze({ ...usage })
  });
  issuedPlans.add(plan);
  return plan;
}

/** What the UI may show before creation. Plain text only; nothing here writes. */
export function reskinPlanPreview(plan) {
  assertIssuedPlan(plan);
  return Object.freeze({
    sourceUuid: plan.sourceUuid,
    sourceName: plan.sourceName,
    name: plan.name,
    flavor: plan.flavor,
    biography: plan.biography,
    itemCount: plan.itemCount,
    sourceDigest: plan.sourceDigest,
    changes: Object.freeze(["name", "publicNotes"]),
    usage: plan.usage
  });
}

async function rollbackNewActor(actor, error) {
  if (!actor?.id) return error;
  try {
    await actor.delete();
  } catch (cleanupError) {
    console.warn(`${MODULE_ID} | failed to roll back reskin actor "${actor.name}"`, cleanupError);
    // The caller must report this survivor and must not create a duplicate.
    error.simplyPF2eRollbackActor = actor;
  }
  return error;
}

/**
 * Create the reskinned actor from an issued plan. The source is re-fetched and
 * must match the mechanics captured at preparation. The payload is verified
 * before any write, and the persisted actor is verified after it. Failure
 * after the write deletes only this new actor. `present` runs after the
 * commit point and cannot delete the actor.
 * @returns {Promise<{actor: Actor, name: string, sourceName: string, itemCount: number, sourceDigest: string, presentationError: Error|null}>}
 */
export async function commitReskinPlan(plan, { authorize, signal, present } = {}) {
  assertIssuedPlan(plan);
  const textProblem = reskinOutputProblem({ name: plan.name, flavor: plan.flavor, biography: plan.biography });
  if (textProblem) throw reskinError(RESKIN_CODES.INVALID_OUTPUT, `The reskin plan is not safe to create: ${textProblem}.`);
  await assertAuthorized(authorize);
  throwIfCancelled(signal);

  const source = await loadReskinSource(plan.sourceUuid);
  if (source.snapshot !== plan.sourceSnapshot) {
    throw reskinError(RESKIN_CODES.STALE_SOURCE, "The bestiary entry changed after this preview. Prepare the reskin again.");
  }
  const sourceNotes = source.actor.system.details.publicNotes;
  const flavorHtml = flavorBlockHtml(plan);
  const payload = reskinPayload(source, { name: plan.name, publicNotes: composePublicNotes(sourceNotes, flavorHtml) });
  const preProblems = [
    ...reskinMechanicsProblems(source.mechanics, mechanicalSnapshot({ actor: payload, items: payload.items }), { exact: true }),
    ...publicNotesProblems({ sourceNotes, actualNotes: payload.system.details.publicNotes, flavorHtml })
  ];
  if (preProblems.length) {
    throw reskinError(RESKIN_CODES.VERIFICATION_FAILED, `Reskin blocked before creation: ${preProblems.join("; ")}.`);
  }

  // Recheck immediately before the write. A revoked gate cannot slip through
  // the preparation-time check.
  await assertAuthorized(authorize);
  throwIfCancelled(signal);
  const actor = await Actor.create(payload, { keepEmbeddedIds: true, renderSheet: false });

  try {
    if (!actor?.id) throw reskinError(RESKIN_CODES.VERIFICATION_FAILED, "Foundry returned no actor id for the reskin.");
    const data = actor.toObject();
    const persistedItems = Array.isArray(data.items) ? data.items : embeddedItems(actor).map((item) => item.toObject());
    delete data.items;
    const persistedProblems = [
      ...reskinMechanicsProblems(source.mechanics, mechanicalSnapshot({ actor: data, items: persistedItems }), { exact: false }),
      ...(data.name === plan.name ? [] : ["actor name differs from the reviewed name"]),
      ...publicNotesProblems({ sourceNotes, actualNotes: data.system?.details?.publicNotes, flavorHtml })
    ];
    if (persistedProblems.length) {
      throw reskinError(RESKIN_CODES.VERIFICATION_FAILED, `Reskin verification failed: ${persistedProblems.join("; ")}.`);
    }
    throwIfCancelled(signal);
  } catch (error) {
    throw await rollbackNewActor(actor, error);
  }

  // Commit point: the actor is verified and kept. Presentation failure only warns.
  let presentationError = null;
  try {
    await present?.(actor);
  } catch (error) {
    presentationError = error;
    console.warn(`${MODULE_ID} | reskin created, but presentation failed`, error);
  }
  return Object.freeze({
    actor,
    name: actor.name,
    sourceName: source.name,
    itemCount: source.items.length,
    sourceDigest: digestOf(source.snapshot),
    presentationError
  });
}
