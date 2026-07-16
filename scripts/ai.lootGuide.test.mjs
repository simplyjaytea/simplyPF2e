/* Regression test for lootGuide()'s subject param in scripts/ai.mjs
   (lines 22-37): PR #61's PC starting-wealth prompt must frame items as
   PURCHASES tied to the character's backstory, not battlefield drops tied
   to a creature's description. lootGuide is not exported (module-private),
   and ai.mjs imports settings.mjs (Foundry globals), so the function +
   LOOT_AMOUNT_GUIDE map are ported verbatim below — copy kept in sync
   manually, update both if ai.mjs changes this logic.
   Run: node scripts/ai.lootGuide.test.mjs */
import assert from "node:assert/strict";

// Ported verbatim from ai.mjs:22-26.
const LOOT_AMOUNT_GUIDE = {
  stingy: `This GM wants SPARSE loot: lean to the LOW end of every range below (2-3 items total), usually skip the magic-item entry entirely unless the concept specifically calls for one, and keep named items cheap/common.`,
  standard: `Use the ranges below as written.`,
  generous: `This GM wants GENEROUS loot: lean to the HIGH end of every range below (6-8 items total), always include at least one treasure or magic item, and prefer pricier named items when a few options fit the concept.`
};

// Ported verbatim from ai.mjs:30-37 (return string abbreviated to the parts
// under test — the amountNote/origin/hoardTrigger interpolations).
function lootGuide(amount, subject = "creature") {
  const amountNote = LOOT_AMOUNT_GUIDE[amount] ?? LOOT_AMOUNT_GUIDE.standard;
  const origin = subject === "character"
    ? "3-8 items bought with part of their starting wealth (not everyday adventuring gear, which is handled separately — leave meaningful gold unspent rather than trying to spend it all here)"
    : "3-8 items dropped on defeat";
  const hoardTrigger = subject === "character" ? "the character's backstory" : "the creature's description";
  return `${amountNote} ${origin}; ... EXCEPTION: if ${hoardTrigger} or the GM's request explicitly calls for abundant loot ... Include 1-2 coin entries, 1-2 consumables, and 1-2 treasure or magic items of the ${subject}'s level or lower ...`;
}

const inc = (s, sub, msg) => assert.ok(s.includes(sub), msg);
const exc = (s, sub, msg) => assert.ok(!s.includes(sub), msg);

// 1. character subject → purchases, never drops
const pc = lootGuide("standard", "character");
inc(pc, "bought with part of their starting wealth", "character prompt must frame items as purchases");
exc(pc, "dropped on defeat", "character prompt must not mention battlefield drops");

// 2. creature subject (explicit and default) → drops, never purchases
for (const cr of [lootGuide("standard", "creature"), lootGuide("standard")]) {
  inc(cr, "dropped on defeat", "creature prompt must frame items as drops");
  exc(cr, "bought with part of their starting wealth", "creature prompt must not mention purchases");
}

// 3. hoard trigger follows subject
inc(pc, "the character's backstory", "character hoard trigger must cite backstory");
exc(pc, "the creature's description", "character prompt must not cite creature description");
const cr = lootGuide("standard", "creature");
inc(cr, "the creature's description", "creature hoard trigger must cite description");
exc(cr, "the character's backstory", "creature prompt must not cite backstory");

// 4. amount scaling still applies independent of subject
inc(lootGuide("generous", "character"), "lean to the HIGH end", "generous guide must apply to character subject");

// 5. stingy guide for creatures
inc(lootGuide("stingy", "creature"), "lean to the LOW end", "stingy guide must apply");

// 6. unrecognized amount falls back to standard (?? LOOT_AMOUNT_GUIDE.standard)
inc(lootGuide("bogus", "creature"), "Use the ranges below as written", "unknown amount must fall back to standard guide");

console.log("ai.lootGuide.test.mjs: all lootGuide subject/amount assertions passed");
