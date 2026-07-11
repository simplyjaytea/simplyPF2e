import { SETTINGS, getSetting } from "./settings.mjs";

/**
 * Client for any OpenAI-compatible chat completions API (DeepSeek, OpenAI,
 * OpenRouter, Ollama, LM Studio, ...). The endpoint, key and model are all
 * world settings, so each table can bring its own provider.
 */

const SYSTEM_PROMPT = `You are an expert Pathfinder 2e (remaster) creature designer. You design creature CONCEPTS; the numbers are computed elsewhere from the official Building Creatures benchmark tables, so you only ever choose named scales, never numeric statistics.

Respond with a SINGLE JSON object and nothing else. No markdown fences, no commentary.

JSON schema (all keys required unless marked optional):
{
  "name": string,                       // evocative creature name
  "blurb": string,                      // one-line tagline
  "description": string,               // 1-2 paragraphs of flavor & tactics, plain text
  "readAloud": string,                 // 2-3 vivid sensory sentences to read aloud when players first encounter it (sight, sound, smell, movement). Theater-of-the-mind prose; NO game statistics or numbers.
  "recallKnowledge": string,           // 1-2 sentences: the single most useful thing a player learns about this creature on a successful Recall Knowledge check (key weakness, most dangerous ability, or exploitable habit)
  "size": "tiny"|"sm"|"med"|"lg"|"huge"|"grg",
  "traits": string[],                   // PF2e creature traits, lowercase (e.g. "undead", "fiend", "humanoid"). Include exactly one creature type trait.
  "languages": string[],                // lowercase, [] if none
  "abilityScales": {                    // one scale per ability
    "str": SCALE, "dex": SCALE, "con": SCALE, "int": SCALE, "wis": SCALE, "cha": SCALE
  },
  "acScale": SCALE,
  "hpScale": "high"|"moderate"|"low",
  "perceptionScale": SCALE5,
  "saveScales": { "fortitude": SCALE5, "reflex": SCALE5, "will": SCALE5 },
  "speeds": [ { "type": "land"|"fly"|"swim"|"climb"|"burrow", "value": number } ],  // multiples of 5, include land unless immobile
  "senses": [ { "type": string, "acuity": "precise"|"imprecise"|"vague"|null, "range": number|null } ],  // e.g. darkvision, scent
  "skills": [ { "name": string, "scale": "extreme"|"high"|"moderate"|"low" } ],     // 2-5 skills; standard skill names or "<Topic> Lore"
  "strikes": [                          // 1-3 strikes
    {
      "name": string,                   // e.g. "jaws", "rusted glaive"
      "type": "melee"|"ranged",
      "attackScale": "extreme"|"high"|"moderate"|"low",
      "damageScale": "extreme"|"high"|"moderate"|"low",
      "damageType": string,             // e.g. "piercing", "fire"
      "traits": string[],               // strike traits like "agile", "reach-10", "deadly-d8"; [] if none
      "range": number|null,             // range increment in feet for ranged strikes
      "attackEffects": string[]         // e.g. ["grab"], [] if none
    }
  ],
  "specialAbilities": [                 // 1-4 abilities
    {
      "name": string,
      "glossary": string|null,          // EXACT name of a standard PF2e bestiary glossary ability (e.g. "Grab", "Knockdown", "Frightful Presence", "Attack of Opportunity") if this is one, else null
      "actionType": "action"|"reaction"|"free"|"passive",
      "actions": 1|2|3|null,            // action cost, null unless actionType is "action"
      "description": string,            // full rules text following the DESCRIPTION CONVENTIONS below
      "traits": string[]
    }
  ],
  "spellcasting": null | {
    "tradition": "arcane"|"divine"|"occult"|"primal",
    "dcScale": "extreme"|"high"|"moderate",
    "spells": [ { "name": string, "rank": number } ]   // rank 0 = cantrip; real PF2e spell names as a first draft (the final list is chosen from the compendium in a second step); max rank = ceil(level/2)
  },
  "feats": string[],                    // EXACT published PF2e feat names (e.g. "Power Attack", "Sudden Charge") for creatures with class-like training such as humanoid soldiers, monks or assassins; [] for beasts, mindless creatures, and anything without trained techniques; max 3
  "equipment": [ { "name": string, "quantity": number } ],  // 2-6 logical carried items with EXACT PF2e item names: the weapons and armor it actually wields, plus consumables where sensible (healing potions, elixirs of life, alchemical bombs, talismans, poisons it applies). For creatures of level 2+, consider ONE magic item appropriate to its level; fundamental-rune gear is written like "+1 striking rapier" or "+1 resilient studded leather armor". [] for beasts and mindless creatures.
  "loot": [ { "name": string, "quantity": number } ],  // 3-8 items dropped on defeat with EXACT PF2e item names: treasure items, consumables (potions, scrolls, alchemical items), magical items appropriate to level/rarity. Scale gold coins and item rarity to the encounter's difficulty (higher rarity = more valuable loot). Include 1-2 coins items (e.g. "Gold Coins"), 1-2 consumable items (e.g. "Healing Potion", "Scroll of Phantom Steed"), and 1-2 treasure/magical items.
  "resistances": [ { "type": string } ],   // damage types only, values computed from tables; [] if none
  "weaknesses": [ { "type": string } ],
  "immunities": string[]                 // e.g. ["death-effects", "poison"], [] if none
}

SCALE = "extreme"|"high"|"moderate"|"low". SCALE5 additionally allows "terrible".

DESCRIPTION CONVENTIONS for specialAbilities.description — the module converts these exact phrasings into clickable roll links, so follow them precisely:
- Table-scaled damage: "high damage", "moderate fire damage", "low persistent bleed damage" (scale word, optional "persistent", optional damage type, then "damage"). Use for an ability's main damage so it scales with level.
- Fixed dice you choose yourself (for small riders): "2d6 fire damage", "1d4 persistent bleed damage".
- Saving throws: "basic high Reflex save", "moderate Fortitude save", "extreme Will save" (optional "basic", scale word, save name, "save"). Basic saves are for plain damage effects.
- Skill checks against the creature: "high DC Athletics check".
- Healing: "regains 2d8 Hit Points" or "2d8 healing".
- Flat checks: "DC 5 flat check".
- Areas: "30-foot cone", "15-foot burst", "60-foot line", "10-foot emanation".
- Structure activated abilities as "Frequency ...; Trigger ...; Effect ..." and requirements as "Requirements ...; Effect ...".
- Never invent flat numeric DCs or attack bonuses; always use the scale words.

Design guidance (GM Core road maps):
- Pick ONE stat at most to be extreme, and balance it with a low or terrible stat.
- Brute: low perception; moderate-or-better AC; high Fort, low Ref/Will; high HP; high attack & damage.
- Sneak: high dex; low Fort, high Ref; high stealth; moderate HP.
- Skirmisher: high Ref, fast speeds, moderate everything else.
- Soldier: high AC, high Fort, high attack with moderate damage.
- Spellcaster: casting tradition matching key ability at high or extreme; low-or-moderate AC, HP and attack; DC one scale above attacks.
- Only include spellcasting when it truly fits the concept and the user allows it.
- Use standard glossary abilities (Grab, Push, Knockdown, Trample, Swallow Whole, Frightful Presence, Regeneration, ...) where they fit, and invent 1-2 signature custom abilities that make the creature memorable.
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
 */
async function requestJSON(args) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return parseConceptJSON(await requestCompletion(args));
    } catch (err) {
      if (!(err instanceof AIRequestError) || !err.retryable) throw err;
      lastError = err;
      if (attempt === 0) console.warn("simplypf2e | generation attempt failed, retrying once:", err.message);
    }
  }
  throw lastError;
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
  "loot": [ { "name": string, "quantity": number } ]
}

Loot should be 3-8 items with EXACT PF2e item names: treasure items, consumables (potions, scrolls, alchemical items), and magical items appropriate to level/rarity. Include 1-2 coins items (e.g. "Gold Coins"), 1-2 consumable items (e.g. "Healing Potion", "Scroll of Phantom Steed"), and 1-2 treasure/magical items. Scale rarity and quantity to the creature's level and rarity.`;

  const user = [
    `Creature: ${concept.name} (level ${concept.level}, ${concept.rarity} rarity)`,
    concept.blurb ? `Blurb: ${concept.blurb}` : null,
    concept.traits.length ? `Traits: ${concept.traits.join(", ")}` : null,
    concept.description ? `Description: ${concept.description}` : null
  ].filter((line) => line !== null).join("\n");

  const parsed = await requestJSON({ system, user, onProgress });
  return { loot: (Array.isArray(parsed.loot) ? parsed.loot : []) };
}

