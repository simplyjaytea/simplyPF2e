/**
 * Fundamental-runed weapons and armor for a treasure parcel (parcel v3). Pure: no Foundry globals.
 *
 * pf2e 8.5.0 values a runed item from its fundamental runes alone. When the runes add value the
 * base price is replaced, not added (physical/helpers.ts computePrice, quoted in
 * docs/plans/parcel-v3-2026-10-29.md). The item level is the maximum of the rune levels and the
 * base level (computeLevelRarityPrice), and its rarity is the highest of the base and rune rarities.
 * The module therefore computes the value in copper from the pinned tiers below and never trusts a
 * raw stored price or level. Each pinned tier is checked against the real document before it is used.
 *
 * Module conventions, not printed rules:
 * - Only tiers 1 to 3 are offered (the spec's limit). A secondary rune needs a potency rune.
 * - A runed clone carries the `magical` trait. pf2e computes a rune level only for a magical item
 *   (computeLevelRarityPrice returns the base level for a non-magical item), so the module sets it.
 * - Bases are ordinary: not specific, no runes, no property runes, no material, no grade, medium size,
 *   not shoddy, not magical, no Rule Elements.
 */
import { priceCopper, rarityAllowed } from "./treasure-permanent.mjs";
import { capitalized } from "./text.mjs";

/** pf2e-8.5.0 rarity order, physical/helpers.ts computeLevelRarityPrice `rarityOrder`. */
const RARITY_ORDER = Object.freeze({ common: 0, uncommon: 1, rare: 2, unique: 3 });

/** The secondary fundamental rune field per kind (runes.mjs SECONDARY_RUNE_FIELD). */
export const SECONDARY_FIELD = Object.freeze({ weapon: "striking", armor: "resilient" });

/** pf2e-8.5.0 spell/values.ts MAGIC_TRADITIONS: a tradition makes an item magical as well. */
const MAGIC_TRADITIONS = Object.freeze(new Set(["arcane", "divine", "occult", "primal"]));

const EQUIPMENT_PACK = "pf2e.equipment-srd";
const uuid = (id) => `Compendium.${EQUIPMENT_PACK}.Item.${id}`;

/**
 * Pinned fundamental rune tiers, from pf2e-8.5.0 src/module/item/physical/runes.ts:
 *   FUNDAMENTAL_WEAPON_RUNE_DATA.potency:   1 {level 2, price 35}, 2 {level 10, price 935}, 3 {level 16, price 8935}
 *   FUNDAMENTAL_WEAPON_RUNE_DATA.striking:  1 {level 4, price 65}, 2 {level 12, price 1065}, 3 {level 19, price 31065}
 *   FUNDAMENTAL_ARMOR_RUNE_DATA.potency:    1 {level 5, price 160}, 2 {level 11, price 1060}, 3 {level 18, price 20560}
 *   FUNDAMENTAL_ARMOR_RUNE_DATA.resilient:  1 {level 8, price 340}, 2 {level 14, price 3440}, 3 {level 20, price 49440}
 * Each `_id` is the pack document with those values (verified against the 8.5.0 pack in the fixtures).
 * `gp` is the tier price in gold pieces as runes.ts writes it; `usage` is the document's usage value.
 */
export const RUNE_TIERS = Object.freeze({
  weapon: Object.freeze({
    potency: Object.freeze({
      1: Object.freeze({ uuid: uuid("DKWuJb2rSgiotOG7"), level: 2, gp: 35, rarity: "common", usage: "etched-onto-a-weapon" }),
      2: Object.freeze({ uuid: uuid("pOoEiuEuITm4I2Il"), level: 10, gp: 935, rarity: "common", usage: "etched-onto-a-weapon" }),
      3: Object.freeze({ uuid: uuid("rvItjGQaYT7Luwtm"), level: 16, gp: 8935, rarity: "common", usage: "etched-onto-a-weapon" })
    }),
    striking: Object.freeze({
      1: Object.freeze({ uuid: uuid("DxCuJKynlnMQZHgp"), level: 4, gp: 65, rarity: "common", usage: "etched-onto-a-weapon" }),
      2: Object.freeze({ uuid: uuid("KCQRFvUgbyclvOGi"), level: 12, gp: 1065, rarity: "common", usage: "etched-onto-a-weapon" }),
      3: Object.freeze({ uuid: uuid("woxl2FrrgAcJDu0t"), level: 19, gp: 31065, rarity: "common", usage: "etched-onto-a-weapon" })
    })
  }),
  armor: Object.freeze({
    potency: Object.freeze({
      1: Object.freeze({ uuid: uuid("Ro3g2JpJXrKXVyEr"), level: 5, gp: 160, rarity: "common", usage: "etched-onto-armor" }),
      2: Object.freeze({ uuid: uuid("4Hb8tvvWFtykbZhG"), level: 11, gp: 1060, rarity: "common", usage: "etched-onto-armor" }),
      3: Object.freeze({ uuid: uuid("6ELjUFY0sEJ7nZlZ"), level: 18, gp: 20560, rarity: "common", usage: "etched-onto-armor" })
    }),
    resilient: Object.freeze({
      1: Object.freeze({ uuid: uuid("eSjQgsl3pYkirOwk"), level: 8, gp: 340, rarity: "common", usage: "etched-onto-armor" }),
      2: Object.freeze({ uuid: uuid("fCdcyCkGlmp0c34A"), level: 14, gp: 3440, rarity: "common", usage: "etched-onto-armor" }),
      3: Object.freeze({ uuid: uuid("WKcvvaZ0LxwYreb7"), level: 20, gp: 49440, rarity: "common", usage: "etched-onto-armor" })
    })
  })
});

