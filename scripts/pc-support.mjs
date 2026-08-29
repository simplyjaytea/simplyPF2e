import { slugify } from "./text.mjs";

/** Classes whose native feature/casting path has an end-to-end one-click plan. */
export const COMPLETE_PC_CLASS_SLUGS = new Set(["fighter", "rogue", "investigator", "wizard"]);

export function supportedClassCandidates(candidates) {
  return (Array.isArray(candidates) ? candidates : []).filter((candidate) =>
    COMPLETE_PC_CLASS_SLUGS.has(slugify(candidate?.name))
  );
}

export function isCompletePCClass(value) {
  return COMPLETE_PC_CLASS_SLUGS.has(slugify(typeof value === "string" ? value : value?.name));
}
