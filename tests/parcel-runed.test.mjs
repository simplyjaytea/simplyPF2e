// Fundamental-runed weapons and armor for parcel v3: the pinned tiers agree with the real 8.5.0 documents,
// the valuation is pf2e's (the base price is replaced by the runes), bases and tiers fail closed, and the
// built source is checked again at Create. Fixtures: tests/fixtures/parcel-v3 (see its README).
// Run: node tests/parcel-runed.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RUNE_TIERS, runedValuation, runedBaseProblem, runeTierProblem, runedCandidateId, runedSourceFrom,
  runedSourceProblem, highestRarity, pinnedTier, runedBaseSnapshot
} from "../scripts/parcel-runed.mjs";
import { applyRunes } from "../scripts/runes.mjs";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/parcel-v3/${name}.json`, import.meta.url), "utf8"));
const clone = (value) => structuredClone(value);
const LONGSWORD = fixture("longsword");
const BREASTPLATE = fixture("breastplate");

// Parity: each pinned tier matches the real document it names, for every tier 1 to 3.
const FILES = {
  weapon: { potency: ["weapon-potency-1", "weapon-potency-2", "weapon-potency-3"], striking: ["striking", "striking-greater", "striking-major"] },
  armor: { potency: ["armor-potency-1", "armor-potency-2", "armor-potency-3"], resilient: ["resilient", "resilient-greater", "resilient-major"] }
};
for (const [kind, groups] of Object.entries(FILES)) {
  for (const [group, names] of Object.entries(groups)) {
    names.forEach((name, index) => {
      const doc = fixture(name);
      const tier = RUNE_TIERS[kind][group][index + 1];
      assert.equal(doc._id, tier.uuid.split(".").at(-1), `${name} is the pinned ${kind} ${group} tier ${index + 1} document`);
      assert.equal(runeTierProblem(doc, tier), null, `${name} matches its pinned level, price, rarity and usage`);
    });
  }
}
// A document whose value differs from the pinned tier is refused, not used.
const shiftedPrice = clone(fixture("striking"));
shiftedPrice.system.price.value = { gp: 66 };
assert.equal(runeTierProblem(shiftedPrice, RUNE_TIERS.weapon.striking[1]), "price", "a tier whose price disagrees with runes.ts is refused");
const shiftedLevel = clone(fixture("striking"));
shiftedLevel.system.level.value = 5;
assert.equal(runeTierProblem(shiftedLevel, RUNE_TIERS.weapon.striking[1]), "level");
const weaponAsArmor = clone(fixture("weapon-potency-1"));
weaponAsArmor.system.level.value = 5;
weaponAsArmor.system.price.value = { gp: 160 };
assert.equal(runeTierProblem(weaponAsArmor, RUNE_TIERS.armor.potency[1]), "usage", "a weapon rune is not an armor rune, even at the armor tier's level and price");

// Valuation parity with pf2e: the runes replace the base price (pf2e computePrice), and the level is the
// maximum of the rune levels and the base level (computeLevelRarityPrice).
const plus1Striking = runedValuation({ kind: "weapon", baseLevel: 0, baseRarity: "common", potency: 1, secondary: 1 });
assert.deepEqual(plus1Striking, { level: 4, rarity: "common", copper: 10000, potency: 1, secondary: 1 },
  "a +1 striking longsword is level 4 and 100 gp: the 1 gp base is not added");
assert.equal(runedValuation({ kind: "weapon", baseLevel: 0, baseRarity: "common", potency: 1, secondary: 0 }).copper, 3500, "+1 alone is 35 gp");
assert.equal(runedValuation({ kind: "armor", baseLevel: 0, baseRarity: "common", potency: 1, secondary: 1 }).copper, 50000, "+1 resilient armor is 500 gp");
assert.equal(runedValuation({ kind: "armor", baseLevel: 0, baseRarity: "common", potency: 1, secondary: 1 }).level, 8, "+1 resilient armor is level 8");
assert.equal(runedValuation({ kind: "weapon", baseLevel: 0, baseRarity: "common", potency: 2, secondary: 2 }).copper, 200000, "+2 greater striking is 2,000 gp");
assert.equal(runedValuation({ kind: "weapon", baseLevel: 0, baseRarity: "common", potency: 3, secondary: 3 }).level, 19, "+3 major striking is level 19");
assert.equal(runedValuation({ kind: "armor", baseLevel: 0, baseRarity: "common", potency: 3, secondary: 3 }).copper, 7_000_000, "+3 major resilient armor is 70,000 gp");
assert.equal(runedValuation({ kind: "weapon", baseLevel: 19, baseRarity: "common", potency: 1, secondary: 0 }).level, 19, "a high base level sets the level");
assert.equal(runedValuation({ kind: "weapon", baseLevel: 0, baseRarity: "uncommon", potency: 1, secondary: 1 }).rarity, "uncommon", "the highest of base and rune rarity");
assert.equal(highestRarity("rare", "uncommon"), "rare");
assert.equal(highestRarity("bogus", "common"), null, "an unknown rarity has no highest");

// Refusals: no potency, a tier above 3, a secondary without a potency, an unknown kind and a bad base level.
assert.equal(runedValuation({ kind: "weapon", baseLevel: 0, baseRarity: "common", potency: 0, secondary: 1 }), null);
assert.equal(runedValuation({ kind: "weapon", baseLevel: 0, baseRarity: "common", potency: 4, secondary: 0 }), null, "tier 4 is not offered");
assert.equal(runedValuation({ kind: "weapon", baseLevel: 0, baseRarity: "common", potency: 1, secondary: 4 }), null);
assert.equal(runedValuation({ kind: "shield", baseLevel: 0, baseRarity: "common", potency: 1, secondary: 0 }), null);
assert.equal(runedValuation({ kind: "weapon", baseLevel: -1, baseRarity: "common", potency: 1, secondary: 0 }), null);
assert.equal(runedValuation({ kind: "weapon", baseLevel: 0, baseRarity: "legendary", potency: 1, secondary: 0 }), null, "an unknown base rarity is refused");
assert.equal(pinnedTier("weapon", "resilient", 1), null, "a weapon has no resilient tier");

// Base documents: the ordinary longsword and breastplate pass; each disqualifying field is named.
assert.equal(runedBaseProblem(LONGSWORD, "weapon"), null, "an ordinary longsword can take runes");
assert.equal(runedBaseProblem(BREASTPLATE, "armor"), null, "an ordinary breastplate with no usage field can take runes");
assert.equal(runedBaseProblem(LONGSWORD, "armor"), "type", "a weapon is not armor");
const base = (mutate) => { const doc = clone(LONGSWORD); mutate(doc); return runedBaseProblem(doc, "weapon"); };
assert.equal(base((d) => { d.system.specific = true; }), "specific", "a specific item is refused");
assert.equal(base((d) => { d.system.material.type = "silver"; }), "material", "a precious material is refused");
assert.equal(base((d) => { d.system.grade = "high"; }), "grade", "a graded item is refused");
assert.equal(base((d) => { d.system.size = "lg"; }), "size", "a non-medium item is refused");
assert.equal(base((d) => { d.system.traits.otherTags = ["shoddy"]; }), "shoddy", "a shoddy item is refused");
assert.equal(base((d) => { d.system.runes.property = ["flaming"]; }), "property-rune", "an existing property rune is refused");
assert.equal(base((d) => { d.system.runes.striking = 1; }), "existing-rune", "an existing striking rune is refused");
assert.equal(base((d) => { d.system.rules = [{ key: "X" }]; }), "rules", "a base with Rule Elements is refused");
assert.equal(base((d) => { d.system.traits.value.push("magical"); }), "magical", "an already magical base is not an ordinary base");
assert.equal(base((d) => { d.system.usage = { value: "etched-onto-a-weapon" }; }), "attachment", "an attachment usage is not a base");
assert.equal(base((d) => { d.system.traits.rarity = "legendary"; }), "rarity", "an unknown base rarity is refused");
assert.equal(base((d) => { d.system.traits.value = undefined; }), "classification", "a base without traits fails closed");

// Candidate ids are opaque and unique per base and combination.
assert.equal(runedCandidateId("c-AbC", 1, 1), "rn-c-AbC-p1s1");
assert.notEqual(runedCandidateId("c-AbC", 1, 0), runedCandidateId("c-AbC", 1, 1));

// Build and Create: the source carries the runes and the magical trait and no Rule Elements, and the checks
// match the stored computation. Runes, traits, rules, rarity and the valuation are each checked.
const computed = { baseLevel: 0, baseRarity: "common", potency: 1, secondary: 1, copper: 10000, level: 4, rarity: "common", base: runedBaseSnapshot(LONGSWORD, "weapon") };
const runedSource = runedSourceFrom(LONGSWORD, { kind: "weapon", potency: 1, secondary: 1 }, applyRunes);
assert.equal(runedSource.name, "+1 Striking Longsword", "the name comes from runes.mjs runedName");
assert.deepEqual(runedSource.system.runes, { ...LONGSWORD.system.runes, potency: 1, striking: 1 }, "the runes are the verified tiers");
assert.ok(runedSource.system.traits.value.includes("magical"), "the clone is magical, so pf2e computes the rune level");
assert.deepEqual(runedSource.system.rules, [], "the clone carries no Rule Elements");
assert.equal(runedSource.system.level.value, 0, "the stored base level is untouched; pf2e computes the level");
assert.equal(runedSourceProblem(runedSource, [4], "common", computed), null, "the built source passes at its computed level");
assert.equal(runedSourceProblem(runedSource, [2], "common", computed), "level", "a slot at another level refuses it");
assert.equal(runedSourceProblem(runedSource, [4], "common", { ...computed, copper: 10100 }), "valuation", "a base price added to the runes is refused");
const changedRune = clone(runedSource); changedRune.system.runes.striking = 2;
assert.equal(runedSourceProblem(changedRune, [4], "common", computed), "runes", "a rune changed after Generate is refused");
const withRule = clone(runedSource); withRule.system.rules = [{ key: "Fake" }];
assert.equal(runedSourceProblem(withRule, [4], "common", computed), "rules", "a Rule Element added after Generate is refused");
const untagged = clone(runedSource); untagged.system.traits.value = untagged.system.traits.value.filter((t) => t !== "magical");
assert.equal(runedSourceProblem(untagged, [4], "common", computed), "classification", "a source without the magical trait is refused");
assert.equal(runedSourceProblem(runedSource, [4], "common", { ...computed, baseRarity: "uncommon", rarity: "uncommon" }), "rarity",
  "an uncommon base is refused at a common cap");
assert.equal(runedSourceProblem(runedSource, [4], "uncommon", { ...computed, baseRarity: "uncommon", rarity: "uncommon" }), null);

// Create compares the source with the base snapshot taken from the validated base, field by field. A change to any
// valuation-relevant field after the preview is refused with that field's reason, and nothing else is accepted.
assert.equal(runedSourceProblem(runedSource, [4], "common", { ...computed, base: undefined }), "malformed", "a value without its base snapshot is refused");
const driftCases = {
  level: (source) => { source.system.level.value = 20; },
  rarity: (source) => { source.system.traits.rarity = "uncommon"; },
  grade: (source) => { source.system.grade = "high"; },
  materialType: (source) => { source.system.material.type = "silver"; },
  materialGrade: (source) => { source.system.material.grade = "high"; },
  specific: (source) => { source.system.specific = true; },
  size: (source) => { source.system.size = "lg"; },
  usage: (source) => { source.system.usage = { value: "held-in-two-hands" }; },
  otherTags: (source) => { source.system.traits.otherTags = ["shoddy"]; },
  traits: (source) => { source.system.traits.value = [...source.system.traits.value, "fire"]; },
  runesOther: (source) => { source.system.runes.resilient = 1; }
};
for (const [field, change] of Object.entries(driftCases)) {
  const changed = clone(runedSource);
  change(changed);
  assert.equal(runedSourceProblem(changed, [4], "common", computed), `base-${field}`, `a changed ${field} after the preview is refused`);
}
// A source that matches its snapshot is still accepted: the comparison refuses drift, not the clone itself.
assert.equal(runedSourceProblem(clone(runedSource), [4], "common", computed), null);

console.log("parcel-runed.test.mjs: pinned tiers match real documents, pf2e valuation parity, base and tier refusals, and Create-time checks passed");
