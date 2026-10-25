// Creature tools regressions. The real creature-tools.mjs runs over the real
// C03 reskin backend with fake Foundry globals and a fake provider endpoint, so
// nothing reaches a live world or a paid model. Covers the experimental gate at
// every flow entry and before every native write, source immutability after a
// reskin, and the native elite/weak adapter (transitions, refusals, verification,
// rollback). Run: node tests/creature-tools.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SETTINGS } from "../scripts/settings.mjs";

const SOURCE_ID = "Hb0bg0bl1nCaptn1";
const SOURCE_UUID = `Compendium.pf2e.pathfinder-bestiary.Actor.${SOURCE_ID}`;
const SOURCE_NOTES = "<p>Drills endlessly, @UUID[Compendium.pf2e.bestiary-ability-glossary-srd.Item.Grab]{Grab} foes.</p>";
const USAGE = { prompt_tokens: 100, completion_tokens: 60, total_tokens: 160 };
const GOOD_FLAVOR = {
  name: "Mara Vantor",
  flavor: "A tall, quiet warden of the bell tower.",
  biography: "Born in fog and raised by bells.\n\nShe still counts the hours aloud."
};
const PROMPT = "A haunted bell-ringer who never sleeps.";

const settings = new Map([
  [SETTINGS.apiBaseUrl, "http://localhost:11434/v1"], [SETTINGS.apiKey, ""], [SETTINGS.apiKeyBaseUrl, ""],
  [SETTINGS.model, "test-model"], [SETTINGS.temperature, 0.8], [SETTINGS.maxTokens, 8000], [SETTINGS.requestTimeout, 90],
  [SETTINGS.sourcePacks, { bestiaryActors: ["pf2e.pathfinder-bestiary"] }],
  [SETTINGS.experimentalTools, true]
]);

// Fake Foundry state. Every write and every mutation of a source is recorded.
const writes = [];
const sourceMutations = [];
const requests = [];
const replies = [];
let sourceData = null;

// Unchanged published PF2e 8.5.0 feat source: real @UUID and @Check enrichers.
const STUNNING_BLOWS = JSON.parse(await readFile(new URL("./fixtures/npc-abilities/stunning-blows.json", import.meta.url), "utf8"));

function sourceActorData() {
  return {
    _id: SOURCE_ID, name: "Hobgoblin Captain", type: "npc", img: "icons/hobgoblin.webp",
    prototypeToken: { name: "Hobgoblin Captain", texture: { src: "icons/hobgoblin.webp" }, width: 1, height: 1 },
    flags: {}, effects: [], folder: null, sort: 0, ownership: { default: 0 },
    _stats: { coreVersion: "14.365", systemVersion: "8.5.0", compendiumSource: null },
    system: {
      details: { level: { value: 4 }, blurb: "A drill sergeant.", publicNotes: SOURCE_NOTES, privateNotes: "The captain is a spy." },
      attributes: { hp: { value: 60, max: 60 }, ac: { value: 20 } },
      traits: { value: ["humanoid", "goblin"], rarity: "common", size: { value: "med" } }
    },
    items: [
      {
        _id: "Strike0000000001", type: "melee", name: "Spear", img: "icons/spear.webp",
        _stats: { compendiumSource: "Compendium.pf2e.bestiary-ability-glossary-srd.Item.Grab" },
        system: { description: { value: "<p>Strike @Damage[2d8[slashing]] damage.</p>" }, bonus: { value: 12 }, rules: [] }
      },
      { ...structuredClone(STUNNING_BLOWS), _id: "Stun0000000000001" }
    ]
  };
}

const sourceDoc = {
  uuid: SOURCE_UUID, type: "npc", name: "Hobgoblin Captain",
  toObject: () => structuredClone(sourceData),
  update: async () => sourceMutations.push("update"),
  delete: async () => sourceMutations.push("delete")
};

const bestiary = {
  metadata: { type: "Actor", label: "Pathfinder Bestiary" },
  title: "Pathfinder Bestiary",
  collection: "pf2e.pathfinder-bestiary",
  async getIndex() {
    return [
      { _id: SOURCE_ID, name: "Hobgoblin Captain", type: "npc",
        system: { details: { level: { value: 4 } }, traits: { rarity: "common", size: { value: "med" } } } },
      { _id: "Chr0nkSoldierId01", name: "Sorcerer", type: "character" }
    ];
  },
  async getDocument(id) { return id === SOURCE_ID ? sourceDoc : null; }
};
const unlisted = {
  metadata: { type: "Actor", label: "Monster Core" }, title: "Monster Core", collection: "pf2e.pathfinder-monster-core",
  async getIndex() { return [{ _id: "Monstr0000000001", name: "Ogre", type: "npc" }]; },
  async getDocument() { return null; }
};

globalThis.game = {
  user: { isGM: true },
  system: { id: "pf2e" },
  settings: { get: (_moduleId, key) => settings.get(key) },
  i18n: { localize: (key) => key, format: (key, data) => `${key}:${JSON.stringify(data)}` },
  packs: new Map([[bestiary.collection, bestiary], [unlisted.collection, unlisted]])
};

