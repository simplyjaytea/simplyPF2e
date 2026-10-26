import assert from "node:assert/strict";
import test from "node:test";
import {
  HAZARD_DISABLE_SKILLS, HazardConceptError, buildHazardSource, describeHazard, hazardProseProblem, normalizeHazardConcept
} from "../scripts/hazard-builder.mjs";

// The table functions are passed in through the tables override, so these tests never
// depend on scripts/hazard-tables.mjs. Every expected number below is worked out from
// these fixed values at level 2.
const LEVEL = 2;
const CATALOG = Object.freeze({ traitsCatalog: ["mechanical", "trap"], damageTypes: ["piercing", "slashing"] });

function pickScale(map, scale) {
  if (!(scale in map)) throw new Error("unknown scale " + scale);
  return map[scale];
}

const FAKE = Object.freeze({
  hazardDC: (level, scale) => pickScale({ low: 16, high: 20, extreme: 24 }, scale) + level,
  hazardProficiency: () => "trained",
  hazardAC: (level, scale) => pickScale({ low: 14, high: 17, extreme: 20 }, scale) + level,
  hazardSave: (level, scale) => pickScale({ low: 4, high: 8, extreme: 12 }, scale) + level,
  hazardHardness: (level) => 5 + level,
  hazardHP: (level) => 20 + 2 * level,
  hazardAttack: (level, kind) => (kind === "complex" ? 12 : 9) + level,
  hazardDamage: (level, kind) => (kind === "complex" ? { formula: "2d10+5", average: 16 } : { formula: "2d6+6", average: 13 }),
  hazardSaveDC: (level, scale) => pickScale({ high: 18, extreme: 22 }, scale) + level
});

function raw(overrides = {}) {
  return {
    name: "Spear Launcher",
    description: "A wall socket loaded with a spear connects to a floor tile.",
    traits: ["mechanical", "trap"],
    rarity: "common",
    complex: false,
    stealth: "high",
    disable: [{ skill: "thievery", scale: "high" }],
    dispel: false,
    ac: "high",
    saves: { fortitude: "high", reflex: "low", will: null },
    hasHP: true,
    reaction: {
      name: "Spear",
      trigger: "Pressure is applied to the floor tile.",
      effect: "The trap shoots a spear, making a Strike against the creature on the tile.",
      strike: { name: "Spear", damageType: "piercing" },
      save: null
    },
    routine: null,
    reset: "",
    ...overrides
  };
}

const norm = (overrides = {}, level = LEVEL) => normalizeHazardConcept(raw(overrides), { level, ...CATALOG });

/** Runs fn and returns its value with every console.warn message it emitted. */
function warnings(fn) {
  const seen = [];
  const original = console.warn;
  console.warn = (message) => seen.push(String(message));
  try {
    return { value: fn(), seen };
  } finally {
    console.warn = original;
  }
}

const codeOf = (fn) => {
  try {
    fn();
  } catch (error) {
    return error instanceof HazardConceptError ? error.code : "OTHER:" + error.message;
  }
  return "NO_THROW";
};

test("the disable skill list matches the WP5 contract exactly", () => {
  assert.deepEqual([...HAZARD_DISABLE_SKILLS], [
    "thievery", "athletics", "acrobatics", "arcana", "crafting", "deception", "diplomacy",
    "intimidation", "nature", "occultism", "performance", "religion", "survival"
  ]);
  assert.equal(Object.isFrozen(HAZARD_DISABLE_SKILLS), true);
});

test("a valid concept normalizes with no warnings and is frozen", () => {
  const { value, seen } = warnings(() => norm());
  assert.equal(seen.length, 0);
  assert.equal(value.name, "Spear Launcher");
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.reaction), true);
});

test("a missing name throws MISSING_NAME", () => {
  assert.equal(codeOf(() => norm({ name: "   " })), "MISSING_NAME");
});

test("enricher syntax in the description throws ENRICHER_IN_TEXT", () => {
  assert.equal(codeOf(() => norm({ description: "Trapped @Damage[2d6[piercing]] pit" })), "ENRICHER_IN_TEXT");
});

test("enricher syntax in a reaction trigger throws ENRICHER_IN_TEXT", () => {
  const trigger = "A creature steps on @UUID[Compendium.pf2e.actionspf2e.Item.Grab an Edge]";
  assert.equal(codeOf(() => norm({ reaction: { ...raw().reaction, trigger } })), "ENRICHER_IN_TEXT");
});

test("a game number in prose throws NUMBER_IN_TEXT", () => {
  const effect = "The trap deals 2d6 damage to the creature on the tile.";
  assert.equal(codeOf(() => norm({ reaction: { ...raw().reaction, effect } })), "NUMBER_IN_TEXT");
});

