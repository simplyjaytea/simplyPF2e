import assert from "node:assert/strict";
const spell = (id, traits, rarity = "common", ritual = null) => ({ _id: id, name: id, type: "spell", system: { level: { value: 1 }, traits: { value: traits, rarity }, ritual } });
const entries = [spell("Light", ["cantrip"]), spell("Focus", ["cantrip", "focus"]), spell("Ritual", ["cantrip"], "common", {}), spell("Heal", []), spell("Rare", ["cantrip"], "uncommon")];
globalThis.game = { settings: { get: () => ({ spells: ["test.spells"] }) }, packs: new Map([["test.spells", { getIndex: async () => entries }]]) };
const { getCantripCandidates } = await import("../scripts/compendium.mjs");
assert.deepEqual((await getCantripCandidates()).map(c => c.name), ["Light"]);
