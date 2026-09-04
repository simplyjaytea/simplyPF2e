// Dice briefs: Character mode must not reuse the creature-flavored sentence.
// Run: node scripts/presets.randomBrief.test.mjs
import assert from "node:assert/strict";
import { randomBrief } from "./presets.mjs";

function withRandomSequence(values, fn) {
  const original = Math.random;
  let i = 0;
  Math.random = () => values[Math.min(i++, values.length - 1)];
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

const firstPick = [0, 0, 0, 0];
const creature = withRandomSequence(firstPick, () => randomBrief("monster"));
assert.equal(
  creature,
  "Invent an original aberration brute from a haunted swamp, with an unexpectedly gentle side. Surprise us: avoid clichés, and give it one memorable signature ability."
);
assert.equal(withRandomSequence(firstPick, () => randomBrief()), creature, "omitted mode keeps the creature brief");
assert.equal(withRandomSequence(firstPick, () => randomBrief("npc")), creature);
assert.equal(withRandomSequence(firstPick, () => randomBrief("encounter")), creature);

const character = withRandomSequence(firstPick, () => randomBrief("character"));
assert.equal(
  character,
  "Invent an original dwarven mercenary from a haunted swamp, with an unexpectedly gentle side. Surprise us: avoid clichés, and give them one memorable personality hook."
);
assert.doesNotMatch(character, /signature ability/);
assert.doesNotMatch(character, /\d/);

for (const mode of ["monster", "npc", "encounter", "character"]) {
  const brief = randomBrief(mode);
  assert.match(brief, /^Invent an original /);
  assert.match(brief, /Surprise us: avoid clichés/);
  assert.equal(typeof brief, "string");
}

console.log("presets.randomBrief.test.mjs: mode-appropriate dice briefs passed");
