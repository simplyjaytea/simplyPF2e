import * as T from "./tables.mjs";
import { findEntry, getDocument, toItemData, getPacksFor, getAllPacksFor, getFeatCandidates, getHeritageCandidates, isIssuedCandidate } from "./compendium.mjs";
import {
  parseCoins, resolveLoot, resolveEquipment, resolveFocusSpells,
  buildEquipmentItems, buildLootItems, filterItemTypes, heightenedLevelFor
} from "./builder.mjs";
import { slugify, capitalized, toHtml } from "./text.mjs";
import { findRuleExemplar } from "./rule-templates.mjs";
import { preselectChoiceSets } from "./choice-set.mjs";
import { ABILITY_BOOST_LEVELS, PC_WEALTH_BY_LEVEL, buildFeatSlots, featSlotLocation, pcSpellcastingProfile, pcSpellPlan } from "./pc-tables.mjs";
import { SETTINGS, getSetting } from "./settings.mjs";
import { CORE_SKILLS, normalizeSkillPriorities, initialSkillTraining, allocateCharacterSkills, characterSkillSnapshot } from "./pc-skills.mjs";
import { applyCharacterLoadout } from "./pc-loadout.mjs";
import { stageClassPaths } from "./class-paths.mjs";

/**
 * Player-character counterpart of builder.mjs. PCs get their AC/HP/saves/
 * proficiencies computed by the PF2e system itself from real
 * Ancestry+Background+Class items once those are correctly attached — this
 * module's job is assembling a valid, fully-grounded set of real-item
 * choices, NOT reimplementing that math (unlike tables.mjs, which hardcodes
 * NPC benchmark numbers because NPCs have no such items to derive from).
 * Spell slots/repertoire plans are supplied separately by verified class
 * profiles: class items expose spell proficiency, not automatic slot counts.
 */

const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"];

function normalizeAbilityPriorities(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).filter((ability) => {
    if (!ABILITY_KEYS.includes(ability) || seen.has(ability)) return false;
    seen.add(ability);
    return true;
  });
}

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
  const skillPriorities = normalizeSkillPriorities(c.skillPriorities);
  const abilityPriorities = normalizeAbilityPriorities(c.abilityPriorities);
  if (c.skillPriorities !== undefined && (!Array.isArray(c.skillPriorities)
    || c.skillPriorities.some((slug) => !skillPriorities.includes(slug)))) {
    console.warn("simplypf2e | dropped invalid character skill priorities");
  }

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
    abilityPriorities,
    skillPriorities,
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
        const name = typeof s === "string" ? s.trim() : String(s?.name ?? "").trim();
        const candidate = s?.candidate?.packId && s?.candidate?._id ? s.candidate : null;
        return name ? { name, ...(candidate ? { candidate } : {}) } : null;
      })
      .filter(Boolean)
      .slice(0, 3),
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
 * Expected starting wealth (gp) for a character created at `level`: the lump
 * sum from GM Core Table 10-10 "Character Wealth" (see PC_WEALTH_BY_LEVEL in
 * pc-tables.mjs for the verified source and column), scaled by the GM's
 * Treasure amount setting.
 *
 * Deliberately NOT tables.mjs's TREASURE_BY_LEVEL, which this function used
 * to read: that is Table 10-9 Treasure by Level, the total treasure a whole
 * PARTY should accumulate across a level of play, not one character's own
 * starting wealth. Reading it here overpaid every PC above level 1 by an
 * order of magnitude (level 2: 300 gp instead of 30). Also not
 * treasureBudget(), which divides that party total by ENCOUNTERS_PER_LEVEL
 * for an NPC's per-encounter share.
 *
 * Level 1 needs no special case: Table 10-10's own level-1 lump sum is the
 * same flat 15 gp a character gets at normal character creation.
 */
export function pcStartingWealthGp(level, amount = "standard") {
  const lv = Math.min(Math.max(Math.round(Number(level)) || 1, 1), 20);
  const gp = PC_WEALTH_BY_LEVEL[lv - 1];
  return Math.round(gp * (T.TREASURE_AMOUNT_MULTIPLIER[amount] ?? 1));
}

/**
 * Whether a heritage document is legal for a given ancestry document.
 *
 * Verified against the real pf2e source (`src/module/item/heritage/data.ts`,
 * HeritageSystemSchema): a heritage's `system.ancestry` field is a
 * `SchemaField` that is either `null` (a "versatile heritage" such as
 * Dhampir or Duskwalker — see e.g.
 * `packs/heritages/versatile-heritages/dhampir.json`, which has
 * `"ancestry": null` — valid for ANY ancestry) or an object
 * `{name, slug, uuid}` naming the single ancestry it belongs to (e.g.
 * `packs/heritages/dwarf/rock-dwarf.json` has
 * `"ancestry": {"name": "Dwarf", "slug": "dwarf", "uuid":
 * "Compendium.pf2e.ancestries.Item.BYj5ZvlXZdpaEgA6"}`). Every pf2e item
 * also carries a base `system.slug` (nullable, auto-derived from name —
 * `src/module/item/base/data/model.ts`), so a same-slug fallback covers an
 * ancestry doc whose `system.slug` hasn't been generated yet.
 * @param {{system?: {ancestry?: {slug?: string, uuid?: string}|null}}|null} heritageDoc
 * @param {{name: string, uuid?: string, system?: {slug?: string|null}}|null} ancestryDoc
 * @returns {boolean}
 */
