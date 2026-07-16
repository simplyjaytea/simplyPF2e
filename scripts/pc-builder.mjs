import * as T from "./tables.mjs";
import { findEntry, getDocument, toItemData, getPacksFor, getAllPacksFor, getFeatCandidates } from "./compendium.mjs";
import {
  parseCoins, resolveLoot, resolveEquipment, resolveFocusSpells, buildScrollItem,
  customTreasureItem, customEquipmentItem, applyRunes, capitalized, slugify
} from "./builder.mjs";
import { findRuleExemplar } from "./rule-templates.mjs";
import { ABILITY_BOOST_LEVELS, SKILL_INCREASE_LEVELS, buildFeatSlots, spontaneousSpellSlots } from "./pc-tables.mjs";

/**
 * Player-character counterpart of builder.mjs. PCs get their AC/HP/saves/
 * proficiencies/spell slots computed by the PF2e system itself from real
 * Ancestry+Background+Class items once those are correctly attached — this
 * module's job is assembling a valid, fully-grounded set of real-item
 * choices, NOT reimplementing that math (unlike tables.mjs, which hardcodes
 * NPC benchmark numbers because NPCs have no such items to derive from).
 */

const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"];

/**
 * Coerce the AI's raw PC concept JSON into a well-formed object. Guarantees
 * every field downstream code touches exists and has a legal value — the PC
 * counterpart of builder.mjs's normalizeConcept(), clamping level 1-20 (not
 * -1..24 — PCs, unlike creatures, don't go below level 1 or above 20).
 *
 * A few fields (rarity/traits/strikes/description) are filled with inert PC
 * defaults purely so the EXISTING NPC refine helpers in generator-app.mjs
 * (#refineSpells/#refineEquipment/#refineLoot) can run unchanged against a PC
 * concept — those helpers only ever read concept.blurb/description/traits/
 * strikes/equipment/loot/level/name/rarity, all of which a PC concept can
 * legitimately provide.
 */
export function normalizePCConcept(raw, { level }) {
  const c = typeof raw === "object" && raw !== null ? raw : {};
  const clampedLevel = Math.min(Math.max(Math.round(Number(level) || 1), 1), 20);
  const maxSpellRank = Math.max(1, Math.ceil(clampedLevel / 2));

  let spellcasting = null;
  if (c.spellcasting && typeof c.spellcasting === "object"
    && ["arcane", "divine", "occult", "primal"].includes(c.spellcasting.tradition)) {
    const spells = (Array.isArray(c.spellcasting.spells) ? c.spellcasting.spells : [])
      .filter((s) => s?.name)
      .map((s) => ({
        name: String(s.name),
        rank: Math.min(Math.max(Math.round(Number(s.rank) || 0), 0), maxSpellRank)
      }));
    spellcasting = { tradition: c.spellcasting.tradition, dcScale: "high", maxRank: maxSpellRank, spells };
  }

  return {
    name: String(c.name || "Unnamed Character").slice(0, 120),
    ancestry: String(c.ancestry || "Human").slice(0, 80),
    heritage: c.heritage ? String(c.heritage).slice(0, 80) : null,
    background: String(c.background || "Follower").slice(0, 80),
    class: String(c.class || "Fighter").slice(0, 80),
    keyAbility: ABILITY_KEYS.includes(c.keyAbility) ? c.keyAbility : "str",
    level: clampedLevel,
    // Inert PC defaults so the reused NPC refine helpers have legal input:
    rarity: "common",
    traits: [], // generator-app fills this with [ancestry slug, class slug] once ABC is grounded
    strikes: [], // PCs have no precomputed strikes; only read for equipment keyword extraction
    blurb: String(c.blurb ?? ""),
    description: String(c.backstory ?? ""), // #refineEquipment/#refineLoot read concept.description
    backstory: String(c.backstory ?? ""),
    appearance: String(c.appearance ?? ""),
    age: String(c.age ?? "").slice(0, 40),
    gender: String(c.gender ?? "").slice(0, 40),
    height: String(c.height ?? "").slice(0, 40),
    weight: String(c.weight ?? "").slice(0, 40),
    ethnicity: String(c.ethnicity ?? "").slice(0, 60),
    nationality: String(c.nationality ?? "").slice(0, 60),
    personality: String(c.personality ?? ""),
    alignmentFlavor: String(c.alignmentFlavor ?? ""),
    likes: String(c.likes ?? ""),
    dislikes: String(c.dislikes ?? ""),
    allies: String(c.allies ?? ""),
    enemies: String(c.enemies ?? ""),
    organizations: String(c.organizations ?? ""),
    languages: (Array.isArray(c.languages) ? c.languages : []).map((l) => String(l)).filter(Boolean).slice(0, 6),
    feats: (Array.isArray(c.feats) ? c.feats : []).map((f) => String(f)).filter(Boolean).slice(0, 8),
    spellcasting,
    // Focus spells are independent of `spellcasting` (a Champion has focus
    // spells but no slots). Cap at 3 AFTER filtering — the hard focus-pool
    // ceiling — so the first 3 VALID names are kept, not the first 3 raw ones.
    focusSpells: (Array.isArray(c.focusSpells) ? c.focusSpells : [])
      .map((s) => {
        if (typeof s === "string") return s.trim();
        if (s?.name) return String(s.name).trim();
        return "";
      })
      .filter(Boolean)
      .slice(0, 3)
      .map((name) => ({ name })),
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
      // Coins belong in loot only, same guard as normalizeConcept's equipment.
      .filter((e) => e && !parseCoins(e.name))
      .slice(0, 10),
    // PCs get their starting wealth as loot separately (see pcStartingWealthGp
    // below), not from an AI-drafted "dropped loot" list — there's no AI
    // first draft for this, so it starts empty and applyTreasureBudget()
    // (reused completely unchanged) pads it with coins to the target value.
    loot: []
  };
}

