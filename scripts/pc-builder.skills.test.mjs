// Production builder with a native-preparation stand-in. This proves sequencing,
// ownership and payloads, not Foundry's actual grant/derived-data implementation.
import assert from "node:assert/strict";
import { CORE_SKILLS } from "./pc-skills.mjs";

let scenario, created;
const events = [];
const clone = (value) => structuredClone(value);
function setPath(object, path, value) {
  const parts = path.split(".");
  let target = object;
  for (const key of parts.slice(0, -1)) target = target[key] ??= {};
  target[parts.at(-1)] = clone(value);
}
class NativeActor {
  constructor(source, embedded = false) {
    this._source = clone(source);
    this.embedded = embedded;
    this.id = "created-character";
    this.prepare();
  }
  prepare() {
    const items = this._source.items ?? [];
    this.items = new Map(items.map((item) => [item._id, { ...item, id: item._id }]));
    const ranks = Object.fromEntries(CORE_SKILLS.map((slug) => [slug, this._source.system.skills?.[slug]?.rank ?? 0]));
    for (const item of items.filter((item) => ["class", "background"].includes(item.type))) {
      for (const slug of item.system.trainedSkills?.value ?? []) ranks[slug] = Math.max(ranks[slug], 1);
    }
    const native = this.embedded ? scenario.nativeRanks : scenario.previewRanks;
    for (const [slug, rank] of Object.entries(native ?? {})) ranks[slug] = Math.max(ranks[slug], rank);
    if (scenario.additive) ranks.medicine += 1;
    this.system = { ...clone(this._source.system),
      skills: Object.fromEntries(CORE_SKILLS.map((slug) => [slug, { rank: ranks[slug] }])),
      abilities: { int: { base: this._source.system.details.level.value === 1 ? scenario.initialInt : scenario.finalInt, mod: scenario.finalInt } },
      attributes: { hp: { max: 37 } },
      autoChanges: scenario.additive ? { "system.skills.{item|flags.skill}.rank": [{ mode: "add", value: 1 }] } : {}
    };
  }
  toObject() { return clone(this._source); }
  clone(changes, options) {
    assert.equal(options.keepId, true);
    if (scenario.cloneFailure && this.embedded) throw new Error("inspection unavailable");
    const source = this.toObject();
    for (const [key, value] of Object.entries(changes)) setPath(source, key, value);
    const actor = new NativeActor(source, this.embedded);
    events.push({ kind: "clone", level: actor._source.system.details.level.value });
    return actor;
  }
  async update(changes) {
    events.push({ kind: this.embedded ? "final-update" : "seed-update", changes: clone(changes) });
    if (scenario.failUpdate === (this.embedded ? "final" : "seed")) throw new Error("save failed");
    for (const [key, value] of Object.entries(changes)) setPath(this._source, key, value);
    this.prepare();
  }
  async createEmbeddedDocuments(type, items, options) {
    events.push({ kind: "embed", ranks: clone(this.system.skills) });
    assert.equal(type, "Item");
    assert.equal(options.keepId, true);
    if (scenario.failEmbed) throw new Error("embed failed");
    this._source.items = clone(items);
    this.embedded = true;
    // Emulate a native source write during creation: it is not module-owned.
    if (scenario.nativeSource) for (const [slug, rank] of Object.entries(scenario.nativeSource)) {
      setPath(this._source, `system.skills.${slug}.rank`, rank);
    }
    this.prepare();
    return [...this.items.values()];
  }
  async updateEmbeddedDocuments(type, updates) {
    events.push({ kind: "lore-update", updates: clone(updates) });
    if (scenario.failLore) throw new Error("lore save failed");
    for (const update of updates) {
      const item = this._source.items.find((item) => item._id === update._id);
      for (const [key, value] of Object.entries(update)) if (key !== "_id") setPath(item, key, value);
    }
    this.prepare();
  }
  async delete() { events.push({ kind: "delete" }); }
}
globalThis.foundry = { utils: { randomID: (() => { let id = 0; return () => `id${++id}`; })() } };
globalThis.CONST = { TOKEN_DISPLAY_MODES: { OWNER_HOVER: 50 } };
globalThis.CONFIG = { PF2E: { languages: {} } };
globalThis.game = { i18n: { localize: (key) => key } };
globalThis.Actor = { async create(source) { events.push({ kind: "create" }); created = new NativeActor(source); return created; } };
const { createCharacterActor } = await import("./pc-builder.mjs");
const doc = (type, system) => ({ type, system, toObject: () => ({ type, name: type, system: clone(system) }) });
function reset(overrides = {}) {
  events.length = 0;
  scenario = { initialInt: 0, finalInt: 0, previewRanks: {}, nativeRanks: {}, ...overrides };
  return {
    concept: { name: "Test", level: 1, keyAbility: "str", skillPriorities: ["medicine", "athletics"], languages: [] },
    resolved: {
      ancestryDoc: doc("ancestry", { boosts: {}, additionalLanguages: {}, languages: { value: [] } }),
      backgroundDoc: doc("background", { boosts: {}, trainedSkills: { value: ["society"], lore: ["Sailing Lore"] } }),
      classDoc: doc("class", { keyAbility: { value: ["str"] }, trainedSkills: { value: ["athletics"], additional: 3 }, skillIncreaseLevels: { value: [3, 5, 7, 9, 11, 13, 15, 17, 19] } }),
      feats: [], spells: [], focusSpells: [], equipment: [], loot: []
    }
  };
}
let args = reset({ initialInt: 2, finalInt: 2, nativeRanks: { medicine: 1 } });
let result = await createCharacterActor(args.concept, args.resolved);
assert.equal(result.actor, created);
assert.equal(result.skillReport.trainingBudget, 5);
assert.equal(result.skillReport.unspentTraining, 0);
const embed = events.find((e) => e.kind === "embed");
assert.equal(embed.ranks.medicine.rank, 1, "provisional preferred training precedes choice predicates");
assert.equal(embed.ranks.athletics.rank, 1, "fixed class ranks seed numeric roll options too");
assert.equal(embed.ranks.society.rank, 1, "background training also precedes preCreate");
assert.equal(created._source.system.skills.medicine.rank, 0, "overlapping module training is refunded");
assert.equal(created.system.skills.medicine.rank, 1, "the native grant survives refunding");
assert.equal(result.skillReport.rows.filter((row) => !row.slug.startsWith("lore:")).length, 8);
assert.equal(events.at(-1).kind, "final-update");
assert.equal(events.at(-1).changes["system.attributes.hp.value"], 37);
assert.ok(!events.some((e) => e.kind === "delete"));

