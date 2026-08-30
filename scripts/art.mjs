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
    let bestScore = -Infinity;
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
        const levelGap = Math.abs((entry.system?.details?.level?.value ?? 0) - concept.level);
        const sizeBonus = entry.system?.traits?.size?.value === concept.size ? 1 : 0;
        // A real creature scaffold is mandatory for complete-only creature
        // creation. Prefer trait/size/level similarity, but retain the
        // closest level-and-size actor as an exact fallback for an unusual
        // yet valid trait combination instead of silently dropping scaffolds.
        const score = shared * 100 + sizeBonus * 10 - levelGap;
        const tie = best && `${packId}:${entry._id}`.localeCompare(`${best.packId}:${best.entry._id}`);
        if (score > bestScore || (score === bestScore && tie < 0)) {
          bestScore = score;
          best = { pack, packId, entry };
        }
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