/**
 * Expected starting wealth (gp) for a character of `level`: the GM Core/CRB
 * Table 10-9 Treasure by Level total for that level (a character's OWN
 * accumulated wealth-by-level — see the doc comment on T.TREASURE_BY_LEVEL),
 * scaled by the GM's Treasure amount setting. Deliberately NOT
 * treasureBudget() — that divides by ENCOUNTERS_PER_LEVEL, an NPC-per-
 * encounter share, which is the wrong number for a PC's own starting wealth.
 *
 * Level 1 is a special case: the Core Rulebook gives every 1st-level
 * character a flat 15 gp, independent of class/ancestry — the Treasure by
 * Level table only applies when starting a campaign ABOVE 1st level (or
 * replacing a character mid-campaign). Reusing the table for level 1 gave a
 * brand-new character ~175 gp, over 10x the real starting amount.
 */
export function pcStartingWealthGp(level, amount = "standard") {
  const gp = level <= 1 ? 15 : T.lookup(T.TREASURE_BY_LEVEL, level, "total", []);
  return Math.round(gp * (T.TREASURE_AMOUNT_MULTIPLIER[amount] ?? 1));
}

/** Resolve one document's granted feature items (UUID-keyed system.items
 * records — see the SCHEMA NOTE in createCharacterActor for the verification
 * caveat on this field name), filtered to level <= maxLevel. */
async function resolveGrants(doc, maxLevel) {
  const grants = [];
  const records = doc?.system?.items;
  if (!records || typeof records !== "object") return grants;
  for (const record of Object.values(records)) {
    const grantLevel = Number(record?.level) || 0;
    if (grantLevel > maxLevel) continue;
    const uuid = record?.uuid;
    if (!uuid) continue;
    try {
      const granted = await fromUuid(uuid);
      if (granted) grants.push(granted);
    } catch (err) {
      console.warn(`simplypf2e | failed to resolve granted item ${uuid}`, err);
    }
  }
  return grants;
}

/**
 * Resolve every compendium reference in a PC concept — the PC counterpart of
 * builder.mjs's resolveConcept(). Assumes concept.ancestry/heritage/
 * background/class already carry GROUNDED real names (i.e. generator-app has
 * already run selectAncestryBackgroundClass() and copied its picks onto the
 * concept) — this just does the findEntry/getDocument/grant-resolution work.
 * Ancestry/background/class are REQUIRED: the build is meaningless without
 * them, so a failure to resolve any of the three throws rather than silently
 * producing a broken actor. Heritage is optional and fails closed (dropped
 * with a console.warn) like every other unresolved AI pick in this module.
 *
 * Returns feat SLOTS with their candidate lists (not yet picked) — picking
 * happens in generator-app via ai.mjs's selectFeats(), mirroring how AI calls
 * live in the app while resolution lives here for the NPC pipeline too.
 */
