// PC editor form contract (C06): control names map to pc-edit.mjs edits,
// empty placeholders are refused except for the nullable "none" choices, and
// selections report pending choices as empty so stale values are never shown.

import assert from "node:assert/strict";

const { pcEditFromControl, pcEditorSelections, pcEditorInvalidatedControls } = await import("./pc-editor.mjs");
const { PC_EDIT_CODES } = await import("./pc-edit.mjs");

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

console.log("pc-editor.test.mjs: ok");
