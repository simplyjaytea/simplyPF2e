/*
 * Level shifting (experimental, C11): pure policy with no Foundry globals.
 * A shift produces a NEW NPC whose stored base values move by the GM Core
 * benchmark delta between the source level and the target level. Numbers come
 * only from scripts/tables.mjs. Elite/weak stays native (attributes.adjustment)
 * and is never merged here. Anything outside the supported policy fails closed
 * with a stable code. Every problem is collected so the preview shows all of them.
 */
import { AC, HP, MAX_LEVEL, MIN_LEVEL, PERCEPTION_AND_SAVES, SKILL, SPELL_ATTACK, SPELL_DC, STRIKE_ATTACK, STRIKE_DAMAGE } from "./tables.mjs";

export const LEVEL_SHIFT_CODES = Object.freeze({
  NOT_NPC: "NOT_NPC",
  LEVEL_NOT_INTEGER: "LEVEL_NOT_INTEGER",
  LEVEL_OUT_OF_RANGE: "LEVEL_OUT_OF_RANGE",
  NOT_A_SHIFT: "NOT_A_SHIFT",
  SHIFT_TOO_LARGE: "SHIFT_TOO_LARGE",
  SOURCE_ADJUSTED: "SOURCE_ADJUSTED",
  SEGMENTED_UNSUPPORTED: "SEGMENTED_UNSUPPORTED",
  STAT_MISSING: "STAT_MISSING",
  NO_STRIKE: "NO_STRIKE",
  ROLE_AMBIGUOUS: "ROLE_AMBIGUOUS",
  ROLE_UNCLASSIFIED: "ROLE_UNCLASSIFIED",
  DAMAGE_UNSUPPORTED: "DAMAGE_UNSUPPORTED",
  SPELL_ROLE_UNCLASSIFIED: "SPELL_ROLE_UNCLASSIFIED",
  CASTER_DAMAGE_SPELL_UNSUPPORTED: "CASTER_DAMAGE_SPELL_UNSUPPORTED",
  CASTER_RANK_OVER_CAP: "CASTER_RANK_OVER_CAP",
  CASTER_LEVEL_UNSUPPORTED: "CASTER_LEVEL_UNSUPPORTED",
  VERIFICATION_FAILED: "VERIFICATION_FAILED"
});

/** Supported level deltas. Anything else is rejected, never rebuilt here. */
export const SUPPORTED_SHIFTS = Object.freeze([-2, -1, 1, 2]);

/** Tolerance in GM Core points for numeric families (AC, attacks, DCs, saves, Perception, skills). */
const TOLERANCE = 2;
/** Strike damage tolerance: two average points, in doubled units (see avgDoubled). */
const DAMAGE_TOLERANCE = 4;

/** What a shift deliberately leaves alone. Verified by content in verifyShiftedActorData. */
const LEVEL_SHIFT_EXCLUSIONS = Object.freeze([
  "ability modifiers (system.abilities)",
  "traits, speed, senses (system.traits, system.attributes.speed, system.attributes.senses)",
  "resistances, weaknesses, immunities",
  "spell names, ranks, and spell slots or focus pools",
  "innate spell use frequencies and limited-use pools",
  "items other than Strike, Lore, spellcasting entries, and spells (equipment, treasure)",
  "images, token, ownership (Foundry defaults on create)"
]);

const FORMULA = /^(\d+)d(\d+)(?:([+-])(\d+))?$/;
const isNumber = (value) => typeof value === "number" && Number.isFinite(value);
const at = (root, segments) => segments.reduce((node, key) => node?.[key], root);

function setAt(root, segments, value) {
  let node = root;
  for (const key of segments.slice(0, -1)) node = node[key];
  node[segments.at(-1)] = value;
}

/** Twice the average of a dice formula, so odd averages stay integers. Null when unparsable. */
function avgDoubled(formula) {
  const parsed = parseFormula(formula);
  if (!parsed) return null;
  return parsed.count * (parsed.faces + 1) + 2 * parsed.modifier;
}

function parseFormula(formula) {
  const match = FORMULA.exec(String(formula).replaceAll(" ", ""));
  if (!match) return null;
  const [, count, faces, sign, modifier] = match;
  const flat = modifier === undefined ? 0 : (sign === "-" ? -1 : 1) * Number(modifier);
  return { count: Number(count), faces: Number(faces), modifier: flat };
}

