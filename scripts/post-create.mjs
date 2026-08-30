/**
 * Verify that a newly-created actor retained the exact item data from its
 * in-flight transaction. This is a survival check, not a second PF2e rules
 * engine: PF2e remains responsible for derived data, grants, and rules.
 */

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
  return { checked: matched.length };
}
