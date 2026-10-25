import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SETTINGS } from "../scripts/settings.mjs";
import { EXPERIMENTAL_REFUSAL } from "../scripts/experimental-tools.mjs";
import { LEVEL_SHIFT_ERROR_CODES } from "../scripts/level-shift.mjs";
import { LEVEL_SHIFT_CODES } from "../scripts/level-shift-policy.mjs";
import { CREATURE_CODES, prepareCreatureLevelShift, createCreatureLevelShift } from "../scripts/creature-tools.mjs";
import { AC, HP, PERCEPTION_AND_SAVES, SKILL, STRIKE_ATTACK, STRIKE_DAMAGE } from "../scripts/tables.mjs";

/*
 * Level-shift adapter boundary. Every scenario installs fresh fromUuid and
 * Actor.create doubles and asserts their call counts. A refusal is only proven
 * to come from the gate when the backend lookup is a sentinel that would
 * surface instead of the refusal if it were reached.
 */

const SENTINEL = new Error("level-shift backend reached");
const LANG = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));

function sourceData(level = 5) {
  const at = (table, column) => table[column][level + 1];
  return {
    _id: "SRC000000000000A", name: "Brute", type: "npc", img: "x.png", folder: null, ownership: {}, _stats: {},
    items: [
      { _id: "MEL000000000000A", name: "Fist", type: "melee", system: { bonus: { value: at(STRIKE_ATTACK, "high") }, damageRolls: { r1: { damage: at(STRIKE_DAMAGE, "high") } } } }
    ],
    system: {
      details: { level: { value: level }, publicNotes: "" },
      attributes: { ac: { value: at(AC, "high") }, hp: { value: at(HP, "high"), max: at(HP, "high") }, adjustment: null },
      saves: { fortitude: { value: at(PERCEPTION_AND_SAVES, "high") }, reflex: { value: at(PERCEPTION_AND_SAVES, "high") }, will: { value: at(PERCEPTION_AND_SAVES, "high") } },
      perception: { mod: at(PERCEPTION_AND_SAVES, "high") },
      skills: { athletics: { base: at(SKILL, "high") } },
      abilities: { str: { mod: 4 } },
      traits: { value: [] },
      otherSegments: []
    }
  };
}

/** Actor double. `deleted` records delete() calls; `world: false` makes it a compendium copy. */
function actorDouble(data, { uuid = "Actor.SRC", world = true, deleted = [] } = {}) {
  const current = structuredClone(data);
  return {
    uuid, type: "npc", isToken: false, pack: world ? undefined : "pack", id: data._id, name: data.name,
    toObject: () => structuredClone(current),
    set: (next) => Object.assign(current, next),
    delete: async () => { deleted.push(uuid); }
  };
}

function installGame({ enabled = true, isGM = true, system = "pf2e" } = {}) {
  globalThis.game = {
    system: { id: system },
    user: { isGM },
    settings: { get: (_module, key) => (key === SETTINGS.experimentalTools ? enabled : undefined) },
    i18n: { localize: (key) => key }
  };
}

/**
 * Installs the backend lookup and creation doubles. `counts` is read after each
 * scenario. `lookupError` makes fromUuid throw instead of returning a document,
 * so a gate bypass would surface as the sentinel rather than as a refusal.
 */
function installBackend({ failVerify = false, rollbackFails = false } = {}) {
  const store = new Map();
  const deleted = [];
  const backend = {
    store, deleted, lookupError: null,
    counts: { fromUuid: 0, create: 0, created: [] }
  };
  globalThis.fromUuid = async (uuid) => {
    backend.counts.fromUuid += 1;
    if (backend.lookupError) throw backend.lookupError;
    return store.get(uuid) ?? null;
  };
  globalThis.Actor = {
    create: async (data) => {
      backend.counts.create += 1;
      const created = actorDouble({ ...structuredClone(data), _id: "NEW000000000000A" }, { uuid: "Actor.NEW", deleted });
      if (failVerify) created.toObject = () => ({ ...structuredClone(data), name: "wrong", _id: "NEW000000000000A" });
      if (rollbackFails) created.delete = async () => { throw new Error("delete refused"); };
      backend.counts.created.push(created);
      store.set("Actor.NEW", created);
      return created;
    }
  };
  return backend;
}

function assertNoBackendWork(backend) {
  assert.equal(backend.counts.fromUuid, 0, "the source was never looked up");
  assert.equal(backend.counts.create, 0, "Actor.create was never called");
}

