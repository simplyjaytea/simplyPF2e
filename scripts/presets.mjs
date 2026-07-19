import { MODULE_ID, SETTINGS, getSetting } from "./settings.mjs";
import { TREASURE_AMOUNT_MULTIPLIER } from "./tables.mjs";

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
  },
  {
    id: "cultivator",
    name: "SIMPLYPF2E.Presets.Cultivator",
    prompt: "Build like a CULTIVATOR: a wuxia-style internal-energy martial artist. Unarmed or simple-weapon strikes, high or extreme attack, high Reflex and Will, fast land speed, moderate AC. A ki/qi-flavored signature ability (a focused palm strike, a breath technique, a burst of inner power), Acrobatics and Athletics. At most a few focus-style occult or primal spells channeled as internal energy."
  },
  {
    id: "fire-mage",
    name: "SIMPLYPF2E.Presets.FireMage",
    prompt: "Build like a FIRE MAGE: a pyromancer. Arcane or primal spellcasting at high or extreme DC weighted almost entirely toward fire spells, a fire resistance or immunity, low AC and HP, low attack, high Will. A signature ability that ignites or spreads flame, Arcana skill, a staff or dagger strike as a last resort."
  },
  {
    id: "assassin",
    name: "SIMPLYPF2E.Presets.Assassin",
    prompt: "Build like an ASSASSIN: a lethal killer for hire. High Dexterity, high Reflex, agile/finesse or ranged strikes, moderate HP, low-to-moderate AC. A sneak-attack-or-death-blow ability dealing extra damage against unaware or off-guard targets, applied poisons, high Stealth, Deception and Thievery, mobility and hidden-strike feats. No spellcasting."
  },
  {
    id: "healer",
    name: "SIMPLYPF2E.Presets.Healer",
    prompt: "Build like a HEALER: a support specialist. Divine or primal spellcasting at high DC centered on healing and restorative spells, high Will, moderate HP and AC, low attack. A signature ability that heals or shields allies each round, high Medicine, healer's tools, a simple weapon strike only for self-defense."
  },
  {
    id: "tank",
    name: "SIMPLYPF2E.Presets.Tank",
    prompt: "Build like a TANK: an immovable defender. Extreme or high AC, high Fortitude, high HP, moderate attack and damage. A defensive reaction or aura that protects nearby allies or punishes attackers, heavy armor and a shield, Athletics and Intimidation. No spellcasting."
  },
  {
    id: "skill-monkey",
    name: "SIMPLYPF2E.Presets.SkillMonkey",
    prompt: "Build like a SKILL-MONKEY: a versatile generalist who solves problems out of combat. Moderate everything in a fight, but an unusually broad spread of trained skills at high scale (Acrobatics, Stealth, Thievery, Society, Deception, and a couple of Lores), utility gear (thieves' tools, a climbing kit, a disguise kit), and skill-boosting feats. Light weapon strike, no spellcasting unless a touch of utility magic fits."
  }
];

/**
 * Example concept sentences shown as the description placeholder, five per
 * preset (keyed by preset id; "" = no preset). The generator cycles through
 * them to show the range of what each preset can build.
 */