globalThis.Actor = {
  create: async (payload, options) => {
    writes.push({ payload: structuredClone(payload), options });
    const stored = structuredClone(payload);
    for (const item of stored.items) item.system.description.gm ??= "";
    return { id: `NewActor${String(writes.length).padStart(8, "0")}`, name: stored.name, type: stored.type, toObject: () => structuredClone(stored), delete: async () => {} };
  }
};

globalThis.fetch = async (_url, options) => {
  requests.push(JSON.parse(options.body));
  const reply = replies.shift();
  if (!reply) throw new Error("unexpected provider call");
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(reply.content) }, finish_reason: "stop" }],
    usage: reply.usage ?? USAGE
  }), { headers: { "content-type": "application/json" } });
};

const creature = await import("../scripts/creature-tools.mjs");
const { EXPERIMENTAL_REFUSAL } = await import("../scripts/experimental-tools.mjs");
const {
  applyCreatureAdjustment, previewCreatureAdjustment, prepareCreatureReskin, createCreatureReskin,
  listCreatureReskinSources, CREATURE_CODES
} = creature;

function reset() {
  writes.length = 0;
  sourceMutations.length = 0;
  requests.length = 0;
  replies.length = 0;
  sourceData = sourceActorData();
  game.user = { isGM: true };
  game.system = { id: "pf2e" };
  settings.set(SETTINGS.experimentalTools, true);
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    return true;
  });
}

/**
 * Fake PF2e NPC. applyAdjustment mirrors NPCPF2e#applyAdjustment: a no-op in the
 * requested state, otherwise one write of adjustment and HP. Test switches:
 * dropWrites (accepted but not persisted, N times), failFrom (throw from the
 * Nth call on), and revokeOnWrite (revoke the experimental gate during the write).
 */
function npcActor({ id = "Npc0000000000001", adjustment = null, hp = 20, pack = null, isToken = false, type = "npc" } = {}) {
  const actor = {
    id, name: "Guard", type, pack, isToken,
    system: { attributes: { adjustment, hp: { value: hp, max: 20 } } },
    calls: [],
    dropWrites: 0,
    failFrom: Infinity,
    revokeOnWrite: false,
    async applyAdjustment(next) {
      actor.calls.push(next);
      if (actor.revokeOnWrite) settings.set(SETTINGS.experimentalTools, false);
      if (actor.calls.length > actor.failFrom) throw new Error("native update rejected");
      if (actor.system.attributes.adjustment === next) return;
      if (actor.dropWrites > 0) {
        actor.dropWrites -= 1;
        return;
      }
      const hpFor = (value) => (value === "elite" ? 2 : value === "weak" ? -2 : 0);
      actor.system.attributes.hp.value = Math.max(0, actor.system.attributes.hp.value + hpFor(next) - hpFor(actor.system.attributes.adjustment));
      actor.system.attributes.adjustment = next;
    }
  };
  return actor;
}

// The experimental gate refuses every flow entry and every native write, with no side effects.
reset();
settings.set(SETTINGS.experimentalTools, false);
const offNpc = npcActor();
await expectCode(listCreatureReskinSources(), EXPERIMENTAL_REFUSAL.DISABLED);
await expectCode(prepareCreatureReskin({ sourceUuid: SOURCE_UUID, prompt: PROMPT }), EXPERIMENTAL_REFUSAL.DISABLED);
await expectCode(createCreatureReskin({}), EXPERIMENTAL_REFUSAL.DISABLED);
await expectCode(previewCreatureAdjustment(offNpc, "elite"), EXPERIMENTAL_REFUSAL.DISABLED);
await expectCode(applyCreatureAdjustment(offNpc, "elite"), EXPERIMENTAL_REFUSAL.DISABLED);
assert.equal(requests.length, 0, "a disabled gate spends no provider tokens");
assert.equal(writes.length, 0, "a disabled gate writes no actor");
assert.deepEqual(offNpc.calls, [], "a disabled gate performs no native adjustment");

reset();
game.user = { isGM: false };
await expectCode(applyCreatureAdjustment(npcActor(), "elite"), EXPERIMENTAL_REFUSAL.NOT_GM);
reset();
game.system = { id: "dnd5e" };
await expectCode(listCreatureReskinSources(), EXPERIMENTAL_REFUSAL.WRONG_SYSTEM);

// Gate revoked between prepare and create: the reviewed plan is never committed.
reset();
replies.push({ content: GOOD_FLAVOR });
const { plan: revokedPlan } = await prepareCreatureReskin({ sourceUuid: SOURCE_UUID, prompt: PROMPT });
settings.set(SETTINGS.experimentalTools, false);
await expectCode(createCreatureReskin(revokedPlan), EXPERIMENTAL_REFUSAL.DISABLED);
assert.equal(writes.length, 0, "a revoked gate prevents the actor create");

