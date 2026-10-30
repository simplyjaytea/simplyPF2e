// Token cut round 2 (docs/plans/token-budget-2026-10-30.md, Phase 2b): selector calls send a bounded
// concept summary instead of the full backstory; equipment/loot, loot scroll and creature ability lists are
// smaller, but an exact first-draft name always survives the cut; a structural retry still resends the full
// prompt (a short retry would drop the candidate lists the model must pick from).
// Run: node tests/ai.tokenRound2.test.mjs
import assert from "node:assert/strict";
import { SETTINGS } from "../scripts/settings.mjs";
import { selectorSummary, chooseSpellFocus } from "../scripts/ai.mjs";
import {
  limitEquipmentCandidates, limitSpellCandidates, getAbilityCandidates, getScrollSpellCandidates,
  EQUIPMENT_CANDIDATE_LIMIT, LOOT_CANDIDATE_LIMIT, LOOT_SCROLL_CANDIDATE_LIMIT
} from "../scripts/compendium.mjs";

// ---- summary: bounded, deterministic, cut on a boundary, identity first
const concept = {
  name: "Ariadne", level: 8, ancestry: "Human", class: "Bard", blurb: "A wandering singer.",
  description: "A long story about the sea. ".repeat(60), traits: [], gmPrompt: "Original instruction ".repeat(250)
};
const summary = selectorSummary(concept);
assert.ok(summary.length <= 360, `summary is capped (${summary.length})`);
assert.ok(summary.startsWith("Ariadne, level 8, Human, Bard. A wandering singer."), summary);
assert.equal(summary, selectorSummary(concept), "deterministic");
assert.match(summary, /[.!?]$/, "cut at a sentence boundary when one is available");
const wordy = selectorSummary({ name: "W", level: 1, description: "abcdefghij ".repeat(80) });
assert.ok(wordy.length <= 360 && !/abcdefghi$/.test(wordy.replace(/abcdefghij$/, "")), "never cuts inside a word");
assert.ok(wordy.split(" ").every((word) => word === "W," || word === "level" || word === "1." || word === "abcdefghij" || word === "1"),
  `whole words only: ${wordy.slice(-30)}`);
assert.equal(selectorSummary({ name: "Short", level: 2, blurb: "Brief." }), "Short, level 2. Brief.", "short text is kept whole");

// ---- caps, with exact first-draft names kept above them
assert.equal(EQUIPMENT_CANDIDATE_LIMIT, 60);
assert.equal(LOOT_CANDIDATE_LIMIT, 60);
assert.equal(LOOT_SCROLL_CANDIDATE_LIMIT, 24);
const items = Array.from({ length: 100 }, (_, i) => ({ name: `Item ${i}`, type: "weapon", level: 1 }));
assert.ok(limitEquipmentCandidates(items).length <= 60, "no keywords: the cap holds");
assert.ok(limitEquipmentCandidates(items, ["item 99"]).some((x) => x.name === "Item 99"));
assert.equal(limitEquipmentCandidates(items, items.slice(0, 65).map((x) => x.name)).length, 65,
  "every exact draft survives even over the nominal cap");

const spells = Array.from({ length: 80 }, (_, i) => ({ name: `Spell ${String(i).padStart(2, "0")}`, rank: 1 + (i % 3), traits: [], rarity: "common" }));
assert.ok(limitSpellCandidates(spells, ["fire"], LOOT_SCROLL_CANDIDATE_LIMIT, null, true).length <= 24, "scroll cap holds");
const draftScrolls = spells.slice(50, 80).map((s) => s.name);
const keptScrolls = limitSpellCandidates(spells, draftScrolls, LOOT_SCROLL_CANDIDATE_LIMIT, null, true).map((s) => s.name);
assert.ok(draftScrolls.every((name) => keptScrolls.includes(name)), "every exact first-draft scroll spell survives above the cap");

