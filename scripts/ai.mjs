import { SETTINGS, getSetting } from "./settings.mjs";
import { damageDiceForLevel, saveDcForLevel } from "./item-builder.mjs";

/**
 * Client for any OpenAI-compatible chat completions API (DeepSeek, OpenAI,
 * OpenRouter, Ollama, LM Studio, ...). The endpoint, key and model are all
 * world settings, so each table can bring its own provider.
 */

/* Shared reminder everywhere the AI names a published item — the Remaster
   renamed many classics, and the AI defaults to pre-Remaster memory unless
   told otherwise every time. */
const REMASTER_NOTE = `using CURRENT PF2e REMASTER names, never the old pre-Remaster name — e.g. "Thunderstone" is now "Blasting Stone", the old "Bag of Holding" is now "Spacious Pouch"`;

/* How the GM's Treasure amount setting (Stingy/Standard/Generous — see
 * TREASURE_AMOUNT_MULTIPLIER in tables.mjs) should bend the item COUNT and
 * richness the model writes, not just the post-hoc coin padding that
 * applyTreasureBudget does. Without this, the model wrote the same 3-8-item,
 * "1-2 magic items" baseline regardless of the slider, and named items are
 * never trimmed after the fact — so Stingy and Generous looked identical
 * except for the coin total. */
const LOOT_AMOUNT_GUIDE = {
  stingy: `This GM wants SPARSE loot: lean to the LOW end of every range below (2-3 items total), usually skip the magic-item entry entirely unless the concept specifically calls for one, and keep named items cheap/common.`,
  standard: `Use the ranges below as written.`,
  generous: `This GM wants GENEROUS loot: lean to the HIGH end of every range below (6-8 items total), always include at least one treasure or magic item, and prefer pricier named items when a few options fit the concept.`
};

/* Loot rules shared between the creature concept prompt, the reroll-loot
 * prompt, and (via subject="character") the PC starting-wealth-items prompt. */
function lootGuide(amount, subject = "creature") {
  const amountNote = LOOT_AMOUNT_GUIDE[amount] ?? LOOT_AMOUNT_GUIDE.standard;
  const origin = subject === "character"
    ? "3-8 items bought with part of their starting wealth (not everyday adventuring gear, which is handled separately — leave meaningful gold unspent rather than trying to spend it all here)"
    : "3-8 items dropped on defeat";
  const hoardTrigger = subject === "character" ? "the character's backstory" : "the creature's description";
  return `${amountNote} ${origin}; "value" is the approximate price of ONE unit in gold pieces (used when an item has no compendium match). Coins: use "Gold Coins" or "Silver Coins" with quantity = the number of coins (e.g. {"name": "Gold Coins", "quantity": 35, "value": 1}), scaled to level and rarity. Spell scrolls: "Scroll of {exact PF2e spell name} (Rank {n})" with a real non-cantrip spell and a rank it exists at, castable at the ${subject}'s level (rank <= ceil((level+2)/2)). Other items MUST be EXACT published item names ${REMASTER_NOTE}, including the grade in parentheses where one exists (e.g. "Healing Potion (Lesser)", "Elixir of Life (Minor)", "Smokestick (Lesser)"); NO invented items. Include 1-2 coin entries, 1-2 consumables, and 1-2 treasure or magic items of the ${subject}'s level or lower (adjusted per the amount guidance above). EXCEPTION: if ${hoardTrigger} or the GM's request explicitly calls for abundant loot (a hoard, riches, a wealthy creature, a dragon's hoard, "lots of loot", etc.), scale UP to roughly 12-20 items with proportionally more coin, treasure, and magic-item entries regardless of the amount setting; otherwise stay within the guidance above.`;
}

/**
 * The creature-concept schema prompt. A function (not a constant) because the
 * "loot" schema field's guidance depends on the GM's Treasure amount setting
 * — see lootGuide() above.
 */
