/**
 * Post-native equipment planning for new characters.
 *
 * PF2e is the authority for which proficiencies an actor has. This module
 * only reads its prepared data and sets a conservative ready state on the
 * exact equipment sources supplied by this generation. It never changes
 * equipment ownership, adds an item, or modifies an existing character.
 *
 * The rank calculation deliberately follows PF2e 8.4.1's
 * `actor/character/helpers.ts#getItemProficiencyRank`: category, group/base,
 * and prepared synthetic predicates all participate. If an optional native
 * predicate cannot be inspected, that source is simply not credited.
 */

function itemSource(item) {
  return item?._source ?? item ?? {};
}

function itemId(item) {
  return item?.id ?? item?._id ?? itemSource(item)?._id ?? null;
}

function actorItems(actor) {
  const items = actor?.items;
  if (Array.isArray(items?.contents)) return items.contents;
  if (Array.isArray(items)) return items;
  if (items && typeof items.values === "function") return [...items.values()];
  return null;
}

function rank(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 4 ? parsed : 0;
}

function system(item) {
  return item?.system ?? itemSource(item)?.system ?? {};
}

function type(item) {
  return item?.type ?? itemSource(item)?.type ?? null;
}

function itemOptions(item) {
  try {
    return typeof item?.getRollOptions === "function" ? new Set(item.getRollOptions("item")) : null;
  } catch (error) {
    console.warn("simplypf2e | could not inspect item options for loadout", error);
    return null;
  }
}

function matchesDefinition(proficiency, options) {
  if (!options || typeof proficiency?.definition?.test !== "function") return false;
  try {
    return proficiency.definition.test(options) === true;
  } catch (error) {
    console.warn("simplypf2e | could not test a native martial proficiency for loadout", error);
    return false;
  }
}

/** Mirrors PF2e 8.4.1's native weapon-proficiency selection. */
export function weaponProficiencyRank(actor, weapon) {
  const attacks = actor?.system?.proficiencies?.attacks;
  if (!attacks || typeof attacks !== "object") return 0;
  const data = system(weapon);
  const category = weapon?.category ?? data.category;
  const group = weapon?.group ?? data.group;
  const baseItem = weapon?.baseType ?? data.baseItem;
  const equivalent = globalThis.CONFIG?.PF2E?.equivalentWeapons?.[baseItem] ?? baseItem;
  const options = itemOptions(weapon);
  const synthetic = Object.values(attacks)
    .filter((proficiency) => matchesDefinition(proficiency, options))
    .map((proficiency) => rank(proficiency?.rank));
  return Math.max(
    rank(attacks[category]?.rank),
    rank(attacks[`weapon-group-${group}`]?.rank),
    rank(attacks[`weapon-base-${equivalent}`]?.rank),
    ...synthetic
  );
}

/** Mirrors PF2e 8.4.1's native armor-proficiency selection. */
export function armorProficiencyRank(actor, armor) {
  const defenses = actor?.system?.proficiencies?.defenses;
  if (!defenses || typeof defenses !== "object") return 0;
  const category = armor?.category ?? system(armor).category;
  const options = itemOptions(armor);
  return Math.max(0, ...Object.entries(defenses)
    .filter(([key, proficiency]) => key === category || matchesDefinition(proficiency, options))
    .map(([, proficiency]) => rank(proficiency?.rank)));
}

function usage(item) {
  const value = system(item).usage?.value;
  if (type(item) === "armor") return { kind: "worn", slotted: true };
  if (value === "held-in-two-hands") return { kind: "held", hands: 2 };
  if (["held-in-one-hand", "held-in-one-plus-hands", "held-in-one-or-two-hands"].includes(value)) {
    return { kind: "held", hands: 1 };
  }
  if (typeof value === "string" && value.startsWith("worn")) return { kind: "worn", slotted: value !== "worn" };
  return { kind: "other" };
}

