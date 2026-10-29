// The permanent-slot pools and the valuable search, against a stubbed compendium of real pf2e 8.5.0
// documents (tests/fixtures/parcel). Index entries carry only the fields the module requests, and a
// document load goes through getDocument, as Foundry does.
// Run: node tests/parcel.permanentPool.test.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  getPermanentEquipmentCandidates, getParcelWandCandidates, getValuableCandidates, pickParcelValuable,
  getCandidateDocument
} from "../scripts/compendium.mjs";
import { PERMANENT_REASON } from "../scripts/treasure-permanent.mjs";
import { getSpecialWandCandidates, pickParcelValuables } from "../scripts/compendium.mjs";

const DIR = new URL("./fixtures/parcel/", import.meta.url);
const fixture = (name) => JSON.parse(readFileSync(new URL(`${name}.json`, DIR), "utf8"));
const EQUIPMENT_FIXTURES = ["magical-hearing-aid", "cube-of-recall", "aerial-cloak", "bracers-of-missile-deflection",
  "abysium-chunk", "flaming", "wand-of-mercy-1st-rank", "poisonous-cloak-type-i", "taletellers-ring", "magic-wand-1st-rank-spell"];

/** A pack stub: index entries shaped as getEquipmentIndex asks, and documents with toObject. */
function makePack(packId, raws, { loads, failing = new Map() } = {}) {
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
      if (loads) loads.count += 1;
      // A rejected read: the error thrown for this document id, as Foundry would reject it.
      if (failing.has(_id)) throw failing.get(_id);
      const raw = docs.get(_id);
      if (!raw) return null;
      return { uuid: `Compendium.${packId}.Item.${_id}`, name: raw.name, type: raw.type, toObject: () => structuredClone(raw) };
    }
  };
}

