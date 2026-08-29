import { MODULE_ID } from "./settings.mjs";
import { getPacksFor } from "./compendium.mjs";

/**
 * Creature art: borrow token art from the bestiary creature that best
 * matches the concept's creature-type traits, size and level.
 */

/** Choose one exact bestiary actor to supply established token structure/art. */
export async function findBestiaryScaffold(concept) {
  try {
    const conceptTraits = new Set(concept.traits);
    let best = null;
    let bestScore = 0;
    for (const packId of getPacksFor("bestiaryActors")) {
      const pack = game.packs.get(packId);
      if (!pack) continue;
      const index = await pack.getIndex({
        fields: ["img", "type", "system.traits.value", "system.traits.size.value", "system.details.level.value"]
      });
      for (const entry of index) {
        if (entry.type !== "npc") continue;
        const traits = entry.system?.traits?.value ?? [];
        const shared = traits.filter((trait) => conceptTraits.has(trait)).length;
        if (!shared) continue;
        const levelGap = Math.abs((entry.system?.details?.level?.value ?? 0) - concept.level);
        const sizeBonus = entry.system?.traits?.size?.value === concept.size ? 1 : 0;
        const score = shared * 3 + sizeBonus + Math.max(0, 2 - levelGap / 4);
        if (score > bestScore) { bestScore = score; best = { pack, entry }; }
      }
    }
    const actor = best ? await best.pack.getDocument(best.entry._id) : null;
    return actor?.toObject?.() ?? null;
  } catch (err) {
    console.warn(`${MODULE_ID} | bestiary scaffold lookup failed`, err);
    return null;
  }
}

/**
 * Find the bestiary creature that best matches this concept's
 * creature-type traits, size and level, and reuse its artwork.
 * @returns {Promise<string|null>}
 */
export async function findBestiaryArt(concept) {
  const scaffold = await findBestiaryScaffold(concept);
  return scaffold?.img && !scaffold.img.includes("mystery-man") ? scaffold.img : null;
}
