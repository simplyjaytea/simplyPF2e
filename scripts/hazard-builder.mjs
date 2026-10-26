/*
 * Hazard generator (WP5, gated): pure concept policy and actor source builder.
 * No Foundry globals; catalogs (trait slugs, damage types) are passed in. The AI
 * concept carries scale words and enum slugs only. normalizeHazardConcept fails
 * closed: an unknown optional pick is dropped with console.warn, and a missing or
 * unsafe required field throws a HazardConceptError with a stable code. Every
 * number in the output comes from scripts/hazard-tables.mjs (loaded lazily unless
 * a `tables` override is passed) or from scripts/encounter.mjs (XP). AI prose is
 * escaped with esc() and rejected when it carries enricher syntax or game numbers
 * (reskin-policy.mjs).
 */
import { enricherTokens, reskinTextProblem } from "./reskin-policy.mjs";
import { esc, toHtml } from "./text.mjs";

export const HAZARD_DISABLE_SKILLS = Object.freeze([
  "thievery", "athletics", "acrobatics", "arcana", "crafting", "deception", "diplomacy",
  "intimidation", "nature", "occultism", "performance", "religion", "survival"
]);

// Literal copies of the WP5 contract values in hazard-tables.mjs (HAZARD_SCALES,
// HAZARD_MIN_LEVEL, HAZARD_MAX_LEVEL). They stay literal so normalization is
// synchronous and this module loads without the tables module.
const SCALES = Object.freeze(["extreme", "high", "low"]);
const SAVE_SCALES = Object.freeze(["extreme", "high"]);
const SAVE_TYPES = Object.freeze(["fortitude", "reflex", "will"]);
const RARITIES = Object.freeze(["common", "uncommon", "rare", "unique"]);
const LEVEL_MIN = -1;
const LEVEL_MAX = 24;
const DISPEL_RANK_MAX = 10;
const ROUTINE_ACTIONS = Object.freeze([1, 2, 3]);
const HAZARD_IMG = "systems/pf2e/icons/default-icons/hazard.svg";
const ID_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
// Custom content. builder.mjs writes no publication for NPCs, so Foundry's own
// defaults apply there; these are the same defaults written out explicitly.
const PUBLICATION = Object.freeze({ title: "", authors: "", license: "OGL", remaster: false });

export class HazardConceptError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "HazardConceptError";
    this.code = code;
  }
}

const fault = (code, message) => new HazardConceptError(code, message);
const warn = (message) => console.warn(`Hazard concept: ${message}`);
const isPlainObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function checkLevel(level) {
  if (!Number.isInteger(level) || level < LEVEL_MIN || level > LEVEL_MAX) {
    throw fault("BAD_LEVEL", `level must be an integer from ${LEVEL_MIN} to ${LEVEL_MAX}`);
  }
  return level;
}

function listOf(value, field) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw fault("BAD_CONCEPT", `${field} must be a list`);
  return value;
}

function objectOf(value, field) {
  if (value === undefined || value === null) return {};
  if (!isPlainObject(value)) throw fault("BAD_CONCEPT", `${field} must be an object`);
  return value;
}

/** Optional prose: plain text, enricher-inert, and free of game numbers. Escaping happens at render time. */
function proseText(field, value) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw fault("BAD_TEXT", `${field} must be text`);
  const text = value.trim();
  if (!text) return "";
  if (enricherTokens(text).length || /[[\]]|@\w/.test(text)) {
    throw fault("ENRICHER_IN_TEXT", `${field} contains Foundry enricher syntax`);
  }
  const problem = reskinTextProblem(field, text);
  if (problem) throw fault(problem.includes("game statistic") ? "NUMBER_IN_TEXT" : "BAD_TEXT", `${field}: ${problem}`);
  return text;
}

/** Required single-line name. The pipe is refused because it separates @Check parameters. */
function nameText(field, value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw fault("MISSING_NAME", `${field} is required`);
  if (enricherTokens(text).length || /[[\]]|@\w/.test(text)) {
    throw fault("ENRICHER_IN_TEXT", `${field} contains Foundry enricher syntax`);
  }
  if (text.includes("|")) throw fault("BAD_NAME", `${field} must not contain the pipe character`);
  const problem = reskinTextProblem("name", text);
  if (problem) throw fault("BAD_NAME", `${field}: ${problem}`);
  return text;
}

