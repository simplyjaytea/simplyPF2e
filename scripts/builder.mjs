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
    equipment: (Array.isArray(c.equipment) ? c.equipment : []).map((e) => String(e)).filter(Boolean).slice(0, 12),
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
  for (const name of concept.equipment) {
    const entry = await findEntry(getPacksFor("equipment"), name, (e) => (e.system?.level?.value ?? 0) <= Math.max(concept.level, 0));
    equipment.push({ name, entry });
  }

  return { abilities, spells, feats, equipment };
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

/** Replace "<scale> DC/damage" phrases in AI ability text with real numbers. */
function substituteNumbers(text, stats, level) {
  return String(text)
    .replace(/\b(extreme|high|moderate)\s+DC\b/gi, (_, s) => `DC ${stats.classDC[s.toLowerCase()]}`)
    .replace(/\b(extreme|high|moderate|low)\s+damage\b/gi, (_, s) =>
      `${T.lookup(T.STRIKE_DAMAGE, level, s.toLowerCase())} damage`);
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
 * @returns {Promise<Actor>}
 */
export async function createActor(concept, resolved) {
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
    items.push({
      name: ability.name,
      type: "action",
      img: actionIcon(ability.actionType),
      system: {
        actionType: { value: ability.actionType },
        actions: { value: ability.actionType === "action" ? (ability.actions ?? 1) : null },
        category: "offensive",
        description: {
          value: `<p>${foundry.utils.escapeHTML
            ? foundry.utils.escapeHTML(substituteNumbers(ability.description, stats, concept.level))
            : substituteNumbers(ability.description, stats, concept.level)}</p>`
        },
        traits: { value: ability.traits }
      }
    });
  }

  // Feats (class-like trained techniques for humanoid-style creatures)
  for (const { entry } of resolved.feats) {
    const doc = await getDocument(entry);
    if (!doc) continue;
    items.push(toItemData(doc));
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

  // Equipment
  for (const { entry } of resolved.equipment) {
    const doc = await getDocument(entry);
    if (!doc) continue;
    items.push(toItemData(doc));
  }

  const description = concept.description
    ? `<p>${concept.description.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).join("</p><p>")}</p>`
    : "";

  const actorData = {
    name: concept.name,
    type: "npc",
    items,
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

  return Actor.create(actorData);
}

function capitalized(text) {
  return String(text).split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}
