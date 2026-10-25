// Production reskin boundary regressions. The real ai.mjs, compendium.mjs and
// reskin.mjs run against fake Foundry globals and a fake provider endpoint, so
// nothing reaches a live world or a paid model. Covers authorization, exact
// source selection, bounded AI output, stale and tampered sources, cancellation,
// rollback of only the new actor, and presentation after commit.
// Run: node tests/reskin.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SETTINGS } from "../scripts/settings.mjs";
import { AI_TASK, completionOptionsFor } from "../scripts/ai-task-profiles.mjs";

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
  [SETTINGS.sourcePacks, { bestiaryActors: ["pf2e.pathfinder-bestiary"] }]
]);

// Fake Foundry state. Every write and every mutation of a source is recorded.
const writes = [];
const deleted = [];
const sourceMutations = [];
const requests = [];
const replies = [];
let nextCreate = null;
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

/** Foundry-like persistence: copies the payload, applies defaults, and records deletes. */
function persistedActor(payload, { alter } = {}) {
  const stored = structuredClone(payload);
  for (const item of stored.items) item.system.description.gm ??= "";
  alter?.(stored);
  const actor = {
    id: `NewActor${String(writes.length).padStart(8, "0")}`,
    name: stored.name,
    type: stored.type,
    toObject: () => structuredClone(stored),
    delete: async () => { deleted.push(actor.id); }
  };
  return actor;
}

globalThis.Actor = {
  create: async (payload, options) => {
    writes.push({ payload: structuredClone(payload), options });
    return nextCreate ? nextCreate(payload) : persistedActor(payload);
  }
};

function hang(signal) {
  const abortError = () => Object.assign(new Error("aborted"), { name: "AbortError" });
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((_, reject) => signal.addEventListener("abort", () => reject(abortError()), { once: true }));
}

globalThis.fetch = async (_url, options) => {
  requests.push(JSON.parse(options.body));
  const reply = replies.shift();
  if (!reply) throw new Error("unexpected provider call");
  if (reply.hang) {
    reply.onRequest?.();
    return hang(options.signal);
  }
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(reply.content) }, finish_reason: "stop" }],
    usage: reply.usage ?? USAGE
  }), { headers: { "content-type": "application/json" } });
};

const reskin = await import("../scripts/reskin.mjs");
const { prepareReskinPlan, commitReskinPlan, listReskinSourceCandidates, reskinPlanPreview } = reskin;
const { generateReskinFlavor } = await import("../scripts/ai.mjs");
assert.equal(typeof generateReskinFlavor, "function", "the flavor operation is exported from the AI client");

function reset() {
  writes.length = 0;
  deleted.length = 0;
  sourceMutations.length = 0;
  requests.length = 0;
  replies.length = 0;
  sourceData = sourceActorData();
  nextCreate = null;
  game.user = { isGM: true };
  game.system = { id: "pf2e" };
}

async function expectReskinError(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    return true;
  });
}

async function expectCancelled(promise) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.cancelled, true, `expected a cancelled error, got: ${error.message}`);
    return true;
  });
}

const allow = () => true;
const prepare = (overrides = {}) => prepareReskinPlan({ sourceUuid: SOURCE_UUID, prompt: PROMPT, authorize: allow, ...overrides });
const commit = (plan, overrides = {}) => commitReskinPlan(plan, { authorize: allow, ...overrides });

// Authorization: a GM in PF2e with an injected gate, rechecked before writes.
reset();
game.user = { isGM: false };
await expectReskinError(prepare(), "unauthorized");
game.user = { isGM: true };
game.system = { id: "dnd5e" };
await expectReskinError(prepare(), "unauthorized");
game.system = { id: "pf2e" };
await expectReskinError(prepare({ authorize: undefined }), "unauthorized");
await expectReskinError(prepare({ authorize: () => "yes" }), "unauthorized");
await expectReskinError(prepare({ authorize: () => { throw new Error("gate offline"); } }), "unauthorized");
assert.equal(requests.length, 0, "no provider spend happens before authorization succeeds");
await expectReskinError(listReskinSourceCandidates({}), "unauthorized");

// Exact enabled bestiary NPCs only: no world actors, disabled packs, or other document types.
reset();
await expectReskinError(prepare({ sourceUuid: "Actor.Hb0bg0bl1nCaptn1" }), "invalid-source");
await expectReskinError(prepare({ sourceUuid: `Compendium.pf2e.pathfinder-monster-core.Actor.${SOURCE_ID}` }), "invalid-source");
await expectReskinError(prepare({ sourceUuid: "Compendium.pf2e.pathfinder-bestiary.Actor.Chr0nkSoldierId01" }), "invalid-source");
await expectReskinError(prepare({ sourceUuid: "Compendium.pf2e.pathfinder-bestiary.Actor.Missing000000000" }), "invalid-source");
await expectReskinError(prepare({ prompt: "  " }), "invalid-prompt");
await expectReskinError(prepare({ prompt: "x".repeat(1001) }), "invalid-prompt");
assert.equal(requests.length, 0, "invalid sources and prompts are refused before any provider spend");
assert.deepEqual(
  (await listReskinSourceCandidates({ authorize: allow })).map((candidate) => candidate.uuid),
  [SOURCE_UUID],
  "candidates are exact enabled NPC compendium uuids only"
);

