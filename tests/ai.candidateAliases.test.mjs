// Every selector that embeds an issued candidate serializes a short request-
// local alias, never the long `c-`+base64 id. The reply resolves through that
// alias map back to the exact issued candidate; foreign and unknown aliases
// fail closed exactly like unknown ids did. Name fallback and the rune-prefix
// exception remain from the previous contract.
// Run: node tests/ai.candidateAliases.test.mjs
import assert from "node:assert/strict";
import { SETTINGS } from "../scripts/settings.mjs";

const settings = new Map([
  [SETTINGS.apiBaseUrl, "http://localhost:11434/v1"], [SETTINGS.apiKey, ""],
  [SETTINGS.apiKeyBaseUrl, ""], [SETTINGS.model, "test-model"],
  [SETTINGS.temperature, 0.8], [SETTINGS.maxTokens, 8000], [SETTINGS.requestTimeout, 90]
]);
globalThis.game = {
  settings: { get: (_module, key) => settings.get(key) },
  i18n: { localize: (key) => key, format: (key) => key }
};

const requests = [];
const replies = [];
const originalWarn = console.warn;
console.warn = () => {};
globalThis.fetch = async (_url, options) => {
  const body = JSON.parse(options.body);
  requests.push(body);
  assert.ok(replies.length, "unexpected provider request");
  const reply = replies.shift();
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(reply) }, finish_reason: "stop" }],
    usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 }
  }), { headers: { "content-type": "application/json" } });
};

const longId = (pack, id) => `c-${Buffer.from(`${pack}\u0000${id}`).toString("base64").replaceAll("=", "")}`;
const ref = (pack, id) => ({ packId: pack, _id: id });
const LONG_ID = /c-[A-Za-z0-9+/]{16,}/;
const promptOf = (request) => request.messages.map((message) => message.content).join("\n");
const aliasOf = (request, name) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`([A-Z0-9][0-9A-ZX]*) \\| ${escaped}(?:\\b| \\()`).exec(promptOf(request))?.[1] ?? null;
};
function assertNoLongIds(request, label) {
  assert.doesNotMatch(promptOf(request), LONG_ID, `${label} prompt must not embed a long issued id`);
}