function systemPrompt(amount) {
  return `You are an expert Pathfinder 2e (remaster) creature designer. You design creature CONCEPTS; numbers are computed elsewhere from the official Building Creatures benchmark tables, so choose only named scales, never numeric statistics.

Respond with a SINGLE JSON object only. No markdown fences, no commentary.

JSON schema (all keys required unless marked optional):
{
  "name": string, // evocative creature name
  "blurb": string, // one-line tagline
  "description": string, // 1-2 paragraphs of flavor & tactics, plain text
  "readAloud": string, // 2-3 vivid sensory sentences read aloud when players first encounter it (sight, sound, smell, movement); theater-of-the-mind prose, NO game statistics or numbers
  "recallKnowledge": string, // 1-2 sentences: the most useful thing a player learns on a successful Recall Knowledge check (key weakness, most dangerous ability, or exploitable habit)
  "size": "tiny"|"sm"|"med"|"lg"|"huge"|"grg",
  "traits": string[], // lowercase PF2e creature traits (e.g. "undead", "fiend", "humanoid"); include exactly one creature type trait
  "languages": string[], // lowercase, [] if none
  "abilityScales": { "str": SCALE, "dex": SCALE, "con": SCALE, "int": SCALE, "wis": SCALE, "cha": SCALE },
  "acScale": SCALE,
  "hpScale": "high"|"moderate"|"low",
  "perceptionScale": SCALE5,
  "saveScales": { "fortitude": SCALE5, "reflex": SCALE5, "will": SCALE5 },
  "speeds": [ { "type": "land"|"fly"|"swim"|"climb"|"burrow", "value": number } ], // multiples of 5; include land unless immobile
  "senses": [ { "type": string, "acuity": "precise"|"imprecise"|"vague"|null, "range": number|null } ], // e.g. darkvision, scent
  "skills": [ { "name": string, "scale": "extreme"|"high"|"moderate"|"low" } ], // 2-5; standard skill names or "<Topic> Lore"
  "strikes": [ // 1-4 strikes (including any feat attacks — see "feats")
    {
      "name": string, // e.g. "jaws", "rusted glaive"
      "type": "melee"|"ranged",
      "attackScale": "extreme"|"high"|"moderate"|"low",
      "damageScale": "extreme"|"high"|"moderate"|"low",
      "damageType": string, // e.g. "piercing", "fire"
      "traits": string[], // e.g. "agile", "reach-10", "deadly-d8"; [] if none
      "range": number|null, // range increment in feet for ranged strikes
      "attackEffects": string[] // e.g. ["grab"], [] if none
    }
  ],
  "specialAbilities": [ // 1-4 abilities
    {
      "name": string,
      "glossary": string|null, // EXACT standard PF2e bestiary glossary ability name (e.g. "Grab", "Knockdown", "Frightful Presence", "Attack of Opportunity") if this is one, else null
      "actionType": "action"|"reaction"|"free"|"passive",
      "actions": 1|2|3|null, // action cost; null unless actionType is "action"
      "description": string, // full rules text following the DESCRIPTION CONVENTIONS below
      "traits": string[]
    }
  ],
  "spellcasting": null | {
    "tradition": "arcane"|"divine"|"occult"|"primal",
    "dcScale": "extreme"|"high"|"moderate",
    "spells": [ { "name": string, "rank": number } ] // rank 0 = cantrip; real PF2e spell names as a first draft (${REMASTER_NOTE}; the final list is chosen from the compendium in a second step); max rank = ceil(level/2)
  },
  "focusSpells": string[], // EXACT published PF2e focus spell names (they carry the "focus" trait), 1-3 names, ONLY when "spellcasting" is also set — [] otherwise; first draft, grounded against the real compendium afterward
  "feats": string[], // EXACT published PF2e feat names (e.g. "Power Attack", "Sudden Charge") for creatures with class-like training (soldiers, monks, assassins); [] for beasts, mindless creatures, and anything untrained; max 3. IMPORTANT: when a feat grants a distinct attack or Strike-based action (Power Attack, Sudden Charge, Ki Strike, ...), ALSO add a strike named after the feat to "strikes" — same weapon and damageType as the base strike it modifies, damageScale one step higher (extreme stays extreme), plus the feat's traits — and keep the feat in "feats" too.
  "equipment": [ { "name": string, "quantity": number, "value": number } ], // 3-8 logical carried items with EXACT PF2e item names (${REMASTER_NOTE}), drawn from: the weapons it wields; sensible consumables (healing potions, elixirs of life, alchemical bombs, talismans, poisons it applies); and everyday adventuring gear it would plausibly carry (rope, torches, rations, thieves' tools, a crowbar). NO coins or currency here — those belong only in "loot". "value" is the approximate gp price of ONE unit, used only as a fallback when the name finds no compendium match. Include armor only when the creature would plausibly wear it (skip beasts, oozes, mindless and naturally-armored creatures), and pick armor that roughly fits its AC and level. At level 2+, consider ONE magic item appropriate to its level; fundamental-rune gear is written like "+1 striking rapier" or "+1 resilient studded leather armor". [] for beasts and mindless creatures.
  "loot": [ { "name": string, "quantity": number, "value": number } ], // ${lootGuide(amount)}
  "resistances": [ { "type": string } ], // damage types only, values computed from tables; [] if none
  "weaknesses": [ { "type": string } ],
  "immunities": string[] // e.g. ["death-effects", "poison"], [] if none
}

SCALE = "extreme"|"high"|"moderate"|"low". SCALE5 also allows "terrible".

DESCRIPTION CONVENTIONS for specialAbilities.description — these exact phrasings become clickable roll links, so follow them precisely:
- Table-scaled damage (use for an ability's main damage so it scales with level): "high damage", "moderate fire damage", "low persistent bleed damage" (scale word, optional "persistent", optional damage type, then "damage").
- Fixed dice for small riders: "2d6 fire damage", "1d4 persistent bleed damage".
- Saving throws: "basic high Reflex save", "moderate Fortitude save", "extreme Will save" (optional "basic", scale word, save name, "save"); "basic" for plain damage effects.
- Skill checks against the creature: "high DC Athletics check".
- Healing: "regains 2d8 Hit Points" or "2d8 healing".
- Flat checks: "DC 5 flat check".
- Areas: "30-foot cone", "15-foot burst", "60-foot line", "10-foot emanation".
- Structure activated abilities as "Frequency ...; Trigger ...; Effect ..." and requirements as "Requirements ...; Effect ...".
- Never invent flat numeric DCs or attack bonuses; always use scale words.

Design guidance (GM Core road maps):
- At most ONE extreme stat, balanced by a low or terrible stat.
- Brute: low perception; moderate+ AC; high Fort, low Ref/Will; high HP; high attack & damage.
- Sneak: high dex; low Fort, high Ref; high stealth; moderate HP.
- Skirmisher: high Ref, fast speeds, moderate everything else.
- Soldier: high AC, high Fort, high attack with moderate damage; disciplined soldiers/guards/knights should usually get the Attack of Opportunity glossary reaction.
- Spellcaster: casting tradition matching key ability at high or extreme; low-or-moderate AC, HP and attack; DC one scale above attacks.
- Include spellcasting only when it truly fits the concept and the user allows it.
- "focusSpells": fit priests/cultists (a domain spell), ki-using martial casters, druid/shaman-like creatures, witch-like hexers — only when the concept has spellcasting AND genuinely fits one of these archetypes; leave [] otherwise. Uncommon, not the default.
- Use standard glossary abilities (Grab, Push, Knockdown, Trample, Swallow Whole, Frightful Presence, Regeneration, Attack of Opportunity, ...) where they fit, and invent 1-2 signature custom abilities that make the creature memorable.
- Passives especially should reuse a standard glossary ability instead of an invented equivalent — glossary abilities carry real working automation (Regeneration actually heals, All-Around Vision actually prevents flanking), while a custom passive is just prose the GM must remember to apply by hand. Reserve invented passives for narrative traits needing no mechanical tracking (a scent, a texture, an aura's flavor); if an invented passive DOES have a mechanical effect, phrase it with the DESCRIPTION CONVENTIONS above (an area, a save, a damage tick) so it stays clickable rather than inert prose.
- Traits, languages, senses and speeds must follow PF2e conventions.`;
}

export class AIRequestError extends Error {
  constructor(message, { retryable = false } = {}) {
    super(message);
    this.retryable = retryable;
  }
}

/**
 * Request a completion and parse it as JSON, retrying once on the transient
 * failure modes (empty content, truncated/unparseable JSON) before giving up.
 * @returns {Promise<{data: object, usage: object}>} parsed JSON plus token usage
 */
async function requestJSON(args) {
  let lastError = null;
  // Tokens spent by failed attempts are still spent — sum usage across every
  // attempt that returned one, so the report reflects the real total.
  const total = { prompt: 0, completion: 0, total: 0, estimated: false };
  const addUsage = (usage) => {
    if (!usage) return;
    total.prompt += usage.prompt || 0;
    total.completion += usage.completion || 0;
    total.total += usage.total || 0;
    if (usage.estimated) total.estimated = true;
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { content, usage } = await requestCompletion(args);
      addUsage(usage);
      return { data: parseConceptJSON(content), usage: total };
    } catch (err) {
      if (!(err instanceof AIRequestError) || !err.retryable) throw err;
      lastError = err;
      if (attempt === 0) console.warn("simplypf2e | generation attempt failed, retrying once:", err.message);
    }
  }
  throw lastError;
}

/**
 * Shape the provider's usage block into {prompt, completion, total, estimated}.
 * When the provider sent no usage at all, fall back to a ~4 chars/token
 * estimate of both sides — the completion from the streamed content, the
 * prompt from the request's system+user text — so the report never comes up
 * empty or pretends the prompt cost nothing.
 */
function normalizeUsage(usage, { content, system, user }) {
  const prompt = Number(usage?.prompt_tokens);
  const completion = Number(usage?.completion_tokens);
  if (Number.isFinite(prompt) || Number.isFinite(completion)) {
    const p = Number.isFinite(prompt) ? prompt : 0;
    const c = Number.isFinite(completion) ? completion : 0;
    return { prompt: p, completion: c, total: Number(usage?.total_tokens) || p + c, estimated: false };
  }
  const promptEst = estimateTokens((system ?? "").length + (user ?? "").length);
  const est = estimateTokens((content ?? "").length);
  return { prompt: promptEst, completion: est, total: promptEst + est, estimated: true };
}

/**
 * Generate just the loot field for a creature, given existing concept details.
 * Used for the "Reroll Loot" feature to regenerate treasure without changing creature stats.
 * @returns {Promise<{loot: Array}>}
 */
