import assert from "node:assert/strict";
import { SETTINGS } from "../scripts/settings.mjs";
import { LEVEL_SHIFT_ERROR_CODES } from "../scripts/level-shift.mjs";
import { prepareCreatureLevelShift, createCreatureLevelShift } from "../scripts/creature-tools.mjs";
import { AC, HP, PERCEPTION_AND_SAVES, SKILL, STRIKE_ATTACK, STRIKE_DAMAGE } from "../scripts/tables.mjs";

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

function actorDouble(data, { uuid = "Actor.SRC", world = true } = {}) {
  const current = structuredClone(data);
  return {
    uuid, type: "npc", isToken: false, pack: world ? undefined : "pack", id: data._id, name: data.name,
    toObject: () => structuredClone(current)
  };
}

function installGame({ enabled = true, isGM = true, system = "pf2e" } = {}) {
  const settings = new Map([[SETTINGS.experimentalTools, enabled]]);
  globalThis.game = {
    system: { id: system },
    user: { isGM },
    settings: { get: (_module, key) => settings.get(key) },
    i18n: { localize: (key) => key, format: (key, data) => `${key}:${JSON.stringify(data)}` }
  };
}

function installActorStore() {
  const store = new Map();
  globalThis.fromUuid = async (uuid) => store.get(uuid) ?? null;
  globalThis.Actor = {
    create: async (data) => {
      const created = { id: "NEW000000000000A", name: data.name, type: data.type, toObject: () => structuredClone(data), delete: async () => {} };
      store.set("Actor.NEW", created);
      return created;
    }
  };
  return store;
}

const writes = [];
const origCreate = null;

// Gate closed
{
  installGame({ enabled: false });
  const actor = actorDouble(sourceData(5));
  await assert.rejects(prepareCreatureLevelShift(actor, 6), (e) => e.code === "disabled");
  await assert.rejects(createCreatureLevelShift({}), (e) => e.code === "disabled");
}

// Unsupported delta returns problems, no write
{
  installGame();
  const store = installActorStore();
  const source = actorDouble(sourceData(5));
  store.set("Actor.SRC", source);
  const { preview } = await prepareCreatureLevelShift(source, 8);
  assert.ok(Array.isArray(preview.problems) && preview.problems.length > 0, "unsupported delta reports problems");
  // ensure no Actor.create happened
}

// Supported delta previews name
{
  installGame();
  const store = installActorStore();
  const source = actorDouble(sourceData(5));
  store.set("Actor.SRC", source);
  const { preview } = await prepareCreatureLevelShift(source, 6);
  assert.equal(preview.name, "Brute (Level 6)");
}

// Create after preview calls Actor.create once
{
  installGame();
  const store = installActorStore();
  const source = actorDouble(sourceData(5));
  store.set("Actor.SRC", source);
  const prepared = (await prepareCreatureLevelShift(source, 6)).prepared;
  // count writes
  let createCount = 0;
  const orig = globalThis.Actor.create;
  globalThis.Actor.create = async (data) => { createCount++; return orig(data); };
  const result = await createCreatureLevelShift(prepared);
  assert.equal(createCount, 1);
  assert.ok(result.actor);
  assert.equal(result.name, "Brute (Level 6)");
}

// Stale source surfaces STALE_SOURCE, no write
{
  installGame();
  const store = installActorStore();
  const source = actorDouble(sourceData(5));
  store.set("Actor.SRC", source);
  const prepared = (await prepareCreatureLevelShift(source, 6)).prepared;
  // mutate source
  const mutated = actorDouble({ ...sourceData(5), name: "Brute Changed" });
  store.set("Actor.SRC", mutated);
  let thrown = null;
  try { await createCreatureLevelShift(prepared); } catch (e) { thrown = e; }
  assert.ok(thrown, "throws");
  assert.equal(thrown.code, LEVEL_SHIFT_ERROR_CODES.STALE_SOURCE);
}

console.log("creature-tools levelShift tests passed");