/** A scale word from the hazard scales, or null. Anything else is dropped with a warning. */
function scaleOrNull(value, field) {
  if (value === undefined || value === null) return null;
  if (SCALES.includes(value)) return value;
  warn(`dropped ${field}: "${value}" is not a scale`);
  return null;
}

function strikeOrNull(value, field, damageTypes) {
  if (value === undefined || value === null) return null;
  const raw = objectOf(value, field);
  if (!damageTypes.has(raw.damageType)) {
    warn(`dropped ${field}: damage type "${raw.damageType}" is not in the catalog`);
    return null;
  }
  return { name: nameText(`${field}.name`, raw.name), damageType: raw.damageType };
}

function saveOrNull(value, field) {
  if (value === undefined || value === null) return null;
  const raw = objectOf(value, field);
  if (!SAVE_TYPES.includes(raw.type)) {
    warn(`dropped ${field}: "${raw.type}" is not fortitude, reflex or will`);
    return null;
  }
  if (!SAVE_SCALES.includes(raw.scale)) {
    warn(`dropped ${field}: "${raw.scale}" is not extreme or high`);
    return null;
  }
  return { type: raw.type, scale: raw.scale, effect: proseText(`${field}.effect`, raw.effect) };
}

function dispelOrNull(value) {
  if (value === undefined || value === null) return null;
  const rank = isPlainObject(value) ? value.rank : undefined;
  if (Number.isInteger(rank) && rank >= 1 && rank <= DISPEL_RANK_MAX) return { rank };
  warn(`dropped dispel: rank "${rank}" is not 1 to ${DISPEL_RANK_MAX}`);
  return null;
}

function routineOf(value, damageTypes) {
  const raw = objectOf(value, "routine");
  if (!ROUTINE_ACTIONS.includes(raw.actions)) throw fault("BAD_ROUTINE_ACTIONS", "routine.actions must be 1, 2 or 3");
  return {
    actions: raw.actions,
    text: proseText("routine.text", raw.text),
    strike: strikeOrNull(raw.strike, "routine.strike", damageTypes)
  };
}

/**
 * Validates the AI concept (WP5 decision 3) and returns a frozen, normalized copy.
 * Throws HazardConceptError for missing or unsafe required fields; drops unknown
 * optional picks with a console.warn.
 */
export function normalizeHazardConcept(raw, { level, traitsCatalog = [], damageTypes = [] } = {}) {
  if (!isPlainObject(raw)) throw fault("BAD_CONCEPT", "concept must be an object");
  checkLevel(level);
  const traitSlugs = new Set(traitsCatalog);
  const damageSet = new Set(damageTypes);

  const name = nameText("name", raw.name);
  const description = proseText("description", raw.description);
  const traits = listOf(raw.traits, "traits").filter((trait) => {
    if (traitSlugs.has(trait)) return true;
    warn(`dropped trait "${trait}": not in the hazard trait catalog`);
    return false;
  });
  const rarity = RARITIES.includes(raw.rarity) ? raw.rarity : "common";
  if (raw.rarity !== undefined && rarity !== raw.rarity) warn(`rarity "${raw.rarity}" is not a rarity; using common`);
  if (typeof raw.complex !== "boolean") throw fault("BAD_FIELD", "complex must be true or false");
  if (typeof raw.hasHP !== "boolean") throw fault("BAD_FIELD", "hasHP must be true or false");

  const stealth = scaleOrNull(raw.stealth, "stealth");
  const disable = listOf(raw.disable, "disable").flatMap((entry) => {
    const skill = isPlainObject(entry) ? entry.skill : undefined;
    if (!HAZARD_DISABLE_SKILLS.includes(skill)) {
      warn(`dropped disable skill "${skill}": not a hazard disable skill`);
      return [];
    }
    if (!SCALES.includes(entry.scale)) {
      warn(`dropped disable ${skill}: "${entry.scale}" is not a scale`);
      return [];
    }
    return [{ skill, scale: entry.scale }];
  });
  const dispel = dispelOrNull(raw.dispel);
  if (!disable.length && !dispel) throw fault("NO_DISABLE", "a hazard needs a disable check or a Dispel Magic option");

  const ac = scaleOrNull(raw.ac, "ac");
  const savesRaw = objectOf(raw.saves, "saves");
  const saves = Object.fromEntries(SAVE_TYPES.map((type) => [type, scaleOrNull(savesRaw[type], "saves." + type)]));

  if (!isPlainObject(raw.reaction)) throw fault("MISSING_REACTION", "reaction is required");
  const reaction = {
    name: nameText("reaction.name", raw.reaction.name),
    trigger: proseText("reaction.trigger", raw.reaction.trigger),
    effect: proseText("reaction.effect", raw.reaction.effect),
    strike: strikeOrNull(raw.reaction.strike, "reaction.strike", damageSet),
    save: saveOrNull(raw.reaction.save, "reaction.save")
  };

  const hasRoutine = raw.routine !== undefined && raw.routine !== null;
  if (raw.complex && !hasRoutine) throw fault("ROUTINE_REQUIRED", "a complex hazard needs a routine");
  if (!raw.complex && hasRoutine) warn("dropped routine: only complex hazards have one");
  const routine = raw.complex ? routineOf(raw.routine, damageSet) : null;
  // One melee strike per hazard: a complex hazard keeps the routine strike.
  if (routine && routine.strike && reaction.strike) {
    warn("dropped reaction strike: a complex hazard carries one melee strike, from its routine");
    reaction.strike = null;
  }

  return deepFreeze({
    name,
    description,
    traits,
    rarity,
    complex: raw.complex,
    stealth,
    disable,
    dispel,
    ac,
    saves,
    hasHP: raw.hasHP,
    reaction,
    routine,
    reset: proseText("reset", raw.reset)
  });
}