export async function generateLoot({ concept, amount = "standard", onProgress }) {
  const system = `You are a Pathfinder 2e loot designer. Given a creature, respond with ONLY a JSON object containing an appropriate loot array for it to drop when defeated.

Respond with a SINGLE JSON object and nothing else. No markdown fences, no commentary.

JSON schema (loot key required):
{
  "loot": [ { "name": string, "quantity": number, "value": number } ]
}

Loot should be ${lootGuide(amount)}`;

  const user = [
    `Creature: ${concept.name} (level ${concept.level}, ${concept.rarity} rarity)`,
    concept.blurb ? `Blurb: ${concept.blurb}` : null,
    concept.description ? `Description: ${concept.description}` : null,
    concept.traits.length ? `Traits: ${concept.traits.join(", ")}` : null
  ].filter((line) => line !== null).join("\n");

  const { data: parsed, usage } = await requestJSON({ system, user, onProgress });
  return { loot: (Array.isArray(parsed.loot) ? parsed.loot : []), usage };
}

/**
 * Draft the magic items/treasures a player character bought with part of
 * their starting wealth — the PC counterpart of generateLoot(). Unlike NPCs
 * (whose loot comes from the main generateConcept() call), PCs previously
 * had no first-draft loot at all, so their entire starting wealth became
 * raw coin with nothing actually purchased (feature request: wealth should
 * buy magic items, not just sit as gold). Reuses lootGuide's count/richness
 * rules via subject="character" for the "purchased, not dropped" framing;
 * the result still goes through the same grounding/coin-budget pipeline
 * (#refineLoot, applyTreasureBudget) NPC loot already uses.
 * @returns {Promise<{loot: Array, usage: object}>}
 */
export async function generatePCLoot({ concept, amount = "standard", onProgress }) {
  const system = `You are a Pathfinder 2e player-character equipment designer. Given a character concept, respond with ONLY a JSON object listing magic items and treasures they own, bought with part of their starting wealth.

Respond with a SINGLE JSON object and nothing else. No markdown fences, no commentary.

JSON schema (loot key required):
{
  "loot": [ { "name": string, "quantity": number, "value": number } ]
}

${lootGuide(amount, "character")} Favor items that reinforce the character's class and concept (a caster's wand or backup scroll, a martial's precious-material trinket, a rogue's utility gear) over generic treasure — this represents deliberate purchases, not random battlefield loot.`;

  const user = [
    `Character: ${concept.name} (level ${concept.level})`,
    concept.class ? `Class: ${concept.class}` : null,
    concept.blurb ? `Blurb: ${concept.blurb}` : null,
    concept.backstory ? `Backstory: ${concept.backstory}` : null
  ].filter((line) => line !== null).join("\n");

  const { data: parsed, usage } = await requestJSON({ system, user, onProgress });
  return { loot: (Array.isArray(parsed.loot) ? parsed.loot : []), usage };
}

/**
 * Ask the configured model for a creature concept.
 * @returns {Promise<{concept: object, usage: object}>} parsed concept JSON + token usage
 */
export async function generateConcept({ prompt, level, rarity, allowSpellcasting, preset, amount = "standard", onProgress }) {
  const userPrompt = [
    `Creature level: ${level}`,
    `Rarity: ${rarity}`,
    `Spellcasting allowed: ${allowSpellcasting ? "yes, if it fits the concept" : "NO - do not include spellcasting"}`,
    preset ? `Build preset (follow this road map; the concept below drives flavor): ${preset}` : null,
    "",
    `Concept from the GM: ${prompt}`
  ].filter((line) => line !== null).join("\n");

  const { data, usage } = await requestJSON({
    system: systemPrompt(amount),
    user: userPrompt,
    onProgress
  });
  return { concept: data, usage };
}

/**
 * The player-character concept schema prompt. Unlike systemPrompt() (NPCs),
 * this asks for NAMES only — no numeric/scale fields — because a PC's AC,
 * HP, saves and proficiencies are computed by the PF2e system itself from
 * real Ancestry/Background/Class items once those are embedded; this module's
 * job is picking grounded, real choices, not doing that math.
 */
function pcSystemPrompt() {
  return `You are an expert Pathfinder 2e (remaster) player character designer. You choose names and flavor only; the game system computes AC, HP, saves and proficiencies once real ancestry/background/class items are attached, so never invent numeric statistics.

Respond with a SINGLE JSON object only. No markdown fences, no commentary.

JSON schema (all keys required unless marked optional):
{
  "name": string, // character name
  "ancestry": string, // EXACT published PF2e ancestry name ${REMASTER_NOTE} — first draft; the final pick is chosen from the real compendium list in a second step
  "heritage": string|null, // EXACT published heritage name for that ancestry if one fits, else null — first draft, grounded later
  "background": string, // EXACT published PF2e background name — first draft, grounded later
  "class": string, // EXACT published PF2e class name — first draft, grounded later
  "keyAbility": "str"|"dex"|"con"|"int"|"wis"|"cha", // the class's primary ability, matching the class you chose
  "blurb": string, // one-line tagline
  "backstory": string, // 1-2 paragraphs of backstory, plain text
  "appearance": string, // 1-2 sentences describing the character's physical appearance, plain text
  "age": string, // e.g. "27" or "27 years" — plausible for the ancestry/species and concept
  "gender": string, // e.g. "Male", "Female", "Non-binary" — pronoun-style is fine too
  "height": string, // e.g. "5 ft. 8 in." — plausible for the ancestry/species
  "weight": string, // e.g. "150 lbs." — plausible for the ancestry/species
  "ethnicity": string, // e.g. "Garundi", "Tian" — a real-world-flavored or setting-flavored descriptor fitting the concept, "" if not applicable
  "nationality": string, // e.g. "Absalom native", "Mwangi Expanse" — home region/nation fitting the concept, "" if not applicable
  "personality": string, // 1-2 sentences of personality/mannerisms
  "alignmentFlavor": string, // 1 sentence describing the character's moral/ethical outlook in prose (no game term required)
  "likes": string, // short phrase or list of things the character likes
  "dislikes": string, // short phrase or list of things the character dislikes
  "allies": string, // 1-2 sentences naming allies, mentors, or loyal companions (can be "" if none fit)
  "enemies": string, // 1-2 sentences naming rivals, enemies, or things the character is hunted by (can be "" if none fit)
  "organizations": string, // 1-2 sentences naming factions, guilds, or organizations the character belongs to (can be "" if none fit)
  "languages": string[], // 1-3 EXACT PF2e language names beyond the ancestry's automatic ones (e.g. "Common"), fitting the character's background/culture — lowercase is fine, [] if none fit
  "feats": string[], // 3-6 EXACT published PF2e feat names fitting the concept as a first draft wishlist — inspiration only, the final picks are chosen from real compendium lists per level in a second step
  "spellcasting": null | {
    "tradition": "arcane"|"divine"|"occult"|"primal",
    "spells": [ { "name": string, "rank": number } ] // rank 0 = cantrip; real PF2e spell names as a first draft (${REMASTER_NOTE}; the final list is chosen from the compendium in a second step)
  }, // null if the class you chose isn't a caster, or spellcasting is disallowed
  "focusSpells": string[], // EXACT published PF2e focus spell names (they carry the "focus" trait) granted by this character's class/subclass, 1-3 names, [] if none apply — first draft, grounded against the real compendium afterward. Independent of "spellcasting": a Champion has focus spells but no spell slots
  "equipment": [ { "name": string, "quantity": number, "value": number } ] // 4-8 first-draft carried items with EXACT PF2e item names (${REMASTER_NOTE}) fitting the class, level and concept — include STARTING ARMOR appropriate to the class's armor proficiency (e.g. plate/chain for heavy-armor martials, leather/studded for light-armor types), a weapon, useful mundane gear, AND at least 1-2 level-appropriate magic items (a potion or elixir; for a spellcaster, a spell scroll of a real PF2e spell in their tradition they'd want as backup) when the character's level plausibly affords them; lightly-armored casters may deliberately carry no armor. Inspiration only, the final picks are chosen from the compendium in a second step
}

Design guidance:
- Pick an ancestry, background and class that together tell a coherent, thematic character matching the GM's concept.
- "keyAbility" MUST be a legal key ability for the class you chose (e.g. Fighter is str or dex, Wizard is int, Cleric is wis).
- Only include "spellcasting" for classes that actually cast spells (Wizard, Cleric, Druid, Sorcerer, Bard, Witch, Oracle, Magus, Summoner, ...) and only when spellcasting is allowed.
- "focusSpells": Champion (e.g. Lay on Hands), Cleric (a domain spell, e.g. Fire Ray), Druid (an order spell, e.g. Tempest Surge), Sorcerer (a bloodline spell), Wizard (a curriculum spell), Monk (a ki spell), and Bard/Oracle/Witch/Psychic commonly have them — name 1-3 that plausibly fit this build; leave [] if the class/concept doesn't have any.
- Give the character real personality texture, not just combat stats: mannerisms, likes/dislikes, and at least one named ally, enemy, or organization tying them into a wider world — a blank or generic answer for these is a worse answer than a specific, concept-fitting one.
- feats/spells/equipment are first drafts only — write plausible real names; a later grounding step selects the actual final picks from the real compendium.`;
}

