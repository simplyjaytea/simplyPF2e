import assert from "node:assert/strict";
import { load } from "./fixtures/pc-wizard/world.mjs";
import { WIZARD_ARCANE_SCHOOL_TAG, isAdvancedSchoolSpellFeat, isArcaneSchoolSource, schoolAdvancedSpellLink, schoolInitialSpellLink } from "../scripts/school-spells.mjs";

const battle = await load("school-of-battle-magic");
const mentalism = await load("school-of-mentalism");
const technologies = await load("school-of-magical-technologies");
const thesis = await load("spell-blending");
const bridge = await load("arcane-school");
const description = (item) => item.system.description.value;
assert.equal(WIZARD_ARCANE_SCHOOL_TAG, "wizard-arcane-school");
assert.deepEqual(schoolInitialSpellLink(description(battle)), { uuid: "Compendium.pf2e.spells-srd.Item.Force Bolt", label: null });
assert.deepEqual(schoolInitialSpellLink(description(mentalism)), { uuid: "Compendium.pf2e.spells-srd.Item.Charming Push", label: null });
assert.deepEqual(schoolInitialSpellLink(description(technologies)), { uuid: "Compendium.pf2e.spells-srd.Item.Augmented Body", label: null });
const built = "<p><strong>School Spells</strong> initial: @UUID[Compendium.pf2e.spells-srd.Item.Hu38hoAUSYeFpkVa]{Force Bolt}; advanced: @UUID[Compendium.pf2e.spells-srd.Item.LoBjvguamA12iyW0]{Energy Absorption}</p>";
assert.deepEqual(schoolInitialSpellLink(built), { uuid: "Compendium.pf2e.spells-srd.Item.Hu38hoAUSYeFpkVa", label: "Force Bolt" });
for (const value of [description(thesis), built + built, "<p><strong>School Spells</strong> initial: Force Bolt</p>",
  "<p><strong>School Spells</strong> initial: @UUID[Item.abc]</p>", undefined,
  "<p><strong>School Spells</strong> initial: @UUID[Compendium.pf2e.spells-srd.Item.Force Bolt]",
  "<p><strong>School Spells</strong> initial: @UUID[Compendium.pf2e.spells-srd.Item.Force Bolt] initial: @UUID[Compendium.pf2e.spells-srd.Item.Charming Push]</p>"]) {
  assert.equal(schoolInitialSpellLink(value), null);
}
assert.equal(isArcaneSchoolSource(battle), true);
assert.equal(isArcaneSchoolSource(thesis), false);
assert.equal(isArcaneSchoolSource(bridge), false);

// Advanced links: the same paragraph, parsed for "advanced:" in both forms, with the same fail-closed rules.
assert.deepEqual(schoolAdvancedSpellLink(description(battle)), { uuid: "Compendium.pf2e.spells-srd.Item.Energy Absorption", label: null });
assert.deepEqual(schoolAdvancedSpellLink(built), { uuid: "Compendium.pf2e.spells-srd.Item.LoBjvguamA12iyW0", label: "Energy Absorption" });
for (const value of ["<p><strong>School Spells</strong> initial: @UUID[Compendium.pf2e.spells-srd.Item.Force Bolt]</p>",
  "<p><strong>School Spells</strong> initial: @UUID[Compendium.pf2e.spells-srd.Item.Force Bolt]; advanced: @UUID[Compendium.pf2e.spells-srd.Item.A]; advanced: @UUID[Compendium.pf2e.spells-srd.Item.B]</p>",
  "<p><strong>School Spells</strong> initial: @UUID[Compendium.pf2e.spells-srd.Item.Force Bolt]; advanced: Energy Absorption</p>",
  description(thesis)]) {
  assert.equal(schoolAdvancedSpellLink(value), null);
}
// The Advanced School Spell feat is recognized by its document id, from a uuid, a source or a reference.
assert.equal(isAdvancedSchoolSpellFeat("Compendium.pf2e.feats-srd.Item.5hUj7glY8YnO5sBI"), true);
assert.equal(isAdvancedSchoolSpellFeat({ _stats: { compendiumSource: "Compendium.pf2e.feats-srd.Item.5hUj7glY8YnO5sBI" } }), true);
assert.equal(isAdvancedSchoolSpellFeat({ packId: "pf2e.feats-srd", _id: "5hUj7glY8YnO5sBI" }), true);
assert.equal(isAdvancedSchoolSpellFeat({ name: "Advanced School Spell" }), false, "a name alone is not the feat");
assert.equal(isAdvancedSchoolSpellFeat("Compendium.pf2e.feats-srd.Item.Pet"), false);
assert.equal(isAdvancedSchoolSpellFeat({ uuid: "Compendium.pf2e.feats-srd.Item.5hUj7glY8YnO5sBI.Extra" }), false);
assert.equal(isAdvancedSchoolSpellFeat(null), false);
