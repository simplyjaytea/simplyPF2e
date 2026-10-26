import assert from "node:assert/strict";
import { SETTINGS } from "../scripts/settings.mjs";
import { CORE_SKILLS } from "../scripts/pc-skills.mjs";
import { normalizePCConcept } from "../scripts/pc-builder.mjs";

const settings = new Map([[SETTINGS.apiBaseUrl, "http://localhost:11434/v1"], [SETTINGS.apiKey, ""],
  [SETTINGS.apiKeyBaseUrl, ""], [SETTINGS.model, "test-model"], [SETTINGS.temperature, 0.8],
  [SETTINGS.maxTokens, 8000], [SETTINGS.requestTimeout, 90]]);
globalThis.game = { settings: { get: (_module, key) => settings.get(key) },
  i18n: { localize: (key) => key, format: (key) => key } };
const { generatePCConcept, selectAncestryBackgroundClass } = await import("../scripts/ai.mjs");
const fixture = {
  name: "Scout", ancestry: "Human", heritage: null, background: "Hunter", class: "Ranger", keyAbility: "dex",
  blurb: "A watchful scout", backstory: "A scout who protects travellers.", appearance: "", age: "", gender: "",
  height: "", weight: "", ethnicity: "", nationality: "", personality: "", alignmentFlavor: "", likes: "", dislikes: "",
  allies: "", enemies: "", organizations: "", languages: [], feats: [], spellcasting: null, focusSpells: [], equipment: []
};
let response, calls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (_url, options) => {
  calls.push(JSON.parse(options.body));
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(response) }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } }), { headers: { "content-type": "application/json" } });
};
try {
  for (const [extra, expected] of [
    [{}, []],
    [{ skillPriorities: ["survival", "stealth", "survival"] }, ["survival", "stealth"]],
    [{ skillPriorities: ["survival", 4, "invented-skill", { rank: 4 }] }, ["survival"]],
    [{ skillPriorities: { athletics: 4 } }, []]
  ]) {
    response = { ...fixture, ...extra };
    calls = [];
    const result = await generatePCConcept({ prompt: "Scout", level: 5, allowSpellcasting: false });
    assert.equal(calls.length, 1, "skill preferences reuse the existing concept request, including old responses");
    assert.equal(result.usage.total, 30);
    const system = calls[0].messages[0].content;
    assert.match(system, /"skillPriorities": string\[\]/);
    assert.match(system, /Never provide ranks, counts, scores/);
    for (const slug of CORE_SKILLS) assert.ok(system.includes(slug));
    assert.deepEqual(normalizePCConcept(result.concept, { level: 5 }).skillPriorities, expected);
  }
  // Required identity hint. Class paths are an object keyed by bridge name, so they must be listed as
  // bridge name to candidate name in both prompts; reading value.name would drop them silently.
  const requiredIdentity = { class: { name: "Wizard" }, classPaths: { "Arcane School": { name: "School of Mentalism" } } };
  response = { ...fixture };
  calls = [];
  await generatePCConcept({ prompt: "Scout", level: 5, allowSpellcasting: true, requiredIdentity });
  const conceptHint = calls[0].messages[1].content;
  assert.match(conceptHint, /Arcane School/, "the bridge name is in the concept prompt");
  assert.match(conceptHint, /School of Mentalism/, "the candidate name is in the concept prompt");
  assert.match(conceptHint, /"class":"Wizard","classPaths":\{"Arcane School":"School of Mentalism"\}/);
  response = { ancestryId: "A0", heritageId: null, backgroundId: "B0", classId: "C0", keyAbility: "int" };
  calls = [];
  const candidate = (id, name) => ({ id, name, ref: { packId: "pf2e.test", _id: id } });
  const school = candidate("S0", "School of Mentalism");
  await selectAncestryBackgroundClass({
    concept: {
      ...fixture, level: 5, requiredIdentity: { classPaths: { "Arcane School": school } },
      classPaths: { "Arcane School": school.name }, classPathCandidates: { "Arcane School": school.ref }
    },
    ancestryCandidates: [candidate("A0", "Human")], backgroundCandidates: [candidate("B0", "Scholar")], classCandidates: [candidate("C0", "Wizard")]
  });
  const selectionHint = calls[0].messages[1].content;
  assert.match(selectionHint, /Arcane School/, "the bridge name is in the selector prompt");
  assert.match(selectionHint, /School of Mentalism/, "the candidate name is in the selector prompt");
} finally { globalThis.fetch = originalFetch; }
console.log("ai.pc-skills.test.mjs: existing request, enum priorities, backwards compatibility and the class-path identity hint passed");