/**
 * Ask the configured model for a player-character concept: ancestry,
 * heritage, background, class, key ability, personality/backstory prose, and
 * first-draft (ungrounded) feat/spell/equipment wishlists — the PC
 * counterpart of generateConcept().
 * @returns {Promise<{concept: object, usage: object}>} parsed concept JSON + token usage
 */
export async function generatePCConcept({ prompt, level, allowSpellcasting, onProgress }) {
  const userPrompt = [
    `Character level: ${level}`,
    `Spellcasting allowed: ${allowSpellcasting ? "yes, if the class you choose casts spells" : "NO - choose a non-caster class, or a caster with spellcasting set to null"}`,
    "",
    `Concept from the GM: ${prompt}`
  ].join("\n");

  const { data, usage } = await requestJSON({
    system: pcSystemPrompt(),
    user: userPrompt,
    onProgress
  });
  return { concept: data, usage };
}

/**
 * First pass of spell selection: ask the model for a handful of thematic
 * keywords (descriptor traits, damage types, general school-like concepts)
 * that fit the creature, BEFORE we know the full spell list. Used to narrow
 * the compendium query so the second pass (selectSpells) sees a small,
 * relevant slice instead of every spell in the tradition.
 * @returns {Promise<{keywords: string[], usage: object}>}
 */
export async function chooseSpellFocus({ concept, tradition, onProgress }) {
  const system = `You are picking a thematic focus for a Pathfinder 2e creature's spell list, before the actual spell list is known. Respond with a single JSON object and nothing else:
{ "keywords": string[] }
Give 3-6 lowercase keywords describing the KINDS of spells that fit this creature: descriptor traits (e.g. "fire", "cold", "mental", "death", "poison", "illusion", "necromancy"), and/or general purpose words ("healing", "buff", "debuff", "control", "summon", "detection"). These will be used to filter a real spell list (${REMASTER_NOTE}), so keep them concrete and matchable, not vague.`;

  const user = [
    `Creature: ${concept.name} (level ${concept.level})`,
    concept.blurb ? `Blurb: ${concept.blurb}` : null,
    concept.description ? `Description: ${concept.description}` : null,
    `Traits: ${concept.traits.join(", ")}`,
    `Tradition: ${tradition}`
  ].filter((line) => line !== null).join("\n");

  const { data: parsed, usage } = await requestJSON({ system, user, onProgress });
  const keywords = (Array.isArray(parsed.keywords) ? parsed.keywords : [])
    .map((k) => String(k).toLowerCase().trim())
    .filter(Boolean);
  return { keywords, usage };
}

/**
 * Second pass: given the real spell list from the compendium, have the model
 * pick the creature's spells. Names it returns are guaranteed to exist (and
 * are still fuzzy-matched afterwards as a safety net).
 * @param {object} args
 * @param {object} args.concept       normalized concept (for context)
 * @param {{name: string, rank: number}[]} args.candidates
 * @param {number} args.maxRank
 * @returns {Promise<{spells: {name: string, rank: number}[], usage: object}>}
 */
export async function selectSpells({ concept, candidates, maxRank, onProgress }) {
  const byRank = new Map();
  for (const c of candidates) {
    if (!byRank.has(c.rank)) byRank.set(c.rank, []);
    byRank.get(c.rank).push(c.name);
  }
  const list = [...byRank.entries()]
    .map(([rank, names]) => `${rank === 0 ? "Cantrips" : `Rank ${rank}`}: ${names.join("; ")}`)
    .join("\n");

  const system = `You are selecting spells for a Pathfinder 2e creature. Choose ONLY from the provided list, copying each name EXACTLY as written (the list is already ${REMASTER_NOTE}). Respond with a single JSON object and nothing else:
{ "spells": [ { "name": string, "rank": number } ] }
"rank" is the slot the creature casts it from: 0 for cantrips, otherwise at least the listed rank and at most ${maxRank} (choose higher to heighten a spell only when that clearly helps it).
Pick 2-3 cantrips and 4-8 ranked spells for a dedicated caster, weighted toward the highest ranks. Favor spells that express the creature's theme and tactics.`;

  const user = [
    `Creature: ${concept.name} (level ${concept.level})`,
    concept.blurb ? `Blurb: ${concept.blurb}` : null,
    concept.description ? `Description: ${concept.description}` : null,
    `Traits: ${concept.traits.join(", ")}`,
    `Tradition: ${concept.spellcasting.tradition}. Maximum spell rank: ${maxRank}.`,
    concept.spellcasting.spells.length
      ? `First-draft spell ideas (use as inspiration, but the final picks MUST come from the list): ${concept.spellcasting.spells.map((s) => s.name).join(", ")}`
      : null,
    "",
    "Available spells:",
    list
  ].filter((line) => line !== null).join("\n");

  const { data: parsed, usage } = await requestJSON({ system, user, onProgress });
  // A ranked spell must never come back as rank 0 (createActor would file it
  // as a cantrip) — clamp the minimum to the candidate's own listed rank.
  const listedRank = new Map(candidates.map((c) => [c.name.toLowerCase(), c.rank]));
  const spells = (Array.isArray(parsed.spells) ? parsed.spells : [])
    .filter((s) => s?.name)
    .map((s) => ({
      name: String(s.name),
      rank: Math.min(
        Math.max(Math.round(Number(s.rank) || 0), listedRank.get(String(s.name).toLowerCase()) ?? 0),
        maxRank
      )
    }));
  return { spells, usage };
}

/**
 * Grounded equipment pass: given real, level-capped equipment items from the
 * compendium, have the model pick the creature's carried gear. Names it
 * returns are guaranteed to exist (and are still fuzzy-matched afterwards as
 * a safety net). One call — no separate focus pass like spells, since the
 * concept already carries the theme and the first-draft gear.
 * @param {object} args
 * @param {object} args.concept       normalized concept (for context)
 * @param {{name: string, type: string, level: number}[]} args.candidates
 * @returns {Promise<{equipment: {name: string, quantity: number, value: number}[], usage: object}>}
 */
