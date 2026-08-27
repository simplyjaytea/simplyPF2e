// Pure selection-policy checks for choice-set.mjs (no Foundry globals needed).
// Run: node scripts/choice-set.selection.test.mjs
import assert from "node:assert/strict";
import {
  choiceSetOptions, pickChoiceSelection, applyChoiceSelections,
  applyGrantPreselections, normalizeChoiceFlag
} from "./choice-set.mjs";

/* ---------------------------------------------------------------- options */

// Real Fighter class rule (packs/classes/fighter.json).
const FIGHTER_SKILL = {
  key: "ChoiceSet",
  flag: "fighterSkill",
  adjustName: false,
  prompt: "PF2E.SpecificRule.Prompt.Skill",
  choices: [
    { label: "PF2E.Skill.Acrobatics", value: "acrobatics" },
    { label: "PF2E.Skill.Athletics", value: "athletics" }
  ]
};

// Real Clan Dagger ancestry-feature rule (packs/ancestryfeatures/clan-dagger.json).
const CLAN_WEAPON = {
  key: "ChoiceSet",
  flag: "clanWeapon",
  label: "PF2E.SpecificRule.ClanWeapon.Label",
  allowedDrops: { label: "level-0 dwarf weapon", predicate: ["item:level:0"] },
  choices: [
    { label: "PF2E.Weapon.Base.clan-dagger", value: "clan-dagger" },
    { label: "PF2E.SpecificRule.ClanWeapon.ClanPistol", value: "clan-pistol" }
  ]
};

assert.deepEqual(
  choiceSetOptions(FIGHTER_SKILL.choices).map((o) => o.value),
  ["acrobatics", "athletics"]
);

// CONFIG.PF2E dot path: value is the KEY (pf2e processChoicesFromData).
const CONFIG_STUB = { PF2E: { attributes: { str: "Strength", dex: "Dexterity", con: "Constitution" } } };
assert.deepEqual(
  choiceSetOptions("attributes", CONFIG_STUB.PF2E).map((o) => o.value),
  ["str", "dex", "con"]
);
assert.deepEqual(
  choiceSetOptions({ config: "attributes" }, CONFIG_STUB.PF2E).map((o) => o.value),
  ["str", "dex", "con"]
);

// Fail open: shapes that need a live actor/compendium sweep yield null.
assert.equal(choiceSetOptions({ filter: ["item:type:feat"], itemType: "feat" }), null, "compendium query fails open");
assert.equal(choiceSetOptions({ ownedItems: true, types: ["weapon"] }), null, "owned-item query fails open");
assert.equal(choiceSetOptions({ attacks: true }), null, "attack query fails open");
assert.equal(choiceSetOptions({ query: "{}" }), null, "removed query form fails open");
assert.equal(choiceSetOptions("nope.not.here", CONFIG_STUB.PF2E), null, "missing config path fails open");
assert.equal(choiceSetOptions({ config: "attributes", predicate: ["x"] }, CONFIG_STUB.PF2E), null,
  "a top-level option predicate fails open");

// Predicated individual options are dropped, not picked.
const MIXED = [
  { value: "gated", label: "Gated", predicate: ["self:class:fighter"] },
  { value: "open", label: "Open" }
];
assert.deepEqual(choiceSetOptions(MIXED).map((o) => o.value), ["open"]);
assert.equal(choiceSetOptions([{ value: "only", label: "Only", predicate: ["x"] }]), null,
  "an all-predicated option list fails open");

/* ------------------------------------------------------------ policy: 1/2/3 */

const ATTRS = [
  { value: "str", label: "Strength" },
  { value: "dex", label: "Dexterity" },
  { value: "con", label: "Constitution" }
];

// (1) key attribute wins over everything, even a concept name match.
assert.deepEqual(
  pickChoiceSelection(ATTRS, { keyAbility: "dex", names: ["Strength"] }),
  { value: "dex", label: "Dexterity", reason: "key-attribute" }
);
// Not an attribute option set -> rule 1 does not fire.
assert.equal(
  pickChoiceSelection(FIGHTER_SKILL.choices.map((c) => ({ ...c })), { keyAbility: "str" }).reason,
  "first"
);
// Key ability absent from the options -> fall through.
assert.equal(pickChoiceSelection(ATTRS, { keyAbility: "cha" }).reason, "first");