const v3Fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/parcel-v3/${name}.json`, import.meta.url), "utf8"));
const V3_WANDS = ["wand-of-continuation-1st-rank-spell", "wand-of-widening-1st-rank-spell", "cyrusian-wand-1st-rank-spell"].map(v3Fixture);
const equipmentRaws = [...EQUIPMENT_FIXTURES.map(fixture), ...V3_WANDS];
const valuableRaws = [fixture("agate"), fixture("silk-ceremonial-armor")];
const spellRaws = [
  { _id: "fireball0000000", name: "Fireball", type: "spell", system: { level: { value: 3 }, traits: { value: ["evocation", "fire"], rarity: "common" }, ritual: null } },
  { _id: "heal0000000000000", name: "Heal", type: "spell", system: { level: { value: 1 }, traits: { value: ["healing"], rarity: "common" }, ritual: null } },
  { _id: "light00000000000", name: "Light", type: "spell", system: { level: { value: 0 }, traits: { value: ["cantrip", "light"], rarity: "common" }, ritual: null } }
];

const loads = { count: 0 };
const equipmentFailing = new Map();
const packs = new Map([
  ["pf2e.equipment-srd", makePack("pf2e.equipment-srd", [...equipmentRaws, ...valuableRaws], { loads, failing: equipmentFailing })],
  ["pf2e.spells-srd", makePack("pf2e.spells-srd", spellRaws)]
]);
globalThis.game = {
  settings: { get: () => undefined },
  i18n: { localize: (key) => key },
  packs: { get: (id) => packs.get(id) }
};

// Permanent equipment at each level: the index filter, then the Rule Elements check on the full document.
const level1 = await getPermanentEquipmentCandidates(1, [], { maxRarity: "common" });
assert.deepEqual(level1.map((candidate) => candidate.name), ["Magical Hearing Aid"], "one eligible item at level 1");
assert.equal(level1[0].kind, "equipment");
assert.equal(level1[0].level, 1);
assert.match(level1[0].id, /^c-/, "offered as an opaque issued id, not a name or raw document id");

const level3 = await getPermanentEquipmentCandidates(3, ["cloak"], { maxRarity: "common" });
assert.deepEqual(level3.map((candidate) => candidate.name), ["Bracers of Missile Deflection"],
  "the cloak matches the brief but carries Rule Elements, so it is never offered; the bracers remain");

const level19 = await getPermanentEquipmentCandidates(19, [], { maxRarity: "common" });
assert.deepEqual(level19.map((candidate) => candidate.name), ["Cube of Recall"]);

const level2 = await getPermanentEquipmentCandidates(2, [], { maxRarity: "common" });
assert.deepEqual(level2, [], "no published item at level 2 in this stub");

// A distinct id resolves to exactly its own document; an issued candidate round-trips.
const doc = await getCandidateDocument(level1[0]);
assert.equal(doc.name, "Magical Hearing Aid");
assert.equal(await getCandidateDocument({ ref: { packId: "pf2e.equipment-srd", _id: "forged" } }), null,
  "a reference this run did not issue never resolves");

// Bounded loads: a limit of one loads at most three documents for that level.
loads.count = 0;
await getPermanentEquipmentCandidates(3, ["cloak"], { maxRarity: "common", limit: 1 });
assert.ok(loads.count <= 3, `loads are bounded (saw ${loads.count})`);

// Generic wands: one per spell of exactly the wand's rank, at level 2r+1; cantrips never appear.
// Level 7 is rank 3: the stub's Fireball is the one rank-3 spell.
const wandAtRank3 = await getParcelWandCandidates(7, [], { maxRarity: "common" });
assert.equal(wandAtRank3.length, 1, "level 7 is rank 3: Fireball");
assert.deepEqual([wandAtRank3[0].name, wandAtRank3[0].level, wandAtRank3[0].rank, wandAtRank3[0].kind],
  ["Fireball", 7, 3, "wand"], "a wand candidate carries the spell, its level and its rank");
assert.equal(wandAtRank3[0].spell.name, "Fireball", "the wand names its issued spell candidate");
// Rank 1 is level 3 only: a rank-1 spell never fills a level-2 or level-4 wand slot.
assert.deepEqual((await getParcelWandCandidates(3, [], { maxRarity: "common" })).map((candidate) => [candidate.name, candidate.level]), [["Heal", 3]]);
assert.deepEqual(await getParcelWandCandidates(4, [], { maxRarity: "common" }), [], "level 4 is not a wand level");
assert.deepEqual(await getParcelWandCandidates(2, []), []);
assert.deepEqual(await getParcelWandCandidates(21, []), []);
const cantripsInPool = (await getParcelWandCandidates(1, [])).map((candidate) => candidate.name);
assert.ok(!cantripsInPool.some((name) => name === "Light"), "cantrips are never wand spells");

// Valuables from the SRD pack: gems and art objects only, ranked by the brief, exact copper.
const pool = await getValuableCandidates(["silk"], { maxRarity: "common" });
assert.equal(pool.available, true);
assert.deepEqual(pool.candidates.map((candidate) => [candidate.name, candidate.copper]), [
  ["Silk ceremonial armor", 1000], ["Agate", 50]
], "the brief ranks silk first; each valuable has its exact copper value");

const exact = await pickParcelValuable(pool.candidates, 1000, "common");
assert.equal(exact.source.name, "Silk ceremonial armor", "a valuable exactly equal to the currency is allowed");
assert.equal(exact.copper, 1000);
assert.equal(exact.source.system.quantity, 1, "a valuable is always one item");

const tooExpensive = await pickParcelValuable(pool.candidates, 40, "common");
assert.equal(tooExpensive.reason, "too-expensive", "nothing fits a 40 cp currency");
assert.equal(tooExpensive.source, undefined);

const none = await pickParcelValuable([], 4000, "common");
assert.equal(none.reason, "none-offered", "an empty ranking is reported as none offered, not as an error");

// If the first fitting valuable cannot be loaded, the search goes on to the next one, deterministically.
const originalGetDocument = packs.get("pf2e.equipment-srd").getDocument;
packs.get("pf2e.equipment-srd").getDocument = async (_id) => (_id === fixture("silk-ceremonial-armor")._id ? null : originalGetDocument(_id));
const fallback = await pickParcelValuable(pool.candidates, 4000, "common");
assert.equal(fallback.source.name, "Agate", "an unloadable valuable falls through to the next fitting one");
packs.get("pf2e.equipment-srd").getDocument = originalGetDocument;

// The valuable pack is missing: the search says so, so the preview can say why.
packs.delete("pf2e.equipment-srd");
const missing = await getValuableCandidates([], { maxRarity: "common" });
assert.deepEqual([missing.available, missing.candidates.length], [false, 0]);
packs.set("pf2e.equipment-srd", makePack("pf2e.equipment-srd", [...equipmentRaws, ...valuableRaws], { failing: equipmentFailing }));

// Published special wands (parcel v3): the wand trait is offered only here, at the document's own level.
const specialAt4 = await getSpecialWandCandidates(4, [], { maxRarity: "rare" });
assert.deepEqual(specialAt4.map((candidate) => [candidate.name, candidate.kind, candidate.level]), [["Wand of Mercy (1st-rank)", "special-wand", 4]],
  "level 4 offers the Wand of Mercy only: Widening has Rule Elements, Cyrusian is mythic");
assert.deepEqual(await getSpecialWandCandidates(3, [], { maxRarity: "rare" }), [], "no special wand is offered at level 3");
assert.deepEqual((await getSpecialWandCandidates(5, [], { maxRarity: "common" })).map((candidate) => candidate.name), ["Wand of Continuation (1st-Rank Spell)"]);
assert.ok(!(await getPermanentEquipmentCandidates(4, [], { maxRarity: "rare" })).some((candidate) => candidate.name === "Wand of Mercy (1st-rank)"),
  "the generic equipment pool still refuses the wand trait");

// Up to three valuables (parcel v3): each taken in the caller's order only while its exact copper value fits what
// is left (equality allowed), each distinct, each read and validated; a rejected read is skipped.
const agateCandidate = { id: "pf2e.equipment-srd/agate", name: "Agate", copper: 50, packId: "pf2e.equipment-srd", _id: fixture("agate")._id };
const silkCandidate = { id: "pf2e.equipment-srd/silk", name: "Silk ceremonial armor", copper: 1000, packId: "pf2e.equipment-srd", _id: fixture("silk-ceremonial-armor")._id };
const both = await pickParcelValuables([agateCandidate, silkCandidate], 4000, "common");
assert.deepEqual(both.picked.map((p) => p.candidate.name), ["Agate", "Silk ceremonial armor"], "both fit 40 gp, in the caller's order");
assert.equal(both.remaining, 2950, "the remainder is exact: 40 gp less 5 sp less 10 gp");
assert.equal(both.picked[1].source.system.quantity, 1, "each valuable is one item");
const exactly = await pickParcelValuables([silkCandidate], 1000, "common");
assert.deepEqual([exactly.picked.length, exactly.remaining], [1, 0], "equality is allowed and leaves nothing");
const tooBig = await pickParcelValuables([silkCandidate], 999, "common");
assert.deepEqual([tooBig.picked.length, tooBig.skipped.map((skip) => skip.reason)], [0, ["too-expensive"]], "one copper short is refused");
const firstOnly = await pickParcelValuables([agateCandidate, silkCandidate], 4000, "common", { limit: 1 });
assert.deepEqual(firstOnly.picked.map((p) => p.candidate.name), ["Agate"], "the limit holds");
const twice = await pickParcelValuables([agateCandidate, agateCandidate], 4000, "common");
assert.equal(twice.picked.length, 1, "the same candidate is never taken twice");
equipmentFailing.set(silkCandidate._id, new Error("pack damaged"));
const skipsRead = await pickParcelValuables([silkCandidate, agateCandidate], 4000, "common");
equipmentFailing.clear();
assert.deepEqual(skipsRead.picked.map((p) => p.candidate.name), ["Agate"], "an unreadable valuable is skipped; the next still fits");
assert.deepEqual(skipsRead.skipped.map((skip) => skip.reason), ["unavailable"]);
await assert.rejects(() => pickParcelValuables([agateCandidate], -1, "common"), /whole, non-negative/, "a negative budget is refused");

// A rejected read of one candidate is that candidate's problem: the pool drops it and the search goes on.
equipmentFailing.set(fixture("magical-hearing-aid")._id, new Error("pack damaged"));
assert.deepEqual(await getPermanentEquipmentCandidates(1, [], { maxRarity: "common" }), [],
  "a rejected read leaves that candidate out and the pool still returns");
equipmentFailing.clear();

equipmentFailing.set(fixture("silk-ceremonial-armor")._id, new Error("pack damaged"));
const rejectedValuable = await pickParcelValuable(pool.candidates, 1000, "common");
assert.equal(rejectedValuable.source.name, "Agate", "a valuable whose read rejects is passed over for the next one that fits");
equipmentFailing.clear();

// A user abort during a read is not a candidate problem: it propagates.
equipmentFailing.set(fixture("silk-ceremonial-armor")._id, Object.assign(new Error("aborted"), { name: "AbortError" }));
await assert.rejects(() => pickParcelValuable(pool.candidates, 1000, "common"), /aborted/, "an abort propagates");
equipmentFailing.clear();

// The reason codes used by the assignment match the stable constants.
assert.equal(PERMANENT_REASON.NO_CANDIDATES, "no-candidates");

// Every equipment fixture on disk is either used above or deliberately left to its unit test.
// The classification fixtures used by treasure-permanent.test.mjs are listed here too, so each file on disk has a test.
const used = new Set([...EQUIPMENT_FIXTURES, "agate", "silk-ceremonial-armor", "abysium-chunk", "inquisitive-quill", "the-keep", "guiding-star-orb-heroic"]);
for (const file of readdirSync(DIR).filter((name) => name.endsWith(".json"))) {
  assert.ok(used.has(file.replace(/\.json$/, "")), `${file} is used by a test`);
}

console.log("parcel.permanentPool.test.mjs: equipment and wand pools, bounded loads, and valuable selection against real fixtures passed");
