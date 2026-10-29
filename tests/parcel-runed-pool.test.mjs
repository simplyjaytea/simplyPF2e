// The fundamental-runed pool against a stubbed compendium of real pf2e 8.5.0 documents (tests/fixtures/parcel-v3).
// Bases are read and checked in full; each pinned rune tier is verified against its document before any
// combination using it is offered, so a tampered tier removes only the combinations that use it.
// Run: node tests/parcel-runed-pool.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getRunedCandidates, getCandidateDocument } from "../scripts/compendium.mjs";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/parcel-v3/${name}.json`, import.meta.url), "utf8"));
const clone = (value) => structuredClone(value);

/** A pack stub with index entries shaped as getEquipmentIndex asks, and documents with toObject. */
function makePack(packId, raws) {
  const docs = new Map(raws.map((raw) => [raw._id, raw]));
  return {
    metadata: { type: "Item" },
    async getIndex({ fields }) {
      return raws.map((raw) => ({
        _id: raw._id, name: raw.name, type: raw.type,
        system: {
          level: { value: raw.system.level?.value },
          price: { value: raw.system.price?.value },
          usage: { value: raw.system.usage?.value },
          traits: { value: raw.system.traits?.value, rarity: raw.system.traits?.rarity },
          category: raw.system.category,
          specific: raw.system.specific
        },
        fields
      }));
    },
    async getDocument(_id) {
      const raw = docs.get(_id);
      if (!raw) return null;
      return { uuid: `Compendium.${packId}.Item.${_id}`, name: raw.name, type: raw.type, toObject: () => structuredClone(raw) };
    }
  };
}

const BASES = [fixture("longsword"), fixture("breastplate")];
const TIERS = ["weapon-potency-1", "weapon-potency-2", "weapon-potency-3", "striking", "striking-greater", "striking-major",
  "armor-potency-1", "armor-potency-2", "armor-potency-3", "resilient", "resilient-greater", "resilient-major"].map(fixture);
let raws = [...BASES, ...TIERS];
const setStub = () => {
  globalThis.game = {
    settings: { get: () => undefined },
    i18n: { localize: (key) => key },
    packs: { get: (id) => (id === "pf2e.equipment-srd" ? makePack("pf2e.equipment-srd", raws) : undefined) }
  };
};
setStub();
const names = (list) => list.map((candidate) => candidate.name);

// Each level offers the runed items that compute to it: +1 striking at 4, +1 at 2, +1 resilient breastplate at 8.
const at4 = await getRunedCandidates([4], [], { maxRarity: "common" });
assert.deepEqual(names(at4), ["+1 Striking Longsword"], "level 4 offers the +1 striking longsword and nothing else");
assert.equal(at4[0].kind, "runed");
assert.equal(at4[0].computed.copper, 10000, "its value is the two rune prices, 100 gp, with no base added");
assert.equal(at4[0].computed.level, 4);
assert.match(at4[0].id, /^rn-c-.*-p1s1$/, "its id names the base and the tier pair, opaque and unique");
assert.equal(names(await getRunedCandidates([2], [], { maxRarity: "common" })).includes("+1 Longsword"), true, "+1 alone is level 2");
assert.deepEqual(names(await getRunedCandidates([8], [], { maxRarity: "common" })).filter((n) => n.includes("Breastplate")),
  ["+1 Resilient Breastplate"], "a +1 resilient breastplate computes to level 8 and 500 gp");
assert.deepEqual(names(await getRunedCandidates([3], [], { maxRarity: "common" })), [], "no runed item computes to level 3");

// The base is issued, so the candidate's base resolves to its own document.
const base = await getCandidateDocument(at4[0].base);
assert.equal(base.name, "Longsword", "the base resolves to the real longsword document");

// A tampered tier (striking at the wrong price) is not used: its combinations are not offered, the rest are.
const tampered = clone(fixture("striking"));
tampered.system.price.value = { gp: 66 };
raws = [...BASES, ...TIERS.map((t) => (t._id === tampered._id ? tampered : t))];
setStub();
assert.deepEqual(names(await getRunedCandidates([4], [], { maxRarity: "common" })), [], "a striking tier that disagrees with runes.ts is not offered");
assert.deepEqual(names(await getRunedCandidates([2], [], { maxRarity: "common" })), ["+1 Longsword"], "potency-only combinations stay offered");
raws = [...BASES, ...TIERS];
setStub();

// Ineligible bases are never offered: a specific item, a material item, and a base with its own rune.
const specific = clone(fixture("longsword")); specific._id = "specificXXXXXXXX"; specific.name = "Specific Longsword"; specific.system.specific = true;
const silver = clone(fixture("longsword")); silver._id = "silverXXXXXXXXXX"; silver.name = "Silver Longsword"; silver.system.material = { type: "silver", grade: null };
const struck = clone(fixture("longsword")); struck._id = "struckXXXXXXXXXX"; struck.name = "Struck Longsword"; struck.system.runes.striking = 1;
raws = [...BASES, ...TIERS, specific, silver, struck];
setStub();
const withBad = names(await getRunedCandidates([2, 4], [], { maxRarity: "common" }));
assert.ok(!withBad.some((n) => n.includes("Specific")), "a specific base is never offered");
assert.ok(!withBad.some((n) => n.includes("Silver")), "a material base is never offered");
assert.ok(!withBad.some((n) => n.includes("Struck")), "a base that already carries a rune is never offered");
assert.ok(withBad.includes("+1 Longsword") && withBad.includes("+1 Striking Longsword"), "the ordinary longsword is still offered");
raws = [...BASES, ...TIERS];
setStub();

// The rarity cap applies to the base and the runes: an uncommon base is not offered at a common cap.
const uncommon = clone(fixture("longsword")); uncommon._id = "uncommonXXXXXXXX"; uncommon.name = "Uncommon Longsword"; uncommon.system.traits.rarity = "uncommon";
raws = [...BASES, ...TIERS, uncommon];
setStub();
assert.ok(!names(await getRunedCandidates([2, 4], [], { maxRarity: "common" })).some((n) => n.includes("Uncommon")), "an uncommon base is refused at a common cap");
assert.ok(names(await getRunedCandidates([2], [], { maxRarity: "uncommon" })).some((n) => n.includes("Uncommon")), "and offered at an uncommon cap");
raws = [...BASES, ...TIERS];
setStub();

// The per-level bound holds.
const capped = await getRunedCandidates([2, 4, 5, 8], [], { maxRarity: "common", limitPerLevel: 1 });
const perLevel = {};
for (const candidate of capped) perLevel[candidate.computed.level] = (perLevel[candidate.computed.level] ?? 0) + 1;
assert.ok(Object.values(perLevel).every((count) => count === 1), "no level offers more than the cap");

console.log("parcel-runed-pool.test.mjs: runed items offered at their computed level, tampered tiers and ineligible bases refused, rarity and cap bounds hold");
