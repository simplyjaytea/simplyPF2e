// WP5 H3a: the hazard concept task round-trips through the production provider path,
// rejects prose that could become mechanics or enrichers, and drops unoffered optional
// values with a warning. The provider is stubbed; the Foundry globals are stubbed too.
import assert from "node:assert/strict";
import { SETTINGS } from "../scripts/settings.mjs";
import { AI_TASK, completionOptionsFor } from "../scripts/ai-task-profiles.mjs";
import { HAZARD_LABEL_KEYS } from "../scripts/hazard-labels.mjs";
import { hazardProseProblem } from "../scripts/hazard-builder.mjs";
import { readFile } from "node:fs/promises";
const settings = new Map();
settings.set(SETTINGS.apiBaseUrl, "http://localhost:11434/v1");
settings.set(SETTINGS.apiKey, "");
settings.set(SETTINGS.apiKeyBaseUrl, "");
settings.set(SETTINGS.model, "test-model");
settings.set(SETTINGS.temperature, 0.8);
settings.set(SETTINGS.maxTokens, 8000);
settings.set(SETTINGS.requestTimeout, 90);
settings.set(SETTINGS.experimentalTools, true);
globalThis.game = { system: { id: "pf2e" }, user: { isGM: true } };
globalThis.game.settings = { get: (_module, key) => settings.get(key) };
globalThis.game.i18n = { localize: (key) => key, format: (key, data) => key + ":" + JSON.stringify(data) };
const replies = [];
const requests = [];
const warnings = [];
const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
globalThis.fetch = async (_url, options) => {
  requests.push(JSON.parse(options.body));
  assert.ok(replies.length, "unexpected provider request");
  const reply = replies.shift();
  const body = { choices: [{ message: { content: JSON.stringify(reply) }, finish_reason: "stop" }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } };
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
};
console.warn = (...args) => warnings.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
const TRAITS = ["mechanical", "trap", "fire", "magical", "electricity"];
const DAMAGE = ["piercing", "slashing", "bludgeoning", "fire", "acid", "poison", "electricity"];
const SKILLS = ["thievery", "athletics", "acrobatics", "arcana", "crafting", "deception", "diplomacy", "intimidation", "nature", "occultism", "performance", "religion", "survival"];
const LISTS = { level: 4, traitsCatalog: TRAITS, damageTypes: DAMAGE, disableSkills: SKILLS };
const BRIEF = "a spiked gate that drops on whoever steps on the threshold";
const { generateHazardConcept, AIRequestError } = await import("../scripts/ai.mjs");
const complex = { name: "Rune-Carved Spike Gate", description: "A gate of iron spikes is etched with runes that wake when weight shifts on the threshold.", traits: ["mechanical", "trap"], rarity: "uncommon", complex: true, stealth: "high", disable: [{ skill: "thievery", scale: "high" }, { skill: "arcana", scale: "low" }], dispel: true, ac: "high", saves: { fortitude: "high", reflex: null, will: "low" }, hasHP: true, reaction: { name: "Spiked Drop", trigger: "A creature steps onto the threshold.", effect: "The gate drops its spikes and makes a strike against the creature.", strike: { name: "Iron Spikes", damageType: "piercing" }, save: null }, routine: { actions: 2, text: "The gate raises and lowers its spikes and strikes each creature in the doorway.", strike: { name: "Spike Sweep", damageType: "piercing" } }, reset: "The spikes retract once the threshold is clear and the gate is wound back by hand." };
const simple = { name: "Hidden Pit", description: "A trapdoor hides beneath a thin layer of leaves.", traits: ["mechanical", "trap"], rarity: "common", complex: false, stealth: "low", disable: [{ skill: "thievery", scale: "low" }], dispel: false, ac: "low", saves: { fortitude: null, reflex: "high", will: null }, hasHP: true, reaction: { name: "Pitfall", trigger: "A creature walks onto the trapdoor.", effect: "The trapdoor opens and the creature falls.", strike: null, save: { type: "reflex", scale: "high", effect: "A success keeps the creature from falling." } }, routine: null, reset: "" };
replies.push(structuredClone(complex));
const run = await generateHazardConcept(BRIEF, LISTS);
assert.deepEqual(run.concept, complex, "a valid complex concept round-trips unchanged");
assert.equal(run.usage.total, 30);
assert.equal(requests.length, 1);
assert.equal(requests[0].max_tokens, 2000, "the hazard task keeps its own budget");
assert.equal(requests[0].temperature, 0.8, "a creative task keeps the configured temperature");
replies.push(structuredClone(simple));
const simpleRun = await generateHazardConcept("a hidden pit", LISTS);
assert.deepEqual(simpleRun.concept, simple, "a simple concept round-trips with routine null");
warnings.length = 0;
replies.push({ ...structuredClone(simple), routine: { actions: 1, text: "The pit yawns.", strike: null } });
const dropped = await generateHazardConcept("a hidden pit", LISTS);
assert.equal(dropped.concept.routine, null);
assert.ok(warnings.some((w) => /routine dropped/.test(w)), "a routine on a simple hazard is dropped with a warning");
const system = requests[0].messages[0].content;
for (const item of [...TRAITS, ...DAMAGE, ...SKILLS]) assert.ok(system.includes(item), "offered value missing from prompt: " + item);
assert.match(system, /Never emit a number, DC, bonus, damage, dice formula, distance, or level\./);
assert.match(system, /"actions": 1 \| 2 \| 3/);
assert.match(system, /"dispel": boolean/);
assert.match(system, /The module sets the spell rank/);
assert.doesNotMatch(system, /"rank"|dispel rank/, "the AI never writes a dispel rank");
assert.match(system, /The only integer you may write is routine actions \(1, 2 or 3\)/);
assert.match(system, /such as three darts or a 5-foot square/);
assert.doesNotMatch(system, /no digits/i, "the prompt matches the prose policy, which allows plain counts and distances");
assert.match(system, /Scale words: extreme \(hardest to notice, disable or hit\), high, low\./);
assert.match(system, /include a routine only when complex is true/);
assert.match(system, /no @ commands \(such as @Check, @Damage or @UUID\), no square brackets/);
assert.match(system, /Respond with ONLY one JSON object/);
assert.match(requests[0].messages[1].content, /"gmBrief":"a spiked gate/);
const before4 = requests.length;
const digitProse = structuredClone(complex);
digitProse.description = "The gate deals 2d6 piercing damage.";
replies.push(digitProse, structuredClone(complex));
const retried = await generateHazardConcept(BRIEF, LISTS);
assert.deepEqual(retried.concept, complex, "digits in prose are rejected once and the retry succeeds");
assert.equal(requests.length - before4, 2);
const enriched = structuredClone(complex);
enriched.reaction.effect = "The gate makes a @Check[thievery|dc:18] roll.";
replies.push(enriched, structuredClone(enriched));
await assert.rejects(generateHazardConcept(BRIEF, LISTS), (error) => error instanceof AIRequestError && /Hazard\.Errors\.Prose/.test(error.message) && /reaction\.effect/.test(error.message));
warnings.length = 0;
replies.push({ ...structuredClone(complex), stealth: 18, saves: { fortitude: 11, reflex: null, will: "low" } });
const slot = await generateHazardConcept(BRIEF, LISTS);
assert.equal(slot.concept.stealth, null, "a number in a scale slot is dropped, never copied");
assert.equal(slot.concept.saves.fortitude, null);
assert.equal(slot.concept.saves.will, "low");
assert.ok(warnings.some((w) => /hazard stealth dropped/.test(w)));
warnings.length = 0;
replies.push({ ...structuredClone(complex), traits: ["fire", "invented-trait"] });
const traitRun = await generateHazardConcept(BRIEF, LISTS);
assert.deepEqual(traitRun.concept.traits, ["fire"]);
assert.ok(warnings.some((w) => /hazard trait dropped.*invented-trait/.test(w)), "an unoffered trait is dropped with a warning");
warnings.length = 0;
replies.push({ ...structuredClone(complex), dc: 18 });
const extra = await generateHazardConcept(BRIEF, LISTS);
assert.equal(Object.hasOwn(extra.concept, "dc"), false);
assert.ok(warnings.some((w) => /concept field dropped.*dc/.test(w)));
const nameless = structuredClone(complex);
delete nameless.name;
replies.push(nameless, structuredClone(nameless));
const beforeName = requests.length;
await assert.rejects(generateHazardConcept(BRIEF, LISTS), (error) => error instanceof AIRequestError && error.retryable === true && error.message.includes("Hazard.Errors.Field") && error.message.includes("name"));
assert.equal(requests.length - beforeName, 2, "a missing required field is retried once, then rejected");
const noRoutine = structuredClone(complex);
noRoutine.routine = null;
replies.push(noRoutine, structuredClone(noRoutine));
await assert.rejects(generateHazardConcept(BRIEF, LISTS), (error) => error instanceof AIRequestError && error.message.includes("Hazard.Errors.Routine"));
warnings.length = 0;
const oddOptional = structuredClone(complex);
oddOptional.dispel = { rank: 3 };
oddOptional.reaction.strike = { name: "Sonic Spikes", damageType: "sonic" };
replies.push(oddOptional);
const odd = await generateHazardConcept(BRIEF, LISTS);
assert.equal(odd.concept.dispel, false);
assert.equal(odd.concept.reaction.strike, null);
assert.ok(warnings.some((w) => /hazard dispel dropped/.test(w)));
assert.ok(warnings.some((w) => /reaction strike dropped/.test(w)));
const beforeGate = requests.length;
settings.set(SETTINGS.experimentalTools, false);
await assert.rejects(generateHazardConcept(BRIEF, LISTS), (error) => error.code === "disabled");
settings.set(SETTINGS.experimentalTools, true);
assert.equal(requests.length, beforeGate, "a closed gate spends no provider tokens");
const beforeArgs = requests.length;
await assert.rejects(generateHazardConcept(BRIEF, { ...LISTS, traitsCatalog: [] }), TypeError);
await assert.rejects(generateHazardConcept(BRIEF, { ...LISTS, level: 25 }), (error) => error instanceof TypeError && /-1 to 24/.test(error.message), "the level range comes from the shared table constants");
assert.equal(requests.length, beforeArgs, "bad arguments are refused before any request");
assert.deepEqual(completionOptionsFor(AI_TASK.HAZARD_CONCEPT, { configuredTemperature: 0.8, configuredMaxTokens: 8000 }), { temperature: 0.8, maxTokens: 2000, reasoningEffort: "none", thinkingType: "disabled" });
// One prose policy for both layers: the retry gate in ai.mjs and hazardProseProblem in hazard-builder.mjs agree.
const ALLOWED_PROSE = [
  "The trap fills a 5-foot square.",
  "Darts fly up to 10 feet.",
  "Three darts hit the target.",
  "The vents stay open for 2 rounds."
];
const REFUSED_PROSE = [
  "Anyone can open it with DC 18.",
  "The door has AC 17.",
  "The runes give a +14 bonus.",
  "It hits for 2d6 points.",
  "It deals 10 damage.",
  "The gate makes a @Check[thievery|dc:18] roll."
];
for (const text of ALLOWED_PROSE) {
  assert.equal(hazardProseProblem(text), null, "builder layer accepts: " + text);
  const before = requests.length;
  replies.push({ ...structuredClone(complex), description: text });
  const accepted = await generateHazardConcept(BRIEF, LISTS);
  assert.equal(accepted.concept.description, text, "AI layer accepts: " + text);
  assert.equal(requests.length - before, 1, "an allowed sample needs no retry: " + text);
}
for (const text of REFUSED_PROSE) {
  assert.equal(typeof hazardProseProblem(text), "string", "builder layer refuses: " + text);
  const before = requests.length;
  const bad = { ...structuredClone(complex), description: text };
  replies.push(structuredClone(bad), structuredClone(bad));
  await assert.rejects(generateHazardConcept(BRIEF, LISTS), (error) => error instanceof AIRequestError && /Hazard\.Errors\.Prose/.test(error.message) && /description/.test(error.message) && /reason/.test(error.message), "AI layer refuses: " + text);
  assert.equal(requests.length - before, 2, "a refused sample is retried once, then rejected: " + text);
}
const badName = { ...structuredClone(complex), name: "Spike Gate 2d6" };
replies.push(structuredClone(badName), structuredClone(badName));
await assert.rejects(generateHazardConcept(BRIEF, LISTS), (error) => error instanceof AIRequestError && /Hazard\.Errors\.Prose/.test(error.message) && /name/.test(error.message), "a name carries the same policy");
warnings.length = 0;
for (const dispel of [{ rank: 3 }, "yes", null, 3]) {
  replies.push({ ...structuredClone(simple), dispel });
  const nonBoolean = await generateHazardConcept(BRIEF, LISTS);
  assert.equal(nonBoolean.concept.dispel, false, "a non-boolean dispel becomes false: " + JSON.stringify(dispel));
}
assert.equal(warnings.filter((w) => /hazard dispel dropped/.test(w)).length, 4, "each non-boolean dispel warns");
const lang = JSON.parse(await readFile(new URL("../lang/en.json", import.meta.url), "utf8"));
for (const key of Object.values(HAZARD_LABEL_KEYS)) assert.equal(typeof key.split(".").reduce((node, part) => node[part], lang), "string", key);
for (const key of ["Field", "Prose", "Routine"]) assert.equal(typeof lang.SIMPLYPF2E.Hazard.Errors[key], "string", key);
assert.equal(replies.length, 0, "every scripted reply was consumed");
globalThis.fetch = originalFetch;
console.warn = originalWarn;
console.log("ai hazard concept: contract, prompt, validation and gate passed");