test("unknown traits are dropped with a warning", () => {
  const { value, seen } = warnings(() => norm({ traits: ["mechanical", "made-up"] }));
  assert.deepEqual(value.traits, ["mechanical"]);
  assert.equal(seen.length, 1);
});

test("an invalid rarity becomes common with a warning", () => {
  const { value, seen } = warnings(() => norm({ rarity: "legendary" }));
  assert.equal(value.rarity, "common");
  assert.equal(seen.length, 1);
});

test("an unknown AC scale becomes null with a warning", () => {
  const { value, seen } = warnings(() => norm({ ac: "moderate" }));
  assert.equal(value.ac, null);
  assert.equal(seen.length, 1);
});

test("a disable entry with a skill outside the list is dropped with a warning", () => {
  const disable = [{ skill: "stealth", scale: "high" }, { skill: "thievery", scale: "high" }];
  const { value, seen } = warnings(() => norm({ disable }));
  assert.deepEqual(value.disable, [{ skill: "thievery", scale: "high" }]);
  assert.equal(seen.length, 1);
});

test("a disable entry with an unknown scale is dropped with a warning", () => {
  const { value, seen } = warnings(() => norm({ disable: [{ skill: "thievery", scale: "moderate" }, { skill: "thievery", scale: "low" }] }));
  assert.deepEqual(value.disable, [{ skill: "thievery", scale: "low" }]);
  assert.equal(seen.length, 1);
});

test("no disable check and no dispel throws NO_DISABLE", () => {
  assert.equal(codeOf(() => norm({ disable: [], dispel: false })), "NO_DISABLE");
});

test("Dispel Magic alone satisfies the disable requirement", () => {
  assert.equal(norm({ disable: [], dispel: true }).dispel, true);
});

test("a non-boolean dispel is dropped to false with a warning, and the rank is never read from it", () => {
  for (const dispel of [{ rank: 3 }, "yes", 3]) {
    const { value, seen } = warnings(() => norm({ dispel }));
    assert.equal(value.dispel, false);
    assert.equal(seen.length, 1);
  }
  assert.equal(codeOf(() => norm({ disable: [], dispel: { rank: 3 } })), "NO_DISABLE");
});

test("a strike with a damage type outside the catalog is dropped with a warning", () => {
  const strike = { name: "Spear", damageType: "fire" };
  const { value, seen } = warnings(() => norm({ reaction: { ...raw().reaction, strike } }));
  assert.equal(value.reaction.strike, null);
  assert.equal(seen.length, 1);
});

test("a save with an unknown type is dropped with a warning", () => {
  const save = { type: "fort", scale: "high", effect: "Creatures are hit." };
  const { value, seen } = warnings(() => norm({ reaction: { ...raw().reaction, save } }));
  assert.equal(value.reaction.save, null);
  assert.equal(seen.length, 1);
});

test("a save scale below high is dropped with a warning", () => {
  const save = { type: "reflex", scale: "low", effect: "Creatures are hit." };
  const { value, seen } = warnings(() => norm({ reaction: { ...raw().reaction, save } }));
  assert.equal(value.reaction.save, null);
  assert.equal(seen.length, 1);
});

test("a routine on a simple hazard is dropped with a warning", () => {
  const routine = { actions: 2, text: "The spear reloads.", strike: null };
  const { value, seen } = warnings(() => norm({ routine }));
  assert.equal(value.routine, null);
  assert.equal(seen.length, 1);
});

test("a complex hazard without a routine throws ROUTINE_REQUIRED", () => {
  assert.equal(codeOf(() => norm({ complex: true, routine: null })), "ROUTINE_REQUIRED");
});

test("routine actions outside 1 to 3 throw BAD_ROUTINE_ACTIONS", () => {
  const routine = { actions: 4, text: "The blade spins.", strike: null };
  assert.equal(codeOf(() => norm({ complex: true, routine })), "BAD_ROUTINE_ACTIONS");
});

test("a complex hazard keeps only its routine strike and drops the reaction strike", () => {
  const routine = { actions: 3, text: "The blade spins.", strike: { name: "Spinning Blade", damageType: "slashing" } };
  const { value, seen } = warnings(() => norm({ complex: true, routine }));
  assert.equal(value.reaction.strike, null);
  assert.equal(value.routine.strike.name, "Spinning Blade");
  assert.equal(seen.length, 1);
});

test("a level outside -1 to 24 throws BAD_LEVEL", () => {
  assert.equal(codeOf(() => norm({}, 25)), "BAD_LEVEL");
});