// Happy path: one bounded flavor call, a frozen issued plan, and one new actor.
reset();
replies.push({ content: { ...GOOD_FLAVOR, biography: "Born in fog.\r\n\r\nShe counts the hours." }, usage: USAGE });
const plan = await prepare();
assert.equal(requests.length, 1, "exactly one bounded AI call is made");
assert.equal(plan.biography, "Born in fog.\n\nShe counts the hours.",
  "CRLF paragraph breaks from the model become the paragraph breaks the note renders");
const sent = requests[0];
assert.equal(sent.response_format.type, "json_object");
assert.equal(sent.max_tokens, 1200, "the flavor task has its own bounded output budget");
assert.match(sent.messages[1].content, /"gmDirection":"A haunted bell-ringer who never sleeps\."/,
  "the GM direction is quoted JSON data, not free prose");
assert.doesNotMatch(sent.messages[1].content, /spy|privateNotes|Grab|items/,
  "private notes, items and enricher text never reach the model");
assert.equal(writes.length, 0, "preparation never writes an actor");
assert.ok(Object.isFrozen(plan), "the plan is frozen");
assert.deepEqual(plan.usage, { prompt: 100, completion: 60, total: 160, estimated: false });
assert.deepEqual(reskinPlanPreview(plan).changes, ["name", "publicNotes"]);

const present = [];
const result = await commit(plan, { present: async (actor) => { present.push(actor.name); } });
assert.equal(writes.length, 1, "commit creates exactly one actor");
const { payload, options } = writes[0];
assert.equal(payload._id, undefined, "the reskin is a new actor, not a source update");
assert.equal(options.renderSheet, false, "presentation is left to the caller after commit");
assert.equal(options.pack, undefined, "the reskin never writes to a compendium");
assert.equal(options.keepEmbeddedIds, true, "embedded ids survive for spell links and grants");
assert.equal(payload.name, "Mara Vantor");
assert.equal(payload.prototypeToken.name, "Mara Vantor");
assert.ok(payload.system.details.publicNotes.startsWith(SOURCE_NOTES), "published notes are the exact prefix");
assert.match(payload.system.details.publicNotes, /<h3>Flavor<\/h3><p>A tall, quiet warden of the bell tower\.<\/p>/);
assert.deepEqual(payload.items.map((item) => item._id), ["Strike0000000001", "Stun0000000000001"]);
assert.equal(payload.system.details.privateNotes, "The captain is a spy.", "GM-private notes survive unchanged");
assert.equal(result.actor.name, "Mara Vantor");
assert.equal(result.presentationError, null);
assert.deepEqual(present, ["Mara Vantor"], "presentation runs after the commit point");
assert.deepEqual(deleted, [], "a successful reskin never deletes anything");
assert.deepEqual(sourceMutations, [], "the published source is never updated or deleted");

// Hostile AI text is re-asked once, then rejected with usage from both attempts.
reset();
const hostile = { ...GOOD_FLAVOR, flavor: "@Check[type:reflex|dc:20] shudders." };
replies.push({ content: hostile, usage: USAGE }, { content: hostile, usage: USAGE });
await assert.rejects(prepare(), (error) => {
  assert.match(error.message, /square brackets, which Foundry reads as enrichers/);
  assert.equal(error.usage.total, 320, "a rejected reply still reports every attempt's usage");
  return true;
});
assert.equal(requests.length, 2, "structural rejection retries exactly once");
assert.equal(writes.length, 0);

reset();
replies.push({ content: { ...GOOD_FLAVOR, name: "<img src=x onerror=alert(1)>" }, usage: USAGE });
replies.push({ content: { ...GOOD_FLAVOR, name: "<img src=x onerror=alert(1)>" }, usage: USAGE });
await assert.rejects(prepare(), /name contains markup/);
assert.equal(writes.length, 0, "hostile markup in the name is never written");

reset();
replies.push({ content: { ...GOOD_FLAVOR, biography: "Sees 2d6 skeletons at dusk." }, usage: USAGE });
replies.push({ content: { ...GOOD_FLAVOR, biography: "Sees 2d6 skeletons at dusk." }, usage: USAGE });
await assert.rejects(prepare(), /game statistic/);
assert.equal(writes.length, 0, "numeric mechanics in flavor are refused");

// Stale source: a GM edit after preview blocks the write and asks for a new preview.
reset();
replies.push({ content: GOOD_FLAVOR, usage: USAGE });
const stalePlan = await prepare();
sourceData.system.attributes.hp.max = 99;
await expectReskinError(commit(stalePlan), "stale-source");
assert.equal(writes.length, 0, "a stale source never reaches Actor.create");