export async function selectEquipment({ concept, candidates, onProgress }) {
  const byType = new Map();
  for (const c of candidates) {
    if (!byType.has(c.type)) byType.set(c.type, []);
    byType.get(c.type).push(c.level > 0 ? `${c.name} (L${c.level})` : c.name);
  }
  const list = [...byType.entries()]
    .map(([type, names]) => `${type}: ${names.join("; ")}`)
    .join("\n");

  const system = `You are selecting carried equipment for a Pathfinder 2e creature. Choose ONLY from the provided list, copying each name EXACTLY as written. Respond with a single JSON object and nothing else:
{ "equipment": [ { "name": string, "quantity": number } ] }
Pick 3-8 logical items the creature would carry: the weapons it wields (match its strikes), sensible consumables (healing potions, elixirs, bombs, talismans, poisons it applies), and everyday adventuring gear it would plausibly use (rope, torches, rations, tools). Include armor only when the creature would plausibly wear it (skip beasts, oozes, mindless and naturally-armored creatures), and pick armor that roughly fits its role and level. NO coins or currency. "quantity" is usually 1; use 2-5 only for ammunition and stackable consumables.`;

  const user = [
    `Creature: ${concept.name} (level ${concept.level})`,
    concept.blurb ? `Blurb: ${concept.blurb}` : null,
    concept.description ? `Description: ${concept.description}` : null,
    `Traits: ${concept.traits.join(", ")}`,
    concept.strikes.length
      ? `Strikes: ${concept.strikes.map((s) => `${s.name} (${s.type})`).join(", ")}`
      : null,
    concept.equipment.length
      ? `First-draft equipment ideas (use as inspiration, but the final picks MUST come from the list): ${concept.equipment.map((e) => e.name).join(", ")}`
      : null,
    "",
    "Available items:",
    list
  ].filter((line) => line !== null).join("\n");

  const { data: parsed, usage } = await requestJSON({ system, user, onProgress });
  const equipment = (Array.isArray(parsed.equipment) ? parsed.equipment : [])
    .filter((e) => e?.name)
    .map((e) => ({
      name: String(e.name),
      quantity: Math.min(Math.max(Math.round(Number(e.quantity) || 1), 1), 10),
      // Picks come from the compendium, so no estimated fallback price is needed.
      value: 0
    }));
  return { equipment, usage };
}

/**
 * Grounded loot pass: given real compendium items (treasure included, level
 * capped like resolveLoot's filter), have the model re-pick the first-draft
 * haul from names guaranteed to exist — the loot counterpart of
 * selectEquipment(). Without this, a pre-Remaster name the model recalls
 * ("Bag of Holding") never fuzzy-matches its Remaster item ("Spacious Pouch")
 * and silently becomes a wrong-named custom treasure item. Coins and spell
 * scrolls stay free-form: they are not plain compendium items
 * (parseCoins/parseScroll in builder.mjs build them specially).
 * @param {object} args
 * @param {object} args.concept       normalized concept (for context)
 * @param {{name: string, type: string, level: number}[]} args.candidates
 * @returns {Promise<{loot: {name: string, quantity: number, value: number}[], usage: object}>}
 */
export async function selectLoot({ concept, candidates, onProgress }) {
  const byType = new Map();
  for (const c of candidates) {
    if (!byType.has(c.type)) byType.set(c.type, []);
    byType.get(c.type).push(c.level > 0 ? `${c.name} (L${c.level})` : c.name);
  }
  const list = [...byType.entries()]
    .map(([type, names]) => `${type}: ${names.join("; ")}`)
    .join("\n");

  const system = `You are selecting dropped loot for a Pathfinder 2e creature. Choose ONLY from the provided list, copying each name EXACTLY as written — with two exceptions kept free-form because they are built specially: coin entries ("Gold Coins"/"Silver Coins" etc., quantity = the number of coins) and spell scrolls ("Scroll of {exact PF2e spell name} (Rank {n})"). Respond with a single JSON object and nothing else:
{ "loot": [ { "name": string, "quantity": number } ] }
Recreate the first-draft haul: keep its coin and scroll entries as they are, replace every other entry with its closest match from the list (the same item if it appears, otherwise the nearest equivalent in kind and value), and drop an entry only when nothing on the list comes close. Keep the draft's quantities.`;

  const user = [
    `Creature: ${concept.name} (level ${concept.level}, ${concept.rarity} rarity)`,
    concept.blurb ? `Blurb: ${concept.blurb}` : null,
    `Traits: ${concept.traits.join(", ")}`,
    `First-draft loot (recreate this haul from the list): ${concept.loot.map((l) => `${l.name} x${l.quantity}`).join(", ")}`,
    "",
    "Available items:",
    list
  ].filter((line) => line !== null).join("\n");

  const { data: parsed, usage } = await requestJSON({ system, user, onProgress });
  const loot = (Array.isArray(parsed.loot) ? parsed.loot : [])
    .filter((l) => l?.name)
    .map((l) => ({
      name: String(l.name),
      // No upper cap here: coin quantities run large. normalizeLoot() clamps.
      quantity: Math.max(Math.round(Number(l.quantity) || 1), 1),
      // Picks come from the compendium, so no estimated fallback price is needed.
      value: 0
    }));
  return { loot, usage };
}

/**
 * Ground a PC's first-draft ancestry/heritage/background/class against the
 * real compendium lists in ONE call — the ABC counterpart of selectSpells/
 * selectEquipment/selectLoot: choose ONLY from the provided lists, copying
 * each name EXACTLY as written. Names returned are still fuzzy-matched via
 * findEntry() afterward as a safety net.
 * @param {object} args
 * @param {object} args.concept  normalized PC concept (for context)
 * @param {{name: string, traits: string[]}[]} args.ancestryCandidates
 * @param {{name: string, traits: string[]}[]} args.backgroundCandidates
 * @param {{name: string, traits: string[]}[]} args.classCandidates
 * @param {{name: string, traits: string[]}[]} [args.heritageCandidates]
 * @returns {Promise<{ancestry: string, heritage: string|null, background: string, class: string, keyAbility: string, usage: object}>}
 */
export async function selectAncestryBackgroundClass({
  concept, ancestryCandidates, backgroundCandidates, classCandidates, heritageCandidates = [], onProgress
}) {
  const system = `You are choosing a Pathfinder 2e character's ancestry, heritage, background and class. Choose ONLY from the provided lists, copying each name EXACTLY as written. Respond with a single JSON object and nothing else:
{ "ancestry": string, "heritage": string|null, "background": string, "class": string, "keyAbility": "str"|"dex"|"con"|"int"|"wis"|"cha" }
"heritage" must belong to the chosen ancestry, or null if none fits well. "keyAbility" must be a legal key ability for the chosen class.`;

  const user = [
    `Character: ${concept.name} (level ${concept.level})`,
    concept.blurb ? `Blurb: ${concept.blurb}` : null,
    concept.backstory ? `Backstory: ${concept.backstory}` : null,
    `First-draft ideas (use as inspiration, but the final picks MUST come from the lists below): ancestry "${concept.ancestry}", heritage "${concept.heritage ?? "none"}", background "${concept.background}", class "${concept.class}", key ability "${concept.keyAbility}"`,
    "",
    `Available ancestries: ${ancestryCandidates.map((a) => a.name).join("; ")}`,
    heritageCandidates.length ? `Available heritages: ${heritageCandidates.map((h) => h.name).join("; ")}` : null,
    `Available backgrounds: ${backgroundCandidates.map((b) => b.name).join("; ")}`,
    `Available classes: ${classCandidates.map((c) => c.name).join("; ")}`
  ].filter((line) => line !== null).join("\n");

  const { data: parsed, usage } = await requestJSON({ system, user, onProgress });
  return {
    ancestry: String(parsed.ancestry || concept.ancestry),
    heritage: parsed.heritage ? String(parsed.heritage) : null,
    background: String(parsed.background || concept.background),
    class: String(parsed.class || concept.class),
    keyAbility: ["str", "dex", "con", "int", "wis", "cha"].includes(parsed.keyAbility)
      ? parsed.keyAbility : concept.keyAbility,
    usage
  };
}

