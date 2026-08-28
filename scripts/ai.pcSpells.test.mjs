// Production request + validation; network and Foundry settings are mocked.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SETTINGS } from "./settings.mjs";

const settings = new Map([
  [SETTINGS.apiBaseUrl, "http://localhost:11434/v1"], [SETTINGS.apiKey, ""],
  [SETTINGS.apiKeyBaseUrl, ""], [SETTINGS.model, "test-model"],
  [SETTINGS.temperature, 0.8], [SETTINGS.maxTokens, 8000], [SETTINGS.requestTimeout, 90]
]);
globalThis.game = { settings: { get: (_module, key) => settings.get(key) },
  i18n: { localize: (key) => key, format: (key) => key } };
const requests = [];
const replies = [];
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
  const { selectSpells } = await import("./ai.mjs");
  const args = {
    concept: { name: "Wizard", level: 5, traits: [], spellcasting: { tradition: "arcane", spells: [] } },
    candidates: [{ name: "Detect Magic", rank: 0 }, { name: "Force Barrage", rank: 1 }, { name: "Fireball", rank: 3 }],
    maxRank: 3, plannedSlots: { 0: 5, 1: 3, 2: 3, 3: 2 }, preparationMode: "prepared"
  };
  const picks = [
    { name: "Detect Magic", rank: 0 }, { name: "Detect Magic", rank: 0 },
    { name: "Detect Magic", rank: 1 }, { name: "Invented Spell", rank: 1 },
    { name: "force barrage", rank: 1 }, // exact catalog names, no fuzzy acceptance
    { name: "Force Barrage", rank: 1 }, { name: "Force Barrage", rank: 1 },
    { name: "Force Barrage", rank: 1 }, { name: "Force Barrage", rank: 1 },
    { name: "Force Barrage", rank: 2 }, { name: "Force Barrage", rank: "2" },
    { name: "Force Barrage", rank: 2.5 }, { name: "Force Barrage", rank: 0 },
    { name: "Fireball", rank: 2 }, { name: "Fireball", rank: 3 },
    { name: "Fireball", rank: 4 }, null, {}, { name: "Force Barrage", rank: -1 }
  ];
  const rankSlugs = ["cantrip", "rank-one", "rank-two", "rank-three", "rank-four"];
  const modelPicks = picks.map((pick) => pick && ({ ...pick,
    rank: Number.isInteger(pick.rank) && pick.rank >= 0 ? rankSlugs[pick.rank] : pick.rank }));
  modelPicks.push({ name: "Force Barrage", rank: 2 }); // model numbers are forbidden
  replies.push({ spells: modelPicks });
  const prepared = await selectSpells(args);
  assert.deepEqual(prepared.spells, [
    { name: "Detect Magic", rank: 0 },
    ...Array.from({ length: 3 }, () => ({ name: "Force Barrage", rank: 1 })),
    { name: "Force Barrage", rank: 2 }, { name: "Fireball", rank: 3 }
  ], "only explicit legal preparations fill slots, including repeated ranked picks");
  assert.equal(prepared.usage.total, 30);
  assert.equal(requests[0].temperature, 0);
  assert.equal(requests[0].max_tokens, 3072);
  assert.match(requests[0].messages[0].content, /ONE daily slot/);
  assert.match(requests[0].messages[0].content, /"cantrip":5,"rank-one":3,"rank-two":3,"rank-three":2/);
  assert.match(requests[0].messages[0].content, /enum slugs, never a number/);

  replies.push({ spells: modelPicks });
  const spontaneous = await selectSpells({ ...args, preparationMode: "spontaneous" });
  assert.deepEqual(spontaneous.spells, [
    { name: "Detect Magic", rank: 0 }, { name: "Force Barrage", rank: 1 },
    { name: "Force Barrage", rank: 2 }, { name: "Fireball", rank: 3 }
  ], "spontaneous repertoire deduplicates within rank, not across ranks");

  replies.push({ spells: [] });
  assert.deepEqual((await selectSpells(args)).spells, [], "no invented fill for empty plans");
  replies.push({}, { spells: [{ name: "Fireball", rank: "rank-three" }] });
  assert.equal((await selectSpells(args)).usage.total, 60, "PC operation retains structural retry accounting");
  const before = requests.length;
  await assert.rejects(selectSpells({ ...args, plannedSlots: { 1: 999 } }), /Invalid character/);
  await assert.rejects(selectSpells({ ...args, preparationMode: "invented" }), /Invalid character/);
  await assert.rejects(selectSpells({ ...args, plannedSlots: [] }), /Invalid character/);
  await assert.rejects(selectSpells({ ...args, maxRank: 11 }), /Invalid character/);
  assert.equal(requests.length, before, "invalid module plans cannot spend tokens");

  replies.push({ spells: [{ name: "Force Barrage", rank: 0 }] });
  const legacy = await selectSpells({ ...args, plannedSlots: undefined, preparationMode: undefined });
  assert.deepEqual(legacy.spells, [{ name: "Force Barrage", rank: 1 }]);
  assert.equal(requests.at(-1).max_tokens, 1536, "NPC selection keeps its existing profile");
  assert.equal(replies.length, 0);
} finally { globalThis.fetch = originalFetch; }

// Static wiring is not live ApplicationV2 QA. Guard the ownership and fallback
// boundary while provider and builder tests exercise the real functions.
const generator = readFileSync(new URL("./generator-app.mjs", import.meta.url), "utf8");
const template = readFileSync(new URL("../templates/generator.hbs", import.meta.url), "utf8");
const locale = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
assert.match(generator, /pcSpellcastingProfile\(resolved\.classDoc\)/);
assert.match(generator, /plannedSlots: spellcasting\.plannedSlots/);
assert.match(generator, /preparationMode: spellcasting\.preparationMode/);
assert.ok(generator.indexOf("if (spellcasting.plannedSlots) return;") < generator.indexOf("if (requireSpells && draft.length)"),
  "failed grounded plans cannot fall through to the unplanned legacy draft");
assert.match(template, /role="status">\{\{pcPreview\.spellcastingNotice\}\}/, "escaped, accessible review notice");
for (const key of ["PCBaseSpellPlan", "PCVariableSpellPlan", "PCApproximateSpellPlan"]) {
  assert.ok(locale.SIMPLYPF2E.Preview[key]);
}
console.log("PC spell planning: production requests and preview wiring passed");
