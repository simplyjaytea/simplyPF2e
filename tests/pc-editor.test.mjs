// PC editor form contract (C06): control names map to pc-edit.mjs edits,
// empty placeholders are refused except for the nullable "none" choices, and
// selections report pending choices as empty so stale values are never shown.

import assert from "node:assert/strict";

const { pcEditFromControl, pcEditorSelections, pcEditorInvalidatedControls } = await import("../scripts/pc-editor.mjs");
const { PC_EDIT_CODES } = await import("../scripts/pc-edit.mjs");

// Edits: each control value maps to exactly one contract edit.
assert.deepEqual(pcEditFromControl("ancestry", "test.pack:human"), { field: "ancestry", key: "test.pack:human" });
assert.deepEqual(pcEditFromControl("class", " test.pack:rogue "), { field: "class", key: "test.pack:rogue" });
assert.deepEqual(pcEditFromControl("background", "test.pack:acolyte"), { field: "background", key: "test.pack:acolyte" });
assert.deepEqual(pcEditFromControl("feat.2", "test.pack:feat"), { field: "feat", slot: 2, key: "test.pack:feat" });
assert.deepEqual(pcEditFromControl("equipment.0", "test.pack:sword"), { field: "equipment", index: 0, key: "test.pack:sword" });
assert.deepEqual(pcEditFromControl("keyAbility", "dex"), { field: "keyAbility", value: "dex" });
assert.deepEqual(pcEditFromControl("backgroundLore", "legal"), { field: "backgroundLore", value: "legal" });

// Nullable choices: an empty value clears the field (heritage "none", no class path).
assert.deepEqual(pcEditFromControl("heritage", ""), { field: "heritage", key: null });
assert.deepEqual(pcEditFromControl("classPath", "  "), { field: "classPath", key: null });
assert.deepEqual(pcEditFromControl("heritage", "test.pack:elf"), { field: "heritage", key: "test.pack:elf" });

// Refusals: empty required values and unknown controls throw a contract-coded error.
for (const [control, value] of [["ancestry", ""], ["feat.0", "  "], ["equipment.1", undefined], ["keyAbility", ""]]) {
  assert.throws(() => pcEditFromControl(control, value), (error) => {
    assert.equal(error.code, PC_EDIT_CODES.INVALID);
    assert.equal(error.field, control);
    assert.match(error.message, /choose a value first/);
    return true;
  });
}
assert.throws(() => pcEditFromControl("spells.0", "x"), (error) => error.code === PC_EDIT_CODES.INVALID);
assert.throws(() => pcEditFromControl(null, "x"), (error) => error.code === PC_EDIT_CODES.INVALID);

// Selections: identity keys from refs, feat and equipment entries by index,
// and pending fields reported as empty so the UI shows a placeholder.
const plan = {
  concept: {
    ancestryCandidate: { packId: "test.pack", _id: "human" },
    heritageCandidate: null,
    backgroundCandidate: { packId: "test.pack", _id: "acolyte" },
    classCandidate: { packId: "test.pack", _id: "rogue" },
    classPathCandidate: { packId: "test.pack", _id: "path" },
    keyAbility: "dex",
    backgroundLore: "legal"
  },
  resolved: {
    feats: [{ entry: { packId: "test.pack", _id: "feat-a" } }, { entry: null }],
    equipment: [{ entry: { packId: "test.pack", _id: "sword" } }]
  },
  pending: []
};
assert.deepEqual(pcEditorSelections(plan), {
  ancestry: "test.pack:human",
  heritage: "",
  background: "test.pack:acolyte",
  class: "test.pack:rogue",
  classPath: "test.pack:path",
  keyAbility: "dex",
  backgroundLore: "legal",
  "feat.0": "test.pack:feat-a",
  "feat.1": "",
  "equipment.0": "test.pack:sword"
});

const pending = pcEditorSelections({
  ...plan,
  pending: [{ field: "classPath", reason: "re-pick" }, { field: "keyAbility", reason: "re-pick" }, { field: "backgroundLore", reason: "re-pick" }]
});
assert.equal(pending.classPath, "");
assert.equal(pending.keyAbility, "");
assert.equal(pending.backgroundLore, "");
assert.equal(pending.class, "test.pack:rogue", "non-pending fields keep their selection");

// Invalidation: feat slots map to their control; other fields map to themselves.
assert.deepEqual(pcEditorInvalidatedControls([
  { field: "feat", slot: 3, reason: "slot no longer exists" },
  { field: "classPath", reason: "class changed" }
]), ["feat.3", "classPath"]);
assert.deepEqual(pcEditorInvalidatedControls(undefined), []);

// Per-bridge class paths (Wizard): one control per bridge, named by the bridge feature.
assert.deepEqual(pcEditFromControl("classPath.Arcane School", "test.pack:school"), { field: "classPath", bridge: "Arcane School", key: "test.pack:school" });
assert.deepEqual(pcEditFromControl("classPath.Arcane Thesis", " test.pack:thesis "), { field: "classPath", bridge: "Arcane Thesis", key: "test.pack:thesis" });
assert.deepEqual(pcEditFromControl("classPath.Arcane School", ""), { field: "classPath", bridge: "Arcane School", key: null },
  "an empty bridge control clears only that bridge");
assert.deepEqual(pcEditFromControl("classPath.Rogue's Racket.Variant", "k"), { field: "classPath", bridge: "Rogue's Racket.Variant", key: "k" },
  "everything after the first dot is the bridge name");
for (const control of ["classPath.", "classPaths.Arcane School", "classPath .x"]) {
  assert.throws(() => pcEditFromControl(control, "k"), (error) => error.code === PC_EDIT_CODES.INVALID, control);
}