try {
  const ai = await import("../scripts/ai.mjs");

  // ---- ABC: aliases per list, heritage ownership filter, required identity
  const ancestry = (name, id) => ({ id: longId("pf2e.ancestries", id), name, traits: [], ref: ref("pf2e.ancestries", id) });
  const heritage = (name, owner, id) => ({
    id: longId("pf2e.heritages", id), name, traits: [], ref: ref("pf2e.heritages", id),
    ...(owner ? { ancestry: owner } : {})
  });
  const background = (name, id) => ({ id: longId("pf2e.backgrounds", id), name, traits: [], ref: ref("pf2e.backgrounds", id) });
  const pcClass = (name, id) => ({ id: longId("pf2e.classes", id), name, traits: [], ref: ref("pf2e.classes", id) });
  const human = ancestry("Human", "human");
  const elf = ancestry("Elf", "elf");
  const humanHeritage = heritage("Human Heritage", "Human", "human-heritage");
  const elfHeritage = heritage("Elf Heritage", "Elf", "elf-heritage");
  const versatile = heritage("Versatile Heritage", null, "versatile");
  const dwarfHeritage = heritage("Dwarf Heritage", "Dwarf", "dwarf-heritage");
  const guard = background("Guard", "guard");
  const acolyte = background("Acolyte", "acolyte");
  const fighter = pcClass("Fighter", "fighter");
  const rogue = pcClass("Rogue", "rogue");
  const abcArgs = {
    concept: { name: "Alias QA", level: 1, ancestry: "Human", heritage: null, background: "Guard", class: "Fighter", keyAbility: "str" },
    ancestryCandidates: [human, elf],
    heritageCandidates: [humanHeritage, elfHeritage, versatile, dwarfHeritage],
    backgroundCandidates: [guard, acolyte],
    classCandidates: [fighter, rogue]
  };
  // Probe once to learn this request's aliases without assuming their shape.
  // On the pre-alias revision the prompt still carries long ids, so this
  // assertion fails before the downstream unresolved error.
  replies.push({ ancestryId: "NOPE", heritageId: null, backgroundId: "NOPE", classId: "NOPE", keyAbility: "str" });
  await assert.rejects(ai.selectAncestryBackgroundClass(abcArgs));
  assertNoLongIds(requests.at(-1), "ABC probe");
  const probe = requests.at(-1);
  const heritagePrompt = promptOf(probe);
  assert.match(heritagePrompt, /\| Versatile Heritage/, "ancestry-agnostic heritages stay offered");
  assert.doesNotMatch(heritagePrompt, /Dwarf Heritage/, "a heritage whose ancestry is not offered is withheld");
  const ancestryAlias = aliasOf(probe, "Human");
  const heritageAlias = aliasOf(probe, "Human Heritage");
  const backgroundAlias = aliasOf(probe, "Guard");
  const classAlias = aliasOf(probe, "Fighter");
  assert.ok(ancestryAlias && heritageAlias && backgroundAlias && classAlias, "every ABC list issues an alias");

  replies.push({ ancestryId: ancestryAlias, heritageId: heritageAlias, backgroundId: backgroundAlias, classId: classAlias, keyAbility: "str" });
  const abc = await ai.selectAncestryBackgroundClass(abcArgs);
  assertNoLongIds(requests.at(-1), "ABC");
  assert.equal(abc.ancestryCandidate, human.ref);
  assert.equal(abc.heritageCandidate, humanHeritage.ref);
  assert.equal(abc.backgroundCandidate, guard.ref);
  assert.equal(abc.classCandidate, fighter.ref);
  assert.equal(abc.heritage, "Human Heritage");

  // A foreign list's alias is unknown and must not resolve (a heritage alias as classId).
  const lockedConcept = { ...abcArgs.concept, class: "Rogue", requiredIdentity: { class: rogue } };
  replies.push({ ancestryId: ancestryAlias, heritageId: heritageAlias, backgroundId: backgroundAlias, classId: heritageAlias, keyAbility: "str" });
  await assert.rejects(
    ai.selectAncestryBackgroundClass({ ...abcArgs, concept: lockedConcept }),
    (error) => error.details?.fields?.join(",") === "class",
    "a heritage alias used as classId fails closed"
  );
  assertNoLongIds(requests.at(-1), "ABC required");
  const rogueAlias = aliasOf(requests.at(-1), "Rogue");
  assert.ok(rogueAlias, "the required class still gets an alias in its narrowed list");
  replies.push({ ancestryId: ancestryAlias, heritageId: heritageAlias, backgroundId: backgroundAlias, classId: rogueAlias, keyAbility: "str" });
  const locked = await ai.selectAncestryBackgroundClass({ ...abcArgs, concept: lockedConcept });
  assert.equal(locked.classCandidate, rogue.ref, "required identity still resolves through the alias map");

  // Unknown non-required alias fails closed rather than falling back to first/name.
  replies.push({ ancestryId: ancestryAlias, heritageId: heritageAlias, backgroundId: "B-NOT-OFFERED", classId: classAlias, keyAbility: "str" });
  await assert.rejects(
    ai.selectAncestryBackgroundClass(abcArgs),
    (error) => error.details?.fields?.join(",") === "background",
    "an unknown background alias fails closed"
  );

  // ---- selectSpells (creature path), with a separate focus list
  const spell = (name, rank, id) => ({ id: longId("pf2e.spells-srd", id), name, rank, rarity: "common", traits: [], ref: ref("pf2e.spells-srd", id) });
  const spellArgs = {
    concept: { name: "Alias Caster", level: 5, blurb: "A test caster.", description: "Test description.", traits: [], spellcasting: { tradition: "arcane", spells: [] } },
    candidates: [spell("Fireball", 3, "fireball"), spell("Fear", 1, "fear")],
    focusCandidates: [spell("Fire Ray", 1, "fire-ray")],
    maxRank: 3
  };
  replies.push({ spells: [{ id: "S1", rank: 1 }], focusSpellIds: ["F0"] });
  const picked = await ai.selectSpells(spellArgs);
  assertNoLongIds(requests.at(-1), "spells");
  assert.deepEqual(picked.spells.map((entry) => entry.name), ["Fear"]);
  assert.equal(picked.spells[0].candidate, spellArgs.candidates[1].ref);
  assert.deepEqual(picked.focusSpells.map((entry) => entry.name), ["Fire Ray"]);
  assert.equal(picked.focusSpells[0].candidate, spellArgs.focusCandidates[0].ref);

  replies.push({ spells: [{ id: "F0", rank: 1 }], focusSpellIds: [] });
  const foreignSpell = await ai.selectSpells(spellArgs);
  assert.deepEqual(foreignSpell.spells, [], "a focus alias used as a spell id fails closed");
  replies.push({ spells: [{ id: "S-NOPE", rank: 1 }], focusSpellIds: [] });
  const unknownSpell = await ai.selectSpells(spellArgs);
  assert.deepEqual(unknownSpell.spells, [], "an unknown spell alias fails closed");

  // ---- archetype spells
  replies.push({ spells: [{ id: "S0" }, { id: "S1" }] });
  const archetype = await ai.selectArchetypeSpells({
    concept: { name: "Alias Archetype", level: 4, class: "Fighter", traits: [], gmPrompt: "" },
    candidates: [spell("Detect Magic", 0, "detect"), spell("Fear", 1, "fear-archetype")],
    plannedPicks: { 0: 1, 1: 1 }, tradition: "arcane", label: "Bard"
  });
  assertNoLongIds(requests.at(-1), "archetype spells");
  assert.deepEqual(archetype.spells.map((entry) => entry.name), ["Detect Magic", "Fear"]);

  // ---- equipment
  const item = (name, id, type = "weapon", level = 1) => ({
    id: longId("pf2e.equipment-srd", id), name, type, level, traits: [], ref: ref("pf2e.equipment-srd", id)
  });
  const longsword = item("Longsword", "longsword");
  const chainMail = item("Chain Mail", "chain-mail", "armor");
  replies.push({ equipment: [{ id: "E0", quantity: 1 }] });
  const equipment = await ai.selectEquipment({
    concept: { name: "Alias Fighter", level: 1, blurb: "", description: "", traits: [], strikes: [], equipment: [] },
    candidates: [longsword, chainMail]
  });
  assertNoLongIds(requests.at(-1), "equipment");
  assert.equal(equipment.equipment[0].name, "Longsword");
  assert.equal(equipment.equipment[0].candidate, longsword.ref);

  // ---- loot: separate item and scroll lists
  const scroll = (name, rank, id) => ({ id: longId("pf2e.spells-srd", id), name, rank, traits: [], ref: ref("pf2e.spells-srd", id) });
  const potion = item("Potion of Healing", "potion", "consumable", 1);
  const fireballScroll = scroll("Fireball", 3, "fireball-scroll");
  replies.push({ loot: [{ id: "L0", quantity: 2 }, { scrollSpellId: "S0", rank: 3, quantity: 1 }] });
  const loot = await ai.selectLoot({
    concept: { name: "Alias Loot", level: 5, rarity: "common", blurb: "", traits: [], loot: [{ name: "Potion", quantity: 1 }], equipment: [] },
    candidates: [potion],
    scrollCandidates: [fireballScroll]
  });
  assertNoLongIds(requests.at(-1), "loot");
  assert.equal(loot.loot[0].name, "Potion of Healing");
  assert.equal(loot.loot[0].candidate, potion.ref);
  assert.equal(loot.loot[1].name, "Scroll of Fireball (Rank 3)");
  assert.equal(loot.loot[1].scrollCandidate, fireballScroll.ref);

  // ---- creature abilities
  const ability = (name, id) => ({ id: longId("pf2e.bestiary-ability-glossary-srd", id), name, traits: [], ref: ref("pf2e.bestiary-ability-glossary-srd", id) });
  const grab = ability("Grab", "grab");
  replies.push({ abilityIds: ["A0"] });
  const abilities = await ai.selectCreatureAbilities({
    concept: { name: "Alias Beast", level: 3, blurb: "", description: "", traits: [], specialAbilities: [{ name: "Grab", glossary: "Grab" }] },
    candidates: [grab]
  });
  assertNoLongIds(requests.at(-1), "abilities");
  assert.equal(abilities.abilities[0].candidate, grab.ref);

  // ---- spell consumables
  const consumableSpell = scroll("Fireball", 3, "fireball-consumable");
  replies.push({ picks: [{ spellId: "S0", rank: 3, kind: "scroll" }] });
  const consumables = await ai.selectSpellConsumables("fire", {
    level: 5, kind: "scroll", candidates: [consumableSpell]
  });
  assertNoLongIds(requests.at(-1), "spell consumables");
  assert.equal(consumables.picks[0].spellId, longId("pf2e.spells-srd", "fireball-consumable"));
  assert.equal(consumables.picks[0].candidate, consumableSpell);

  // ---- parcel spells: slot ids remain, candidate ids become aliases
  const parcelSpell = scroll("Fireball", 3, "fireball-parcel");
  replies.push({ picks: [{ slot: "slot-1", spellId: "S0" }] });
  const parcelSpells = await ai.selectParcelSpells("fire", {
    partyLevel: 5, slots: [{ id: "slot-1", itemLevel: 6, rank: 3 }],
    candidates: [parcelSpell]
  });
  assertNoLongIds(requests.at(-1), "parcel spells");
  assert.equal(parcelSpells.picks[0].spellId, longId("pf2e.spells-srd", "fireball-parcel"));
  assert.equal(parcelSpells.picks[0].candidate, parcelSpell);

  // ---- parcel permanents: aliases resolve to the real candidate id
  replies.push({ picks: [{ slot: "perm-1", candidate: "P0" }] });
  const permanents = await ai.selectParcelPermanents("recall", {
    partyLevel: 5, slots: [{ id: "perm-1", allowedLevels: [5] }],
    candidates: [item("Cube of Recall", "cube", "equipment", 5)]
  });
  assertNoLongIds(requests.at(-1), "parcel permanents");
  assert.equal(permanents.picks[0].candidateId, longId("pf2e.equipment-srd", "cube"));
  assert.deepEqual(permanents.dropped, []);

  // Every captured prompt (including the retries/failures above) is alias-only.
  for (const [index, request] of requests.entries()) {
    assert.doesNotMatch(promptOf(request), LONG_ID, `request ${index + 1} must not serialize a long issued id`);
  }

  console.log("ai.candidateAliases.test.mjs: every selector is alias-only, aliases round-trip to issued candidates, foreign/unknown aliases fail closed");
} finally {
  console.warn = originalWarn;
}
