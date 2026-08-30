// Pure selection-policy checks for choice-set.mjs (no Foundry globals needed).
// Run: node scripts/choice-set.selection.test.mjs
import assert from "node:assert/strict";
import {
  choiceSetOptions, pickChoiceSelection, normalizeChoiceFlag, preselectChoiceSets,
  validateChoicePicks
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

// A predicated option makes the whole group native: its predicate is actor
// context we cannot evaluate before creation.
const MIXED = [
  { value: "gated", label: "Gated", predicate: ["self:class:fighter"] },
  { value: "open", label: "Open" }
];
assert.equal(choiceSetOptions(MIXED), null);
assert.equal(choiceSetOptions([{ value: "only", label: "Only", predicate: ["x"] }]), null,
  "an all-predicated option list fails open");
assert.equal(choiceSetOptions([
  { value: { complex: true }, label: "Complex" }, { value: "simple", label: "Simple" }
]), null, "mixed object/string values stay native rather than forcing the simple option");
assert.equal(choiceSetOptions({ "Compendium.pf2e.feats-srd.Item.abc": "Compendium.pf2e.feats-srd.Item.abc" }), null,
  "UUID values without a human label stay native");

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
  pickChoiceSelection(FIGHTER_SKILL.choices.map((c) => ({ ...c })), { keyAbility: "str" }),
  null
);
// Key ability absent from the options -> fall through.
assert.equal(pickChoiceSelection(ATTRS, { keyAbility: "cha" }), null);

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
  pickChoiceSelection(choiceSetOptions(CLAN_WEAPON.choices), { names: ["Longsword", "Ox"] }),
  null
);

// (3) only legal option.
assert.deepEqual(
  pickChoiceSelection([{ value: "only", label: "Only" }], {}),
  { value: "only", label: "Only", reason: "only" }
);
assert.equal(pickChoiceSelection([], {}), null);

// A broad name must not choose the first of multiple substring matches.
assert.equal(pickChoiceSelection([
  { value: "longsword", label: "Longsword" }, { value: "longbow", label: "Longbow" }
], { names: ["Long"] }), null);

/* ------------------------------------------------------ bounded AI batch */

const NUMBER_CHOICE = {
  key: "ChoiceSet", flag: "number", prompt: "Pick a number",
  choices: [{ value: 1, label: "One" }, { value: 2, label: "Two" }]
};
const staticItem = {
  name: "Static", system: { rules: [
    structuredClone(NUMBER_CHOICE),
    { ...structuredClone(FIGHTER_SKILL), selection: "acrobatics" },
    { ...structuredClone(FIGHTER_SKILL), predicate: ["self:level:1"] },
    { ...structuredClone(FIGHTER_SKILL), allowNoSelection: true },
    { ...structuredClone(FIGHTER_SKILL), allowedDrops: { label: "Drop", predicate: [] } }
  ] }
};
const callbackGranter = {
  name: "Granter", system: { rules: [{ key: "GrantItem", uuid: "Compendium.x.y.Item.granted" }] }
};
const callbackGroups = [];
await preselectChoiceSets(
  [staticItem, callbackGranter], {}, {},
  async () => ({ name: "Granted", system: { rules: [structuredClone(FIGHTER_SKILL)] } }),
  async (groups) => {
    callbackGroups.push(groups);
    assert.equal(groups.length, 2, "only safe ambiguous direct and one-level grant choices are batched");
    assert.notEqual(groups[0].options[0].id, groups[1].options[0].id, "option ids are globally group-scoped");
    return { picks: groups.map((group) => ({ choice: group.id, option: group.options[1].id })) };
  }
);
assert.equal(callbackGroups.length, 1, "all safe static groups use one callback batch");
assert.equal(staticItem.system.rules[0].selection, 2, "opaque option id restores its original number locally");
assert.deepEqual(callbackGranter.system.rules[0].preselectChoices, { fighterSkill: "athletics" });
assert.deepEqual(staticItem.system.rules.slice(1).map((rule) => rule.selection), ["acrobatics", undefined, undefined, undefined],
  "authored, predicated, optional, and drop-zone choices are untouched");