// (2) concept match — the AI already gave this dwarf a clan pistol.
assert.deepEqual(
  pickChoiceSelection(choiceSetOptions(CLAN_WEAPON.choices), { names: ["Clan Pistol", "Chain Mail"] }),
  { value: "clan-pistol", label: "PF2E.SpecificRule.ClanWeapon.ClanPistol", reason: "concept" }
);
// Matching on the i18n label's tail segment, not just the value.
assert.equal(
  pickChoiceSelection(choiceSetOptions(FIGHTER_SKILL.choices), { names: ["Athletics"] }).value,
  "athletics"
);
// Unrelated concept names must not fuzzy-match into a pick.
assert.equal(
  pickChoiceSelection(choiceSetOptions(CLAN_WEAPON.choices), { names: ["Longsword", "Ox"] }).reason,
  "first"
);

// (3) deterministic first option.
assert.deepEqual(
  pickChoiceSelection(choiceSetOptions(CLAN_WEAPON.choices), {}),
  { value: "clan-dagger", label: "PF2E.Weapon.Base.clan-dagger", reason: "first" }
);
assert.equal(pickChoiceSelection([], {}), null);

/* --------------------------------------------------------- applied in place */

const classItem = { name: "Fighter", system: { rules: [structuredClone(FIGHTER_SKILL), { key: "ActiveEffectLike" }] } };
const report = applyChoiceSelections(classItem, { keyAbility: "str", names: ["Athletics"] });
assert.equal(classItem.system.rules[0].selection, "athletics", "selection written onto the rule source");
assert.deepEqual(report.map((r) => [r.item, r.flag, r.reason]), [["Fighter", "fighterSkill", "concept"]]);

// An existing selection is never overwritten, and a rule-level predicate fails open.
const preAnswered = { name: "X", system: { rules: [{ ...structuredClone(FIGHTER_SKILL), selection: "acrobatics" }] } };
assert.deepEqual(applyChoiceSelections(preAnswered, {}), []);
const predicated = { name: "Y", system: { rules: [{ ...structuredClone(FIGHTER_SKILL), predicate: ["self:level:1"] }] } };
assert.deepEqual(applyChoiceSelections(predicated, {}), []);
assert.equal(predicated.system.rules[0].selection, undefined);

/* ------------------------------------------------- GrantItem preselection */

const GRANTED = {
  name: "Clan Dagger",
  system: { rules: [structuredClone(CLAN_WEAPON)] }
};
const granter = {
  name: "Dwarf",
  system: { rules: [{ key: "GrantItem", uuid: "Compendium.pf2e.ancestryfeatures.Item.Clan Dagger" }] }
};
const grantReport = await applyGrantPreselections(granter, async () => structuredClone(GRANTED), { names: ["Clan Pistol"] });
assert.deepEqual(granter.system.rules[0].preselectChoices, { clanWeapon: "clan-pistol" });
assert.equal(grantReport[0].reason, "concept");

// No explicit flag on the grantee's ChoiceSet -> fail open (pf2e derives the
// flag with its own sluggify; we refuse to re-guess it).
const unflagged = { name: "Z", system: { rules: [{ key: "GrantItem", uuid: "Compendium.x.y.Item.z" }] } };
await applyGrantPreselections(unflagged, async () => ({ name: "G", system: { rules: [{ key: "ChoiceSet", choices: CLAN_WEAPON.choices }] } }), {});
assert.equal(unflagged.system.rules[0].preselectChoices, undefined);

// An injected-property UUID, a predicated grant, and a failed fetch all fail open.
for (const rule of [
  { key: "GrantItem", uuid: "{item|flags.pf2e.rulesSelections.clanWeapon}" },
  { key: "GrantItem", uuid: "Compendium.x.y.Item.z", predicate: ["clan-dagger"] }
]) {
  const item = { name: "Q", system: { rules: [rule] } };
  await applyGrantPreselections(item, async () => structuredClone(GRANTED), {});
  assert.equal(item.system.rules[0].preselectChoices, undefined);
}
const thrower = { name: "Q", system: { rules: [{ key: "GrantItem", uuid: "Compendium.x.y.Item.z" }] } };
await applyGrantPreselections(thrower, async () => { throw new Error("offline"); }, {});
assert.equal(thrower.system.rules[0].preselectChoices, undefined);

/* ------------------------------------------------------------------ flags */

assert.equal(normalizeChoiceFlag("fighterSkill"), "fighterSkill");
assert.equal(normalizeChoiceFlag("weird_flag.name"), "weirdflagname", "mirrors pf2e's /[^-a-z0-9]/gi strip");
assert.equal(normalizeChoiceFlag(""), null);
assert.equal(normalizeChoiceFlag(undefined), null);

console.log("choice-set selection policy: all checks passed");
