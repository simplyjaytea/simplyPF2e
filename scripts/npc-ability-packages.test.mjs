import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// These fixtures are unchanged published PF2e 8.5.0 documents. Their source
// paths and the native behavior citations live alongside them in README.md.
const read = async (name) => JSON.parse(await readFile(new URL(`../tests/fixtures/npc-abilities/${name}.json`, import.meta.url), "utf8"));
const [stunning, flurry, feature, crane, stance, deflect, nimble, charge, stunned] = await Promise.all([
  "stunning-blows", "flurry-of-blows", "flurry-class-feature", "crane-stance", "stance-crane-stance",
  "deflect-projectile", "nimble-dodge", "sudden-charge", "stunned"
].map(read));
const stunningText = 'The target must succeed at a @Check[fortitude|against:monk|name:Monk|traits:incapacitation|overrideTraits:true] save against your class DC or be @UUID[Compendium.pf2e.conditionitems.Item.dfCMdR4wnpbYNTix]{Stunned 1} (or @UUID[Compendium.pf2e.conditionitems.Item.dfCMdR4wnpbYNTix]{Stunned 3} on a critical failure).';
const documents = new Map();
const stored = { feats: ["pf2e.feats-srd", "test.feats"], classFeatures: ["pf2e.classfeatures"], abilities: ["test.actions", "pf2e.actionspf2e"] };
let loads = 0;
function install(packId, sources) {
  const rows = new Map(sources.map((source) => [source._id, structuredClone(source)]));
  documents.set(packId, rows);
  return { getIndex: async () => [...rows.values()], async getDocument(id) {
    loads++;
    const source = rows.get(id);
    if (!source) return null;
    return { ...source, uuid: `Compendium.${packId}.Item.${id}`, toObject: () => structuredClone(source) };
  } };
}
globalThis.game = {
  settings: { get: () => stored },
  i18n: { localize: (key) => key === "PF2E.SpecificRule.Monk.StunningFist.Note" ? stunningText : key },
  packs: new Map([
    ["pf2e.feats-srd", install("pf2e.feats-srd", [stunning, crane, deflect, nimble, charge])],
    ["pf2e.classfeatures", install("pf2e.classfeatures", [feature])],
    ["pf2e.actionspf2e", install("pf2e.actionspf2e", [flurry])],
    ["pf2e.feat-effects", install("pf2e.feat-effects", [stance])],
    ["pf2e.conditionitems", install("pf2e.conditionitems", [stunned])],
    ["test.feats", install("test.feats", [])], ["test.actions", install("test.actions", [])]
  ])
};
globalThis.CONFIG = { PF2E: { npcAttackTraits: { agile: "Agile", nonlethal: "Nonlethal", unarmed: "Unarmed" }, classTraits: { monk: "Monk", fighter: "Fighter", rogue: "Rogue", barbarian: "Barbarian" } } };
globalThis.foundry = { utils: { randomID: (() => { let id = 0; return () => `id${++id}`; })() } };
globalThis.CONST = { TOKEN_DISPLAY_MODES: { OWNER_HOVER: 20 } };
const packages = await import("./npc-ability-packages.mjs");
const { getCreatureFeatCandidates, getAbilityCandidates, issueCandidate } = await import("./compendium.mjs");
const { normalizeConcept, resolveConcept, createActor, computeStats } = await import("./builder.mjs");
const { verifyCreatedActor } = await import("./post-create.mjs");
const { completionManifest } = await import("./completion.mjs");
const catalog = await getCreatureFeatCandidates({ level: 15, limit: null });
const byName = (name) => catalog.find((candidate) => candidate.name === name);
const selected = (name) => ({ name, candidate: byName(name).ref });
const makeConcept = (names = [], unarmed = false) => normalizeConcept({
  name: "Automatic Martial Artist", feats: names.map(selected),
  strikes: unarmed ? [{ name: "Fist", traits: ["unarmed", "agile"], attackScale: "high", damageScale: "high" }] : [{ name: "Staff", traits: [], attackScale: "high", damageScale: "high" }]
}, { level: 15, rarity: "common" });
let actorWrites = 0;
let mutateCreated = null;
let embedFailure = null, deleteFailure = null, actorDeletes = 0;
const embedCalls = [];
globalThis.Actor = { create: async (data) => {
  actorWrites++;
  const actor = structuredClone(data);
  actor.id = `created${actorWrites}`;
  actor.items.forEach((item, index) => { item._id = `embedded${index}`; });
  // This models only the native field contract; actual PF2e DC calculation,
  // enrichment, damage notes, and target condition controls require live QA.
  actor.system.attributes.classDC = { value: 34 };
  actor.createEmbeddedDocuments = async (type, sources) => {
    embedCalls.push(sources.map((item) => item.name));
    assert.equal(type, "Item");
    assert.equal(sources.length, 1, "package parents use separate native creation batches");
    if (embedFailure) throw embedFailure;
    async function embed(source) {
      const item = structuredClone(source); item._id = `embedded${actor.items.length}`;
      actor.items.push(item);
      for (const rule of item.system.rules ?? []) if (rule.key === "GrantItem") {
        if (rule.allowDuplicate === false && actor.items.some((entry) => entry._stats?.compendiumSource === rule.uuid)) continue;
        const match = /^Compendium\.([^.]+\.[^.]+)\.Item\.(.+)$/.exec(rule.uuid);
        const granted = structuredClone(documents.get(match[1]).get(match[2]));
        granted._stats = { compendiumSource: rule.uuid }; await embed(granted);
      }
    }
    for (const source of sources) await embed(source);
    mutateCreated?.(actor);
    return sources;
  };
  actor.delete = async () => { actorDeletes++; if (deleteFailure) throw deleteFailure; };
  return actor;
} };

