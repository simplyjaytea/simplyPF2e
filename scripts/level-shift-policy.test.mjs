import assert from "node:assert/strict";
import test from "node:test";
import { AC, HP, PERCEPTION_AND_SAVES, SKILL, SPELL_DC, STRIKE_ATTACK, STRIKE_DAMAGE } from "./tables.mjs";
import {
  LEVEL_SHIFT_CODES, buildShiftedActorData, describeLevelShift, planLevelShift, verifyShiftedActorData
} from "./level-shift-policy.mjs";

/** Source at `level` whose stored values sit exactly on the high column (zero residual). */
function martial(level = 5, overrides = {}) {
  const at = (table, column) => table[column][level + 1];
  const source = {
    _id: "SRC000000000000A",
    name: "Brute",
    type: "npc",
    img: "icons/brute.png",
    ownership: { default: 0 },
    folder: null,
    items: [
      {
        _id: "MEL000000000000A",
        name: "Fist",
        type: "melee",
        system: {
          bonus: { value: at(STRIKE_ATTACK, "high") },
          damageRolls: { r1: { damage: at(STRIKE_DAMAGE, "high"), damageType: "bludgeoning" } }
        }
      },
      { _id: "EQP000000000000A", name: "Rope", type: "equipment", system: { quantity: 1 } }
    ],
    system: {
      details: { level: { value: level }, publicNotes: "<p>Original notes.</p>" },
      attributes: {
        ac: { value: at(AC, "high") },
        hp: { value: at(HP, "high"), max: at(HP, "high") },
        adjustment: null
      },
      saves: {
        fortitude: { value: at(PERCEPTION_AND_SAVES, "high") },
        reflex: { value: at(PERCEPTION_AND_SAVES, "high") },
        will: { value: at(PERCEPTION_AND_SAVES, "high") }
      },
      perception: { mod: at(PERCEPTION_AND_SAVES, "high") },
      skills: { athletics: { base: at(SKILL, "high") } },
      abilities: { str: { mod: 4 } },
      traits: { value: ["humanoid"] },
      otherSegments: []
    }
  };
  return Object.assign(source, overrides);
}

const find = (plan, path) => plan.changes.find((entry) => entry.path.join(".") === path);
const codesOf = (plan) => plan.problems.map((p) => p.code);

test("round trip: Level 5 to 6 shifts stored values by the table delta", () => {
  const plan = planLevelShift(martial(5), 6);
  assert.equal(plan.ok, true, JSON.stringify(plan.problems));
  assert.equal(find(plan, "system.attributes.ac.value").after, AC.high[7]);
  assert.equal(find(plan, "system.perception.mod").after, PERCEPTION_AND_SAVES.high[7]);
  assert.equal(find(plan, "items.0.system.bonus.value").after, STRIKE_ATTACK.high[7]);
  assert.equal(find(plan, "system.attributes.hp.max").after, HP.high[7]);
  assert.equal(find(plan, "system.details.level.value").after, 6);
  assert.equal(find(plan, "items.0.system.damageRolls.r1.damage").after, STRIKE_DAMAGE.high[7]);
});

test("range and shift limits reject without a plan", () => {
  assert.ok(codesOf(planLevelShift(martial(-2), -1)).includes(LEVEL_SHIFT_CODES.LEVEL_OUT_OF_RANGE));
  assert.ok(codesOf(planLevelShift(martial(23), 25)).includes(LEVEL_SHIFT_CODES.LEVEL_OUT_OF_RANGE));
  assert.ok(codesOf(planLevelShift(martial(5), 8)).includes(LEVEL_SHIFT_CODES.SHIFT_TOO_LARGE));
  assert.ok(codesOf(planLevelShift(martial(5), 5)).includes(LEVEL_SHIFT_CODES.NOT_A_SHIFT));
  assert.equal(planLevelShift(martial(5), 6).ok, true);
});

test("adjusted, segmented, non-NPC, and Strike-less sources are rejected", () => {
  const base = martial();
  assert.ok(codesOf(planLevelShift(martial(5, { system: { ...base.system, attributes: { ...base.system.attributes, adjustment: "elite" } } }), 6)).includes(LEVEL_SHIFT_CODES.SOURCE_ADJUSTED));
  assert.ok(codesOf(planLevelShift(martial(5, { system: { ...base.system, otherSegments: [{ id: 1 }] } }), 6)).includes(LEVEL_SHIFT_CODES.SEGMENTED_UNSUPPORTED));
  assert.ok(codesOf(planLevelShift({ ...martial(), type: "character" }, 6)).includes(LEVEL_SHIFT_CODES.NOT_NPC));
  const noStrike = martial();
  noStrike.items = noStrike.items.filter((item) => item.type !== "melee");
  assert.ok(codesOf(planLevelShift(noStrike, 6)).includes(LEVEL_SHIFT_CODES.NO_STRIKE));
});

test("extreme Strike role maps HP to the high HP column explicitly", () => {
  const source = martial(5);
  source.items[0].system.bonus.value = STRIKE_ATTACK.extreme[6];
  const plan = planLevelShift(source, 6);
  assert.equal(plan.ok, true, JSON.stringify(plan.problems));
  assert.equal(find(plan, "system.attributes.hp.max").column, "high");
});