/**
 * Batched feat selection: pick one feat per slot in a SINGLE round trip,
 * mirroring how selectLoot/selectEquipment batch multiple picks into one
 * call rather than one call per slot. Each slot's candidates are its own
 * grounded list (getFeatCandidates), so the model picks ONLY from that
 * slot's list. A slot whose pick doesn't resolve afterward is simply
 * skipped by the caller (fail-closed), same as feats elsewhere in the pipeline.
 * @param {object} args
 * @param {object} args.concept  normalized PC concept (for context)
 * @param {{type: string, level: number, candidates: {name: string, level: number}[]}[]} args.slots
 * @returns {Promise<{picks: {slot: number, name: string}[], usage: object}>}
 */
export async function selectFeats({ concept, slots, onProgress }) {
  const slotLines = slots.map((slot, i) =>
    `Slot ${i + 1} — ${slot.type} feat, character level ${slot.level}: ${slot.candidates.map((c) => c.name).join("; ")}`
  ).join("\n");

  const system = `You are choosing feats for a Pathfinder 2e character, one per slot. For EACH slot, choose ONLY from that slot's own list, copying the name EXACTLY as written. Respond with a single JSON object and nothing else:
{ "picks": [ { "slot": number, "name": string } ] }
Include exactly one entry per slot number (1 to ${slots.length}). If a slot's list has nothing fitting, still pick the closest thematic option from that slot's own list — never leave a slot out and never pick from another slot's list.`;

  const user = [
    `Character: ${concept.name} (level ${concept.level}, ${concept.class})`,
    concept.blurb ? `Blurb: ${concept.blurb}` : null,
    concept.feats?.length ? `First-draft feat wishlist (inspiration only, final picks MUST come from each slot's own list): ${concept.feats.join(", ")}` : null,
    "",
    "Slots:",
    slotLines
  ].filter((line) => line !== null).join("\n");

  const { data: parsed, usage } = await requestJSON({ system, user, onProgress });
  const picks = (Array.isArray(parsed.picks) ? parsed.picks : [])
    .filter((p) => p?.name && Number.isInteger(Number(p.slot)))
    .map((p) => ({ slot: Number(p.slot), name: String(p.name) }));
  return { picks, usage };
}

/* Schema documentation per item-forge effect kind. Only the kinds that
 * rule-templates.mjs actually found real exemplars for in this world are
 * offered to the model — see generateMagicItemConcept(). */
const ITEM_EFFECT_DOCS = {
  itemBonus: `{ "kind": "itemBonus", "statistic": "ac"|"perception"|"fortitude"|"reflex"|"will"|"acrobatics"|"arcana"|"athletics"|"crafting"|"deception"|"diplomacy"|"intimidation"|"medicine"|"nature"|"occultism"|"performance"|"religion"|"society"|"stealth"|"survival"|"thievery", "value": number } // item bonus scaled like published items: +1 up to about level 9, +2 for levels 10-15, +3 for level 16+`,
  resistance: `{ "kind": "resistance", "damageType": DAMAGE_TYPE, "value": number } // roughly half the item's level, minimum 2`,
  weakness: `{ "kind": "weakness", "damageType": DAMAGE_TYPE, "value": number } // a drawback; use only when the concept calls for one`,
  immunity: `{ "kind": "immunity", "damageType": DAMAGE_TYPE } // very strong; only for high-level (13+) or rare items`,
  sense: `{ "kind": "sense", "type": "darkvision"|"greater-darkvision"|"low-light-vision"|"scent"|"tremorsense"|"echolocation"|"see-invisibility"|"truesight"|"lifesense"|"wavesense", "acuity": "precise"|"imprecise"|"vague"|null, "range": number|null } // acuity/range only for senses that need them (e.g. scent imprecise 30); null for vision senses`,
  speed: `{ "kind": "speed", "type": "fly"|"swim"|"climb"|"burrow", "value": number } // speed in feet, multiple of 5 (20-40 typical); a passive permanent speed is powerful, fit it to the level`
};

/* Documentation for the optional `activation` field (item forge Phase 2): a
 * single activated ability the player triggers via a generated macro. The four
 * templates map to the four macro-templates.mjs builders. {dmg} and {dc} are
 * filled with level-appropriate benchmark suggestions per generation. */
function itemActivationDoc({ suggestedDamage, suggestedDC, effectDocs }) {
  return `"activation": { // OPTIONAL — omit entirely (null) for a pure passive item. One activated ability the player clicks to use.
    "template": "damage"|"heal"|"condition"|"selfBuff",
    "actionCost": 1|2|3|"reaction"|"free",
    "params": { // shape depends on "template":
      // damage:   { "damageDice": "${suggestedDamage}", "damageType": DAMAGE_TYPE, "saveType": "fortitude"|"reflex"|"will"|null, "dc": ${suggestedDC}, "basicSave": boolean } // dice ~${suggestedDamage} for this level; DC ~${suggestedDC}; use a basic save for area/blast damage
      // heal:     { "healDice": "${suggestedDamage}" } // Hit Points restored; heals a target or the user
      // condition:{ "conditionSlug": "frightened"|"clumsy"|"slowed"|"sickened"|"off-guard"|"blinded"|"dazzled"|"prone"|"stupefied"|"enfeebled"|"drained"|..., "value": number|null, "duration": string|null, "saveType": "fortitude"|"reflex"|"will"|null, "dc": ${suggestedDC}, "basicSave": boolean } // value only for valued conditions (e.g. frightened 1); duration is short text like "1 minute"
      // selfBuff: { "effectName": string, "description": string, "durationRounds": number|null, "durationMinutes": number|null, "ruleEffectKinds": [ /* 0-3 of the SAME passive effect shapes as "effects" above */ ] } // a temporary buff on the user only
    }
  }`;
}

/**
 * Ask the configured model for a wondrous magic item concept (item forge).
 * `availableKinds` MUST be the effect kinds rule-templates.mjs found real
 * rule exemplars for — the schema shown to the model is built from that
 * list, so it can never ask for an effect this world can't automate.
 * `usageOptions` are real system.usage.value strings harvested from the
 * equipment compendium (item-builder.getUsageOptions()).
 * @returns {Promise<{concept: object, usage: object}>} raw concept JSON + token usage
 */
