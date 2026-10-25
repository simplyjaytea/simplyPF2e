// Pure reskin policy regressions: hostile enricher text, numeric mechanics,
// strict output schema, escaping, whitelisted context, payload fidelity, and
// mechanical/notes fingerprints. No Foundry globals and no provider calls.
// Run: node tests/reskin-policy.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AI_TASK } from "../scripts/ai-task-profiles.mjs";
import { taskResponseProblem } from "../scripts/ai-response-validation.mjs";
import {
  canonicalJSON, composePublicNotes, digestOf, enricherTokens, flavorBlockHtml, mechanicalSnapshot,
  plainText, publicNotesProblems, reskinContext, reskinMechanicsProblems, reskinOutputProblem,
  reskinPayload, reskinTextProblem
} from "../scripts/reskin-policy.mjs";

// Hostile inputs that PF2e or Foundry would enrich or that could escape as markup.
const HOSTILE_ENRICHERS = [
  "@Check[type:reflex|dc:20|basic:true] save",
  "@Damage[2d6[fire]] damage",
  "@UUID[Compendium.pf2e.conditionitems.Item.Stunned]{Stunned 1}",
  "[[/r 1d20]] roll",
  "[[/act stride]] now",
  "@Template[type:burst|distance:10]",
  "@Localize[PF2E.Trait.Undead]",
  "&Reference[condition=\"stunned\"]",
  "@Embed[JournalEntry.abc]",
  "a [sic] creature",
  "a plain @Check"
];
for (const text of HOSTILE_ENRICHERS) {
  for (const field of ["flavor", "biography"]) {
    assert.notEqual(reskinTextProblem(field, text), null, `${field} must reject enricher text: ${text}`);
  }
}
assert.notEqual(reskinTextProblem("name", "@UUID[x]{Name}"), null, "a name is also rejected for enricher syntax");
assert.notEqual(reskinTextProblem("name", "<img src=x onerror=alert(1)>"), null,
  "a name may not carry HTML");
assert.notEqual(reskinTextProblem("name", "Mara\nVantor"), null, "a name is one line");
assert.equal(reskinTextProblem("flavor", "A wary sentinel with a crooked grin & a bronze lantern."), null,
  "ampersands and ordinary punctuation are plain text");
assert.equal(reskinTextProblem("flavor", "Her <b>glare</b> is 'cold' and \"sharp\"."), null,
  "HTML-looking text is allowed because flavorBlockHtml escapes it");

// Mechanical numbers in flavor are rejected; the schema has no numeric fields.
for (const text of ["She rolls 2d6 for fun", "DC 20 Will save", "AC 18 and the rest", "Level 5 veteran",
  "moves 30-foot strides", "a +2 blade", "Reflex +12 against fear", "takes 10 damage"]) {
  assert.notEqual(reskinTextProblem("flavor", text), null, `numeric mechanics are rejected: ${text}`);
}
assert.equal(reskinTextProblem("flavor", "a six-foot-tall ogre who hums hymns"), null,
  "spelled-out body descriptions are ordinary flavor");
assert.match(reskinTextProblem("flavor", "x".repeat(401)), /at most 400 characters/);
assert.match(reskinTextProblem("name", "x".repeat(81)), /at most 80 characters/);
assert.match(reskinTextProblem("biography", "bad\u0007bell"), /control characters/);
assert.equal(reskinTextProblem("biography", "First.\n\nSecond."), null, "biography may use paragraphs");

const valid = { name: "Mara Vantor", flavor: "A tall, quiet warden of the bell tower.", biography: "Born in fog.\n\nRaised by bells." };
assert.equal(reskinOutputProblem(valid), null);
assert.match(reskinOutputProblem({ ...valid, hp: 40 }), /unsupported fields: hp/,
  "an extra mechanical field is rejected, never ignored");
assert.match(reskinOutputProblem({ ...valid, strikes: [] }), /unsupported fields: strikes/);
assert.match(reskinOutputProblem({ ...valid, flavor: 12 }), /flavor must be text/);
assert.match(reskinOutputProblem({ ...valid, biography: "   " }), /biography must not be empty/);
assert.match(reskinOutputProblem({ name: "Mara" }), /flavor must be text/);
assert.equal(taskResponseProblem(AI_TASK.RESKIN_FLAVOR, valid), null,
  "the shared validator accepts the strict flavor object");
assert.match(taskResponseProblem(AI_TASK.RESKIN_FLAVOR, { ...valid, dc: 20 }), /unsupported fields: dc/,
  "the structural validator reuses the same schema");
assert.match(taskResponseProblem(AI_TASK.RESKIN_FLAVOR, { name: "Mara", flavor: "x" }), /missing required fields: biography/);

