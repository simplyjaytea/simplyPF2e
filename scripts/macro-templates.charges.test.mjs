// Run generated production macro commands against charge-write failures.
import assert from "node:assert/strict";
import { buildActivationCommand } from "./macro-templates.mjs";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
let cards = 0;
let writes = 0;
let failWrite = false;
let silentWrite = false;
let flag = { forgeId: "charge-test", uses: { value: 1, max: 1, per: "day" } };
const item = {
  getFlag: () => structuredClone(flag),
  async setFlag(_module, _key, value) {
    writes++;
    if (failWrite) throw new Error("Charge update rejected");
    if (silentWrite) return;
    flag = value;
  }
};
globalThis.game = {
  user: { character: { name: "Acting", items: [item] }, targets: new Set() },
  pf2e: { DamageRoll: class {
    async evaluate() { return this; }
    async toMessage() { cards++; }
  } }
};
globalThis.canvas = { tokens: { controlled: [] } };
globalThis.ui = { notifications: { warn() {} } };
globalThis.ChatMessage = { getSpeaker: () => ({}), create() {} };
globalThis.foundry = { utils: {
  mergeObject: (a, b) => ({ ...a, ...b, uses: { ...a.uses, ...b.uses } })
} };
const run = new AsyncFunction(await buildActivationCommand({
  template: "heal", params: { healDice: "1d6" }
}, { forgeId: "charge-test", itemName: "Test Item", itemLevel: 1 }));

silentWrite = true;
await run();
assert.equal(cards, 0, "an update veto that resolves without saving must not produce an activation");
silentWrite = false;
failWrite = true;
await run();
assert.equal(cards, 0, "a failed charge write must not produce an activation");
assert.equal(flag.uses.value, 1, "failed writes retain the charge");
failWrite = false;
await run();
assert.equal(cards, 1);
assert.equal(flag.uses.value, 0);
await run();
assert.equal(cards, 1, "a depleted copy cannot activate again");
assert.equal(writes, 3, "an empty copy must not attempt another write");
delete flag.uses;
await run();
assert.equal(cards, 1, "missing charge metadata must fail closed");
flag.uses = { value: Number.NaN, max: 1, per: "day" };
await run();
assert.equal(cards, 1, "malformed charge metadata must fail closed");

const makeCopy = (id) => {
  let copyFlag = { forgeId: "charge-test", uses: { value: 1, max: 1, per: "day" } };
  return {
    uuid: `Actor.acting.Item.${id}`,
    getFlag: () => structuredClone(copyFlag),
    async setFlag(_module, _key, value) { copyFlag = value; }
  };
};
const first = makeCopy("first");
const second = makeCopy("second");
game.user.character.items = [first, second];
await run();
await run();
assert.equal(cards, 3, "two copies on the same actor each supply their own charge");
assert.equal(first.getFlag().uses.value, 0);
assert.equal(second.getFlag().uses.value, 0);

const pendingCopy = makeCopy("pending");
const persist = pendingCopy.setFlag;
let finishWrite;
pendingCopy.setFlag = async (...args) => {
  await new Promise((resolve) => { finishWrite = resolve; });
  return persist(...args);
};
game.user.character.items = [pendingCopy];
const pending = run();
await run();
assert.equal(cards, 3, "a duplicate click cannot run while its first charge write is pending");
finishWrite();
await pending;
assert.equal(cards, 4, "the original activation completes exactly once");
const uninvested = makeCopy("uninvested");
const invested = makeCopy("invested");
uninvested.isInvested = false;
invested.isInvested = true;
game.user.character.items = [uninvested, invested];
await run();
assert.equal(cards, 5, "an uninvested first copy must not hide an eligible charged copy");
assert.equal(uninvested.getFlag().uses.value, 1);
assert.equal(invested.getFlag().uses.value, 0);
await run();
assert.equal(cards, 5, "uninvested copies cannot activate or consume a charge");
console.log("macro charge persistence boundary passed");
