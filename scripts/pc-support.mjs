import { slugify } from "./text.mjs";

/**
 * Classes whose native feature/casting path has an end-to-end one-click plan.
 * A class belongs here only when every mandatory level-one choice is either a
 * native grant that needs no answer or a bridge that class-paths.mjs stages
 * from enabled Class Features sources before the actor exists:
 *   - Fighter has no level-one bridge.
 *   - Rogue (Racket) and Investigator (Methodology) have one bridge each, held
 *     in the single `classPath` identity field.
 *   - Wizard has two bridges, Arcane School and Arcane Thesis. Both are staged
 *     independently, each against its own required path (`classPaths` keyed by
 *     bridge name), from closed schools and theses only: a feature whose grant
 *     chain asks another question (Rooted Wisdom, Unified Magical Theory,
 *     Runelord, Experimental Spellshaping) is never offered. Arcane Bond and
 *     Wizard Spellcasting are choice-free native grants. If a bridge is not
 *     stageable (for example master's two-entry Arcane School filter), the
 *     guard in stageClassPaths throws before any write instead of leaving a
 *     native dialog after a one-click build, and preflightClassPaths applies
 *     the same check up front: such a class is not offered, and a required
 *     one fails before any provider call. The prepared arcane profile and
 *     base slots already match the native model (pc-tables.mjs), and the
 *     spellbook is the set of prepared spells, as for Cleric, Druid and Witch.
 *     The curriculum extra cantrip and extra restricted slots and the familiar
 *     actor stay manual. School focus spells are not granted either, and any
 *     focus spell the AI names for a complete-only class is dropped
 *     (classModelsFocusSpells).
 * Ordinary feat prerequisites are evaluated against that staged ABC/grant
 * snapshot before complete-only selection. Wizard data is verified against PF2e
 * 8.5.0 (docs/plans/wizard-research-2026-10-26.md).
 */
const COMPLETE_PC_CLASS_SLUGS = new Set(["fighter", "rogue", "investigator", "wizard"]);

export function supportedClassCandidates(candidates) {
  return (Array.isArray(candidates) ? candidates : []).filter((candidate) =>
    COMPLETE_PC_CLASS_SLUGS.has(slugify(candidate?.name))
  );
}

export function isCompletePCClass(value) {
  return COMPLETE_PC_CLASS_SLUGS.has(slugify(typeof value === "string" ? value : value?.name));
}

/**
 * Complete-only classes whose focus-spell source the module models end to end.
 * None yet. A focus spell is granted by a class feature the module would have
 * to resolve (Wizard: the chosen school has a School Spells link in its
 * description that no rule grants; PLAYBOOK backlog item 3), so for these
 * classes any focus spell the AI names would be an unbacked pick. Add a slug
 * here only together with the resolver that grounds it.
 */
const FOCUS_SPELL_SOURCE_CLASS_SLUGS = new Set();

/**
 * Whether a focus-spell pick can be honoured for this class. A complete-only
 * class without a modeled focus source (all of them today) carries no focus
 * spells, no focus entry and no focus pool. Classes outside the complete-only
 * registry are not generated and keep their previous focus handling.
 */
export function classModelsFocusSpells(value) {
  const slug = slugify(typeof value === "string" ? value : value?.name);
  return !COMPLETE_PC_CLASS_SLUGS.has(slug) || FOCUS_SPELL_SOURCE_CLASS_SLUGS.has(slug);
}

/**
 * Enforce classModelsFocusSpells on a concept in place. When the class has no
 * modeled focus source, any focus spells the AI supplied are dropped with a
 * warning. Returns whether focus spells may be honoured for this class.
 */
export function settleFocusSpells(concept, classLike) {
  if (classModelsFocusSpells(classLike)) return true;
  if (Array.isArray(concept?.focusSpells) && concept.focusSpells.length) {
    const name = typeof classLike === "string" ? classLike : classLike?.name;
    console.warn(`simplypf2e | ${name ?? "this class"} has no modeled focus-spell source; dropping its AI-supplied focus spells`);
    concept.focusSpells = [];
  }
  return false;
}