/** Table cell for a level, measured by `measure`, or null when the table has no value there. */
function cell(table, column, level, measure) {
  const raw = table[column]?.[level + 1];
  return raw === null || raw === undefined ? null : measure(raw);
}

/**
 * Nearest-column role for one stored value. Ties whose columns move the value
 * by different amounts are ambiguous. Residuals beyond the tolerance are
 * unclassified. Only the keys of `table` are candidates, so a table without a
 * scale never falls back to another one.
 */
function classify({ table, level, target, value, measure = Number, tolerance, unclassified, ambiguous }) {
  let best = Infinity;
  let tied = [];
  for (const column of Object.keys(table)) {
    const from = cell(table, column, level, measure);
    const to = cell(table, column, target, measure);
    if (from === null || to === null) continue;
    const distance = Math.abs(value - from);
    if (distance < best) {
      best = distance;
      tied = [column];
    } else if (distance === best) {
      tied.push(column);
    }
  }
  if (!tied.length) return { code: unclassified };
  const deltas = new Set(tied.map((column) => cell(table, column, target, measure) - cell(table, column, level, measure)));
  if (deltas.size > 1) return { code: ambiguous };
  if (best > tolerance) return { code: unclassified };
  const column = tied[0];
  const from = cell(table, column, level, measure);
  const to = cell(table, column, target, measure);
  return { column, delta: to - from };
}

/** Level name written into the shifted actor. */
function shiftedActorName(name, targetLevel) {
  return `${name} (Level ${targetLevel})`;
}

/** HP column for the primary combat role. The HP table has no extreme column, so extreme maps to high explicitly. */
function hpColumnFor(strikeColumn) {
  return strikeColumn === "extreme" ? "high" : strikeColumn;
}

/**
 * Plan a level shift of one NPC source. Pure: reads only `source` (plain
 * data, e.g. `actor.toObject()`), and returns the plan. `plan.ok` is true only
 * when no problem was found. Every change is an explicit path into the source,
 * with the table column it came from. Level, HP value, and name are in changes.
 */