args = reset({ initialInt: -1, finalInt: -1 });
result = await createCharacterActor(args.concept, args.resolved);
assert.equal(result.skillReport.trainingBudget, 2);

args = reset({ initialInt: -1, finalInt: -1 });
args.resolved.classDoc.system.trainedSkills.additional = 0;
args.resolved.backgroundDoc.system.trainedSkills.value = ["athletics"];
result = await createCharacterActor(args.concept, args.resolved);
assert.equal(result.skillReport.trainingBudget, 1, "duplicate fixed training survives negative Int independently");
assert.equal(created.system.skills.medicine.rank, 1);

args = reset({ initialInt: 1, finalInt: 4, nativeSource: { religion: 3 } });
args.concept.level = 10;
result = await createCharacterActor(args.concept, args.resolved);
assert.equal(created._source.system.skills.religion.rank, 3, "native source updates are not cleared as our seed");
assert.ok(result.skillReport.warnings.includes("intelligence-timing"));
assert.ok(events.some((e) => e.kind === "clone" && e.level === 1));

// Real class progression is consumed; a missing schedule never uses the old table.
args = reset(); args.concept.level = 20;
delete args.resolved.classDoc.system.skillIncreaseLevels;
result = await createCharacterActor(args.concept, args.resolved);
assert.ok(result.skillReport.warnings.includes("schedule"));
assert.ok(result.skillReport.rows.every((row) => row.rank === 1));

args = reset({ additive: true });
result = await createCharacterActor(args.concept, args.resolved);
assert.ok(result.skillReport.warnings.includes("native-rank-rule"));
assert.equal(created._source.system.skills.medicine?.rank ?? 0, 0);
assert.equal(created.system.skills.medicine.rank, 1, "an additive native grant is not doubled by seeding");

args = reset({ cloneFailure: true });
result = await createCharacterActor(args.concept, args.resolved);
assert.ok(result.skillReport.warnings.includes("native-data"));
assert.ok(!events.some((e) => e.kind === "delete"));

for (const failUpdate of ["seed", "final"]) {
  args = reset({ failUpdate });
  await assert.rejects(createCharacterActor(args.concept, args.resolved), /save failed/);
  assert.equal(events.at(-1).kind, "delete");
}

// A newly refunded increase can go to the existing background Lore item.
const capped = Object.fromEntries(CORE_SKILLS.map((slug) => [slug, 2]));
args = reset({ previewRanks: { ...capped, medicine: 1 }, nativeRanks: capped });
args.concept.level = 3;
args.resolved.classDoc.system.trainedSkills.additional = 0;
result = await createCharacterActor(args.concept, args.resolved);
assert.ok(events.some((e) => e.kind === "lore-update"));
assert.equal(result.skillReport.rows.find((row) => row.name === "Sailing Lore").rank, 2);
args = reset({ previewRanks: { ...capped, medicine: 1 }, nativeRanks: capped, failLore: true });
args.concept.level = 3;
args.resolved.classDoc.system.trainedSkills.additional = 0;
await assert.rejects(createCharacterActor(args.concept, args.resolved), /lore save failed/);
assert.equal(events.at(-1).kind, "delete");
console.log("pc-builder.skills.test.mjs: native seeding, ownership, finalization and rollback passed");
