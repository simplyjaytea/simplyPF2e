import { SETTINGS, getSetting } from "./settings.mjs";

/**
 * Client for any OpenAI-compatible chat completions API (DeepSeek, OpenAI,
 * OpenRouter, Ollama, LM Studio, ...). The endpoint, key and model are all
 * world settings, so each table can bring its own provider.
 */

/* Shared reminder everywhere the AI names a published item — the Remaster
   renamed many classics, and the AI defaults to pre-Remaster memory unless
   told otherwise every time. */
const REMASTER_NOTE = `using CURRENT PF2e REMASTER names, never the old pre-Remaster name — e.g. "Thunderstone" is now "Blasting Stone", the old "Bag of Holding" is now "Spacious Pouch"`;

/* Loot rules shared between the concept prompt and the reroll-loot prompt. */
const LOOT_GUIDE = `3-8 items dropped on defeat; "value" is the approximate price of ONE unit in gold pieces (used when an item has no compendium match). Coins: use "Gold Coins" or "Silver Coins" with quantity = the number of coins (e.g. {"name": "Gold Coins", "quantity": 35, "value": 1}), scaled to level and rarity. Spell scrolls: "Scroll of {exact PF2e spell name} (Rank {n})" with a real non-cantrip spell and a rank it exists at, castable at the creature's level (rank <= ceil((level+2)/2)). Other items MUST be EXACT published item names ${REMASTER_NOTE}, including the grade in parentheses where one exists (e.g. "Healing Potion (Lesser)", "Elixir of Life (Minor)", "Smokestick (Lesser)"); NO invented items. Include 1-2 coin entries, 1-2 consumables, and 1-2 treasure or magic items of the creature's level or lower.`;

const SYSTEM_PROMPT = `You are an expert Pathfinder 2e (remaster) creature designer. You design creature CONCEPTS; numbers are computed elsewhere from the official Building Creatures benchmark tables, so choose only named scales, never numeric statistics.

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
    "spells": [ { "name": string, "rank": number } ] // rank 0 = cantrip; real PF2e spell names as a first draft (the final list is chosen from the compendium in a second step); max rank = ceil(level/2)
  },
  "feats": string[], // EXACT published PF2e feat names (e.g. "Power Attack", "Sudden Charge") for creatures with class-like training (soldiers, monks, assassins); [] for beasts, mindless creatures, and anything untrained; max 3. IMPORTANT: when a feat grants a distinct attack or Strike-based action (Power Attack, Sudden Charge, Ki Strike, ...), ALSO add a strike named after the feat to "strikes" — same weapon and damageType as the base strike it modifies, damageScale one step higher (extreme stays extreme), plus the feat's traits — and keep the feat in "feats" too.
  "equipment": [ { "name": string, "quantity": number, "value": number } ], // 3-8 logical carried items with EXACT PF2e item names (${REMASTER_NOTE}), drawn from: the weapons it wields; sensible consumables (healing potions, elixirs of life, alchemical bombs, talismans, poisons it applies); and everyday adventuring gear it would plausibly carry (rope, torches, rations, thieves' tools, a crowbar). NO coins or currency here — those belong only in "loot". "value" is the approximate gp price of ONE unit, used only as a fallback when the name finds no compendium match. Include armor only when the creature would plausibly wear it (skip beasts, oozes, mindless and naturally-armored creatures), and pick armor that roughly fits its AC and level. At level 2+, consider ONE magic item appropriate to its level; fundamental-rune gear is written like "+1 striking rapier" or "+1 resilient studded leather armor". [] for beasts and mindless creatures.
  "loot": [ { "name": string, "quantity": number, "value": number } ], // ${LOOT_GUIDE}
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
- Use standard glossary abilities (Grab, Push, Knockdown, Trample, Swallow Whole, Frightful Presence, Regeneration, Attack of Opportunity, ...) where they fit, and invent 1-2 signature custom abilities that make the creature memorable.
- Passives especially should reuse a standard glossary ability instead of an invented equivalent — glossary abilities carry real working automation (Regeneration actually heals, All-Around Vision actually prevents flanking), while a custom passive is just prose the GM must remember to apply by hand. Reserve invented passives for narrative traits needing no mechanical tracking (a scent, a texture, an aura's flavor); if an invented passive DOES have a mechanical effect, phrase it with the DESCRIPTION CONVENTIONS above (an area, a save, a damage tick) so it stays clickable rather than inert prose.
- Traits, languages, senses and speeds must follow PF2e conventions.`;

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
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { content, usage } = await requestCompletion(args);
      return { data: parseConceptJSON(content), usage };
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
 * estimate of the completion so the report never comes up empty.
 */