// Escaping: nothing from the model reaches the note as live markup.
const block = flavorBlockHtml({
  flavor: `A <b>bold</b> & "quoted" 'name'`, biography: "First paragraph.\n\nSecond & last."
});
assert.equal(
  block,
  "<h3>Flavor</h3><p>A &lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot; &#39;name&#39;</p>"
  + "<h3>Biography</h3><p>First paragraph.</p><p>Second &amp; last.</p>"
);
assert.equal(enricherTokens(block).length, 0, "generated flavor HTML contains no enricher tokens");
assert.equal(
  plainText(block),
  "Flavor A <b>bold</b> & \"quoted\" 'name' Biography First paragraph. Second & last.",
  "escaped flavor reads back as the exact text the model wrote"
);
assert.equal(composePublicNotes("<p>Original &amp; text</p>", "<h3>X</h3>"), "<p>Original &amp; text</p>\n<h3>X</h3>",
  "source notes are kept byte-for-byte as the prefix");
assert.equal(composePublicNotes("", "<h3>X</h3>"), "<h3>X</h3>");
assert.equal(composePublicNotes(undefined, "<h3>X</h3>"), "<h3>X</h3>");

// Whitelisted context: no notes, no items, no secrets, no numbers.
const context = reskinContext({
  name: "Hobgoblin Captain",
  system: {
    details: { level: { value: 4 }, blurb: "<p>A drill sergeant @UUID[Compendium.x.Item.y]{Grab}.</p>",
      publicNotes: "<p>Secret tactics.</p>", privateNotes: "The captain is a spy." },
    traits: { value: ["humanoid", "Bad Trait!", "goblin"], rarity: "uncommon", size: { value: "med" } }
  },
  items: [{ name: "Grab" }]
});
const contextJSON = JSON.stringify(context);
assert.deepEqual(context.traits, ["humanoid", "goblin"], "traits outside the slug whitelist are dropped");
assert.equal(context.rarity, "uncommon");
assert.equal(context.size, "med");
assert.equal(context.blurb, "A drill sergeant .", "the blurb is plain text without enrichers");
assert.doesNotMatch(contextJSON, /spy|Secret|Grab|level|items|privateNotes/i, "private notes, items and levels never reach the model");

// Mechanical identity: a published-style NPC with real enrichers and rules.
const stunningBlows = JSON.parse(await readFile(new URL("./fixtures/npc-abilities/stunning-blows.json", import.meta.url), "utf8"));
const source = {
  _id: "Ab3dEf7gHi9jKl0m", name: "Hobgoblin Captain", type: "npc", img: "icons/hobgoblin.webp",
  prototypeToken: { name: "Hobgoblin Captain", texture: { src: "icons/hobgoblin.webp" }, width: 1, height: 1 },
  flags: {}, effects: [],
  system: {
    details: {
      level: { value: 4 }, blurb: "A drill sergeant.",
      publicNotes: "<p>Drills endlessly, @UUID[Compendium.pf2e.bestiary-ability-glossary-srd.Item.Grab]{Grab} foes.</p>",
      privateNotes: "The captain is a spy."
    },
    attributes: { hp: { value: 60, max: 60 }, ac: { value: 20 } },
    traits: { value: ["humanoid", "goblin"], rarity: "common", size: { value: "med" } }
  },
  items: [
    {
      _id: "Strike0000000001", type: "melee", name: "Spear",
      _stats: { compendiumSource: "Compendium.pf2e.bestiary-ability-glossary-srd.Item.Grab" },
      system: { description: { value: "<p>Strike @Damage[2d8[slashing]] damage.</p>" }, bonus: { value: 12 }, rules: [] }
    },
    { ...stunningBlows, _id: "Stun0000000000001" }
  ]
};
const originalSnapshot = canonicalJSON(source);
const sourceMechanics = mechanicalSnapshot({ actor: { ...structuredClone(source), items: undefined }, items: source.items });
const notes = "<p>Drills endlessly, @UUID[Compendium.pf2e.bestiary-ability-glossary-srd.Item.Grab]{Grab} foes.</p>";
const flavorHtml = flavorBlockHtml(valid);
const payload = reskinPayload({ actor: { ...structuredClone(source), items: undefined }, items: source.items },
  { name: valid.name, publicNotes: composePublicNotes(notes, flavorHtml) });

assert.equal(canonicalJSON(source), originalSnapshot, "building a payload never mutates the published source");
assert.equal("_id" in payload, false, "the new actor receives a fresh id");
assert.equal(payload.name, "Mara Vantor");
assert.equal(payload.prototypeToken.name, "Mara Vantor", "the token label follows the reskinned name");
assert.equal(payload.img, source.img, "source art is retained; the reskin does not change art");
assert.equal(payload.prototypeToken.texture.src, source.prototypeToken.texture.src);
assert.equal(payload.items.length, source.items.length);
assert.deepEqual(payload.items.map((item) => item._id), source.items.map((item) => item._id),
  "embedded ids survive so spell links and grants keep resolving");
assert.equal(payload.items[0]._stats.compendiumSource, "Compendium.pf2e.bestiary-ability-glossary-srd.Item.Grab",
  "exact item source references survive");
assert.equal(payload.items[1]._stats, undefined, "a source without provenance keeps no _stats");
assert.equal(payload.system.details.privateNotes, "The captain is a spy.", "GM-private data survives unchanged");
const payloadMechanics = mechanicalSnapshot({ actor: payload, items: payload.items });
assert.deepEqual(reskinMechanicsProblems(sourceMechanics, payloadMechanics, { exact: true }), [],
  "the native-shaped payload preserves every mechanical field exactly");
