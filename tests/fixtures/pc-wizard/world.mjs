// Test stand-ins for Foundry's compendium access, built from the real PF2e
// JSON files in this directory (see README.md). Not Foundry: it models only
// the calls class-paths.mjs and the PC builder make (`game.packs.get`,
// `pack.getIndex/getDocument`, `fromUuid`) and can be pointed at a different
// set of files per scenario. Documents resolve by id and by name, as the real
// class `system.items` and GrantItem uuids use the name form.
import { readFile } from "node:fs/promises";

/** Parse one fixture, e.g. `load("wizard")` or `load("precedent/thief")`. */
export async function load(name) {
  return JSON.parse(await readFile(new URL(`./${name}.json`, import.meta.url), "utf8"));
}

/** Build a world from `{ "<packId>": [json, ...] }`. */
export function makeWorld(contents) {
  const docs = new Map();
  const packs = new Map();
  for (const [packId, files] of Object.entries(contents)) {
    const byId = new Map();
    for (const json of files) {
      const stub = {
        id: json._id, pack: packId, uuid: `Compendium.${packId}.Item.${json._id}`, name: json.name, type: json.type,
        system: json.system, toObject: () => structuredClone(json)
      };
      byId.set(json._id, stub);
      docs.set(stub.uuid, stub);
      docs.set(`Compendium.${packId}.Item.${json.name}`, stub);
    }
    packs.set(packId, {
      collection: packId,
      async getIndex() {
        return [...byId.values()].map((stub) => ({
          _id: stub.id, name: stub.name, type: stub.type,
          system: { category: stub.system.category, level: stub.system.level, traits: stub.system.traits }
        }));
      },
      getDocument: async (id) => byId.get(id) ?? null
    });
  }
  return { docs, packs };
}

/** Install the Foundry globals those calls read; `use(world)` switches scenario. */
export function installWorld() {
  let current = null;
  globalThis.game = { ...(globalThis.game ?? {}), packs: { get: (id) => current?.packs.get(id) ?? null }, settings: { get: () => ({}) } };
  globalThis.CONFIG ??= { PF2E: {} };
  globalThis.fromUuid = async (id) => current?.docs.get(id) ?? null;
  return { use(world) { current = world; } };
}
