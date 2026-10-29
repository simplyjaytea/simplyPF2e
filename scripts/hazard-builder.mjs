/*
 * Hazard generator (WP5, gated): pure concept policy and actor source builder.
 * No Foundry globals; catalogs (trait slugs, damage types) are passed in. The AI
 * concept carries scale words and enum slugs only. normalizeHazardConcept fails
 * closed: an unknown optional pick is dropped with console.warn, and a missing or
 * unsafe required field throws a HazardConceptError with a stable code. Every
 * number in the output comes from scripts/hazard-tables.mjs (loaded lazily unless
 * a `tables` override is passed), from dispelRank below, or from scripts/encounter.mjs
 * (XP). AI prose is escaped with esc() and must pass hazardProseProblem, the prose
 * number policy that ai.mjs also imports.
 */
import { enricherTokens } from "./reskin-policy.mjs";
import { esc, inertText, toHtml } from "./text.mjs";

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
const NAME_MAX = 80; // matches HAZARD_LIMITS.name in ai.mjs
// Spell ranks for the Dispel Magic counteract rank (a module convention, see dispelRank).
const SPELL_RANK = Object.freeze({ min: 1, max: 10 });
// routine.actions is a structural count of actions per round, so the AI may choose it.
const ROUTINE_ACTIONS = Object.freeze([1, 2, 3]);
const HAZARD_IMG = "systems/pf2e/icons/default-icons/hazard.svg";
const ID_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
// Custom content. builder.mjs writes no publication for NPCs, so Foundry's own
// defaults apply there; these are the same defaults written out explicitly.
const PUBLICATION = Object.freeze({ title: "", authors: "", license: "OGL", remaster: false });

/*
 * Prose policy (WP5 fix pass). Hazard prose is plain words. Plain distances and counts
 * stay allowed ("a 5-foot square", "10 feet", "three darts", "2 rounds"). Refused:
 * enricher syntax, square or curly brackets, "@" commands, control characters, dice
 * notation, an explicit DC or AC, a signed modifier (+14, -2), and damage, HP or hit
 * points written next to a number (one damage type word may sit between, as in "10 fire
 * damage"). A signed number is a modifier only when no letter or digit precedes the sign.
 */
const PROSE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const PROSE_BRACKET = /[[\]{}]|@\w/;
const PROSE_NUMBERS = Object.freeze([
  [/\d+d\d+/i, "dice notation"],
  [/\bDC\s*\d/i, "an explicit DC"],
  [/\bAC\s*\d/i, "an explicit AC"],
  [/(?<![A-Za-z\d])[+−-]\d+\b/, "a signed modifier"],
  [/\b\d+\s*(?:[a-z]+\s+)?(?:damage|hp|hit\s+points?)\b|\b(?:damage|hp|hit\s+points?)\s*\d/i, "damage, HP or hit points next to a number"]
]);

/*
 * A refused concept. field and reason are set for refused prose and names, so the
 * generator can say which field failed and why (generator-app.mjs hazardErrorText).
 */
export class HazardConceptError extends Error {
  constructor(code, message, { field = null, reason = null } = {}) {
    super(message);
    this.name = "HazardConceptError";
    this.code = code;
    this.field = field;
    this.reason = reason;
  }
}

const fault = (code, message, detail) => new HazardConceptError(code, message, detail);
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

/*
 * The one prose policy for hazard text (WP5 fix pass): proseFault returns a stable code and a
 * short reason, or null. The AI layer (ai.mjs, through hazardProseProblem) and this module
 * apply the same rules, so a reply that passes the retry gate is not rejected here.
 * Brackets are a superset of the enricher tokens, but enricherTokens (reskin-policy.mjs) is
 * still consulted so the detection stays shared with the reskin engine. Numbers are checked
 * after NFKC folding so full-width digits cannot slip past.
 */
function proseFault(text) {
  if (PROSE_CONTROL.test(text)) return { code: "BAD_TEXT", reason: "contains a control character" };
  if (enricherTokens(text).length || PROSE_BRACKET.test(text)) {
    return { code: "ENRICHER_IN_TEXT", reason: "contains Foundry enricher syntax, a bracket or an @ command" };
  }
  const folded = text.normalize("NFKC");
  const number = PROSE_NUMBERS.find(([pattern]) => pattern.test(folded));
  return number ? { code: "NUMBER_IN_TEXT", reason: "contains " + number[1] } : null;
}

/**
 * Why a piece of hazard prose must be rejected, or null when it is acceptable. Pure. The
 * AI retry gate in ai.mjs and normalizeHazardConcept both use this one function.
 */
export function hazardProseProblem(text) {
  if (typeof text !== "string") return "is not text";
  const found = proseFault(text);
  return found ? found.reason : null;
}

/** Markup a name may not carry: angle brackets, a tab, a line break, or the pipe that separates @Check parameters. */
const NAME_MARKUP = /[<>|\r\n\t]/;
const NAME_MARKUP_REASON = "is not a single plain line without markup or the pipe character";

