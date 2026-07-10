import { MODULE_ID, SETTINGS, getSetting } from "./settings.mjs";

/**
 * Generation presets: guidance text injected into the AI prompt that shapes
 * the creature's road map (stat scales, techniques, casting) while the GM's
 * concept text still drives flavor. Built-ins cover the standard fantasy
 * classes; GMs can save their own presets, stored in world settings.
 */

export const BUILT_IN_PRESETS = [
  {
    id: "fighter",
    name: "SIMPLYPF2E.Presets.Fighter",
    prompt: "Build like a FIGHTER: a disciplined master of arms. High or extreme strike attack bonus, high AC, high Fortitude, moderate HP. Weapon strikes with martial traits, 2-3 trained weapon-technique feats (Power Attack, Sudden Charge, Intimidating Strike style), and a signature weapon ability. No spellcasting."
  },
  {
    id: "barbarian",
    name: "SIMPLYPF2E.Presets.Barbarian",
    prompt: "Build like a BARBARIAN: a furious brute. High HP, high or extreme strike damage, high Fortitude, low-to-moderate AC, low Will. Big two-handed or natural strikes, a Rage-like ability that boosts damage, Athletics and Intimidation skills. No spellcasting."
  },
  {
    id: "rogue",
    name: "SIMPLYPF2E.Presets.Rogue",
    prompt: "Build like a ROGUE: a sneak. High Dexterity, high Reflex, low Fortitude, moderate HP. Agile/finesse strikes, a sneak-attack-like ability dealing extra low damage against off-guard targets, high Stealth, Thievery and Deception, mobility feats (Nimble Dodge, Twin Feint style). No spellcasting."
  },
  {
    id: "ranger",
    name: "SIMPLYPF2E.Presets.Ranger",
    prompt: "Build like a RANGER: a wilderness hunter. Both a ranged strike (bow) and a melee strike, high attack bonus, moderate AC and HP, high Survival and Nature, keen senses. A hunt-prey-like ability that improves accuracy against a marked target. No spellcasting unless the concept demands a touch of primal magic."
  },
  {
    id: "monk",
    name: "SIMPLYPF2E.Presets.Monk",
    prompt: "Build like a MONK: a martial artist. Unarmed strikes with agile and finesse traits, high AC without armor, fast land speed, high Reflex and Will, moderate HP. A flurry-of-blows-like ability granting an extra strike, Acrobatics and Athletics, stance or mobility feats. No spellcasting."
  },
  {
    id: "cleric",
    name: "SIMPLYPF2E.Presets.Cleric",
    prompt: "Build like a CLERIC: a divine spellcaster. Divine tradition spellcasting at high DC with healing or war spells fitting the deity, high Will, moderate HP and AC, low-to-moderate attack. Religion and Medicine skills, a domain-flavored signature ability, a simple weapon strike."
  },
  {
    id: "druid",
    name: "SIMPLYPF2E.Presets.Druid",
    prompt: "Build like a DRUID: a primal spellcaster. Primal tradition spellcasting at high DC (nature, weather, animal spells), high Will, moderate HP, low-to-moderate AC and attack. Nature and Survival skills, wild empathy or shapeshifting-flavored signature ability, a staff or natural strike."
  },
  {
    id: "wizard",
    name: "SIMPLYPF2E.Presets.Wizard",
    prompt: "Build like a WIZARD: an arcane scholar. Arcane tradition spellcasting at high or extreme DC with a clear school theme, low HP, low AC, low attack, terrible Fortitude, high Will and Intelligence. Arcana and school-related Lore skills, a signature ability tied to its magical specialty, a dagger or staff strike as a last resort."
  },
  {
    id: "sorcerer",
    name: "SIMPLYPF2E.Presets.Sorcerer",
    prompt: "Build like a SORCERER: a bloodline caster. Spellcasting at high DC in the tradition matching its bloodline (draconic=arcane, angelic=divine, fey=primal, aberrant=occult), high Charisma, low AC and HP, low attack. A bloodline-flavored signature ability and thematically unified spell choices."
  },
  {
    id: "bard",
    name: "SIMPLYPF2E.Presets.Bard",
    prompt: "Build like a BARD: an occult performer. Occult tradition spellcasting at high DC including enchantment and support spells, high Charisma and Performance, moderate AC, HP and Reflex. A composition-like ability that aids allies or hinders enemies each round, Diplomacy and Deception skills, a light weapon strike."
  },
  {
    id: "champion",
    name: "SIMPLYPF2E.Presets.Champion",
    prompt: "Build like a CHAMPION: a holy defender. Extreme or high AC, high Fortitude and Will, high HP, moderate attack and damage. A defensive reaction that protects nearby allies when they are hit, Religion skill, heavy armor and a martial weapon. No spellcasting beyond at most 1-2 divine support spells."
  },
  {
    id: "alchemist",
    name: "SIMPLYPF2E.Presets.Alchemist",
    prompt: "Build like an ALCHEMIST: a bomb-throwing tinkerer. A ranged bomb strike dealing energy damage with splash flavor, moderate attack, low-to-moderate AC and HP, high Reflex, high Crafting. A mutagen-or-elixir-flavored signature ability, alchemist-tool equipment. No spellcasting."
  }
];

export function getCustomPresets() {
  const stored = getSetting(SETTINGS.customPresets);
  return Array.isArray(stored) ? stored.filter((p) => p && p.id && p.name) : [];
}

/** Find a preset (built-in or custom) by id. */
export function findPreset(id) {
  if (!id) return null;
  return (
    BUILT_IN_PRESETS.find((p) => p.id === id)
    ?? getCustomPresets().find((p) => p.id === id)
    ?? null
  );
}

export async function addCustomPreset(name, prompt) {
  const preset = {
    id: `custom-${foundry.utils.randomID(8)}`,
    name: String(name).slice(0, 60),
    prompt: String(prompt),
    custom: true
  };
  await game.settings.set(MODULE_ID, SETTINGS.customPresets, [...getCustomPresets(), preset]);
  return preset;
}

export async function deleteCustomPreset(id) {
  await game.settings.set(
    MODULE_ID,
    SETTINGS.customPresets,
    getCustomPresets().filter((p) => p.id !== id)
  );
}
