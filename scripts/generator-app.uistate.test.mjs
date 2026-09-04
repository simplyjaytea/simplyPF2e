/* Regression tests for two GeneratorApp bugs in scripts/generator-app.mjs:
   1. #readForm's partySize fallback (line ~319): the partySize input only
      exists in the DOM in Encounter mode ({{#if encounterMode}} in
      templates/generator.hbs); outside that mode the selector is null and
      the old code fell back to a literal 4 instead of the prior #input
      value, silently discarding the GM's saved party size.
   2. The allowSpellcasting toggle (~line 490): enforced only in the AI
      prompt, so a non-compliant model output could ship a caster even when
      disallowed. The generator still only calls `_setStep("spells")` when
      that key was added to `progress.steps`; applyStep also no-ops on a
      missing key so a stray call cannot mark every step done.
   Both pieces of logic are ported here without the Foundry Application
   class/DOM/game.i18n, mirroring generator-app.matchSummary.test.mjs's seam
   technique. Keep in sync manually with generator-app.mjs.
   Run: node scripts/generator-app.uistate.test.mjs */
import assert from "node:assert/strict";
import { applyStep, createProgress, progressPercent } from "./progress.mjs";

// --- 1. partySize fallback, ported from #readForm (generator-app.mjs) ---
// `partySizeEl` stands in for `form.querySelector('[name="partySize"]')`,
// null when the field isn't rendered (outside Encounter mode).
function readPartySize(partySizeEl, previousInputPartySize) {
  const rawPartySize = partySizeEl ? Number(partySizeEl.value) : NaN;
  return partySizeEl
    ? Math.min(8, Math.max(1, Number.isNaN(rawPartySize) ? previousInputPartySize : rawPartySize))
    : previousInputPartySize;
}

// Field absent (Single/Character mode): must keep the prior saved value, not
// snap to a literal default.
assert.equal(readPartySize(null, 6), 6, "missing partySize field must preserve the prior #input value");
assert.equal(readPartySize(null, 4), 4, "missing partySize field must not silently overwrite with a different default");

// Field present (Encounter mode): read and clamp the live value.
assert.equal(readPartySize({ value: "5" }, 4), 5, "present partySize field must read the live value");
assert.equal(readPartySize({ value: "99" }, 4), 8, "partySize must clamp to the max of 8");
assert.equal(readPartySize({ value: "0" }, 4), 1, "partySize must clamp to the min of 1");
assert.equal(readPartySize({ value: "not-a-number" }, 6), 6, "unparseable partySize must fall back to the prior value, not NaN/1");

// --- 2. allowSpellcasting enforcement + step-key consistency ---
// Ported from #runGeneration: strips concept.spellcasting when the toggle is
// off, then only calls _setStep("spells") when that key actually exists in
// the progress step list (i.e. under the same condition the list was built
// from), never when the model ignored the toggle.
function stripSpellcastingIfDisallowed(concept, allowSpellcasting) {
  if (!allowSpellcasting) {
    concept.spellcasting = null;
    concept.focusSpells = [];
  }
  return concept;
}

function shouldSetSpellsStep(concept, allowSpellcasting) {
  return Boolean(allowSpellcasting && concept.spellcasting);
}

// A non-compliant model returns spellcasting despite the toggle being off:
// enforcement must null it out (and any tied focus spells).
{
  const concept = { spellcasting: { tradition: "arcane" }, focusSpells: ["Some Focus Spell"] };
  stripSpellcastingIfDisallowed(concept, false);
  assert.equal(concept.spellcasting, null, "spellcasting must be stripped when allowSpellcasting is false");
  assert.deepEqual(concept.focusSpells, [], "focus spells tied to spellcasting must be cleared too");
  assert.equal(shouldSetSpellsStep(concept, false), false,
    "the 'spells' step must never fire when allowSpellcasting is false — that key isn't in progress.steps");
}

// allowSpellcasting true and the model complied: the step must fire (the key
// exists in progress.steps for this case).
{
  const concept = { spellcasting: { tradition: "divine" }, focusSpells: [] };
  stripSpellcastingIfDisallowed(concept, true);
  assert.deepEqual(concept.spellcasting, { tradition: "divine" }, "spellcasting must survive when allowed");
  assert.equal(shouldSetSpellsStep(concept, true), true, "the 'spells' step must fire when allowed and present");
}

// allowSpellcasting true but the model produced no spellcasting: the step
// must not fire, but nothing is stripped (there's nothing to strip).
{
  const concept = { spellcasting: null, focusSpells: [] };
  stripSpellcastingIfDisallowed(concept, true);
  assert.equal(shouldSetSpellsStep(concept, true), false, "the 'spells' step must not fire when the concept has no spellcasting");
}

// --- 3. Unknown progress keys must not mark every step done ---
// Callers still only pass keys that exist in progress.steps (see (2)), and
// applyStep itself now no-ops on a missing key so a stray call cannot
// overrun 100%.

{
  const progress = createProgress([
    ["concept", "Concept"],
    ["equipment", "Equipment"],
    ["loot", "Loot"],
    ["match", "Match"]
  ]);
  assert.equal(applyStep(progress.steps, "spells"), false);
  assert.ok(progress.steps.every((s) => s.state === "pending"));
  assert.equal(
    progressPercent({ steps: progress.steps, activeKey: "spells", streamFrac: 1, floor: 12 }),
    12,
    "a key absent from progress.steps must leave percent unchanged"
  );
}
{
  const progress = createProgress([
    ["concept", "Concept"],
    ["spells", "Spells"],
    ["equipment", "Equipment"],
    ["loot", "Loot"],
    ["match", "Match"]
  ]);
  assert.equal(applyStep(progress.steps, "spells"), true);
  const percent = progressPercent({
    steps: progress.steps,
    activeKey: "spells",
    streamFrac: 0.5,
    floor: 0
  });
  assert.ok(percent <= 99, "calling applyStep with a key present in progress.steps must stay within the bar");
  assert.ok(percent >= 1, "an active known step must show progress");
}

console.log("generator-app.uistate.test.mjs: all partySize fallback and spellcasting-toggle assertions passed");
