import { MODULE_ID, SETTINGS, getSetting } from "./settings.mjs";
import { TREASURE_AMOUNT_MULTIPLIER } from "./tables.mjs";

/**
 * Generation presets: guidance text injected into the AI prompt that shapes
 * the creature's road map (stat scales, techniques, casting) while the GM's
 * concept text still drives flavor. Built-ins are flavor keys for the
 * Remaster PF2e class list — module-local ids, not pack UUIDs or
 * COMPLETE_PC_CLASS_SLUGS. GMs save their own presets in world settings.
 *
 * Class name set verified against PF2e 8.4.1 packs/pf2e/classes/*.json
 * (publication.remaster === true). Standard keeps the locked 23; later-book
 * extras in that pack (Animist, Exemplar, Commander, Guardian, Necromancer,
 * Runesmith) are not stock presets.
 */

export const BUILT_IN_PRESETS = [
  {
    id: "alchemist",
    name: "SIMPLYPF2E.Presets.Alchemist",
    prompt: "Build like an ALCHEMIST: a bomb-throwing tinkerer. A ranged bomb strike dealing energy damage with splash flavor, moderate attack, low-to-moderate AC and HP, high Reflex, high Crafting. A mutagen-or-elixir-flavored signature ability, alchemist-tool equipment. No spellcasting."
  },
  {
    id: "barbarian",
    name: "SIMPLYPF2E.Presets.Barbarian",
    prompt: "Build like a BARBARIAN: a furious brute. High HP, high or extreme strike damage, high Fortitude, low-to-moderate AC, low Will. Big two-handed or natural strikes, a Rage-like ability that boosts damage, Athletics and Intimidation skills. No spellcasting."
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
    id: "fighter",
    name: "SIMPLYPF2E.Presets.Fighter",
    prompt: "Build like a FIGHTER: a disciplined master of arms. High or extreme strike attack bonus, high AC, high Fortitude, moderate HP. Weapon strikes with martial traits, 2-3 trained weapon-technique feats (Power Attack, Sudden Charge, Intimidating Strike style), and a signature weapon ability. No spellcasting."
  },
  {
    id: "gunslinger",
    name: "SIMPLYPF2E.Presets.Gunslinger",
    prompt: "Build like a GUNSLINGER: a firearm duelist. Extreme or high ranged firearm strike, high Reflex, low HP, low-to-moderate AC. A jam-or-misfire-flavored drawback on the gun, a quick-draw or reload signature ability, high Acrobatics. No spellcasting."
  },
  {
    id: "inventor",
    name: "SIMPLYPF2E.Presets.Inventor",
    prompt: "Build like an INVENTOR: a gadgeteer with a signature innovation. Moderate attack, moderate AC and HP, high Crafting, and a constructed companion, weapon, or armor they tinker with. An overdrive-or-unstable-innovation signature ability that risks a malfunction. No spellcasting."
  },
  {
    id: "investigator",
    name: "SIMPLYPF2E.Presets.Investigator",
    prompt: "Build like an INVESTIGATOR: a methodical detective. High Intelligence, high Perception and Society, moderate attack that improves when they study a foe first, moderate AC and HP. A devise-a-stratagem-like ability that replaces a strike roll with a calculated one, pursue-a-lead flavor, alchemy or investigation tools as fits. No spellcasting."
  },
  {
    id: "kineticist",
    name: "SIMPLYPF2E.Presets.Kineticist",
    prompt: "Build like a KINETICIST: an elemental conduit. Impulse-style elemental attacks (a ranged blast and a melee elemental strike), high or extreme elemental damage of one element, moderate AC and HP, an overflow-or-gate-attunement signature ability. No traditional spellcasting — elemental impulses only."
  },
  {
    id: "magus",
    name: "SIMPLYPF2E.Presets.Magus",
    prompt: "Build like a MAGUS: a spellstriking hybrid. Arcane tradition with a small spell list at moderate-to-high DC, a martial weapon strike at high attack, moderate AC and HP. A spellstrike-like signature ability that delivers a spell through a weapon hit, Arcana skill. Keep the spell list tight and combat-focused."
  },
  {
    id: "monk",
    name: "SIMPLYPF2E.Presets.Monk",
    prompt: "Build like a MONK: a martial artist. Unarmed strikes with agile and finesse traits, high AC without armor, fast land speed, high Reflex and Will, moderate HP. A flurry-of-blows-like ability granting an extra strike, Acrobatics and Athletics, stance or mobility feats. No spellcasting."
  },
  {
    id: "oracle",
    name: "SIMPLYPF2E.Presets.Oracle",
    prompt: "Build like an ORACLE: a mystery-cursed divine caster. Divine tradition spellcasting at high DC with a clear mystery theme, high Charisma and Will, moderate HP, low-to-moderate AC. A curse-flavored signature ability that grows as they cast, Religion skill, a simple weapon strike."
  },
  {
    id: "psychic",
    name: "SIMPLYPF2E.Presets.Psychic",
    prompt: "Build like a PSYCHIC: an occult mind. Occult tradition spellcasting at high or extreme DC with a conscious-mind theme (unleashed psyche, telepathy, amps), low HP and AC, low attack, high Will and Intelligence or Charisma. Occultism skill, a psyche-unleash signature ability, no martial pretensions."
  },
  {
    id: "ranger",
    name: "SIMPLYPF2E.Presets.Ranger",
    prompt: "Build like a RANGER: a wilderness hunter. Both a ranged strike (bow) and a melee strike, high attack bonus, moderate AC and HP, high Survival and Nature, keen senses. A hunt-prey-like ability that improves accuracy against a marked target. No spellcasting unless the concept demands a touch of primal magic."
  },
  {
    id: "rogue",
    name: "SIMPLYPF2E.Presets.Rogue",
    prompt: "Build like a ROGUE: a sneak. High Dexterity, high Reflex, low Fortitude, moderate HP. Agile/finesse strikes, a sneak-attack-like ability dealing extra low damage against off-guard targets, high Stealth, Thievery and Deception, mobility feats (Nimble Dodge, Twin Feint style). No spellcasting."
  },
  {
    id: "sorcerer",
    name: "SIMPLYPF2E.Presets.Sorcerer",
    prompt: "Build like a SORCERER: a bloodline caster. Spellcasting at high DC in the tradition matching its bloodline (draconic=arcane, angelic=divine, fey=primal, aberrant=occult), high Charisma, low AC and HP, low attack. A bloodline-flavored signature ability and thematically unified spell choices."
  },
  {
    id: "summoner",
    name: "SIMPLYPF2E.Presets.Summoner",
    prompt: "Build like a SUMMONER: a bonded partner to an eidolon. Moderate HP, low-to-moderate AC, a high-attack eidolon strike (natural weapons) as the primary offense, and a short occult or primal spell list at moderate DC. A tandem-or-boost signature ability that empowers the eidolon. Treat the eidolon as this creature's main strike and signature, not a second actor."
  },
  {
    id: "swashbuckler",
    name: "SIMPLYPF2E.Presets.Swashbuckler",
    prompt: "Build like a SWASHBUCKLER: a stylish duelist. High Dexterity, high Reflex, agile/finesse strikes, moderate HP, moderate AC. A panache-like resource that fuels a finishing strike dealing extra damage, high Acrobatics and Performance or Diplomacy, mobility feats. No spellcasting."
  },
  {
    id: "thaumaturge",
    name: "SIMPLYPF2E.Presets.Thaumaturge",
    prompt: "Build like a THAUMATURGE: a folkloric hunter of the strange. Moderate attack that improves against a studied foe, an implement-flavored tool (amulet, weapon, tome), moderate AC and HP, high Occultism or esoteric Lore. An exploit-vulnerability-like signature ability that makes a weakness real. No spellcasting."
  },
  {
    id: "witch",
    name: "SIMPLYPF2E.Presets.Witch",
    prompt: "Build like a WITCH: a patron-taught caster. Spellcasting at high DC in the tradition matching the patron (the lesson theme should unify the spell list), a familiar-flavored signature ability, high corresponding skill (Occultism, Nature, Arcana, or Religion), low HP, low AC, low attack. A hex-like focus-style ability they can use each round, a staff or dagger strike as a last resort."
  },
  {
    id: "wizard",
    name: "SIMPLYPF2E.Presets.Wizard",
    prompt: "Build like a WIZARD: an arcane scholar. Arcane tradition spellcasting at high or extreme DC with a clear school theme, low HP, low AC, low attack, terrible Fortitude, high Will and Intelligence. Arcana and school-related Lore skills, a signature ability tied to its magical specialty, a dagger or staff strike as a last resort."
  }
];