test("spell DC far from every column is unclassified, not borrowed from a fallback", () => {
  const source = martial(5);
  source.items.push({
    _id: "ENT000000000000A", name: "Spells", type: "spellcastingEntry",
    system: { spelldc: { dc: 5, value: SPELL_DC.high[6] }, prepared: { value: "prepared" } }
  });
  const plan = planLevelShift(source, 6);
  assert.ok(codesOf(plan).includes(LEVEL_SHIFT_CODES.SPELL_ROLE_UNCLASSIFIED));
});

test("caster rules: damaging spells rejected, over-cap rank rejected, innate exempt, level 0 rejected", () => {
  const withSpell = (spell, entryMode = "prepared", level = 5) => {
    const source = martial(level);
    source.items.push({
      _id: "ENT000000000000A", name: "Spells", type: "spellcastingEntry",
      system: { spelldc: { dc: SPELL_DC.high[level + 1], value: 0 }, prepared: { value: entryMode } }
    });
    source.items.push({ _id: "SPL000000000000A", name: "Spell", type: "spell", system: { location: { value: "ENT000000000000A" }, ...spell } });
    return source;
  };
  assert.ok(codesOf(planLevelShift(withSpell({ damage: { a: {} }, level: { value: 1 } }), 6)).includes(LEVEL_SHIFT_CODES.CASTER_DAMAGE_SPELL_UNSUPPORTED));
  assert.ok(codesOf(planLevelShift(withSpell({ damage: {}, level: { value: 5 } }), 6)).includes(LEVEL_SHIFT_CODES.CASTER_RANK_OVER_CAP));
  assert.ok(!codesOf(planLevelShift(withSpell({ damage: {}, level: { value: 5 } }, "innate"), 6)).includes(LEVEL_SHIFT_CODES.CASTER_RANK_OVER_CAP));
  assert.ok(codesOf(planLevelShift(withSpell({ damage: {}, level: { value: 0 } }, "prepared", 1), 0)).includes(LEVEL_SHIFT_CODES.CASTER_LEVEL_UNSUPPORTED));
});

test("non-table damage string shifts its flat modifier, and round-trips back", () => {
  const source = martial(5);
  source.items[0].system.damageRolls.r1.damage = "2d8+6";
  const up = planLevelShift(source, 6);
  assert.equal(up.ok, true, JSON.stringify(up.problems));
  assert.equal(find(up, "items.0.system.damageRolls.r1.damage").after, "2d8+8");
  const shifted = buildShiftedActorData(source, up);
  assert.equal(shifted.items[0].system.damageRolls.r1.damage, "2d8+8");
  const down = planLevelShift({ ...shifted, _id: "X" }, 5);
  assert.equal(down.ok, true, JSON.stringify(down.problems));
  assert.equal(find(down, "items.0.system.damageRolls.r1.damage").after, "2d8+6");
});

test("exclusions and the source are unchanged after build and verify", () => {
  const source = martial(5);
  const before = JSON.stringify(source);
  const plan = planLevelShift(source, 6);
  const shifted = buildShiftedActorData(source, plan);
  assert.equal(JSON.stringify(source), before, "source must not be mutated");
  assert.equal(shifted.system.abilities.str.mod, 4);
  assert.deepEqual(shifted.system.traits, source.system.traits);
  assert.equal(shifted.items[1].name, "Rope");
  assert.deepEqual(verifyShiftedActorData(source, shifted, plan), []);
});

test("clone: name, adjustment, hp.value, id stripped, and publicNotes prefix", () => {
  const source = martial(5);
  const plan = planLevelShift(source, 6);
  const shifted = buildShiftedActorData(source, plan);
  assert.equal(shifted.name, "Brute (Level 6)");
  assert.equal(shifted.system.attributes.adjustment, null);
  assert.equal(shifted.system.attributes.hp.value, shifted.system.attributes.hp.max);
  assert.equal("_id" in shifted, false);
  assert.ok(shifted.system.details.publicNotes.startsWith("<p>Original notes.</p>"));
  assert.ok(shifted.system.details.publicNotes.includes("Level-shifted from Brute"));
});

test("verify catches tampering with an excluded field and a wrong changed value", () => {
  const source = martial(5);
  const plan = planLevelShift(source, 6);
  const tampered = buildShiftedActorData(source, plan);
  tampered.system.abilities.str.mod = 9;
  assert.ok(verifyShiftedActorData(source, tampered, plan).some((p) => p.includes("exclusions")));
  const wrong = buildShiftedActorData(source, plan);
  wrong.system.attributes.ac.value += 1;
  assert.ok(verifyShiftedActorData(source, wrong, plan).some((p) => p.startsWith("system.attributes.ac.value")));
});

test("describe returns rows, problems, and exclusions without mutation", () => {
  const view = describeLevelShift(planLevelShift(martial(5), 6));
  assert.equal(view.source.delta, 1);
  assert.ok(view.rows.length > 0);
  assert.equal(view.derived.hpMax, HP.high[7]);
  assert.ok(view.exclusions.length > 0);
});