assert.deepEqual(packages.npcPrerequisiteAlternatives("Nimble Dodge or Sudden Charge"), [{ name: "Nimble Dodge" }, { name: "Sudden Charge" }]);
for (const text of ["trained in Athletics", "master in Acrobatics", "spellcasting class feature", "2nd level", "Nimble Dodge; ability to fly", "", null]) {
  assert.throws(() => packages.npcPrerequisiteAlternatives(text), /prerequisite/i);
}
const bridged = packages.npcStunningNote(stunning.system.rules[1]);
assert.ok(bridged.text.includes("dc:resolve(@actor.attributes.classDC.value)"));
assert.ok(bridged.text.includes("traits:incapacitation|overrideTraits:true"));
assert.ok(bridged.text.includes("{Stunned 1}") && bridged.text.includes("{Stunned 3}"));
assert.equal(stunning.system.rules[1].text, "PF2E.SpecificRule.Monk.StunningFist.Note", "source rule remains unchanged");

const concept = makeConcept(["Stunning Blows"]);
const filtered = await packages.filterNpcAbilityCandidates([byName("Crane Stance"), byName("Deflect Projectile"), byName("Stunning Blows"), byName("Nimble Dodge"), byName("Sudden Charge")], { concept });
assert.deepEqual(filtered.candidates.map((candidate) => candidate.name), ["Stunning Blows", "Nimble Dodge", "Sudden Charge"], "all-class capability filtering rejects only the unsupported packages");
assert.match(filtered.unavailable.find((entry) => entry.candidate.name === "Crane Stance").reason, /Strike/);
assert.match(filtered.unavailable.find((entry) => entry.candidate.name === "Deflect Projectile").reason, /predicate/);
assert.equal(packages.getNpcAbilityCandidatePackage(byName("Stunning Blows")).cost, 3);
assert.equal(packages.getNpcAbilityCandidatePackage(byName("Nimble Dodge")).cost, 1);
const selectedSources = filtered.candidates.flatMap((candidate) => candidate.traits);
for (const trait of ["monk", "rogue", "fighter", "barbarian"]) assert.ok(selectedSources.includes(trait));