test("a simple hazard with a strike and a save builds the exact disable, stealth, AC, save and HP numbers", async () => {
  const reaction = {
    ...raw().reaction,
    trigger: "A creature <that is hidden steps on the tile.",
    save: { type: "reflex", scale: "high", effect: "Creatures beside the tile are hit." }
  };
  const concept = norm({ reaction });
  const { actor, items } = await buildHazardSource(concept, { level: LEVEL, tables: FAKE });
  assert.equal(actor.name, "Spear Launcher");
  assert.equal(actor.type, "hazard");
  assert.equal(actor.system.details.disable, "<p>@Check[thievery|dc:22|name:Disable Spear Launcher|traits:action:disable-a-device] (trained)</p>");
  assert.equal(actor.system.attributes.stealth.value, 12);
  assert.equal(actor.system.attributes.stealth.details, "<p>(trained)</p>");
  assert.equal(actor.system.attributes.ac.value, 19);
  assert.deepEqual(actor.system.attributes.hp, { value: 24, max: 24, temp: 0, details: "" });
  assert.equal(actor.system.attributes.hardness, 7);
  assert.deepEqual(actor.system.saves, { fortitude: { value: 10 }, reflex: { value: 6 }, will: { value: null } });
  assert.equal(items[0].system.description.value,
    "<p><strong>Trigger</strong> A creature &lt;that is hidden steps on the tile.</p>"
    + "<p>The trap shoots a spear, making a Strike against the creature on the tile.</p>"
    + "<p>@Check[reflex|dc:20] Creatures beside the tile are hit.</p>");
});

test("a simple hazard emits a reaction action with the attack trait and a melee strike", async () => {
  const { items } = await buildHazardSource(norm(), { level: LEVEL, tables: FAKE });
  assert.deepEqual(items.map((item) => item.type), ["action", "melee"]);
  assert.equal(items[0].name, "Spear");
  assert.equal(items[0].system.actionType.value, "reaction");
  assert.deepEqual(items[0].system.traits.value, ["attack"]);
  assert.equal(items[1].name, "Spear");
  assert.equal(items[1].system.bonus.value, 11);
  const rolls = Object.values(items[1].system.damageRolls);
  assert.deepEqual(rolls.map((roll) => [roll.damage, roll.damageType]), [["2d6+6", "piercing"]]);
  assert.match(Object.keys(items[1].system.damageRolls)[0], /^[A-Za-z0-9]{16}$/);
});

test("the built source writes no Rule Elements and no derived keys", async () => {
  const { actor, items } = await buildHazardSource(norm(), { level: LEVEL, tables: FAKE });
  assert.equal(items.every((item) => !("rules" in item.system)), true);
  for (const key of ["brokenThreshold", "hasHealth", "initiative", "actions", "skills"]) {
    assert.equal(key in actor.system, false, key);
    assert.equal(key in actor.system.attributes, false, key);
  }
});

test("a complex hazard keeps the routine text in details and emits only the reaction action and a complex-kind strike", async () => {
  const routine = { actions: 3, text: "The blade spins toward each adjacent creature.", strike: { name: "Spinning Blade", damageType: "slashing" } };
  const concept = norm({ complex: true, routine, reaction: { ...raw().reaction, strike: null } });
  const { actor, items } = await buildHazardSource(concept, { level: LEVEL, tables: FAKE });
  assert.deepEqual(items.map((item) => [item.type, item.name]), [["action", "Spear"], ["melee", "Spinning Blade"]]);
  assert.equal(items.some((item) => item.name === "Routine"), false, "no synthetic Routine item is published");
  assert.equal(items[0].system.actionType.value, "reaction");
  assert.deepEqual(items[0].system.traits.value, []);
  assert.equal(items[1].system.bonus.value, 14);
  const [roll] = Object.values(items[1].system.damageRolls);
  assert.deepEqual([roll.damage, roll.damageType], ["2d10+5", "slashing"]);
  assert.equal(actor.system.details.isComplex, true);
  assert.equal(actor.system.details.routine, "<p>(3 actions) The blade spins toward each adjacent creature.</p>");
});

test("a complex hazard with no strike emits only the reaction action and still keeps the routine text", async () => {
  const routine = { actions: 2, text: "The vents breathe out smoke.", strike: null };
  const { actor, items } = await buildHazardSource(norm({ complex: true, routine, reaction: { ...raw().reaction, strike: null } }), { level: LEVEL, tables: FAKE });
  assert.deepEqual(items.map((item) => item.type), ["action"]);
  assert.equal(actor.system.details.routine, "<p>(2 actions) The vents breathe out smoke.</p>");
});

