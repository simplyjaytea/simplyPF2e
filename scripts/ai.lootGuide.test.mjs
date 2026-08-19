// Regression tests import production lootGuide directly so prompt behavior
// cannot drift away from a manually copied test implementation.
// Run: node scripts/ai.lootGuide.test.mjs
import assert from "node:assert/strict";
import { lootGuide } from "./ai.mjs";

const inc = (text, fragment, message) => assert.ok(text.includes(fragment), message);
const exc = (text, fragment, message) => assert.ok(!text.includes(fragment), message);

const pc = lootGuide("standard", "character");
inc(pc, "bought with MOST of their starting wealth", "character prompt must prioritize purchases");
inc(pc, "a DISTINCT set of items", "character prompt must discourage duplicate purchases");
exc(pc, "dropped on defeat", "character prompt must not mention battlefield drops");

for (const creature of [lootGuide("standard", "creature"), lootGuide("standard")]) {
  inc(creature, "dropped on defeat", "creature prompt must frame items as drops");
  exc(creature, "bought with MOST", "creature prompt must not mention purchases");
}

inc(pc, "the character's backstory", "character hoard trigger must cite backstory");
exc(pc, "the creature's description", "character prompt must not cite creature description");
const creature = lootGuide("standard", "creature");
inc(creature, "the creature's description", "creature hoard trigger must cite description");
exc(creature, "the character's backstory", "creature prompt must not cite backstory");

inc(lootGuide("generous", "character"), "lean to the HIGH end", "generous guide must apply");
inc(lootGuide("stingy", "creature"), "lean to the LOW end", "stingy guide must apply");
inc(lootGuide("bogus", "creature"), "Use the ranges below as written", "unknown amount must use standard guide");

console.log("ai.lootGuide.test.mjs: all production lootGuide assertions passed");