const resolved = await resolveConcept(concept, { exactContent: true });
const plan = resolved.abilityPackages;
assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.items[0].system.rules));
assert.equal(plan.cost, 3);
assert.equal(plan.signatureCount, 1);
assert.equal(plan.supportingCount, 2);
assert.equal(plan.items.length, 2, "Stunning and its native Flurry action are embedded");
assert.ok(plan.sources.some((source) => source.uuid.endsWith(feature._id) && source.role === "equivalent-source"));
assert.ok(plan.sources.some((source) => source.uuid.endsWith(stunned._id) && source.role === "asset"));
assert.ok(plan.items.every((item) => item.type === "action"));
const manifest = completionManifest({ mode: "npc", concept, resolved });
assert.equal(manifest.complete, true);
assert.ok(manifest.records.some((record) => record.category === "supporting-strike"));
const beforeLoads = loads;
const result = await createActor(concept, resolved);
assert.ok(loads > beforeLoads, "creation reloads source documents rather than trusting the preview cache");
assert.equal(result.actor.items.filter((item) => item.type === "feat").length, 0);
assert.equal(result.actor.items.filter((item) => item.type === "condition" || item.type === "effect").length, 0, "target condition and linked effects are assets, never active on the NPC");
const fist = result.actor.items.find((item) => item.name === "Unarmed Strike");
assert.ok(fist.system.traits.value.includes("unarmed"));
assert.ok(Number.isFinite(fist.system.bonus.value));
assert.ok(/\d+d\d+/.test(fist.system.damageRolls.unarmed.damage));
const nativeStats = computeStats(concept);
assert.equal(result.actor.system.attributes.ac.value, nativeStats.ac);
assert.equal(result.actor.system.attributes.hp.max, nativeStats.hp);
assert.equal(result.actor.system.saves.fortitude.value, nativeStats.saves.fortitude);
assert.equal(verifyCreatedActor(result.actor, manifest, result.expectedItems).checked, result.expectedItems.length);
const stunningAction = result.actor.items.find((item) => item.name === "Stunning Blows");
assert.ok(stunningAction.system.description.value.includes("dc:resolve(@actor.attributes.classDC.value)"), "the action chat card exposes the same native save link as the damage Note");
assert.ok(stunningAction.system.rules[1].text.includes("Stunned 3"));

// A real Flurry action selected as a normal special ability is also owned by
// the Stunning package. The active source identity must be embedded exactly
// once, while the normal post-create verifier still accepts the result.
const flurryCandidate = (await getAbilityCandidates()).find((candidate) => candidate.name === "Flurry of Blows");
assert.ok(flurryCandidate?.ref, "the enabled action pack issues the real Flurry candidate");
const overlapConcept = makeConcept(["Stunning Blows"]);
overlapConcept.specialAbilities = [{ name: "Flurry of Blows", candidate: flurryCandidate.ref }];
const overlapResolved = await resolveConcept(overlapConcept, { exactContent: true });
const overlapManifest = completionManifest({ mode: "npc", concept: overlapConcept, resolved: overlapResolved });
const overlapCreated = await createActor(overlapConcept, overlapResolved);
const flurryUuid = `Compendium.pf2e.actionspf2e.Item.${flurry._id}`;
assert.equal(overlapCreated.actor.items.filter((item) => item._stats?.compendiumSource === flurryUuid).length, 1,
  "Flurry selected by both special ability and package pipelines persists once");
assert.equal(overlapCreated.actor.items.filter((item) => item.name === "Flurry of Blows").length, 1,
  "the active package owns the duplicate Flurry source");
verifyCreatedActor(overlapCreated.actor, overlapManifest, overlapCreated.expectedItems);

