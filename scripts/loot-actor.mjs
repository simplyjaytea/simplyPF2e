/**
 * Pure source builder for a PF2e `loot` actor (sprint plan 2026-10-27, WP2).
 *
 * Every field written here is quoted from real pf2e source in
 * docs/plans/sprint-2026-10-27.md section 2 (refs pf2e-8.5.0 and v14-dev):
 * - 2.1 loot data model, `src/module/actor/loot/data.ts` lines 9-34. Writable `system` keys are
 *   `details.description`, `details.level.value` (integer, at least 0), `lootSheetType` and
 *   `hiddenWhenEmpty`; lines 55-59 declare `attributes?: never; traits?: never; schema?: never`.
 *   https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/module/actor/loot/data.ts
 * - 2.2 loot document, `src/module/actor/loot/document.ts`: `allowedItemTypes` is only
 *   `["physical"]` and `canHostRuleElements` is false.
 * - 2.4 creation defaults, `src/module/actor/base.ts` lines 133-141: the default image is
 *   `systems/${SYSTEM_ID}/icons/default-icons/${actorData.type}.svg`, so a loot actor's image is
 *   LOOT_ACTOR_IMG. Lines 637-670 force LIMITED ownership and a linked, sightless token, so this
 *   module never writes `ownership` or `prototypeToken`.
 *   https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/module/actor/base.ts
 * - 2.5 item types, `src/module/item/physical/values.ts` lines 3-13 (nine PHYSICAL_ITEM_TYPES),
 *   `src/module/item/helpers.ts` lines 37-42 (`itemIsOfType`), and
 *   `src/module/item/base/document.ts` lines 657-663 (the type check runs only when adding items
 *   to an existing actor, which is why this module checks types itself before writing).
 * - 2.6 coins, `src/module/actor/inventory/index.ts` lines 106-122 and 353-358: `addCurrency`
 *   deep-clones the published coin document from `coinCompendiumUuids`, then deletes `_id` and
 *   writes `system.quantity`. `src/module/item/treasure/document.ts` lines 11-13:
 *   `isCoinage` is `system.category === "coin"`.
 * - 2.9 the loot sheet enriches the description (`src/module/actor/loot/sheet.ts` lines 37-40),
 *   so every description line is escaped and proven enricher-inert.
 *
 * Never writes a Rule Element (PLAYBOOK invariant 2): loot actors cannot host them and every
 * cloned source here must already have `system.rules` empty.
 *
 * Pure: no Foundry globals, no document objects. Inputs are plain data and are never mutated.
 */
import { esc } from "./text.mjs";
import { enricherTokens } from "./reskin-policy.mjs";

/** Plan 2.4: pf2e `getDefaultArtwork` derives this from the actor type; written explicitly. */
export const LOOT_ACTOR_IMG = "systems/pf2e/icons/default-icons/loot.svg";

/**
 * Plan 2.5, `src/module/item/physical/values.ts` lines 3-13 (pf2e-8.5.0, identical on v14-dev):
 *   const PHYSICAL_ITEM_TYPES = new Set([
 *       "ammo", "armor", "backpack", "book", "consumable", "equipment", "shield", "treasure", "weapon",
 *   ] as const);
 * A loot actor accepts only `["physical"]` (plan 2.2). `Object.freeze` marks the binding frozen;
 * a Set's own methods still work on the internal slot, so callers are trusted not to mutate it.
 */
export const LOOT_ITEM_TYPES = Object.freeze(new Set([
  "ammo", "armor", "backpack", "book", "consumable", "equipment", "shield", "treasure", "weapon",
]));

/** Plan 2.9/WP2: the manifest handed to `verifyCreatedActor` for a loot actor. */
export const LOOT_MANIFEST = Object.freeze({ complete: true });

/**
 * Plan 2.6, `src/module/actor/inventory/index.ts` lines 353-358 (pf2e-8.5.0; v14-dev has the same
 * object at lines 359-364). Full UUIDs are pinned again here, as the plan requires, so the drift
 * check (which scans scripts/*.mjs for `Compendium.pf2e...Item.<id>`) covers them.
 */
export const COIN_UUIDS = Object.freeze({
  pp: "Compendium.pf2e.equipment-srd.Item.JuNPeK5Qm1w6wpb4",
  gp: "Compendium.pf2e.equipment-srd.Item.B6B7tBWJSqOBz5zz",
  sp: "Compendium.pf2e.equipment-srd.Item.5Ew82vBF9YfaiY9f",
  cp: "Compendium.pf2e.equipment-srd.Item.lzJ8AVhRcbFul5fh",
});

/** The pack that holds COIN_UUIDS; the only single source of coin ids for builder.mjs too. */
export const COIN_PACK_ID = "pf2e.equipment-srd";

/**
 * `{ packId, _id }` for a coin, the form `getDocument` in compendium.mjs takes. Derived from
 * COIN_UUIDS so the coin ids exist in one place. Throws for anything that is not a coin.
 */
export function coinEntry(denomination) {
  if (!Object.hasOwn(COIN_UUIDS, denomination)) {
    throw new Error(`"${denomination}" is not a coin denomination (pp, gp, sp, cp)`);
  }
  const prefix = `Compendium.${COIN_PACK_ID}.Item.`;
  const uuid = COIN_UUIDS[denomination];
  if (!uuid.startsWith(prefix)) throw new Error(`Coin UUID for ${denomination} is not in ${COIN_PACK_ID}`);
  return { packId: COIN_PACK_ID, _id: uuid.slice(prefix.length) };
}

/** Plan 3.3.4: the GM-typed container name is trimmed and capped at this length. */
export const LOOT_NAME_MAX = 100;

