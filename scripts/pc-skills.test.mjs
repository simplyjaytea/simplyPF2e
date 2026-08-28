import assert from "node:assert/strict";
import { CORE_SKILLS, normalizeSkillPriorities, skillPriorityOrder, skillIncreaseSchedule, initialSkillTraining,
  allocateCharacterSkills, characterSkillSnapshot } from "./pc-skills.mjs";
import { normalizePCConcept } from "./pc-builder.mjs";

const zero = () => Object.fromEntries(CORE_SKILLS.map((slug) => [slug, 0]));
const ordinary = [3, 5, 7, 9, 11, 13, 15, 17, 19];
const accelerated = Array.from({ length: 19 }, (_, i) => i + 2);
const input = (overrides = {}) => ({ level: 1, additional: 3, intelligence: 0, initialIntelligence: 0,
  nativeRanks: zero(), initialRanks: {}, increaseLevels: ordinary, priorities: ["medicine", "athletics"], keyAbility: "str", ...overrides });
assert.deepEqual(normalizeSkillPriorities(["medicine", "medicine", "Arcana", "__proto__", {}, 3, "arcana"]), ["medicine", "arcana"]);
for (const value of [undefined, null, {}, "athletics"]) assert.deepEqual(normalizeSkillPriorities(value), []);
assert.equal(skillPriorityOrder([], "str").order[0], "athletics");
assert.equal(skillPriorityOrder([], "str").automatic, true);
assert.equal(skillPriorityOrder(["medicine"], "str").order[0], "medicine");
assert.deepEqual(initialSkillTraining({ trainedSkills: { value: ["survival", "nature"] } },
  { trainedSkills: { value: ["survival"] } }), { ranks: { survival: 1, nature: 1 }, replacements: 1 });
assert.equal(allocateCharacterSkills(input({ additional: 0, intelligence: -1, initialIntelligence: -1, replacements: 1 })).trainingBudget, 1);
assert.equal(normalizePCConcept({ skillPriorities: ["medicine", "medicine", 2] }, { level: 1 }).skillPriorities[0], "medicine");

for (const intelligence of [-5, -1, 0, 4]) {
  const plan = allocateCharacterSkills(input({ intelligence, initialIntelligence: intelligence }));
  assert.equal(plan.training.length, Math.max(0, 3 + intelligence));
  assert.equal(plan.trainingBudget, Math.max(0, 3 + intelligence));
  assert.equal(plan.unspentTraining, 0);
}
const granted = { ...zero(), medicine: 1, athletics: 2 };
const overlap = allocateCharacterSkills(input({ nativeRanks: granted }));
assert.equal(overlap.training.length, 3);
assert.ok(!overlap.training.includes("medicine") && !overlap.training.includes("athletics"));
assert.equal(overlap.sourceRanks.medicine, undefined, "native training is never copied into purchased ranks");
assert.ok(overlap.warnings.includes("grant-timing"));
const exhausted = allocateCharacterSkills(input({ nativeRanks: Object.fromEntries(CORE_SKILLS.map((s) => [s, 4])) }));
assert.equal(exhausted.unspentTraining, 3);
assert.equal(exhausted.training.length, 0);

for (const schedule of [ordinary, accelerated]) for (let level = 1; level <= 20; level++) {
  const plan = allocateCharacterSkills(input({ level, increaseLevels: schedule }));
  assert.equal(plan.events.length + plan.unspentIncreases, schedule.filter((lv) => lv <= level).length);
  const replay = Object.fromEntries(plan.training.map((s) => [s, 1]));
  for (const event of plan.events) {
    assert.equal(event.rank, (replay[event.slug] ?? 0) + 1);
    assert.ok(event.rank <= (event.level >= 15 ? 4 : event.level >= 7 ? 3 : 2));
    replay[event.slug] = event.rank;
  }
  assert.equal(plan.sourceRanks.medicine, level >= 15 ? 4 : level >= 7 ? 3 : level >= schedule[0] ? 2 : 1);
}
for (const invalid of [undefined, null, {}, [3, 3], [0], [21], ["3"], [2.5]]) {
  assert.equal(skillIncreaseSchedule(invalid), null);
  const plan = allocateCharacterSkills(input({ level: 20, increaseLevels: invalid }));
  assert.equal(plan.events.length, 0);
  assert.ok(plan.warnings.includes("schedule"));
  assert.equal(plan.unspentIncreases, null);
}
assert.deepEqual(skillIncreaseSchedule([7, 3, 5]), [3, 5, 7]);
assert.deepEqual(skillIncreaseSchedule([]), []);
for (const overrides of [{ intelligence: NaN }, { additional: -1 }, { additional: "3" }]) {
  assert.equal(allocateCharacterSkills(input(overrides)).trainingBudget, null);
}

