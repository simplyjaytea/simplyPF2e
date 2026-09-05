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
    { id: "F0", name: "Reactive Shield", ref: { packId: "pf2e.feats-srd", _id: "shield" } },
    { id: "F1", name: "Sudden Charge", ref: { packId: "pf2e.feats-srd", _id: "charge" } }
  ];
  replies.push({ featIds: ["F0", "invented", "F0"] });
  const feats = await selectCreatureFeats({ concept, candidates: featCandidates });
  assert.deepEqual(feats.feats, [{
    name: "Reactive Shield", candidate: { packId: "pf2e.feats-srd", _id: "shield" }
  }]);

  // A provider can obey the JSON field shape but put an exact displayed name
  // into `id`. That must still resolve through the issued catalog, without a
  // fuzzy lookup or a model-supplied compendium reference.
  replies.push({ featIds: ["Sudden Charge"] });
  const namedFeat = await selectCreatureFeats({ concept, candidates: featCandidates });
  assert.deepEqual(namedFeat.feats, [{
    name: "Sudden Charge", candidate: { packId: "pf2e.feats-srd", _id: "charge" }
  }]);

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
  assert.equal(feats.omitted, false, "mixed valid/invalid picks preserve existing grounded selection behavior");
  assert.equal(namedFeat.omitted, false);
  for (const featIds of [["invented"], [null], [{ packId: "pf2e.feats-srd", _id: "shield" }]]) {
    replies.push({ featIds });
    const invalid = await selectCreatureFeats({ concept, candidates: featCandidates });
    assert.deepEqual(invalid.feats, []);
    assert.equal(invalid.omitted, false, "unresolvable nonempty replies are not intentional omission");
  }
  const beforeSkip = requests.length;
  const unavailable = await selectCreatureFeats({ concept, candidates: [] });
  assert.equal(unavailable.omitted, false, "an unavailable catalog does not decline draft requirements");
  assert.equal(requests.length, beforeSkip);
  replies.push({ picks: [] }, { picks: [] });
  await assert.rejects(selectCreatureFeats({ concept, candidates: featCandidates }),
    "malformed replies still fail after the bounded retry");
  assert.equal(requests.length, beforeSkip + 2);
  assert.equal(replies.length, 0);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("ai creature grounding: production task contracts and exact-ID filtering passed");