// Happy path over the real C03 backend: one new actor, and the source is unchanged.
reset();
assert.deepEqual(
  (await listCreatureReskinSources()).map((candidate) => candidate.uuid),
  [SOURCE_UUID],
  "candidates are exact enabled bestiary NPC uuids"
);
replies.push({ content: GOOD_FLAVOR });
const sourceBefore = JSON.stringify(sourceData);
const { plan, preview } = await prepareCreatureReskin({ sourceUuid: SOURCE_UUID, prompt: PROMPT });
assert.equal(preview.name, "Mara Vantor", "the preview shows the reviewed name");
assert.equal(writes.length, 0, "preparing a reskin writes nothing");
const presented = [];
const result = await createCreatureReskin(plan, { present: (actor) => presented.push(actor.id) });
assert.equal(writes.length, 1, "the reskin creates exactly one actor");
assert.equal(writes[0].payload.name, "Mara Vantor");
assert.equal(presented.length, 1, "the new actor is presented after commit");
assert.equal(result.actor.id, presented[0]);
assert.deepEqual(sourceMutations, [], "the source actor is never updated or deleted");
assert.equal(JSON.stringify(sourceData), sourceBefore, "the source actor data is unchanged");

// Preview is read-only and reports only the transition.
reset();
const previewNpc = npcActor({ adjustment: "weak", hp: 14 });
const transition = await previewCreatureAdjustment(previewNpc, "elite");
assert.deepEqual(transition.from, { name: "Guard", adjustment: "weak", hp: 14, hpMax: 20 });
assert.equal(transition.to, "elite");
assert.equal(transition.changes, true);
assert.deepEqual(previewNpc.calls, [], "preview performs no native write");

// Native adapter transitions: each change goes through applyAdjustment, and a same-state request writes nothing.
reset();
const guard = npcActor();
let outcome = await applyCreatureAdjustment(guard, "elite");
assert.equal(outcome.changed, true);
assert.equal(outcome.after.adjustment, "elite");
assert.equal(outcome.after.hp, 22, "HP comes from the native update");
outcome = await applyCreatureAdjustment(guard, "weak");
assert.equal(outcome.after.adjustment, "weak");
outcome = await applyCreatureAdjustment(guard, "normal");
assert.equal(outcome.after.adjustment, "normal");
assert.equal(guard.system.attributes.adjustment, null, "normal is stored natively as null");
outcome = await applyCreatureAdjustment(guard, "normal");
assert.equal(outcome.changed, false, "an already-matching state writes nothing");
assert.deepEqual(guard.calls, ["elite", "weak", null], "one native call per real transition");

// Refusals: only existing world NPCs, and only elite, weak, or normal.
reset();
await expectCode(applyCreatureAdjustment(npcActor({ pack: "pf2e.pathfinder-bestiary" }), "elite"), CREATURE_CODES.NOT_ADJUSTABLE);
await expectCode(applyCreatureAdjustment(npcActor({ isToken: true }), "elite"), CREATURE_CODES.NOT_ADJUSTABLE);
await expectCode(applyCreatureAdjustment(npcActor({ type: "character" }), "elite"), CREATURE_CODES.NOT_ADJUSTABLE);
await expectCode(applyCreatureAdjustment(npcActor(), "legendary"), CREATURE_CODES.INVALID_TARGET);

// A native write that does not persist is verified, restored, and reported.
reset();
const dropped = npcActor();
dropped.dropWrites = 1;
await expectCode(applyCreatureAdjustment(dropped, "elite"), CREATURE_CODES.VERIFICATION_FAILED);
assert.equal(dropped.system.attributes.adjustment, null, "the previous state is restored");
assert.deepEqual(dropped.calls, ["elite", null], "the restore goes through the same native call");

// The gate is rechecked before the restore write: a revoked gate cannot restore.
reset();
const revoking = npcActor();
revoking.dropWrites = 1;
revoking.revokeOnWrite = true;
await assert.rejects(applyCreatureAdjustment(revoking, "elite"), (error) => {
  assert.equal(error.code, CREATURE_CODES.ROLLBACK_FAILED);
  assert.equal(error.cause.code, EXPERIMENTAL_REFUSAL.DISABLED);
  return true;
});
assert.deepEqual(revoking.calls, ["elite"], "no restore write happens after the gate is revoked");

// A failing restore is reported as rollback-failed.
reset();
const stuck = npcActor({ adjustment: "weak" });
stuck.dropWrites = 1;
stuck.failFrom = 1;
await expectCode(applyCreatureAdjustment(stuck, "elite"), CREATURE_CODES.ROLLBACK_FAILED);

// A rejected native write propagates unchanged and leaves the NPC untouched.
reset();
const rejected = npcActor();
rejected.failFrom = 0;
await assert.rejects(applyCreatureAdjustment(rejected, "elite"), /native update rejected/);
assert.equal(rejected.system.attributes.adjustment, null);

console.log("creature-tools tests passed");