/**
 * Ask the configured model for a creature concept.
 * @returns {Promise<object>} parsed concept JSON
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

  return requestJSON({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    onProgress
  });
}

/**
 * Second pass: given the real spell list from the compendium, have the model
 * pick the creature's spells. Names it returns are guaranteed to exist (and
 * are still fuzzy-matched afterwards as a safety net).
 * @param {object} args
 * @param {object} args.concept       normalized concept (for context)
 * @param {{name: string, rank: number}[]} args.candidates
 * @param {number} args.maxRank
 * @returns {Promise<{name: string, rank: number}[]>}
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

  const parsed = await requestJSON({ system, user, onProgress });
  return (Array.isArray(parsed.spells) ? parsed.spells : [])
    .filter((s) => s?.name)
    .map((s) => ({ name: String(s.name), rank: Math.min(Math.max(Math.round(Number(s.rank) || 0), 0), maxRank) }));
}

/**
 * Encounter design pass: given a theme and a budget-fixed composition, name
 * the encounter and write a one-sentence creature brief per slot. Each brief
 * then runs through the normal single-creature pipeline.
 * @returns {Promise<{name: string, briefs: string[]}>} briefs indexed by slot
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

  const parsed = await requestJSON({ system, user, onProgress });
  const briefs = Array.isArray(parsed.briefs) ? parsed.briefs.map((b) => String(b)) : [];
  return {
    name: String(parsed.name || "Encounter"),
    briefs: slots.map((s, i) => briefs[i] ?? `${theme} — a level ${s.level} ${s.role}`)
  };
}

/**
 * Generate a portrait via an OpenAI-compatible /images/generations endpoint.
 * Uses the dedicated image settings, falling back to the text provider's
 * base URL/key. Returns base64 PNG data, or a URL if that's all we get.
 * @returns {Promise<{b64?: string, url?: string}>}
 */