/** The pinned tier for a potency or secondary rune, or null. */
export function pinnedTier(kind, field, tier) {
  if (!Object.hasOwn(RUNE_TIERS, kind)) return null;
  // The field must be this kind's own: a weapon has striking, never resilient.
  const group = field === "potency" ? "potency" : field === SECONDARY_FIELD[kind] ? field : null;
  if (!group) return null;
  const tiers = RUNE_TIERS[kind][group];
  return tiers && Object.hasOwn(tiers, tier) ? tiers[tier] : null;
}

/** The higher of two known rarities, or null when either is unknown. */
export function highestRarity(a, b) {
  if (!Object.hasOwn(RARITY_ORDER, a) || !Object.hasOwn(RARITY_ORDER, b)) return null;
  return RARITY_ORDER[a] >= RARITY_ORDER[b] ? a : b;
}

/**
 * Value, level and rarity of a runed item from its pinned tiers. Copper is the sum of the tier prices
 * only: the base price is replaced, as pf2e computePrice does when runes add value. Returns null for an
 * unknown kind, a tier outside 1 to 3, a secondary rune without a potency rune, or an unknown base rarity.
 */
export function runedValuation({ kind, baseLevel, baseRarity, potency, secondary = 0 }) {
  if (!SECONDARY_FIELD[kind]) return null;
  if (!Number.isInteger(baseLevel) || baseLevel < 0) return null;
  const p = pinnedTier(kind, "potency", potency);
  if (!p) return null;
  let copper = p.gp * 100;
  let level = Math.max(baseLevel, p.level);
  let rarity = highestRarity(baseRarity, p.rarity);
  if (secondary) {
    const s = pinnedTier(kind, SECONDARY_FIELD[kind], secondary);
    if (!s) return null;
    copper += s.gp * 100;
    level = Math.max(level, s.level);
    rarity = highestRarity(rarity, s.rarity);
  }
  if (!rarity) return null;
  return { level, rarity, copper, potency, secondary };
}

/** Why an ordinary base document cannot take fundamental runes, or null when it can. Full document only. */
export function runedBaseProblem(data, kind) {
  if (!data || typeof data !== "object") return "malformed";
  if (!SECONDARY_FIELD[kind]) return "type";
  const system = data.system ?? {};
  if (data.type !== kind) return "type";
  if (system.specific) return "specific";
  if (!Array.isArray(system.rules) || system.rules.length) return "rules";
  const runes = system.runes ?? {};
  if ((runes.potency ?? 0) !== 0 || (runes[SECONDARY_FIELD[kind]] ?? 0) !== 0) return "existing-rune";
  if (Array.isArray(runes.property) && runes.property.length) return "property-rune";
  if (system.material?.type || system.material?.grade) return "material";
  if (system.grade !== undefined && system.grade !== null) return "grade";
  if (system.size !== "med") return "size";
  if (Array.isArray(system.traits?.otherTags) && system.traits.otherTags.includes("shoddy")) return "shoddy";
  const traits = Array.isArray(system.traits?.value) ? system.traits.value : null;
  if (!traits) return "classification";
  if (traits.includes("magical") || traits.some((t) => MAGIC_TRADITIONS.has(t))) return "magical";
  const usage = system.usage?.value;
  if (usage !== undefined && usage !== null && (typeof usage !== "string" || /^(?:etched-onto|affixed-to)/.test(usage))) return "attachment";
  if (!Number.isInteger(system.level?.value) || system.level.value < 0) return "level";
  if (!rarityAllowed(system.traits?.rarity, "unique")) return "rarity";
  return null;
}

/** Why a loaded pinned rune document does not match its pinned tier, or null when it does. */
export function runeTierProblem(data, tier) {
  if (!data || typeof data !== "object" || !tier) return "malformed";
  const system = data.system ?? {};
  if (data.type !== "equipment") return "type";
  if (system.level?.value !== tier.level) return "level";
  if (priceCopper(system.price?.value) !== tier.gp * 100) return "price";
  if (system.traits?.rarity !== tier.rarity) return "rarity";
  if (system.usage?.value !== tier.usage) return "usage";
  return null;
}

