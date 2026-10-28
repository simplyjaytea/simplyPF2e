/*
 * Scrolls and wands of real spells (WP6, package C1).
 *
 * Mirrors PF2e 8.5.0 createConsumableFromSpell:
 *   src/module/item/consumable/spell-consumables.ts lines 22-81 (name 51-53, traits 43-49,
 *   description 56-66, embedded spell 70-75).
 * Blank rank templates, pinned by UUID:
 *   src/scripts/config/spell-consumables.ts lines 32-77 (wand rank 10 is null, line 61).
 * Other quotes: spell/document.ts 176-187 (isCantrip, isFocusSpell, isRitual),
 *   base/document.ts 86-101 (sourceId, description), spell/values.ts line 2 (MAGIC_TRADITIONS),
 *   static/lang/en.json PF2E.Item.Physical.FromSpell.Scroll and .Wand.
 * Research record: docs/plans/consumables-research-2026-10-26.md sections 2, 4, 5, 8, 9, 10.
 *
 * Pure: no Foundry globals. Documents arrive as plain data. Price and level are never set here:
 * they come from the template, and PF2e recomputes both on every prep (physical/document.ts 352-358).
 * Rule Elements are never created: every template has system.rules [] (invariant 2).
 */

/** Blank rank templates, pinned by UUID. Identical on pf2e master (research section 2.3). */
export const SPELL_CONSUMABLE_TEMPLATES = Object.freeze({
  scroll: Object.freeze({
    1: "Compendium.pf2e.equipment-srd.Item.RjuupS9xyXDLgyIr",
    2: "Compendium.pf2e.equipment-srd.Item.Y7UD64foDbDMV9sx",
    3: "Compendium.pf2e.equipment-srd.Item.ZmefGBXGJF3CFDbn",
    4: "Compendium.pf2e.equipment-srd.Item.QSQZJ5BC3DeHv153",
    5: "Compendium.pf2e.equipment-srd.Item.tjLvRWklAylFhBHQ",
    6: "Compendium.pf2e.equipment-srd.Item.4sGIy77COooxhQuC",
    7: "Compendium.pf2e.equipment-srd.Item.fomEZZ4MxVVK3uVu",
    8: "Compendium.pf2e.equipment-srd.Item.iPki3yuoucnj7bIt",
    9: "Compendium.pf2e.equipment-srd.Item.cFHomF3tty8Wi1e5",
    10: "Compendium.pf2e.equipment-srd.Item.o1XIHJ4MJyroAHfF",
  }),
  wand: Object.freeze({
    1: "Compendium.pf2e.equipment-srd.Item.UJWiN0K3jqVjxvKk",
    2: "Compendium.pf2e.equipment-srd.Item.vJZ49cgi8szuQXAD",
    3: "Compendium.pf2e.equipment-srd.Item.wrDmWkGxmwzYtfiA",
    4: "Compendium.pf2e.equipment-srd.Item.Sn7v9SsbEDMUIwrO",
    5: "Compendium.pf2e.equipment-srd.Item.5BF7zMnrPYzyigCs",
    6: "Compendium.pf2e.equipment-srd.Item.kiXh4SUWKr166ZeM",
    7: "Compendium.pf2e.equipment-srd.Item.nmXPj9zuMRQBNT60",
    8: "Compendium.pf2e.equipment-srd.Item.Qs8RgNH6thRPv2jt",
    9: "Compendium.pf2e.equipment-srd.Item.Fgv722039TVM5JTc",
  }),
  cantripDeck: "Compendium.pf2e.equipment-srd.Item.tLa4bewBhyqzi6Ow",
});

// pf2e config: `1: "Compendium.pf2e.equipment-srd.Item.tLa4bewBhyqzi6Ow"`;
// app.svelte: `itemTypeData?.cantripsOnly ? compendiumUuids?.[1] : compendiumUuids?.[Number(rank)]`.
export const CANTRIP_DECK_RANK = 1;

// Rarity of a cantrip deck follows its cantrip (spell-consumables.ts 43-45 quoted at the deck builder), and pf2e
// has no rarity rule of its own for the deck (createConsumableFromSpell copies traits.rarity from the spell). Rare
// and unique cantrips stay out because the module found no pf2e rule that allows them.
export const CANTRIP_DECK_RARITIES = Object.freeze(["common", "uncommon"]);

