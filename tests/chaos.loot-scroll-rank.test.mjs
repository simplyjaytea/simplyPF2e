// Regression test adapted from Troy’s ce8092c reproduction; runs in the gate.
import assert from "node:assert/strict";
import { SETTINGS } from "../scripts/settings.mjs";

const settings = new Map([
  [SETTINGS.apiBaseUrl, "http://localhost:11434/v1"], [SETTINGS.apiKey, ""],
  [SETTINGS.apiKeyBaseUrl, ""], [SETTINGS.model, "test-model"],
  [SETTINGS.temperature, 0.8], [SETTINGS.maxTokens, 8000], [SETTINGS.requestTimeout, 90]
]);
globalThis.game = {
  settings: { get: (_module, key) => settings.get(key) },
  i18n: { localize: (key) => key, format: (key, data) => `${key}:${JSON.stringify(data)}` }
};

let reply = { loot: [] };
globalThis.fetch = async () => new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify(reply) }, finish_reason: "stop" }],
  usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 }
}), { headers: { "content-type": "application/json" } });

const { selectLoot } = await import("../scripts/ai.mjs");
const { treasureBudget } = await import("../scripts/tables.mjs");

const LEVEL = 1;
// The module's own stated loot policy: a scroll's rank may not exceed this.
const POLICY_MAX_RANK = Math.ceil((LEVEL + 2) / 2); // = 2

const ref = (packId, id) => ({ packId, _id: id });
const longId = (pack, id) => `c-${Buffer.from(`${pack}\u0000${id}`).toString("base64").replaceAll("=", "")}`;
const scrollCandidates = [{
  id: longId("pf2e.spells-srd", "fireball"),
  name: "Fireball",
  rank: 3, // real rank-3 spell; the model raised it to 10 in the reply below
  traits: [],
  ref: ref("pf2e.spells-srd", "fireball")
}];
const concept = {
  name: "Bog Lurker", level: LEVEL, rarity: "common",
  blurb: "A filthy thing in the reeds", description: "It waits.",
  traits: ["aberration"], strikes: [{ name: "claw", type: "melee" }],
  equipment: [], specialAbilities: [],
  loot: [{ name: "Scroll of Fireball (Rank 3)", quantity: 1 }],
  spellcasting: null, gmPrompt: "a swamp lurker"
};

// The model does what the prompt allows: it takes an offered spell and raises
// the rank, which the schema permits up to 10.
reply = { loot: [{ scrollSpellId: "S0", rank: 10, quantity: 1 }] };

const silent = console.warn;
console.warn = () => {};
const { loot } = await selectLoot({ concept, candidates: [], scrollCandidates });
console.warn = silent;

const ranks = loot
  .map((line) => /\(Rank (\d+)\)$/.exec(line.name))
  .filter(Boolean)
  .map((match) => Number(match[1]));

console.warn(`budget for a level-1 creature: ${treasureBudget(LEVEL)} gp; built scroll: ${JSON.stringify(loot)}`);
assert.deepEqual(ranks, [], "oversized spell and rank must be dropped");
reply = { loot: [{ scrollSpellId: "S0", rank: 10, quantity: 1 }] };
scrollCandidates[0].rank = 1;
assert.deepEqual((await selectLoot({ concept, candidates: [], scrollCandidates })).loot, [], "oversized heightened rank must be dropped");
reply = { loot: [{ scrollSpellId: "S0", rank: 1, quantity: 1 }] };
scrollCandidates[0].rank = 2;
assert.equal((await selectLoot({ concept, candidates: [], scrollCandidates })).loot[0].name, "Scroll of Fireball (Rank 2)", "base rank is the minimum");
console.log("chaos.loot-scroll-rank.test.mjs: loot scroll stayed within the level policy");