export function planLevelShift(source, targetLevel) {
  const problems = [];
  const fail = (code, message, path = "") => problems.push({ code, path, message });
  const plan = {
    ok: false,
    problems,
    sourceName: String(source?.name ?? ""),
    name: null,
    sourceLevel: null,
    targetLevel,
    delta: null,
    changes: [],
    exclusions: LEVEL_SHIFT_EXCLUSIONS
  };
  const finish = () => {
    plan.ok = problems.length === 0;
    return Object.freeze(plan);
  };
  if (!source || source.type !== "npc") {
    fail(LEVEL_SHIFT_CODES.NOT_NPC, "Only an NPC can be level-shifted.");
    return finish();
  }
  const level = source.system?.details?.level?.value;
  if (!Number.isInteger(level) || !Number.isInteger(targetLevel)) {
    fail(LEVEL_SHIFT_CODES.LEVEL_NOT_INTEGER, "The source and target levels must be whole numbers.");
    return finish();
  }
  plan.sourceLevel = level;
  plan.delta = targetLevel - level;
  plan.name = shiftedActorName(source.name, targetLevel);

  for (const [label, value] of [["Source", level], ["Target", targetLevel]]) {
    if (value < MIN_LEVEL || value > MAX_LEVEL) {
      fail(LEVEL_SHIFT_CODES.LEVEL_OUT_OF_RANGE, `${label} level ${value} is outside ${MIN_LEVEL} to ${MAX_LEVEL}.`);
    }
  }
  if (plan.delta === 0) fail(LEVEL_SHIFT_CODES.NOT_A_SHIFT, "The target level equals the source level.");
  else if (!SUPPORTED_SHIFTS.includes(plan.delta)) {
    fail(LEVEL_SHIFT_CODES.SHIFT_TOO_LARGE, `A shift of ${plan.delta} is outside the supported ${SUPPORTED_SHIFTS.join(", ")}. Use a GM Core rebuild.`);
  }
  const adjustment = source.system?.attributes?.adjustment;
  if (adjustment !== null && adjustment !== undefined && adjustment !== "") {
    fail(LEVEL_SHIFT_CODES.SOURCE_ADJUSTED, "An elite or weak source cannot be shifted. Clear the native adjustment first.", "system.attributes.adjustment");
  }
  const segments = source.system?.otherSegments;
  const segmented = Array.isArray(segments) ? segments.length > 0
    : (segments !== null && typeof segments === "object" && Object.keys(segments).length > 0)
      || (source.system?.traits?.value ?? []).includes("troop");
  if (segmented) fail(LEVEL_SHIFT_CODES.SEGMENTED_UNSUPPORTED, "Segmented or troop creatures are not supported.");
  if (problems.length) return finish();

  const target = targetLevel;
  const changes = plan.changes;
  const change = (path, label, family, column, before, after) => changes.push({
    path, label, family, column, before, after, delta: isNumber(before) && isNumber(after) ? after - before : null
  });
  const stat = (path, label, family, table, { tolerance = TOLERANCE } = {}) => {
    const value = at(source, path);
    if (!isNumber(value)) {
      fail(LEVEL_SHIFT_CODES.STAT_MISSING, `${path.join(".")} is missing.`, path.join("."));
      return null;
    }
    const result = classify({
      table, level, target, value, tolerance,
      unclassified: LEVEL_SHIFT_CODES.ROLE_UNCLASSIFIED, ambiguous: LEVEL_SHIFT_CODES.ROLE_AMBIGUOUS
    });
    if (result.code) {
      fail(result.code, `${label} does not match a benchmark column at level ${level}.`, path.join("."));
      return null;
    }
    change(path, label, family, result.column, value, value + result.delta);
    return result.column;
  };

  // Level and HP value are changes too, so the verifier and preview see them.
  change(["system", "details", "level", "value"], "Level", "level", null, level, target);

  stat(["system", "attributes", "ac", "value"], "AC", "AC", AC);
  for (const save of ["fortitude", "reflex", "will"]) {
    stat(["system", "saves", save, "value"], `Save: ${save}`, "saves", PERCEPTION_AND_SAVES);
  }
  stat(["system", "perception", "mod"], "Perception", "perception", PERCEPTION_AND_SAVES);
  for (const [slug, skill] of Object.entries(source.system?.skills ?? {})) {
    if (isNumber(skill?.base)) stat(["system", "skills", slug, "base"], `Skill: ${slug}`, "skills", SKILL);
  }

  const items = Array.isArray(source.items) ? source.items : [];
  for (const { item, index } of items.map((item, index) => ({ item, index })).filter(({ item }) => item?.type === "lore")) {
    const mod = item.system?.mod?.value;
    if (isNumber(mod)) stat(["items", index, "system", "mod", "value"], `Lore: ${item.name ?? index}`, "skills", SKILL);
  }
  const melee = items.map((item, index) => ({ item, index })).filter(({ item }) => item?.type === "melee");
  if (!melee.length) fail(LEVEL_SHIFT_CODES.NO_STRIKE, "A creature without a melee Strike is not supported.");
  let primaryStrike = null;
  for (const { item, index } of melee) {
    const name = item.name ?? `melee ${index}`;
    const column = stat(["items", index, "system", "bonus", "value"], `Strike attack: ${name}`, "strike", STRIKE_ATTACK);
    if (primaryStrike === null) primaryStrike = column;
    const damageKey = Object.keys(item.system?.damageRolls ?? {})[0];
    if (damageKey === undefined) continue;
    const path = ["items", index, "system", "damageRolls", damageKey, "damage"];
    const formula = item.system.damageRolls[damageKey]?.damage;
    const measured = avgDoubled(formula);
    if (measured === null) {
      fail(LEVEL_SHIFT_CODES.DAMAGE_UNSUPPORTED, `Strike damage "${formula}" is not a plain dice formula.`, path.join("."));
      continue;
    }
    const result = classify({
      table: STRIKE_DAMAGE, level, target, value: measured, measure: avgDoubled, tolerance: DAMAGE_TOLERANCE,
      unclassified: LEVEL_SHIFT_CODES.ROLE_UNCLASSIFIED, ambiguous: LEVEL_SHIFT_CODES.ROLE_AMBIGUOUS
    });
    if (result.code) {
      fail(result.code, `Strike damage for ${name} does not match a benchmark column.`, path.join("."));
      continue;
    }
    const fromString = STRIKE_DAMAGE[result.column][level + 1];
    const toString = STRIKE_DAMAGE[result.column][target + 1];
    if (formula === fromString) {
      if (formula !== toString) change(path, `Strike damage: ${name}`, "damage", result.column, formula, toString);
      continue;
    }
    if (result.delta % 2 !== 0) {
      fail(LEVEL_SHIFT_CODES.DAMAGE_UNSUPPORTED, `Strike damage shift for ${name} is not a whole number.`, path.join("."));
      continue;
    }
    if (result.delta === 0) continue;
    const parsed = parseFormula(formula);
    const modifier = parsed.modifier + result.delta / 2;
    if (modifier < 0) {
      fail(LEVEL_SHIFT_CODES.DAMAGE_UNSUPPORTED, `Strike damage for ${name} would have a negative modifier.`, path.join("."));
      continue;
    }
    const next = `${parsed.count}d${parsed.faces}${modifier ? `+${modifier}` : ""}`;
    change(path, `Strike damage: ${name}`, "damage", result.column, formula, next);
  }

  if (primaryStrike !== null) {
    const hpColumn = hpColumnFor(primaryStrike);
    const hpPath = ["system", "attributes", "hp", "max"];
    const hpValue = source.system?.attributes?.hp?.max;
    if (!isNumber(hpValue)) {
      fail(LEVEL_SHIFT_CODES.STAT_MISSING, "system.attributes.hp.max is missing.", hpPath.join("."));
    } else {
      const next = hpValue + (HP[hpColumn][target + 1] - HP[hpColumn][level + 1]);
      change(hpPath, "HP max", "hp", hpColumn, hpValue, next);
      change(["system", "attributes", "hp", "value"], "HP current", "hp", hpColumn, source.system?.attributes?.hp?.value ?? null, next);
    }
  }

  const entries = items.map((item, index) => ({ item, index })).filter(({ item }) => item?.type === "spellcastingEntry");
  const preparedById = new Map(entries.map(({ item }) => [item._id, item.system?.prepared?.value]));
  for (const { item, index } of entries) {
    const name = item.name ?? `entry ${index}`;
    const spellStat = (path, table, label) => {
      const value = at(source, path);
      if (!isNumber(value)) {
        fail(LEVEL_SHIFT_CODES.STAT_MISSING, `${label} for ${name} is missing.`, path.join("."));
        return;
      }
      const result = classify({
        table, level, target, value, tolerance: TOLERANCE,
        unclassified: LEVEL_SHIFT_CODES.SPELL_ROLE_UNCLASSIFIED, ambiguous: LEVEL_SHIFT_CODES.SPELL_ROLE_UNCLASSIFIED
      });
      if (result.code) {
        fail(result.code, `${label} for ${name} does not match an extreme, high, or moderate column.`, path.join("."));
        return;
      }
      change(path, `${label}: ${name}`, "spell", result.column, value, value + result.delta);
    };
    spellStat(["items", index, "system", "spelldc", "dc"], SPELL_DC, "Spell DC");
    spellStat(["items", index, "system", "spelldc", "value"], SPELL_ATTACK, "Spell attack");
  }

  const spells = items.map((item, index) => ({ item, index })).filter(({ item }) => item?.type === "spell");
  if (entries.length && target <= 0) {
    fail(LEVEL_SHIFT_CODES.CASTER_LEVEL_UNSUPPORTED, "A caster at level 0 or below is not supported.");
  }
  for (const { item, index } of spells) {
    const name = item.name ?? `spell ${index}`;
    const damage = item.system?.damage;
    if (damage && typeof damage === "object" && Object.keys(damage).length) {
      fail(LEVEL_SHIFT_CODES.CASTER_DAMAGE_SPELL_UNSUPPORTED, `${name} deals damage; damaging spells are not rescaled.`, `items.${index}`);
      continue;
    }
    const innate = preparedById.get(item.system?.location?.value) === "innate";
    const rank = item.system?.level?.value;
    const effectiveRank = Number(item.system?.location?.heightenedLevel);
    const checkRank = Number.isFinite(effectiveRank) ? effectiveRank : rank;
    if (!innate && isNumber(checkRank) && checkRank > Math.ceil(target / 2)) {
      fail(LEVEL_SHIFT_CODES.CASTER_RANK_OVER_CAP, `${name} is rank ${checkRank}, above the cap of ${Math.ceil(target / 2)} at level ${target}.`, `items.${index}`);
    }
  }

  return finish();
}