/**
 * The one name check (review P3-2). Returns { code, reason } when the name must be refused, or null.
 * The AI retry gate (ai.mjs, hazardTextProblem) and nameText both call it, so a name that passes the
 * gate is never refused here. The caller passes the trimmed name.
 */
export function hazardNameProblem(text) {
  if (text.length > NAME_MAX) return { code: "BAD_NAME", reason: "is longer than " + NAME_MAX + " characters" };
  const found = proseFault(text);
  if (found) return { code: found.code === "BAD_TEXT" ? "BAD_NAME" : found.code, reason: found.reason };
  if (NAME_MARKUP.test(text)) return { code: "BAD_NAME", reason: NAME_MARKUP_REASON };
  return null;
}

/** Optional prose: plain text that passes hazardProseProblem. Escaping happens at render time. */
function proseText(field, value) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw fault("BAD_TEXT", `${field} must be text`, { field, reason: "is not text" });
  const text = value.trim();
  if (!text) return "";
  const found = proseFault(text);
  if (found) throw fault(found.code, `${field} ${found.reason}`, { field, reason: found.reason });
  return text;
}

/** Required single-line name. hazardNameProblem decides; the pipe is refused because it separates @Check parameters. */
function nameText(field, value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw fault("MISSING_NAME", `${field} is required`);
  const problem = hazardNameProblem(text);
  if (problem) throw fault(problem.code, `${field} ${problem.reason}`, { field, reason: problem.reason });
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

/** dispel is a boolean. Anything else is dropped to false with a warning; the counteract rank is derived from the level and never written by the AI. */
function dispelFlag(value) {
  if (typeof value === "boolean") return value;
  if (value !== undefined) warn(`dropped dispel: ${JSON.stringify(value)} is not true or false`);
  return false;
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
  const dispel = dispelFlag(raw.dispel);
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
 * AC convention. attributes.ac.value has no schema initial, so it is always written.
 * When the concept ac is null (the AI said nothing can attack the hazard) the value is
 * the LOW column of Table 2-15, and describeHazard reports ac.assumed as true. The
 * stored number still comes from the table, never from the AI.
 */
const acValue = (concept, level, T) => T.hazardAC(level, concept.ac || "low");

/**
 * Counteract rank of the Dispel Magic option. This is a module convention, not GM Core:
 * GM Core gives hazards no counteract rank, so the module counteracts at half the
 * hazard level, rounded up, within spell ranks 1 to 10. The AI only says whether Dispel
 * Magic can end the hazard; it never writes the rank.
 */
const dispelRank = (level) => Math.min(SPELL_RANK.max, Math.max(SPELL_RANK.min, Math.ceil(level / 2)));

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

/** Encounter XP: encounter.mjs hazardXP, the simple map for simple hazards and the creature map for complex ones (WP5 decision 5). */
async function encounterXP(xp) {
  if (xp) return xp;
  return (await import("./encounter.mjs")).hazardXP;
}

/*
 * Dispel Magic link (review P2-5). The pf2e 8.5.0 spell is at
 * https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/spells/spells/rank-2/dispel-magic.json
 * and its id line reads:
 *   "_id": "9HpwDN4MYQJnW0LG",
 * tests/fixtures/hazards/dispel-magic.json is that file unchanged. Built packs resolve ID-form uuids,
 * so the link names the id, not the spell name.
 */
const DISPEL_MAGIC_UUID = "Compendium.pf2e.spells-srd.Item.9HpwDN4MYQJnW0LG";

function disableHtml(concept, level, T) {
  const rank = T.hazardProficiency(level, "high");
  const checks = concept.disable.map(({ skill, scale }) => (
    `@Check[${skill}|dc:${T.hazardDC(level, scale)}|name:Disable ${esc(concept.name)}|traits:action:disable-a-device] (${rank})`
  ));
  if (concept.dispel) {
    const counteract = T.hazardDC(level, "high");
    checks.push(`@UUID[${DISPEL_MAGIC_UUID}]{Dispel Magic} (${ordinal(dispelRank(level))} rank; counteract DC ${counteract})`);
  }
  return checks.length ? `<p>${checks.join(" or ")}</p>` : "";
}

function reactionHtml(reaction, level, T) {
  const save = reaction.save
    ? `<p>@Check[${reaction.save.type}|dc:${T.hazardSaveDC(level, reaction.save.scale)}] ${inertText(reaction.save.effect)}</p>`
    : "";
  return `<p><strong>Trigger</strong> ${inertText(reaction.trigger)}</p><p>${inertText(reaction.effect)}</p>${save}`;
}

const routineHtml = (routine) => `<p>(${routine.actions} actions) ${inertText(routine.text)}</p>`;

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
        stealth: { value: stealthDC === null ? null : stealthDC - 10, details: stealthDC === null ? "" : "<p>(" + rank + ")</p>" },
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
    dispel: concept.dispel ? { rank: dispelRank(level), dc: T.hazardDC(level, "high") } : null,
    ac: { value: acValue(concept, level, T), assumed: !concept.ac },
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
