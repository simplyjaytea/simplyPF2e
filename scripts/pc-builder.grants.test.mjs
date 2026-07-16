// Regression check for issue #56 / PR #61: a background's own granted feat
// (e.g. Acolyte's "Student of the Canon") must get system.location set to the
// granting item's embedded _id, or the pf2e feat-slotting logic dumps it into
// Bonus Feats. Run: node scripts/pc-builder.grants.test.mjs
//
// pc-builder.mjs can't be imported here (it touches foundry.*/game.* globals
// throughout), so the ~4 lines under test are copied verbatim below. If the
// real logic diverges, update BOTH places.

import assert from "node:assert/strict";

// --- Copied verbatim from scripts/pc-builder.mjs lines 561-566 (source of
// truth — keep in sync). toItemData is stubbed as a plain clone; the real one
// just clones a compendium doc to embeddable item data.
const toItemData = (doc) => structuredClone(doc);
function mapGrants(grants, { ancestryId, heritageId, backgroundId, classId }) {
  const items = [];
  const parentIds = { ancestry: ancestryId, heritage: heritageId, background: backgroundId, class: classId };
  for (const { doc, parent } of grants) {
    const data = toItemData(doc);
    if (data.type === "feat") data.system.location = parentIds[parent] ?? null;
    items.push(data);
  }
  return items;
}

// --- Minimal replica of the real system's slot resolution, from
// foundryvtt/pf2e:
//   src/module/actor/character/feats/collection.ts — the "skill" FeatGroup is
//     built with a hidden slot whose id === actor.background.id when the
//     background grants its own feat.
//   src/module/actor/character/feats/group.ts — FeatGroup.assignFeat(): when
//     feat.system.location !== the group's own id, slotId = feat.system.location
//     and the feat lands in this.slots[slotId] if such a slot exists; no slot
//     match anywhere → Bonus Feats.
function resolveSlot(feat, group) {
  const slotId =
    feat.system.location === group.id
      ? (feat.system.level?.taken?.toString() ?? "")
      : (feat.system.location ?? "");
  return group.slots[slotId] ? slotId : "bonus";
}

// --- Test: background grant gets location = the background's embedded id,
// and that value resolves to the skill group's hidden slot, not Bonus Feats.
const backgroundId = "bg123";
const grants = [
  { doc: { type: "feat", name: "Student of the Canon", system: { category: "skill", level: { value: 1 } } }, parent: "background" }
];
const ids = { ancestryId: "anc1", heritageId: null, backgroundId, classId: "cls1" };

const [featData] = mapGrants(grants, ids);
assert.equal(featData.system.location, "bg123", "granted feat's location must be the background's embedded id");

// Fake "skill" group as collection.ts builds it: hidden slot id === background id.
const skillGroup = { id: "skill", slots: { [backgroundId]: { id: backgroundId, level: 1 } } };
assert.equal(resolveSlot(featData, skillGroup), "bg123", "location must resolve to the background's hidden slot");

// Negative case: an unmapped parent yields location null, which must NOT
// match any real slot — falls through to the bonus bucket.
const [orphan] = mapGrants(
  [{ doc: { type: "feat", name: "Orphan Feat", system: {} }, parent: "unknown" }],
  ids
);
assert.equal(orphan.system.location, null, "unmapped parent must yield null location");
assert.equal(resolveSlot(orphan, skillGroup), "bonus", "null location must fall through to bonus");

// Non-feat grants (ancestryfeature/classfeature docs, etc.) must pass through untouched.
const [feature] = mapGrants(
  [{ doc: { type: "ancestryfeature", name: "Darkvision", system: {} }, parent: "ancestry" }],
  ids
);
assert.equal(feature.system.location, undefined, "non-feat grants must not get a location");

console.log("pc-builder grants regression check: all assertions passed");
