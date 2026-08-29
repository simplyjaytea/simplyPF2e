import * as T from "./tables.mjs";
import { getPacksFor, findEntry, getDocument, toItemData, priceToGp } from "./compendium.mjs";
import { slugify, capitalized, esc, toHtml } from "./text.mjs";
import { parseRunes, applyRunes, capRunes, runeGp, hasRunes } from "./runes.mjs";

/* Re-exported so the rest of the module keeps importing its shared helpers
   from one place; the definitions live in text.mjs / runes.mjs / compendium.mjs. */
export { slugify, capitalized, esc, toHtml } from "./text.mjs";
export { parseRunes, applyRunes } from "./runes.mjs";
export { priceToGp } from "./compendium.mjs";

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

/*
 * IWR (immunity/weakness/resistance) type slugs, senses, and languages are
 * AI-invented free text like traits (see the validTraits filter below) — bare
 * slugify has no bound on what comes out, and createActor writes the result
 * straight into actor system data. Per invariant 5 these are validated against
 * the REAL pf2e allowed-value lists (invariant 2: fetched live, not recalled)
 * and anything that doesn't match is dropped with a console.warn.
 *
 * Sources (fetched 2026-08-28 from raw.githubusercontent.com/foundryvtt/pf2e/master):
 *
 * - src/scripts/config/iwr.ts — immunityTypes / weaknessTypes / resistanceTypes
 *   each `...`-spread three shared pieces before their own explicit keys:
 *     - materialDamageEffects from src/scripts/config/damage.ts: precious
 *       materials with IWR effects, R.pick()'d from preciousMaterials as
 *       ["abysium","adamantine","cold-iron","dawnsilver","djezet","duskwood",
 *       "inubrix","keep-stone","noqual","orichalcum","peachwood","siccatite",
 *       "silver","sisterstone-dusk","sisterstone-scarlet","sovereign-steel",
 *       "warpglass"], then iwr.ts itself R.omit()s six of those as niche
 *       ("keep-stone","peachwood","sisterstone-dusk","sisterstone-scarlet",
 *       "sovereign-steel","warpglass") — the 11 below are what's left.
 *     - magicTraditions from src/scripts/config/traits.ts: arcane/divine/
 *       occult/primal.
 *     - a local `sanctifiedIWR` object: holy/unholy.
 * - src/module/actor/creature/values.ts — SENSE_TYPES (the Sense DataModel's
 *   StringField choices in creature/sense.ts) and LANGUAGES (built from
 *   COMMON_LANGUAGES + UNCOMMON_LANGUAGES + RARE_LANGUAGES + "common" +
 *   "wildsong").
 */
const IWR_MATERIALS = [
  "abysium", "adamantine", "cold-iron", "dawnsilver", "djezet", "duskwood",
  "inubrix", "noqual", "orichalcum", "siccatite", "silver"
];
const IWR_SANCTIFIED = ["holy", "unholy"];
const IWR_TRADITIONS = ["arcane", "divine", "occult", "primal"];

const IMMUNITY_TYPES = new Set([
  ...IWR_MATERIALS, ...IWR_SANCTIFIED, ...IWR_TRADITIONS,
  "acid", "air", "alchemical", "area-damage", "auditory", "bleed", "blinded",
  "bludgeoning", "clumsy", "cold", "confused", "controlled", "critical-hits",
  "curse", "custom", "dazzled", "deafened", "death-effects", "detection",
  "disease", "doomed", "drained", "earth", "electricity", "emotion", "energy",
  "enfeebled", "fascinated", "fatigued", "fear-effects", "fire", "fleeing",
  "force", "fortune-effects", "frightened", "grabbed", "healing", "illusion",
  "immobilized", "inhaled", "light", "magic", "mental", "metal",
  "misfortune-effects", "non-magical", "nonlethal-attacks",
  "object-immunities", "off-guard", "olfactory", "paralyzed",
  "persistent-damage", "petrified", "physical", "piercing", "plant", "poison",
  "polymorph", "possession", "precision", "prone", "radiation", "restrained",
  "salt-water", "scrying", "sickened", "slashing", "sleep", "slowed", "sonic",
  "spell-deflection", "spirit", "stunned", "stupefied", "swarm-attacks",
  "swarm-mind", "trip", "unarmed-attacks", "unconscious", "visual", "vitality",
  "void", "water", "wood", "wounded"
]);

