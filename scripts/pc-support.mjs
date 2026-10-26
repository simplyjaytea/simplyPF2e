import { slugify } from "./text.mjs";

/**
 * Classes whose native feature/casting path has an end-to-end one-click plan.
 * Fighter has no mandatory level-one class-path bridge. Rogue's Racket and
 * Investigator Methodology are staged by class-paths.mjs from enabled Class
 * Features sources. Ordinary feat prerequisites are evaluated against that
 * staged ABC/grant snapshot before complete-only selection. Wizard remains
 * excluded pending class-owned spellbook/curriculum support.
 */
const COMPLETE_PC_CLASS_SLUGS = new Set(["fighter", "rogue", "investigator"]);

export function supportedClassCandidates(candidates) {
  return (Array.isArray(candidates) ? candidates : []).filter((candidate) =>
    COMPLETE_PC_CLASS_SLUGS.has(slugify(candidate?.name))
  );
}

export function isCompletePCClass(value) {
  return COMPLETE_PC_CLASS_SLUGS.has(slugify(typeof value === "string" ? value : value?.name));
}
