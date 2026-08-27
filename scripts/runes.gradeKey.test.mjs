// Checks propertyRuneKey's grade-prefix handling against real foundryvtt/pf2e
// runes.ts keys. Graded property runes move their grade word from a trailing
// "(Grade)" catalog-name suffix to a LEADING key prefix, e.g.
// "Flaming (Greater)" -> `greaterFlaming`. The bug: the grade regex only
// matched (Greater|Major), so "Quenching (True)" fell through to plain
// kebabToCamel and produced the wrong key `quenchingTrue` instead of the
// real `trueQuenching` — a silently inert rune.
//
// Grade words confirmed as real leading key prefixes by grepping
// foundryvtt/pf2e's src/module/item/physical/runes.ts directly:
//   greater* (greaterFlaming, greaterFortification, greaterCorrosive, ...)
//   major*   (majorQuenching, majorRooting, majorStanching, majorFanged, ...)
//   true*    (trueQuenching, trueRooting, trueStanching)
//   lesser*  (lesserDread)
//   moderate*(moderateDread)
//
// Run: node scripts/runes.gradeKey.test.mjs

import assert from "node:assert/strict";
import { propertyRuneKey } from "./runes.mjs";

// Ungraded: plain kebabToCamel, unaffected by this fix.
assert.equal(propertyRuneKey("Flaming"), "flaming");
assert.equal(propertyRuneKey("Ghost Touch"), "ghostTouch");

// Previously-supported grades (Greater/Major) keep working.
assert.equal(propertyRuneKey("Flaming (Greater)"), "greaterFlaming");
assert.equal(propertyRuneKey("Fortification (Greater)"), "greaterFortification");
assert.equal(propertyRuneKey("Quenching (Major)"), "majorQuenching");
assert.equal(propertyRuneKey("Rooting (Major)"), "majorRooting");

// The bug: (True) grade, real keys are trueQuenching/trueRooting/trueStanching.
assert.equal(propertyRuneKey("Quenching (True)"), "trueQuenching");
assert.equal(propertyRuneKey("Rooting (True)"), "trueRooting");
assert.equal(propertyRuneKey("Stanching (True)"), "trueStanching");

// Also real: lesser/moderate grade prefixes (armor Dread rune).
assert.equal(propertyRuneKey("Dread (Lesser)"), "lesserDread");
assert.equal(propertyRuneKey("Dread (Moderate)"), "moderateDread");
assert.equal(propertyRuneKey("Dread (Greater)"), "greaterDread");

// Case-insensitive grade word, whitespace before the parenthetical.
assert.equal(propertyRuneKey("Quenching  (true)"), "trueQuenching");

console.log("runes.gradeKey.test.mjs: all assertions passed");
