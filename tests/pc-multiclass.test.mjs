import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MULTICLASS_PACKAGES, MULTICLASS_UNAVAILABLE, multiclassBlockers,
  multiclassCatalogNames, multiclassFeatInfo, multiclassPickBlocker
} from "../scripts/pc-multiclass.mjs";

const CLASS = "Wizard";

test("catalog names are unique and include every package dedication and feat", () => {
  const names = multiclassCatalogNames();
  assert.equal(new Set(names).size, names.length);
  for (const pkg of MULTICLASS_PACKAGES) {
    assert.ok(names.includes(pkg.dedication));
    for (const feat of pkg.feats) assert.ok(names.includes(feat.name));
  }
});

test("unavailable list excludes every caster-capable package dedication", () => {
  const names = MULTICLASS_UNAVAILABLE.map((entry) => entry.name);
  assert.ok(names.includes("Rogue Dedication"));
  for (const entry of MULTICLASS_UNAVAILABLE) assert.ok(entry.reason.length > 0, entry.name);
  for (const pkg of MULTICLASS_PACKAGES) assert.ok(!names.includes(pkg.dedication));
});

test("feat info resolves by slug and rejects unknown names", () => {
  assert.equal(multiclassFeatInfo("fighter dedication")?.role, "dedication");
  assert.equal(multiclassFeatInfo("Advanced Fury")?.pkg, "barbarian");
  assert.equal(multiclassFeatInfo("Fireball"), null);
  assert.equal(multiclassFeatInfo(null), null);
});

test("a dedication cannot be the PC's own class", () => {
  const reason = multiclassPickBlocker([], "Fighter Dedication", "Fighter");
  assert.match(reason, /own class/);
  assert.equal(multiclassPickBlocker([], "Fighter Dedication", CLASS), null);
});

test("package feats need their dedication held first", () => {
  assert.match(multiclassPickBlocker([], "Basic Maneuver", CLASS), /Fighter Dedication/);
  assert.equal(multiclassPickBlocker(["Fighter Dedication"], "Basic Maneuver", CLASS), null);
});

test("a second dedication needs two more feats from the current package", () => {
  const held = ["Fighter Dedication"];
  assert.match(multiclassPickBlocker(held, "Investigator Dedication", CLASS), /two more feats/);
  held.push("Basic Maneuver");
  assert.match(multiclassPickBlocker(held, "Investigator Dedication", CLASS), /two more feats/);
  held.push("Reactive Striker");
  assert.equal(multiclassPickBlocker(held, "Investigator Dedication", CLASS), null);
});

test("a dedication cannot be taken twice", () => {
  const held = ["Fighter Dedication", "Basic Maneuver", "Reactive Striker"];
  assert.match(multiclassPickBlocker(held, "Fighter Dedication", CLASS), /already held/);
});

test("requires-by-name is enforced for package feats", () => {
  const held = ["Barbarian Dedication", "Basic Fury"];
  assert.equal(multiclassPickBlocker(held, "Advanced Fury", CLASS), null);
  assert.match(multiclassPickBlocker(["Barbarian Dedication"], "Advanced Fury", CLASS), /Basic Fury/);
});

test("blocked picks are not counted as held for dependents", () => {
  const blockers = multiclassBlockers(["Barbarian Dedication", null, "Advanced Fury"], CLASS);
  assert.deepEqual(blockers.map((entry) => entry.index), [2]);
});

test("dropping a dedication invalidates its later feats", () => {
  const blockers = multiclassBlockers([null, "Basic Maneuver", "Reactive Striker"], CLASS);
  assert.deepEqual(blockers.map((entry) => entry.index), [1, 2]);
});

test("non-catalog names are ignored by the lock", () => {
  assert.deepEqual(multiclassBlockers(["Toughness", null, "Fighter Dedication"], CLASS), []);
});