function equipmentPatch(item, state) {
  const id = itemId(item);
  if (!id) return null;
  const current = system(item).equipped ?? {};
  const desired = state === "worn"
    ? { carryType: "worn", handsHeld: 0, inSlot: true }
    : state.kind === "held"
      ? { carryType: "held", handsHeld: state.hands }
      : { carryType: "stowed", handsHeld: 0 };
  const patch = { _id: id };
  for (const [key, value] of Object.entries(desired)) {
    if (current[key] !== value) patch[`system.equipped.${key}`] = value;
  }
  return Object.keys(patch).length > 1 ? patch : null;
}

function expectedEquipment(actualItems, expectedItems) {
  const available = new Map(actualItems.map((item) => [itemId(item), item]));
  const matched = [];
  for (const expected of Array.isArray(expectedItems) ? expectedItems : []) {
    // A compendium UUID identifies a document, not this actor's item
    // instance: native grants can legitimately clone that same document.
    // The PC builder mints this exact embedded id before native creation, so
    // no source-only fallback may touch a similarly sourced native item.
    const actual = available.get(itemId(expected));
    if (!actual) continue;
    matched.push(actual);
  }
  return matched;
}

/**
 * Calculate no more than one worn armor and two occupied hands for this
 * generation's exact equipment. Weapons without a real trained proficiency
 * and every conflicting item remain stowed. The return is intentionally
 * plain data so it has full deterministic coverage outside Foundry.
 */
export function planCharacterLoadout(actor, expectedItems) {
  const allItems = actorItems(actor);
  if (!allItems) return { updates: [], warnings: ["loadout-native-data"], equipped: 0 };
  const items = expectedEquipment(allItems, expectedItems);
  const updates = [];
  const warnings = [];
  let equipped = 0;
  const stow = (item, warning = null) => {
    const patch = equipmentPatch(item, "stowed");
    if (patch) updates.push(patch);
    if (warning) warnings.push(warning);
  };

  // A character can wear a single armor item in a slot. The selected order is
  // the frozen exact selection order, which keeps this deterministic without
  // pretending to score published mechanics itself.
  let armorWorn = false;
  for (const item of items.filter((item) => usage(item).kind === "worn")) {
    if (armorProficiencyRank(actor, item) < 1) {
      stow(item, "loadout-untrained-armor");
      continue;
    }
    if (armorWorn) {
      stow(item, "loadout-armor-conflict");
      continue;
    }
    armorWorn = true;
    equipped++;
    const patch = equipmentPatch(item, "worn");
    if (patch) updates.push(patch);
  }

  // Favor a proficient weapon, then a shield, then other held equipment.
  // Within each class, preserve the exact selection order supplied by the
  // validated plan rather than manufacture a numeric item-quality score.
  const held = items.filter((item) => usage(item).kind === "held");
  const ordered = [...held.filter((item) => type(item) === "weapon"),
    ...held.filter((item) => type(item) === "shield"),
    ...held.filter((item) => !["weapon", "shield"].includes(type(item)))];
  let hands = 0;
  for (const item of ordered) {
    const ready = usage(item);
    if (type(item) === "weapon" && weaponProficiencyRank(actor, item) < 1) {
      stow(item, "loadout-untrained-weapon");
      continue;
    }
    if (hands + ready.hands > 2) {
      stow(item, "loadout-hand-conflict");
      continue;
    }
    hands += ready.hands;
    equipped++;
    const patch = equipmentPatch(item, ready);
    if (patch) updates.push(patch);
  }

  return { updates, warnings: [...new Set(warnings)], equipped };
}

/** Apply a computed plan only to the newly-created character's equipment. */
export async function applyCharacterLoadout(actor, expectedItems) {
  const plan = planCharacterLoadout(actor, expectedItems);
  if (plan.updates.length) await actor.updateEmbeddedDocuments("Item", plan.updates);
  return plan;
}