// Same-name sources are still distinct when their exact UUID differs. Only
// the package-owned action is suppressed from baseline special abilities.
const otherFlurryAbility = structuredClone(flurry); otherFlurryAbility._id = "otherflurry00002";
documents.get("test.actions").set(otherFlurryAbility._id, otherFlurryAbility);
const otherFlurryRef = issueCandidate({ packId: "test.actions", _id: otherFlurryAbility._id }, { name: otherFlurryAbility.name }).ref;
const distinctConcept = makeConcept(["Stunning Blows"]);
distinctConcept.specialAbilities = [{ name: "Flurry of Blows", candidate: otherFlurryRef }];
const distinctResolved = await resolveConcept(distinctConcept, { exactContent: true });
const distinctCreated = await createActor(distinctConcept, distinctResolved);
const distinctFlurrySources = distinctCreated.actor.items.filter((item) => item.name === "Flurry of Blows")
  .map((item) => item._stats?.compendiumSource);
assert.deepEqual(new Set(distinctFlurrySources), new Set([
  flurryUuid, `Compendium.test.actions.Item.${otherFlurryAbility._id}`
]));
verifyCreatedActor(distinctCreated.actor, completionManifest({ mode: "npc", concept: distinctConcept, resolved: distinctResolved }), distinctCreated.expectedItems);

// Whole packages own the budget: the extra native strike is counted; an
// existing genuinely unarmed strike avoids a duplicate and leaves one slot.
await assert.rejects(packages.resolveNpcAbilityPackages([selected("Stunning Blows"), selected("Nimble Dodge")], { concept }), (error) => error.code === "NPC_ABILITY_BUDGET_EXCEEDED");
const unarmedConcept = makeConcept(["Stunning Blows", "Nimble Dodge"], true);
const combined = await packages.resolveNpcAbilityPackages(unarmedConcept.feats, { concept: unarmedConcept });
assert.equal(combined.cost, 3);
assert.equal(combined.needsUnarmed, false);
assert.equal((await packages.resolveNpcAbilityPackages([selected("Nimble Dodge"), selected("Nimble Dodge")], { concept })).cost, 1);
const rangedConcept = normalizeConcept({ name: "Bow Charger", feats: [selected("Sudden Charge")],
  strikes: [{ name: "Bow", type: "ranged", traits: [], range: 30 }] }, { level: 15, rarity: "common" });
const rangedResolved = await resolveConcept(rangedConcept, { exactContent: true });
assert.equal(rangedResolved.abilityPackages.cost, 2, "Sudden Charge charges its missing melee support to the budget");
assert.equal(rangedResolved.abilityPackages.needsUnarmed, true);
const rangedCreated = await createActor(rangedConcept, rangedResolved);
assert.ok(rangedCreated.actor.items.some((item) => item.type === "melee" && item.system.traits.value.includes("unarmed")));
verifyCreatedActor(rangedCreated.actor, completionManifest({ mode: "npc", concept: rangedConcept, resolved: rangedResolved }), rangedCreated.expectedItems);

// Missing/disabled/changed sources fail before any write, including private
// plan forgery and a dependency deleted between preview and create.
let before = actorWrites;
await assert.rejects(createActor(concept, { ...resolved, abilityPackages: structuredClone(plan) }), /not issued/);
assert.equal(actorWrites, before);
const featureData = documents.get("pf2e.classfeatures").get(feature._id);
for (const mutate of [
  (data) => { data.system.prerequisites.value = [{ value: "expert in Athletics" }]; },
  (data) => { data.system.actions.value = 2; },
  (data) => { data.system.frequency = { max: 1, per: "day" }; },
  (data) => { data.system.description.value += "<p>Additional requirement.</p>"; }
]) {
  const changed = structuredClone(featureData); mutate(changed);
  documents.get("pf2e.classfeatures").set(feature._id, changed);
  await assert.rejects(packages.resolveNpcAbilityPackages(concept.feats, { concept, fresh: true }), /Flurry class-feature source changed/,
    "an altered equivalent is rejected even when it changed before catalog admission");
}
documents.get("pf2e.classfeatures").set(feature._id, featureData);
documents.get("pf2e.classfeatures").delete(feature._id);
await assert.rejects(createActor(concept, resolved), /prerequisite|source/);
assert.equal(actorWrites, before);
documents.get("pf2e.classfeatures").set(feature._id, featureData);
const flurryData = documents.get("pf2e.actionspf2e").get(flurry._id);
flurryData.system.description.value += "<p>Changed after preview.</p>";
await assert.rejects(createActor(concept, resolved), /changed/);
assert.equal(actorWrites, before);
flurryData.system.description.value = flurry.system.description.value;
stored.feats = ["test.feats"];
await assert.rejects(createActor(concept, resolved), /issued enabled source/);
assert.equal(actorWrites, before);
stored.feats = ["pf2e.feats-srd", "test.feats"];