/**
 * The highest cantrip rarity a deck pool may use for a Forge rarity. Fails closed: only the uncommon-or-rarer
 * Forge values widen the pool to uncommon; any other value (including a missing one) stays common.
 */
export function cantripDeckMaxRarity(forgeRarity) {
  return ["uncommon", "rare", "unique"].includes(forgeRarity) ? "uncommon" : "common";
}

/** Highest rank each kind may reach. Scrolls go to 10; wands stop at 9 (no wand 10 template). */
const RANK_LIMITS = Object.freeze({ scroll: 10, wand: 9 });

/** en.json keys PF2E.Item.Physical.FromSpell.Scroll / .Wand, English text, rank as a plain number. */
const NAME_TEMPLATES = Object.freeze({
  cantripDeck: "Cantrip Deck of {name} (5-pack)",
  scroll: "Scroll of {name} (Rank {level})",
  wand: "Wand of {name} (Rank {level})",
});

/** pf2e 8.5.0 spell/values.ts line 2: MAGIC_TRADITIONS = arcane, divine, occult, primal. */
const MAGIC_TRADITIONS = new Set(["arcane", "divine", "occult", "primal"]);

/** Template UUID for a scroll or wand at a rank, or null (wand 10, unknown kind, bad rank). */
export function spellConsumableTemplateUuid(kind, rank) {
  if (kind === "cantripDeck") return rank === CANTRIP_DECK_RANK ? SPELL_CONSUMABLE_TEMPLATES.cantripDeck : null;
  if (!Object.hasOwn(RANK_LIMITS, kind) || !Number.isInteger(rank)) return null;
  return SPELL_CONSUMABLE_TEMPLATES[kind][rank] ?? null;
}

/** The template UUID split into { packId, _id } for compendium lookup, or null. */
export function spellConsumableTemplateRef(kind, rank) {
  const match = /^Compendium\.([^.]+\.[^.]+)\.Item\.([A-Za-z0-9]+)$/.exec(spellConsumableTemplateUuid(kind, rank) ?? "");
  return match ? { packId: match[1], _id: match[2] } : null;
}

/**
 * Why a spell cannot become this consumable at this rank, or null when it can.
 * Stricter than the native function, which has no rank or spell checks of its own
 * (research section 4.1). Order follows the policy in sprint plan WP6, decision 2.
 */
export function spellConsumableRankProblem(spellData, kind, rank) {
  if (kind === "cantripDeck") {
    if (rank !== CANTRIP_DECK_RANK) return "rank must be 1 for a cantrip deck";
    if (!spellData || typeof spellData !== "object") return "spell data is missing";
    const traits = spellData.system?.traits?.value ?? [];
    if (!traits.includes("cantrip")) return "a cantrip deck requires a cantrip";
    if (traits.includes("focus")) return "focus spells cannot become cantrip decks";
    if (spellData.system?.ritual) return "rituals cannot become cantrip decks";
    if (!CANTRIP_DECK_RARITIES.includes(spellData.system?.traits?.rarity)) return "cantrip decks require a common or uncommon cantrip";
    return null;
  }
  if (!Object.hasOwn(RANK_LIMITS, kind)) return `"${kind}" is not a scroll or wand`;
  const max = RANK_LIMITS[kind];
  if (!Number.isInteger(rank) || rank < 1 || rank > max) return `rank must be a whole number from 1 to ${max} for a ${kind}`;
  if (!spellData || typeof spellData !== "object") return "spell data is missing";
  const base = spellData.system?.level?.value;
  if (!Number.isInteger(base)) return "spell has no base rank";
  if (rank < base) return `rank ${rank} is below the spell's base rank ${base}`;
  const traits = spellData.system?.traits?.value ?? [];
  // spell/document.ts 176-178: isCantrip = traits.value includes "cantrip".
  if (traits.includes("cantrip")) return "cantrips cannot become scrolls or wands";
  // spell/document.ts 180-183: isFocusSpell = traits.value includes "focus" (the cantrip branch is refused above).
  if (traits.includes("focus")) return "focus spells cannot become scrolls or wands";
  // spell/document.ts 185-187: isRitual = !!system.ritual (data.ts line 36, RitualData | null).
  if (spellData.system?.ritual) return "rituals cannot become scrolls or wands";
  return null;
}

