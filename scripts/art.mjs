import { MODULE_ID, SETTINGS, getSetting } from "./settings.mjs";
import { generateImage } from "./ai.mjs";

/**
 * Creature art: generate a portrait via the configured image API and store
 * it in the world's data folder, or fall back to borrowing token art from
 * the closest-matching bestiary creature when no image API is configured.
 */

const ART_DIR = "simplypf2e-art";
const BESTIARY_PACKS = ["pf2e.pathfinder-monster-core", "pf2e.pathfinder-bestiary"];

const slugify = (value) =>
  String(value ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

function filePicker() {
  return foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
}

/** True when an image-generation model is configured. */
export function imageGenerationEnabled() {
  return Boolean(getSetting(SETTINGS.imageModel));
}

/**
 * Generate a portrait for the concept and upload it to the world.
 * @returns {Promise<string|null>} stored image path, or null on any failure
 */
export async function generatePortrait(concept) {
  try {
    const prompt = [
      `Fantasy creature portrait for a tabletop RPG: ${concept.name}.`,
      concept.readAloud || concept.blurb || concept.description || "",
      "Painterly digital art, dramatic lighting, centered subject, plain dark background, no text, no watermark."
    ].filter(Boolean).join(" ");

    const result = await generateImage({ prompt });
    let blob;
    if (result.b64) {
      const bytes = Uint8Array.from(atob(result.b64), (c) => c.charCodeAt(0));
      blob = new Blob([bytes], { type: "image/png" });
    } else if (result.url) {
      const response = await fetch(result.url);
      if (!response.ok) return null;
      blob = await response.blob();
    } else {
      return null;
    }

    const FP = filePicker();
    try {
      await FP.createDirectory("data", ART_DIR);
    } catch (err) {
      // Directory already exists — fine.
    }
    const file = new File([blob], `${slugify(concept.name) || "creature"}-${Date.now()}.png`, { type: "image/png" });
    const uploaded = await FP.upload("data", ART_DIR, file, {}, { notify: false });
    return uploaded?.path ?? null;
  } catch (err) {
    console.warn(`${MODULE_ID} | portrait generation failed`, err);
    return null;
  }
}

/**
 * Fallback art: find the bestiary creature that best matches this concept's
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

/** Best available art for a concept: generated portrait, else bestiary art. */
export async function resolveArt(concept, { allowGeneration = true } = {}) {
  if (allowGeneration && imageGenerationEnabled()) {
    const generated = await generatePortrait(concept);
    if (generated) return generated;
  }
  return findBestiaryArt(concept);
}