export async function resolvePCConcept(concept) {
  // ABC lookups scan ALL installed packs of the right type (getAllPacksFor),
  // not just the hardcoded default pack, so a legit AI pick living in a Lost
  // Omens / add-on compendium still resolves instead of aborting the run (#51).
  const ancestryEntry = await findEntry(await getAllPacksFor("ancestries"), concept.ancestry, (e) => e.type === "ancestry");
  const ancestryDoc = await getDocument(ancestryEntry);
  if (!ancestryDoc) throw new Error(`Could not find ancestry "${concept.ancestry}" in the compendium`);

  const backgroundEntry = await findEntry(await getAllPacksFor("backgrounds"), concept.background, (e) => e.type === "background");
  const backgroundDoc = await getDocument(backgroundEntry);
  if (!backgroundDoc) throw new Error(`Could not find background "${concept.background}" in the compendium`);

  const classEntry = await findEntry(await getAllPacksFor("classes"), concept.class, (e) => e.type === "class");
  const classDoc = await getDocument(classEntry);
  if (!classDoc) throw new Error(`Could not find class "${concept.class}" in the compendium`);

  let heritageDoc = null;
  if (concept.heritage) {
    const heritageEntry = await findEntry(await getAllPacksFor("heritages"), concept.heritage, (e) => e.type === "heritage");
    heritageDoc = await getDocument(heritageEntry);
    if (!heritageDoc) {
      console.warn(`simplypf2e | heritage "${concept.heritage}" not found in the compendium — dropping (character will have no heritage)`);
    }
  }

  // Tagged with which ABC item granted each one (issue: background's own
  // built-in feat — e.g. Acolyte's "Student of the Canon" — was landing in
  // Bonus Feats): createCharacterActor needs to know the granting item so it
  // can set the granted feat's system.location to that item's own embedded
  // id, matching the real system's ABCItemPF2e.createGrantedItems().
  const grants = [
    ...(await resolveGrants(ancestryDoc, concept.level)).map((doc) => ({ doc, parent: "ancestry" })),
    ...(await resolveGrants(heritageDoc, concept.level)).map((doc) => ({ doc, parent: "heritage" })),
    ...(await resolveGrants(backgroundDoc, concept.level)).map((doc) => ({ doc, parent: "background" })),
    ...(await resolveGrants(classDoc, concept.level)).map((doc) => ({ doc, parent: "class" }))
  ];

  // Feat slots: candidates only (no picks yet — generator-app runs
  // selectFeats() and resolveFeatPicks() below once it has these lists).
  const ancestryTrait = slugify(ancestryDoc.name);
  const classTrait = slugify(classDoc.name);
  const featSlots = [];
  for (const slot of buildFeatSlots(concept.level)) {
    const traits = slot.type === "ancestry" ? [ancestryTrait] : slot.type === "class" ? [classTrait] : [];
    const candidates = await getFeatCandidates({ level: slot.level, category: slot.type, traits });
    if (candidates.length) featSlots.push({ ...slot, candidates });
  }

  const spells = [];
  if (concept.spellcasting) {
    for (const spell of concept.spellcasting.spells) {
      const entry = await findEntry(getPacksFor("spells"), spell.name, (e) => e.type === "spell");
      spells.push({ spell, entry });
    }
  }

  const focusSpells = await resolveFocusSpells(concept.focusSpells ?? []);

  const equipment = await resolveEquipment(concept);
  // concept.loot starts empty (see normalizePCConcept) — resolveLoot() is a
  // no-op on it here; applyTreasureBudget() (called by generator-app with
  // pcStartingWealthGp()) is what actually fills it with coins.
  const loot = await resolveLoot(concept);

  return { ancestryDoc, heritageDoc, backgroundDoc, classDoc, grants, featSlots, spells, focusSpells, equipment, loot };
}

/**
 * Resolve ai.mjs's selectFeats() picks against each slot's own candidate
 * list. Unlike NPC feats (which fail closed — a creature is fine with fewer
 * abilities), a PC feat SLOT is a real, level-gated entitlement the rules
 * grant — leaving it permanently empty is a worse outcome than filling it
 * with a plausible default the GM can swap out. So a slot whose pick is
 * missing (the AI dropped it — selectFeats batches every slot into one call,
 * and a large character can have 20+ slots) or doesn't resolve (hallucinated
 * name) falls back to the first candidate from THAT SLOT's own already-
 * validated list (issue #56 item 4) instead of being dropped. The AI's pick
 * is also now matched with the SAME category filter (`system.category ===
 * slot.type`) the candidate list itself was built with — previously a
 * same-named-but-wrong-category feat elsewhere in the compendium could
 * resolve in place of the slot's own intended pick.
 * @param {{type: string, level: number, candidates: {name: string}[]}[]} featSlots
 * @param {{slot: number, name: string}[]} picks
 * @returns {Promise<{type: string, level: number, entry: object}[]>}
 */