/** Human-readable data for a preview. Read-only. */
export function describeLevelShift(plan) {
  const hp = plan.changes.find((entry) => entry.label === "HP max");
  return Object.freeze({
    source: Object.freeze({ name: plan.sourceName, from: plan.sourceLevel, to: plan.targetLevel, delta: plan.delta }),
    name: plan.name,
    problems: plan.problems.map(({ code, message, path }) => ({ code, message, path })),
    rows: plan.changes.map(({ label, path, column, before, after, delta }) => ({
      label, path: path.join("."), column, before, after, delta
    })),
    derived: { classDc: "Not stored. PF2e derives the class DC from the new level.", hpMax: hp ? hp.after : null },
    exclusions: plan.exclusions
  });
}

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);

/**
 * Deep copy of the source with the planned changes applied. The source is not
 * mutated. The name, level, HP, and notes are set, the native adjustment is
 * null, and the stored `_id`, `_stats`, and `ownership` are dropped so Foundry
 * assigns new ones. The existing public notes stay an exact prefix.
 */
export function buildShiftedActorData(source, plan) {
  if (!plan.ok) throw new Error("A rejected level-shift plan cannot be built.");
  const data = JSON.parse(JSON.stringify(source));
  for (const entry of plan.changes) setAt(data, entry.path, entry.after);
  data.name = plan.name;
  data.system.attributes.adjustment = null;
  const existing = source.system?.details?.publicNotes ?? "";
  const provenance = `<p>Level-shifted from ${escapeHtml(plan.sourceName)}: Level ${plan.sourceLevel} to Level ${plan.targetLevel}, using GM Core benchmark columns. The source actor is unchanged.</p>`;
  data.system.details.publicNotes = `${existing}${provenance}`;
  delete data._id;
  delete data._stats;
  delete data.ownership;
  return data;
}

