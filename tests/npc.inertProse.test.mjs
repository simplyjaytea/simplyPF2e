// NPC prose end to end: createActor writes the AI's description, read-aloud, recall-knowledge and narrative
// ability text into the sheet. Every Foundry enrichment token from the AI comes out inert, while the module's own
// Recall Knowledge check (@Check[type:…|dc:…]) is still a live enricher.
// Run: node tests/npc.inertProse.test.mjs
import assert from "node:assert/strict";
import { enricherTokens } from "../scripts/reskin-policy.mjs";

globalThis.game = { settings: { get: () => ({}) }, packs: new Map(), i18n: { localize: (key) => key, format: (key) => key } };
globalThis.foundry = { utils: { randomID: () => "test-id" } };
globalThis.CONST = { TOKEN_DISPLAY_MODES: { OWNER_HOVER: 20 } };
globalThis.Actor = { create: async (data) => ({ ...data, id: "created" }) };
const { normalizeConcept, createActor } = await import("../scripts/builder.mjs");

const concept = normalizeConcept({
  name: "Ratcatcher",
  description: "Lurks in the drains. @UUID[Compendium.pf2e.spells-srd.Item.Fireball]{Fireball} is a favorite.\n\nIt tracks [[/r 1d20]] scents.",
  readAloud: "A whisper of @Damage[2d6[fire]] and a [[/gm 3d6]] roll.",
  recallKnowledge: "Known for @Localize[PF2E.Check.Fortitude] and @Check[fortitude|dc:20].",
  spellcasting: null
}, { level: 1, rarity: "common" });

const resolved = {
  abilities: [{ ability: { name: "Grab", narrative: true, description: "Pulls a foe with @Template[type:burst|distance:20] and [[/r 1d6]]." }, entry: null }],
  feats: [], spells: [], focusSpells: [], equipment: [], loot: []
};
const { actor } = await createActor(concept, resolved);

const notes = actor.system.details.publicNotes;
// The AI's enrichers are gone from the stored notes: no @UUID, @Damage, @Localize, @Check or inline roll survives
// except the module's own Recall Knowledge check.
const aiPart = notes.replace("@Check[type:occultism|dc:15]", "");
assert.equal(enricherTokens(aiPart).length, 0, "no AI enricher survives in the notes");
assert.doesNotMatch(aiPart, /@|\[\[/, "no @ or [[ from the AI remains in the notes");
assert.ok(notes.includes("Lurks in the drains."), "the readable description is kept");
assert.ok(notes.includes("&#64;UUID&#91;Compendium.pf2e.spells-srd.Item.Fireball]{Fireball}"), "the link text is visible but inert");
assert.ok(notes.includes("&#64;Damage&#91;2d6&#91;fire]]"), "the read-aloud damage text is visible but inert");

// Intended mechanics still work: the module's Recall Knowledge check is a live enricher with the expected type and DC.
assert.match(notes, /<strong>Occultism<\/strong> @Check\[type:occultism\|dc:\d+\]/, "the module's Recall Knowledge check stays live");

// The narrative action is AI prose, so it is inert too; its name is the module's own label.
const narrative = actor.items.find((item) => item.name === "Narrative: Grab");
assert.ok(narrative, "the narrative ability is written as an action");
const narrativeText = narrative.system.description.value;
assert.equal(enricherTokens(narrativeText).length, 0, "the narrative action carries no live enricher");
assert.ok(narrativeText.includes("&#64;Template&#91;type:burst|distance:20]"), "the narrative action text stays readable");

console.log("npc.inertProse.test.mjs: AI description, read-aloud and narrative text come out inert; the module's Recall Knowledge check stays live");
