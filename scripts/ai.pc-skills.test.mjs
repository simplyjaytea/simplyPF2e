import assert from "node:assert/strict";
import { SETTINGS } from "./settings.mjs";
import { CORE_SKILLS } from "./pc-skills.mjs";
import { normalizePCConcept } from "./pc-builder.mjs";

const settings = new Map([[SETTINGS.apiBaseUrl, "http://localhost:11434/v1"], [SETTINGS.apiKey, ""],
  [SETTINGS.apiKeyBaseUrl, ""], [SETTINGS.model, "test-model"], [SETTINGS.temperature, 0.8],
  [SETTINGS.maxTokens, 8000], [SETTINGS.requestTimeout, 90]]);
globalThis.game = { settings: { get: (_module, key) => settings.get(key) },
  i18n: { localize: (key) => key, format: (key) => key } };
const { generatePCConcept } = await import("./ai.mjs");
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
} finally { globalThis.fetch = originalFetch; }
console.log("ai.pc-skills.test.mjs: existing request, enum priorities, and backwards compatibility passed");
