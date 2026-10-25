import assert from "node:assert/strict";
import test from "node:test";
import { SETTINGS } from "../scripts/settings.mjs";
import { AC, HP, PERCEPTION_AND_SAVES, SKILL, STRIKE_ATTACK, STRIKE_DAMAGE } from "../scripts/tables.mjs";
import { createLevelShift, LEVEL_SHIFT_ERROR_CODES, prepareLevelShift } from "../scripts/level-shift.mjs";

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

/** Actor double: toObject returns a deep copy; set() edits the stored source; delete() is recorded. */
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

/** Installs fromUuid and Actor.create doubles. `created` records each new actor's delete calls. */
function installActorStore({ failVerify = false, rollbackFails = false, deleted = [] } = {}) {
  const store = new Map();
  globalThis.fromUuid = async (uuid) => store.get(uuid) ?? null;
  globalThis.Actor = {
    create: async (data) => {
      const created = actorDouble({ ...structuredClone(data), _id: "NEW000000000000A" }, { uuid: "Actor.NEW", deleted });
      if (failVerify) created.toObject = () => ({ ...structuredClone(data), name: "wrong", _id: "NEW000000000000A" });
      if (rollbackFails) created.delete = async () => { throw new Error("delete refused"); };
      store.set("Actor.NEW", created);
      return created;
    }
  };
  return store;
}

test("refused at preview when the gate is disabled, not GM, or wrong system", async () => {
  const source = actorDouble(sourceData(5));
  for (const options of [{ enabled: false }, { isGM: false }, { system: "dnd5e" }]) {
    installGame(options);
    await assert.rejects(prepareLevelShift(source, 6));
  }
});

test("creation refused when the gate is revoked after preview, before the write", async () => {
  installGame();
  const store = installActorStore();
  const source = actorDouble(sourceData(5));
  store.set("Actor.SRC", source);
  const prepared = await prepareLevelShift(source, 6);
  installGame({ enabled: false });
  await assert.rejects(createLevelShift(prepared));
  assert.equal(store.has("Actor.NEW"), false);
});

test("a changed source is rejected before any create", async () => {
  installGame();
  const store = installActorStore();
  const source = actorDouble(sourceData(5));
  store.set("Actor.SRC", source);
  const prepared = await prepareLevelShift(source, 6);
  source.set({ name: "Brute Changed" });
  await assert.rejects(createLevelShift(prepared), (error) => error.code === LEVEL_SHIFT_ERROR_CODES.STALE_SOURCE);
  assert.equal(store.has("Actor.NEW"), false);
});

test("verification failure after create deletes only the new actor", async () => {
  installGame();
  const deleted = [];
  const store = installActorStore({ failVerify: true, deleted });
  const source = actorDouble(sourceData(5));
  store.set("Actor.SRC", source);
  const prepared = await prepareLevelShift(source, 6);
  await assert.rejects(createLevelShift(prepared), (error) => error.code === LEVEL_SHIFT_ERROR_CODES.VERIFICATION_FAILED);
  assert.deepEqual(deleted, ["Actor.NEW"]);
});

test("rollback refused by the gate reports the survivor and does not claim cleanup", async () => {
  installGame();
  const store = installActorStore({ failVerify: true, rollbackFails: true });
  const source = actorDouble(sourceData(5));
  store.set("Actor.SRC", source);
  const prepared = await prepareLevelShift(source, 6);
  const error = await createLevelShift(prepared).catch((caught) => caught);
  assert.equal(error.code, LEVEL_SHIFT_ERROR_CODES.ROLLBACK_FAILED);
  assert.equal(error.simplyPF2eRollbackActor?.uuid, "Actor.NEW");
});

test("successful create returns the new actor and leaves the source unchanged", async () => {
  installGame();
  const store = installActorStore();
  const source = actorDouble(sourceData(5));
  store.set("Actor.SRC", source);
  const before = JSON.stringify(source.toObject());
  const prepared = await prepareLevelShift(source, 6);
  const result = await createLevelShift(prepared);
  assert.equal(result.name, "Brute (Level 6)");
  assert.equal(JSON.stringify(source.toObject()), before);
});