/** Module-local flavor keys for the Standard optgroup; not pack document ids. */
export const STANDARD_PRESET_IDS = BUILT_IN_PRESETS.map((p) => p.id);

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
  alchemist: [
    "A goblin bombardier with singed eyebrows and infinite optimism",
    "A plague-masked chemist selling cures for the poisons she also sells",
    "A dwarven demolitionist who measures friendship in blast radius",
    "A back-alley mutagenist one dose away from perfection",
    "A traveling apothecary whose cart is a rolling armory"
  ],
  barbarian: [
    "A frost giant exile who wrestles mammoths for sport",
    "An orc battle-priestess who rages when her ancestors sing",
    "A gnoll pit fighter with chains still bolted to his wrists",
    "A berserker whose tattoos burn brighter the angrier she gets",
    "A half-orc lumberjack pushed one insult too far"
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
  fighter: [
    "A disgraced duelist selling her rapier to the highest bidder",
    "A hobgoblin drill sergeant who fights like his manual is scripture",
    "An arena-champion minotaur famous for never using the same weapon twice",
    "A kobold pikeman who has outlived twelve warbands",
    "A knight-errant hunting the beast that took her shield arm"
  ],
  gunslinger: [
    "A dune-town pistolero who never draws first and never misses second",
    "A clockwork-gun tinkerer whose prototype still smokes after every shot",
    "A railway guard who talks to her rifle like an old partner",
    "A carnival sharpshooter collecting bounties between shows",
    "A disgraced officer whose last bullet is always for the one who framed him"
  ],
  inventor: [
    "A gnome whose backpack unfolds into a walking siege engine",
    "A dockside mechanic who overclocks anything with a hinge",
    "A rival-academy dropout racing to finish a thinking construct",
    "A battlefield surgeon whose tools are also weapons",
    "A sky-ship engineer keeping a dying airship aloft with spite and wire"
  ],
  investigator: [
    "A city-watch consultant who solves murders the watch would rather ignore",
    "A traveling pathologist who interviews the dead more than the living",
    "A university don who treats every tavern brawl as a case file",
    "A retired inspector pulled back by a cipher only she can read",
    "A street-smart alchemist who proves guilt one sample at a time"
  ],
  kineticist: [
    "A quarry worker who learned to speak in landslides",
    "A fire-gate pilgrim whose footprints scorch the road behind her",
    "A storm-touched fisher who pulls lightning instead of nets",
    "A wood-soul hermit growing a living wall around a cursed spring",
    "An air-gate courier who arrives before the letter that hired them"
  ],
  magus: [
    "A spell-duelist who writes her thesis on other people's armor",
    "A ruined-tower student stitching sword forms to half-remembered cantrips",
    "A mercenary who sells one perfect spellstrike per contract",
    "An elven blade-scholar hunting the mage who stole her grimoire",
    "A battlefield hybrid who counts victories in fused steel and fire"
  ],
  monk: [
    "A serene crane-stance master who has never raised his voice",
    "A mountain hermit who punches avalanches off course",
    "A temple orphan whose fists move faster than doubt",
    "A drunken boxer banned from every tavern in the province",
    "An iron-skinned pilgrim walking to atone for a war"
  ],
  oracle: [
    "A battle-mystery seer whose wounds rewrite themselves mid-fight",
    "A bones-touched undertaker who hears tomorrow's funerals",
    "A life-mystery healer who pays for every miracle with a cough of ash",
    "A flames-cursed preacher who cannot hold a candle without it bowing",
    "A cosmos-struck navigator who dreams in constellations"
  ],
  psychic: [
    "A quiet librarian whose thoughts have teeth",
    "An unleashed-psyche street performer who forgets which memories are hers",
    "A mind-mage courier who delivers secrets without opening her mouth",
    "A monastery reject whose amps crack stained glass",
    "A telepath who keeps a second conversation running with the dead"
  ],
  ranger: [
    "A grizzled bounty hunter who never loses a trail",
    "An elf warden guarding the last grove of a burned forest",
    "A goblin beast-tamer with a trained giant weasel",
    "A tundra guide who whispers to hawks",
    "A poacher-turned-protector stalking the lords who once hired him"
  ],
  rogue: [
    "A halfling pickpocket who robs tax collectors exclusively",
    "A tiefling knife-dancer working the night markets",
    "A ratfolk informant who sells secrets to every side at once",
    "A cat burglar who leaves calling cards in rival nobles' vaults",
    "A masked vigilante feared by the dockside gangs"
  ],
  sorcerer: [
    "A draconic heir whose temper literally smolders",
    "A fey-blooded charlatan whose lies come true at the worst times",
    "A storm-souled sailor the lightning refuses to strike",
    "An aberrant child of the deep with one shadow too many",
    "An angelic bloodline gone bitter and burning"
  ],
  summoner: [
    "A shy scholar whose eidolon does all the talking — and the biting",
    "A pact-bound ranger walking beside a beast made of old oaths",
    "A carnival mystic whose 'costume' is a second soul",
    "A grieving summoner whose partner still wears a lost friend's face",
    "A planar courier sharing one shadow with a loyal eidolon"
  ],
  swashbuckler: [
    "A rooftop duelist who bows before every insult",
    "A riverboat bravo collecting scars like theater reviews",
    "A disowned noble who fences for breakfast and gossip for supper",
    "A masked festival champion who never removes the grin",
    "A shipboard finisher who treats boarding actions as choreography"
  ],
  thaumaturge: [
    "A folklorist who keeps vampires honest with a bag of borrowed relics",
    "A traveling exorcist whose implements never match the same story twice",
    "A museum curator who fights with the exhibits",
    "A witch-hunter who would rather bargain than burn",
    "A street-charm seller who knows which trinket actually works"
  ],
  witch: [
    "A swamp patron's favorite, bargaining in frogs and favors",
    "A city-hedge witch whose familiar runs a gossip network",
    "A lesson-of-night student lighting lanterns that remember names",
    "A winter-patron hermit whose tea leaves predict grudges",
    "A traveling hexer who never sits with her back to a door"
  ],
  wizard: [
    "A paranoid abjurer whose tower has three hundred locks and one door",
    "A necromancer who insists he is merely a 'post-life consultant'",
    "An apprentice who bound a star and cannot let go",
    "A battlefield evoker who numbers her fireballs",
    "A chronomancer always three seconds ahead of you"
  ]
};