const WEAKNESS_TYPES = new Set([
  ...IWR_MATERIALS, ...IWR_SANCTIFIED, ...IWR_TRADITIONS,
  "acid", "air", "alchemical", "all-damage", "area-damage",
  "arrow-vulnerability", "axe-vulnerability", "bleed", "bludgeoning", "cold",
  "critical-hits", "custom", "earth", "electricity", "emotion", "energy",
  "fire", "force", "ghost-touch", "glass", "light", "magical", "mental",
  "metal", "mythic", "non-magical", "nonlethal-attacks", "persistent-damage",
  "physical", "piercing", "plant", "poison", "precision", "radiation", "salt",
  "salt-water", "slashing", "sonic", "spells", "spirit", "splash-damage",
  "unarmed-attacks", "vampire-weaknesses", "vitality", "void", "vorpal",
  "vorpal-fear", "vulnerable-to-sunlight", "water", "weapons",
  "weapons-shedding-bright-light", "wood"
]);

const RESISTANCE_TYPES = new Set([
  ...IWR_MATERIALS, ...IWR_SANCTIFIED, ...IWR_TRADITIONS,
  "acid", "air", "alchemical", "all-damage", "area-damage", "axes", "bleed",
  "bludgeoning", "cold", "critical-hits", "custom", "damage-from-spells",
  "earth", "electricity", "energy", "fire", "force", "ghost-touch", "light",
  "magical", "mental", "metal", "mythic", "non-magical", "nonlethal",
  "nonlethal-attacks", "persistent-damage", "physical", "piercing", "plant",
  "poison", "precision", "protean-anatomy", "radiation", "salt", "salt-water",
  "slashing", "sonic", "spells", "spirit", "unarmed-attacks", "vitality",
  "void", "vorpal", "vorpal-adamantine", "water", "weapons",
  "weapons-shedding-bright-light", "wood"
]);

const SENSE_TYPES = new Set([
  "darkvision", "echolocation", "greater-darkvision", "infrared-vision",
  "lifesense", "low-light-vision", "magicsense", "motion-sense", "scent",
  "see-invisibility", "spiritsense", "thoughtsense", "tremorsense",
  "truesight", "wavesense"
]);

const LANGUAGE_TYPES = new Set([
  "common",
  // COMMON_LANGUAGES
  "draconic", "dwarven", "elven", "fey", "gnomish", "goblin", "halfling",
  "jotun", "orcish", "sakvroth", "taldane",
  // UNCOMMON_LANGUAGES
  "adlet", "aklo", "alghollthu", "amurrun", "arboreal", "boggard", "calda",
  "caligni", "chthonian", "cyclops", "daemonic", "diabolic", "ekujae",
  "empyrean", "grippli", "hallit", "iruxi", "kelish", "kholo", "kibwani",
  "kitsune", "lirgeni", "muan", "mwangi", "mzunu", "nagaji", "necril",
  "ocotan", "osiriani", "petran", "protean", "pyric", "requian",
  "shadowtongue", "shoanti", "skald", "sphinx", "sussuran", "tang", "tengu",
  "thalassic", "tien", "utopian", "vanara", "varisian", "vudrani", "xanmba",
  "wayang", "ysoki",
  // RARE_LANGUAGES
  "akitonian", "anadi", "ancient-osiriani", "androffan", "anugobu",
  "arcadian", "azlanti", "destrachan", "drooni", "dziriak", "elder-thing",
  "erutaki", "formian", "garundi", "girtablilu", "goloma", "grioth", "hwan",
  "iblydan", "ikeshti", "immolis", "jistkan", "jyoti", "kaava", "kashrishi",
  "kovintal", "lashunta", "mahwek", "migo", "minaten", "minkaian", "munavri",
  "okaiyan", "orvian", "rasu", "ratajin", "razatlani", "russian", "samsaran",
  "sasquatch", "senzar", "shae", "shisk", "shobhad", "shoony", "shory",
  "strix", "surki", "talican", "tanuki", "tekritanin", "thassilonian",
  "varki", "vishkanyan", "wyrwood", "yaksha", "yithian",
  // secret
  "wildsong"
]);