// Persistence failure reaches the transaction's verification seam. The
// generator's production rollback regression owns deleting its new actor.
for (const mutate of [
  (actor) => { actor.items.find((item) => item.name === "Stunning Blows").system.rules[1].text = "lost automation"; },
  (actor) => { actor.system.attributes.classDC.value = 0; },
  (actor) => { actor.items.find((item) => item.name === "Unarmed Strike").system.traits.value = []; },
  (actor) => { actor.items = actor.items.filter((item) => item.name !== "Flurry of Blows"); }
]) {
  mutateCreated = mutate;
  const created = await createActor(concept, resolved);
  assert.throws(() => verifyCreatedActor(created.actor, manifest, created.expectedItems), /persist|missing|class DC|unarmed/);
}
mutateCreated = null;
const deletionsBefore = actorDeletes;
embedFailure = new Error("native package embedding failed");
await assert.rejects(createActor(concept, resolved), /native package embedding failed/);
assert.equal(actorDeletes, deletionsBefore + 1, "a native package write failure rolls back its newly created actor");
deleteFailure = new Error("native actor cleanup failed");
try {
  await createActor(concept, resolved);
  assert.fail("failed native embedding cannot return a ready actor");
} catch (error) {
  assert.equal(error, embedFailure);
  assert.ok(error.simplyPF2eRollbackActor?.id, "cleanup failure identifies the surviving actor for the outer transaction");
}
embedFailure = null; deleteFailure = null;