export function heritageMatchesAncestry(heritageDoc, ancestryDoc) {
  const link = heritageDoc?.system?.ancestry ?? null;
  if (!link) return true; // versatile heritage — valid for any ancestry
  if (!ancestryDoc) return false;
  if (link.uuid && ancestryDoc.uuid && link.uuid === ancestryDoc.uuid) return true;
  const ancestrySlug = ancestryDoc.system?.slug || slugify(ancestryDoc.name ?? "");
  return Boolean(link.slug) && Boolean(ancestrySlug) && link.slug === ancestrySlug;
}

/**
 * Deterministic fallback heritage for `ancestryDoc`, used when the AI's
 * heritage pick didn't resolve or belonged to a different ancestry. Heritage
 * is ABC-adjacent (falls under invariant #5's PC-feat-slot exception, same
 * as resolveFeatPicks()'s `candidates[0]` fallback below): a PC with no
 * heritage at all is a worse outcome than a plausible, GM-swappable
 * substitute. Walks getHeritageCandidates()'s full name-sorted list (NOT
 * rarity-capped — resolvePCConcept has no rarityCap in scope here, so this
 * fallback may surface a rarer heritage than the generator's own cap would
 * normally offer) and resolves+checks each one until a match for
 * `ancestryDoc` turns up.
 * @param {object} ancestryDoc
 * @returns {Promise<object|null>}
 */
async function fallbackHeritageFor(ancestryDoc) {
  const candidates = await getHeritageCandidates();
  const packIds = await getAllPacksFor("heritages");
  for (const candidate of candidates) {
    const entry = await findEntry(packIds, candidate.name, (e) => e.type === "heritage");
    const doc = await getDocument(entry);
    if (doc && heritageMatchesAncestry(doc, ancestryDoc)) return doc;
  }
  return null;
}

/**
 * Resolve every compendium reference in a PC concept — the PC counterpart of
 * builder.mjs's resolveConcept(). Assumes concept.ancestry/heritage/
 * background/class already carry GROUNDED real names (i.e. generator-app has
 * already run selectAncestryBackgroundClass() and copied its picks onto the
 * concept) — this just does the findEntry/getDocument/grant-resolution work.
 * Ancestry/background/class are REQUIRED: the build is meaningless without
 * them, so a failure to resolve any of the three throws rather than silently
 * producing a broken actor. Heritage: if the AI didn't name one, it's left
 * empty (like any other unresolved AI pick). If it DID name one, that pick
 * is validated against the resolved ancestry doc (heritageMatchesAncestry())
 * — a heritage that doesn't resolve, or resolves to a document belonging to
 * a DIFFERENT ancestry (a fuzzy-match near-miss, or the AI simply ignoring
 * the "match the ancestry" prompt instruction), is dropped and replaced with
 * fallbackHeritageFor(ancestryDoc)'s deterministic ancestry-matched pick
 * rather than silently embedding a wrong-ancestry heritage.
 *
 * Returns feat SLOTS with their candidate lists (not yet picked) — picking
 * happens in generator-app via ai.mjs's selectFeats(), mirroring how AI calls
 * live in the app while resolution lives here for the NPC pipeline too.
 */