/** The display name of a runed item, in the same form runes.mjs runedName gives the built clone. */
const SECONDARY_ADJECTIVE = Object.freeze({
  weapon: Object.freeze({ 1: "Striking", 2: "Greater Striking", 3: "Major Striking" }),
  armor: Object.freeze({ 1: "Resilient", 2: "Greater Resilient", 3: "Major Resilient" })
});
export function runedDisplayName(kind, baseName, potency, secondary) {
  return [`+${potency}`, secondary ? SECONDARY_ADJECTIVE[kind][secondary] : null, capitalized(baseName)].filter(Boolean).join(" ");
}

/** The candidate id for one base and one tier combination: opaque, and unique per base. */
export function runedCandidateId(baseId, potency, secondary) {
  return `rn-${baseId}-p${potency}s${secondary}`;
}

/**
 * Build the runed clone's source data from a base and verified tiers. The caller supplies the verified
 * tier values; this does not read them. Name and runes come from runes.mjs applyRunes and runedName.
 */
export function runedSourceFrom(baseData, { kind, potency, secondary }, applyRunes) {
  const field = SECONDARY_FIELD[kind];
  const source = structuredClone(baseData);
  delete source._id;
  source.system.rules = [];
  const traits = new Set([...(source.system.traits?.value ?? []), "magical"]);
  source.system.traits = { ...source.system.traits, value: [...traits].sort() };
  return applyRunes(source, { potency, [field]: secondary });
}

/** Stable JSON: object keys sorted, so two equal values always compare equal. */
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * The valuation-relevant facts of an ordinary base, read from its validated document (or from a built clone:
 * the clone copies them). Every field pf2e prepares a runed item from is here: level, rarity, grade, material,
 * specific, size, usage, the other tags (shoddy), the traits (without `magical`, which the clone adds), and the
 * runes already present apart from the fundamental tiers the module applies.
 */
export function runedBaseSnapshot(base, kind) {
  const system = base?.system ?? {};
  const field = SECONDARY_FIELD[kind];
  const { potency: _potency, [field]: _secondary, ...otherRunes } = system.runes ?? {};
  return Object.freeze({
    level: system.level?.value ?? null,
    rarity: system.traits?.rarity ?? null,
    grade: system.grade ?? null,
    materialType: system.material?.type ?? null,
    materialGrade: system.material?.grade ?? null,
    specific: Boolean(system.specific),
    size: system.size ?? null,
    usage: system.usage?.value ?? null,
    otherTags: [...(system.traits?.otherTags ?? [])].sort(),
    traits: [...(system.traits?.value ?? [])].filter((trait) => trait !== "magical").sort(),
    runesOther: stableJson(otherRunes)
  });
}

/** The snapshot fields, in the order a drift is reported. Each has its own reason code: `base-<field>`. */
export const RUNED_BASE_FIELDS = Object.freeze(["level", "rarity", "grade", "materialType", "materialGrade", "specific", "size", "usage", "otherTags", "traits", "runesOther"]);

/** The first snapshot field a built source no longer matches, as `base-<field>`, or null when none changed. */
export function runedBaseDrift(source, kind, snapshot) {
  const now = runedBaseSnapshot(source, kind);
  for (const field of RUNED_BASE_FIELDS) {
    if (stableJson(now[field]) !== stableJson(snapshot[field])) return `base-${field}`;
  }
  return null;
}

/**
 * Why a built runed source no longer matches its computed value, or null when it does. Runs at build time and
 * again at Create. The base snapshot is required: a computation without it cannot prove the source still
 * matches the base it was valued from, so it is refused. Then the source is compared with the snapshot field by
 * field, and the value is recomputed from the pinned tiers and the snapshot's level and rarity.
 */
export function runedSourceProblem(source, allowedLevels, maxRarity, computed) {
  if (!source || !computed || !Array.isArray(allowedLevels)) return "malformed";
  const kind = source.type;
  if (!SECONDARY_FIELD[kind]) return "type";
  if (!computed.base) return "malformed";
  const field = SECONDARY_FIELD[kind];
  const system = source.system ?? {};
  const runes = system.runes ?? {};
  if (runes.potency !== computed.potency || (runes[field] ?? 0) !== (computed.secondary ?? 0)) return "runes";
  if (Array.isArray(runes.property) && runes.property.length) return "property-rune";
  if (!Array.isArray(system.rules) || system.rules.length) return "rules";
  if (!Array.isArray(system.traits?.value) || !system.traits.value.includes("magical")) return "classification";
  const drift = runedBaseDrift(source, kind, computed.base);
  if (drift) return drift;
  if (system.specific || system.material?.type || system.material?.grade || system.size !== "med") return "base";
  const check = runedValuation({ kind, baseLevel: computed.baseLevel, baseRarity: computed.baseRarity, potency: computed.potency, secondary: computed.secondary });
  if (!check || check.copper !== computed.copper || check.level !== computed.level || check.rarity !== computed.rarity) return "valuation";
  if (!allowedLevels.includes(check.level)) return "level";
  if (!rarityAllowed(check.rarity, maxRarity)) return "rarity";
  return null;
}