/**
 * Filter a slugified list against a real allowed-value set (invariant 5:
 * fail closed, never guess). Shared by the IWR/sense/language whitelists.
 */
function filterAllowed(values, allowed, label) {
  const kept = values.filter((v) => allowed.has(v));
  const dropped = values.filter((v) => !allowed.has(v));
  if (dropped.length) console.warn(`simplypf2e | dropped invalid ${label}: ${dropped.join(", ")}`);
  return kept;
}

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

  // PF2e's hard ceiling is rank 10 — a level 21-24 creature's naive
  // ceil(level/2) would compute 11-12, which doesn't exist as a spell rank.
  const maxSpellRank = Math.min(10, Math.max(1, Math.ceil(clampedLevel / 2)));
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

  // Traits are AI-free-invented; validate against the real installed PF2e
  // trait list (CONFIG.PF2E.creatureTraits, same "derive from real data"
  // discipline as abilities/feats/spells/equipment) when that global exists.
  const draftTraits = (Array.isArray(c.traits) ? c.traits : []).map(slugify).filter(Boolean);
  let validTraits = draftTraits;
  if (typeof CONFIG !== "undefined" && CONFIG.PF2E?.creatureTraits) {
    validTraits = draftTraits.filter((t) => t in CONFIG.PF2E.creatureTraits);
    const dropped = draftTraits.filter((t) => !(t in CONFIG.PF2E.creatureTraits));
    if (dropped.length) console.warn(`simplypf2e | dropped invalid creature traits: ${dropped.join(", ")}`);
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
    traits: validTraits,
    languages: filterAllowed(
      (Array.isArray(c.languages) ? c.languages : []).map(slugify).filter(Boolean),
      LANGUAGE_TYPES, "creature languages"
    ),
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
      }))
      .filter((s) => {
        if (SENSE_TYPES.has(s.type)) return true;
        console.warn(`simplypf2e | dropped invalid creature sense: ${s.type}`);
        return false;
      }),
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
    // Focus spells ride on the normal spellcasting DC (v1 scope: focus-only
    // creatures are unsupported), so force [] when spellcasting is absent —
    // defense in depth against the AI ignoring the schema's own gate. Cap at
    // 3 AFTER filtering (the hard focus-pool ceiling), same as the PC path.
    focusSpells: !spellcasting ? [] : (Array.isArray(c.focusSpells) ? c.focusSpells : [])
      .map((s) => {
        const name = typeof s === "string" ? s.trim() : String(s?.name ?? "").trim();
        const candidate = s?.candidate?.packId && s?.candidate?._id ? s.candidate : null;
        return name ? { name, ...(candidate ? { candidate } : {}) } : null;
      })
      .filter(Boolean)
      .slice(0, 3),
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
    resistances: filterAllowed(
      (Array.isArray(c.resistances) ? c.resistances : []).map((r) => slugify(r?.type ?? r)).filter(Boolean),
      RESISTANCE_TYPES, "resistance types"
    ).slice(0, 4),
    weaknesses: filterAllowed(
      (Array.isArray(c.weaknesses) ? c.weaknesses : []).map((w) => slugify(w?.type ?? w)).filter(Boolean),
      WEAKNESS_TYPES, "weakness types"
    ).slice(0, 4),
    immunities: filterAllowed(
      (Array.isArray(c.immunities) ? c.immunities : []).map(slugify).filter(Boolean),
      IMMUNITY_TYPES, "immunity types"
    ).slice(0, 8)
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
      const candidate = e?.candidate?.packId && e?.candidate?._id ? e.candidate : null;
      const scrollCandidate = e?.scrollCandidate?.packId && e?.scrollCandidate?._id ? e.scrollCandidate : null;
      const coins = parseCoins(name);
      if (coins) {
        return { name: coins.name, quantity: Math.min(coins.count ? coins.count * quantity : quantity, 100000), value };
      }
      return {
        name: String(name), quantity: Math.min(quantity, 10), value,
        ...(candidate ? { candidate } : {}), ...(scrollCandidate ? { scrollCandidate } : {})
      };
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
 * Resolve loot names against the equipment packs. Loot may sit a little above
 * the creature's level — treasure rewards run ahead of encounter level.
 * Scrolls resolve their SPELL instead (PF2e ships no premade scroll items);
 * the scroll consumable is assembled from the rank template at creation.
 *
 * Each returned entry carries `resolvedValue`: the real per-unit gp price of
 * the matched compendium item (or the rank template, for scrolls), falling
 * back to the AI's own estimate when nothing matched or the match has no
 * price. The treasure-budget enforcement sums these, so real prices beat the
 * AI's guesses wherever a real item resolved. A runed name resolves to its
 * BASE item, so the runes' own real price is added on top (see runes.runeGp) —
 * otherwise a "+1 striking longsword" budgets as a 1 gp longsword while the
 * sheet renders a ~1,000 gp item, and the coin padding overshoots wildly.
 */
