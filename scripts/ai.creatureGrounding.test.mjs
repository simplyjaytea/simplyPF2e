// Drive both creature grounding selectors through the production provider path.
// This catches task-profile/schema drift before it can spend two failed live calls.
import assert from "node:assert/strict";
import { SETTINGS } from "./settings.mjs";

const settings = new Map([
  [SETTINGS.apiBaseUrl, "http://localhost:11434/v1"], [SETTINGS.apiKey, ""],
  [SETTINGS.apiKeyBaseUrl, ""], [SETTINGS.model, "test-model"],
  [SETTINGS.temperature, 0.8], [SETTINGS.maxTokens, 8000], [SETTINGS.requestTimeout, 90]
]);
globalThis.game = {
  settings: { get: (_module, key) => settings.get(key) },
  i18n: { localize: (key) => key, format: (key, data) => `${key}:${JSON.stringify(data)}` }
};

const replies = [];
const requests = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (_url, options) => {
  requests.push(JSON.parse(options.body));
  assert.ok(replies.length, "unexpected provider request");
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(replies.shift()) }, finish_reason: "stop" }],
    usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 }
  }), { headers: { "content-type": "application/json" } });
};

try {
  const { selectCreatureAbilities, selectCreatureFeats, selectEquipment } = await import("./ai.mjs");
  const concept = {
    name: "Cavern Sentinel", level: 6, blurb: "Guards a flooded shrine", description: "",
    specialAbilities: [{ name: "Grasping Tendrils", glossary: "Grab" }], feats: ["Reactive Shield"]
  };
  const abilityCandidates = [
    { id: "A0", name: "Grab", ref: { packId: "pf2e.bestiary-ability-glossary-srd", _id: "grab" } },
    { id: "A1", name: "Knockdown", ref: { packId: "pf2e.bestiary-ability-glossary-srd", _id: "knockdown" } }
  ];
  replies.push({ abilityIds: ["A0", "invented", "A0"] });
  const abilities = await selectCreatureAbilities({ concept, candidates: abilityCandidates });
  assert.deepEqual(abilities.abilities, [{
    name: "Grab", candidate: { packId: "pf2e.bestiary-ability-glossary-srd", _id: "grab" }
  }]);

  const featCandidates = [
    { id: "private-issued-shield", name: "Reactive Shield", ref: { packId: "pf2e.feats-srd", _id: "shield" } },
    { id: "private-issued-charge", name: "Sudden Charge", ref: { packId: "pf2e.feats-srd", _id: "charge" } }
  ];
  replies.push({ featIds: ["F0"] });
  const feats = await selectCreatureFeats({ concept, candidates: featCandidates });
  assert.deepEqual(feats.feats, [{
    name: "Reactive Shield", candidate: { packId: "pf2e.feats-srd", _id: "shield" }
  }]);

  // Short aliases restore the exact private source; full IDs and names are
  // never accepted as an alternate identifier on the NPC feat boundary.
  replies.push({ featIds: ["F1"] });
  const secondFeat = await selectCreatureFeats({ concept, candidates: featCandidates });
  assert.equal(secondFeat.feats[0].candidate, featCandidates[1].ref);
  assert.equal(secondFeat.feats[0].name, "Sudden Charge");
  assert.equal(secondFeat.status, "selected");
  assert.ok(!requests[1].messages[1].content.includes("private-issued"));
  assert.ok(!requests[1].messages[1].content.includes("pf2e.feats-srd"));

  const equipmentCandidates = [
    { id: "E0", name: "Repeating Heavy Crossbow", type: "weapon", level: 1,
      ref: { packId: "pf2e.equipment-srd", _id: "crossbow" } },
    { id: "E1", name: "Thieves' Tools", type: "equipment", level: 0,
      ref: { packId: "pf2e.equipment-srd", _id: "tools" } }
  ];
  replies.push({ equipment: [
    { id: "Thieves' Tools", quantity: 1 },
    { id: "+1 Striking Repeating Heavy Crossbow", quantity: 1 },
    { id: "+1 Striking Invented Weapon", quantity: 1 }
  ] });
  const namedEquipment = await selectEquipment({
    concept: { ...concept, traits: [], strikes: [], equipment: [{ name: "Thieves' Tools" }] },
    candidates: equipmentCandidates
  });
  assert.deepEqual(namedEquipment.equipment, [
    { name: "Thieves' Tools", candidate: { packId: "pf2e.equipment-srd", _id: "tools" }, quantity: 1, value: 0 },
    { name: "+1 Striking Repeating Heavy Crossbow",
      candidate: { packId: "pf2e.equipment-srd", _id: "crossbow" }, quantity: 1, value: 0 }
  ], "exact name-in-id picks and allowed runed prefixes retain issued sources; invented bases still drop");

  assert.equal(requests.length, 4, "valid selector payloads must not trigger the bounded retry");
  assert.ok(requests.every((request) => request.temperature === 0 && request.max_tokens === 1536));
  assert.match(requests[0].messages[0].content, /"abilityIds"/);
  assert.match(requests[1].messages[0].content, /"featIds"/);

  replies.push({ picks: [] }, { abilityIds: [] });
  await selectCreatureAbilities({ concept, candidates: abilityCandidates });
  assert.equal(requests.length, 6, "a wrong response key is rejected once, then retried with the same contract");

  replies.push({ featIds: [] });
  const omitted = await selectCreatureFeats({ concept, candidates: featCandidates });
  assert.deepEqual(omitted.feats, []);
  assert.equal(omitted.omitted, true, "an explicit empty reply declines the optional wishlist");
  assert.equal(omitted.usage.total, 30, "omission retains provider token accounting");
  assert.equal(feats.omitted, false);
  assert.equal(omitted.status, "empty");
  for (const featIds of [["invented"], [null], [{ packId: "pf2e.feats-srd", _id: "shield" }],
    ["F0", "invented"], ["F0", "F0"], ["F0", "F1"], ["Sudden Charge"], ["private-issued-shield"]]) {
    replies.push({ featIds });
    await assert.rejects(selectCreatureFeats({ concept, candidates: featCandidates }), (error) => {
      assert.equal(error.code, "NPC_FEAT_SELECTION_INVALID");
      assert.equal(error.usage.total, 30, "atomic validation failure retains spent usage");
      assert.equal(error.diagnostics.candidateCount, 2);
      return true;
    });
  }
  const beforeSkip = requests.length;
  await assert.rejects(selectCreatureFeats({ concept, candidates: [] }),
    (error) => error.code === "NPC_FEAT_CATALOG_UNAVAILABLE");
  assert.equal(requests.length, beforeSkip, "an unavailable catalog cannot spend or decline the draft");
  const skipped = await selectCreatureFeats({ concept: { ...concept, feats: [] }, candidates: [] });
  assert.equal(skipped.status, "skipped");
  assert.equal(skipped.omitted, false);
  replies.push({ picks: [] }, { picks: [] });
  await assert.rejects(selectCreatureFeats({ concept, candidates: featCandidates }), (error) => {
    assert.equal(error.code, "NPC_FEAT_REQUEST_FAILED");
    assert.equal(error.usage.total, 60, "both failed schema attempts preserve usage");
    return true;
  });
  assert.equal(requests.length, beforeSkip + 2);
  const { issueCandidate, isIssuedCandidate } = await import("./compendium.mjs");
  const allClassCandidates = [
    issueCandidate({ packId: "custom.feats", _id: "crane-custom" }, { name: "Crane Stance", traits: ["monk"] }),
    issueCandidate({ packId: "pf2e.feats-srd", _id: "crane-real" }, { name: "Crane Stance", traits: ["monk"] }),
    issueCandidate({ packId: "pf2e.feats-srd", _id: "nimble" }, { name: "Nimble Dodge", traits: ["rogue"] }),
    issueCandidate({ packId: "pf2e.feats-srd", _id: "spell" }, { name: "Spell Substitution", traits: ["wizard"] })
  ];
  const multiDraft = { ...concept, feats: ["Crane Stance", "Nimble Dodge", "Spell Substitution"] };
  replies.push({ featIds: ["F1", "F2", "F3"] });
  const multi = await selectCreatureFeats({ concept: multiDraft, candidates: allClassCandidates });
  assert.deepEqual(multi.feats.map((feat) => feat.name), multiDraft.feats);
  assert.equal(multi.feats[0].candidate, allClassCandidates[1].ref, "same-name aliases restore the selected pack identity");
  assert.ok(multi.feats.every((feat) => isIssuedCandidate(feat.candidate)), "multiple classes retain locally issued exact refs");
  assert.equal(replies.length, 0);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("ai creature grounding: production task contracts and exact-ID filtering passed");