// Exact validator membership rejects cross-group ids, invalid ids, and every
// reply for a duplicated group id, without coercing string ids or values.
const [firstGroup, secondGroup] = callbackGroups[0];
assert.deepEqual(validateChoicePicks(callbackGroups[0], [
  { choice: firstGroup.id, option: secondGroup.options[0].id },
  { choice: "missing", option: firstGroup.options[0].id },
  { choice: firstGroup.id, option: firstGroup.options[0].id },
  { choice: firstGroup.id, option: firstGroup.options[1].id },
  { choice: secondGroup.id, option: 1 },
  { choice: secondGroup.id, option: secondGroup.options[0].id }
]), []);

// No callback means no arbitrary fallback. A sole option remains deterministic
// and therefore does not invoke a callback at all.
const noCallback = { name: "No callback", system: { rules: [structuredClone(NUMBER_CHOICE)] } };
await preselectChoiceSets([noCallback], {}, {}, async () => null, null);
assert.equal(noCallback.system.rules[0].selection, undefined);
let unnecessaryCalls = 0;
const onlyItem = { name: "Only", system: { rules: [{ key: "ChoiceSet", flag: "only", choices: [{ value: "yes", label: "Yes" }] }] } };
await preselectChoiceSets([onlyItem], {}, {}, async () => null, async () => { unnecessaryCalls++; return []; });
assert.equal(onlyItem.system.rules[0].selection, "yes");
assert.equal(unnecessaryCalls, 0, "callback is not called when local certainty resolves every group");

// Existing GrantItem records and malformed duplicate grantee flags are native
// safety boundaries: neither is overwritten or assigned an invented order.
const authoredGrant = { name: "Authored", system: { rules: [{ key: "GrantItem", uuid: "Compendium.x.y.Item.g", preselectChoices: {} }] } };
const duplicateFlagGrant = { name: "Duplicate", system: { rules: [{ key: "GrantItem", uuid: "Compendium.x.y.Item.d" }] } };
let duplicateGroups = 0;
await preselectChoiceSets([authoredGrant, duplicateFlagGrant], {}, {}, async (uuid) => ({ name: uuid, system: { rules: [
  structuredClone(FIGHTER_SKILL), structuredClone(FIGHTER_SKILL)
] } }), async (groups) => { duplicateGroups = groups.length; return { picks: [] }; });
assert.deepEqual(authoredGrant.system.rules[0].preselectChoices, {});
assert.equal(duplicateGroups, 0, "duplicate normalized grant flags remain native without invented precedence");

// A provider/callback failure keeps the original native choice untouched.
const failedChoice = { name: "Failure", system: { rules: [structuredClone(NUMBER_CHOICE)] } };
await preselectChoiceSets([failedChoice], {}, {}, null, async () => { throw new Error("provider unavailable"); });
assert.equal(failedChoice.system.rules[0].selection, undefined);

// Bound the batch, never an individual legal catalog. Overflow must remain
// native instead of becoming a smaller, misleading list of choices.
const makeBatch = (count, options) => Array.from({ length: count }, (_, index) => ({
  name: `Bounded ${index}`, system: { rules: [{ key: "ChoiceSet", flag: "bounded", choices:
    Array.from({ length: options }, (_, value) => ({ value, label: `Option ${value}` }))
  }] }
}));
for (const [count, options, expectedGroups] of [[25, 2, 24], [1, 33, 0], [17, 32, 16]]) {
  const items = makeBatch(count, options);
  let offered = 0;
  await preselectChoiceSets(items, {}, {}, null, async (groups) => {
    offered = groups.length;
    assert.ok(groups.every((group) => group.options.length === options), "a group's complete list is never truncated");
    return groups.map((group) => ({ choice: group.id, option: group.options[0].id }));
  });
  assert.equal(offered, expectedGroups);
  assert.equal(items.filter((item) => item.system.rules[0].selection === 0).length, expectedGroups,
    "only offered groups are selected; every overflow choice remains native");
}

/* ------------------------------------------------------------------ flags */

assert.equal(normalizeChoiceFlag("fighterSkill"), "fighterSkill");
assert.equal(normalizeChoiceFlag("weird_flag.name"), "weirdflagname", "mirrors pf2e's /[^-a-z0-9]/gi strip");
assert.equal(normalizeChoiceFlag(""), null);
assert.equal(normalizeChoiceFlag(undefined), null);

console.log("choice-set selection policy: all checks passed");