/** Escape the HTML metacharacters of text placed inside a description paragraph. */
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Item name in the native English format; null for a kind with no name template. */
export function spellConsumableName(kind, spellName, rank) {
  if (!Object.hasOwn(NAME_TEMPLATES, kind)) return null;
  return NAME_TEMPLATES[kind]
    .replace("{name}", () => String(spellName))
    .replace("{level}", () => String(rank));
}

const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Foundry's randomID when a Foundry runtime is present; otherwise 16 alphanumerics from Web Crypto. */
function randomId() {
  if (typeof foundry !== "undefined" && typeof foundry.utils?.randomID === "function") return foundry.utils.randomID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ID_CHARS[byte % ID_CHARS.length]).join("");
}

/**
 * Item source for a scroll or wand of a spell, mirroring createConsumableFromSpell.
 * `templateData` is the plain data of the pinned rank template; its _stats.compendiumSource must be
 * the table UUID for this kind and rank (toItemData sets it).
 * Throws on a rank problem or a template that is not a consumable of this kind (fail closed).
 * Inputs are not mutated.
 */
export function buildSpellConsumable({ kind, rank, templateData, spellData } = {}) {
  const problem = spellConsumableRankProblem(spellData, kind, rank);
  if (problem) throw new Error(`Cannot build ${kind} at rank ${rank}: ${problem}`);
  const category = kind === "cantripDeck" ? "other" : kind;
  if (templateData?.type !== "consumable" || templateData.system?.category !== category) {
    throw new Error(`Cannot build ${kind}: the template must be a consumable with category "${category}"`);
  }
  // The template must be the pinned rank template: toItemData() records the source UUID in _stats.
  if (templateData._stats?.compendiumSource !== spellConsumableTemplateUuid(kind, rank)) {
    throw new Error(`Cannot build ${kind} at rank ${rank}: the template is not the pinned rank template`);
  }
  const item = structuredClone(templateData);
  for (const key of ["_id", "folder", "ownership", "sort"]) delete item[key];
  if (item.system.rules?.length) throw new Error(`Cannot build ${kind}: the template carries Rule Elements`);
  item.system.rules = [];

  const spell = structuredClone(spellData);

  // pf2e 8.5.0 spell-consumables.ts 43-49: union of template and spell traits, sorted;
  // rarity copied from the spell; "magical" dropped only when a magic tradition word is in traits.value
  // (spell/values.ts line 2). Spell traditions live in system.traits.traditions and do not count:
  // the published Wand of the Spider keeps "magical" alongside arcane and primal traditions.
  const traits = [...new Set([...(item.system.traits?.value ?? []), ...(spell.system?.traits?.value ?? [])])];
  if (traits.includes("magical") && traits.some((trait) => MAGIC_TRADITIONS.has(trait))) {
    traits.splice(traits.indexOf("magical"), 1);
  }
  item.system.traits = {
    ...item.system.traits,
    value: traits.sort(),
    rarity: spell.system?.traits?.rarity ?? item.system.traits?.rarity,
  };

  item.name = spellConsumableName(kind, spell.name, rank);

  // pf2e 8.5.0 spell-consumables.ts 56-66: a link paragraph, then <hr>, then the template text.
  // Without a source UUID the native code appends the spell description as text (escaped on
  // serialization); that fallback is mirrored here. sourceId: base/document.ts 86-89.
  const templateDescription = item.system.description?.value ?? "";
  const sourceUuid = spell._stats?.duplicateSource ?? spell._stats?.compendiumSource ?? null;
  const spellText = escapeHtml(String(spell.system?.description?.value ?? "").trim());
  // The label is enricher text, where a brace would end it early, so braces become entities.
  const label = escapeHtml(String(spell.name ?? "")).replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");
  const link = sourceUuid ? `@UUID[${sourceUuid}]{${label}}` : spellText;
  item.system.description = { ...item.system.description, value: `<p>${link}</p><hr>${templateDescription}` };

  // pf2e 8.5.0 spell-consumables.ts 70-75: the spell source with a fresh _id and
  // location { value: null, heightenedLevel: rank } merged over its own location.
  if (kind === "cantripDeck") {
    delete item.system.spell;
    return item;
  }
  spell._id = randomId();
  spell.system = {
    ...spell.system,
    location: { ...(spell.system?.location ?? {}), value: null, heightenedLevel: rank },
  };
  item.system.spell = spell;
  return item;
}