// Pure graph regressions use source clones of Nimble Dodge so every accepted
// rule still comes from a real published rule exemplar.
game.packs.set("test.graph", install("test.graph", []));
stored.feats.push("test.graph");
const fixtureRows = documents.get("test.graph");
const addFeat = (id, name, prerequisites = [], mutate = () => {}) => {
  const data = structuredClone(nimble);
  data._id = id; data.name = name;
  data.system.prerequisites.value = prerequisites.map((value) => ({ value }));
  mutate(data);
  fixtureRows.set(id, data);
  return data;
};
addFeat("chainbase0000001", "Chain Base");
addFeat("chainmiddle00001", "Chain Middle", ["Chain Base"]);
addFeat("chaintop00000001", "Chain Top", ["Chain Middle"]);
addFeat("chainshared00001", "Chain Shared", ["Chain Base"]);
addFeat("alternative00001", "Alternative", ["Missing Thing or Chain Base"]);
addFeat("cyclestart000001", "Cycle Start", ["Cycle End"]);
addFeat("cycleend00000001", "Cycle End", ["Cycle Start"]);
addFeat("rankblocked00001", "Rank Blocked", ["expert in Athletics"]);
addFeat("highlevel0000001", "Advanced Technique", [], (data) => { data.system.level.value = 20; });
addFeat("highparent000001", "High Parent", ["Advanced Technique"]);
addFeat("choiceblocked001", "Choice Blocked", [], (data) => { data.system.rules.push({ key: "ChoiceSet", choices: [], flag: "pick" }); });
addFeat("grantblocked0001", "Grant Blocked", [], (data) => { data.system.rules = [{ key: "GrantItem", allowDuplicate: false, uuid: `Compendium.test.graph.Item.chainbase0000001` }]; });
const sharedEffect = structuredClone(stance);
sharedEffect._id = "shareddefense001"; sharedEffect.name = "Shared Defense";
sharedEffect.system.rules = [structuredClone(stance.system.rules[1])];
documents.get("test.actions").set(sharedEffect._id, sharedEffect);
const sharedUuid = `Compendium.test.actions.Item.${sharedEffect._id}`;
addFeat("assetowner000001", "Asset Owner", [], (data) => { data.system.rules = []; data.system.selfEffect = { name: sharedEffect.name, uuid: sharedUuid }; });
addFeat("grantowner000001", "Grant Owner", [], (data) => { data.system.rules = [{ key: "GrantItem", allowDuplicate: false, uuid: sharedUuid }]; });
addFeat("grantownertwo001", "Other Grant Owner", [], (data) => { data.system.rules = [{ key: "GrantItem", allowDuplicate: false, uuid: sharedUuid }]; });
addFeat("repeatgrant00001", "Repeated Grant", [], (data) => { data.system.rules = [{ key: "GrantItem", allowDuplicate: false, uuid: sharedUuid }, { key: "GrantItem", allowDuplicate: false, uuid: sharedUuid }]; });
addFeat("baddescription01", "Bad Description", [], (data) => { data.system.description.value = "<p>@Check[fortitude|against:invented-class]</p>"; });
addFeat("badactorfield001", "Bad Actor Field", [], (data) => { data.system.description.value = "<p>@Check[fortitude|dc:resolve(@actor.skills.athletics.rank)]</p>"; });
addFeat("prereqowner00001", "Prerequisite Owner", [`@UUID[${sharedUuid}]`]);
const complexEffect = structuredClone(sharedEffect);
complexEffect._id = "complexeffect001"; complexEffect.name = "Complex Effect";
complexEffect.system.rules = [{ key: "GrantItem", allowDuplicate: false, uuid: sharedUuid }];
documents.get("test.actions").set(complexEffect._id, complexEffect);
addFeat("complexasset0001", "Complex Asset", [], (data) => { data.system.rules = []; data.system.selfEffect = { name: complexEffect.name, uuid: `Compendium.test.actions.Item.${complexEffect._id}` }; });
for (const [index, letter] of [..."ABCDEFGHIJ"].entries()) addFeat(`deepchain000000${letter}`, `Deep ${letter}`, index < 9 ? [`Deep ${String.fromCharCode(letter.charCodeAt(0) + 1)}`] : []);
const graphCatalog = await getCreatureFeatCandidates({ level: 24, limit: null });
const graphSelection = (name) => ({ name, candidate: graphCatalog.find((candidate) => candidate.name === name).ref });
const graphPlan = async (names) => packages.resolveNpcAbilityPackages(names.map(graphSelection), { concept: makeConcept(), fresh: true });
assert.equal((await graphPlan(["Chain Top"])).cost, 3, "multi-level dependency chain is complete");
const shared = await graphPlan(["Chain Middle", "Chain Shared"]);
assert.equal(shared.cost, 3);
assert.equal(shared.sources.filter((source) => source.name === "Chain Base").length, 1, "shared prerequisites are source-deduplicated");
assert.equal((await graphPlan(["Alternative"])).cost, 2, "failed alternative leaves no partial state behind");
for (const [name, pattern] of [["Cycle Start", /cyclic/], ["Rank Blocked", /prerequisite/], ["High Parent", /exceeds NPC level/], ["Choice Blocked", /ChoiceSet/], ["Grant Blocked", /NPC-invalid feat/]]) {
  await assert.rejects(graphPlan([name]), pattern);
}
for (const names of [["Asset Owner", "Grant Owner"], ["Grant Owner", "Asset Owner"]]) {
  const promoted = await graphPlan(names);
  assert.equal(promoted.cost, 3, "shared inactive asset and active grant always charge the active dependency");
  assert.equal(promoted.expectedItems.filter((item) => item.name === sharedEffect.name).length, 1);
  assert.equal(promoted.sources.find((source) => source.name === sharedEffect.name).role, "grant");
}
for (const names of [["Asset Owner", "Prerequisite Owner"], ["Prerequisite Owner", "Asset Owner"]]) {
  const promoted = await graphPlan(names);
  assert.equal(promoted.cost, 3);
  assert.equal(promoted.items.filter((item) => item.name === sharedEffect.name).length, 1, "asset-to-prerequisite promotion preserves the direct embedded dependency");
}
await assert.rejects(graphPlan(["Complex Asset"]), /unsupported dependency package/, "inactive effects cannot hide granted combat power outside the budget");
await assert.rejects(graphPlan(["Deep A"]), /expansion exceeds/, "recursive expansion is bounded before actor writes");
await assert.rejects(graphPlan(["Grant Owner", "Prerequisite Owner"]), /both a direct prerequisite and a native grant/);
await assert.rejects(graphPlan(["Repeated Grant"]), /repeats a grant/, "native duplicate checks cannot see a repeated grant in the same pending batch");
for (const name of ["Bad Description", "Bad Actor Field"]) await assert.rejects(graphPlan([name]), /description needs an unavailable/);
const grantConcept = makeConcept(); grantConcept.feats = [graphSelection("Grant Owner"), graphSelection("Other Grant Owner")];
const sharedCandidate = issueCandidate({ packId: "test.actions", _id: sharedEffect._id }, { name: sharedEffect.name }).ref;
grantConcept.specialAbilities = [{ name: sharedEffect.name, candidate: sharedCandidate }];
const grantResolved = await resolveConcept(grantConcept, { exactContent: true });
const nativeGrantCreated = await createActor(grantConcept, grantResolved);
assert.equal(nativeGrantCreated.actor.items.filter((item) => item.name === sharedEffect.name).length, 1,
  "sequential native parents observe the previously persisted shared grant");
