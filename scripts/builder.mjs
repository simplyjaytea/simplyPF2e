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

export const slugify = (value) =>
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
        if (typeof e === "string" && e) return { name: e, quantity: 1, value: 0 };
        if (e?.name) {
          return {
            name: String(e.name),
            quantity: Math.min(Math.max(Math.round(Number(e.quantity) || 1), 1), 10),
            value: Math.max(Number(e.value) || 0, 0)
          };
        }
        return null;
      })
      // Coins belong in loot only; drop any that slip into equipment
      // (parseCoins recognizes "Gold Coins", "150 gold pieces", "20 gp", ...).
      .filter((e) => e && !parseCoins(e.name))
      .slice(0, 12),
    loot: normalizeLoot(c.loot),
    resistances: (Array.isArray(c.resistances) ? c.resistances : [])
      .map((r) => slugify(r?.type ?? r)).filter(Boolean).slice(0, 4),
    weaknesses: (Array.isArray(c.weaknesses) ? c.weaknesses : [])
      .map((w) => slugify(w?.type ?? w)).filter(Boolean).slice(0, 4),
    immunities: (Array.isArray(c.immunities) ? c.immunities : []).map(slugify).filter(Boolean).slice(0, 8)
  };
}

const COIN_ITEM_NAMES = {
  pp: "Platinum Pieces", platinum: "Platinum Pieces",
  gp: "Gold Pieces", gold: "Gold Pieces",
  sp: "Silver Pieces", silver: "Silver Pieces",
  cp: "Copper Pieces", copper: "Copper Pieces"
};

/**
 * Recognize coin loot like "Gold Coins", "150 gold pieces" or "20 gp" and map
 * it to the canonical PF2e treasure item, which the sheet displays as
 * currency. Returns null for anything that isn't purely coins.
 */
export function parseCoins(name) {
  const match = /^\s*(\d+)?\s*(platinum|gold|silver|copper|pp|gp|sp|cp)\s*(?:coins?|pieces?)?\s*$/i
    .exec(String(name ?? ""));
  if (!match) return null;
  return { name: COIN_ITEM_NAMES[match[2].toLowerCase()], count: match[1] ? Number(match[1]) : null };
}

/**
 * Coerce a raw AI loot array into {name, quantity} entries. Coin entries are
 * folded into their canonical treasure item name and may carry the large
 * quantities coins need; everything else keeps the equipment quantity cap.
 */
export function normalizeLoot(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((e) => {
      const name = typeof e === "string" ? e : e?.name;
      if (!name) return null;
      const quantity = Math.max(Math.round(Number(e?.quantity) || 1), 1);
      const value = Math.max(Number(e?.value) || 0, 0);
      const coins = parseCoins(name);
      if (coins) {
        return { name: coins.name, quantity: Math.min(coins.count ? coins.count * quantity : quantity, 100000), value };
      }
      return { name: String(name), quantity: Math.min(quantity, 10), value };
    })
    .filter(Boolean)
    .slice(0, 24); // fits LOOT_GUIDE's hoard guidance (~12-20 items) with headroom, still bounds runaway output
}

/** Recognize scroll loot like "Scroll of Fireball" or "Scroll of Fireball (Rank 3)". */
export function parseScroll(name) {
  const match = /^\s*scroll of\s+(.+?)\s*(?:\(\s*rank\s*(\d+)\s*\))?\s*$/i.exec(String(name ?? ""));
  if (!match) return null;
  return { spellName: match[1], rank: match[2] ? Number(match[2]) : null };
}

/**
 * Convert a PF2e price-value denomination object ({pp, gp, sp, cp}, any
 * subset present) into a single gp number.
 */
export function priceToGp(price) {
  if (!price || typeof price !== "object") return 0;
  return (Number(price.pp) || 0) * 10
    + (Number(price.gp) || 0)
    + (Number(price.sp) || 0) / 10
    + (Number(price.cp) || 0) / 100;
}

