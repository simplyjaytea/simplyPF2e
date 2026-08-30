import { slugify } from "./text.mjs";

/**
 * Classes whose native feature/casting path has an end-to-end one-click plan.
 * PF2e 8.4.1's Rogue's Racket, Investigator Methodology, Arcane School, and
 * Arcane Thesis are native class-grant choices re-fetched by the ABC pipeline.
 * Until that graph is staged/resolved, offering those classes would falsely
 * promise an unattended complete build. Fighter has no equivalent mandatory
 * class-path choice at level one, so it remains the qualified cohort.
 */
export const COMPLETE_PC_CLASS_SLUGS = new Set(["fighter"]);

export function supportedClassCandidates(candidates) {
  return (Array.isArray(candidates) ? candidates : []).filter((candidate) =>
    COMPLETE_PC_CLASS_SLUGS.has(slugify(candidate?.name))
  );
}

export function isCompletePCClass(value) {
  return COMPLETE_PC_CLASS_SLUGS.has(slugify(typeof value === "string" ? value : value?.name));
}
