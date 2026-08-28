// Production-import regression check: ChoiceSet callback batching happens on
// final safe item sources before Actor.create, never after native item create.
// Run: node scripts/pc-builder.choice-callback.test.mjs
import assert from "node:assert/strict";

const events = [];
globalThis.foundry = { utils: { randomID: (() => { let id = 0; return () => `id-${++id}`; })() } };
globalThis.CONST = { TOKEN_DISPLAY_MODES: { OWNER_HOVER: 50 } };
globalThis.CONFIG = { PF2E: { languages: {} } };
globalThis.game = { i18n: { localize: (label) => label } };
globalThis.Actor = {
  async create() {
    events.push("actor-create");
    return {
      system: { attributes: { hp: { max: 20 } }, abilities: { int: { mod: 0 } } },
      async createEmbeddedDocuments(type, items, options) {
        events.push("embedded-create");
        assert.equal(type, "Item");
        assert.equal(options.keepId, true);
        const choice = items.find((item) => item.type === "ancestry").system.rules[0];
        assert.equal(choice.selection, "two", "validated callback choice reaches the final native item source");
      },
      async update() { events.push("actor-update"); },
      async delete() { throw new Error("unexpected rollback"); }
    };
  }
};

const { createCharacterActor } = await import("./pc-builder.mjs");
const doc = (type, system) => ({ type, system, toObject: () => ({ name: type, type, system: structuredClone(system) }) });
const concept = {
  name: "Choice Test", level: 1, keyAbility: "str", languages: [], backstory: "", appearance: "",
  personality: "", alignmentFlavor: "", likes: "", dislikes: "", allies: "", enemies: "", organizations: "",
  age: "", gender: "", height: "", weight: "", ethnicity: "", nationality: ""
};
const resolved = {
  ancestryDoc: doc("ancestry", { boosts: {}, additionalLanguages: {}, languages: { value: [] }, rules: [{
    key: "ChoiceSet", flag: "test", prompt: "Choose", choices: [{ value: "one", label: "One" }, { value: "two", label: "Two" }]
  }] }),
  backgroundDoc: doc("background", { boosts: {}, trainedSkills: { value: [] } }),
  classDoc: doc("class", { keyAbility: { value: ["str"] }, trainedSkills: { value: [], additional: 0 } }),
  heritageDoc: null, feats: [], spells: [], focusSpells: [], equipment: [], loot: []
};

await createCharacterActor(concept, resolved, {
  selectChoices: async (groups) => {
    events.push("choice-callback");
    assert.equal(groups.length, 1);
    return { picks: [{ choice: groups[0].id, option: groups[0].options[1].id }] };
  }
});
assert.deepEqual(events, ["choice-callback", "actor-create", "embedded-create", "actor-update"]);

console.log("pc-builder ChoiceSet callback regression check: callback ordering asserted");