/** The one melee strike a hazard carries, with its attack kind. Complex hazards use the routine strike. */
function strikeOf(concept) {
  const routineStrike = concept.routine ? concept.routine.strike : null;
  const strike = routineStrike || concept.reaction.strike;
  return strike ? { strike, kind: concept.complex ? "complex" : "simple" } : null;
}

/**
 * attributes.ac.value has no schema initial, so a null concept.ac writes the LOW
 * column of Table 2-15. The stored number still comes from the table, never from the AI.
 */
const acValue = (concept, level, T) => T.hazardAC(level, concept.ac || "low");

const saveValue = (concept, type, level, T) => (concept.saves[type] ? T.hazardSave(level, concept.saves[type]) : null);

function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return String(n) + "th";
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th";
  return String(n) + suffix;
}

const publication = () => ({ ...PUBLICATION });

/** 16-character alphanumeric id, the shape Foundry uses for damageRolls keys. */
const randomId = () => Array.from(
  globalThis.crypto.getRandomValues(new Uint8Array(16)),
  (byte) => ID_CHARS[byte % ID_CHARS.length]
).join("");

/** Tables load lazily unless a test or caller passes its own. */
async function hazardTables(tables) {
  return tables || (await import("./hazard-tables.mjs"));
}

/** Encounter XP: simple hazards use the simple map, complex hazards the creature map (WP5 decision 5). */
async function encounterXP(xp) {
  if (xp) return xp;
  const encounter = await import("./encounter.mjs");
  return (level, partyLevel, complex) => (complex
    ? encounter.creatureXP(level, partyLevel)
    : encounter.simpleHazardXP(level, partyLevel));
}

function disableHtml(concept, level, T) {
  const rank = T.hazardProficiency(level, "high");
  const checks = concept.disable.map(({ skill, scale }) => (
    `@Check[${skill}|dc:${T.hazardDC(level, scale)}|name:Disable ${esc(concept.name)}|traits:action:disable-a-device] (${rank})`
  ));
  if (concept.dispel) {
    const counteract = T.hazardDC(level, "high");
    checks.push(`@UUID[Compendium.pf2e.spells-srd.Item.Dispel Magic] (${ordinal(concept.dispel.rank)} rank; counteract DC ${counteract})`);
  }
  return checks.length ? `<p>${checks.join(" or ")}</p>` : "";
}

function reactionHtml(reaction, level, T) {
  const save = reaction.save
    ? `<p>@Check[${reaction.save.type}|dc:${T.hazardSaveDC(level, reaction.save.scale)}] ${esc(reaction.save.effect)}</p>`
    : "";
  return `<p><strong>Trigger</strong> ${esc(reaction.trigger)}</p><p>${esc(reaction.effect)}</p>${save}`;
}

const routineHtml = (routine) => `<p>(${routine.actions} actions) ${esc(routine.text)}</p>`;