/**
 * Resolve loot names against the equipment packs. Loot may sit a little above
 * the creature's level — treasure rewards run ahead of encounter level.
 * Scrolls resolve their SPELL instead (PF2e ships no premade scroll items);
 * the scroll consumable is assembled from the rank template at creation.
 *
 * Each returned entry carries `resolvedValue`: the real per-unit gp price of
 * the matched compendium item (or the rank template, for scrolls), falling
 * back to the AI's own estimate when nothing matched or the match has no
 * price. The treasure-budget enforcement sums these, so real prices beat the
 * AI's guesses wherever a real item resolved.
 */
export async function resolveLoot(concept) {
  const loot = [];
  for (const { name, quantity, value } of concept.loot) {
    const scroll = parseScroll(name);
    if (scroll) {
      const entry = await findEntry(getPacksFor("spells"), scroll.spellName, (e) =>
        e.type === "spell" && !(e.system?.traits?.value ?? []).includes("cantrip") && !e.system?.ritual
      );
      const baseRank = entry?.system?.level?.value ?? 1;
      const rank = Math.min(Math.max(scroll.rank ?? baseRank, baseRank), 10);
      // A scroll's real price lives on the rank template it will be built
      // from at creation (there is no premade scroll item to price).
      const templateDoc = await getDocument(await findScrollTemplate(rank));
      const templateGp = priceToGp(templateDoc?.system?.price?.value);
      loot.push({
        name, quantity, value, runes: parseRunes(name), entry, scroll: { rank },
        resolvedValue: templateGp > 0 ? templateGp : value
      });
      continue;
    }
    const runes = parseRunes(name);
    const entry = await findEntry(
      getPacksFor("equipment"),
      runes.base,
      (e) => (e.system?.level?.value ?? 0) <= Math.max(concept.level + 2, 0)
    );
    let resolvedValue = value;
    if (entry) {
      const doc = await getDocument(entry);
      const gp = priceToGp(doc?.system?.price?.value);
      if (gp > 0) {
        // Rune-bearing names ("+1 striking rapier") only match the BASE item,
        // whose price excludes the runes — the AI's estimate is closer there.
        const hasRunes = runes.potency || runes.striking || runes.resilient;
        resolvedValue = hasRunes && value > 0 ? value : gp;
      }
    }
    loot.push({ name, quantity, value, runes, entry, resolvedValue });
  }
  return loot;
}

/** Total gp value of a resolved loot list (per-unit resolvedValue × quantity). */
export function lootValueGp(loot) {
  return (Array.isArray(loot) ? loot : []).reduce(
    (sum, l) => sum + (Number(l?.resolvedValue) || 0) * (Number(l?.quantity) || 1),
    0
  );
}

/* gp per coin, used when a coin line resolved without a usable price. */
const COIN_UNIT_GP = { "Platinum Pieces": 10, "Gold Pieces": 1, "Silver Pieces": 0.1, "Copper Pieces": 0.01 };

const coinUnitGp = (line) => {
  const coins = parseCoins(line.name);
  if (!coins) return 0;
  const resolved = Number(line.resolvedValue) || 0;
  return resolved > 0 ? resolved : (COIN_UNIT_GP[coins.name] ?? 0);
};

/**
 * Nudge a resolved loot list toward the target gp budget (from
 * tables.treasureBudget). Only the fungible coin entries flex — the same
 * lever published adventures use to pad treasure: if the haul is more than
 * ~20% short, coins are added (or a Gold Pieces line is created) to close
 * the gap; if more than ~20% over, coin quantities shrink, largest
 * denomination first. Named items are NEVER deleted or shrunk to hit a
 * budget — with no coins left to trim, an overshoot just gets a console
 * note. Defensive by design: any failure returns the loot unchanged rather
 * than blocking actor creation.
 */
