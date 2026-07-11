import * as T from "./tables.mjs";
import { getPacksFor, findEntry, getDocument, toItemData } from "./compendium.mjs";

const SIZES = new Set(["tiny", "sm", "med", "lg", "huge", "grg"]);
const RARITIES = new Set(["common", "uncommon", "rare", "unique"]);
const SCALE4 = new Set(["extreme", "high", "moderate", "low"]);
const SCALE5 = new Set(["extreme", "high", "moderate", "low", "terrible"]);
const TRADITIONS = new Set(["arcane", "divine", "occult", "primal"]);
const SPEED_TYPES = new Set(["land", "fly", "swim", "climb", "burrow"]);
const STANDARD_SKILLS = new Set([
  "acrobatics", "arcana", "athletics", "crafting", "deception", "diplomacy",
  "intimidation", "medicine", "nature", "occultism", "performance", "religion",
  "society", "stealth", "survival", "thievery"
]);

const slugify = (value) =>
  String(value ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function scale4(value, fallback = "moderate") {
  return SCALE4.has(value) ? value : fallback;
}
function scale5(value, fallback = "moderate") {
  return SCALE5.has(value) ? value : fallback;
}

/**
 * Coerce whatever the AI returned into a well-formed concept. Guarantees every
 * field downstream code touches exists and has a legal value.
 */
export function normalizeConcept(raw, { level, rarity }) {
  const c = typeof raw === "object" && raw !== null ? raw : {};
  const clampedLevel = Math.min(Math.max(Math.round(Number(level) || 0), T.MIN_LEVEL), T.MAX_LEVEL);

  const abilities = {};
  for (const key of ["str", "dex", "con", "int", "wis", "cha"]) {
    abilities[key] = scale4(c.abilityScales?.[key], "moderate");
  }

  const speeds = (Array.isArray(c.speeds) ? c.speeds : [])
    .filter((s) => SPEED_TYPES.has(s?.type) && Number(s?.value) > 0)
    .map((s) => ({ type: s.type, value: Math.round(Number(s.value) / 5) * 5 }));
  if (!speeds.length) speeds.push({ type: "land", value: 25 });

  const strikes = (Array.isArray(c.strikes) ? c.strikes : [])
    .filter((s) => s?.name)
    .slice(0, 4)
    .map((s) => ({
      name: String(s.name),
      type: s.type === "ranged" ? "ranged" : "melee",
      attackScale: scale4(s.attackScale, "high"),
      damageScale: scale4(s.damageScale, "high"),
      damageType: slugify(s.damageType) || "bludgeoning",
      traits: (Array.isArray(s.traits) ? s.traits : []).map(slugify).filter(Boolean),
      range: Number(s.range) > 0 ? Math.round(Number(s.range) / 5) * 5 : null,
      attackEffects: (Array.isArray(s.attackEffects) ? s.attackEffects : []).map(slugify).filter(Boolean)
    }));
  if (!strikes.length) {
    strikes.push({
      name: "fist", type: "melee", attackScale: "high", damageScale: "high",
      damageType: "bludgeoning", traits: ["agile"], range: null, attackEffects: []
    });
  }

  const maxSpellRank = Math.max(1, Math.ceil(clampedLevel / 2));
  let spellcasting = null;
  if (c.spellcasting && TRADITIONS.has(c.spellcasting.tradition)) {
    // Spells may be empty at this point; the grounded compendium selection
    // pass fills the final list, and empty spellcasting is dropped after it.
    const spells = (Array.isArray(c.spellcasting.spells) ? c.spellcasting.spells : [])
      .filter((s) => s?.name)
      .map((s) => ({
        name: String(s.name),
        rank: Math.min(Math.max(Math.round(Number(s.rank) || 0), 0), maxSpellRank)
      }));
    spellcasting = {
      tradition: c.spellcasting.tradition,
      dcScale: ["extreme", "high", "moderate"].includes(c.spellcasting.dcScale)
        ? c.spellcasting.dcScale : "high",
      maxRank: maxSpellRank,
      spells
    };
  }

  return {
    name: String(c.name || "Unnamed Creature").slice(0, 120),
    blurb: String(c.blurb ?? ""),
    description: String(c.description ?? ""),
    readAloud: String(c.readAloud ?? ""),
    recallKnowledge: String(c.recallKnowledge ?? ""),
    level: clampedLevel,
    rarity: RARITIES.has(rarity) ? rarity : RARITIES.has(c.rarity) ? c.rarity : "common",
    size: SIZES.has(c.size) ? c.size : "med",
    traits: (Array.isArray(c.traits) ? c.traits : []).map(slugify).filter(Boolean),
    languages: (Array.isArray(c.languages) ? c.languages : []).map(slugify).filter(Boolean),
    abilityScales: abilities,
    acScale: scale4(c.acScale),
    hpScale: ["high", "moderate", "low"].includes(c.hpScale) ? c.hpScale : "moderate",
    perceptionScale: scale5(c.perceptionScale),
    saveScales: {
      fortitude: scale5(c.saveScales?.fortitude),
      reflex: scale5(c.saveScales?.reflex),
      will: scale5(c.saveScales?.will)
    },
    speeds,
    senses: (Array.isArray(c.senses) ? c.senses : [])
      .filter((s) => s?.type)
      .map((s) => ({
        type: slugify(s.type),
        acuity: ["precise", "imprecise", "vague"].includes(s.acuity) ? s.acuity : null,
        range: Number(s.range) > 0 ? Number(s.range) : null
      })),
    skills: (Array.isArray(c.skills) ? c.skills : [])
      .filter((s) => s?.name)
      .slice(0, 8)
      .map((s) => ({ name: String(s.name), scale: scale4(s.scale, "high") })),
    strikes,
    specialAbilities: (Array.isArray(c.specialAbilities) ? c.specialAbilities : [])
      .filter((a) => a?.name)
      .slice(0, 6)
      .map((a) => ({
        name: String(a.name),
        glossary: a.glossary ? String(a.glossary) : null,
        actionType: ["action", "reaction", "free", "passive"].includes(a.actionType) ? a.actionType : "passive",
        actions: [1, 2, 3].includes(Number(a.actions)) ? Number(a.actions) : null,
        description: String(a.description ?? ""),
        traits: (Array.isArray(a.traits) ? a.traits : []).map(slugify).filter(Boolean)
      })),
    spellcasting,
    feats: (Array.isArray(c.feats) ? c.feats : []).map((f) => String(f)).filter(Boolean).slice(0, 4),
    equipment: (Array.isArray(c.equipment) ? c.equipment : [])
      .map((e) => {
        if (typeof e === "string" && e) return { name: e, quantity: 1 };
        if (e?.name) {
          return {
            name: String(e.name),
            quantity: Math.min(Math.max(Math.round(Number(e.quantity) || 1), 1), 10)
          };
        }
        return null;
      })
      .filter(Boolean)
      .slice(0, 12),
    loot: (Array.isArray(c.loot) ? c.loot : [])
      .map((e) => {
        if (typeof e === "string" && e) return { name: e, quantity: 1 };
        if (e?.name) {
          return {
            name: String(e.name),
            quantity: Math.min(Math.max(Math.round(Number(e.quantity) || 1), 1), 10)
          };
        }
        return null;
      })
      .filter(Boolean)
      .slice(0, 12),
    resistances: (Array.isArray(c.resistances) ? c.resistances : [])
      .map((r) => slugify(r?.type ?? r)).filter(Boolean).slice(0, 4),
    weaknesses: (Array.isArray(c.weaknesses) ? c.weaknesses : [])
      .map((w) => slugify(w?.type ?? w)).filter(Boolean).slice(0, 4),
    immunities: (Array.isArray(c.immunities) ? c.immunities : []).map(slugify).filter(Boolean).slice(0, 8)
  };
}

/**
 * Resolve every compendium reference in a concept. Returns lookup results so
 * the preview can show what was found and what will become a custom ability.
 */
export async function resolveConcept(concept) {
  const abilities = [];
  for (const ability of concept.specialAbilities) {
    let entry = null;
    if (ability.glossary) entry = await findEntry(getPacksFor("abilities"), ability.glossary);
    if (!entry) entry = await findEntry(getPacksFor("abilities"), ability.name);
    abilities.push({ ability, entry });
  }

  const spells = [];
  if (concept.spellcasting) {
    for (const spell of concept.spellcasting.spells) {
      const entry = await findEntry(getPacksFor("spells"), spell.name, (e) => e.type === "spell");
      spells.push({ spell, entry });
    }
  }

  const feats = [];
  for (const name of concept.feats) {
    const entry = await findEntry(
      getPacksFor("feats"),
      name,
      (e) => e.type === "feat" && (e.system?.level?.value ?? 0) <= Math.max(concept.level, 1)
    );
    feats.push({ name, entry });
  }

  const equipment = [];
  for (const { name, quantity } of concept.equipment) {
    // Strip fundamental runes ("+1 striking rapier" -> "rapier") so the base
    // item matches; the runes are re-applied as system data at creation.
    const runes = parseRunes(name);
    const entry = await findEntry(
      getPacksFor("equipment"),
      runes.base,
      (e) => (e.system?.level?.value ?? 0) <= Math.max(concept.level, 0)
    );
    equipment.push({ name, quantity, runes, entry });
  }

  const loot = [];
  for (const { name, quantity } of concept.loot) {
    const runes = parseRunes(name);
    const entry = await findEntry(
      getPacksFor("equipment"),
      runes.base,
      (e) => (e.system?.level?.value ?? 0) <= Math.max(concept.level, 0)
    );
    loot.push({ name, quantity, runes, entry });
  }

  return { abilities, spells, feats, equipment, loot };
}

/** Compute the final numeric stat block (also used by the preview). */
export function computeStats(concept) {
  const lv = concept.level;
  const abilities = {};
  for (const [key, scale] of Object.entries(concept.abilityScales)) {
    abilities[key] = T.lookup(T.ABILITY_MODIFIER, lv, scale);
  }
  const spellDC = concept.spellcasting
    ? T.lookup(T.SPELL_DC, lv, concept.spellcasting.dcScale, ["high", "moderate"])
    : null;
  const spellAttack = concept.spellcasting
    ? T.lookup(T.SPELL_ATTACK, lv, concept.spellcasting.dcScale, ["high", "moderate"])
    : null;

  return {
    abilities,
    ac: T.lookup(T.AC, lv, concept.acScale),
    hp: T.lookup(T.HP, lv, concept.hpScale, ["moderate", "low"]),
    perception: T.lookup(T.PERCEPTION_AND_SAVES, lv, concept.perceptionScale),
    saves: {
      fortitude: T.lookup(T.PERCEPTION_AND_SAVES, lv, concept.saveScales.fortitude),
      reflex: T.lookup(T.PERCEPTION_AND_SAVES, lv, concept.saveScales.reflex),
      will: T.lookup(T.PERCEPTION_AND_SAVES, lv, concept.saveScales.will)
    },
    skills: concept.skills.map((s) => ({ ...s, mod: T.lookup(T.SKILL, lv, s.scale) })),
    strikes: concept.strikes.map((s) => ({
      ...s,
      bonus: T.lookup(T.STRIKE_ATTACK, lv, s.attackScale),
      damage: T.lookup(T.STRIKE_DAMAGE, lv, s.damageScale),
      average: T.averageDamage(T.lookup(T.STRIKE_DAMAGE, lv, s.damageScale))
    })),
    spellDC,
    spellAttack,
    resistanceValue: T.lookup(T.RESISTANCE, lv, "minimum", ["maximum"]),
    classDC: {
      extreme: T.lookup(T.SPELL_DC, lv, "extreme"),
      high: T.lookup(T.SPELL_DC, lv, "high"),
      moderate: T.lookup(T.SPELL_DC, lv, "moderate")
    }
  };
}

const DAMAGE_TYPES =
  "acid|bludgeoning|cold|electricity|fire|force|mental|piercing|poison|slashing|sonic|spirit|vitality|void|bleed|precision|untyped";
const SAVE_TYPES = "fortitude|reflex|will";
const CHECK_TYPES =
  "acrobatics|arcana|athletics|crafting|deception|diplomacy|intimidation|medicine|nature|occultism|performance|religion|society|stealth|survival|thievery|perception|flat";

/**
 * Turn conventional rules phrasing in AI ability text into PF2e inline
 * enrichers so damage, saves, checks, and area templates are all clickable
 * on the sheet and in chat ("just click" — no manual rolling). Scale words
 * (extreme/high/moderate/low) resolve to real numbers from the GM Core
 * tables for the creature's level.
 */
export function enrichDescription(text, level) {
  const dcFor = (scale) => T.lookup(T.SPELL_DC, level, scale.toLowerCase(), ["high", "moderate"]);
  const damageFor = (scale) => T.lookup(T.STRIKE_DAMAGE, level, scale.toLowerCase());
  let out = String(text);

  // "2d6 fire damage", "1d4 persistent bleed damage" (literal dice + type)
  out = out.replace(
    new RegExp(`\\b(\\d+d\\d+(?:[+-]\\d+)?)\\s+(persistent\\s+)?(${DAMAGE_TYPES})\\s+damage\\b`, "gi"),
    (_, dice, persistent, type) =>
      `@Damage[${dice}[${persistent ? "persistent," : ""}${type.toLowerCase()}]] damage`
  );

  // "high damage", "moderate fire damage", "low persistent bleed damage"
  out = out.replace(
    new RegExp(`\\b(extreme|high|moderate|low)\\s+(persistent\\s+)?(?:(${DAMAGE_TYPES})\\s+)?damage\\b`, "gi"),
    (_, scale, persistent, type) => {
      const dice = damageFor(scale);
      const damageType = type ? type.toLowerCase() : persistent ? "untyped" : null;
      const suffix = damageType ? `[${persistent ? "persistent," : ""}${damageType}]` : "";
      return `@Damage[${dice}${suffix}] damage`;
    }
  );

  // "basic high Reflex save", "moderate Fortitude save"
  out = out.replace(
    new RegExp(`\\b(basic\\s+)?(extreme|high|moderate)\\s+(?:DC\\s+)?(${SAVE_TYPES})\\s+save\\b`, "gi"),
    (_, basic, scale, save) =>
      `@Check[type:${save.toLowerCase()}|dc:${dcFor(scale)}${basic ? "|basic:true" : ""}] save`
  );

  // "DC 21 basic Reflex save" (literal DC the model wrote anyway)
  out = out.replace(
    new RegExp(`\\bDC\\s+(\\d+)\\s+(basic\\s+)?(${SAVE_TYPES})\\s+save\\b`, "gi"),
    (_, dc, basic, save) =>
      `@Check[type:${save.toLowerCase()}|dc:${dc}${basic ? "|basic:true" : ""}] save`
  );

  // "high DC Athletics check"
  out = out.replace(
    new RegExp(`\\b(extreme|high|moderate)\\s+DC\\s+(${CHECK_TYPES})\\s+check\\b`, "gi"),
    (_, scale, check) => `@Check[type:${check.toLowerCase()}|dc:${dcFor(scale)}] check`
  );

  // "DC 20 Athletics check", "DC 5 flat check" (literal DCs)
  out = out.replace(
    new RegExp(`\\bDC\\s+(\\d+)\\s+(${CHECK_TYPES})\\s+check\\b`, "gi"),
    (_, dc, check) => `@Check[type:${check.toLowerCase()}|dc:${dc}] check`
  );

  // "regains 2d8+4 Hit Points", "2d8 healing" become clickable healing rolls
  out = out.replace(
    /\b(\d+d\d+(?:[+-]\d+)?)\s+(?:hit points|healing)\b/gi,
    (_, dice) => `@Damage[${dice}[healing]] Hit Points`
  );

  // "30-foot cone" and friends become placeable templates
  out = out.replace(
    /\b(\d+)[-\s]foot\s+(cone|line|burst|emanation)\b/gi,
    (_, distance, shape) => `@Template[type:${shape.toLowerCase()}|distance:${distance}]`
  );

  // Any leftover "<scale> DC" becomes a plain number so no scale words leak
  out = out.replace(/\b(extreme|high|moderate)\s+DC\b/gi, (_, scale) => `DC ${dcFor(scale)}`);

  return out;
}

const STRIKING_RUNES = { "major striking": 3, "greater striking": 2, "striking": 1 };
const RESILIENT_RUNES = { "major resilient": 3, "greater resilient": 2, "resilient": 1 };

/**
 * Parse fundamental runes out of an item name like "+1 striking rapier" or
 * "+2 greater resilient breastplate", so the base item can be found in the
 * compendium and the runes applied as real system data.
 */
export function parseRunes(name) {
  const result = { base: String(name).trim(), potency: 0, striking: 0, resilient: 0 };
  const match = /^\s*\+(\d)\s+(.+)$/.exec(result.base);
  if (!match) return result;
  result.potency = Math.min(Number(match[1]), 3);
  let rest = match[2].trim();
  const lower = () => rest.toLowerCase();
  for (const [rune, value] of Object.entries(STRIKING_RUNES)) {
    if (lower().startsWith(`${rune} `)) {
      result.striking = value;
      rest = rest.slice(rune.length + 1);
      break;
    }
  }
  for (const [rune, value] of Object.entries(RESILIENT_RUNES)) {
    if (lower().startsWith(`${rune} `)) {
      result.resilient = value;
      rest = rest.slice(rune.length + 1);
      break;
    }
  }
  result.base = rest.trim();
  return result;
}

/* Which skill identifies a creature, by creature-type trait (Recall Knowledge). */
const RECALL_KNOWLEDGE_SKILLS = {
  aberration: "occultism", animal: "nature", astral: "occultism", beast: "nature",
  celestial: "religion", construct: "crafting", dragon: "arcana", dream: "occultism",
  elemental: "nature", ethereal: "occultism", fey: "nature", fiend: "religion",
  fungus: "nature", giant: "society", humanoid: "society", monitor: "religion",
  ooze: "occultism", plant: "nature", shade: "religion", spirit: "occultism",
  time: "occultism", undead: "religion"
};

/** The Recall Knowledge skill for a concept's creature-type traits. */
export function recallKnowledgeSkill(traits) {
  for (const trait of traits) {
    if (RECALL_KNOWLEDGE_SKILLS[trait]) return RECALL_KNOWLEDGE_SKILLS[trait];
  }
  return "occultism";
}

/** Bold statblock keywords ("Trigger", "Effect", ...) in escaped ability text. */
function boldKeywords(text) {
  return text.replace(
    /(^|; ?)(Frequency|Trigger|Requirements?|Effect|Critical Success|Success|Failure|Critical Failure)\b\s*/g,
    (_, lead, keyword) => `${lead}<strong>${keyword}</strong> `
  );
}

/**
 * Item types the PF2e system allows on NPC actors (its NPCPF2e.allowedItemTypes
 * plus creature-level types). Anything else embedded on an NPC breaks the
 * sheet, so createActor() filters against this list as a final safety net.
 */
const NPC_ITEM_TYPES = new Set([
  "action", "lore", "melee", "spell", "spellcastingEntry",
  "weapon", "armor", "equipment", "consumable", "treasure", "backpack", "shield", "kit",
  "condition", "effect"
]);

/**
 * NPCs may not embed feat items (the system forbids the type and the sheet
 * fails to render), so a matched feat becomes an NPC action item carrying the
 * feat's cost, rules text and automation — the same way bestiary statblocks
 * present feat-based abilities like Goblin Scuttle or Attack of Opportunity.
 */
export function featToAction(feat) {
  const actionType = feat.system?.actionType?.value ?? "passive";
  return {
    name: feat.name,
    type: "action",
    img: feat.img ?? actionIcon(actionType),
    system: {
      actionType: { value: actionType },
      actions: { value: actionType === "action" ? (feat.system?.actions?.value ?? 1) : null },
      category: "offensive",
      description: { value: feat.system?.description?.value ?? "" },
      traits: { value: feat.system?.traits?.value ?? [] },
      rules: feat.system?.rules ?? [],
      slug: feat.system?.slug ?? null,
      selfEffect: feat.system?.selfEffect ?? null
    }
  };
}

function actionIcon(actionType) {
  return {
    action: "systems/pf2e/icons/actions/OneAction.webp",
    reaction: "systems/pf2e/icons/actions/Reaction.webp",
    free: "systems/pf2e/icons/actions/FreeAction.webp",
    passive: "systems/pf2e/icons/actions/Passive.webp"
  }[actionType] ?? "systems/pf2e/icons/actions/Passive.webp";
}

/**
 * Build the full actor + embedded item data and create the NPC actor.
 * @param {object} [options]
 * @param {string|null} [options.img]  portrait/token image path
 * @returns {Promise<Actor>}
 */
export async function createActor(concept, resolved, { img = null } = {}) {
  const stats = computeStats(concept);
  const items = [];

  // Skills → lore items (the PF2e NPC skill representation)
  for (const skill of stats.skills) {
    const isLore = !STANDARD_SKILLS.has(slugify(skill.name).replaceAll("-", ""));
    items.push({
      name: isLore ? skill.name : capitalized(skill.name),
      type: "lore",
      img: "systems/pf2e/icons/default-icons/lore.svg",
      system: { mod: { value: skill.mod } }
    });
  }

  // Strikes → melee items
  for (const strike of stats.strikes) {
    const traits = [...strike.traits];
    if (strike.type === "ranged") {
      const hasRange = traits.some((t) => t.startsWith("range"));
      if (!hasRange) traits.push(`range-increment-${strike.range ?? 30}-feet`);
    }
    items.push({
      name: capitalized(strike.name),
      type: "melee",
      img: "systems/pf2e/icons/default-icons/melee.svg",
      system: {
        bonus: { value: strike.bonus },
        damageRolls: {
          [foundry.utils.randomID()]: {
            damage: strike.damage,
            damageType: strike.damageType,
            category: null
          }
        },
        traits: { value: traits },
        attackEffects: { value: strike.attackEffects }
      }
    });
  }

  // Special abilities → glossary clones or custom action items
  for (const { ability, entry } of resolved.abilities) {
    const doc = await getDocument(entry);
    if (doc) {
      items.push(toItemData(doc));
      continue;
    }
    const escaped = foundry.utils.escapeHTML
      ? foundry.utils.escapeHTML(ability.description)
      : ability.description;
    items.push({
      name: ability.name,
      type: "action",
      img: actionIcon(ability.actionType),
      system: {
        actionType: { value: ability.actionType },
        actions: { value: ability.actionType === "action" ? (ability.actions ?? 1) : null },
        category: "offensive",
        description: {
          value: `<p>${boldKeywords(enrichDescription(escaped, concept.level))}</p>`
        },
        traits: { value: ability.traits }
      }
    });
  }

  // Feats (class-like trained techniques) become NPC action items
  for (const { entry } of resolved.feats) {
    const doc = await getDocument(entry);
    if (!doc) continue;
    items.push(featToAction(doc.toObject()));
  }

  // Spellcasting entry + spells (skipped when no spell resolved to a document)
  if (concept.spellcasting && resolved.spells.some((s) => s.entry)) {
    const entryId = foundry.utils.randomID();
    const ranksUsed = new Set(resolved.spells.filter((s) => s.entry).map((s) => s.spell.rank));
    const slots = {};
    for (const rank of ranksUsed) {
      if (rank === 0) continue;
      slots[`slot${rank}`] = { value: 2, max: 2 };
    }
    items.push({
      _id: entryId,
      name: `${capitalized(concept.spellcasting.tradition)} Spells`,
      type: "spellcastingEntry",
      img: "systems/pf2e/icons/default-icons/spellcastingEntry.svg",
      system: {
        tradition: { value: concept.spellcasting.tradition },
        prepared: { value: "spontaneous", flexible: false },
        spelldc: { value: stats.spellAttack, dc: stats.spellDC, mod: 0 },
        slots,
        showSlotlessLevels: { value: false }
      }
    });
    for (const { spell, entry } of resolved.spells) {
      const doc = await getDocument(entry);
      if (!doc) continue;
      const data = toItemData(doc);
      data.system.location = { ...(data.system.location ?? {}), value: entryId };
      items.push(data);
    }
  }

  // Equipment: apply quantities, fundamental runes, and sensible carry states
  for (const { name, quantity, runes, entry } of resolved.equipment) {
    const doc = await getDocument(entry);
    if (!doc) continue;
    const data = toItemData(doc);
    if (quantity > 1 && "quantity" in (data.system ?? {})) data.system.quantity = quantity;
    if (data.type === "weapon") {
      if (runes.potency || runes.striking) {
        data.system.runes = {
          ...data.system.runes,
          potency: Math.max(runes.potency, data.system.runes?.potency ?? 0),
          striking: Math.max(runes.striking, data.system.runes?.striking ?? 0)
        };
        data.name = capitalized(name);
      }
      data.system.equipped = { ...data.system.equipped, carryType: "held", handsHeld: 1 };
    } else if (data.type === "armor") {
      if (runes.potency || runes.resilient) {
        data.system.runes = {
          ...data.system.runes,
          potency: Math.max(runes.potency, data.system.runes?.potency ?? 0),
          resilient: Math.max(runes.resilient, data.system.runes?.resilient ?? 0)
        };
        data.name = capitalized(name);
      }
      data.system.equipped = { ...data.system.equipped, carryType: "worn", inSlot: true };
    }
    items.push(data);
  }

  // Loot: apply quantities and runes (unequipped, in inventory)
  for (const { name, quantity, runes, entry } of resolved.loot) {
    const doc = await getDocument(entry);
    if (!doc) continue;
    const data = toItemData(doc);
    if (quantity > 1 && "quantity" in (data.system ?? {})) data.system.quantity = quantity;
    if (data.type === "weapon" && (runes.potency || runes.striking)) {
      data.system.runes = {
        ...data.system.runes,
        potency: Math.max(runes.potency, data.system.runes?.potency ?? 0),
        striking: Math.max(runes.striking, data.system.runes?.striking ?? 0)
      };
      data.name = capitalized(name);
    } else if (data.type === "armor" && (runes.potency || runes.resilient)) {
      data.system.runes = {
        ...data.system.runes,
        potency: Math.max(runes.potency, data.system.runes?.potency ?? 0),
        resilient: Math.max(runes.resilient, data.system.runes?.resilient ?? 0)
      };
      data.name = capitalized(name);
    }
    items.push(data);
  }

  // Final safety net: never embed an item type the NPC schema rejects — a
  // single illegal item renders the whole sheet unopenable.
  const safeItems = items.filter((item) => {
    if (NPC_ITEM_TYPES.has(item.type)) return true;
    console.warn(`simplypf2e | dropped "${item.name}": item type "${item.type}" is not allowed on NPC actors`);
    return false;
  });

  const esc = (text) => (foundry.utils.escapeHTML ? foundry.utils.escapeHTML(text) : text);
  const notesParts = [];
  if (concept.readAloud) {
    notesParts.push(`<blockquote class="spf-read-aloud"><em>${esc(concept.readAloud)}</em></blockquote>`);
  }
  if (concept.description) {
    notesParts.push(`<p>${concept.description.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).join("</p><p>")}</p>`);
  }
  if (concept.recallKnowledge) {
    const skill = recallKnowledgeSkill(concept.traits);
    const dc = T.identificationDC(concept.level, concept.rarity);
    notesParts.push(
      `<h3>Recall Knowledge</h3><p><strong>${capitalized(skill)}</strong> @Check[type:${skill}|dc:${dc}]: ${esc(concept.recallKnowledge)}</p>`
    );
  }
  const description = notesParts.join("\n");

  const actorData = {
    name: concept.name,
    type: "npc",
    items: safeItems,
    system: {
      abilities: Object.fromEntries(
        Object.entries(stats.abilities).map(([k, mod]) => [k, { mod }])
      ),
      attributes: {
        ac: { value: stats.ac, details: "" },
        hp: { value: stats.hp, max: stats.hp, temp: 0, details: "" },
        speed: {
          value: concept.speeds.find((s) => s.type === "land")?.value ?? 0,
          otherSpeeds: concept.speeds.filter((s) => s.type !== "land"),
          details: ""
        },
        allSaves: { value: "" },
        immunities: concept.immunities.map((type) => ({ type })),
        resistances: concept.resistances.map((type) => ({ type, value: stats.resistanceValue })),
        weaknesses: concept.weaknesses.map((type) => ({ type, value: stats.resistanceValue }))
      },
      perception: {
        mod: stats.perception,
        details: "",
        senses: concept.senses.map((s) => {
          const sense = { type: s.type };
          if (s.acuity) sense.acuity = s.acuity;
          if (s.range) sense.range = s.range;
          return sense;
        })
      },
      saves: {
        fortitude: { value: stats.saves.fortitude, saveDetail: "" },
        reflex: { value: stats.saves.reflex, saveDetail: "" },
        will: { value: stats.saves.will, saveDetail: "" }
      },
      details: {
        level: { value: concept.level },
        blurb: concept.blurb,
        publicNotes: description,
        languages: { value: concept.languages, details: "" }
      },
      traits: {
        value: concept.traits,
        rarity: concept.rarity,
        size: { value: concept.size }
      }
    },
    prototypeToken: {
      displayName: CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
      displayBars: CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER
    }
  };
  if (img) {
    actorData.img = img;
    actorData.prototypeToken.texture = { src: img };
  }

  return Actor.create(actorData);
}

function capitalized(text) {
  return String(text).split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}