export async function resolveFeatPicks(featSlots, picks) {
  const bySlot = new Map(picks.map((p) => [p.slot, p.name]));
  const resolved = [];
  for (let i = 0; i < featSlots.length; i++) {
    const slot = featSlots[i];
    let name = bySlot.get(i + 1) ?? null;
    let entry = null;
    if (name) {
      entry = await findEntry(
        getPacksFor("feats"),
        name,
        (e) => e.type === "feat" && e.system?.category === slot.type && (e.system?.level?.value ?? 0) <= slot.level
      );
      if (!entry) {
        console.warn(`simplypf2e | feat pick "${name}" for slot ${i + 1} (${slot.type}, level ${slot.level}) did not resolve to a real feat for this slot`);
      }
    }
    if (!entry && slot.candidates?.length) {
      // Fallback: the slot's own first candidate is guaranteed to be a real,
      // already level/category/trait-filtered feat, so this always resolves.
      name = slot.candidates[0].name;
      entry = await findEntry(
        getPacksFor("feats"),
        name,
        (e) => e.type === "feat" && e.system?.category === slot.type && (e.system?.level?.value ?? 0) <= slot.level
      );
      if (entry) console.warn(`simplypf2e | slot ${i + 1} (${slot.type}, level ${slot.level}) had no usable AI pick — defaulted to "${name}"`);
    }
    // entry can still be null only if the slot had no candidates at all
    // (shouldn't happen — resolvePCConcept only creates slots with >=1
    // candidate); the name is kept so the preview can still show intent.
    resolved.push({ type: slot.type, level: slot.level, name: name ?? `${slot.type} feat`, entry });
  }
  return resolved;
}

/**
 * Deterministic v1 ability-boost assignment: boost the class's key ability
 * and Constitution at every eligible tier, filling the rest of the 4 free
 * boosts from the remaining abilities in a fixed order. This is a reasonable
 * default build, NOT a real point-buy allocation tailored to the concept —
 * out of scope per the plan (no pre-create edit screen in v1); a GM should
 * sanity-check/adjust it before play, same review step as any other preview.
 */
function boostPriority(keyAbility) {
  const key = ABILITY_KEYS.includes(keyAbility) ? keyAbility : "str";
  return [key, "con", ...ABILITY_KEYS.filter((a) => a !== key && a !== "con")];
}

function assignAbilityBoosts(keyAbility) {
  const priority = boostPriority(keyAbility).slice(0, 4);
  const boosts = {};
  for (const level of ABILITY_BOOST_LEVELS) boosts[level] = [...priority];
  return boosts;
}

/**
 * Pick a legal `selected` for every ability-boost slot on a cloned ancestry or
 * background item, so the PF2e system actually applies each boost. An unset
 * `selected` contributes NOTHING (verified: ancestry/background document
 * prepareActorData only pushes slots whose `selected` is truthy — that's why
 * a freshly-attached ancestry/background gave the character no attribute
 * boosts, issue #50 item 1). Slot rules verified against foundryvtt/pf2e item
 * source (ancestry/background data.ts + ancestry document prepareBaseData):
 *   value.length === 1 -> fixed boost, selected forced to value[0]
 *   value.length  >  1 -> constrained choice, pick from the listed options
 *   value.length === 0 -> not a real boost in modern data (legacy/voluntary
 *                          placeholder, e.g. Human's third slot); left untouched
 * Free boosts within one item are kept distinct (remaster "two different
 * abilities"), preferring the character's key ability then Constitution.
 */
function assignItemBoosts(system, keyAbility) {
  const boosts = system?.boosts;
  if (!boosts || typeof boosts !== "object") return;
  const priority = boostPriority(keyAbility);
  const taken = new Set();
  for (const slot of Object.values(boosts)) {
    if (Array.isArray(slot?.value) && slot.value.length === 1) {
      slot.selected = slot.value[0];
      taken.add(slot.value[0]);
    }
  }
  for (const slot of Object.values(boosts)) {
    if (!Array.isArray(slot?.value) || slot.value.length <= 1) continue;
    const pick = priority.find((a) => slot.value.includes(a) && !taken.has(a))
      ?? slot.value.find((a) => !taken.has(a))
      ?? slot.value[0];
    slot.selected = pick;
    taken.add(pick);
  }
}

/**
 * The class's `keyAbility.selected` must be one of `keyAbility.value` (verified
 * against class data.ts); a hallucinated/illegal key ability would leave the
 * class boost unapplied. Validate the AI's pick, falling back to the class's
 * first legal option.
 */
function resolveKeyAbility(classSystem, requested) {
  const options = Array.isArray(classSystem?.keyAbility?.value) ? classSystem.keyAbility.value : [];
  if (options.includes(requested)) return requested;
  return options[0] ?? (ABILITY_KEYS.includes(requested) ? requested : "str");
}

/** Core skill -> governing attribute, for deterministic auto-pick of a class's
 * `trainedSkills.additional` free trained skills (slugs verified against pf2e
 * CORE_SKILL_SLUGS — full words, not abbreviations). */
const SKILL_ATTRIBUTE = {
  acrobatics: "dex", arcana: "int", athletics: "str", crafting: "int",
  deception: "cha", diplomacy: "cha", intimidation: "cha", medicine: "wis",
  nature: "wis", occultism: "int", performance: "cha", religion: "wis",
  society: "int", stealth: "dex", survival: "wis", thievery: "dex"
};

