/** Core skill slugs/attributes match PF2e CONFIG.PF2E.skills (master/8.4.1).
 * Numeric allocations belong here, never in the model response. */
export const SKILL_ATTRIBUTES = Object.freeze({
  acrobatics: "dex", arcana: "int", athletics: "str", crafting: "int",
  deception: "cha", diplomacy: "cha", intimidation: "cha", medicine: "wis",
  nature: "wis", occultism: "int", performance: "cha", religion: "wis",
  society: "int", stealth: "dex", survival: "wis", thievery: "dex"
});
export const CORE_SKILLS = Object.freeze(Object.keys(SKILL_ATTRIBUTES));

export function normalizeSkillPriorities(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter((slug) => typeof slug === "string" && Object.hasOwn(SKILL_ATTRIBUTES, slug)))]
    : [];
}

/** Missing/partial preferences use the existing key-ability-first default. */
export function skillPriorityOrder(value, keyAbility) {
  const preferred = normalizeSkillPriorities(value);
  const defaults = [...CORE_SKILLS].sort((a, b) =>
    Number(SKILL_ATTRIBUTES[b] === keyAbility) - Number(SKILL_ATTRIBUTES[a] === keyAbility)
    || a.localeCompare(b));
  return { order: [...preferred, ...defaults.filter((slug) => !preferred.includes(slug))], automatic: preferred.length === 0 };
}

/** Class schedules are data, not an inference from a class name or feat cadence. */
export function skillIncreaseSchedule(value) {
  if (!Array.isArray(value) || value.some((level) => !Number.isInteger(level) || level < 1 || level > 20)
    || new Set(value).size !== value.length) return null;
  return [...value].sort((a, b) => a - b);
}

/** Direct class/background duplicate training is a provable replacement, not
 * an inferred feat bonus. Player Core, Skills / Initial Proficiencies. */
export function initialSkillTraining(classSystem, backgroundSystem) {
  const classSkills = normalizeSkillPriorities(classSystem?.trainedSkills?.value);
  const backgroundSkills = normalizeSkillPriorities(backgroundSystem?.trainedSkills?.value);
  return {
    ranks: Object.fromEntries([...classSkills, ...backgroundSkills].map((slug) => [slug, 1])),
    replacements: backgroundSkills.filter((slug) => classSkills.includes(slug)).length
  };
}

const validRank = (rank) => Number.isInteger(rank) && rank >= 0 && rank <= 4;

/**
 * Allocate only module-owned ranks over observed native floors. Native floors
 * above known level-1 ABC training are not evidence of historical availability:
 * they may be promoted only at the current creation level. No rule is replayed.
 * `previous` pins provisional choices used by native preCreate predicates. A
 * training/increase is reusable only if the final native floor supplies it.
 */
