import test from "node:test";
import assert from "node:assert/strict";
import { partyTreasureForSize, partyTreasureRow } from "../scripts/treasure-tables.mjs";
import { planParcelSlots } from "../scripts/treasure-parcel.mjs";

test("every treasure row plans the correct number of valid scroll slots", () => {
  for (let level = 1; level <= 20; level++) for (const size of [4, 8]) {
    const { slots } = planParcelSlots(partyTreasureForSize(level, size));
    const base = partyTreasureRow(level).consumables.reduce((sum, entry) => sum + entry.count, 0);
    assert.equal(slots.length, base + 2 * (size - 4));
    assert.ok(slots.every((slot) => slot.rank >= 1 && slot.rank <= 10));
  }
});
