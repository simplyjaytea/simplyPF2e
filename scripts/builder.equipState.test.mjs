import assert from "node:assert/strict";
import { applySourceEquipState } from "./builder.mjs";

const equip = (usage) => applySourceEquipState({ system: { usage: { value: usage }, equipped: { invested: true } } });
assert.deepEqual(equip("held-in-two-hands").system.equipped,
  { invested: true, carryType: "held", handsHeld: 2 }, "two-handed published weapons occupy two hands");
assert.deepEqual(equip("held-in-one-or-two-hands").system.equipped,
  { invested: true, carryType: "held", handsHeld: 1 }, "one-or-two-hand weapons start in their legal one-hand state");
assert.deepEqual(equip("wornarmor").system.equipped,
  { invested: true, carryType: "worn", inSlot: true }, "published worn usage equips armor in its slot");
assert.deepEqual(equip("carried").system.equipped, { invested: true }, "carried equipment is not falsely equipped");
console.log("builder source-equipped-state regression check: published usage controls hands and slots");