// ---- creature abilities: 48, exact draft names kept above the cap
const actions = Array.from({ length: 70 }, (_, i) => ({
  _id: `a${i}`, name: `Action ${String(i).padStart(2, "0")}`, type: "action", system: { traits: { value: [] }, actionType: { value: "action" } }
}));
const scrollIndex = spells.map((spell, i) => ({
  _id: `s${i}`, name: spell.name, type: "spell", system: { level: { value: spell.rank }, traits: { value: [], rarity: "common" } }
}));
const values = new Map([
  [SETTINGS.apiBaseUrl, "http://localhost:11434/v1"], [SETTINGS.apiKey, ""], [SETTINGS.model, "test"],
  [SETTINGS.temperature, 0.8], [SETTINGS.maxTokens, 8000], [SETTINGS.requestTimeout, 90],
  [SETTINGS.sourcePacks, { abilities: ["test.actions"], spells: ["test.spells"] }]
]);
globalThis.game = {
  settings: { get: (_, key) => values.get(key) },
  i18n: { localize: (x) => x, format: (x, v) => `${x}:${JSON.stringify(v)}` },
  packs: { get: (id) => (id === "test.actions" ? { getIndex: async () => actions }
    : id === "test.spells" ? { getIndex: async () => scrollIndex } : null) }
};
const someAbilities = await getAbilityCandidates(["unrelated"]);
assert.equal(someAbilities.length, 48, "ability cap is 48");
const draftAbilities = actions.slice(10, 60).map((a) => a.name);
const keptAbilities = (await getAbilityCandidates(draftAbilities)).map((a) => a.name);
assert.ok(draftAbilities.every((name) => keptAbilities.includes(name)), "all 50 exact draft abilities survive above the cap");

// The loot path asks getScrollSpellCandidates for 24 and must still keep every exact draft scroll.
const scrollPath = (await getScrollSpellCandidates(10, draftScrolls, { limit: LOOT_SCROLL_CANDIDATE_LIMIT })).map((s) => s.name);
assert.ok(draftScrolls.every((name) => scrollPath.includes(name)), "the loot scroll path keeps every exact draft above the cap");
assert.ok((await getScrollSpellCandidates(10, ["unrelated"], { limit: LOOT_SCROLL_CANDIDATE_LIMIT })).length <= 24, "the loot scroll path caps at 24");

// ---- retries: exactly one, usage summed, and a structural failure resends the full prompt
const original = globalThis.fetch;
async function trial(first, prompt) {
  const bodies = [];
  let n = 0;
  globalThis.fetch = async (_url, opts) => {
    bodies.push(JSON.parse(opts.body));
    n++;
    const content = n === 1 ? first : '{"keywords":["fire"]}';
    return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } }),
      { headers: { "content-type": "application/json" } });
  };
  const result = await chooseSpellFocus({ concept: { ...concept, gmPrompt: prompt }, tradition: "arcane" });
  assert.equal(n, 2);
  assert.equal(result.usage.total, 10, "usage is summed across both attempts");
  return bodies.map((body) => body.messages.find((message) => message.role === "user").content);
}
try {
  const structural = await trial("{}", concept.gmPrompt);
  assert.ok(structural[0].includes(concept.gmPrompt), "the first request carries the untrimmed GM request");
  assert.ok(structural[1].startsWith(structural[0]), "a structural retry resends the full original prompt");
  const malformed = await trial("{", concept.gmPrompt);
  assert.ok(malformed[1].startsWith(malformed[0]), "a malformed reply resends the full original prompt");
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ choices: [{ message: { content: "{}" }, finish_reason: "stop" }] }), { headers: { "content-type": "application/json" } });
  };
  await assert.rejects(chooseSpellFocus({ concept, tradition: "arcane" }));
  assert.equal(calls, 2, "exactly one retry");
} finally {
  globalThis.fetch = original;
}

console.log("ai.tokenRound2.test.mjs: bounded selector summary, smaller lists keep exact drafts, one full-prompt retry");
