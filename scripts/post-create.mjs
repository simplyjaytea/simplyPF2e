/**
 * Verify that a newly-created actor retained the exact item data from its
 * in-flight transaction. This is a survival check, not a second PF2e rules
 * engine: PF2e remains responsible for derived data, grants, and rules.
 */
import { verifyNpcAbilityMechanics } from "./npc-ability-packages.mjs";

function normalized(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function actorItems(actor) {
  const items = actor?.items;
  if (Array.isArray(items?.contents)) return items.contents;
  if (Array.isArray(items)) return items;
  if (items && typeof items.values === "function") return [...items.values()];
  return null;
}

function sourceData(item) {
  return item?._source ?? item ?? {};
}

function itemField(item, field) {
  return item?.[field] ?? sourceData(item)?.[field] ?? null;
}

function sourceIdentity(item) {
  return item?._stats?.compendiumSource
    ?? sourceData(item)?._stats?.compendiumSource
    ?? null;
}

function itemId(item) {
  return item?.id ?? item?._id ?? sourceData(item)?._id ?? null;
}

function locationValue(item) {
  return item?.system?.location?.value
    ?? sourceData(item)?.system?.location?.value
    ?? null;
}

/**
 * PF2e expands a `kit` into its physical contents during native item
 * creation, so the kit's own compendium source cannot survive on the actor.
 * Convert that transaction-local kit expectation into the exact published
 * leaf sources that PF2e will persist. This mirrors only the system's
 * documented KitPF2e#createGrantedItems tree: backpacks persist alongside
 * their nested entries, nested kits expand again, and every other expected
 * leaf must prove it is a physical PF2e item.
 */
async function kitLeafExpectations(kit, loadUuid, ancestors = new Set(), { allowEmpty = false } = {}) {
  const entries = Object.values(sourceData(kit)?.system?.items ?? {});
  if (!entries.length) {
    if (allowEmpty) return [];
    throw new Error(`Post-create verification cannot expand empty kit "${itemField(kit, "name")}"`);
  }
  const leaves = [];
  for (const entry of entries) {
    const uuid = typeof entry?.uuid === "string" ? entry.uuid : null;
    if (!uuid) throw new Error(`Post-create verification found a kit entry without an exact source in "${itemField(kit, "name")}"`);
    const doc = await loadUuid(uuid);
    if (!doc || doc.uuid !== uuid || typeof doc.isOfType !== "function") {
      throw new Error(`Post-create verification could not load exact kit entry ${uuid}`);
    }
    if (doc.isOfType("kit")) {
      if (ancestors.has(uuid)) throw new Error(`Post-create verification found a cyclic kit source ${uuid}`);
      leaves.push(...await kitLeafExpectations(doc, loadUuid, new Set([...ancestors, uuid])));
      continue;
    }
    if (!doc.isOfType("physical")) {
      throw new Error(`Post-create verification found nonphysical kit entry ${uuid}`);
    }
    leaves.push({ name: doc.name, type: doc.type, _stats: { compendiumSource: uuid } });
    if (doc.isOfType("backpack") && entry.items && typeof entry.items === "object") {
      leaves.push(...await kitLeafExpectations({
        name: `${itemField(kit, "name")} contents`, type: "kit", system: { items: entry.items }
      }, loadUuid, ancestors, { allowEmpty: true }));
    }
  }
  return leaves;
}

/**
 * Produce the exact persisted-item contract for a native transaction. PF2e
 * consumes kits, so their physical leaves replace the non-persisted kit
 * source; all other expected items retain their original identity checks.
 */
export async function persistedExpectedItems(items, loadUuid = globalThis.fromUuid) {
  if (!Array.isArray(items)) throw new Error("Post-create verification requires the transaction item list");
  const expected = [];
  for (const item of items) {
    if (itemField(item, "type") !== "kit") {
      expected.push(item);
      continue;
    }
    if (typeof loadUuid !== "function") throw new Error("Post-create verification cannot load kit contents");
    expected.push(...await kitLeafExpectations(item, loadUuid));
  }
  return expected;
}

/**
 * Throw unless every item supplied to the native create path survives. Exact
 * compendium clones are matched by their persisted `compendiumSource`, never
 * by an ambiguous display name. Module-built and narrative items have no
 * compendium identity, so those are matched by their exact type/name shape.
 */
export function verifyCreatedActor(actor, manifest, expectedItems) {
  if (!actor?.id) throw new Error("Post-create verification failed: Foundry returned no actor id");
  if (!manifest?.complete) throw new Error("Post-create verification requires a complete manifest");
  const items = actorItems(actor);
  if (!items) throw new Error("Post-create verification failed: actor items are unavailable");
  if (!Array.isArray(expectedItems)) throw new Error("Post-create verification requires the transaction item list");

  const available = items.map((item) => ({ item, used: false }));
  const missing = [];
  const matched = [];
  for (const expected of expectedItems) {
    const type = itemField(expected, "type");
    const name = normalized(itemField(expected, "name"));
    const source = sourceIdentity(expected);
    const candidate = available.find(({ item, used }) => !used
      && itemField(item, "type") === type
      && (source ? sourceIdentity(item) === source : normalized(itemField(item, "name")) === name));
    if (candidate) {
      candidate.used = true;
      matched.push({ expected, actual: candidate.item });
    } else {
      missing.push(source ? `${type}: ${source}` : `${type}: ${itemField(expected, "name")}`);
    }
  }
  if (missing.length) {
    throw new Error(`Post-create verification failed: expected documents missing (${missing.join(", ")})`);
  }

  // A persisted spell is only usable if its persisted location refers to a
  // real spellcasting entry on this actor. Use actual ids: Foundry is allowed
  // to allocate embedded ids differently from our transient source data.
  const brokenLinks = matched.filter(({ expected, actual }) => itemField(expected, "type") === "spell"
    && locationValue(expected)
    && !items.some((item) => itemField(item, "type") === "spellcastingEntry" && itemId(item) === locationValue(actual)));
  if (brokenLinks.length) {
    throw new Error(`Post-create verification failed: ${brokenLinks.length} spell location${brokenLinks.length === 1 ? "" : "s"} did not resolve to a casting entry`);
  }
  verifyNpcAbilityMechanics(actor, matched);
  return { checked: matched.length };
}
