// Checks the rune helpers added after the project audit found two gaps:
//   1. the item-level cap only ever gated the BASE item, so a level-1
//      character asked for "+1 striking" could be handed a "+3 major striking"
//      weapon (a level-19 item) purely because the AI wrote that name;
//   2. a runed name resolves to its base item, so treasure/starting-wealth
//      budgeting priced a "+1 striking longsword" as a 1 gp longsword while
//      the sheet renders a ~1,000 gp item — the coin padding then overshot the
//      wealth target by orders of magnitude.
// Run: node scripts/runes.capRunes.test.mjs
//
// parseRunes and runedName are pure and imported directly. capRunes/runeGp
// read the compendium for real rune levels and prices, so their tier-selection
// arithmetic is copied verbatim below (source of truth — keep in sync).

import assert from "node:assert/strict";
import { parseRunes, runedName } from "./runes.mjs";

/* Stand-in for fundamentalRunes(): the real levels/prices of the weapon
   fundamental runes, shaped exactly as the compendium scan returns them. */
const WEAPON = {
  potency: [{ tier: 1, level: 2, gp: 35 }, { tier: 2, level: 10, gp: 935 }, { tier: 3, level: 16, gp: 8935 }],
  secondary: [{ tier: 1, level: 4, gp: 65 }, { tier: 2, level: 12, gp: 1065 }, { tier: 3, level: 19, gp: 31065 }]
};

// --- Copied verbatim from scripts/runes.mjs capRunes() / runeGp() ---
function capRunes(runes, { potency, secondary }, level, field = "striking") {
  const best = (tiers, requested) => {
    const legal = tiers.filter((r) => r.level <= level && r.tier <= requested);
    return legal.length ? Math.max(...legal.map((r) => r.tier)) : 0;
  };
  return { ...runes, potency: best(potency, runes.potency), [field]: best(secondary, runes[field]) };
}
function runeGp(runes, { potency, secondary }, field = "striking") {
  const gpFor = (tiers, tier) => tiers.find((r) => r.tier === tier)?.gp ?? 0;
  return gpFor(potency, runes.potency) + gpFor(secondary, runes[field]);
}

/* ---------------- parsing ---------------- */

assert.deepEqual(
  parseRunes("+1 striking rapier"),
  { base: "rapier", potency: 1, striking: 1, resilient: 0 },
  "a fundamental-rune prefix is split off the base item name"
);
assert.deepEqual(
  parseRunes("+2 greater resilient breastplate"),
  { base: "breastplate", potency: 2, striking: 0, resilient: 2 },
  "a graded secondary rune parses to its tier"
);
assert.equal(parseRunes("Longsword").potency, 0, "an unruned name parses to no runes");

/* ---------------- level capping ---------------- */

// The bug: an over-tier request on a low-level character.
const overreach = capRunes(parseRunes("+3 major striking longsword"), WEAPON, 1);
assert.deepEqual(
  { potency: overreach.potency, striking: overreach.striking }, { potency: 0, striking: 0 },
  "at level 1 no fundamental rune is legal yet, so every tier caps to 0"
);

const atFour = capRunes(parseRunes("+3 major striking longsword"), WEAPON, 4);
assert.deepEqual(
  { potency: atFour.potency, striking: atFour.striking }, { potency: 1, striking: 1 },
  "level 4 steps a +3 major striking request down to the best legal tier (+1 striking)"
);

const atTwenty = capRunes(parseRunes("+3 major striking longsword"), WEAPON, 20);
assert.deepEqual(
  { potency: atTwenty.potency, striking: atTwenty.striking }, { potency: 3, striking: 3 },
  "a high-level character keeps the tier it asked for"
);

const modest = capRunes(parseRunes("+1 striking longsword"), WEAPON, 20);
assert.deepEqual(
  { potency: modest.potency, striking: modest.striking }, { potency: 1, striking: 1 },
  "capping never upgrades a request, only steps it down"
);

/* ---------------- pricing ---------------- */

assert.equal(runeGp(parseRunes("Longsword"), WEAPON), 0, "an unruned item adds no rune price");
assert.equal(
  runeGp(capRunes(parseRunes("+1 striking longsword"), WEAPON, 5), WEAPON), 35 + 65,
  "rune price is the sum of the real rune documents' own prices"
);
assert.ok(
  runeGp(capRunes(parseRunes("+1 striking longsword"), WEAPON, 5), WEAPON) > 50,
  "a runed weapon is budgeted far above its ~1 gp base item, which was the accounting bug"
);
assert.equal(
  runeGp(capRunes(parseRunes("+3 major striking longsword"), WEAPON, 4), WEAPON), 35 + 65,
  "price follows the CAPPED tier, not the tier the AI asked for"
);

/* ---------------- naming ---------------- */

assert.equal(
  runedName({ potency: 1, striking: 1 }, "weapon", "Longsword"), "+1 Striking Longsword",
  "the display name is rebuilt from the runes actually applied"
);
assert.equal(
  runedName({ potency: 1, striking: 0 }, "weapon", "Longsword"), "+1 Longsword",
  "a capped-away secondary rune drops out of the name too"
);
assert.equal(
  runedName({ potency: 2, resilient: 2 }, "armor", "half plate"), "+2 Greater Resilient Half Plate",
  "armor uses the resilient adjective and capitalizes the base name"
);
assert.equal(
  runedName({ potency: 0, striking: 0 }, "weapon", "Longsword"), "Longsword",
  "no runes means no prefix — the item keeps its plain name"
);

console.log("runes cap/price/name regression check: all assertions passed");
