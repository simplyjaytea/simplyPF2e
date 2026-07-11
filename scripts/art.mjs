import { MODULE_ID } from "./settings.mjs";

/**
 * Creature art: borrow token art from the bestiary creature that best
 * matches the concept's creature-type traits, size and level.
 */

const BESTIARY_PACKS = ["pf2e.pathfinder-monster-core", "pf2e.pathfinder-bestiary"];

/**
 * Find the bestiary creature that best matches this concept's
 * creature-type traits, size and level, and reuse its artwork.
 * @returns {Promise<string|null>}
 */
export async function findBestiaryArt(concept) {
  try {
    const conceptTraits = new Set(concept.traits);
    let best = null;
    let bestScore = 0;
    for (const packId of BESTIARY_PACKS) {
      const pack = game.packs.get(packId);
      if (!pack) continue;
      const index = await pack.getIndex({
        fields: ["img", "type", "system.traits.value", "system.traits.size.value", "system.details.level.value"]
      });
      for (const entry of index) {
        if (entry.type !== "npc") continue;
        if (!entry.img || entry.img.includes("mystery-man")) continue;
        const traits = entry.system?.traits?.value ?? [];
        const shared = traits.filter((t) => conceptTraits.has(t)).length;
        if (!shared) continue;
        const levelGap = Math.abs((entry.system?.details?.level?.value ?? 0) - concept.level);
        const sizeBonus = entry.system?.traits?.size?.value === concept.size ? 1 : 0;
        const score = shared * 3 + sizeBonus + Math.max(0, 2 - levelGap / 4);
        if (score > bestScore) {
          bestScore = score;
          best = entry;
        }
      }
    }
    return best?.img ?? null;
  } catch (err) {
    console.warn(`${MODULE_ID} | bestiary art lookup failed`, err);
    return null;
  }
}
