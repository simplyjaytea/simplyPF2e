import assert from "node:assert/strict";

const entries = [
  { _id: "wrong-size", type: "npc", img: "wrong.webp", system: { traits: { value: ["undead"], size: { value: "lg" } }, details: { level: { value: 5 } } } },
  { _id: "best", type: "npc", img: "best.webp", system: { traits: { value: ["undead", "skeleton"], size: { value: "med" } }, details: { level: { value: 5 } } } }
];
const pack = { getIndex: async () => entries, getDocument: async (id) => ({ toObject: () => ({ img: entries.find((entry) => entry._id === id).img, prototypeToken: { disposition: -1 } }) }) };
globalThis.game = { packs: { get: (id) => id === "pf2e.pathfinder-bestiary" ? pack : null }, settings: { get: () => ({ bestiaryActors: ["pf2e.pathfinder-bestiary"] }) } };
const { findBestiaryScaffold } = await import("./art.mjs");
const scaffold = await findBestiaryScaffold({ traits: ["undead", "skeleton"], size: "med", level: 5 });
assert.equal(scaffold.img, "best.webp");
assert.equal(scaffold.prototypeToken.disposition, -1);
const fallback = await findBestiaryScaffold({ traits: ["construct"], size: "lg", level: 5 });
assert.equal(fallback.img, "wrong.webp", "an unmatched but valid creature still receives the closest exact level/size scaffold");
console.log("art.scaffold.test.mjs: exact bestiary actor scaffold selection passed");