// Public notes are copied into the reskin, so an unreviewed edit there is stale too.
reset();
replies.push({ content: GOOD_FLAVOR, usage: USAGE });
const notesPlan = await prepare();
sourceData.system.details.publicNotes = "<p>Edited after the preview.</p>";
await expectReskinError(commit(notesPlan), "stale-source");
assert.equal(writes.length, 0, "a public-notes edit after preview is refused before creation");

// Tampered persistence: a mechanical change is rolled back, and only the new actor is deleted.
reset();
replies.push({ content: GOOD_FLAVOR, usage: USAGE });
const tamperPlan = await prepare();
nextCreate = (payload) => persistedActor(payload, {
  alter: (stored) => { stored.items[0].system.description.value = "<p>Strike @Damage[3d8[slashing]] damage.</p>"; }
});
await expectReskinError(commit(tamperPlan), "verification-failed");
assert.equal(writes.length, 1);
assert.equal(deleted.length, 1, "exactly the new actor is rolled back");
assert.deepEqual(sourceMutations, [], "rollback never touches the published source");

// A failed rollback is reported as a survivor so retry cannot duplicate it silently.
reset();
replies.push({ content: GOOD_FLAVOR, usage: USAGE });
const survivorPlan = await prepare();
nextCreate = (payload) => {
  const actor = persistedActor(payload, { alter: (stored) => { stored.name = "Renamed"; } });
  actor.delete = async () => { throw new Error("permission denied"); };
  return actor;
};
await assert.rejects(commit(survivorPlan), (error) => {
  assert.equal(error.code, "verification-failed");
  assert.equal(error.simplyPF2eRollbackActor?.name, "Renamed", "the survivor is identified for the caller");
  return true;
});

// Cancellation: before the AI call, during it, before the write, and after the write.
reset();
const preAborted = new AbortController();
preAborted.abort();
await expectCancelled(prepare({ signal: preAborted.signal }));
assert.equal(requests.length, 0, "cancelling before preparation spends nothing");

reset();
const inFlight = new AbortController();
replies.push({ hang: true, onRequest: () => inFlight.abort() });
await expectCancelled(prepare({ signal: inFlight.signal }));
assert.equal(writes.length, 0);

reset();
replies.push({ content: GOOD_FLAVOR, usage: USAGE });
const reusable = await prepare();
const beforeWrite = new AbortController();
beforeWrite.abort();
await expectCancelled(commit(reusable, { signal: beforeWrite.signal }));
assert.equal(writes.length, 0, "cancelling before the write creates nothing");
const retried = await commit(reusable);
assert.equal(retried.actor.name, "Mara Vantor", "an uncommitted plan remains usable after cancellation");

reset();
replies.push({ content: GOOD_FLAVOR, usage: USAGE });
const afterCreate = await prepare();
const raced = new AbortController();
nextCreate = (payload) => {
  const actor = persistedActor(payload);
  raced.abort();
  return actor;
};
await expectCancelled(commit(afterCreate, { signal: raced.signal }));
assert.equal(writes.length, 1);
assert.equal(deleted.length, 1, "cancellation after the write rolls back the new actor");
assert.deepEqual(sourceMutations, []);

// Authorization is rechecked immediately before the write.
reset();
replies.push({ content: GOOD_FLAVOR, usage: USAGE });
const gated = await prepare();
let authCalls = 0;
await expectReskinError(commit(gated, { authorize: () => ++authCalls === 1 }), "unauthorized");
assert.equal(authCalls, 2, "the gate is checked at commit and again before writing");
assert.equal(writes.length, 0);

// Presentation can fail after the commit point without deleting a verified actor.
reset();
replies.push({ content: GOOD_FLAVOR, usage: USAGE });
const presentPlan = await prepare();
const presented = await commit(presentPlan, { present: async () => { throw new Error("sheet failed"); } });
assert.equal(presented.presentationError.message, "sheet failed");
assert.equal(writes.length, 1);
assert.deepEqual(deleted, [], "a presentation failure never deletes the committed actor");

// Plans are accepted only as issued objects, never as copies or forged data.
reset();
await expectReskinError(commit({ ...plan }), "invalid-plan");
await expectReskinError(commit(undefined), "invalid-plan");
assert.throws(() => reskinPlanPreview({ ...plan }), (error) => error.code === "invalid-plan");
assert.equal(writes.length, 0);

// The reskin uses the bounded flavor profile: deterministic off, creative temperature on.
assert.deepEqual(
  completionOptionsFor(AI_TASK.RESKIN_FLAVOR, { configuredTemperature: 1.2, configuredMaxTokens: 8000 }),
  { temperature: 1.2, maxTokens: 1200, reasoningEffort: "none", thinkingType: "disabled" }
);

console.log("reskin.test.mjs: authorization, source, AI bounds, stale/tamper, cancellation, rollback, and presentation regressions passed");