/** Stable JSON with sorted keys, so two equal documents compare equal. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function maskAt(root, segments) {
  const parent = at(root, segments.slice(0, -1));
  if (parent && typeof parent === "object") parent[segments.at(-1)] = null;
}

/**
 * Check a shifted document against the plan. Returns problem strings; an empty
 * list means the document matches. Everything outside the planned paths must
 * equal the source (system and items), so exclusions are checked by content.
 * Used before the write (payload) and after it (persisted).
 */
export function verifyShiftedActorData(source, shifted, plan) {
  const problems = [];
  if (!plan.ok) return ["plan was rejected"];
  if (shifted?.name !== plan.name) problems.push("name differs from the reviewed name");
  for (const entry of plan.changes) {
    const actual = at(shifted, entry.path);
    if (actual !== entry.after) problems.push(`${entry.path.join(".")} is ${JSON.stringify(actual)}, expected ${JSON.stringify(entry.after)}`);
  }
  if ((shifted?.system?.attributes?.adjustment ?? null) !== null) problems.push("adjustment is not null");
  if (shifted?.system?.attributes?.hp?.value !== shifted?.system?.attributes?.hp?.max) problems.push("hp.value is not hp.max");
  const sourceNotes = source.system?.details?.publicNotes ?? "";
  if (!String(shifted?.system?.details?.publicNotes ?? "").startsWith(sourceNotes)) problems.push("publicNotes lost the source text");
  if (!Array.isArray(shifted?.items) || shifted.items.length !== (source.items ?? []).length) {
    problems.push("embedded item count changed");
    return problems;
  }
  const masked = (document) => {
    const copy = JSON.parse(JSON.stringify({ system: document.system ?? {}, items: document.items ?? [] }));
    for (const entry of plan.changes) maskAt(copy, entry.path);
    maskAt(copy, ["system", "details", "publicNotes"]);
    maskAt(copy, ["system", "attributes", "adjustment"]);
    return canonical(copy);
  };
  if (JSON.stringify(masked(source)) !== JSON.stringify(masked(shifted))) {
    problems.push("unchanged fields differ from the source (exclusions)");
  }
  return problems;
}
