// Regression check for two live-QA bugs in the PC loot pipeline:
//
// Bug 1 (cross-bucket duplication): buildEquipmentItems({ dedup: true })
// only dedupes WITHIN equipment, and buildLootItems only dedupes WITHIN
// loot — neither checks the other bucket, so the AI listing the same named
// item in both (e.g. a "+1 Striking Dwarven War Axe" as equipment AND as
// loot) shipped two physical copies. dedupeLootAgainstEquipment() drops any
// loot entry whose slugified name also appears in equipment.
//
// Bug 2 (named-loot budget bypass): applyTreasureBudget() only ever flexes
// COIN entries by design (NPC treasure must never lose a named item), so for
// PCs that let AI-named valuable loot (three separate +1 armors) ship far
// over the starting-wealth budget. enforceNamedLootBudget() keeps named
// entries in ascending price order while they fit the budget and drops the
// rest, leaving coin lines untouched for applyTreasureBudget to handle.
//
// Both helpers are pure logic — no Foundry `game` mock needed.
// Run: node scripts/builder.pcLootBudget.test.mjs

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { dedupeLootAgainstEquipment, enforceNamedLootBudget } = await import("./builder.mjs");

/* ---------------------------------------------------------------------- *
 * dedupeLootAgainstEquipment
 * ---------------------------------------------------------------------- */

{
  const equipment = [
    { name: "+1 Striking Dwarven War Axe", quantity: 1, value: 500, entry: {} },
    { name: "Sturdy Shield (Minor)", quantity: 1, value: 180, entry: {} }
  ];
  const loot = [
    { name: "+1 Striking Dwarven War Axe", quantity: 1, resolvedValue: 500, entry: {} }, // exact dup
    { name: "sturdy shield (minor)", quantity: 1, resolvedValue: 180, entry: {} }, // case-insensitive dup (slug match)
    { name: "Potion of Healing (Minor)", quantity: 2, resolvedValue: 4, entry: {} } // unrelated, kept
  ];
  const result = dedupeLootAgainstEquipment(loot, equipment);
  assert.equal(result.length, 1, "both equipment-duplicate loot lines must be dropped, only the unrelated potion kept");
  assert.equal(result[0].name, "Potion of Healing (Minor)");
}

{
  // No overlap: loot passes through unchanged.
  const equipment = [{ name: "Longsword", quantity: 1, value: 1, entry: {} }];
  const loot = [{ name: "Gold Pieces", quantity: 15, resolvedValue: 1, entry: {} }];
  const result = dedupeLootAgainstEquipment(loot, equipment);
  assert.deepEqual(result, loot, "loot with no name overlap must be returned unchanged");
}

{
  // Defensive: non-array / missing inputs never throw.
  assert.deepEqual(dedupeLootAgainstEquipment(null, []), null, "a non-array loot list must be returned as-is, not throw");
  assert.deepEqual(dedupeLootAgainstEquipment([{ name: "Rope" }], undefined), [{ name: "Rope" }], "a missing equipment list must dedupe against nothing, not throw");
}

/* ---------------------------------------------------------------------- *
 * enforceNamedLootBudget
 * ---------------------------------------------------------------------- */

{
  // Three named armors far over budget, plus a couple of cheap consumables
  // and an existing coin line. Ascending-price selection should keep the
  // cheap items and the coin line, and drop the priciest armor(s) once the
  // budget is exhausted.
  const loot = [
    { name: "+1 Glamered Armor", quantity: 1, resolvedValue: 500, entry: {} },
    { name: "+1 Resilient Armor", quantity: 1, resolvedValue: 700, entry: {} },
    { name: "+1 Armor", quantity: 1, resolvedValue: 160, entry: {} },
    { name: "Potion of Healing (Minor)", quantity: 2, resolvedValue: 4, entry: {} },
    { name: "Gold Pieces", quantity: 20, resolvedValue: 1, entry: {} }
  ];
  const budget = 200; // enough for both potions (8gp) + the cheapest armor (160gp) but not the pricier two
  const result = enforceNamedLootBudget(loot, budget);
  const names = result.map((l) => l.name);
  assert.ok(names.includes("Potion of Healing (Minor)"), "cheap consumables must survive ascending-price selection");
  assert.ok(names.includes("+1 Armor"), "the cheapest named item that fits must be kept");
  assert.ok(!names.includes("+1 Glamered Armor"), "overflow named items must be dropped");
  assert.ok(!names.includes("+1 Resilient Armor"), "overflow named items must be dropped");
  assert.ok(names.includes("Gold Pieces"), "coin lines must pass through untouched for applyTreasureBudget to handle");
}