export const EXAMPLE_PROMPTS = {
  "": [
    "A cunning swamp hag who brews poisons from drowned travelers",
    "A clockwork sentinel still guarding a vault whose owners died centuries ago",
    "A pack-hunting shadow cat that phases through walls",
    "A jovial innkeeper secretly feeding guests to the cellar mimic",
    "A storm spirit bound into a lighthouse, furious at passing ships"
  ],
  fighter: [
    "A disgraced duelist selling her rapier to the highest bidder",
    "A hobgoblin drill sergeant who fights like his manual is scripture",
    "An arena-champion minotaur famous for never using the same weapon twice",
    "A kobold pikeman who has outlived twelve warbands",
    "A knight-errant hunting the beast that took her shield arm"
  ],
  barbarian: [
    "A frost giant exile who wrestles mammoths for sport",
    "An orc battle-priestess who rages when her ancestors sing",
    "A gnoll pit fighter with chains still bolted to his wrists",
    "A berserker whose tattoos burn brighter the angrier she gets",
    "A half-orc lumberjack pushed one insult too far"
  ],
  rogue: [
    "A halfling pickpocket who robs tax collectors exclusively",
    "A tiefling knife-dancer working the night markets",
    "A ratfolk informant who sells secrets to every side at once",
    "A cat burglar who leaves calling cards in rival nobles' vaults",
    "A masked vigilante feared by the dockside gangs"
  ],
  ranger: [
    "A grizzled bounty hunter who never loses a trail",
    "An elf warden guarding the last grove of a burned forest",
    "A goblin beast-tamer with a trained giant weasel",
    "A tundra guide who whispers to hawks",
    "A poacher-turned-protector stalking the lords who once hired him"
  ],
  monk: [
    "A serene crane-stance master who has never raised his voice",
    "A mountain hermit who punches avalanches off course",
    "A temple orphan whose fists move faster than doubt",
    "A drunken boxer banned from every tavern in the province",
    "An iron-skinned pilgrim walking to atone for a war"
  ],
  cleric: [
    "A plague doctor channeling a god of mercy through grim tools",
    "A war priest who blesses blades mid-swing",
    "A gravekeeper who politely asks the dead to stay put",
    "A zealous inquisitor certain the village hides heretics",
    "A kindly abbess with a militant streak and a warhammer"
  ],
  druid: [
    "A moss-covered elder who speaks for the swamp itself",
    "A storm-caller who dances lightning down from the peaks",
    "A mushroom farmer whose crops walk at night",
    "A rooftop-garden druid waging quiet war on the city below",
    "A wildfire shepherd who burns forests so they may live"
  ],
  wizard: [
    "A paranoid abjurer whose tower has three hundred locks and one door",
    "A necromancer who insists he is merely a 'post-life consultant'",
    "An apprentice who bound a star and cannot let go",
    "A battlefield evoker who numbers her fireballs",
    "A chronomancer always three seconds ahead of you"
  ],
  sorcerer: [
    "A draconic heir whose temper literally smolders",
    "A fey-blooded charlatan whose lies come true at the worst times",
    "A storm-souled sailor the lightning refuses to strike",
    "An aberrant child of the deep with one shadow too many",
    "An angelic bloodline gone bitter and burning"
  ],
  bard: [
    "A war-drummer whose beat keeps a whole company marching",
    "A courtly satirist whose verses have started two duels and one war",
    "A sea-shanty singer who calms krakens",
    "A funeral singer who can make the dead weep",
    "A street violinist collecting secrets between songs"
  ],
  champion: [
    "A weathered paladin sworn to guard a village that fears her",
    "A redeemed blackguard polishing tarnished honor",
    "A shield-bearer who has never let an ally fall",
    "A holy duelist who challenges tyrants at their own feasts",
    "A crusader whose oath outlived his god"
  ],
  alchemist: [
    "A goblin bombardier with singed eyebrows and infinite optimism",
    "A plague-masked chemist selling cures for the poisons she also sells",
    "A dwarven demolitionist who measures friendship in blast radius",
    "A back-alley mutagenist one dose away from perfection",
    "A traveling apothecary whose cart is a rolling armory"
  ],
  cultivator: [
    "A mountain-sect disciple chasing the next breakthrough in his art",
    "A disgraced sword-saint whose inner energy runs cold as jade",
    "A wandering monk who bottles storms in her breathing",
    "An immortal's last student guarding a half-burned technique manual",
    "A river-spirit's heir learning to still his own heartbeat"
  ],
  "fire-mage": [
    "A pyromancer who names every fire she starts",
    "An exiled evoker whose spellbook is a scarred wall of soot",
    "A hearth-witch keeping a village warm and a grudge warmer",
    "A volcano cultist certain the world ends in cleansing flame",
    "A fireworks artificer one bad night from arson charges"
  ],
  assassin: [
    "A guild killer paid to make an accident look like an accident",
    "A masked poisoner who leaves a single black flower",
    "A retired blade dragged back for one last name on the list",
    "A courtesan-spy who knows exactly where the artery is",
    "A silent halfling who has never been seen by a living witness"
  ],
  healer: [
    "A battlefield medic who has stitched more enemies than friends",
    "A grove-tender whose touch coaxes bone back together",
    "A plague-ward sister rationing miracles by the hour",
    "A disgraced surgeon seeking absolution one patient at a time",
    "A gentle oracle who feels every wound she mends"
  ],
  tank: [
    "A shield-bearer who has never let an ally fall behind him",
    "A dwarven wall-in-armor who dares foes to come closer",
    "A fortress-knight sworn to be the last one standing",
    "A scarred veteran who counts her worth in blows absorbed",
    "A bridge-guard who has turned back three armies alone"
  ],
  "skill-monkey": [
    "A jack-of-all-trades who has faked six professions this month",
    "A tomb-robber who reads locks like bedtime stories",
    "A fixer who knows a guy for absolutely everything",
    "A traveling troubleshooter with a tool for every disaster",
    "A charming grifter three steps ahead of every mark"
  ]
};

/** Placeholder example for a preset, cycling with `tick`. */
export function examplePrompt(presetId, tick) {
  const pool = EXAMPLE_PROMPTS[presetId] ?? EXAMPLE_PROMPTS[""];
  return pool[((tick % pool.length) + pool.length) % pool.length];
}