/**
 * Coin item source for a loot actor, mirroring `ActorInventory#addCurrency` (plan 2.6).
 *
 * `coinData` is a `toItemData()` result for the published coin document. The source must be the
 * pinned document for `denomination`, must be treasure coinage, must price exactly that one
 * denomination, and `quantity` must be a whole number of at least 1. Anything else throws (fail
 * closed): a missing or unexpected coin is never replaced with a custom treasure item.
 *
 * Returns a deep clone with `_id` removed and `system.quantity` set, exactly like the native code.
 */
export function coinItemSource(coinData, denomination, quantity) {
  if (!Object.hasOwn(COIN_UUIDS, denomination)) {
    throw new Error(`Cannot clone a coin: "${denomination}" is not a coin denomination (pp, gp, sp, cp)`);
  }
  if (!coinData || typeof coinData !== "object" || Array.isArray(coinData)) {
    throw new Error("Cannot clone a coin: the coin document data is missing");
  }
  if (coinData.type !== "treasure") {
    throw new Error(`Cannot clone a coin: "${coinData.name ?? "unnamed"}" is not a treasure item`);
  }
  const system = coinData.system ?? {};
  // Plan 2.6: pf2e 8.4.1+ `TreasurePF2e#isCoinage` is `system.category === "coin"`;
  // `system.stackGroup === "coins"` is the pre-8.4.1 field (PLAYBOOK section 3).
  if (system.category !== "coin" && system.stackGroup !== "coins") {
    throw new Error(`Cannot clone a coin: "${coinData.name ?? "unnamed"}" is not coinage`);
  }
  const price = system.price?.value;
  if (!price || typeof price !== "object" || Array.isArray(price)) {
    throw new Error(`Cannot clone a coin: "${coinData.name ?? "unnamed"}" has no price`);
  }
  const positive = Object.entries(price).filter(([, value]) => typeof value === "number" && value > 0);
  if (positive.length !== 1 || positive[0][0] !== denomination) {
    throw new Error(`Cannot clone a coin: "${coinData.name ?? "unnamed"}" is not priced in ${denomination}`);
  }
  if (coinData._stats?.compendiumSource !== COIN_UUIDS[denomination]) {
    throw new Error(`Cannot clone a coin: the source is not the published ${denomination} document`);
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error(`Cannot clone a coin: quantity must be a whole number of at least 1 (got ${quantity})`);
  }
  const item = structuredClone(coinData);
  delete item._id;
  item.system.quantity = quantity;
  return item;
}

/**
 * HTML for the loot actor description: one escaped `<p>` per line, joined with no separator.
 *
 * Plan 2.9: the loot sheet runs `TextEditorPF2e.enrichHTML` over this field, so enricher syntax is
 * live. A line carrying an enricher token, a `[[` bracket or an `@` command is refused rather than
 * escaped, because escaping cannot neutralize Foundry enrichers (PLAYBOOK invariant 5).
 * Plan 2.1: the description is never written empty, so at least one non-blank line is required.
 */
export function lootDescriptionHtml(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("A loot actor description needs at least one line");
  }
  const html = lines.map((line, index) => {
    if (typeof line !== "string" || !line.trim()) {
      throw new Error(`Loot actor description line ${index} must be non-blank text`);
    }
    if (enricherTokens(line).length > 0 || line.includes("[[") || line.includes("@")) {
      throw new Error(`Loot actor description line ${index} contains Foundry enricher syntax`);
    }
    return `<p>${esc(line)}</p>`;
  });
  return html.join("");
}

/**
 * The create payload for one pf2e loot actor holding `items` (sprint plan WP2 contract).
 *
 * Field map from plan 2.1: only `details.description`, `details.level.value`, `lootSheetType` and
 * `hiddenWhenEmpty` are written. `ownership`, `prototypeToken` and `folder` are never written
 * (plan 2.4: pf2e forces LIMITED ownership and links the token itself), and `system.attributes`
 * and `system.traits` are explicitly not part of the loot source (plan 2.1).
 *
 * Items must all be physical PF2e types (plan 2.5) and must not carry Rule Elements (plan 3.3.1).
 * Throws on any contract violation; the caller discards the draft. Inputs are not mutated.
 */
export function buildLootActorSource({ name, level, descriptionLines, items } = {}) {
  if (typeof name !== "string") throw new Error("A loot actor needs a text name");
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("A loot actor needs a non-empty name");
  if (trimmedName.length > LOOT_NAME_MAX) {
    throw new Error(`A loot actor name must be at most ${LOOT_NAME_MAX} characters`);
  }
  if (!Number.isInteger(level) || level < 0) {
    throw new Error(`A loot actor level must be a whole number of at least 0 (got ${level})`);
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("A loot actor needs at least one item");
  }
  items.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Loot actor item ${index} is not a document source`);
    }
    if (!LOOT_ITEM_TYPES.has(item.type)) {
      throw new Error(`Loot actor item ${index} has type "${item.type}", which a loot actor cannot hold`);
    }
    if (Array.isArray(item.system?.rules) && item.system.rules.length > 0) {
      throw new Error(`Loot actor item "${item.name ?? index}" carries Rule Elements`);
    }
  });

  return {
    actor: {
      name: trimmedName,
      type: "loot",
      img: LOOT_ACTOR_IMG,
      system: {
        details: {
          description: lootDescriptionHtml(descriptionLines),
          level: { value: level },
        },
        lootSheetType: "Loot",
        hiddenWhenEmpty: false,
      },
    },
    items: structuredClone(items),
  };
}