const wizardPlan = {
  ...plan,
  concept: {
    ...plan.concept,
    classPaths: { "Arcane School": "School of Mentalism", "Arcane Thesis": "Staff Nexus" },
    classPathCandidates: { "Arcane School": { packId: "test.pack", _id: "school" }, "Arcane Thesis": { packId: "test.pack", _id: "thesis" } }
  }
};
const bridged = pcEditorSelections(wizardPlan);
assert.equal(bridged["classPath.Arcane School"], "test.pack:school");
assert.equal(bridged["classPath.Arcane Thesis"], "test.pack:thesis");
assert.equal(bridged.classPath, "test.pack:path", "the single alias keeps its own selection");
const pendingBridge = pcEditorSelections({ ...wizardPlan, pending: [{ field: "classPath.Arcane Thesis", reason: "re-pick" }] });
assert.equal(pendingBridge["classPath.Arcane Thesis"], "");
assert.equal(pendingBridge["classPath.Arcane School"], "test.pack:school", "other bridges keep their selection");
assert.equal(Object.keys(pcEditorSelections(plan)).some((name) => name.startsWith("classPath.")), false, "a plan without bridge choices adds no bridge controls");

assert.deepEqual(pcEditorInvalidatedControls([
  { field: "classPath", bridge: "Arcane School", reason: "class changed" },
  { field: "classPath", reason: "class changed" }
]), ["classPath.Arcane School", "classPath"]);

// A school required through the single alias is shown as selected in its own
// Arcane School control: the identity moves a bridge-labelled alias of a
// multi-bridge class into classPaths, which is where the control reads it.
{
  const { resolvePCIdentity, applyPCIdentity } = await import("../scripts/pc-identity.mjs");
  const candidate = (name, id, extra = {}) => ({ name, ref: { packId: "test.pack", _id: id }, uuid: `Compendium.test.pack.Item.${id}`, ...extra });
  const wizard = candidate("Wizard", "wizard");
  const mentalism = candidate("School of Mentalism", "mentalism", { bridge: "Arcane School", classKeys: ["test.pack:wizard"] });
  const staffNexus = candidate("Staff Nexus", "nexus", { bridge: "Arcane Thesis", classKeys: ["test.pack:wizard"] });
  const catalogs = { class: [wizard], classPath: [mentalism, staffNexus] };
  const shown = (concept) => pcEditorSelections({ concept, resolved: { feats: [], equipment: [] }, pending: [] });
  const identity = resolvePCIdentity({ choices: { class: "test.pack:wizard", classPath: "test.pack:mentalism" }, catalogs });
  const selections = shown(applyPCIdentity({}, identity));
  assert.equal(selections["classPath.Arcane School"], "test.pack:mentalism", "the required school is selected in its control");
  assert.equal(selections["classPath.Arcane Thesis"], undefined, "the other bridge has no selection");
  assert.equal(selections.classPath, "", "and no stale single-path selection is left behind");
  // The shape the alias used to leave behind: nothing selected in the bridge control.
  const unnormalized = shown(applyPCIdentity({}, { class: wizard, classPath: mentalism }));
  assert.equal(unnormalized["classPath.Arcane School"], undefined);
}

// The class control offers noncasters and the current class, from real class data
// (Fighter and Rogue cast nothing, Wizard casts). A candidate with no loaded doc is
// excluded unless it is the current class.
{
  const { editableClassCandidates } = await import("../scripts/pc-editor.mjs");
  const { load } = await import("./fixtures/pc-wizard/world.mjs");
  const { pcIdentityKey } = await import("../scripts/pc-identity.mjs");
  const candidate = (name) => ({ name, ref: { packId: "test.classes", _id: name.toLowerCase() } });
  const fighter = candidate("Fighter");
  const rogue = candidate("Rogue");
  const wizard = candidate("Wizard");
  const champion = candidate("Champion");
  const offered = [fighter, rogue, wizard, champion];
  const docs = new Map([
    [pcIdentityKey(fighter), await load("precedent/fighter-class")],
    [pcIdentityKey(rogue), await load("precedent/rogue-class")],
    [pcIdentityKey(wizard), await load("wizard")]
  ]);
  const names = (currentKey) => editableClassCandidates(offered, docs, currentKey).map((item) => item.name);
  assert.deepEqual(names(pcIdentityKey(fighter)), ["Fighter", "Rogue"], "a noncaster current class: the caster is not offered");
  assert.deepEqual(names(pcIdentityKey(wizard)), ["Fighter", "Rogue", "Wizard"], "the current caster stays offered");
  assert.deepEqual(names(pcIdentityKey(champion)), ["Fighter", "Rogue", "Champion"], "the current class is kept even with no doc");
  assert.deepEqual(editableClassCandidates(offered, docs, "").map((item) => item.name), ["Fighter", "Rogue"],
    "a candidate with no doc is excluded");
}

// Archetype ChoiceSet control (Bard muse).
assert.deepEqual(pcEditFromControl("archetypeChoice", " warrior "), { field: "archetypeChoice", value: "warrior" });
assert.throws(() => pcEditFromControl("archetypeChoice", "  "), (error) => error.code === "PC_EDIT_INVALID");
{
  const plan = { concept: { archetypeSpellcasting: { choice: { value: "maestro", options: [] } } }, resolved: { feats: [], equipment: [] }, pending: [] };
  assert.equal(pcEditorSelections(plan).archetypeChoice, "maestro", "the current answer is the control's selection");
  plan.concept.archetypeSpellcasting.choice.value = null;
  assert.equal(pcEditorSelections(plan).archetypeChoice, "", "a missing answer shows the placeholder");
  assert.ok(!("archetypeChoice" in pcEditorSelections({ concept: {}, resolved: { feats: [], equipment: [] }, pending: [] })), "no control without an archetype choice");
}

console.log("pc-editor.test.mjs: ok");