const RANDOM_TYPES = [
  "aberration", "animal", "beast", "construct", "dragon", "elemental", "fey",
  "fiend", "fungus", "giant", "humanoid", "monitor", "ooze", "plant", "undead"
];
const RANDOM_ROLES = [
  "brute", "sneak", "skirmisher", "sniper", "soldier", "spellcaster", "ambusher", "leader with minion tactics"
];
const RANDOM_PLACES = [
  "a haunted swamp", "a frozen mountain pass", "ancient ruins", "the city underbelly",
  "a burning desert", "the deep forest", "a coastal sea-cave", "the underdark",
  "a storm-wracked peak", "a forgotten battlefield"
];
const RANDOM_TWISTS = [
  "with an unexpectedly gentle side", "obsessed with collecting something strange",
  "that mimics its prey", "bound by an old bargain", "worshipped by locals as a god",
  "that hunts only at dusk", "hoarding treasure it cannot use", "fleeing something even worse",
  "far smarter than it looks", "stitched together from many creatures"
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * A fresh randomized creature brief for "Random" mode — a local dice roll
 * over creature type, combat role, home and twist so repeat generations
 * don't converge on the same ideas.
 */
export function randomBrief() {
  return `Invent an original ${pick(RANDOM_TYPES)} ${pick(RANDOM_ROLES)} from ${pick(RANDOM_PLACES)}, ${pick(RANDOM_TWISTS)}. Surprise us: avoid clichés, and give it one memorable signature ability.`;
}

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

/** Value domains for the optional generator-default fields a preset may carry. */
export const PRESET_RARITIES = ["common", "uncommon", "rare", "unique"];

/**
 * Pick only the valid optional generator defaults (rarity, allowSpellcasting,
 * treasureAmount) out of `fields` — anything absent or out of domain is
 * dropped, so older presets simply don't carry the field.
 */
function presetDefaults(fields = {}) {
  const out = {};
  if (PRESET_RARITIES.includes(fields.rarity)) out.rarity = fields.rarity;
  if (typeof fields.allowSpellcasting === "boolean") out.allowSpellcasting = fields.allowSpellcasting;
  if (Object.hasOwn(TREASURE_AMOUNT_MULTIPLIER, fields.treasureAmount ?? "")) out.treasureAmount = fields.treasureAmount;
  return out;
}

export async function addCustomPreset(name, prompt, fields = {}) {
  const preset = {
    id: `custom-${foundry.utils.randomID(8)}`,
    name: String(name).slice(0, 60),
    prompt: String(prompt),
    ...presetDefaults(fields),
    custom: true
  };
  await game.settings.set(MODULE_ID, SETTINGS.customPresets, [...getCustomPresets(), preset]);
  return preset;
}

/** Merge new values into an existing custom preset (no-op if not found). */
export async function updateCustomPreset(id, fields = {}) {
  // Clone before mutating: getCustomPresets() hands back the live setting
  // objects, and mutating them in place before settings.set could confuse
  // Foundry's cached value.
  const presets = getCustomPresets().map((p) => ({ ...p }));
  const preset = presets.find((p) => p.id === id && p.custom);
  if (!preset) return null;
  if (typeof fields.name === "string" && fields.name.trim()) preset.name = fields.name.slice(0, 60);
  if (typeof fields.prompt === "string" && fields.prompt.trim()) preset.prompt = fields.prompt;
  Object.assign(preset, presetDefaults(fields));
  await game.settings.set(MODULE_ID, SETTINGS.customPresets, presets);
  return preset;
}

export async function deleteCustomPreset(id) {
  await game.settings.set(
    MODULE_ID,
    SETTINGS.customPresets,
    getCustomPresets().filter((p) => p.id !== id)
  );
}

/** Pretty JSON of the custom presets matching `ids` (all customs if omitted). */
export function exportPresets(ids = null) {
  const presets = getCustomPresets().filter((p) => !ids || ids.includes(p.id));
  return JSON.stringify(presets, null, 2);
}

/**
 * Import presets from a JSON string (a single preset object or an array).
 * Each valid entry (non-empty name + prompt strings) is added as a NEW custom
 * preset with a fresh id — imported ids are never trusted, avoiding
 * collisions with existing presets. Malformed entries are silently skipped.
 */
export async function importPresets(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { added: 0, skipped: 1 };
  }
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  let added = 0;
  let skipped = 0;
  for (const entry of entries) {
    const valid = entry
      && typeof entry.name === "string" && entry.name.trim()
      && typeof entry.prompt === "string" && entry.prompt.trim();
    if (!valid) {
      skipped++;
      continue;
    }
    await addCustomPreset(entry.name.trim(), entry.prompt.trim(), entry);
    added++;
  }
  return { added, skipped };
}