export function allocateCharacterSkills({
  level, additional, replacements = 0, intelligence, initialIntelligence, nativeRanks, initialRanks = {}, increaseLevels,
  priorities = [], keyAbility, lore = [], previous = null, blocked = [], grantSkills = []
}) {
  const { order, automatic } = skillPriorityOrder(priorities, keyAbility);
  const warnings = [];
  const sourceRanks = {};
  const training = [];
  const trainingLevels = {};
  const events = [];
  const blockedSet = new Set(blocked);
  const loreKeys = lore.map((entry) => entry.key);
  const all = [...order, ...loreKeys];
  const ranks = Object.fromEntries(all.map((slug) => [slug, nativeRanks?.[slug]]));
  if (!Number.isInteger(level) || level < 1 || level > 20 || all.some((slug) => !validRank(ranks[slug]))) {
    return { sourceRanks, training, events, automatic, warnings: ["native-data"], trainingBudget: null, unspentTraining: null, unspentIncreases: null };
  }
  if (blocked.length) warnings.push("native-rank-rule");
  const trainingBudget = Number.isInteger(additional) && additional >= 0 && Number.isInteger(intelligence)
    && Number.isInteger(replacements) && replacements >= 0 ? Math.max(0, additional + intelligence) + replacements : null;
  if (trainingBudget === null) warnings.push("training-data");
  const initialBudget = trainingBudget === null ? 0 : Number.isInteger(initialIntelligence)
    ? Math.min(trainingBudget, Math.max(0, additional + initialIntelligence) + replacements) : level === 1 ? trainingBudget : 0;
  if (trainingBudget > initialBudget) warnings.push("intelligence-timing");
  const schedule = skillIncreaseSchedule(increaseLevels);
  if (!schedule) warnings.push("schedule");
  if (grantSkills.length || all.some((slug) => ranks[slug] > (initialRanks[slug] ?? 0))) warnings.push("grant-timing");

  // A late native Expert floor cannot pay for a module Master increase that
  // happened earlier. Keep the entire prerequisite chain for such a skill.
  const preserveChain = new Set((previous?.events ?? [])
    .filter((event) => event.level < level && event.rank > ranks[event.slug])
    .map((event) => event.slug));

  // Retain source ranks under unsupported transforms; no refund is justified.
  for (const slug of blocked) {
    if (previous?.sourceRanks[slug]) sourceRanks[slug] = previous.sourceRanks[slug];
  }
  for (const slug of previous?.training ?? []) {
    if (blockedSet.has(slug) || ranks[slug] === 0 || preserveChain.has(slug)) {
      sourceRanks[slug] = Math.max(sourceRanks[slug] ?? 0, 1);
      training.push(slug);
      trainingLevels[slug] = previous.trainingLevels[slug];
    }
  }
  if (trainingBudget !== null && training.length > trainingBudget) {
    throw new Error("Character skill allowance decreased below training already used during native creation.");
  }
  if (trainingBudget !== null) {
    const reservedTraining = new Set((previous?.events ?? [])
      .filter((event) => event.rank === 1 && ranks[event.slug] < 1).map((event) => event.slug));
    for (const slug of order) {
      if (training.length >= trainingBudget) break;
      if (blockedSet.has(slug) || ranks[slug] > 0 || sourceRanks[slug] || reservedTraining.has(slug)) continue;
      sourceRanks[slug] = 1;
      training.push(slug);
      trainingLevels[slug] = Object.values(trainingLevels).filter((lv) => lv === 1).length < initialBudget ? 1 : level;
    }
  }

  const effectiveAt = (slug, atLevel) => Math.max((trainingLevels[slug] ?? 1) <= atLevel ? sourceRanks[slug] ?? 0 : 0,
    atLevel === level ? ranks[slug] : Math.min(ranks[slug], initialRanks[slug] ?? 0));
  // Reserve every non-refunded provisional increase before spending released
  // events. Otherwise an early refund could consume a later pinned increment.
  const pinned = new Map((previous?.events ?? [])
    .filter((event) => blockedSet.has(event.slug) || ranks[event.slug] < event.rank || preserveChain.has(event.slug))
    .map((event) => [event.level, event]));
  let unspentIncreases = schedule ? 0 : null;
  for (const atLevel of schedule?.filter((lv) => lv <= level) ?? []) {
    const cap = atLevel >= 15 ? 4 : atLevel >= 7 ? 3 : 2;
    const pin = pinned.get(atLevel);
    if (pin) {
      sourceRanks[pin.slug] = Math.max(sourceRanks[pin.slug] ?? 0, pin.rank);
      events.push({ ...pin });
      continue;
    }
    const slug = all.find((key) => {
      if (blockedSet.has(key)) return false;
      if ((trainingLevels[key] ?? 1) > atLevel) return false;
      const next = effectiveAt(key, atLevel) + 1;
      if (next > cap || next <= ranks[key]) return false;
      // Don't spend this event on a rank reserved by a later pinned event.
      return ![...pinned.values()].some((event) => event.level > atLevel && event.slug === key && event.rank === next);
    });
    if (!slug) { unspentIncreases++; continue; }
    const rank = effectiveAt(slug, atLevel) + 1;
    sourceRanks[slug] = rank;
    events.push({ level: atLevel, slug, rank });
  }
  const unspentTraining = trainingBudget === null ? null : trainingBudget - training.length;
  if (unspentTraining > 0) warnings.push("unspent-training");
  if (unspentIncreases > 0) warnings.push("unspent-increases");
  return { sourceRanks, training, trainingLevels, events, automatic, warnings, trainingBudget, unspentTraining, unspentIncreases };
}

/** Read prepared PF2e data, not modifiers inferred from descriptions or boosts.
 * `base` is the native integer pre-RE modifier and includes native apex boosts.
 * Non-upgrade AELikes are not simple rank floors: leave those skills native.
 * Sources: character/document.ts prepareBuildData/prepareSkills, ae-like.ts
 * #logChange, class/data.ts, background/document.ts on master and pf2e-8.4.1.
 */
export function characterSkillSnapshot(actor, backgroundLoreIds = []) {
  const nativeRanks = Object.fromEntries(CORE_SKILLS.map((slug) => [slug, actor.system.skills[slug]?.rank]));
  const lore = backgroundLoreIds.map((id) => {
    const item = actor.items.get(id);
    if (!item || item.type !== "lore") throw new Error("Background Lore could not be inspected.");
    const key = `lore:${id}`;
    nativeRanks[key] = item.system.proficient.value;
    return { key, id, name: item.name };
  });
  const autoChanges = actor.system.autoChanges ?? {};
  const ambiguousTransform = Object.entries(autoChanges).some(([path, changes]) =>
    (path === "system.skills" || path.includes("{"))
    && (!Array.isArray(changes) || changes.some((change) => change.mode !== "upgrade")));
  const blocked = CORE_SKILLS.filter((slug) => {
    if (ambiguousTransform) return true;
    const changes = autoChanges[`system.skills.${slug}.rank`] ?? [];
    return !Array.isArray(changes) || changes.some((change) => change.mode !== "upgrade");
  });
  const grantSkills = CORE_SKILLS.filter((slug) => autoChanges[`system.skills.${slug}.rank`]?.length);
  return { nativeRanks, lore, blocked, grantSkills, intelligence: actor.system.abilities.int.base };
}
