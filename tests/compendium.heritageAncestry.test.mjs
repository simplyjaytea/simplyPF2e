/* Heritage candidates carry their published ancestry so the ABC selector can
 * withhold heritages whose ancestry is not on offer. Versatile/agnostic
 * heritages have no ancestry and must stay unlabelled, not guessed.
 * Run: node tests/compendium.heritageAncestry.test.mjs */
import assert from "node:assert/strict";

const doc = (_id, name, ancestry) => ({
  _id, name, type: "heritage",
  system: {
    slug: name.toLowerCase().replaceAll(" ", "-"),
    traits: { value: [], rarity: "common" },
    ...(ancestry ? { ancestry: { name: ancestry, slug: ancestry.toLowerCase(), uuid: `Compendium.pf2e.ancestries.Item.${ancestry}` } } : {})
  }
});
const pack = {
  async getIndex() {
    return [
      doc("h-human", "Human Heritage", "Human"),
      doc("h-versatile", "Versatile Heritage", null),
      doc("h-dwarf", "Dwarf Heritage", "Dwarf")
    ];
  }
};

globalThis.game = {
  settings: { get: () => ({ heritages: ["test.heritages"] }) },
  packs: { get: (id) => (id === "test.heritages" ? pack : null) }
};

const compendium = await import("../scripts/compendium.mjs");
const heritages = await compendium.getHeritageCandidates("common", { distinctSources: true });
const byName = new Map(heritages.map((candidate) => [candidate.name, candidate]));

assert.equal(byName.get("Human Heritage")?.ancestry, "Human", "an owned heritage carries its ancestry name");
assert.equal(byName.get("Dwarf Heritage")?.ancestry, "Dwarf");
assert.equal(byName.get("Versatile Heritage")?.ancestry, undefined, "an ancestry-agnostic heritage has no ancestry field");
assert.deepEqual(byName.get("Human Heritage")?.ref, { packId: "test.heritages", _id: "h-human" },
  "the added metadata does not disturb the issued source reference");

console.log("compendium.heritageAncestry.test.mjs: heritage ancestry metadata is exact; versatile heritages stay unowned");