{
  // Ascending order keeps items as long as the RUNNING total still fits —
  // exact-boundary case.
  const loot = [
    { name: "A", quantity: 1, resolvedValue: 30, entry: {} },
    { name: "B", quantity: 1, resolvedValue: 40, entry: {} },
    { name: "C", quantity: 1, resolvedValue: 41, entry: {} } // cumulative 30+40+41=111 > 70; C must be the one dropped
  ];
  const result = enforceNamedLootBudget(loot, 70);
  const names = result.map((l) => l.name).sort();
  assert.deepEqual(names, ["A", "B"], "items must be kept only while the cumulative total still fits the budget");
}

{
  // Zero/tiny/negative budget: never throws, keeps nothing named (coins,
  // if any, still pass through since applyTreasureBudget handles those).
  const loot = [
    { name: "+1 Armor", quantity: 1, resolvedValue: 160, entry: {} },
    { name: "Gold Pieces", quantity: 5, resolvedValue: 1, entry: {} }
  ];
  assert.doesNotThrow(() => enforceNamedLootBudget(loot, 0));
  const zero = enforceNamedLootBudget(loot, 0);
  assert.ok(!zero.some((l) => l.name === "+1 Armor"), "a zero budget must keep no named items");
  assert.ok(zero.some((l) => l.name === "Gold Pieces"), "coin lines pass through even at zero budget");

  assert.doesNotThrow(() => enforceNamedLootBudget(loot, -50));
  assert.doesNotThrow(() => enforceNamedLootBudget(loot, NaN));
  assert.doesNotThrow(() => enforceNamedLootBudget(loot, undefined));
}

{
  // Defensive: non-array input never throws.
  assert.equal(enforceNamedLootBudget(null, 100), null, "a non-array loot list must be returned as-is, not throw");
  assert.doesNotThrow(() => enforceNamedLootBudget(undefined, 100));
}

{
  // A one-item warning is logged summarizing what was dropped, without
  // throwing and without altering console.warn's other callers.
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    enforceNamedLootBudget(
      [{ name: "+1 Armor", quantity: 1, resolvedValue: 500, entry: {} }],
      0
    );
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 1, "exactly one summarizing warning must be logged when items are dropped");
  assert.match(warnings[0], /\+1 Armor/, "the warning must name the dropped item");
}

/* ---------------------------------------------------------------------- *
 * generator-app.mjs wiring: source-pattern checks, same technique as
 * builder.equipmentValueGp.test.mjs, since GeneratorApp extends a Foundry
 * Application class and isn't importable outside a live world.
 * ---------------------------------------------------------------------- */
const appSource = await readFile(new URL("./generator-app.mjs", import.meta.url), "utf8");

assert.match(
  appSource,
  /resolved\.loot\s*=\s*dedupeLootAgainstEquipment\(resolved\.loot,\s*resolved\.equipment\)/,
  "the PC pipeline must cross-dedup loot against equipment before budgeting"
);
assert.match(
  appSource,
  /resolved\.loot\s*=\s*enforceNamedLootBudget\(resolved\.loot,\s*lootBudget\)/,
  "the PC pipeline must enforce the named-loot budget before applyTreasureBudget runs"
);

// Cross-bucket dedup must run BEFORE the budget is computed against
// resolved.equipment/resolved.loot (dropping later would mean the budget
// counted an item that then gets removed).
{
  const dedupIdx = appSource.indexOf("resolved.loot = dedupeLootAgainstEquipment(resolved.loot, resolved.equipment)");
  const budgetIdx = appSource.indexOf("const lootBudget = Math.max(wealthTarget - equipmentGp, 0)");
  assert.ok(dedupIdx !== -1 && budgetIdx !== -1 && dedupIdx < budgetIdx,
    "dedupeLootAgainstEquipment must run before lootBudget is computed");
}

// Named-budget enforcement must run BEFORE applyTreasureBudget (which only
// ever flexes coins) sees the loot list.
{
  const enforceIdx = appSource.indexOf("resolved.loot = enforceNamedLootBudget(resolved.loot, lootBudget)");
  const applyIdx = appSource.indexOf("resolved.loot = await applyTreasureBudget(resolved.loot, lootBudget)");
  assert.ok(enforceIdx !== -1 && applyIdx !== -1 && enforceIdx < applyIdx,
    "enforceNamedLootBudget must run before applyTreasureBudget");
}

console.log("builder PC loot cross-dedup / named-budget regression check: all assertions passed");