function normalizeUsage(usage, content) {
  const prompt = Number(usage?.prompt_tokens);
  const completion = Number(usage?.completion_tokens);
  if (Number.isFinite(prompt) || Number.isFinite(completion)) {
    const p = Number.isFinite(prompt) ? prompt : 0;
    const c = Number.isFinite(completion) ? completion : 0;
    return { prompt: p, completion: c, total: Number(usage?.total_tokens) || p + c, estimated: false };
  }
  const est = estimateTokens((content ?? "").length);
  return { prompt: 0, completion: est, total: est, estimated: true };
}

/**
 * Generate just the loot field for a creature, given existing concept details.
 * Used for the "Reroll Loot" feature to regenerate treasure without changing creature stats.
 * @returns {Promise<{loot: Array}>}
 */
export async function generateLoot({ concept, onProgress }) {
  const system = `You are a Pathfinder 2e loot designer. Given a creature, respond with ONLY a JSON object containing an appropriate loot array for it to drop when defeated.

Respond with a SINGLE JSON object and nothing else. No markdown fences, no commentary.

JSON schema (loot key required):
{
  "loot": [ { "name": string, "quantity": number, "value": number } ]
}

Loot should be ${LOOT_GUIDE}`;

  const user = [
    `Creature: ${concept.name} (level ${concept.level}, ${concept.rarity} rarity)`,
    concept.blurb ? `Blurb: ${concept.blurb}` : null,
    concept.traits.length ? `Traits: ${concept.traits.join(", ")}` : null
  ].filter((line) => line !== null).join("\n");

  const { data: parsed, usage } = await requestJSON({ system, user, onProgress });
  return { loot: (Array.isArray(parsed.loot) ? parsed.loot : []), usage };
}

/**
 * Ask the configured model for a creature concept.
 * @returns {Promise<{concept: object, usage: object}>} parsed concept JSON + token usage
 */
export async function generateConcept({ prompt, level, rarity, allowSpellcasting, preset, onProgress }) {
  const userPrompt = [
    `Creature level: ${level}`,
    `Rarity: ${rarity}`,
    `Spellcasting allowed: ${allowSpellcasting ? "yes, if it fits the concept" : "NO - do not include spellcasting"}`,
    preset ? `Build preset (follow this road map; the concept below drives flavor): ${preset}` : null,
    "",
    `Concept from the GM: ${prompt}`
  ].filter((line) => line !== null).join("\n");

  const { data, usage } = await requestJSON({
    system: SYSTEM_PROMPT,
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
Give 3-6 lowercase keywords describing the KINDS of spells that fit this creature: descriptor traits (e.g. "fire", "cold", "mental", "death", "poison", "illusion", "necromancy"), and/or general purpose words ("healing", "buff", "debuff", "control", "summon", "detection"). These will be used to filter a spell list, so keep them concrete and matchable, not vague.`;

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

  const system = `You are selecting spells for a Pathfinder 2e creature. Choose ONLY from the provided list, copying each name EXACTLY as written. Respond with a single JSON object and nothing else:
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
  const spells = (Array.isArray(parsed.spells) ? parsed.spells : [])
    .filter((s) => s?.name)
    .map((s) => ({ name: String(s.name), rank: Math.min(Math.max(Math.round(Number(s.rank) || 0), 0), maxRank) }));
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
    // or streaming; retry progressively less demanding.
    if (response.status === 400) {
      delete body.stream_options;
      resetIdle();
      response = await postChatCompletion(baseUrl, apiKey, body, controller.signal);
    }
    if (response.status === 400) {
      delete body.response_format;
      resetIdle();
      response = await postChatCompletion(baseUrl, apiKey, body, controller.signal);
    }
    if (response.status === 400) {
      delete body.stream;
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
    return { content, usage: normalizeUsage(usage, content) };
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