export async function applyTreasureBudget(loot, targetGp) {
  try {
    if (!Array.isArray(loot) || !Number.isFinite(targetGp) || targetGp <= 0) return loot;
    const total = lootValueGp(loot);
    if (total >= targetGp * 0.8 && total <= targetGp * 1.2) return loot;

    if (total < targetGp * 0.8) {
      const gap = targetGp - total;
      const gold = loot.find((l) => parseCoins(l.name)?.name === "Gold Pieces");
      if (gold) {
        const unit = coinUnitGp(gold) || 1;
        gold.quantity = Math.min(gold.quantity + Math.max(Math.round(gap / unit), 1), 100000);
      } else {
        const entry = await findEntry(getPacksFor("equipment"), "Gold Pieces", (e) => e.type === "treasure");
        loot.push({
          name: "Gold Pieces",
          quantity: Math.min(Math.max(Math.round(gap), 1), 100000),
          value: 1,
          runes: parseRunes("Gold Pieces"),
          entry,
          resolvedValue: 1
        });
      }
      return loot;
    }

    // Overshoot: trim coins, biggest denomination first, never below zero.
    let excess = total - targetGp;
    const coinLines = loot.filter((l) => parseCoins(l.name)).sort((a, b) => coinUnitGp(b) - coinUnitGp(a));
    for (const line of coinLines) {
      if (excess <= 0) break;
      const unit = coinUnitGp(line);
      if (unit <= 0) continue;
      const removable = Math.min(Number(line.quantity) || 0, Math.floor(excess / unit));
      if (removable <= 0) continue;
      line.quantity -= removable;
      excess -= removable * unit;
    }
    if (excess > targetGp * 0.2) {
      console.log(`simplypf2e | loot is ~${Math.round(excess)} gp over the treasure budget with no coins left to trim — named items are never removed to hit a budget`);
    }
    // Drop coin lines trimmed all the way to zero.
    return loot.filter((l) => !(parseCoins(l.name) && (Number(l.quantity) || 0) <= 0));
  } catch (err) {
    console.warn("simplypf2e | treasure-budget enforcement failed, leaving loot unchanged", err);
    return loot;
  }
}

const RANK_ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];

/** Find the blank "Scroll of Nth-rank Spell" template item for a rank. */
async function findScrollTemplate(rank) {
  const ordinal = RANK_ORDINALS[rank - 1] ?? "1st";
  // Remaster naming first, pre-remaster "level" naming as fallback
  return (await findEntry(getPacksFor("equipment"), `Scroll of ${ordinal}-rank Spell`, (e) => e.type === "consumable"))
    ?? (await findEntry(getPacksFor("equipment"), `Scroll of ${ordinal}-level Spell`, (e) => e.type === "consumable"));
}

/**
 * Assemble a scroll consumable the way the PF2e system does on spell drag:
 * clone the "Scroll of Nth-rank Spell" template and embed the real spell.
 * @param {object} spellEntry  index entry of the spell (from resolveLoot)
 * @param {number} rank        rank the scroll casts the spell at
 * @returns {Promise<object|null>} item data, or null when spell/template is missing
 */
async function buildScrollItem(spellEntry, rank) {
  const spellDoc = await getDocument(spellEntry);
  if (!spellDoc) return null;
  const template = await findScrollTemplate(rank);
  const templateDoc = await getDocument(template);
  if (!templateDoc) return null;
  const data = toItemData(templateDoc);
  const spell = spellDoc.toObject();
  delete spell._id;
  spell.system.location = { ...(spell.system.location ?? {}), heightenedLevel: rank };
  data.name = `Scroll of ${spellDoc.name} (Rank ${rank})`;
  data.system.spell = spell;
  const traditions = spellDoc.system?.traits?.traditions ?? [];
  data.system.traits ??= { value: [] };
  data.system.traits.value = [...new Set([...(data.system.traits.value ?? []), ...traditions])];
  return data;
}

/**
 * Fallback for loot with no compendium match: a custom treasure item carrying
 * the AI's estimated value, so the haul keeps its worth instead of vanishing.
 */
function customTreasureItem(name, quantity, value) {
  const gp = Math.max(Math.round(Number(value) || 0), 0);
  const item = {
    name: capitalized(name),
    type: "treasure",
    img: "icons/svg/item-bag.svg",
    system: {
      price: { value: { gp } },
      description: { value: `<p>${game.i18n.localize("SIMPLYPF2E.Loot.CustomItem")}</p>` }
    }
  };
  if (quantity > 1) item.system.quantity = quantity;
  return item;
}

