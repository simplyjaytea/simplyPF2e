import assert from "node:assert/strict";

// PF2e 8.5.0's published arrows are type ammo, quantity 10, priced per 10:
// https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/equipment/arrows.json
const packId = "test.equipment";
const arrows = {
  _id: "arrows", name: "Arrows", type: "ammo",
  system: { baseItem: "arrows", quantity: 10, price: { per: 10, value: { sp: 1 } },
    level: { value: 0 }, traits: { value: ["consumable"] } }
};
const doc = { ...arrows, uuid: `Compendium.${packId}.Item.arrows`, toObject: () => structuredClone(arrows) };
const pack = { getIndex: async () => [arrows], getDocument: async (id) => id === "arrows" ? doc : null };
globalThis.game = {
  settings: { get: () => ({ equipment: [packId] }) },
  packs: new Map([[packId, pack]])
};
globalThis.foundry = { utils: { randomID: () => "test-id" } };
globalThis.CONST = { TOKEN_DISPLAY_MODES: { OWNER_HOVER: 20 } };
let writes = 0;
globalThis.Actor = { create: async (data) => { writes++; return { ...data, id: "created" }; } };
const { getEquipmentCandidates, getLootCandidates } = await import("./compendium.mjs");
const { buildEquipmentItems, buildLootItems, equipmentValueGp, resolveLoot, normalizeConcept, createActor } = await import("./builder.mjs");
const candidates = await getEquipmentCandidates(1, ["Arrows"]);
assert.equal(candidates[0]?.name, "Arrows", "PF2e ammo must remain selectable equipment");
assert.equal((await getLootCandidates(1, ["Arrows"]))[0]?.name, "Arrows", "ammo must remain selectable loot");
const line = { name: "Arrows", quantity: 1, value: 99, entry: candidates[0].ref, candidate: candidates[0].ref };
const [equipment] = await buildEquipmentItems([line]);
const [loot] = await buildLootItems([line]);
assert.equal(equipment.system.quantity, 1, "a single selected item replaces the source's pack quantity");
assert.equal(loot.system.quantity, 1);
assert.equal(arrows.system.quantity, 10, "source documents are never mutated");
assert.equal((await buildEquipmentItems([{ ...line, quantity: 5 }]))[0].system.quantity, 5);
assert.equal(await equipmentValueGp([{ ...line, quantity: 10 }]), 0.1, "per-ten price must be applied once for ten arrows");
assert.equal((await resolveLoot({ level: 1, loot: [line] }, { exactContent: true }))[0].resolvedValue, 0.01,
  "resolved loot prices are per individual item");

const concept = normalizeConcept({ name: "Archer", spellcasting: { tradition: "arcane", spells: [] } },
  { level: 1, rarity: "common" });
const resolved = { abilities: [], feats: [], spells: [], focusSpells: [], equipment: [line], loot: [] };
const created = await createActor(concept, resolved);
assert.equal(created.actor.items.some((item) => item.type === "ammo"), true, "NPC item filtering must retain actual ammo");
const missing = { packId, _id: "deleted-source" };
for (const changes of [
  { equipment: [{ ...line, entry: missing }] },
  { loot: [{ ...line, entry: missing }] },
  { loot: [{ name: "Gold Pieces", quantity: 1, entry: missing }] },
  { loot: [{ name: "Scroll of Spark (Rank 1)", quantity: 1, entry: missing, scroll: { rank: 1 } }] },
  { abilities: [{ ability: { name: "Grab" }, entry: missing }] },
  { feats: [{ name: "Sudden Charge", entry: missing }] },
  { spells: [{ spell: { name: "Spark", rank: 1 }, entry: missing }] },
  { focusSpells: [{ name: "Fire Ray", entry: missing }] }
]) {
  const before = writes;
  await assert.rejects(createActor(concept, { ...resolved, equipment: [], ...changes }), /source|scroll|coin/i,
    "a vanished selected document cannot become custom gear or silently disappear");
  assert.equal(writes, before, "missing sources fail before native actor creation");
}
console.log("builder.itemAssembly.test.mjs: ammo, exact quantities, unit pricing, and source survival passed");