function strikeItem(strike, kind, level, T) {
  const damage = T.hazardDamage(level, kind);
  return {
    type: "melee",
    name: strike.name,
    system: {
      bonus: { value: T.hazardAttack(level, kind) },
      damageRolls: { [randomId()]: { damage: damage.formula, damageType: strike.damageType } },
      attackEffects: { value: [] },
      traits: { value: [] },
      range: null,
      publication: publication()
    }
  };
}

/**
 * Actor and item source for Actor.create with the actor spread and the items array.
 * Every number comes from Tables 2-13 to 2-16. Field names mirror the published hazard
 * samples and the research field map. No derived keys and no Rule Elements are written.
 */
export async function buildHazardSource(concept, { level, tables } = {}) {
  checkLevel(level);
  const T = await hazardTables(tables);
  const pick = strikeOf(concept);
  const stealthDC = concept.stealth ? T.hazardDC(level, concept.stealth) : null;
  const hpMax = concept.hasHP ? T.hazardHP(level) : 0;
  const rank = T.hazardProficiency(level, "high");

  const items = [{
    type: "action",
    name: concept.reaction.name,
    system: {
      actionType: { value: "reaction" },
      actions: { value: null },
      category: null,
      traits: { value: concept.reaction.strike ? ["attack"] : [] },
      description: { value: reactionHtml(concept.reaction, level, T) },
      publication: publication()
    }
  }];
  if (concept.routine) {
    items.push({
      type: "action",
      name: "Routine",
      system: {
        actionType: { value: "passive" },
        actions: { value: null },
        category: null,
        traits: { value: [] },
        description: { value: routineHtml(concept.routine) },
        publication: publication()
      }
    });
  }
  if (pick) items.push(strikeItem(pick.strike, pick.kind, level, T));

  const actor = {
    name: concept.name,
    type: "hazard",
    img: HAZARD_IMG,
    system: {
      traits: { value: [...concept.traits], rarity: concept.rarity, size: { value: "med" } },
      attributes: {
        ac: { value: acValue(concept, level, T) },
        hp: { value: hpMax, max: hpMax, temp: 0, details: "" },
        hardness: concept.hasHP ? T.hazardHardness(level) : 0,
        stealth: { value: stealthDC === null ? null : stealthDC - 10, details: stealthDC === null ? "" : "(" + rank + ")" },
        emitsSound: "encounter",
        immunities: [],
        weaknesses: [],
        resistances: []
      },
      details: {
        description: toHtml(concept.description),
        level: { value: level },
        isComplex: concept.complex,
        disable: disableHtml(concept, level, T),
        routine: concept.routine ? routineHtml(concept.routine) : "",
        reset: toHtml(concept.reset),
        publication: publication()
      },
      saves: Object.fromEntries(SAVE_TYPES.map((type) => [type, { value: saveValue(concept, type, level, T) }]))
    }
  };
  return { actor, items };
}

/** Preview context: every number the source will carry, plus XP for a same-level party. */
export async function describeHazard(concept, level, { tables, xp } = {}) {
  checkLevel(level);
  const T = await hazardTables(tables);
  const rank = T.hazardProficiency(level, "high");
  const pick = strikeOf(concept);
  const damage = pick ? T.hazardDamage(level, pick.kind) : null;
  const xpFor = await encounterXP(xp);
  return {
    name: concept.name,
    level,
    complex: concept.complex,
    rarity: concept.rarity,
    traits: [...concept.traits],
    stealth: concept.stealth ? { dc: T.hazardDC(level, concept.stealth), rank } : null,
    disable: concept.disable.map(({ skill, scale }) => ({ skill, dc: T.hazardDC(level, scale), rank })),
    dispel: concept.dispel ? { rank: concept.dispel.rank, dc: T.hazardDC(level, "high") } : null,
    ac: acValue(concept, level, T),
    saves: Object.fromEntries(SAVE_TYPES.map((type) => [type, saveValue(concept, type, level, T)])),
    hp: concept.hasHP ? T.hazardHP(level) : 0,
    hardness: concept.hasHP ? T.hazardHardness(level) : 0,
    strike: pick ? {
      name: pick.strike.name,
      bonus: T.hazardAttack(level, pick.kind),
      formula: damage.formula,
      average: damage.average,
      damageType: pick.strike.damageType
    } : null,
    reactionName: concept.reaction.name,
    routineActions: concept.routine ? concept.routine.actions : null,
    xp: xpFor(level, level, concept.complex)
  };
}
