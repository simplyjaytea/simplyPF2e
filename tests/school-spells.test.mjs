import assert from "node:assert/strict";
import { load } from "./fixtures/pc-wizard/world.mjs";
import { WIZARD_ARCANE_SCHOOL_TAG, isArcaneSchoolSource, schoolInitialSpellLink } from "../scripts/school-spells.mjs";

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
