// Behavioral regression check for new-PC finalization. This imports the real
// createCharacterActor() with only the Foundry surface it reaches mocked.
// Run: node scripts/pc-builder.finalization.test.mjs
import assert from "node:assert/strict";

let scenario;
const events = [];

globalThis.foundry = { utils: { randomID: (() => { let id = 0; return () => `id-${++id}`; })() } };
globalThis.CONST = { TOKEN_DISPLAY_MODES: { OWNER_HOVER: 50 } };
globalThis.CONFIG = { PF2E: { languages: { dwarven: "Dwarven", elven: "Elven" } } };
globalThis.game = { i18n: { localize: (label) => label } };
globalThis.Actor = {
  async create(data) {
    events.push("create");
    scenario.actorData = data;
    return {
      // The empty actor's derived data is deliberately different. Reading
      // HP or Int before native item preparation finishes must fail the test.
      system: { attributes: { hp: { value: 1, max: 1 } }, abilities: { int: { mod: 0 } } },
      async createEmbeddedDocuments(type, items, options) {
        events.push("embedded:start");
        await Promise.resolve();
        events.push("embedded:end");
        assert.equal(type, "Item");
        assert.equal(options.keepId, true, "native grant creation must retain explicit ABC ids");
        if (scenario.embedError) throw scenario.embedError;
        this.system = scenario.system;
        return items;
      },
      async update(changes) {
        events.push("update");
        scenario.updates.push(changes);
        if (scenario.updateError) throw scenario.updateError;
      },
      async delete() {
        events.push("delete");
        if (scenario.deleteError) throw scenario.deleteError;
      }
    };
  }
};

const { createCharacterActor } = await import("./pc-builder.mjs");

function doc(type, system = {}) {
  return {
    type,
    system,
    toObject: () => ({ name: type, type, system: structuredClone(system) })
  };
}

function input() {
  return {
    concept: {
      name: "Test Character", level: 1, keyAbility: "str", languages: ["dwarven", "elven"],
      backstory: "", appearance: "", personality: "", alignmentFlavor: "", likes: "", dislikes: "",
      allies: "", enemies: "", organizations: "", age: "", gender: "", height: "", weight: "",
      ethnicity: "", nationality: ""
    },
    resolved: {
      ancestryDoc: doc("ancestry", {
        boosts: {}, additionalLanguages: { count: 1, value: ["dwarven", "elven"] }, languages: { value: ["common"] }
      }),
      backgroundDoc: doc("background", { boosts: {}, trainedSkills: { value: [] } }),
      classDoc: doc("class", { keyAbility: { value: ["str"] }, trainedSkills: { value: [], additional: 0 } }),
      heritageDoc: null, feats: [], spells: [], focusSpells: [], equipment: [], loot: []
    }
  };
}

function reset(overrides = {}) {
  events.length = 0;
  scenario = {
    system: { attributes: { hp: { max: 37 } }, abilities: { int: { mod: 1 } } },
    updates: [],
    ...overrides
  };
}

// Native item creation must finish before the sole final actor update. That
// update uses the derived current HP maximum and also preserves the existing
// post-create Intelligence-language expansion.
reset();
{
  const { concept, resolved } = input();
  await createCharacterActor(concept, resolved);
}
assert.deepEqual(events, ["create", "embedded:start", "embedded:end", "update"]);
assert.deepEqual(scenario.actorData.system.attributes.hp, { temp: 0 }, "no pre-create HP sentinel is seeded");
assert.deepEqual(scenario.updates, [{
  "system.attributes.hp.value": 37,
  "system.details.languages.value": ["dwarven", "elven"]
}], "finalization writes only derived current HP and any Int-bonus languages, never HP max or temp");

reset({ system: { attributes: { hp: { value: 11, max: 22 } }, abilities: { int: { mod: 0 } } } });
{
  const { concept, resolved } = input();
  await createCharacterActor(concept, resolved);
}
assert.deepEqual(scenario.updates, [{ "system.attributes.hp.value": 22 }],
  "a character without Int-bonus languages still receives its final full HP");

// A rejected final actor update is part of creation, so it rolls the actor
// back and exposes the original update error.
const finalUpdateError = new Error("final update rejected");
reset({ updateError: finalUpdateError });
await assert.rejects(async () => {
  const { concept, resolved } = input();
  await createCharacterActor(concept, resolved);
}, (error) => error === finalUpdateError);
assert.deepEqual(events, ["create", "embedded:start", "embedded:end", "update", "delete"]);

// A failed rollback must not replace the native item-lifecycle failure that
// caused it; callers need the original exception to diagnose the creation.
const nativeError = new Error("native item creation failed");
reset({ embedError: nativeError, deleteError: new Error("rollback failed") });
await assert.rejects(async () => {
  const { concept, resolved } = input();
  await createCharacterActor(concept, resolved);
}, (error) => error === nativeError);
assert.deepEqual(events, ["create", "embedded:start", "embedded:end", "delete"]);

// A missing/non-finite derived maximum is unusable: finalization must reject
// it rather than write a made-up value, and still roll the actor back.
for (const max of [undefined, null, "22", NaN, Infinity, 0, -1]) {
  reset({ system: { attributes: { hp: { max } }, abilities: { int: { mod: 0 } } } });
  await assert.rejects(async () => {
    const { concept, resolved } = input();
    await createCharacterActor(concept, resolved);
  }, /no usable derived HP maximum/);
  assert.deepEqual(events, ["create", "embedded:start", "embedded:end", "delete"]);
}

console.log("pc-builder finalization regression check: native lifecycle and rollback assertions passed");