assert.equal(digestOf(canonicalJSON(sourceMechanics)), digestOf(canonicalJSON(payloadMechanics)));
assert.deepEqual(publicNotesProblems({ sourceNotes: notes, actualNotes: payload.system.details.publicNotes, flavorHtml }), [],
  "appended notes keep the source enricher and the flavor text");

const altered = structuredClone(payload);
altered.system.attributes.hp.max = 61;
assert.deepEqual(reskinMechanicsProblems(sourceMechanics, mechanicalSnapshot({ actor: altered, items: altered.items }), { exact: true }),
  ["actor mechanics"], "a changed stat blocks the write");
const alteredItem = structuredClone(payload);
alteredItem.items[0].system.description.value = "<p>Strike @Damage[3d8[slashing]] damage.</p>";
assert.deepEqual(reskinMechanicsProblems(sourceMechanics, mechanicalSnapshot({ actor: alteredItem, items: alteredItem.items }), { exact: true }),
  ['melee "Spear"'], "an item description or enricher change blocks the write");
const droppedRule = structuredClone(payload);
droppedRule.items = droppedRule.items.slice(1);
assert.deepEqual(reskinMechanicsProblems(sourceMechanics, mechanicalSnapshot({ actor: droppedRule, items: droppedRule.items }), { exact: false }),
  ["item count 1 differs from 2", 'missing melee "Spear"'],
  "a missing embedded item is reported, not silently accepted");
const provenance = structuredClone(payload);
provenance.items[0]._stats.compendiumSource = "Compendium.pf2e.feats-srd.Item.Other";
assert.deepEqual(reskinMechanicsProblems(sourceMechanics, mechanicalSnapshot({ actor: provenance, items: provenance.items }), { exact: true }),
  ['melee "Spear"'], "a changed source reference is a mechanical change");

// Foundry may fill defaults on persistence, so the persisted check tolerates added keys only.
const persisted = structuredClone(payload);
persisted.system.attributes.ac.details = "";
persisted.items[0].system.description.gm = "";
persisted.items[0].flags = { pf2e: {} };
assert.deepEqual(reskinMechanicsProblems(sourceMechanics, mechanicalSnapshot({ actor: persisted, items: persisted.items }), { exact: false }),
  [], "defaults added by persistence do not block an otherwise identical actor");
const droppedValue = structuredClone(payload);
delete droppedValue.items[0].system.bonus;
assert.deepEqual(reskinMechanicsProblems(sourceMechanics, mechanicalSnapshot({ actor: droppedValue, items: droppedValue.items }), { exact: false }),
  ['melee "Spear"'], "a persisted value that disappears is a failure");

// Notes: enrichers may not be added or removed, and source text must survive.
assert.deepEqual(publicNotesProblems({ sourceNotes: notes, actualNotes: `${notes}\n${flavorHtml}\n@Check[fortitude|dc:20]`, flavorHtml }),
  ["publicNotes enricher syntax changed"], "an added enricher is reported even when the flavor is intact");
assert.deepEqual(publicNotesProblems({ sourceNotes: notes, actualNotes: `<p>Changed.</p>\n${flavorHtml}`, flavorHtml }),
  ["publicNotes enricher syntax changed", "publicNotes source text changed"]);
assert.deepEqual(publicNotesProblems({ sourceNotes: notes, actualNotes: notes, flavorHtml }),
  ["publicNotes flavor text missing"]);
const apostropheFlavor = flavorBlockHtml({ flavor: "It's quiet.", biography: "Bells." });
assert.match(apostropheFlavor, /It&#39;s quiet/, "the stored flavor uses an escaped apostrophe");
const sanitized = `<p>Drills endlessly,   @UUID[Compendium.pf2e.bestiary-ability-glossary-srd.Item.Grab]{Grab} foes.</p>\n${apostropheFlavor.replace("&#39;", "'")}`;
assert.deepEqual(publicNotesProblems({ sourceNotes: notes, actualNotes: sanitized, flavorHtml: apostropheFlavor }), [],
  "whitespace and entity normalization by Foundry does not count as a notes change");

// Canonical text and digests are stable and independent of key order.
assert.equal(canonicalJSON({ b: 1, a: { d: 2, c: 3 } }), '{"a":{"c":3,"d":2},"b":1}');
assert.equal(digestOf("reskin"), digestOf("reskin"));
assert.notEqual(digestOf("reskin"), digestOf("reskins"));

// The engine must never route text through builder enrichment or art/stat scaffolds.
for (const file of ["reskin.mjs", "reskin-policy.mjs"]) {
  const text = await readFile(new URL(`../scripts/${file}`, import.meta.url), "utf8");
  assert.doesNotMatch(text, /enrichDescription|from "\.\/builder\.mjs"|from "\.\/art\.mjs"|findBestiaryScaffold|findBestiaryArt/,
    `${file} must not use enrichment or art/stat scaffolding`);
}

console.log("reskin-policy.test.mjs: enricher, schema, escaping, context, and fingerprint regressions passed");