export async function generateImage({ prompt }) {
  const model = getSetting(SETTINGS.imageModel);
  if (!model) throw new AIRequestError(game.i18n.localize("SIMPLYPF2E.Errors.NoImageModel"));
  const baseUrl = String(getSetting(SETTINGS.imageBaseUrl) || getSetting(SETTINGS.apiBaseUrl) || "").replace(/\/+$/, "");
  const apiKey = getSetting(SETTINGS.imageApiKey) || getSetting(SETTINGS.apiKey);

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  let response;
  try {
    response = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, prompt, n: 1, size: "1024x1024" })
    });
  } catch (err) {
    throw new AIRequestError(game.i18n.format("SIMPLYPF2E.Errors.NetworkError", { message: err.message }));
  }
  if (!response.ok) {
    const detail = await safeErrorDetail(response);
    throw new AIRequestError(game.i18n.format("SIMPLYPF2E.Errors.ApiError", { status: response.status, detail }));
  }
  const data = await response.json();
  const image = data?.data?.[0] ?? {};
  if (image.b64_json) return { b64: image.b64_json };
  if (image.url) return { url: image.url };
  throw new AIRequestError(game.i18n.localize("SIMPLYPF2E.Errors.EmptyResponse"));
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
 * @param {(p: {phase: "thinking"|"writing", chars: number}) => void} [args.onProgress]
 * @returns {Promise<string>}
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
    // Some OpenAI-compatible providers reject response_format or streaming;
    // retry progressively less demanding.
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
    if (contentType.includes("text/event-stream") && response.body) {
      ({ content, finishReason } = await readEventStream(response, { onProgress, resetIdle }));
    } else {
      resetIdle();
      const data = await response.json();
      content = data?.choices?.[0]?.message?.content;
      finishReason = data?.choices?.[0]?.finish_reason ?? null;
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
    return content;
  } catch (err) {
    if (err.name === "AbortError" || controller.signal.aborted) {
      throw new AIRequestError(game.i18n.format("SIMPLYPF2E.Errors.Timeout", { seconds: idleSeconds }));
    }
    throw err;
  } finally {
    clearTimeout(idleTimer);
  }
}

/** Consume an SSE chat-completions stream, reporting progress per chunk. */
async function readEventStream(response, { onProgress, resetIdle }) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let reasoningChars = 0;
  let finishReason = null;
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
      const choice = chunk?.choices?.[0] ?? {};
      if (choice.finish_reason) finishReason = choice.finish_reason;
      const delta = choice.delta ?? {};
      // DeepSeek reasoning models stream their chain of thought first
      if (typeof delta.reasoning_content === "string" && delta.reasoning_content) {
        reasoningChars += delta.reasoning_content.length;
        onProgress?.({ phase: "thinking", chars: reasoningChars });
      }
      if (typeof delta.content === "string" && delta.content) {
        content += delta.content;
        onProgress?.({ phase: "writing", chars: content.length });
      }
    }
  }
  return { content, finishReason };
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