test("a hazard without HP has zero HP and zero hardness", async () => {
  const { actor } = await buildHazardSource(norm({ hasHP: false }), { level: LEVEL, tables: FAKE });
  assert.deepEqual(actor.system.attributes.hp, { value: 0, max: 0, temp: 0, details: "" });
  assert.equal(actor.system.attributes.hardness, 0);
});

test("a hazard without stealth has null stealth value and empty details", async () => {
  const { actor } = await buildHazardSource(norm({ stealth: null }), { level: LEVEL, tables: FAKE });
  assert.equal(actor.system.attributes.stealth.value, null);
  assert.equal(actor.system.attributes.stealth.details, "");
});

test("a null AC scale writes the LOW column of the AC table", async () => {
  const { actor } = await buildHazardSource(norm({ ac: null }), { level: LEVEL, tables: FAKE });
  assert.equal(actor.system.attributes.ac.value, 16);
});

test("a dispel-only hazard renders the Dispel Magic option with its derived ordinal rank and counteract DC", async () => {
  const { actor } = await buildHazardSource(norm({ disable: [], dispel: true }), { level: LEVEL, tables: FAKE });
  assert.equal(actor.system.details.disable, "<p>@UUID[Compendium.pf2e.spells-srd.Item.Dispel Magic] (1st rank; counteract DC 22)</p>");
});

test("a disable check and Dispel Magic are joined with or", async () => {
  const { actor } = await buildHazardSource(norm({ dispel: true }, 7), { level: 7, tables: FAKE });
  assert.equal(actor.system.details.disable,
    "<p>@Check[thievery|dc:27|name:Disable Spear Launcher|traits:action:disable-a-device] (trained)"
    + " or @UUID[Compendium.pf2e.spells-srd.Item.Dispel Magic] (4th rank; counteract DC 27)</p>");
});

