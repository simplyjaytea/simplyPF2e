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
 *     native dialog after a one-click build. The prepared arcane profile and
 *     base slots already match the native model (pc-tables.mjs), and the
 *     spellbook is the set of prepared spells, as for Cleric, Druid and Witch.
 *     The curriculum's extra cantrip and extra restricted slots, school focus
 *     spells and the familiar actor stay manual.
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