export async function resolveLoot(concept, { exactContent = false } = {}) {
  const loot = [];
  for (const { name, quantity, value, candidate, scrollCandidate } of concept.loot) {
    const scroll = parseScroll(name);
    if (scroll) {
      let entry = null;
      if (scrollCandidate && getPacksFor("spells").includes(scrollCandidate.packId)) {
        const doc = await getDocument(scrollCandidate);
        if (doc?.type === "spell" && !(doc.system?.traits?.value ?? []).includes("cantrip") && !doc.system?.ritual) {
          entry = scrollCandidate;
        }
      } else if (!exactContent) {
        entry = await findEntry(getPacksFor("spells"), scroll.spellName, (e) =>
          e.type === "spell" && !(e.system?.traits?.value ?? []).includes("cantrip") && !e.system?.ritual
        );
      }
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
    // Loot may sit up to 2 levels above the creature, so the runes are capped
    // at that same level rather than the creature's own.
    const maxLevel = Math.max(concept.level + 2, 0);
    const entry = candidate && getPacksFor("equipment").includes(candidate.packId)
      ? candidate : (exactContent ? null : await findEntry(
        getPacksFor("equipment"),
        parseRunes(name).base,
        (e) => (e.system?.level?.value ?? 0) <= maxLevel
      ));
    const runes = await capRunes(parseRunes(name), entry?.type, maxLevel);
    let resolvedValue = value;
    if (entry) {
      const doc = await getDocument(entry);
      const gp = priceToGp(doc?.system?.price?.value);
      // The matched entry is the BASE item, so add the runes' own real price.
      if (gp > 0) resolvedValue = gp + await runeGp(runes, entry.type);
      else if (hasRunes(runes)) resolvedValue = value + await runeGp(runes, entry.type);
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

/**
 * Decide whether an embedded NPC spell needs `location.heightenedLevel` set
 * so it groups under the AI-assigned (possibly heightened) rank instead of
 * falling back to its own base rank. Returns the rank to record, or null
 * when nothing should be written (cantrip, or rank matches the base rank —
 * matching real bestiary data convention of only recording a heightened
 * level when one actually applies).
 * @param {object} spellSystemData  the spell doc's `system` data (post toItemData)
 * @param {number} assignedRank     the rank resolveConcept clamped the AI's pick to
 * @returns {number|null}
 */
export function heightenedLevelFor(spellSystemData, assignedRank) {
  const isCantrip = (spellSystemData?.traits?.value ?? []).includes("cantrip");
  if (isCantrip) return null;
  const baseRank = spellSystemData?.level?.value ?? 0;
  if (assignedRank === baseRank) return null;
  return assignedRank;
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
export async function buildScrollItem(spellEntry, rank) {
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
export function customTreasureItem(name, quantity, value) {
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
export function customEquipmentItem(name, quantity, value) {
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
export async function resolveConcept(concept, { exactContent = false } = {}) {
  const abilities = [];
  for (const ability of concept.specialAbilities) {
    let entry = null;
    if (ability.glossary) entry = await findEntry(getPacksFor("abilities"), ability.glossary, (e) => e.type === "action");
    if (!entry) entry = await findEntry(getPacksFor("abilities"), ability.name, (e) => e.type === "action");
    abilities.push({ ability, entry });
  }

  const spells = [];
  if (concept.spellcasting) {
    for (const spell of concept.spellcasting.spells) {
      const exact = spell.candidate;
      const entry = exact && getPacksFor("spells").includes(exact.packId)
        ? exact : (exactContent ? null : await findEntry(getPacksFor("spells"), spell.name, (e) => e.type === "spell"));
      // A ranked spell assigned rank 0 (or below its own rank) would be
      // misfiled as a cantrip slot in createActor — clamp to the real rank.
      if (entry && !(entry.system?.traits?.value ?? []).includes("cantrip")) {
        spell.rank = Math.max(spell.rank, entry.system?.level?.value ?? 1);
      }
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

  // Gated on spellcasting (not just normalize-time): #refineSpells can null
  // out concept.spellcasting after normalizeConcept ran, and focus spells
  // have no DC of their own without it (v1 scope).
  const focusSpells = concept.spellcasting
    ? await resolveFocusSpells(concept.focusSpells ?? [], { exactContent }) : [];

  const equipment = await resolveEquipment(concept, { exactContent });
  const loot = await resolveLoot(concept, { exactContent });

  return { abilities, spells, feats, focusSpells, equipment, loot };
}

/**
 * Resolve a concept's carried equipment against the equipment packs. Shared
 * by NPC resolveConcept() and the PC pipeline (pc-builder.mjs), which both
 * carry the same {name, quantity, value} equipment shape and level cap.
 */
export async function resolveEquipment(concept, { exactContent = false } = {}) {
  const equipment = [];
  const maxLevel = Math.max(concept.level, 0);
  for (const { name, quantity, value, candidate } of concept.equipment) {
    // Strip fundamental runes ("+1 striking rapier" -> "rapier") so the base
    // item matches; the runes are re-applied as system data at creation.
    const entry = candidate && getPacksFor("equipment").includes(candidate.packId)
      ? candidate : (exactContent ? null : await findEntry(
        getPacksFor("equipment"),
        parseRunes(name).base,
        (e) => (e.system?.level?.value ?? 0) <= maxLevel
      ));
    // The item-level cap above only gates the BASE item — without this the AI's
    // chosen rune tier is ungated, so a level-1 character asked for "+1
    // striking" could be handed "+3 major striking" (a level-19 item).
    const runes = await capRunes(parseRunes(name), entry?.type, maxLevel);
    equipment.push({ name, quantity, value, runes, entry });
  }
  return equipment;
}

/**
 * Total gp value of a resolved equipment list (real base price + real rune
 * price where a compendium entry matched, else the AI's own estimate) —
 * mirrors resolveLoot()'s resolvedValue logic exactly, since resolveEquipment
 * doesn't precompute a resolvedValue field the way resolveLoot does. PC
 * equipment embeds at this real value (buildEquipmentItems), so the PC
 * pipeline deducts this from starting wealth before budgeting loot; NPC gear
 * is free by design and never calls this.
 * @param {object[]} equipment  entries from resolveEquipment()
 * @returns {Promise<number>}
 */
export async function equipmentValueGp(equipment) {
  let total = 0;
  // Same name-dedup rule as buildEquipmentItems({ dedup: true }) — the PC
  // embed drops repeated names (AI pads thin lists), so a duplicate's value
  // must not be deducted from the wealth budget either.
  const seen = new Set();
  for (const { name, quantity, value, runes, entry } of equipment ?? []) {
    const key = slugify(name);
    if (seen.has(key)) continue;
    seen.add(key);
    let unitGp = Number(value) || 0;
    if (entry) {
      const doc = await getDocument(entry);
      const gp = priceToGp(doc?.system?.price?.value);
      if (gp > 0) unitGp = gp + await runeGp(runes, entry.type);
      else if (hasRunes(runes)) unitGp = unitGp + await runeGp(runes, entry.type);
    }
    total += unitGp * (Number(quantity) || 1);
  }
  return total;
}

/** Resolved loot/equipment line's total gp value (per-unit resolvedValue/value × quantity). */
function lineGp(line) {
  const unit = Number(line?.resolvedValue ?? line?.value) || 0;
  return unit * (Number(line?.quantity) || 1);
}

/**
 * PC-only cross-bucket dedup: buildEquipmentItems({ dedup: true }) already
 * drops repeated names WITHIN the equipment list, and buildLootItems does the
 * same within loot — but neither checks the other bucket, so the AI listing
 * the same item as both starting gear AND treasure (e.g. a named weapon in
 * both `concept.equipment` and `concept.loot`) ships two physical copies.
 * Drops any loot entry whose slugified name also appears in the resolved
 * equipment list, before treasure budgeting ever sees it — dropping later
 * would let the budget count gp for an item that then vanishes anyway.
 * NPC path never calls this (NPC gear is free by design, separate from
 * dropped loot, and no cross-bucket check has ever applied there).
 * @param {object[]} loot        entries from resolveLoot()
 * @param {object[]} equipment   entries from resolveEquipment()
 * @returns {object[]} loot with equipment-duplicate names removed
 */
export function dedupeLootAgainstEquipment(loot, equipment) {
  if (!Array.isArray(loot)) return loot;
  const equipNames = new Set((Array.isArray(equipment) ? equipment : []).map((e) => slugify(e?.name ?? "")));
  const kept = [];
  for (const line of loot) {
    const key = slugify(line?.name ?? "");
    if (key && equipNames.has(key)) {
      console.warn(`simplypf2e | dropped loot item "${line?.name}" — already carried as starting equipment`);
      continue;
    }
    kept.push(line);
  }
  return kept;
}

/**
 * PC-only budget enforcement for NAMED loot. applyTreasureBudget() only ever
 * flexes coin entries by design (NPC treasure must never lose a named item),
 * so for PCs that leaves AI-named valuable loot (extra runed armor, etc.)
 * free to ship far over the starting-wealth budget. Keeps named (non-coin)
 * entries in ascending resolved-value order for as long as the running total
 * still fits budgetGp, and drops the rest with one summarizing console.warn —
 * ascending order means cheap consumables (potions/scrolls) tend to survive
 * while the priciest overflow items are what gets cut. Coin lines pass
 * through untouched; applyTreasureBudget() handles padding/trimming those
 * afterward against whatever value remains. Never throws: a non-array input
 * or a zero/negative budget just yields an empty named list.
 * @param {object[]} loot     entries from resolveLoot()
 * @param {number} budgetGp   gp remaining for loot after equipment (see equipmentValueGp)
 * @returns {object[]} loot with named entries trimmed to fit budgetGp
 */
export function enforceNamedLootBudget(loot, budgetGp) {
  if (!Array.isArray(loot)) return loot;
  const budget = Number.isFinite(budgetGp) ? Math.max(budgetGp, 0) : 0;
  const coinLines = loot.filter((l) => parseCoins(l?.name));
  const named = loot.filter((l) => !parseCoins(l?.name));
  const sorted = [...named].sort((a, b) => lineGp(a) - lineGp(b));
  const kept = [];
  const dropped = [];
  let running = 0;
  for (const line of sorted) {
    const gp = lineGp(line);
    if (running + gp <= budget) {
      kept.push(line);
      running += gp;
    } else {
      dropped.push(line);
    }
  }
  if (dropped.length) {
    const droppedGp = dropped.reduce((sum, l) => sum + lineGp(l), 0);
    console.warn(`simplypf2e | dropped ${dropped.length} named loot item(s) worth ~${Math.round(droppedGp)} gp over the PC loot budget (~${Math.round(budget)} gp): ${dropped.map((l) => l?.name).join(", ")}`);
  }
  return [...coinLines, ...kept];
}

/**
 * Resolve exact focus-spell candidates against the spell packs. Focus spells carry the
 * "focus" trait and have an EMPTY system.traits.traditions (verified against
 * real pack data, e.g. lay-on-hands.json), so the tradition-filtered
 * getSpellCandidates() can never match one — matched by trait here instead.
 * Shared: used by the PC pipeline (pc-builder.mjs) now, NPC pipeline later.
 * Unmatched names keep a null entry — downstream skips them, same fail-closed
 * treatment as every other unresolved compendium pick in this module.
 * @param {({name: string}|string)[]} names
 * @returns {Promise<{name: string, entry: object|null}[]>}
 */
export async function resolveFocusSpells(names, { exactContent = false } = {}) {
  const resolved = [];
  for (const raw of Array.isArray(names) ? names : []) {
    const name = typeof raw === "string" ? raw : raw?.name;
    if (!name) continue;
    const exact = raw?.candidate;
    let entry = null;
    if (exact && getPacksFor("spells").includes(exact.packId)) {
      const doc = await getDocument(exact);
      if (doc?.type === "spell" && (doc.system?.traits?.value ?? []).includes("focus")) entry = exact;
    } else if (!exactContent) {
      entry = await findEntry(
        getPacksFor("spells"),
        name,
        (e) => e.type === "spell" && (e.system?.traits?.value ?? []).includes("focus")
      );
    }
    resolved.push({ name, entry });
  }
  return resolved;
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
 * Turn resolved equipment into embeddable item data: real compendium clones
 * with quantities, fundamental runes and sensible carry states applied;
 * anything unmatched becomes a custom gear item at the AI's estimated price so
 * it doesn't silently vanish. Shared verbatim by the NPC and PC pipelines —
 * the only difference between them was PC-side name dedup, which is now the
 * `dedup` flag (the AI pads a thin list by repeating items; a repeated NAME is
 * filler, since a genuine stack arrives as one entry with quantity > 1).
 * @param {object[]} equipment  entries from resolveEquipment()
 * @param {{dedup?: boolean}} [options]
 * @returns {Promise<object[]>} item data ready to embed
 */
export async function buildEquipmentItems(equipment, { dedup = false } = {}) {
  const items = [];
  const seen = new Set();
  for (const { name, quantity, value, runes, entry } of equipment ?? []) {
    if (dedup) {
      const key = slugify(name);
      if (seen.has(key)) continue;
      seen.add(key);
    }
    const doc = await getDocument(entry);
    if (!doc) {
      items.push(customEquipmentItem(name, quantity, value));
      continue;
    }
    const data = toItemData(doc);
    setQuantity(data, quantity);
    applyRunes(data, runes);
    if (data.type === "weapon") {
      data.system.equipped = { ...data.system.equipped, carryType: "held", handsHeld: 1 };
    } else if (data.type === "armor") {
      data.system.equipped = { ...data.system.equipped, carryType: "worn", inSlot: true };
    }
    items.push(data);
  }
  return items;
}

/**
 * Turn resolved loot into embeddable item data (unequipped, in inventory):
 * scrolls assembled from their rank template, everything else a real
 * compendium clone with quantities and runes, and anything unmatched a custom
 * treasure item at the AI's estimated value so the haul keeps its worth.
 * Shared by the NPC pipeline (dropped loot) and the PC one (starting wealth).
 * Deduped by name for the same reason equipment is.
 * @param {object[]} loot  entries from resolveLoot()
 * @returns {Promise<object[]>} item data ready to embed
 */
export async function buildLootItems(loot) {
  const items = [];
  const seen = new Set();
  for (const { name, quantity, value, runes, entry, scroll } of loot ?? []) {
    // Coins are the one line that legitimately repeats (applyTreasureBudget
    // may add a Gold Pieces line next to an AI-drafted one), so they skip
    // dedup and simply stack on the sheet.
    if (!parseCoins(name)) {
      const key = slugify(name);
      if (seen.has(key)) continue;
      seen.add(key);
    }
    if (scroll) {
      const data = await buildScrollItem(entry, scroll.rank);
      items.push(data ? setQuantity(data, quantity) : customTreasureItem(name, quantity, value));
      continue;
    }
    const doc = await getDocument(entry);
    if (!doc) {
      items.push(customTreasureItem(name, quantity, value));
      continue;
    }
    const data = toItemData(doc);
    setQuantity(data, quantity);
    applyRunes(data, runes);
    items.push(data);
  }
  return items;
}

/** Set a stack size, but only on item types that actually carry one. */
function setQuantity(data, quantity) {
  if (quantity > 1 && "quantity" in (data.system ?? {})) data.system.quantity = quantity;
  return data;
}

/**
 * Final safety net before Actor.create: a single item of a type the actor's
 * schema rejects renders the whole sheet unopenable, so anything outside the
 * allowed set is dropped with a warning rather than sinking the actor.
 */
export function filterItemTypes(items, allowed, actorLabel) {
  return items.filter((item) => {
    if (allowed.has(item.type)) return true;
    console.warn(`simplypf2e | dropped "${item.name}": item type "${item.type}" is not allowed on ${actorLabel} actors`);
    return false;
  });
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
export async function createActor(concept, resolved, { img = null, scaffold = null } = {}) {
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
    const escaped = esc(ability.description);
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
      // Record the AI-assigned rank when it heightens the spell above its
      // base rank — otherwise SpellPF2e#rank falls back to the base rank
      // (heightenedLevel unset) and the spell groups under the wrong slot
      // row with 0/0 slots, becoming uncastable. Never set this on cantrips:
      // the system auto-heightens cantrips itself, and cantrips have no
      // slot rank to mismatch against.
      const heightenedLevel = heightenedLevelFor(data.system, spell.rank);
      if (heightenedLevel != null) data.system.location.heightenedLevel = heightenedLevel;
      items.push(data);
    }
  }

  // Focus spells: a separate `prepared.value: "focus"` entry — how the real
  // system identifies a focus pool — with NO slots object (focus spells spend
  // pool points, not slots). v1 scope: only attached alongside normal
  // spellcasting, so the entry reuses the existing spell DC/attack. Unlike
  // the PC path (pc-builder.mjs), NO Rule Element is needed for the pool max:
  // npc/document.ts merges system.resources.focus with the SOURCE data
  // winning, so value/max set on the actor below persist directly.
  let focusPoolSize = 0;
  if (concept.spellcasting && resolved.focusSpells?.some((s) => s.entry)) {
    const focusEntryId = foundry.utils.randomID();
    // Pool size = distinct focus-spell count, capped at 3 (PF2e's hard
    // ceiling) — a defensible module default, NOT verified against GM Core's
    // own creature-design guidance for this number (same class of gap as
    // TREASURE_BY_LEVEL, see tables.mjs).
    focusPoolSize = Math.min(resolved.focusSpells.filter((s) => s.entry).length, 3);
    items.push({
      _id: focusEntryId,
      name: "Focus Spells",
      type: "spellcastingEntry",
      img: "systems/pf2e/icons/default-icons/spellcastingEntry.svg",
      system: {
        tradition: { value: concept.spellcasting.tradition },
        prepared: { value: "focus", flexible: false },
        spelldc: { value: stats.spellAttack, dc: stats.spellDC, mod: 0 },
        showSlotlessLevels: { value: false }
      }
    });
    for (const { entry } of resolved.focusSpells) {
      const doc = await getDocument(entry);
      if (!doc) continue;
      const data = toItemData(doc);
      data.system.location = { ...(data.system.location ?? {}), value: focusEntryId };
      items.push(data);
    }
  }

  items.push(...await buildEquipmentItems(resolved.equipment));
  items.push(...await buildLootItems(resolved.loot));

  const safeItems = filterItemTypes(items, NPC_ITEM_TYPES, "NPC");

  const notesParts = [];
  if (concept.readAloud) {
    notesParts.push(`<blockquote class="spf-read-aloud"><em>${esc(concept.readAloud)}</em></blockquote>`);
  }
  if (concept.description) {
    notesParts.push(toHtml(concept.description));
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
      },
      // NPC focus pool max IS plain actor data (unlike PCs) — see the focus
      // entry block above for the npc/document.ts merge behavior.
      ...(focusPoolSize ? { resources: { focus: { value: focusPoolSize, max: focusPoolSize } } } : {})
    },
    prototypeToken: {
      ...(scaffold?.prototypeToken ?? {}),
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