test("gate closed: preview and create refuse before any backend read or write", async () => {
  installGame({ enabled: false });
  const backend = installBackend();
  backend.lookupError = SENTINEL;
  let sourceReads = 0;
  const source = actorDouble(sourceData(5));
  source.toObject = () => { sourceReads += 1; throw SENTINEL; };
  backend.store.set("Actor.SRC", source);

  await assert.rejects(prepareCreatureLevelShift(source, 6), (error) => {
    assert.notEqual(error, SENTINEL, "the refusal, not the backend, rejected the preview");
    assert.equal(error.code, EXPERIMENTAL_REFUSAL.DISABLED);
    return true;
  });
  // Even an unissued, fabricated shift reports the gate, not the issued-plan guard.
  await assert.rejects(createCreatureLevelShift({ fake: true }), (error) => {
    assert.notEqual(error, SENTINEL);
    assert.equal(error.code, EXPERIMENTAL_REFUSAL.DISABLED);
    return true;
  });
  assert.equal(sourceReads, 0, "the source snapshot was never taken");
  assertNoBackendWork(backend);
});

test("gate revoked after preview: create refuses before the source lookup or write", async () => {
  installGame();
  const backend = installBackend();
  const source = actorDouble(sourceData(5));
  backend.store.set("Actor.SRC", source);
  const { prepared } = await prepareCreatureLevelShift(source, 6);
  assertNoBackendWork(backend);

  installGame({ enabled: false });
  backend.lookupError = SENTINEL;
  await assert.rejects(createCreatureLevelShift(prepared), (error) => {
    assert.notEqual(error, SENTINEL, "the refusal, not the backend, rejected the create");
    assert.equal(error.code, EXPERIMENTAL_REFUSAL.DISABLED);
    return true;
  });
  assertNoBackendWork(backend);
});

test("unsupported delta +3 reports SHIFT_TOO_LARGE in the preview and never writes", async () => {
  installGame();
  const backend = installBackend();
  const source = actorDouble(sourceData(5));
  backend.store.set("Actor.SRC", source);

  const { prepared, preview } = await prepareCreatureLevelShift(source, 8);
  assert.ok(preview.problems.some(({ code }) => code === LEVEL_SHIFT_CODES.SHIFT_TOO_LARGE),
    "the preview names the unsupported delta");
  assert.equal(backend.counts.create, 0, "preview of a rejected plan does not create");

  const error = await createCreatureLevelShift(prepared).catch((caught) => caught);
  assert.equal(error.code, LEVEL_SHIFT_ERROR_CODES.PLAN_REJECTED);
  assertNoBackendWork(backend);
});

test("supported delta +1 previews the level name without writing", async () => {
  installGame();
  const backend = installBackend();
  const source = actorDouble(sourceData(5));
  backend.store.set("Actor.SRC", source);

  const { preview } = await prepareCreatureLevelShift(source, 6);
  assert.equal(preview.name, "Brute (Level 6)");
  assert.deepEqual(preview.problems, []);
  assert.equal(backend.counts.create, 0, "preview alone does not create");
});

test("create after preview calls Actor.create exactly once and returns that actor", async () => {
  installGame();
  const backend = installBackend();
  const source = actorDouble(sourceData(5));
  backend.store.set("Actor.SRC", source);
  const { prepared } = await prepareCreatureLevelShift(source, 6);
  assert.equal(backend.counts.create, 0);

  const result = await createCreatureLevelShift(prepared);
  assert.equal(backend.counts.create, 1, "exactly one create");
  assert.equal(result.actor, backend.counts.created[0], "the returned actor is the one Foundry created");
  assert.equal(result.name, "Brute (Level 6)");
  assert.deepEqual(backend.deleted, [], "a verified create is not rolled back");
});

test("source changed after preview: create refuses as stale-source with no write", async () => {
  installGame();
  const backend = installBackend();
  const source = actorDouble(sourceData(5));
  backend.store.set("Actor.SRC", source);
  const { prepared } = await prepareCreatureLevelShift(source, 6);
  backend.store.set("Actor.SRC", actorDouble({ ...sourceData(5), name: "Brute Changed" }));

  await assert.rejects(createCreatureLevelShift(prepared), (error) => error.code === LEVEL_SHIFT_ERROR_CODES.STALE_SOURCE);
  assert.equal(backend.counts.create, 0, "a stale source never reaches Actor.create");
});