/**
 * Resolve the AI's freeform language names against the world's real language
 * list (`CONFIG.PF2E.languages`, a slug -> localized-label map read at
 * runtime rather than hardcoded, since installed content packs can add to
 * it), capped to the ancestry's bonus-language slot count and restricted to
 * its allowed list when the ancestry has one (verified against
 * ancestry/data.ts: `additionalLanguages.count`/`.value`). Does NOT include
 * the ancestry's own automatic languages (e.g. Common) — those are added by
 * the ancestry item's own data prep (verified in ancestry/document.ts:
 * prepareActorData pushes them into build.languages.granted, which
 * character/document.ts merges into system.details.languages.value at
 * runtime), so listing them here would just be redundant, not wrong.
 */
function resolveLanguages(names, ancestryDoc) {
  const known = CONFIG?.PF2E?.languages ?? {};
  const bySlug = new Set(Object.keys(known));
  const byLabel = new Map(
    Object.entries(known).map(([slug, label]) => [String(game.i18n.localize(label)).toLowerCase(), slug])
  );
  const additional = ancestryDoc?.system?.additionalLanguages ?? {};
  const max = Math.max(0, Math.round(Number(additional.count) || 0));
  const allowed = Array.isArray(additional.value) && additional.value.length ? new Set(additional.value) : null;
  const automatic = new Set(ancestryDoc?.system?.languages?.value ?? []);

  const resolved = [];
  for (const raw of names) {
    if (resolved.length >= max) break;
    const text = String(raw).trim();
    if (!text) continue;
    const slug = bySlug.has(slugify(text)) ? slugify(text) : byLabel.get(text.toLowerCase()) ?? null;
    if (!slug || automatic.has(slug) || resolved.includes(slug)) continue;
    if (allowed && !allowed.has(slug)) continue;
    resolved.push(slug);
  }
  return resolved;
}

/** A `type:"lore"` skill item (shape verified against pf2e src/module/item/lore.ts:
 * `proficient.value` is the rank, 1 = trained). Background lore isn't a
 * system.skills entry — it needs its own embedded item (issue #50 item 3). */
function loreItem(name, rank = 1) {
  return {
    name: String(name),
    type: "lore",
    img: "icons/sundries/scrolls/scroll-symbol-sun-brown.webp",
    system: {
      mod: { value: 0 },
      proficient: { value: rank },
      traits: { value: [], otherTags: [] },
      description: { value: "" }
    }
  };
}

/**
 * Deterministic v1 skill-increase allocation (issue #56 item 5): a trained
 * skill's `rank` never advances past Trained (1) on its own — the system has
 * no build-tracking layer for skill increases the way it does for attribute
 * boosts (verified: CharacterBuildData only carries `attributes`/`languages`,
 * no `skills` — see the SCHEMA NOTE in createCharacterActor), so a skill increase, like an
 * ability boost, has to be applied directly as a plain source value.
 *
 * Round-robins one +1 rank per SKILL_INCREASE_LEVELS entry <= the character's
 * level across the already-trained skill/lore list (key-ability skills
 * first, same priority spirit as assignAbilityBoosts), capped by the CRB's
 * level gates (Expert any level once trained, Master requires level 7+,
 * Legendary requires level 15+). Not a tailored build — a reasonable default
 * a GM reviews, same spirit as assignAbilityBoosts/the trainedSkills.additional
 * auto-pick above.
 * @param {string[]} slugs skills/lore names already trained (rank 1)
 * @param {string} keyAbility
 * @param {number} level
 * @returns {Map<string, number>} slug -> final rank (2-4 only; rank-1 entries omitted)
 */
function assignSkillRanks(slugs, keyAbility, level) {
  const increases = SKILL_INCREASE_LEVELS.filter((lv) => lv <= level).length;
  const maxRank = level >= 15 ? 4 : level >= 7 ? 3 : 2;
  const order = [...slugs].sort((a, b) =>
    ((SKILL_ATTRIBUTE[a] === keyAbility ? 0 : 1) - (SKILL_ATTRIBUTE[b] === keyAbility ? 0 : 1))
    || a.localeCompare(b));
  const ranks = new Map(order.map((s) => [s, 1]));
  let remaining = increases;
  while (remaining > 0) {
    let advanced = false;
    for (const slug of order) {
      if (remaining <= 0) break;
      if (ranks.get(slug) < maxRank) {
        ranks.set(slug, ranks.get(slug) + 1);
        remaining--;
        advanced = true;
      }
    }
    if (!advanced) break; // every skill already at this level's cap
  }
  return ranks;
}