assert.equal(nativeGrantCreated.actor.items.filter((item) => item._stats?.compendiumSource === sharedUuid).length, 1,
  "a special ability overlapping a native grant persists the shared source once");
assert.equal(grantResolved.abilityPackages.cost, 3);
verifyCreatedActor(nativeGrantCreated.actor, completionManifest({ mode: "npc", concept: grantConcept, resolved: grantResolved }), nativeGrantCreated.expectedItems);
const duplicate = structuredClone(fixtureRows.get("chainbase0000001")); duplicate._id = "duplicatebase001";
fixtureRows.set(duplicate._id, duplicate);
await assert.rejects(graphPlan(["Chain Middle"]), /no unique enabled exact source/, "unbound same-name prerequisites remain fail-closed");
fixtureRows.delete(duplicate._id);
const otherFlurry = structuredClone(feature); otherFlurry._id = "otherflurry00001";
fixtureRows.set(otherFlurry._id, otherFlurry);
const bound = await packages.resolveNpcAbilityPackages(concept.feats, { concept, fresh: true });
assert.ok(bound.sources.some((source) => source.uuid === `Compendium.pf2e.classfeatures.Item.${feature._id}`), "verified Stunning prerequisite binds the actual feature despite same-name other content");
assert.ok(bound.sources.every((source) => !source.uuid.endsWith(otherFlurry._id)));
const aborted = new AbortController(); aborted.abort();
await assert.rejects(packages.filterNpcAbilityCandidates(catalog, { concept: makeConcept(), signal: aborted.signal }), /abort/i);
console.log("npc-ability-packages: exact source graphs, native Stunning/Flurry/DC/strike bridge, budget, fail-closed rules and persistence passed");
