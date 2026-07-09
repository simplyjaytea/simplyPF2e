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
      "description": string,            // full rules text; may reference "the Extreme/High/Moderate DC" or "moderate damage" and the builder substitutes real numbers
      "traits": string[]
    }
  ],
  "spellcasting": null | {
    "tradition": "arcane"|"divine"|"occult"|"primal",
    "dcScale": "extreme"|"high"|"moderate",
    "spells": [ { "name": string, "rank": number } ]   // rank 0 = cantrip; real PF2e spell names as a first draft (the final list is chosen from the compendium in a second step); max rank = ceil(level/2)
  },
  "feats": string[],                    // EXACT published PF2e feat names (e.g. "Power Attack", "Sudden Charge") for creatures with class-like training such as humanoid soldiers, monks or assassins; [] for beasts, mindless creatures, and anything without trained techniques; max 3
  "equipment": string[],                // real PF2e equipment item names carried/worn, [] for beasts
  "resistances": [ { "type": string } ],   // damage types only, values computed from tables; [] if none
  "weaknesses": [ { "type": string } ],
  "immunities": string[]                 // e.g. ["death-effects", "poison"], [] if none
}

SCALE = "extreme"|"high"|"moderate"|"low". SCALE5 additionally allows "terrible".

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

export class AIRequestError extends Error {}

/**
 * Ask the configured model for a creature concept.
 * @returns {Promise<object>} parsed concept JSON
 */
export async function generateConcept({ prompt, level, rarity, allowSpellcasting }) {
  const apiKey = getSetting(SETTINGS.apiKey);
  const baseUrl = String(getSetting(SETTINGS.apiBaseUrl) ?? "").replace(/\/+$/, "");
  if (!baseUrl) throw new AIRequestError(game.i18n.localize("SIMPLYPF2E.Errors.NoBaseUrl"));

  const userPrompt = [
    `Creature level: ${level}`,
    `Rarity: ${rarity}`,
    `Spellcasting allowed: ${allowSpellcasting ? "yes, if it fits the concept" : "NO - do not include spellcasting"}`,
    "",
    `Concept from the GM: ${prompt}`
  ].join("\n");

  const body = {
    model: getSetting(SETTINGS.model),
    temperature: Number(getSetting(SETTINGS.temperature)) || 0.8,
    max_tokens: Number(getSetting(SETTINGS.maxTokens)) || 4000,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ],
    response_format: { type: "json_object" }
  };

  let response = await postChatCompletion(baseUrl, apiKey, body);
  // Some OpenAI-compatible providers reject response_format; retry without it.
  if (response.status === 400) {
    delete body.response_format;
    response = await postChatCompletion(baseUrl, apiKey, body);
  }

  if (!response.ok) {
    const detail = await safeErrorDetail(response);
    throw new AIRequestError(
      game.i18n.format("SIMPLYPF2E.Errors.ApiError", { status: response.status, detail })
    );
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new AIRequestError(game.i18n.localize("SIMPLYPF2E.Errors.EmptyResponse"));
  return parseConceptJSON(content);
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
export async function selectSpells({ concept, candidates, maxRank }) {
  const apiKey = getSetting(SETTINGS.apiKey);
  const baseUrl = String(getSetting(SETTINGS.apiBaseUrl) ?? "").replace(/\/+$/, "");

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

  const body = {
    model: getSetting(SETTINGS.model),
    temperature: Number(getSetting(SETTINGS.temperature)) || 0.8,
    max_tokens: Number(getSetting(SETTINGS.maxTokens)) || 4000,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    response_format: { type: "json_object" }
  };

  let response = await postChatCompletion(baseUrl, apiKey, body);
  if (response.status === 400) {
    delete body.response_format;
    response = await postChatCompletion(baseUrl, apiKey, body);
  }
  if (!response.ok) {
    const detail = await safeErrorDetail(response);
    throw new AIRequestError(
      game.i18n.format("SIMPLYPF2E.Errors.ApiError", { status: response.status, detail })
    );
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new AIRequestError(game.i18n.localize("SIMPLYPF2E.Errors.EmptyResponse"));
  const parsed = parseConceptJSON(content);
  return (Array.isArray(parsed.spells) ? parsed.spells : [])
    .filter((s) => s?.name)
    .map((s) => ({ name: String(s.name), rank: Math.min(Math.max(Math.round(Number(s.rank) || 0), 0), maxRank) }));
}

async function postChatCompletion(baseUrl, apiKey, body) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  try {
    return await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
  } catch (err) {
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

/** Parse model output into JSON, tolerating markdown fences and stray prose. */
export function parseConceptJSON(content) {
  let text = content.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced) text = fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new AIRequestError(game.i18n.localize("SIMPLYPF2E.Errors.BadJson"));
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (err) {
    console.error("simplypf2e | Failed to parse AI response:", content);
    throw new AIRequestError(game.i18n.localize("SIMPLYPF2E.Errors.BadJson"));
  }
}
