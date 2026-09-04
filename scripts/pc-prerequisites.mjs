import { CORE_SKILLS } from "./pc-skills.mjs";
import { slugify } from "./text.mjs";

/**
 * Fail-closed ordinary feat-prerequisite evaluator against a staged PC plan.
 *
 * PF2e 8.4.1 stores prerequisites as display text, not an eligibility API:
 * `FeatSystemSchema.prerequisites.value` is `Array<{ value: string }>`
 * (`src/module/item/feat/data.ts`). `FeatPF2e.embedHTMLString` joins those
 * strings for display (`src/module/item/feat/document.ts`); `_onCreate`
 * warns about `onlyLevel1` / `maxTakable`, never the prerequisite text.
 *
 * ABC grants that a staged class/ancestry/background will embed are the
 * `system.items` record of `{ uuid, img, name, level }` entries
 * (`src/module/item/abc/data.ts` `ABCFeatureEntryField`). Class items use
 * the same field (`src/module/item/class/data.ts`).
 *
 * Unreadable, malformed, mixed, or unproven clauses are ineligible. Exact
 * slug identity only — no substring or fuzzy name matching.
 */

const RANK = Object.freeze({ trained: 1, expert: 2, master: 3, legendary: 4 });
const ABILITY = Object.freeze({
  strength: "str", dexterity: "dex", constitution: "con",
  intelligence: "int", wisdom: "wis", charisma: "cha"
});

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampLevel(value) {
  const level = Math.min(Math.max(Math.round(Number(value) || 1), 1), 20);
  return Number.isInteger(level) ? level : 1;
}

function validRank(rank) {
  return Number.isInteger(rank) && rank >= 0 && rank <= 4;
}

/** Published ABC grant names at or below the character level. Unreadable
 * entries are skipped rather than inferred. */
export function grantedAbcFeatures(system, level) {
  const items = system?.items;
  if (!isObject(items)) return [];
  const characterLevel = clampLevel(level);
  const names = [];
  for (const entry of Object.values(items)) {
    if (!isObject(entry) || typeof entry.name !== "string" || !entry.name.trim()) continue;
    if (!Number.isInteger(entry.level) || entry.level < 0 || entry.level > characterLevel) continue;
    names.push(entry.name.trim());
  }
  return names;
}

function collectNames(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => typeof value === "string" ? value.trim() : typeof value?.name === "string" ? value.name.trim() : "")
    .filter(Boolean);
}

function skillKey(name) {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  const slug = slugify(trimmed);
  if (CORE_SKILLS.includes(slug)) return slug;
  if (/\slore$/i.test(trimmed) && slug.endsWith("-lore") && slug !== "lore") return slug;
  return null;
}

function splitList(text, conjunction) {
  const joiner = conjunction === "or" ? "or" : "and";
  const pattern = new RegExp(`\\s*,\\s*(?:${joiner}\\s+)?|\\s+${joiner}\\s+`, "i");
  const parts = text.split(pattern).map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts : null;
}

function skillTargets(rest) {
  const text = rest.trim();
  if (/^at least one skill$/i.test(text)) return { any: true };
  const hasAnd = /\band\b/i.test(text);
  const hasOr = /\bor\b/i.test(text);
  if (hasAnd && hasOr) return null;
  if (hasOr || hasAnd) {
    const parts = splitList(text, hasOr ? "or" : "and");
    if (!parts) return null;
    const skills = parts.map(skillKey);
    return skills.every(Boolean) ? { op: hasOr ? "or" : "and", skills } : null;
  }
  const skill = skillKey(text);
  return skill ? { op: "and", skills: [skill] } : null;
}

function hasSkillRank(skills, slug, rank) {
  return validRank(skills[slug]) && skills[slug] >= rank;
}

function skillClauseMet(rank, rest, context) {
  const target = skillTargets(rest);
  if (!target) return false;
  const skills = context.skills;
  if (target.any) return Object.values(skills).some((value) => validRank(value) && value >= rank);
  const check = (slug) => hasSkillRank(skills, slug, rank);
  return target.op === "or" ? target.skills.some(check) : target.skills.every(check);
}

function nameParts(text, conjunction) {
  const parts = splitList(text, conjunction);
  if (!parts) return null;
  const slugs = parts.map((part) => slugify(part)).filter(Boolean);
  return slugs.length === parts.length ? slugs : null;
}

function nameClauseMet(text, context) {
  const hasAnd = /\band\b/i.test(text);
  const hasOr = /\bor\b/i.test(text);
  if (hasAnd && hasOr) return false;
  if (hasOr || hasAnd) {
    const slugs = nameParts(text, hasOr ? "or" : "and");
    if (!slugs) return false;
    return hasOr ? slugs.some((slug) => context.names.has(slug)) : slugs.every((slug) => context.names.has(slug));
  }
  const slug = slugify(text);
  return Boolean(slug) && context.names.has(slug);
}

function clauseMet(entry, context) {
  if (!isObject(entry) || typeof entry.value !== "string") return false;
  const text = entry.value.trim();
  if (!text) return false;
  const skill = /^(trained|expert|master|legendary)\s+in\s+(.+)$/i.exec(text);
  if (skill) return skillClauseMet(RANK[skill[1].toLowerCase()], skill[2], context);
  const ability = /^(strength|dexterity|constitution|intelligence|wisdom|charisma)\s+(\d+)$/i.exec(text);
  if (ability) {
    const score = context.abilities[ABILITY[ability[1].toLowerCase()]];
    return Number.isFinite(score) && score >= Number(ability[2]);
  }
  return nameClauseMet(text, context);
}

/**
 * Snapshot of the generation plan used to prove ordinary prerequisite text.
 * Only names and ranks the caller can already document belong here.
 */
export function stagedActorContext({
  level, ancestry = null, heritage = null, background = null, class: classItem = null,
  feats = [], features = [], skills = {}, abilities = {}
} = {}) {
  const characterLevel = clampLevel(level);
  const possessed = [
    ...collectNames([ancestry, heritage, background, classItem]),
    ...grantedAbcFeatures(ancestry?.system, characterLevel),
    ...grantedAbcFeatures(heritage?.system, characterLevel),
    ...grantedAbcFeatures(background?.system, characterLevel),
    ...grantedAbcFeatures(classItem?.system, characterLevel),
    ...collectNames(features),
    ...collectNames(feats)
  ];
  const skillRanks = {};
  if (isObject(skills)) {
    for (const [slug, rank] of Object.entries(skills)) {
      if (typeof slug === "string" && slug && validRank(rank) && rank > 0) skillRanks[slug] = rank;
    }
  }
  const abilityScores = {};
  if (isObject(abilities)) {
    for (const [key, score] of Object.entries(abilities)) {
      if (Object.values(ABILITY).includes(key) && Number.isFinite(score)) abilityScores[key] = Number(score);
    }
  }
  return {
    level: characterLevel,
    names: new Set(possessed.map(slugify).filter(Boolean)),
    skills: skillRanks,
    abilities: abilityScores
  };
}

/**
 * True only when every published prerequisite clause is both readable and
 * proven against the staged context. Missing data never passes.
 */
export function featPrerequisitesMet(feat, context) {
  const list = feat?.system?.prerequisites?.value;
  if (!Array.isArray(list) || !context?.names) return false;
  return list.every((entry) => clauseMet(entry, context));
}
