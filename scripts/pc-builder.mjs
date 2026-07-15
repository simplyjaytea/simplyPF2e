import * as T from "./tables.mjs";
import { findEntry, getDocument, toItemData, getPacksFor, getFeatCandidates } from "./compendium.mjs";
import {
  parseCoins, resolveLoot, resolveEquipment, buildScrollItem,
  customTreasureItem, customEquipmentItem, applyRunes, capitalized, slugify
} from "./builder.mjs";
import { ABILITY_BOOST_LEVELS, buildFeatSlots } from "./pc-tables.mjs";

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
    personality: String(c.personality ?? ""),
    alignmentFlavor: String(c.alignmentFlavor ?? ""),
    feats: (Array.isArray(c.feats) ? c.feats : []).map((f) => String(f)).filter(Boolean).slice(0, 8),
    spellcasting,
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
 */
export function pcStartingWealthGp(level, amount = "standard") {
  return Math.round(
    T.lookup(T.TREASURE_BY_LEVEL, level, "total", []) * (T.TREASURE_AMOUNT_MULTIPLIER[amount] ?? 1)
  );
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
  const ancestryEntry = await findEntry(getPacksFor("ancestries"), concept.ancestry, (e) => e.type === "ancestry");
  const ancestryDoc = await getDocument(ancestryEntry);
  if (!ancestryDoc) throw new Error(`Could not find ancestry "${concept.ancestry}" in the compendium`);

  const backgroundEntry = await findEntry(getPacksFor("backgrounds"), concept.background, (e) => e.type === "background");
  const backgroundDoc = await getDocument(backgroundEntry);
  if (!backgroundDoc) throw new Error(`Could not find background "${concept.background}" in the compendium`);

  const classEntry = await findEntry(getPacksFor("classes"), concept.class, (e) => e.type === "class");
  const classDoc = await getDocument(classEntry);
  if (!classDoc) throw new Error(`Could not find class "${concept.class}" in the compendium`);

  let heritageDoc = null;
  if (concept.heritage) {
    const heritageEntry = await findEntry(getPacksFor("heritages"), concept.heritage, (e) => e.type === "heritage");
    heritageDoc = await getDocument(heritageEntry);
    if (!heritageDoc) {
      console.warn(`simplypf2e | heritage "${concept.heritage}" not found in the compendium — dropping (character will have no heritage)`);
    }
  }

  const grants = [
    ...(await resolveGrants(ancestryDoc, concept.level)),
    ...(await resolveGrants(heritageDoc, concept.level)),
    ...(await resolveGrants(backgroundDoc, concept.level)),
    ...(await resolveGrants(classDoc, concept.level))
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

  const equipment = await resolveEquipment(concept);
  // concept.loot starts empty (see normalizePCConcept) — resolveLoot() is a
  // no-op on it here; applyTreasureBudget() (called by generator-app with
  // pcStartingWealthGp()) is what actually fills it with coins.
  const loot = await resolveLoot(concept);

  return { ancestryDoc, heritageDoc, backgroundDoc, classDoc, grants, featSlots, spells, equipment, loot };
}

/**
 * Resolve ai.mjs's selectFeats() picks against each slot's own candidate
 * list — fail-closed: a slot whose pick doesn't resolve to a real feat
 * document (wrong name, hallucination) is simply skipped, same fail-closed
 * behavior as NPC feats elsewhere in this module.
 * @param {{type: string, level: number, candidates: object[]}[]} featSlots
 * @param {{slot: number, name: string}[]} picks
 * @returns {Promise<{type: string, level: number, entry: object}[]>}
 */
export async function resolveFeatPicks(featSlots, picks) {
  const bySlot = new Map(picks.map((p) => [p.slot, p.name]));
  const resolved = [];
  for (let i = 0; i < featSlots.length; i++) {
    const slot = featSlots[i];
    const name = bySlot.get(i + 1) ?? null;
    let entry = null;
    if (name) {
      entry = await findEntry(
        getPacksFor("feats"),
        name,
        (e) => e.type === "feat" && (e.system?.level?.value ?? 0) <= slot.level
      );
      if (!entry) {
        console.warn(`simplypf2e | feat pick "${name}" for slot ${i + 1} (${slot.type}, level ${slot.level}) did not resolve to a real feat — dropping`);
      }
    }
    // entry stays null (dropped, same fail-closed behavior as NPC feats) when
    // nothing was picked for this slot or the pick didn't resolve; the name
    // is kept so the preview can still show what was requested.
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
function assignAbilityBoosts(keyAbility) {
  const key = ABILITY_KEYS.includes(keyAbility) ? keyAbility : "str";
  const priority = [key, "con", ...ABILITY_KEYS.filter((a) => a !== key && a !== "con")].slice(0, 4);
  const boosts = {};
  for (const level of ABILITY_BOOST_LEVELS) boosts[level] = [...priority];
  return boosts;
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

  items.push(toItemData(resolved.ancestryDoc));
  if (resolved.heritageDoc) items.push(toItemData(resolved.heritageDoc));
  items.push(toItemData(resolved.backgroundDoc));
  items.push(toItemData(resolved.classDoc));

  for (const grant of resolved.grants) {
    items.push(toItemData(grant));
  }

  // Feats: PCs allow the real "feat" item type directly — skip builder.mjs's
  // featToAction() NPC-only conversion entirely for this path.
  for (const { entry } of resolved.feats ?? []) {
    const doc = await getDocument(entry);
    if (!doc) continue;
    items.push(toItemData(doc));
  }

  // Spellcasting entry + spells (skipped when no spell resolved to a document).
  // ponytail: a fixed spontaneous entry is a v1 simplification — prepared-
  // caster slot management (Wizard-style) is out of scope; add if requested.
  if (concept.spellcasting && resolved.spells?.some((s) => s.entry)) {
    const entryId = foundry.utils.randomID();
    items.push({
      _id: entryId,
      name: `${capitalized(concept.spellcasting.tradition)} Spells`,
      type: "spellcastingEntry",
      img: "systems/pf2e/icons/default-icons/spellcastingEntry.svg",
      system: {
        tradition: { value: concept.spellcasting.tradition },
        prepared: { value: "spontaneous", flexible: false },
        proficiency: { value: 1 },
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
  // SCHEMA NOTE — ASSERTED, NOT VERIFIED. No running Foundry+pf2e world was
  // available while writing this; the field names below are this module's
  // best knowledge of the pf2e system schema (module.json requires pf2e
  // >= 6.0.0), NOT confirmed against real data. Before relying on this in
  // play, a human should: create a blank character, drag a real Ancestry +
  // Background + Class onto it via the sheet, then inspect
  // `actor.toObject().system` (build.attributes.boosts, details.keyability,
  // skills.<slug>.rank, details.biography.value) to confirm these field
  // names and shapes, and fix them here if they've drifted.
  // -----------------------------------------------------------------------
  const trainedSkills = new Set([
    ...(resolved.backgroundDoc.system?.trainedSkills?.value ?? []),
    ...(resolved.classDoc.system?.trainedSkills?.value ?? [])
  ]);
  const skills = {};
  for (const slug of trainedSkills) skills[slug] = { rank: 1 };

  const esc = (text) => (foundry.utils.escapeHTML ? foundry.utils.escapeHTML(text) : text);
  const backstoryHtml = concept.backstory
    ? `<p>${concept.backstory.split(/\n{2,}/).map((p) => esc(p.trim())).filter(Boolean).join("</p><p>")}</p>`
    : "";

  const actorData = {
    name: concept.name,
    type: "character",
    items: safeItems,
    system: {
      details: {
        level: { value: concept.level },
        keyability: { value: concept.keyAbility },
        biography: { value: backstoryHtml }
      },
      build: {
        attributes: {
          // Tells the sheet these boosts are explicit, not auto-suggested —
          // see the SCHEMA NOTE above for the "asserted, not verified" caveat.
          manual: true,
          boosts: assignAbilityBoosts(concept.keyAbility)
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