test("the Dispel Magic option names a derived rank with an ordinal, up to 10th", async () => {
  const ordinals = [];
  for (const level of [4, 5, 24]) {
    const { actor } = await buildHazardSource(norm({ disable: [], dispel: true }, level), { level, tables: FAKE });
    ordinals.push(/\((\w+) rank;/.exec(actor.system.details.disable)[1]);
  }
  assert.deepEqual(ordinals, ["2nd", "3rd", "10th"]);
});

test("a hazard without Dispel Magic renders no Dispel Magic option", async () => {
  const { actor } = await buildHazardSource(norm({ dispel: false }), { level: LEVEL, tables: FAKE });
  assert.equal(actor.system.details.disable.includes("Dispel Magic"), false);
});

test("description prose is escaped before it is wrapped in paragraphs", async () => {
  const { actor } = await buildHazardSource(norm({ description: "Dangerous <b>bold</b> wall." }), { level: LEVEL, tables: FAKE });
  assert.equal(actor.system.details.description, "<p>Dangerous &lt;b&gt;bold&lt;/b&gt; wall.</p>");
});

test("buildHazardSource rejects a level outside the table range", async () => {
  await assert.rejects(buildHazardSource(norm(), { level: 30, tables: FAKE }), { code: "BAD_LEVEL" });
});

test("describeHazard reports the simple hazard values and XP from the injected map", async () => {
  const xp = (level, party, complex) => 100 * level + 10 * party + (complex ? 1 : 0);
  const preview = await describeHazard(norm(), LEVEL, { tables: FAKE, xp });
  assert.deepEqual(preview, {
    name: "Spear Launcher",
    level: 2,
    complex: false,
    rarity: "common",
    traits: ["mechanical", "trap"],
    stealth: { dc: 22, rank: "trained" },
    disable: [{ skill: "thievery", dc: 22, rank: "trained" }],
    dispel: null,
    ac: { value: 19, assumed: false },
    saves: { fortitude: 10, reflex: 6, will: null },
    hp: 24,
    hardness: 7,
    strike: { name: "Spear", bonus: 11, formula: "2d6+6", average: 13, damageType: "piercing" },
    reactionName: "Spear",
    routineActions: null,
    xp: 220
  });
});

test("describeHazard reports the complex routine and complex strike values", async () => {
  const routine = { actions: 3, text: "The blade spins.", strike: { name: "Spinning Blade", damageType: "slashing" } };
  const xp = (level, party, complex) => 100 * level + 10 * party + (complex ? 1 : 0);
  const preview = await describeHazard(norm({ complex: true, routine, reaction: { ...raw().reaction, strike: null } }), LEVEL, { tables: FAKE, xp });
  assert.equal(preview.routineActions, 3);
  assert.deepEqual(preview.strike, { name: "Spinning Blade", bonus: 14, formula: "2d10+5", average: 16, damageType: "slashing" });
  assert.equal(preview.xp, 221);
});

// The prose policy samples are shared with tests/ai.hazardConcept.test.mjs so both layers face the same text.
const ALLOWED_PROSE = [
  "The trap fills a 5-foot square.",
  "Darts fly up to 10 feet.",
  "Three darts hit the target.",
  "The vents stay open for 2 rounds."
];

const REFUSED_PROSE = [
  ["an explicit DC", "Anyone can open it with DC 18.", "NUMBER_IN_TEXT"],
  ["an explicit AC", "The door has AC 17.", "NUMBER_IN_TEXT"],
  ["a positive signed modifier", "The runes give a +14 bonus.", "NUMBER_IN_TEXT"],
  ["a negative signed modifier", "A -2 penalty applies.", "NUMBER_IN_TEXT"],
  ["dice notation", "It hits for 2d6 points.", "NUMBER_IN_TEXT"],
  ["damage next to a number", "It deals 10 damage.", "NUMBER_IN_TEXT"],
  ["damage with a type word between", "It deals 10 fire damage.", "NUMBER_IN_TEXT"],
  ["HP next to a number", "The wall has 20 HP.", "NUMBER_IN_TEXT"],
  ["hit points next to a number", "It has 15 hit points.", "NUMBER_IN_TEXT"],
  ["an enricher token", "The gate makes a @Check[thievery|dc:18] roll.", "ENRICHER_IN_TEXT"],
  ["an @ command", "See @UUID for details.", "ENRICHER_IN_TEXT"],
  ["square brackets", "The note reads [secret].", "ENRICHER_IN_TEXT"],
  ["curly braces", "The note reads {secret}.", "ENRICHER_IN_TEXT"],
  ["a control character", "Bad" + String.fromCharCode(7) + "text.", "BAD_TEXT"]
];

test("hazardProseProblem accepts plain distances and counts and refuses statistics, enrichers and control characters", () => {
  for (const text of ALLOWED_PROSE) assert.equal(hazardProseProblem(text), null, text);
  for (const [label, text] of REFUSED_PROSE) assert.equal(typeof hazardProseProblem(text), "string", label);
  assert.equal(typeof hazardProseProblem(42), "string", "non-text is refused");
});

test("normalizeHazardConcept applies the shared prose policy to prose fields and names", () => {
  for (const text of ALLOWED_PROSE) {
    assert.equal(norm({ description: text }).description, text);
    assert.equal(norm({ reaction: { ...raw().reaction, effect: text } }).reaction.effect, text);
    assert.equal(norm({ name: text }).name, text);
  }
  for (const [label, text, code] of REFUSED_PROSE) {
    assert.equal(codeOf(() => norm({ description: text })), code, "description: " + label);
    assert.equal(codeOf(() => norm({ reset: text })), code, "reset: " + label);
    assert.equal(codeOf(() => norm({ name: text })), code === "BAD_TEXT" ? "BAD_NAME" : code, "name: " + label);
  }
});

test("describeHazard reports ac as value and assumed, with assumed true only when the concept had no AC scale", async () => {
  const xp = () => 0;
  const given = await describeHazard(norm({ ac: "high" }), LEVEL, { tables: FAKE, xp });
  assert.deepEqual(given.ac, { value: 19, assumed: false });
  const assumed = await describeHazard(norm({ ac: null }), LEVEL, { tables: FAKE, xp });
  assert.deepEqual(assumed.ac, { value: 16, assumed: true });
  const { actor } = await buildHazardSource(norm({ ac: null }), { level: LEVEL, tables: FAKE });
  assert.equal(actor.system.attributes.ac.value, assumed.ac.value, "the preview shows the stored value");
});

test("describeHazard reports dispel as rank and dc, with the rank derived from the level and clamped to 1 to 10", async () => {
  const xp = () => 0;
  assert.equal((await describeHazard(norm({ dispel: false }), LEVEL, { tables: FAKE, xp })).dispel, null);
  const ranks = [];
  for (const level of [-1, 0, 1, 2, 3, 7, 19, 20, 21, 24]) {
    const preview = await describeHazard(norm({ dispel: true }, level), level, { tables: FAKE, xp });
    ranks.push(preview.dispel.rank);
  }
  assert.deepEqual(ranks, [1, 1, 1, 1, 2, 4, 10, 10, 10, 10]);
  const atSeven = await describeHazard(norm({ dispel: true }, 7), 7, { tables: FAKE, xp });
  assert.deepEqual(atSeven.dispel, { rank: 4, dc: 27 });
});