/**
 * Item types the PF2e system allows on character actors. Mirrors builder.mjs's
 * NPC_ITEM_TYPES safety net — anything else embedded on a character actor
 * breaks the sheet.
 */
const CHARACTER_ITEM_TYPES = new Set([
  "ancestry", "heritage", "background", "class", "feat", "action", "lore",
  "spell", "spellcastingEntry", "weapon", "armor", "equipment", "consumable",
  "treasure", "backpack", "shield", "kit", "condition", "effect", "deity"
]);

/**
 * Build the full actor + embedded item data and create the `type: "character"`
 * actor. Unlike builder.mjs's createActor() (NPC), no stats are computed here
 * — embedding real ancestry/background/class/feat/spell items with correct
 * system.build data is enough for the PF2e system's own derived-data
 * preparation to compute AC/HP/saves/proficiencies/spell slots.
 * @param {object} [options]
 * @param {string|null} [options.img]
 * @returns {Promise<Actor>}
 */
export async function createCharacterActor(concept, resolved, { img = null } = {}) {
  const items = [];

  // Key ability: validate the AI's pick against the class's legal options once,
  // then reuse it to drive ancestry/background free-boost preference, the class
  // item's own keyAbility.selected, the actor-level boosts, and details.keyability.
  const keyAbility = resolveKeyAbility(resolved.classDoc.system, concept.keyAbility);

  // Trained skills: the background and class fixed skills are auto-applied by
  // their own items, but the class's `additional` count of FREE trained skills
  // is not (the system can't know which) — auto-pick deterministically: skills
  // governed by the key ability first, then alphabetical (a sensible default a
  // GM reviews, same spirit as assignAbilityBoosts). Fixes classes like Fighter
  // (trainedSkills.value == [], all skills come from `additional`) showing zero
  // trained skills (issue #50 item 3). ponytail: Int-mod bonus skills omitted;
  // a GM can train more by hand.
  const trained = new Set([
    ...(resolved.backgroundDoc.system?.trainedSkills?.value ?? []),
    ...(resolved.classDoc.system?.trainedSkills?.value ?? [])
  ]);
  const additional = Math.max(0, Math.round(Number(resolved.classDoc.system?.trainedSkills?.additional) || 0));
  const untrained = Object.keys(SKILL_ATTRIBUTE)
    .filter((s) => !trained.has(s))
    .sort((a, b) =>
      ((SKILL_ATTRIBUTE[a] === keyAbility ? 0 : 1) - (SKILL_ATTRIBUTE[b] === keyAbility ? 0 : 1))
      || a.localeCompare(b));
  for (const s of untrained.slice(0, additional)) trained.add(s);

  // Background Lore's slug: joins the same skill-increase rotation as core
  // skills below (issue #56 item 5) even though it lives on its own embedded
  // item rather than in system.skills.
  const loreName = resolved.backgroundDoc.system?.trainedSkills?.lore?.[0];
  const loreSlug = loreName ? slugify(loreName) : null;

  // Skill increases (issue #56 item 5): ranks never advanced past Trained
  // before — see assignSkillRanks's doc comment for why this has to be a
  // direct source write, same as ability boosts.
  const skillRanks = assignSkillRanks(
    [...trained, ...(loreSlug ? [loreSlug] : [])], keyAbility, concept.level
  );
  const skills = {};
  for (const slug of trained) skills[slug] = { rank: skillRanks.get(slug) ?? 1 };

  // Explicit ids for the ABC items, assigned BEFORE embedding rather than
  // left to Foundry to generate on create: a background/ancestry/class's own
  // granted feat (e.g. Acolyte's "Student of the Canon") needs to reference
  // its granting item's id in system.location below, which has to be known
  // up front to wire the two together (verified against the real
  // ABCItemPF2e.createGrantedItems(), which does the same — sets the granted
  // feat's location to `this.id`, its own embedded id).
  const ancestryId = foundry.utils.randomID();
  const heritageId = resolved.heritageDoc ? foundry.utils.randomID() : null;
  const backgroundId = foundry.utils.randomID();
  const classId = foundry.utils.randomID();

  // ABC boosts: without `selected` set on each item's boost slots, the system
  // applies none of them (issue #50 item 1) — set them on the cloned data.
  const ancestryData = toItemData(resolved.ancestryDoc);
  ancestryData._id = ancestryId;
  assignItemBoosts(ancestryData.system, keyAbility);
  items.push(ancestryData);

  if (resolved.heritageDoc) {
    const heritageData = toItemData(resolved.heritageDoc);
    heritageData._id = heritageId;
    items.push(heritageData);
  }

  const backgroundData = toItemData(resolved.backgroundDoc);
  backgroundData._id = backgroundId;
  assignItemBoosts(backgroundData.system, keyAbility);
  items.push(backgroundData);

  const classData = toItemData(resolved.classDoc);
  classData._id = classId;
  classData.system.keyAbility = { ...(classData.system.keyAbility ?? {}), selected: keyAbility };
  items.push(classData);

  // Background Lore: a real embedded lore item (not a system.skills entry).
  if (loreName) items.push(loreItem(loreName, skillRanks.get(loreSlug) ?? 1));

  // A background/ancestry/class's own granted feat (Student of the Canon,
  // a level-1 class feature, ...) needs system.location set to its granting
  // item's id, or the feat-slotting logic can't place it and it silently
  // falls into Bonus Feats — it was never set at all before this fix.
  const parentIds = { ancestry: ancestryId, heritage: heritageId, background: backgroundId, class: classId };
  for (const { doc, parent } of resolved.grants) {
    const data = toItemData(doc);
    if (data.type === "feat") data.system.location = parentIds[parent] ?? null;
    items.push(data);
  }

  // Feats: PCs allow the real "feat" item type directly — skip builder.mjs's
  // featToAction() NPC-only conversion entirely for this path. Each feat's
  // system.location must be the SLOT id ("<group>-<level>", e.g. "ancestry-1")
  // and system.level.taken the slot level, or the system's feat-slotting
  // (verified in feats/group.ts assignFeat) can't place it and dumps it into
  // Bonus feats (issue #50 item 4).
  for (const { entry, type, level } of resolved.feats ?? []) {
    const doc = await getDocument(entry);
    if (!doc) continue;
    const data = toItemData(doc);
    if (type && level) {
      data.system.location = `${type}-${level}`;
      data.system.level = { ...(data.system.level ?? {}), taken: level };
    }
    items.push(data);
  }

  // Spellcasting entry + spells (skipped when no spell resolved to a document).
  // ponytail: a fixed spontaneous entry is a v1 simplification — prepared-
  // caster slot management (Wizard-style) is out of scope; add if requested.
  if (concept.spellcasting && resolved.spells?.some((s) => s.entry)) {
    const entryId = foundry.utils.randomID();
    // Populate per-rank slots so the caster can actually cast (issue #50 item 5
    // / #53); shape (slot0..slot10, each {value,max,prepared:[]}) verified
    // against pf2e spellcasting-entry_data.ts. Spontaneous casters leave
    // `prepared` empty. `ability.value` keys spell DC/attack off the key ability.
    const slots = {};
    for (const [rank, max] of Object.entries(spontaneousSpellSlots(concept.level))) {
      slots[`slot${rank}`] = { value: max, max, prepared: [] };
    }
    items.push({
      _id: entryId,
      name: `${capitalized(concept.spellcasting.tradition)} Spells`,
      type: "spellcastingEntry",
      img: "systems/pf2e/icons/default-icons/spellcastingEntry.svg",
      system: {
        tradition: { value: concept.spellcasting.tradition },
        prepared: { value: "spontaneous", flexible: false },
        ability: { value: keyAbility },
        proficiency: { value: 1 },
        slots,
        spelldc: { value: 0, dc: 0, mod: 0 },
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

  // Focus spells: a separate `prepared.value: "focus"` entry — how the real
  // system identifies a focus pool (spellcasting-entry/document.ts
  // isFocusPool) — with NO slots object (focus spells spend pool points, not
  // slots). Independent of the block above: a Champion has focus spells but
  // no spontaneous casting. The pool MAX cannot be plain actor data —
  // character/document.ts zeroes system.resources.focus.max every data-prep
  // pass and rebuilds it ONLY from ActiveEffectLike rules on embedded items —
  // so a real published rule exemplar is cloned onto the entry (never
  // hand-authored, see rule-templates.mjs).
  let focusPoolSize = 0;
  if (resolved.focusSpells?.some((s) => s.entry)) {
    const focusEntryId = foundry.utils.randomID();
    focusPoolSize = Math.min(resolved.focusSpells.filter((s) => s.entry).length, 3);
    const exemplar = await findRuleExemplar("focusPool");
    if (!exemplar) {
      // Fail closed but don't abort: the spells still embed, the pool just
      // stays at 0 until a GM adds the rule by hand.
      console.warn("simplypf2e | no real focus-pool rule exemplar found in any installed compendium — focus spells embed but the focus pool stays at 0");
    }
    const poolRule = exemplar ? structuredClone(exemplar.rule) : null;
    if (poolRule) poolRule.value = focusPoolSize;
    items.push({
      _id: focusEntryId,
      name: "Focus Spells",
      type: "spellcastingEntry",
      img: "systems/pf2e/icons/default-icons/spellcastingEntry.svg",
      system: {
        // Real focus spells carry no tradition of their own; tag the entry
        // with the class's casting tradition only when the concept has one.
        ...(concept.spellcasting ? { tradition: { value: concept.spellcasting.tradition } } : {}),
        prepared: { value: "focus" },
        ability: { value: keyAbility },
        proficiency: { value: 1 },
        spelldc: { value: 0, dc: 0, mod: 0 },
        showSlotlessLevels: { value: false },
        rules: poolRule ? [poolRule] : []
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

  // Equipment: same quantity/rune/carry-state handling as the NPC pipeline.
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

  // Loot: the character's starting wealth (see pcStartingWealthGp) — same
  // scroll/custom-treasure handling as the NPC pipeline, completely reused.
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

  // Final safety net: never embed an item type the character schema rejects.
  const safeItems = items.filter((item) => {
    if (CHARACTER_ITEM_TYPES.has(item.type)) return true;
    console.warn(`simplypf2e | dropped "${item.name}": item type "${item.type}" is not allowed on character actors`);
    return false;
  });

  // -----------------------------------------------------------------------
  // SCHEMA NOTE — the actor `system.*` field names below were VERIFIED against
  // foundryvtt/pf2e master source (character/data.ts + document.ts) when these
  // bugs were fixed: details.keyability.value, details.biography.{backstory,
  // appearance,attitude,beliefs,likes,dislikes,allies,enemies,organizations},
  // details.{age,gender,height,weight,ethnicity,nationality}.value,
  // details.languages.{value,details}, build.attributes.boosts.{1,5,10,15,20},
  // skills.<slug>.rank,
  // attributes.hp.{value,temp}. Remaining best-effort (see comments where
  // used): the spontaneous spell-slot COUNTS (rules-derived, not from source —
  // pc-tables.spontaneousSpellSlots) and per-generation starting WEALTH
  // (pcStartingWealthGp — flagged for a human wealth-table cross-check).
  // -----------------------------------------------------------------------

  const esc = (text) => (foundry.utils.escapeHTML ? foundry.utils.escapeHTML(text) : text);
  const toHtml = (text) => text
    ? `<p>${String(text).split(/\n{2,}/).map((p) => esc(p.trim())).filter(Boolean).join("</p><p>")}</p>`
    : "";

  // Bonus languages: capped to the ancestry's own slot count and allowed-list
  // (issue #56.2) — the ancestry's automatic languages (e.g. Common) are
  // added separately by the system itself, not listed here (see
  // resolveLanguages's doc comment).
  const languages = resolveLanguages(concept.languages ?? [], resolved.ancestryDoc);

  const actorData = {
    name: concept.name,
    type: "character",
    items: safeItems,
    system: {
      details: {
        level: { value: concept.level },
        keyability: { value: keyAbility },
        // Age/gender/height/weight/ethnicity/nationality (issue #56.1) and
        // languages (#56.2): field shapes verified against character/data.ts
        // (all plain strings under details.<field>.value except languages,
        // whose .value is the array of chosen languages beyond the
        // ancestry's automatic ones).
        age: { value: concept.age },
        gender: { value: concept.gender },
        height: { value: concept.height },
        weight: { value: concept.weight },
        ethnicity: { value: concept.ethnicity },
        nationality: { value: concept.nationality },
        languages: { value: languages, details: "" },
        // CharacterBiography has NO `.value` — the real fields (verified in
        // character/data.ts) are backstory/appearance (HTML), attitude/
        // beliefs/likes/dislikes (plain text), allies/enemies/organizations
        // (HTML). "personality"/"alignmentFlavor" map onto the closest real
        // biography fields (attitude/beliefs) — issue #56.6.
        biography: {
          backstory: toHtml(concept.backstory),
          appearance: toHtml(concept.appearance),
          attitude: concept.personality,
          beliefs: concept.alignmentFlavor,
          likes: concept.likes,
          dislikes: concept.dislikes,
          allies: toHtml(concept.allies),
          enemies: toHtml(concept.enemies),
          organizations: toHtml(concept.organizations)
        }
      },
      // Full HP: a high sentinel the system clamps to the derived max on every
      // data-prep pass (character/document.ts: stat.value = min(value, max)),
      // so this resolves to full HP without us computing it (issue #50 item 6).
      attributes: { hp: { value: 9999, temp: 0 } },
      // Focus pool starts full. Source `value` survives data prep (verified in
      // character/document.ts prepareBaseData — it keeps value, zeroes max);
      // `max` comes from the cloned rule on the focus spellcasting entry.
      resources: { focus: { value: focusPoolSize } },
      build: {
        attributes: {
          // Not manual entry — we want the boosts below (and the ABC-item
          // boosts) applied by the system to derive ability scores.
          manual: false,
          boosts: assignAbilityBoosts(keyAbility)
        }
      },
      skills
    },
    prototypeToken: {
      actorLink: true,
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