export async function generateMagicItemConcept({ prompt, level, rarity, availableKinds, usageOptions, onProgress }) {
  const kinds = (availableKinds ?? []).filter((k) => ITEM_EFFECT_DOCS[k]);
  const effectDocs = kinds.map((k) => `    ${ITEM_EFFECT_DOCS[k]}`).join("\n");
  const suggestedDamage = damageDiceForLevel(level);
  const suggestedDC = saveDcForLevel(level, rarity);
  const activationDoc = itemActivationDoc({ suggestedDamage, suggestedDC, effectDocs });

  const system = `You are an expert Pathfinder 2e (remaster) magic item designer. You design wondrous item CONCEPTS; the final price is computed elsewhere from real compendium benchmarks.

Respond with a SINGLE JSON object only. No markdown fences, no commentary.

JSON schema (all keys required unless marked OPTIONAL):
{
  "name": string, // evocative item name in current PF2e Remaster style — an ORIGINAL item, not a copy of a published one
  "description": string, // 2-4 sentences of evocative flavor: appearance, history, feel. Plain text. Do NOT restate the mechanical effects — a mechanical summary is appended automatically.
  "level": number, // echo the requested item level
  "rarity": "common"|"uncommon"|"rare"|"unique", // echo the requested rarity
  "usage": string, // EXACTLY one of: ${usageOptions.join(", ")}
  "traits": string[], // lowercase PF2e item traits; always include "magical", plus fitting descriptors (e.g. "fire", "air", "healing", "detection"); "invested" is handled separately
  "bulk": number, // 0 = negligible, 0.1 = light (L), 1+ = heavier items
  "invested": boolean, // true for most worn magic items (they must be invested to function); false for held items
  "effects": [ // 0-3 ALWAYS-ON PASSIVE effects, each one of these shapes ("kind" MUST be from this list):
${effectDocs}
  ],
  ${activationDoc}
}

DAMAGE_TYPE = "acid"|"bludgeoning"|"cold"|"electricity"|"fire"|"force"|"mental"|"piercing"|"poison"|"slashing"|"sonic"|"spirit"|"vitality"|"void"|"bleed".

Design guidance:
- The "effects" array is for ALWAYS-ON passives only. A once-per-day or triggered ability goes in the OPTIONAL "activation" field instead (the player clicks a generated macro to use it, once per day).
- An item may have passive effects AND an activation, or just one, or (rarely) neither. Give the item at least ONE of the two unless the concept is purely a flavor trinket. Prefer a passive for "always" wording ("you can see in the dark", "resist fire"); prefer an activation for "once per day / when you / you can spend an action to" wording ("unleash a blast", "heal a wound", "frighten a foe", "gain a burst of speed").
- Match power to level and rarity: one modest effect for low-level items, two or three (or one strong one) only for high-level or rare items.
- The item should feel like it belongs in a published book: grounded flavor, a clear identity, one memorable image.`;

  const user = [
    `Item level: ${level}`,
    `Rarity: ${rarity}`,
    "",
    `Item concept from the GM: ${prompt}`
  ].join("\n");

  const { data, usage } = await requestJSON({ system, user, onProgress });
  return { concept: data, usage };
}

/**
 * Ask the configured model for a runed magic weapon/armor concept (item
 * forge Phase 3). Every choice — base item, potency, secondary rune tier,
 * property runes — is picked from REAL candidate lists harvested from the
 * compendium (item-builder.mjs); the system computes the mechanical name,
 * price and item level from whichever real components get chosen, so the
 * model never invents rune data.
 * @param {object} args
 * @param {"weapon"|"armor"} args.kind
 * @param {{name: string, level: number}[]} args.baseCandidates
 * @param {{name: string, level: number}[]} args.runeCandidates
 * @param {number[]} args.potencyTiers      available potency tiers (1-3)
 * @param {number[]} args.secondaryTiers    available striking/resilient tiers (1-3)
 * @returns {Promise<{concept: object, usage: object}>} raw concept JSON + token usage
 */
export async function generateRunedItemConcept({
  prompt, level, rarity, kind, baseCandidates, runeCandidates, potencyTiers, secondaryTiers, onProgress
}) {
  const secondaryLabel = kind === "weapon" ? "striking" : "resilient";
  const baseList = baseCandidates.map((c) => (c.level > 0 ? `${c.name} (L${c.level})` : c.name)).join("; ");
  const runeList = runeCandidates.length
    ? runeCandidates.map((c) => `${c.name} (L${c.level})`).join("; ")
    : "(none available at this level)";

  const system = `You are an expert Pathfinder 2e (remaster) magic ${kind} designer. You choose real components; the system computes the mechanical name, price and item level from whatever you pick.

Respond with a SINGLE JSON object only. No markdown fences, no commentary.

JSON schema:
{
  "baseItemName": string, // EXACTLY one name from the base ${kind} list below, copied exactly
  "potency": number, // one of: ${potencyTiers.join(", ")} — the fundamental potency rune tier (+N)
  "secondaryTier": number, // one of: 0, ${secondaryTiers.join(", ")} — 0 for no ${secondaryLabel} rune, else the tier (1=normal, 2=greater, 3=major)
  "propertyRunes": string[], // 0 to ${Math.max(...potencyTiers)} names copied EXACTLY from the property rune list below — never more than the chosen "potency" value
  "description": string // 2-4 sentences of evocative flavor: appearance, history, feel. Plain text. Do NOT restate the mechanical runes — a mechanical summary is appended automatically.
}

Base ${kind}s available (name (item level)):
${baseList}

Property runes available (name (rune level)):
${runeList}

Design guidance:
- Pick a base ${kind} and runes that together tell a clear, thematic story for the GM's concept.
- Avoid combining runes that are thematically opposed (e.g. never pick both Holy and Unholy, or both Anarchic and Axiomatic) unless the concept explicitly wants that tension.
- "propertyRunes" length must never exceed "potency" (potency N grants N property rune slots) — prefer fewer, more thematic runes over maxing out every slot.`;

  const user = [
    `${kind === "weapon" ? "Weapon" : "Armor"} target level: ${level}`,
    `Rarity: ${rarity}`,
    "",
    `Item concept from the GM: ${prompt}`
  ].join("\n");

  const { data, usage } = await requestJSON({ system, user, onProgress });
  return { concept: data, usage };
}

/**
 * Encounter design pass: given a theme and a budget-fixed composition, name
 * the encounter and write a one-sentence creature brief per slot. Each brief
 * then runs through the normal single-creature pipeline.
 * @returns {Promise<{name: string, briefs: string[], usage: object}>} briefs indexed by slot
 */
export async function designEncounter({ theme, partyLevel, slots, onProgress }) {
  const slotLines = slots.map((s, i) =>
    `Slot ${i + 1}: ${s.count} creature${s.count > 1 ? "s" : ""} of level ${s.level} (${s.role})`
  ).join("\n");

  const system = `You are designing a themed Pathfinder 2e encounter. The composition (levels and counts) is FIXED by the XP budget; you decide who these creatures are so they feel like they belong together (a leader and its followers, a predator and its symbiotes, cultists and their summon, ...).
Respond with a single JSON object and nothing else:
{ "name": string, "briefs": string[] }
"name" is a short evocative encounter name. "briefs" has EXACTLY one entry per slot in order: a 1-2 sentence creature concept for that slot (all creatures of a slot share one concept). Vary roles and tactics; make the boss memorable.`;

  const user = [
    `Party level: ${partyLevel}`,
    `Theme from the GM: ${theme}`,
    "",
    "Composition (fixed):",
    slotLines
  ].join("\n");

  const { data: parsed, usage } = await requestJSON({ system, user, onProgress });
  const briefs = Array.isArray(parsed.briefs) ? parsed.briefs.map((b) => String(b)) : [];
  return {
    name: String(parsed.name || "Encounter"),
    briefs: slots.map((s, i) => briefs[i] ?? `${theme} — a level ${s.level} ${s.role}`),
    usage
  };
}