/**
 * Fallback for carried equipment with no compendium match: a custom gear item
 * (type "equipment", not "treasure") at the AI's estimated price, so gear the
 * creature should be carrying doesn't silently vanish or masquerade as coins.
 */
function customEquipmentItem(name, quantity, value) {
  const gp = Math.max(Math.round(Number(value) || 0), 0);
  const item = {
    name: capitalized(name),
    type: "equipment",
    img: "icons/svg/item-bag.svg",
    system: {
      price: { value: { gp } },
      description: { value: `<p>${game.i18n.localize("SIMPLYPF2E.Equipment.CustomItem")}</p>` }
    }
  };
  if (quantity > 1) item.system.quantity = quantity;
  return item;
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
  for (const { name, quantity, value } of concept.equipment) {
    // Strip fundamental runes ("+1 striking rapier" -> "rapier") so the base
    // item matches; the runes are re-applied as system data at creation.
    const runes = parseRunes(name);
    const entry = await findEntry(
      getPacksFor("equipment"),
      runes.base,
      (e) => (e.system?.level?.value ?? 0) <= Math.max(concept.level, 0)
    );
    equipment.push({ name, quantity, value, runes, entry });
  }

  const loot = await resolveLoot(concept);

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
 * Apply parsed fundamental runes to weapon/armor item data in place and rename
 * it to the runed name. The secondary rune is `striking` on weapons and
 * `resilient` on armor; each field keeps whichever value is higher (the item's
 * own or the parsed one). No-ops on other item types. Returns the item data.
 */
function applyRunes(data, runes, name) {
  const secondaryField = data.type === "weapon" ? "striking"
    : data.type === "armor" ? "resilient" : null;
  if (!secondaryField) return data;
  if (runes.potency || runes[secondaryField]) {
    data.system.runes = {
      ...data.system.runes,
      potency: Math.max(runes.potency, data.system.runes?.potency ?? 0),
      [secondaryField]: Math.max(runes[secondaryField], data.system.runes?.[secondaryField] ?? 0)
    };
    data.name = capitalized(name);
  }
  return data;
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

  // Equipment: apply quantities, fundamental runes, and sensible carry states.
  // Anything without a compendium match becomes a custom gear item at the AI's
  // estimated price, so it doesn't silently vanish from the actor.
  for (const { name, quantity, value, runes, entry } of resolved.equipment) {
    const doc = await getDocument(entry);
    if (!doc) {
      items.push(customEquipmentItem(name, quantity, value));
      continue;
    }
    const data = toItemData(doc);
    if (quantity > 1 && "quantity" in (data.system ?? {})) data.system.quantity = quantity;
    applyRunes(data, runes, name);
    if (data.type === "weapon") {
      data.system.equipped = { ...data.system.equipped, carryType: "held", handsHeld: 1 };
    } else if (data.type === "armor") {
      data.system.equipped = { ...data.system.equipped, carryType: "worn", inSlot: true };
    }
    items.push(data);
  }

  // Loot: apply quantities and runes (unequipped, in inventory). Anything
  // without a compendium match becomes a custom treasure item at the AI's
  // estimated value, so the haul keeps its worth instead of vanishing.
  for (const { name, quantity, value, runes, entry, scroll } of resolved.loot) {
    if (scroll) {
      const data = await buildScrollItem(entry, scroll.rank);
      if (data) {
        if (quantity > 1 && "quantity" in (data.system ?? {})) data.system.quantity = quantity;
        items.push(data);
      } else {
        items.push(customTreasureItem(name, quantity, value));
      }
      continue;
    }
    const doc = await getDocument(entry);
    if (!doc) {
      items.push(customTreasureItem(name, quantity, value));
      continue;
    }
    const data = toItemData(doc);
    if (quantity > 1 && "quantity" in (data.system ?? {})) data.system.quantity = quantity;
    applyRunes(data, runes, name);
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

export function capitalized(text) {
  return String(text).split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}