const lore = { key: "lore:actual-item-id", id: "actual-item-id", name: "Sailing Lore" };
const lorePlan = allocateCharacterSkills(input({ level: 3, additional: 0, lore: [lore],
  nativeRanks: { ...Object.fromEntries(CORE_SKILLS.map((s) => [s, 2])), [lore.key]: 1 }, initialRanks: { [lore.key]: 1 } }));
assert.deepEqual(lorePlan.events, [{ level: 3, slug: lore.key, rank: 2 }]);

// Newly observed native training refunds a free selection without losing it.
const provisional = allocateCharacterSkills(input());
const reconciled = allocateCharacterSkills(input({ nativeRanks: { ...zero(), medicine: 1 }, previous: provisional }));
assert.equal(reconciled.training.length, 3);
assert.ok(!reconciled.training.includes("medicine"));
for (const slug of provisional.training) assert.ok(Math.max(reconciled.sourceRanks[slug] ?? 0, slug === "medicine" ? 1 : 0) >= 1);

// An uncertain late Expert grant cannot refund a prerequisite for earlier Master.
const chainInput = input({ level: 9, additional: 0, nativeRanks: { ...zero(), athletics: 1 }, initialRanks: { athletics: 1 }, priorities: ["athletics"] });
const chain = allocateCharacterSkills(chainInput);
const finalChain = allocateCharacterSkills({ ...chainInput, nativeRanks: { ...zero(), athletics: 2 }, previous: chain });
assert.deepEqual(finalChain.events.filter((e) => e.slug === "athletics"), chain.events.filter((e) => e.slug === "athletics"));

// A refunded free-training slot must not consume a still-pinned training increase.
const collisionInput = input({ level: 3, additional: 1, increaseLevels: [2, 3], priorities: ["acrobatics", "arcana", "athletics"] });
const collision = allocateCharacterSkills(collisionInput);
const finalCollision = allocateCharacterSkills({ ...collisionInput, previous: collision, nativeRanks: { ...zero(), acrobatics: 2 } });
assert.ok(!finalCollision.training.includes("arcana"));
const replayCollision = Object.fromEntries(finalCollision.training.map((slug) => [slug, 1]));
for (const event of finalCollision.events) {
  assert.equal(event.rank, (replayCollision[event.slug] ?? 0) + 1);
  replayCollision[event.slug] = event.rank;
}

// Late Int training must not support earlier increases, even with more initial picks.
const late = allocateCharacterSkills(input({ level: 10, additional: 0, intelligence: 3, initialIntelligence: 0, increaseLevels: accelerated }));
assert.ok(late.warnings.includes("intelligence-timing"));
for (const event of late.events) {
  if (late.training.includes(event.slug)) assert.ok(event.level >= late.trainingLevels[event.slug]);
}
assert.throws(() => allocateCharacterSkills(input({ additional: 0, previous: provisional })), /allowance decreased/);

// Non-floor native rank transforms are not converted into free trained skills.
const blocked = allocateCharacterSkills(input({ blocked: ["medicine"] }));
assert.ok(!blocked.training.includes("medicine"));
const snapshotActor = { system: { skills: Object.fromEntries(CORE_SKILLS.map((s) => [s, { rank: 0 }])),
  abilities: { int: { base: 2, mod: 5 } }, autoChanges: { "system.skills.{item|flags.pf2e.skill}.rank": [{ mode: "add", value: 1 }] } }, items: new Map() };
const snapshot = characterSkillSnapshot(snapshotActor);
assert.equal(snapshot.intelligence, 2);
assert.equal(snapshot.blocked.length, CORE_SKILLS.length);
snapshotActor.system.autoChanges = { "{item|flags.pf2e.rulesSelections.path}": [{ mode: "add", value: 1 }] };
assert.equal(characterSkillSnapshot(snapshotActor).blocked.length, CORE_SKILLS.length);
assert.deepEqual(allocateCharacterSkills(input({ nativeRanks: {} })).warnings, ["native-data"]);
console.log("pc-skills.test.mjs: preferences, budgets, chronological progression, and reconciliation passed");