test("issued-plan guard: fabricated and copied shifts are refused with no lookup or write", async () => {
  installGame();
  const backend = installBackend();
  const source = actorDouble(sourceData(5));
  backend.store.set("Actor.SRC", source);
  const { prepared } = await prepareCreatureLevelShift(source, 6);

  assert.equal(CREATURE_CODES.LEVEL_SHIFT_NOT_ISSUED, "level-shift-not-issued");
  const fabricated = await createCreatureLevelShift({ fake: true }).catch((caught) => caught);
  assert.equal(fabricated.code, CREATURE_CODES.LEVEL_SHIFT_NOT_ISSUED);
  const copied = await createCreatureLevelShift({ ...prepared }).catch((caught) => caught);
  assert.equal(copied.code, CREATURE_CODES.LEVEL_SHIFT_NOT_ISSUED, "a structurally identical copy is not an issued shift");
  assertNoBackendWork(backend);
});

test("every level-shift error code maps to a LevelShift* lang key that exists in en.json", async () => {
  // Explicit expectations: a new backend code must be added here and in the adapter.
  const expectedKeys = {
    [LEVEL_SHIFT_ERROR_CODES.INVALID_SOURCE]: "SIMPLYPF2E.CreatureTools.Errors.LevelShiftInvalidSource",
    [LEVEL_SHIFT_ERROR_CODES.PLAN_REJECTED]: "SIMPLYPF2E.CreatureTools.Errors.LevelShiftPlanRejected",
    [LEVEL_SHIFT_ERROR_CODES.STALE_SOURCE]: "SIMPLYPF2E.CreatureTools.Errors.LevelShiftStaleSource",
    [LEVEL_SHIFT_ERROR_CODES.VERIFICATION_FAILED]: "SIMPLYPF2E.CreatureTools.Errors.LevelShiftVerificationFailed",
    [LEVEL_SHIFT_ERROR_CODES.ROLLBACK_FAILED]: "SIMPLYPF2E.CreatureTools.Errors.LevelShiftRollbackFailed"
  };
  assert.deepEqual(Object.keys(expectedKeys).sort(), Object.values(LEVEL_SHIFT_ERROR_CODES).sort());

  const lookup = (dotted) => dotted.split(".").reduce((node, key) => node?.[key], LANG);
  for (const key of Object.values(expectedKeys)) {
    assert.equal(typeof lookup(key), "string", `${key} exists in lang/en.json`);
    assert.notEqual(lookup(key).trim(), "", `${key} is not empty`);
  }

  // Each code, produced by the real adapter, carries its localized key as the message.
  const seen = new Map();

  installGame();
  installBackend();
  const packCopy = actorDouble(sourceData(5), { world: false });
  seen.set(LEVEL_SHIFT_ERROR_CODES.INVALID_SOURCE, await prepareCreatureLevelShift(packCopy, 6).catch((caught) => caught));

  let backend = installBackend();
  let source = actorDouble(sourceData(5));
  backend.store.set("Actor.SRC", source);
  let { prepared } = await prepareCreatureLevelShift(source, 8);
  seen.set(LEVEL_SHIFT_ERROR_CODES.PLAN_REJECTED, await createCreatureLevelShift(prepared).catch((caught) => caught));

  backend = installBackend();
  source = actorDouble(sourceData(5));
  backend.store.set("Actor.SRC", source);
  ({ prepared } = await prepareCreatureLevelShift(source, 6));
  backend.store.set("Actor.SRC", actorDouble({ ...sourceData(5), name: "Brute Changed" }));
  seen.set(LEVEL_SHIFT_ERROR_CODES.STALE_SOURCE, await createCreatureLevelShift(prepared).catch((caught) => caught));

  backend = installBackend({ failVerify: true });
  source = actorDouble(sourceData(5));
  backend.store.set("Actor.SRC", source);
  ({ prepared } = await prepareCreatureLevelShift(source, 6));
  seen.set(LEVEL_SHIFT_ERROR_CODES.VERIFICATION_FAILED, await createCreatureLevelShift(prepared).catch((caught) => caught));
  assert.deepEqual(backend.deleted, ["Actor.NEW"], "verification failure removes only the new actor");

  backend = installBackend({ failVerify: true, rollbackFails: true });
  source = actorDouble(sourceData(5));
  backend.store.set("Actor.SRC", source);
  ({ prepared } = await prepareCreatureLevelShift(source, 6));
  const warn = console.warn;
  console.warn = () => {};
  try {
    seen.set(LEVEL_SHIFT_ERROR_CODES.ROLLBACK_FAILED, await createCreatureLevelShift(prepared).catch((caught) => caught));
  } finally {
    console.warn = warn;
  }

  for (const [code, key] of Object.entries(expectedKeys)) {
    const error = seen.get(code);
    assert.equal(error?.code, code, `the adapter surfaces ${code}`);
    assert.equal(error.message, key, `${code} is localized through ${key}`);
  }
});