export async function resolvePCConcept(concept, { exactContent = false } = {}) {
  // ABC lookups scan ALL installed packs of the right type (getAllPacksFor),
  // not just the hardcoded default pack, so a legit AI pick living in a Lost
  // Omens / add-on compendium still resolves instead of aborting the run (#51).
  const ancestryPacks = await getAllPacksFor("ancestries");
  const ancestryEntry = isIssuedCandidate(concept.ancestryCandidate, ancestryPacks)
    ? concept.ancestryCandidate : (exactContent ? null : await findEntry(ancestryPacks, concept.ancestry, (e) => e.type === "ancestry"));
  const ancestryDoc = await getDocument(ancestryEntry);
  if (!ancestryDoc || ancestryDoc.type !== "ancestry") throw new Error(`Could not find ancestry "${concept.ancestry}" in the compendium`);

  const backgroundPacks = await getAllPacksFor("backgrounds");
  const backgroundEntry = isIssuedCandidate(concept.backgroundCandidate, backgroundPacks)
    ? concept.backgroundCandidate : (exactContent ? null : await findEntry(backgroundPacks, concept.background, (e) => e.type === "background"));
  const backgroundDoc = await getDocument(backgroundEntry);
  if (!backgroundDoc || backgroundDoc.type !== "background") throw new Error(`Could not find background "${concept.background}" in the compendium`);

  const classPacks = await getAllPacksFor("classes");
  const classEntry = isIssuedCandidate(concept.classCandidate, classPacks)
    ? concept.classCandidate : (exactContent ? null : await findEntry(classPacks, concept.class, (e) => e.type === "class"));
  const classDoc = await getDocument(classEntry);
  if (!classDoc || classDoc.type !== "class") throw new Error(`Could not find class "${concept.class}" in the compendium`);

  let heritageDoc = null;
  if (concept.heritage) {
    const heritagePacks = await getAllPacksFor("heritages");
    const heritageEntry = isIssuedCandidate(concept.heritageCandidate, heritagePacks)
      ? concept.heritageCandidate : (exactContent ? null : await findEntry(heritagePacks, concept.heritage, (e) => e.type === "heritage"));
    const pickedDoc = await getDocument(heritageEntry);
    if (!pickedDoc || pickedDoc.type !== "heritage") {
      console.warn(`simplypf2e | heritage "${concept.heritage}" not found in the compendium — falling back to an ancestry-matched heritage`);
    } else if (!heritageMatchesAncestry(pickedDoc, ancestryDoc)) {
      console.warn(`simplypf2e | heritage "${concept.heritage}" does not belong to ancestry "${ancestryDoc.name}" — dropping and falling back to an ancestry-matched heritage`);
    } else {
      heritageDoc = pickedDoc;
    }
    if (!heritageDoc) {
      heritageDoc = await fallbackHeritageFor(ancestryDoc);
      if (!heritageDoc) {
        console.warn(`simplypf2e | no heritage in the compendium matches ancestry "${ancestryDoc.name}" — character will have no heritage`);
      }
    }
  }

  // Feat slots: candidates only (no picks yet — generator-app runs
  // selectFeats() and resolveFeatPicks() below once it has these lists).
  const ancestryTrait = slugify(ancestryDoc.name);
  const classTrait = slugify(classDoc.name);
  const featSlots = [];
  const freeArchetype = Boolean(getSetting(SETTINGS.freeArchetype));
  for (const slot of buildFeatSlots(concept.level, { freeArchetype })) {
    const traits = slot.archetype ? ["archetype"]
      : slot.type === "ancestry" ? [ancestryTrait]
      : slot.type === "class" ? [classTrait] : [];
    let candidates = await getFeatCandidates({
      level: slot.level, category: slot.type, traits, preferredNames: concept.feats
    });
    // Retry once without the trait filter before giving up: a valid slot
    // whose ancestry/class trait matched nothing at this level (odd content
    // packs, sparse low levels) is better filled with an on-category feat than
    // silently dropped. Archetype slots keep their trait (loosening would just
    // give plain class feats, defeating the slot). Issue #64 item 4a.
    if (!candidates.length && traits.length && !slot.archetype) {
      candidates = await getFeatCandidates({
        level: slot.level, category: slot.type, preferredNames: concept.feats
      });
    }
    if (candidates.length) featSlots.push({ ...slot, candidates });
    else console.warn(`simplypf2e | no feat candidates for a ${slot.type}${slot.archetype ? " (archetype)" : ""} slot at level ${slot.level} — slot left empty`);
  }

  const spells = [];
  if (concept.spellcasting) {
    for (const spell of concept.spellcasting.spells) {
      const entry = isIssuedCandidate(spell.candidate, getPacksFor("spells"))
        ? spell.candidate : (exactContent ? null : await findEntry(getPacksFor("spells"), spell.name, (e) => e.type === "spell"));
      spells.push({ spell, entry });
    }
  }

  const focusSpells = await resolveFocusSpells(concept.focusSpells ?? [], { exactContent });

  const equipment = await resolveEquipment(concept, { exactContent });
  // concept.loot starts empty (see normalizePCConcept) — resolveLoot() is a
  // no-op on it here; applyTreasureBudget() (called by generator-app with
  // pcStartingWealthGp()) is what actually fills it with coins.
  const loot = await resolveLoot(concept, { exactContent });

  return { ancestryDoc, heritageDoc, backgroundDoc, classDoc, featSlots, spells, focusSpells, equipment, loot };
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
 *
 * Picks are deduplicated ACROSS slots: PF2e feats aren't repeatable, and both
 * failure modes here converge on the same name otherwise — the AI can name one
 * feat for two slots, and the fallback below is `candidates[0]`, which (sorted
 * by level then name) is IDENTICAL for every slot of a category. A level-20
 * character whose batched selectFeats() call came back empty used to get ten
 * copies of the same class feat.
 * In the complete one-click flow `exactContent` keeps this final step inside
 * the per-slot, locally issued catalog: an AI selection cannot become a
 * different same-named feat through a post-selection lookup. The entitlement
 * fallback remains, but it too uses that slot's exact candidate reference.
 * Legacy/pre-selection callers retain the former name-lookup behavior.
 * @param {{type: string, level: number, candidates: {name: string, ref?: object}[]}[]} featSlots
 * @param {{slot: number, name: string, candidate?: object}[]} picks
 * @param {{exactContent?: boolean}} [options]
 * @returns {Promise<{type: string, level: number, archetype: boolean, name: string, entry: object|null}[]>}
 */
export async function resolveFeatPicks(featSlots, picks, { exactContent = false } = {}) {
  const bySlot = new Map(picks.map((p) => [p.slot, p]));
  const taken = new Set();
  const resolved = [];

  /** Resolve one candidate for one slot, rejecting cross-slot/raw references. */
  const resolveFor = (slot, name, candidate = null) => {
    const allowedPacks = getPacksFor("feats");
    const offeredCandidate = (slot.candidates ?? []).find((item) => item?.ref === candidate) ?? null;
    const offered = offeredCandidate?.ref ?? null;
    if (offered && isIssuedCandidate(offered, allowedPacks)) {
      return Promise.resolve(taken.has(slugify(offeredCandidate.name)) ? null : offered);
    }
    if (exactContent) return Promise.resolve(null);
    // Preserve the pre-existing permissive seam for callers that explicitly
    // opt out of complete-only creation. The one-click path above never
    // reaches this branch: it requires the exact reference offered to this
    // slot, not merely an allowed pack.
    if (candidate?.packId && allowedPacks.includes(candidate.packId)) {
      return Promise.resolve(taken.has(slugify(name)) ? null : candidate);
    }
    return findEntry(
      allowedPacks,
      name,
      (e) => e.type === "feat"
        && e.system?.category === slot.type
        && (e.system?.level?.value ?? 0) <= slot.level
        && !taken.has(slugify(e.name))
    );
  };

  for (let i = 0; i < featSlots.length; i++) {
    const slot = featSlots[i];
    const pick = bySlot.get(i + 1) ?? null;
    let name = pick?.name ?? null;
    let entry = name ? await resolveFor(slot, name, pick?.candidate) : null;
    if (name && !entry) {
      console.warn(`simplypf2e | feat pick "${name}" for slot ${i + 1} (${slot.type}, level ${slot.level}) did not resolve to an unused feat for this slot`);
    }
    if (!entry) {
      // Fallback: walk this slot's own candidate list (real, already
      // level/category/trait-filtered) for the first one not already taken.
      for (const candidate of slot.candidates ?? []) {
        entry = await resolveFor(slot, candidate.name, candidate.ref);
        if (entry) {
          name = candidate.name;
          console.warn(`simplypf2e | slot ${i + 1} (${slot.type}, level ${slot.level}) had no usable AI pick — defaulted to "${name}"`);
          break;
        }
      }
    }
    if (entry) {
      // Exact candidate references intentionally carry only opaque source
      // identity. Recover their verified catalog label before deduplicating
      // or presenting the result; a document lookup is neither needed nor
      // desirable on the strict path.
      name = (slot.candidates ?? []).find((candidate) => candidate?.ref === entry)?.name ?? entry.name ?? name;
      taken.add(slugify(name));
    }
    // entry can still be null when every candidate for this slot is already
    // taken (a sparse category at low levels); the name is kept so the preview
    // can still show intent, and the slot is simply left empty on the sheet.
    resolved.push({
      type: slot.type, level: slot.level, archetype: slot.archetype === true,
      name: name ?? `${slot.type} feat`, entry
    });
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
function boostPriority(keyAbility, preferences = []) {
  const key = ABILITY_KEYS.includes(keyAbility) ? keyAbility : "str";
  const preferred = normalizeAbilityPriorities(preferences).filter((ability) => ability !== key);
  return [key, ...preferred, ...ABILITY_KEYS.filter((ability) => ability !== key && !preferred.includes(ability))];
}

function assignAbilityBoosts(keyAbility, preferences) {
  const priority = boostPriority(keyAbility, preferences).slice(0, 4);
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
function assignItemBoosts(system, keyAbility, preferences) {
  const boosts = system?.boosts;
  if (!boosts || typeof boosts !== "object") return;
  const priority = boostPriority(keyAbility, preferences);
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
function resolveLanguages(names, ancestryDoc, bonus = 0) {
  const known = CONFIG?.PF2E?.languages ?? {};
  const bySlug = new Set(Object.keys(known));
  const byLabel = new Map(
    Object.entries(known).map(([slug, label]) => [String(game.i18n.localize(label)).toLowerCase(), slug])
  );
  const additional = ancestryDoc?.system?.additionalLanguages ?? {};
  // Cap = the ancestry's own bonus-language slots PLUS the character's
  // Intelligence-modifier bonus languages (issue #64 item 1) — without the
  // Int bonus the AI's extra language picks were silently truncated.
  const max = Math.max(0, Math.round(Number(additional.count) || 0)) + Math.max(0, Math.round(Number(bonus) || 0));
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
 * Every real name this concept already committed to, used by choice-set.mjs's
 * middle-priority policy step: a ChoiceSet option the character was already
 * given (a clan weapon in its equipment, a named feat) beats the deterministic
 * first-option fallback.
 */
function conceptChoiceNames(concept, resolved) {
  return [
    ...(concept.equipment ?? []).map((e) => e?.name),
    ...(concept.feats ?? []),
    ...(resolved.feats ?? []).map((f) => f?.name),
    ...(concept.spellcasting?.spells ?? []).map((s) => s?.name),
    ...(concept.focusSpells ?? []).map((s) => s?.name),
    resolved.ancestryDoc?.name,
    resolved.heritageDoc?.name,
    resolved.backgroundDoc?.name,
    resolved.classDoc?.name
  ].filter((n) => typeof n === "string" && n.length);
}

/**
 * Walk every item source about to be embedded and pre-answer its ChoiceSet
 * rules (and, one level down, the ChoiceSets of items its GrantItem rules
 * grant) to reduce prompts during createEmbeddedDocuments(). Native prompts
 * can still open for unresolved choices and choices on deeper ABC grant paths.
 *
 * Fail-open by design — see choice-set.mjs's header. Ambiguous, dynamic, and
 * unanswered choices remain native rather than being guessed.
 */
async function preresolveChoiceSets(itemSources, concept, resolved, keyAbility, selectChoices) {
  const context = { keyAbility, names: conceptChoiceNames(concept, resolved) };
  const config = CONFIG?.PF2E ?? {};
  const cache = new Map();
  const loadItemSource = async (uuid) => {
    if (cache.has(uuid)) return cache.get(uuid);
    let source = null;
    try {
      const doc = await fromUuid(uuid);
      source = doc?.toObject?.() ?? null;
    } catch { source = null; }
    cache.set(uuid, source);
    return source;
  };

  await preselectChoiceSets(itemSources, context, config, loadItemSource, selectChoices);
}

/**
 * Build the full actor + embedded item data and create the `type: "character"`
 * actor. Unlike builder.mjs's createActor() (NPC), no stats are computed here
 * — embedding real ancestry/background/class/feat/spell items with correct
 * system.build data is enough for the PF2e system's own derived-data
 * preparation to compute AC/HP/saves/proficiencies. Skill choices and verified
 * class spell plans are allocated separately; no derived-stat math is copied.
 * @param {object} [options]
 * @param {string|null} [options.img]
 * @param {(groups: object[]) => Promise<unknown>} [options.selectChoices]
 * @returns {Promise<{actor: Actor, skillReport: object}>}
 */
export async function createCharacterActor(concept, resolved, { img = null, selectChoices = null } = {}) {
  const items = [];

  // Key ability: validate the AI's pick against the class's legal options once,
  // then reuse it to drive ancestry/background free-boost preference, the class
  // item's own keyAbility.selected, the actor-level boosts, and details.keyability.
  const keyAbility = resolveKeyAbility(resolved.classDoc.system, concept.keyAbility);

  const { ranks: initialRanks, replacements } = initialSkillTraining(resolved.classDoc.system, resolved.backgroundDoc.system);
  const backgroundLore = [];

  // Assign ABC ids before embedding and preserve them with `keepId` below.
  // Generated feat slots already reference these ids, and PF2e's native
  // ABCItemPF2e.createGrantedItems() uses the same parent ids when it links
  // background/ancestry/class grants into their system locations.
  const ancestryId = foundry.utils.randomID();
  const heritageId = resolved.heritageDoc ? foundry.utils.randomID() : null;
  const backgroundId = foundry.utils.randomID();
  const classId = foundry.utils.randomID();

  // ABC boosts: without `selected` set on each item's boost slots, the system
  // applies none of them (issue #50 item 1) — set them on the cloned data.
  const ancestryData = toItemData(resolved.ancestryDoc);
  ancestryData._id = ancestryId;
  assignItemBoosts(ancestryData.system, keyAbility, concept.abilityPriorities);
  items.push(ancestryData);

  if (resolved.heritageDoc) {
    const heritageData = toItemData(resolved.heritageDoc);
    heritageData._id = heritageId;
    items.push(heritageData);
  }

  const backgroundData = toItemData(resolved.backgroundDoc);
  backgroundData._id = backgroundId;
  assignItemBoosts(backgroundData.system, keyAbility, concept.abilityPriorities);
  items.push(backgroundData);

  const classData = toItemData(resolved.classDoc);
  classData._id = classId;
  classData.system.keyAbility = { ...(classData.system.keyAbility ?? {}), selected: keyAbility };
  // Mandatory native class paths are normally re-fetched from
  // Class.system.items, where the ordinary source preselector cannot reach
  // them. Stage only a proven exact bridge before Actor.create; all remaining
  // class grants still flow through PF2e's normal class item.
  const stagedClassPaths = await stageClassPaths(classData, classId, {
    context: { keyAbility, names: conceptChoiceNames(concept, resolved) }, selectChoices
  });
  items.push(classData);
  items.push(...stagedClassPaths.items);

  // Background Lore: a real embedded lore item (not a system.skills entry).
  const loreNames = resolved.backgroundDoc.system?.trainedSkills?.lore;
  for (const name of Array.isArray(loreNames) ? loreNames : []) {
    if (typeof name !== "string" || !name.trim() || backgroundLore.some((entry) => slugify(entry.name) === slugify(name))) continue;
    const data = { ...loreItem(name), _id: foundry.utils.randomID() };
    backgroundLore.push(data);
    initialRanks[`lore:${data._id}`] = 1;
    items.push(data);
  }

  // Feats: PCs allow the real "feat" item type directly — skip builder.mjs's
  // featToAction() NPC-only conversion entirely for this path. Each feat's
  // system.location must be the SLOT id ("<group>-<level>", e.g. "ancestry-1")
  // and system.level.taken the slot level, or the system's feat-slotting
  // (verified in feats/group.ts assignFeat) can't place it and dumps it into
  // Bonus feats (issue #50 item 4).
  for (const { entry, type, level, archetype = false } of resolved.feats ?? []) {
    const doc = await getDocument(entry);
    if (!doc) continue;
    const data = toItemData(doc);
    const location = featSlotLocation({ type, level, archetype });
    if (location) {
      data.system.location = location;
      data.system.level = { ...(data.system.level ?? {}), taken: level };
    }
    items.push(data);
  }

  // Spellcasting entry + explicit spell plan. Recognized Remaster classes use
  // their published profile; unsupported classes retain the legacy spontaneous
  // fallback until a source-qualified profile is added.
  const spellProfile = concept.spellcasting ? pcSpellcastingProfile(resolved.classDoc) : null;
  if (concept.spellcasting && (spellProfile || resolved.spells?.some((s) => s.entry))) {
    const entryId = foundry.utils.randomID();
    const mode = spellProfile?.mode ?? "spontaneous";
    const tradition = spellProfile?.tradition ?? concept.spellcasting.tradition;
    const ability = spellProfile?.ability ?? keyAbility;
    const plan = pcSpellPlan(concept.level, spellProfile);
    const counts = plan.slots;
    const slots = {};
    for (const [rank, max] of Object.entries(counts)) {
      slots[`slot${rank}`] = { value: max, max, prepared: [] };
    }

    const spellSources = new Map();
    const usedCantrips = new Set();
    const spontaneousSeen = new Set();
    const usedRanks = new Map();
    const signatureCandidates = new Map();
    for (const { spell, entry } of resolved.spells ?? []) {
      const assignedRank = spell?.rank;
      const reject = (reason) => console.warn(`simplypf2e | dropped planned spell "${spell?.name ?? entry?.name ?? "?"}": ${reason}`);
      if (typeof assignedRank !== "number" || !Number.isInteger(assignedRank) || assignedRank < 0 || assignedRank > 10 || !counts[assignedRank]) { reject("assigned rank is invalid or has no slot"); continue; }
      const doc = await getDocument(entry);
      if (!doc) { reject("could not load grounded spell"); continue; }
      const source = toItemData(doc);
      if (source.type !== "spell") { reject("grounded document is not a spell"); continue; }
      const baseRank = source.system?.level?.value;
      const traits = source.system?.traits ?? {};
      const cantrip = Array.isArray(traits.value) && traits.value.includes("cantrip");
      const traditions = Array.isArray(traits.traditions) ? traits.traditions : [];
      if (spellProfile && (!Array.isArray(traits.value) || !Array.isArray(traits.traditions))) { reject("missing spell trait data"); continue; }
      if (!Number.isInteger(baseRank) || baseRank < 0 || (!cantrip && baseRank > assignedRank)) { reject("base rank cannot occupy assigned rank"); continue; }
      if (cantrip !== (assignedRank === 0)) { reject("cantrip rank mismatch"); continue; }
      if ((Array.isArray(traits.value) && traits.value.includes("focus")) || source.system?.ritual) { reject("focus spells and rituals use separate casting entries"); continue; }
      if (spellProfile && !traditions.includes(tradition)) { reject("spell tradition does not match caster profile"); continue; }
      if (spellProfile && mode === "spontaneous" && assignedRank === 10 && traits.rarity !== "common") {
        reject("ordinary 10th-rank repertoire picks must be common"); continue;
      }
      const identity = doc.uuid ?? entry?.uuid ?? (entry?.packId && entry?._id ? `${entry.packId}:${entry._id}` : null);
      if (!identity) { reject("grounded spell identity is missing"); continue; }
      if (assignedRank === 0 && usedCantrips.has(identity)) { reject("duplicate cantrip"); continue; }
      const key = `${identity}:${assignedRank}`;
      if (mode === "spontaneous" && spontaneousSeen.has(key)) { reject("duplicate spontaneous repertoire rank"); continue; }
      if ((usedRanks.get(assignedRank) ?? 0) >= plan.picks[assignedRank]) { reject("assigned rank is already at its pick cap"); continue; }
      // A spontaneous repertoire can contain the same source at different
      // assigned ranks; each needs its own embedded item/location heightening.
      const sourceKey = mode === "spontaneous" ? key : identity;
      let data = spellSources.get(sourceKey);
      if (!data) {
        data = source;
        data._id = foundry.utils.randomID();
        spellSources.set(sourceKey, data);
      }
      // A cloned source can carry a stale entry or heightened location from a
      // compendium/previous embedding. Rebuild it rather than merging one.
      data.system.location = { value: entryId };
      if (mode === "spontaneous") {
        const heightenedLevel = heightenedLevelFor(data.system, assignedRank);
        if (heightenedLevel) data.system.location.heightenedLevel = heightenedLevel;
        else delete data.system.location.heightenedLevel;
        spontaneousSeen.add(key);
      } else {
        // PF2e entry/data.ts SpellPrepData; the native entry pads unused
        // positions with null IDs, and its collection casts at the slot rank.
        slots[`slot${assignedRank}`].prepared.push({ id: data._id, expended: false });
      }
      usedRanks.set(assignedRank, (usedRanks.get(assignedRank) ?? 0) + 1);
      if (spell?.signature === true) {
        if (!plan.signatureRanks.includes(assignedRank)) console.warn(`simplypf2e | ignored signature marker on "${source.name}": rank is not eligible`);
        else signatureCandidates.set(assignedRank, [...(signatureCandidates.get(assignedRank) ?? []), data]);
      } else if (spell?.signature != null && spell.signature !== false) {
        console.warn(`simplypf2e | ignored invalid signature marker on "${source.name}"`);
      }
      if (assignedRank === 0) usedCantrips.add(identity);
    }
    for (const [rank, candidates] of signatureCandidates) {
      // PF2e spell/data.ts location.signature; collection.ts expands native
      // virtual casting rows from the spell's original rank, not learned rank.
      if (candidates.length === 1) candidates[0].system.location.signature = true;
      else console.warn(`simplypf2e | ignored ${candidates.length} signature markers at rank ${rank}: only one is allowed`);
    }
    items.push({
      _id: entryId,
      name: `${capitalized(tradition)} Spells`,
      type: "spellcastingEntry",
      img: "systems/pf2e/icons/default-icons/spellcastingEntry.svg",
      system: {
        tradition: { value: tradition },
        prepared: { value: mode, flexible: false },
        ability: { value: ability },
        proficiency: { value: 1 },
        slots,
        spelldc: { value: 0, dc: 0, mod: 0 },
        showSlotlessLevels: { value: false }
      }
    });
    items.push(...spellSources.values());
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

  // Equipment and loot (the character's starting wealth, see
  // pcStartingWealthGp) use the exact same quantity/rune/carry-state handling
  // as the NPC pipeline — shared helpers, no PC-specific copy. Equipment is
  // deduped by name (issue #64 item 3) because the AI pads a thin list by
  // repeating items; loot dedups for the same reason.
  const equipmentItems = await buildEquipmentItems(resolved.equipment, { dedup: true });
  // A compendium UUID proves the exact published document, but it is not an
  // actor-item instance identity: native grants may clone the same source.
  // Keep a transaction-local embedded id so post-native loadout updates can
  // affect only the equipment this generation supplied.
  for (const item of equipmentItems) item._id = foundry.utils.randomID();
  items.push(...equipmentItems);
  items.push(...await buildLootItems(resolved.loot));

  const safeItems = filterItemTypes(items, CHARACTER_ITEM_TYPES, "character");

  // Pre-answer resolvable ChoiceSet rule elements to reduce native
  // PickAThingPrompt dialogs. Unresolved choices and deeper ABC grant paths
  // still prompt, because a dialog beats a silently invalid item. See
  // choice-set.mjs for the fail-open selection policy.
  await preresolveChoiceSets(safeItems, concept, resolved, keyAbility, selectChoices);

  // -----------------------------------------------------------------------
  // SCHEMA NOTE — the actor `system.*` field names below were VERIFIED against
  // foundryvtt/pf2e master source (character/data.ts + document.ts) when these
  // bugs were fixed: details.keyability.value, details.biography.{backstory,
  // appearance,attitude,beliefs,likes,dislikes,allies,enemies,organizations},
  // details.{age,gender,height,weight,ethnicity,nationality}.value,
  // details.languages.{value,details}, build.attributes.boosts.{1,5,10,15,20},
  // skills.<slug>.rank,
  // attributes.hp.{value,temp}. Base spell plans are source-qualified in
  // pc-tables; unsupported profiles remain explicitly approximate. Skill
  // schedules come from class.skillIncreaseLevels, with native grant/Int data
  // inspected on detached clones. Wealth uses GM Core Table 10-10's lump sum.
  // -----------------------------------------------------------------------

  // Bonus languages: capped to the ancestry's own slot count and allowed-list
  // (issue #56.2) — the ancestry's automatic languages (e.g. Common) are
  // added separately by the system itself, not listed here (see
  // resolveLanguages's doc comment).
  const languages = resolveLanguages(concept.languages ?? [], resolved.ancestryDoc);

  const actorData = {
    name: concept.name,
    type: "character",
    // Add items after Actor creation through PF2e's Item.createDocuments
    // override. That native path recursively creates ABC grants and runs
    // ChoiceSet/GrantItem pre-create rules; embedding raw item sources here
    // bypasses it and leaves choices such as a dwarf's clan weapon invalid.
    items: [],
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
      attributes: { hp: { temp: 0 } },
      // Focus pool starts full. Source `value` survives data prep (verified in
      // character/document.ts prepareBaseData — it keeps value, zeroes max);
      // `max` comes from the cloned rule on the focus spellcasting entry.
      resources: { focus: { value: focusPoolSize } },
      build: {
        attributes: {
          // Not manual entry — we want the boosts below (and the ABC-item
          // boosts) applied by the system to derive ability scores.
          manual: false,
          boosts: assignAbilityBoosts(keyAbility, concept.abilityPriorities)
        }
      },
      skills: {}
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

  const actor = await Actor.create(actorData);
  let skillPlan = null;
  let initialIntelligence = null;
  let seededSourceRanks = {};
  const skillWarnings = [];
  let loadoutWarnings = [];
  const loreIds = backgroundLore.map((item) => item._id);
  const planSkills = (snapshot, previous = null) => allocateCharacterSkills({
    ...snapshot, level: concept.level, initialRanks, initialIntelligence,
    additional: classData.system.trainedSkills?.additional, replacements,
    increaseLevels: classData.system.skillIncreaseLevels?.value,
    priorities: concept.skillPriorities, keyAbility, previous
  });
  // These clones only prepare native data: no document writes, preCreate,
  // grant expansion, or rule-source edits. Clear only sources we still own.
  const skillCloneData = (plan, previous) => {
    const patch = {};
    for (const slug of CORE_SKILLS) {
      const current = actor._source.system.skills?.[slug]?.rank ?? 0;
      const owned = current === (seededSourceRanks[slug] ?? 0);
      patch[`system.skills.${slug}.rank`] = Math.max(owned ? 0 : current, plan?.sourceRanks[slug] ?? 0);
    }
    const clonedItems = actor.toObject().items;
    for (const item of clonedItems) {
      if (!loreIds.includes(item._id)) continue;
      const key = `lore:${item._id}`;
      const current = item.system.proficient.value;
      const owned = current === (previous?.sourceRanks[key] ?? 1);
      item.system.proficient.value = Math.max(owned ? 1 : current, plan?.sourceRanks[key] ?? 1);
    }
    return { ...patch, items: clonedItems };
  };
  try {
    // Seed legal preferences before PF2e evaluates skill-dependent ChoiceSets.
    let previewSnapshot;
    try {
      const firstLevel = actor.clone({
        items: safeItems.filter((item) => ["ancestry", "background", "class", "heritage"].includes(item.type)),
        "system.details.level.value": 1
      }, { keepId: true });
      initialIntelligence = firstLevel.system.abilities.int.base;
      const preview = actor.clone({ items: safeItems }, { keepId: true });
      previewSnapshot = characterSkillSnapshot(preview, loreIds);
      skillPlan = planSkills(previewSnapshot);
    } catch (err) {
      console.warn("simplypf2e | could not inspect provisional native skills", err);
      skillWarnings.push("native-data");
    }
    if (skillPlan) {
      // Fixed ABC training also needs source ranks now: PF2e's preCreate
      // item preparation does not refresh numeric skill roll options.
      seededSourceRanks = Object.fromEntries(CORE_SKILLS.filter((slug) => !previewSnapshot.blocked.includes(slug))
        .map((slug) => [slug, Math.max(previewSnapshot.nativeRanks[slug] ?? 0, skillPlan.sourceRanks[slug] ?? 0)]));
      const coreUpdates = Object.fromEntries(Object.entries(seededSourceRanks).filter(([, rank]) => rank > 0)
        .map(([slug, rank]) => [`system.skills.${slug}.rank`, rank]));
      const projected = actor.clone({ items: safeItems, ...coreUpdates }, { keepId: true });
      const projection = characterSkillSnapshot(projected, loreIds);
      if (CORE_SKILLS.some((slug) => projection.nativeRanks[slug] !== Math.max(
        previewSnapshot.nativeRanks[slug], seededSourceRanks[slug] ?? 0))) {
        skillWarnings.push("native-rank-rule");
        skillPlan = null;
        seededSourceRanks = {};
      }
      if (skillPlan) {
        if (Object.keys(coreUpdates).length) await actor.update(coreUpdates);
        for (const item of backgroundLore) item.system.proficient.value = skillPlan.sourceRanks[`lore:${item._id}`] ?? 1;
      }
    }
    // The explicit ABC ids above are referenced by feat slots. `keepId`
    // preserves them while PF2e expands and links all native granted items.
    await actor.createEmbeddedDocuments("Item", safeItems, { keepId: true });

    // Once native ABC items have supplied the real character proficiencies,
    // ready only this generation's exact equipment. This must precede commit
    // so an unexpected Foundry write failure remains inside the actor rollback.
    const loadout = await applyCharacterLoadout(actor, equipmentItems);
    loadoutWarnings = loadout.warnings;

    // Refund overlaps only when the native floor supplies the old rank.
    // Confirm the real projected result is monotonic before applying it.
    let finalSkillData = null;
    if (skillPlan) {
      let snapshot;
      try {
        const native = actor.clone(skillCloneData(null, skillPlan), { keepId: true });
        snapshot = characterSkillSnapshot(native, loreIds);
      } catch (err) {
        console.warn("simplypf2e | could not inspect final native skills", err);
        skillWarnings.push("native-data");
      }
      if (snapshot) {
        const finalPlan = planSkills(snapshot, skillPlan);
        const data = skillCloneData(finalPlan, skillPlan);
        const projected = actor.clone(data, { keepId: true });
        const before = characterSkillSnapshot(actor, loreIds);
        const after = characterSkillSnapshot(projected, loreIds);
        const changedUnexpectedly = Object.keys(after.nativeRanks).some((slug) =>
          after.nativeRanks[slug] < before.nativeRanks[slug]
          || after.nativeRanks[slug] !== Math.max(snapshot.nativeRanks[slug], finalPlan.sourceRanks[slug] ?? 0));
        if (changedUnexpectedly) {
          skillWarnings.push("native-rank-rule");
          skillWarnings.push(...finalPlan.warnings);
        } else {
          skillPlan = finalPlan;
          finalSkillData = data;
        }
      }
    }

    if (finalSkillData) {
      const loreUpdates = finalSkillData.items.filter((item) => loreIds.includes(item._id))
        .filter((item) => item.system.proficient.value !== actor.items.get(item._id)?.system.proficient.value)
        .map((item) => ({ _id: item._id, "system.proficient.value": item.system.proficient.value }));
      if (loreUpdates.length) await actor.updateEmbeddedDocuments("Item", loreUpdates);
      const { items: _items, ...skillUpdates } = finalSkillData;
      const changedSkills = Object.fromEntries(Object.entries(skillUpdates).filter(([path, rank]) =>
        (actor._source.system.skills?.[path.split(".")[2]]?.rank ?? 0) !== rank));
      if (Object.keys(changedSkills).length) await actor.update(changedSkills);
    }

    // PF2e's ItemPF2e._preCreate adjusts current HP for each incoming ABC item
    // from the actor's then-current derived HP. A newly empty actor can be
    // clamped before all grants finish, so fill this one new character from
    // the system-derived maximum after awaited native item creation completes.
    // This does not await detached onCreate updates from other rules/modules.
    const hpMax = actor?.system?.attributes?.hp?.max;
    if (typeof hpMax !== "number" || !Number.isFinite(hpMax) || hpMax <= 0) {
      throw new Error("simplypf2e | character creation produced no usable derived HP maximum");
    }

    // Int-modifier bonus languages (issue #64 item 1): the character gets
    // extra language slots equal to their Intelligence modifier on top of the
    // ancestry's own count. Int is read from the system's own derived data
    // after native creation rather than re-deriving the boost math here.
    const updates = { "system.attributes.hp.value": hpMax };
    const intMod = Number(actor?.system?.abilities?.int?.mod) || 0;
    if (intMod > 0) {
      const withBonus = resolveLanguages(concept.languages ?? [], resolved.ancestryDoc, intMod);
      if (withBonus.length > languages.length) {
        updates["system.details.languages.value"] = withBonus;
      }
    }

    await actor.update(updates);
  } catch (err) {
    // Character creation is one operation from the user's perspective. Do
    // not leave an empty or partially populated Actor behind on failure.
    try { await actor.delete(); }
    catch (cleanupErr) {
      console.error("simplypf2e | failed to roll back incomplete character", cleanupErr);
      // The generator owns retryability. Carry the surviving actor out with
      // the original error so it can discard the draft instead of duplicating
      // this partially-created character on a retry.
      err.simplyPF2eRollbackActor = actor;
    }
    throw err;
  }

  // Reporting is presentation-only: a read failure must not roll back a
  // successfully finalized character or leave a retryable generator draft.
  let rows = [];
  try {
    const snapshot = characterSkillSnapshot(actor, loreIds);
    rows = Object.entries(snapshot.nativeRanks).filter(([, rank]) => Number.isInteger(rank) && rank > 0)
      .map(([slug, rank]) => ({ slug, rank, name: snapshot.lore.find((entry) => entry.key === slug)?.name ?? null }));
  } catch { skillWarnings.push("native-data"); }
  const warnings = [...new Set([...skillWarnings, ...(skillPlan?.warnings ?? [])])];
  for (const warning of warnings) console.warn(`simplypf2e | character skill review: ${warning}`);
  return { actor, expectedItems: [...safeItems, ...stagedClassPaths.expectedPaths], skillReport: { rows, warnings, loadoutWarnings, automatic: skillPlan?.automatic ?? !normalizeSkillPriorities(concept.skillPriorities).length,
    trainingBudget: skillPlan?.trainingBudget ?? null, unspentTraining: skillPlan?.unspentTraining ?? null,
    unspentIncreases: skillPlan?.unspentIncreases ?? null } };
}