/** Placeholder example for a preset, cycling with `tick`. */
export function examplePrompt(presetId, tick) {
  const pool = EXAMPLE_PROMPTS[presetId] ?? EXAMPLE_PROMPTS[""];
  return pool[((tick % pool.length) + pool.length) % pool.length];
}

/**
 * Keep a still-valid last-used id. Empty stays empty (fresh default is
 * None so Monster/NPC/Encounter are not force-flavored). A vanished id
 * (deleted custom or retired thematic built-in) falls back to the first
 * Standard class, not None.
 */
export function resolveSelectedPresetId(id, customPresets = []) {
  if (!id) return "";
  if (BUILT_IN_PRESETS.some((p) => p.id === id)) return id;
  if ((Array.isArray(customPresets) ? customPresets : []).some((p) => p && p.id === id && p.name)) return id;
  return BUILT_IN_PRESETS[0]?.id ?? "";
}

/**
 * Picker model: None is outside groups; Standard is always present; Custom
 * is omitted by the caller when `custom` is empty.
 */
export function presetPickerGroups(selectedId, customPresets = []) {
  const selected = resolveSelectedPresetId(selectedId, customPresets);
  return {
    selectedId: selected,
    standard: BUILT_IN_PRESETS.map((p) => ({ id: p.id, nameKey: p.name, selected: selected === p.id })),
    custom: (Array.isArray(customPresets) ? customPresets : [])
      .filter((p) => p && p.id && p.name)
      .map((p) => ({ id: p.id, name: p.name, selected: selected === p.id }))
  };
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
const RANDOM_PC_ORIGINS = [
  "dwarven", "elven", "gnomish", "goblin", "halfling", "human", "orc", "leshy"
];
const RANDOM_PC_ROLES = [
  "mercenary", "exiled heir", "caravan guard", "disgraced duelist",
  "village champion", "retired gladiator", "knight-errant", "dockside brawler",
  "oathbound bodyguard", "battlefield veteran"
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * A fresh local dice-roll brief. Monster/NPC/Encounter reuse the creature
 * type × role × home × twist sentence; Character mode uses a person-oriented
 * adventurer brief so the PC pipeline is not fed a monster concept. Flavor
 * only — the module never treats these words as class or ancestry picks.
 */
export function randomBrief(mode = "monster") {
  if (mode === "character") {
    return `Invent an original ${pick(RANDOM_PC_ORIGINS)} ${pick(RANDOM_PC_ROLES)} from ${pick(RANDOM_PLACES)}, ${pick(RANDOM_TWISTS)}. Surprise us: avoid clichés, and give them one memorable personality hook.`;
  }
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
