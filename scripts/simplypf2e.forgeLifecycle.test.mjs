// Production hooks: shared companion references and owner-triggered recharge.
import assert from "node:assert/strict";

class App {}
globalThis.foundry = { applications: { api: {
  ApplicationV2: App, HandlebarsApplicationMixin: (Base) => Base
} } };
const hooks = new Map();
globalThis.Hooks = { once() {}, on: (name, callback) => hooks.set(name, callback) };
globalThis.game = { user: { id: "gm", isGM: true }, items: [], actors: [], scenes: [] };
await import("./simplypf2e.mjs");

let deletes = 0;
let macroForgeId = "test-forge";
globalThis.fromUuid = async () => ({
  documentName: "Macro", getFlag: () => macroForgeId, async delete() { deletes++; }
});
const makeItem = (uuid) => ({
  uuid,
  getFlag: (_module, key) => key === "activationMacroUuid" ? "Macro.shared" : { forgeId: "test-forge" }
});
const deleted = makeItem("Actor.removed.Item.copy");
const survivor = makeItem("Actor.survivor.Item.copy");
const onDelete = hooks.get("deleteItem");
game.items = [survivor];
await onDelete(deleted, {}, "gm");
assert.equal(deletes, 0, "a surviving world copy retains its companion");
game.items = [];
game.actors = [{ items: [survivor] }];
await onDelete(deleted, {}, "gm");
assert.equal(deletes, 0, "a surviving actor copy retains its companion");
game.actors = [];
game.scenes = [{ tokens: [{ actor: { items: [survivor] } }] }];
await onDelete(deleted, {}, "gm");
assert.equal(deletes, 0, "a surviving synthetic token copy retains its companion");
game.scenes = [];
macroForgeId = "other-forge";
await onDelete(deleted, {}, "gm");
assert.equal(deletes, 0, "a recorded UUID cannot delete an unrelated macro");
macroForgeId = "test-forge";
await onDelete(deleted, {}, "other-user");
assert.equal(deletes, 0, "only the initiating client handles cleanup");
await onDelete(deleted, {}, "gm");
assert.equal(deletes, 1, "the last world reference permits companion cleanup");

let updates = [];
const actor = {
  isOwner: true,
  items: [{ id: "copy", getFlag: () => ({ uses: { value: 0, max: 1, per: "day" } }) }],
  async updateEmbeddedDocuments(_type, changes) { updates.push(...changes); }
};
game.user = { id: "player", isGM: false };
await hooks.get("pf2e.restForTheNight")(actor);
assert.deepEqual(updates, [{ _id: "copy", "flags.simplypf2e.forge.uses.value": 1 }],
  "the player whose local rest hook runs recharges their owned item");
updates = [];
actor.isOwner = false;
await hooks.get("pf2e.restForTheNight")(actor);
assert.deepEqual(updates, [], "nonowners cannot recharge another actor");
console.log("forge shared macro lifecycle and player rest passed");