/**
 * Send one chat completion request and return the assistant's text content.
 *
 * Requests are streamed so slow (especially reasoning) models show progress
 * immediately, and an inactivity watchdog aborts the request if the provider
 * goes silent — a stalled connection can no longer hang the UI forever. The
 * total time is unbounded as long as data keeps arriving.
 *
 * @param {object} args
 * @param {string} args.system
 * @param {string} args.user
 * @param {(p: {phase: "thinking"|"writing", tokens: number}) => void} [args.onProgress]
 * @returns {Promise<{content: string, usage: object}>}
 */
async function requestCompletion({ system, user, onProgress }) {
  const apiKey = getSetting(SETTINGS.apiKey);
  const baseUrl = String(getSetting(SETTINGS.apiBaseUrl) ?? "").replace(/\/+$/, "");
  if (!baseUrl) throw new AIRequestError(game.i18n.localize("SIMPLYPF2E.Errors.NoBaseUrl"));

  const body = {
    model: getSetting(SETTINGS.model),
    temperature: Number(getSetting(SETTINGS.temperature)) || 0.8,
    max_tokens: Number(getSetting(SETTINGS.maxTokens)) || 4000,
    stream: true,
    // Ask for exact token usage in the final stream chunk (OpenAI-style;
    // DeepSeek sends it regardless). Dropped first if the provider 400s.
    stream_options: { include_usage: true },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    response_format: { type: "json_object" }
  };

  const idleSeconds = Math.max(10, Number(getSetting(SETTINGS.requestTimeout)) || 90);
  const controller = new AbortController();
  let idleTimer = null;
  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(), idleSeconds * 1000);
  };

  try {
    resetIdle();
    let response = await postChatCompletion(baseUrl, apiKey, body, controller.signal);
    // Some OpenAI-compatible providers reject stream_options, response_format
    // or streaming. Retry without a parameter ONLY when the 400 body actually
    // names it (checked longest-first so "stream" can't match the others);
    // any other 400 fails fast with its own error message.
    while (response.status === 400) {
      const detail = await safeErrorDetail(response);
      const offending = ["stream_options", "response_format", "stream"]
        .find((param) => param in body && detail.includes(param));
      if (!offending) {
        throw new AIRequestError(
          game.i18n.format("SIMPLYPF2E.Errors.ApiError", { status: response.status, detail })
        );
      }
      delete body[offending];
      resetIdle();
      response = await postChatCompletion(baseUrl, apiKey, body, controller.signal);
    }
    if (!response.ok) {
      const detail = await safeErrorDetail(response);
      throw new AIRequestError(
        game.i18n.format("SIMPLYPF2E.Errors.ApiError", { status: response.status, detail })
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    let content;
    let finishReason = null;
    let usage = null;
    if (contentType.includes("text/event-stream") && response.body) {
      ({ content, finishReason, usage } = await readEventStream(response, { onProgress, resetIdle }));
    } else {
      resetIdle();
      const data = await response.json();
      content = data?.choices?.[0]?.message?.content;
      finishReason = data?.choices?.[0]?.finish_reason ?? null;
      usage = data?.usage ?? null;
    }
    if (!content) {
      // Reasoning models can burn the whole token budget "thinking" and
      // return no content at all — tell the user exactly what to fix.
      if (finishReason === "length") {
        throw new AIRequestError(
          game.i18n.format("SIMPLYPF2E.Errors.Truncated", { max: body.max_tokens }),
          { retryable: true }
        );
      }
      throw new AIRequestError(game.i18n.localize("SIMPLYPF2E.Errors.EmptyResponse"), { retryable: true });
    }
    return { content, usage: normalizeUsage(usage, { content, system, user }) };
  } catch (err) {
    if (err.name === "AbortError" || controller.signal.aborted) {
      throw new AIRequestError(game.i18n.format("SIMPLYPF2E.Errors.Timeout", { seconds: idleSeconds }));
    }
    throw err;
  } finally {
    clearTimeout(idleTimer);
  }
}

/**
 * Streaming responses carry no live token counts (providers send usage only
 * at the very end, if at all), so progress is estimated from streamed text
 * at the usual ~4 characters per token.
 */
const estimateTokens = (chars) => Math.max(1, Math.round(chars / 4));

/** Consume an SSE chat-completions stream, reporting progress per chunk. */
async function readEventStream(response, { onProgress, resetIdle }) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let reasoningChars = 0;
  let finishReason = null;
  let usage = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    resetIdle();
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let chunk;
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue; // partial keep-alive noise
      }
      if (chunk?.usage) usage = chunk.usage; // exact tokens, sent on the final chunk
      const choice = chunk?.choices?.[0] ?? {};
      if (choice.finish_reason) finishReason = choice.finish_reason;
      const delta = choice.delta ?? {};
      // DeepSeek reasoning models stream their chain of thought first
      if (typeof delta.reasoning_content === "string" && delta.reasoning_content) {
        reasoningChars += delta.reasoning_content.length;
        onProgress?.({ phase: "thinking", tokens: estimateTokens(reasoningChars) });
      }
      if (typeof delta.content === "string" && delta.content) {
        content += delta.content;
        onProgress?.({ phase: "writing", tokens: estimateTokens(content.length) });
      }
    }
  }
  return { content, finishReason, usage };
}

async function postChatCompletion(baseUrl, apiKey, body, signal) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  try {
    return await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    // fetch throws on network/CORS failures before we get a Response
    throw new AIRequestError(game.i18n.format("SIMPLYPF2E.Errors.NetworkError", { message: err.message }));
  }
}

async function safeErrorDetail(response) {
  try {
    const text = await response.text();
    try {
      const json = JSON.parse(text);
      return json?.error?.message ?? text.slice(0, 300);
    } catch {
      return text.slice(0, 300);
    }
  } catch {
    return "";
  }
}

/**
 * Parse model output into JSON, tolerating markdown fences, stray prose, and
 * truncation (a response cut off by the token limit is repaired by closing
 * open strings/brackets at the last parseable point).
 */
export function parseConceptJSON(content) {
  let text = content.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced) text = fenced[1].trim();
  const start = text.indexOf("{");
  if (start === -1) {
    throw new AIRequestError(game.i18n.localize("SIMPLYPF2E.Errors.BadJson"), { retryable: true });
  }
  const end = text.lastIndexOf("}");
  if (end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      // fall through to truncation repair
    }
  }
  const repaired = repairTruncatedJSON(text.slice(start));
  if (repaired !== null) {
    console.warn("simplypf2e | AI response was truncated; salvaged a partial concept");
    return repaired;
  }
  console.error("simplypf2e | Failed to parse AI response:", content);
  throw new AIRequestError(game.i18n.localize("SIMPLYPF2E.Errors.BadJson"), { retryable: true });
}

/** Append the closers a truncated JSON string needs to become parseable. */
function closeBrackets(text) {
  const stack = [];
  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = inString;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{" || char === "[") stack.push(char === "{" ? "}" : "]");
    else if (char === "}" || char === "]") {
      if (stack.pop() !== char) return null; // mismatched — not salvageable here
    }
  }
  return text + (inString ? '"' : "") + stack.reverse().join("");
}

/**
 * Backtrack from the cut point until closing the open brackets yields valid
 * JSON — recovering the complete prefix of a token-limit-truncated object.
 */
function repairTruncatedJSON(text) {
  const minEnd = Math.max(1, text.length - 2000);
  for (let end = text.length; end >= minEnd; end--) {
    const candidate = closeBrackets(text.slice(0, end));
    if (candidate === null) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // keep backtracking
    }
  }
  return null;
}
