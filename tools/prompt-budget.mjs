#!/usr/bin/env node
/**
 * Offline prompt-budget measurement for simplyPF2e.
 *
 * Drives the REAL prompt builders in scripts/ai.mjs against candidate
 * catalogs built from a pinned pf2e pack tree, with fetch stubbed to capture
 * each request and return a valid canned reply. No network, no Foundry, no
 * provider calls. Nothing here changes production prompt behavior.
 *
 * Usage:
 *   node tools/prompt-budget.mjs
 *   node tools/prompt-budget.mjs --json
 *   PF2E_PINNED_DIR=/path/to/pf2e node tools/prompt-budget.mjs
 *
 * The pinned tree defaults to /tmp/pf2e-pf2e-8.5.0 (the 8.5.0 release used by
 * every other check). The first run builds a compact index cache under
 * /tmp/opencode; later runs reuse it. Delete the cache or pass --refresh to
 * rebuild it.
 */

import { readdirSync, readFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PINNED_DIR = resolve(process.env.PF2E_PINNED_DIR ?? "/tmp/pf2e-pf2e-8.5.0");
const CACHE_PATH = process.env.PROMPT_BUDGET_CACHE ?? "/tmp/opencode/simplypf2e-8.5.0-index.json";
const argv = new Set(process.argv.slice(2));
const AS_JSON = argv.has("--json");
const REFRESH = argv.has("--refresh");
const INDEX_VERSION = 2;
if (!argv.has("--verbose")) console.warn = () => {};

/* Only the default pf2e packs the module itself uses. Registering a small,
 * known set keeps detectAvailablePacks() from discovering unrelated packs and
 * keeps the run deterministic. */
const PACK_DIRS = {
  "pf2e.bestiary-ability-glossary-srd": "bestiary-ability-glossary-srd",
  "pf2e.ancestries": "ancestries",
  "pf2e.backgrounds": "backgrounds",
  "pf2e.classes": "classes",
  "pf2e.classfeatures": "class-features",
  "pf2e.equipment-srd": "equipment",
  "pf2e.feats-srd": "feats",
  "pf2e.heritages": "heritages",
  "pf2e.spells-srd": "spells"
};

const INDEX_SYSTEM_FIELDS = [
  "slug", "level", "traits", "ritual", "category", "stackGroup", "spell",
  "prerequisites", "price", "usage", "specific", "ancestry", "publication",
  "ancestryFeatLevels", "classFeatLevels", "skillFeatLevels", "generalFeatLevels"
];

function filesUnder(directory) {
  const out = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(path));
    else if (entry.isFile() && entry.name.endsWith(".json") && !entry.name.startsWith("_")) out.push(path);
  }
  return out;
}

function compactEntry(doc) {
  const system = {};
  for (const field of INDEX_SYSTEM_FIELDS) {
    if (doc.system?.[field] !== undefined) system[field] = doc.system[field];
  }
  return { _id: doc._id, name: doc.name, type: doc.type, system };
}

function buildIndex() {
  const packs = {};
  const ancestryOfHeritage = {};
  for (const [packId, dir] of Object.entries(PACK_DIRS)) {
    const full = join(PINNED_DIR, "packs", "pf2e", dir);
    if (!existsSync(full)) throw new Error(`Pinned pack directory missing: ${full}`);
    const entries = [];
    for (const file of filesUnder(full)) {
      let doc;
      try { doc = JSON.parse(readFileSync(file, "utf8")); }
      catch (err) { throw new Error(`Cannot parse ${file}: ${err.message}`); }
      if (!doc || typeof doc !== "object" || !doc._id || !doc.name || !doc.type) continue;
      entries.push(compactEntry(doc));
      if (doc.type === "heritage" && doc.system?.ancestry?.name) {
        ancestryOfHeritage[doc._id] = doc.system.ancestry.name;
      }
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    packs[packId] = entries;
  }
  return { version: INDEX_VERSION, source: PINNED_DIR, builtAt: new Date().toISOString(), ancestryOfHeritage, packs };
}

function loadIndex() {
  if (!REFRESH && existsSync(CACHE_PATH)) {
    try {
      const cached = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
      if (cached.version === INDEX_VERSION && cached.source === PINNED_DIR) return cached;
    } catch { /* fall through to rebuild */ }
  }
  const started = Date.now();
  const index = buildIndex();
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(index));
  if (!AS_JSON) console.error(`Built pinned-pack index in ${Date.now() - started} ms: ${CACHE_PATH}`);
  return index;
}

const pinned = loadIndex();

/* ------------------------------- Foundry stand-ins ------------------------------- */

const SETTINGS = {
  apiBaseUrl: "http://localhost:11434/v1",
  apiKey: "",
  apiKeyBaseUrl: "",
  model: "prompt-budget-offline",
  providerBank: { activeId: "", connections: [] },
  temperature: 0.8,
  maxTokens: 8000,
  requestTimeout: 90,
  sourcePacks: {},
  customPresets: [],
  freeArchetype: false,
  multiclassArchetypes: true,
  experimentalTools: true
};

class StubPack {
  constructor(id, entries, ancestryOfHeritage) {
    this.collection = id;
    this.title = id;
    this.metadata = { type: "Item", label: id, packageName: "pf2e" };
    this.entries = entries;
    this.byId = new Map(entries.map((entry) => [entry._id, entry]));
    this.ancestryOfHeritage = ancestryOfHeritage;
  }
  async getIndex() { return this.entries; }
  async getDocument(id) {
    const entry = this.byId.get(id);
    return entry ? structuredClone(entry) : null;
  }
}

const packs = new Map(Object.entries(pinned.packs).map(
  ([id, entries]) => [id, new StubPack(id, entries, pinned.ancestryOfHeritage)]
));

globalThis.game = {
  settings: {
    get: (_module, key) => SETTINGS[key],
    set: async () => {},
    register: () => {},
    registerMenu: () => {}
  },
  i18n: {
    localize: (key) => String(key),
    format: (key, data) => `${key}${data ? ` ${JSON.stringify(data)}` : ""}`
  },
  packs,
  actors: { get: () => null },
  items: { get: () => null },
  user: { isGM: true }
};
globalThis.foundry = {
  utils: {
    deepClone: (value) => structuredClone(value),
    mergeObject: (target, source) => Object.assign(target ?? {}, source ?? {})
  },
  applications: { api: {} }
};
globalThis.CONFIG = { PF2E: { classTraits: {} } };
globalThis.CONST = {};
globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };

/* ------------------------------- AI call capture ------------------------------- */

const capture = {
  entry: null,
  replyFactory: null,
  task: null
};

function stubResponse(system, user, content) {
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => (String(name).toLowerCase() === "content-type" ? "application/json" : null) },
    async json() {
      return {
        choices: [{ message: { content }, finish_reason: "stop" }],
        usage: {
          prompt_tokens: Math.max(1, Math.round((system.length + user.length) / 3.5)),
          completion_tokens: Math.max(1, Math.round(content.length / 3.5)),
          total_tokens: Math.max(1, Math.round((system.length + user.length + content.length) / 3.5))
        }
      };
    }
  };
}

globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(init?.body ?? "{}");
  const system = body.messages?.find((message) => message.role === "system" || message.role === "developer")?.content ?? "";
  const user = body.messages?.find((message) => message.role === "user")?.content ?? "";
  const entry = capture.entry;
  if (!entry || typeof capture.replyFactory !== "function") {
    throw new Error("prompt-budget: fetch called outside a measured call");
  }
  const attempt = entry.attempts.length + 1;
  const content = capture.replyFactory({ system, user, attempt, entry, task: capture.task });
  entry.attempts.push({ system, user, content, maxTokens: body.max_tokens ?? body.max_completion_tokens ?? null });
  return stubResponse(system, user, content);
};

async function runCall(flow, label, task, fn, replyFactory) {
  const entry = { label, task, attempts: [] };
  flow.calls.push(entry);
  capture.entry = entry;
  capture.task = task;
  capture.replyFactory = replyFactory;
  try {
    return await fn();
  } finally {
    capture.entry = null;
    capture.replyFactory = null;
    capture.task = null;
  }
}

/* ------------------------------- Canned replies ------------------------------- */

const PC_BACKSTORY = (name) => [
  `${name} grew up on the wrong side of the docks in Absalom, the child of a dockhand and a`,
  `moneychanger's clerk who vanished when the ledgers stopped balancing. A decade of hauling cargo`,
  `and breaking up tavern brawls taught ${name} that a steady hand and a ready blade settle more`,
  `arguments than a lecture. When a press gang tried to take a younger sibling, ${name} stepped`,
  `between them and a boarding axe, and the harbor watch offered a choice: a cell or a badge.`,
  `Since then ${name} has worked the waterfront as a hired shield, escorting caravans through the`,
  `Precipice Quarter and chasing down cargo that walked off on its own. The work pays poorly, but`,
  `it keeps a roof over the family and a weapon within reach. ${name} still checks the old`,
  `moneychanger's office every few weeks, hoping a ledger or a witness will explain the`,
  `disappearance, and has learned to read a room, a contract, and a lie with the same careful`,
  `patience. Strangers mistake the calm for indifference until the first blade clears its scabbard.`
].join(" ");

const NPC_DESCRIPTION = (name, level) => [
  `${name} is a lean, soot-stained figure who moves through the ruined quarter like a landlord`,
  `collecting rent. Layers of scorched leather and salvaged mail hang from a frame that has spent`,
  `years climbing rubble and hauling the wounded clear of collapsing tenements. ${level > 3 ? "The" : "This"}`,
  `creature's hands are wrapped in ash-stained linen, and a cracked clay mask covers the lower half`,
  `of its face. It speaks in a low, patient rumble and never raises its voice, even when the smoke`,
  `thickens and the floor begins to give way. Those who have survived an encounter with it describe`,
  `a fighter who uses the terrain as patiently as a blade, herding prey toward unstable ground and`,
  `then sealing the only clean exit with a burst of cinder and hot ash. It keeps a small brass`,
  `token of a forgotten fire brigade and polishes it whenever it believes no one is watching.`
].join(" ");

function pcConceptReply(overrides = {}) {
  const name = overrides.name ?? "Mara Vell";
  const className = overrides.class ?? "Fighter";
  const keyAbility = overrides.keyAbility ?? "str";
  const spellcasting = overrides.spellcasting ?? null;
  return JSON.stringify({
    name,
    ancestry: overrides.ancestry ?? "Human",
    heritage: overrides.heritage ?? "Versatile Heritage",
    background: overrides.background ?? "Acolyte",
    class: className,
    keyAbility,
    abilityPriorities: overrides.abilityPriorities ?? ["dex", "con", "wis"],
    blurb: overrides.blurb ?? "A patient waterfront shield who reads a room before drawing steel.",
    backstory: PC_BACKSTORY(name),
    appearance: "Tall, weathered, with a scar through one eyebrow and salt-stiff dark hair.",
    age: "34",
    gender: "Female",
    height: "5 ft. 10 in.",
    weight: "170 lbs.",
    ethnicity: "Garundi",
    nationality: "Absalom native",
    personality: "Quiet until the moment action is needed, then blunt and decisive.",
    alignmentFlavor: "Protects the people in front of her and lets the law sort out the rest.",
    likes: "Hot tea, clean contracts, the sound of a ship's bell",
    dislikes: "Press gangs, moneylenders, being rushed",
    allies: "Her younger brother, a harbor clerk who feeds her dock gossip.",
    enemies: "The press-gang captain who still holds a grudge.",
    organizations: "The Dockside Shield, a loose crew of paid escorts.",
    languages: ["Dwarven", "Elven"],
    feats: ["Power Attack", "Intimidating Glare", "Toughness", "Weapon Focus", "Battle Cry", "Quick Jump"],
    skillPriorities: ["athletics", "intimidation", "medicine"],
    spellcasting,
    focusSpells: overrides.focusSpells ?? [],
    equipment: overrides.equipment ?? [
      { name: "Longsword", quantity: 1 },
      { name: "Chain mail", quantity: 1 },
      { name: "Steel shield", quantity: 1 },
      { name: "Healer's Tools", quantity: 1 },
      { name: "Potion of Healing", quantity: 2 }
    ]
  });
}

function npcConceptReply(name = "Ash Warden", level = 5) {
  return JSON.stringify({
    name,
    blurb: "A soot-stained survivor who herds intruders through a collapsing tenement.",
    description: NPC_DESCRIPTION(name, level),
    readAloud: "A low rumble rolls through the smoke, and a masked figure steps out of the ash.",
    recallKnowledge: "Fire brigade tokens mark the old wards; the mask hides a burn-scarred jaw.",
    size: "medium",
    traits: ["humanoid", "human", "fire"],
    languages: ["Common", "Ignan"],
    abilityScales: { str: "high", dex: "moderate", con: "high", int: "low", wis: "moderate", cha: "low" },
    acScale: "moderate",
    hpScale: "high",
    perceptionScale: "moderate",
    saveScales: { fortitude: "high", reflex: "moderate", will: "moderate" },
    speeds: [{ type: "land", value: 25 }],
    senses: [{ type: "darkvision" }],
    skills: [{ name: "Athletics", scale: "high" }, { name: "Stealth", scale: "moderate" }],
    strikes: [{
      name: "cinder maul", type: "melee", attackScale: "high", damageScale: "high",
      damageType: "bludgeoning", traits: ["magical"], range: null, attackEffects: []
    }],
    specialAbilities: [
      { name: "Smoke Cloud", glossary: "Smoke Cloud" },
      { name: "Ash Step", glossary: "Ash Step" }
    ],
    spellcasting: {
      tradition: "primal",
      spells: [
        { name: "Produce Flame", rank: 0 },
        { name: "Ignition", rank: 0 },
        { name: "Burning Hands", rank: 1 },
        { name: "Flaming Sphere", rank: 2 },
        { name: "Fireball", rank: 3 }
      ]
    },
    focusSpells: ["Fire Ray"],
    feats: ["Toughness", "Intimidating Prowess"],
    equipment: [
      { name: "Maul", quantity: 1 },
      { name: "Hide armor", quantity: 1 },
      { name: "Potion of Healing", quantity: 2 },
      { name: "Rope", quantity: 1 }
    ],
    loot: [
      { name: "Potion of Healing", quantity: 2 },
      { name: "Scroll of Fireball", quantity: 1 }
    ],
    resistances: [{ type: "fire", value: 5 }],
    weaknesses: [],
    immunities: []
  });
}

/* ------------------------------- Prompt parsing ------------------------------- */

function entries(text) {
  return text.split(/;\s*/).map((chunk) => {
    const [id, ...rest] = chunk.split(" | ");
    if (!id || !rest.length) return null;
    return { id: id.trim(), name: rest.join(" | ").trim() };
  }).filter(Boolean);
}

function sectionEntries(user, prefix) {
  const line = user.split("\n").find((candidate) => candidate.startsWith(prefix));
  if (!line) return [];
  return entries(line.slice(line.indexOf(":") + 1).trim());
}

function named(list, wanted) {
  return list.find((item) => item.name.toLowerCase() === String(wanted).toLowerCase());
}

function spellGroups(user) {
  const groups = new Map();
  const ranks = ["cantrip", "rank-one", "rank-two", "rank-three", "rank-four", "rank-five",
    "rank-six", "rank-seven", "rank-eight", "rank-nine", "rank-ten"];
  for (const line of user.split("\n")) {
    const match = /^(cantrip|rank-[a-z]+|Cantrips|Rank (\d+)): (.*)$/.exec(line);
    if (!match) continue;
    const rank = match[1] === "Cantrips" ? 0 : match[2] ? Number(match[2]) : ranks.indexOf(match[1]);
    if (rank < 0) continue;
    groups.set(rank, entries(match[3]));
  }
  return groups;
}

function featCatalogIds(user) {
  const lines = user.split("\n");
  const start = lines.findIndex((line) => line.startsWith("Feat catalog"));
  if (start < 0) return [];
  const ids = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes(" | ")) break;
    if (/^Slots \(/.test(line)) break;
    ids.push(line.split(" | ")[0].trim());
  }
  return ids;
}

function slotsFromPrompt(user) {
  const lines = user.split("\n");
  const start = lines.findIndex((line) => line.startsWith("Slots ("));
  if (start < 0) return [];
  const slots = [];
  for (let i = start + 1; i < lines.length; i++) {
    const match = /^(\d+) \| ([^|]+) \| level (\d+) \| (.+)$/.exec(lines[i].trim());
    if (!match) break;
    slots.push({ number: Number(match[1]), type: match[2].trim(), level: Number(match[3]), ids: match[4].split(",").map((id) => id.trim()).filter(Boolean) });
  }
  return slots;
}

function catalogAfter(user, prefix) {
  const lines = user.split("\n");
  const start = lines.findIndex((line) => line.startsWith(prefix));
  if (start < 0) return [];
  const ids = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (!lines[i].includes(" | ")) break;
    ids.push(lines[i].split(" | ")[0].trim());
  }
  return ids;
}

function nextLineAfter(system, prefix) {
  const lines = system.split("\n");
  const index = lines.findIndex((line) => line.startsWith(prefix));
  return index >= 0 ? (lines[index + 1] ?? "") : "";
}

function abcReply(user, picks) {
  const ancestries = sectionEntries(user, "Available ancestries");
  const heritages = sectionEntries(user, "Available heritages");
  const backgrounds = sectionEntries(user, "Available backgrounds");
  const classes = sectionEntries(user, "Available classes");
  const ancestry = named(ancestries, picks.ancestry) ?? ancestries[0];
  const compatible = heritages.filter((item) => {
    const owner = packs.get("pf2e.heritages")?.ancestryOfHeritage?.[item.id];
    return !owner || owner.toLowerCase() === ancestry?.name.toLowerCase();
  });
  const heritage = named(compatible, picks.heritage) ?? compatible[0] ?? null;
  const background = named(backgrounds, picks.background) ?? backgrounds[0];
  const pcClass = named(classes, picks.class) ?? classes[0];
  return JSON.stringify({
    ancestryId: ancestry?.id ?? "",
    heritageId: heritage?.id ?? null,
    backgroundId: background?.id ?? "",
    classId: pcClass?.id ?? "",
    keyAbility: picks.keyAbility ?? "str"
  });
}

function spellPlanReply(groups, plannedPicks, { enumRanks = true, signatureRanks = [] } = {}) {
  const rankNames = ["cantrip", "rank-one", "rank-two", "rank-three", "rank-four", "rank-five",
    "rank-six", "rank-seven", "rank-eight", "rank-nine", "rank-ten"];
  const spells = [];
  for (const [rank, count] of Object.entries(plannedPicks ?? {})) {
    const key = Number(rank);
    if (!count) continue;
    const pool = (groups.get(key) ?? []).filter((item) => !spells.some((spell) => spell.id === item.id)).slice(0, count);
    for (const item of pool) {
      const pick = enumRanks ? { id: item.id, rank: rankNames[key] } : { id: item.id };
      if (enumRanks && signatureRanks.includes(key) && !spells.some((spell) => spell.signature === "signature" && spell.rank === rankNames[key])) {
        pick.signature = "signature";
      } else if (enumRanks) {
        pick.signature = "regular";
      }
      spells.push(pick);
    }
  }
  return JSON.stringify({ spells, focusSpellIds: [] });
}

function creatureSpellsReply(user) {
  const groups = spellGroups(user);
  const spells = [];
  for (const rank of [0, 1, 2, 3, 4]) {
    const pool = groups.get(rank) ?? [];
    const wanted = rank === 0 ? 2 : 2;
    for (const item of pool.slice(0, wanted)) {
      if (spells.some((spell) => spell.id === item.id)) continue;
      spells.push({ id: item.id, rank });
    }
  }
  return JSON.stringify({ spells, focusSpellIds: [] });
}

function equipmentReply(user) {
  const picks = [];
  for (const line of user.split("\n")) {
    const match = /^([a-z]+): (.*)$/.exec(line);
    if (!match || match[1] === "Traits") continue;
    for (const item of entries(match[2])) {
      if (picks.length >= 4) break;
      if (!picks.some((pick) => pick.id === item.id)) picks.push({ id: item.id, quantity: 1 });
    }
  }
  return JSON.stringify({ equipment: picks });
}

function lootReply(user) {
  const picks = [];
  const scrolls = [];
  let inItems = false;
  let inScrolls = false;
  for (const line of user.split("\n")) {
    if (line.startsWith("Available items:")) { inItems = true; inScrolls = false; continue; }
    if (line.startsWith("Available scroll spells")) {
      inScrolls = true;
      inItems = false;
      const inline = line.slice(line.indexOf(":") + 1).trim();
      if (inline) {
        for (const item of entries(inline)) {
          const parts = item.name.split(" | ");
          if (scrolls.length < 1) scrolls.push({ scrollSpellId: item.id, rank: Number(parts[1]) || 1, quantity: 1 });
        }
      }
      continue;
    }
    if (inItems) {
      const match = /^([a-z]+): (.*)$/.exec(line);
      if (match) for (const item of entries(match[2])) {
        if (picks.length < 3 && !picks.some((pick) => pick.id === item.id)) picks.push({ id: item.id, quantity: 1 });
      }
      else if (!line.startsWith(" ")) inItems = false;
    }
    if (inScrolls) {
      const items = entries(line);
      for (const item of items) {
        const parts = item.name.split(" | ");
        const rank = Number(parts[1]) || 1;
        if (scrolls.length < 1) scrolls.push({ scrollSpellId: item.id, rank, quantity: 1 });
      }
    }
  }
  return JSON.stringify({ loot: [...picks, ...scrolls] });
}

/* ------------------------------- Scenarios ------------------------------- */

const commonRarity = "common";
const prompts = {
  fighter: "A dockside bodyguard with a debt to clear and a missing sibling to find.",
  bard: "A silver-tongued court musician who collects dangerous secrets.",
  archetype: "A veteran soldier who learned a few occult marching songs from a stranded bard.",
  npc: "A masked ash-warden who hunts intruders through a burned tenement.",
  encounter: "A collapsed tenement where a soot-masked fire cult ambushes scavengers.",
  forge: "A blade that remembers the forge-fire that made it and burns with old embers."
};

async function loadCatalog(compendium) {
  const [ancestries, heritages, backgrounds, classes] = await Promise.all([
    compendium.getAncestryCandidates(commonRarity, { distinctSources: true }),
    compendium.getHeritageCandidates(commonRarity, { distinctSources: true }),
    compendium.getBackgroundCandidates(commonRarity, { distinctSources: true }),
    compendium.getClassCandidates({ distinctSources: true })
  ]);
  return { ancestries, heritages, backgrounds, classes };
}

function classDocFor(classes) {
  const doc = (name) => {
    const entry = classes.find((candidate) => candidate.name === name);
    return entry ? packs.get(entry.ref.packId)?.byId.get(entry.ref._id) : null;
  };
  return { Fighter: doc("Fighter"), Bard: doc("Bard") };
}

async function pcFeatSlots(computer, concept, classDoc, { archetype = false } = {}) {
  const { buildFeatSlots } = computer;
  const { getFeatCandidates, limitFeatCandidates } = computer.compendium;
  const ancestryTrait = concept.ancestry.toLowerCase();
  const classTrait = concept.class.toLowerCase();
  const archetypeNames = new Set(["Bard Dedication", "Basic Bard Spellcasting"]);
  const archetypePool = archetype
    ? await getFeatCandidates({ level: concept.level, category: "class", traits: ["archetype"], limit: null, maxRarity: "uncommon" })
    : [];
  const extras = archetypePool.filter((candidate) => archetypeNames.has(candidate.name));
  const slots = [];
  for (const slot of buildFeatSlots(concept.level, { freeArchetype: false, classSystem: classDoc?.system ?? null })) {
    const traits = slot.type === "ancestry" ? [ancestryTrait] : slot.type === "class" ? [classTrait] : [];
    let candidates = await getFeatCandidates({
      level: slot.level,
      category: slot.type,
      traits,
      preferredNames: concept.feats,
      limit: 16,
      maxRarity: commonRarity
    });
    if (archetype && slot.type === "class" && slot.level >= 2) {
      const eligible = extras.filter((candidate) => candidate.level <= slot.level);
      candidates = limitFeatCandidates([...candidates, ...eligible], 16, concept.feats);
    }
    slots.push({ type: slot.type, level: slot.level, candidates });
  }
  return slots;
}

async function runPcFlow(computer, scenario) {
  const { AI_TASK, ai, compendium, normalizePCConcept, pcTables, classModelsFocusSpells, casterArchetypePlans } = computer;
  const flow = { name: scenario.label, kind: "pc", calls: [], concept: null };
  const catalogs = computer.catalogs;

  const draft = await runCall(flow, "concept", AI_TASK.PC_CONCEPT, () => ai.generatePCConcept({
    prompt: scenario.prompt,
    level: scenario.level,
    allowSpellcasting: scenario.caster,
    preset: null
  }), () => pcConceptReply(scenario.concept));
  const concept = normalizePCConcept(draft.concept, { level: scenario.level });
  concept.gmPrompt = scenario.prompt;
  flow.concept = concept;

  const abc = await runCall(flow, "abc", AI_TASK.ABC_SELECTION, () => ai.selectAncestryBackgroundClass({
    concept,
    ancestryCandidates: catalogs.ancestries,
    heritageCandidates: catalogs.heritages,
    backgroundCandidates: catalogs.backgrounds,
    classCandidates: catalogs.classes
  }), ({ user }) => abcReply(user, scenario.concept));
  concept.ancestry = abc.ancestry;
  concept.heritage = abc.heritage;
  concept.background = abc.background;
  concept.class = abc.class;
  concept.keyAbility = abc.keyAbility;
  concept.traits = [concept.ancestry.toLowerCase(), concept.class.toLowerCase()];

  const classDoc = computer.classDocs[concept.class] ?? null;
  const slots = await pcFeatSlots(computer, concept, classDoc, { archetype: scenario.archetype });
  const feats = await runCall(flow, "feats", AI_TASK.FEAT_SELECTION, () => ai.selectFeats({
    concept, slots
  }), ({ user }) => {
    const parsed = slotsFromPrompt(user);
    return JSON.stringify({ picks: parsed.map((slot) => ({ slot: slot.number, id: slot.ids[0] })) });
  });
  concept.feats = (scenario.archetype ? ["Bard Dedication", "Basic Bard Spellcasting"] : concept.feats).slice(0, 8);

  if (scenario.caster && classDoc) {
    const profile = pcTables.pcSpellcastingProfile(classDoc);
    if (profile) {
      const plan = pcTables.pcSpellPlan(concept.level, profile);
      concept.spellcasting = {
        tradition: profile.tradition,
        spells: concept.spellcasting?.spells ?? [],
        plannedPicks: plan.picks,
        signatureRanks: plan.signatureRanks,
        preparationMode: profile.mode,
        maxRank: Math.max(...Object.entries(plan.slots).filter(([, count]) => count > 0).map(([rank]) => Number(rank)))
      };
      const focus = await runCall(flow, "spellFocus", AI_TASK.SPELL_FOCUS, () => ai.chooseSpellFocus({
        concept, tradition: concept.spellcasting.tradition
      }), () => JSON.stringify({ keywords: ["mental", "sonic", "illusion", "buff", "control"] }));
      const keywords = [...concept.spellcasting.spells.map((spell) => spell.name), ...focus.keywords];
      const candidates = await compendium.getSpellCandidates(
        concept.spellcasting.tradition, concept.spellcasting.maxRank, keywords, plan.picks, { maxRarity: commonRarity }
      );
      const focusCandidates = classModelsFocusSpells(classDoc)
        ? await compendium.getFocusSpellCandidates(concept.spellcasting.maxRank, [...concept.focusSpells.map((s) => s.name ?? s), ...focus.keywords], { maxRarity: commonRarity })
        : [];
      await runCall(flow, "spells", AI_TASK.PC_SPELL_SELECTION, () => ai.selectSpells({
        concept,
        candidates,
        focusCandidates,
        maxRank: concept.spellcasting.maxRank,
        plannedPicks: plan.picks,
        preparationMode: profile.mode,
        signatureRanks: plan.signatureRanks
      }), ({ user }) => spellPlanReply(spellGroups(user), plan.picks, { signatureRanks: plan.signatureRanks }));
    }
  }

  if (scenario.archetype) {
    const plans = casterArchetypePlans(["Bard Dedication", "Basic Bard Spellcasting"], concept.level);
    const plan = plans.find((candidate) => candidate.archetype.tradition);
    if (plan) {
      concept.archetypeSpellcasting = {
        pkg: plan.archetype.pkg,
        tradition: plan.archetype.tradition,
        plannedPicks: plan.picks,
        maxRank: plan.maxRank,
        spells: []
      };
      const candidates = await compendium.getSpellCandidates(plan.archetype.tradition, plan.maxRank, [], plan.picks, { maxRarity: commonRarity });
      await runCall(flow, "archetypeSpells", AI_TASK.PC_SPELL_SELECTION, () => ai.selectArchetypeSpells({
        concept,
        candidates,
        plannedPicks: plan.picks,
        tradition: plan.archetype.tradition,
        label: plan.archetype.label,
        repertoire: plan.archetype.book === "repertoire"
      }), ({ user }) => spellPlanReply(spellGroups(user), plan.picks, { enumRanks: false }));
    }
  }

  const equipmentKeywords = [...concept.equipment.map((item) => item.name), ...concept.strikes.map((strike) => strike.name)]
    .flatMap((name) => [String(name).toLowerCase(), ...String(name).toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2)]);
  const equipmentCandidates = await compendium.getEquipmentCandidates(concept.level, equipmentKeywords, { maxRarity: commonRarity });
  if (equipmentCandidates.length) {
    await runCall(flow, "equipment", AI_TASK.EQUIPMENT_SELECTION, () => ai.selectEquipment({
      concept, candidates: equipmentCandidates
    }), ({ user }) => equipmentReply(user));
  }

  const lootDraft = await runCall(flow, "lootDraft", AI_TASK.LOOT_DRAFT, () => ai.generatePCLoot({
    concept, amount: "standard"
  }), () => JSON.stringify({ loot: [
    { name: "Potion of Healing", quantity: 2 },
    { name: "Scroll of Fear", quantity: 1 },
    { name: "Bag of Holding", quantity: 1 }
  ] }));
  concept.loot = lootDraft.loot;
  const lootKeywords = concept.loot.map((item) => String(item.name).toLowerCase());
  const scrollKeywords = lootKeywords.filter((name) => name.startsWith("scroll of ")).map((name) => name.slice(10));
  const [lootCandidates, scrollCandidates] = await Promise.all([
    compendium.getLootCandidates(concept.level, lootKeywords, { maxRarity: commonRarity }),
    scrollKeywords.length ? compendium.getScrollSpellCandidates(10, scrollKeywords, { maxRarity: commonRarity }) : []
  ]);
  if (lootCandidates.length || scrollCandidates.length) {
    await runCall(flow, "loot", AI_TASK.LOOT_SELECTION, () => ai.selectLoot({
      concept, candidates: lootCandidates, scrollCandidates
    }), ({ user }) => lootReply(user));
  }

  return flow;
}

async function runNpcFlow(computer, { label, level, prompt, gmPrompt }) {
  const { AI_TASK, ai, compendium, normalizeConcept } = computer;
  const flow = { name: label, kind: "npc", calls: [], concept: null };

  const draft = await runCall(flow, "concept", AI_TASK.CREATURE_CONCEPT, () => ai.generateConcept({
    prompt, level, rarity: "common", allowSpellcasting: true,
    includeEquipment: true, includeLoot: true, intent: "npc"
  }), () => npcConceptReply(label, level));
  const concept = normalizeConcept(draft.concept, { level, rarity: "common" });
  concept.gmPrompt = gmPrompt ?? prompt;
  flow.concept = concept;

  if (concept.spellcasting) {
    const focus = await runCall(flow, "spellFocus", AI_TASK.SPELL_FOCUS, () => ai.chooseSpellFocus({
      concept, tradition: concept.spellcasting.tradition
    }), () => JSON.stringify({ keywords: ["fire", "smoke", "control", "debuff"] }));
    const candidates = await compendium.getSpellCandidates(
      concept.spellcasting.tradition, concept.spellcasting.maxRank,
      [...concept.spellcasting.spells.map((spell) => spell.name), ...focus.keywords],
      null, { maxRarity: commonRarity }
    );
    const focusCandidates = await compendium.getFocusSpellCandidates(
      concept.spellcasting.maxRank, [...concept.focusSpells.map((spell) => spell.name ?? spell), ...focus.keywords],
      { maxRarity: commonRarity }
    );
    if (candidates.length) {
      await runCall(flow, "spells", AI_TASK.SPELL_SELECTION, () => ai.selectSpells({
        concept, candidates, focusCandidates,
        maxRank: concept.spellcasting.maxRank
      }), ({ user }) => creatureSpellsReply(user));
    }
  }

  if (concept.specialAbilities?.length) {
    const keywords = concept.specialAbilities.flatMap((ability) => [ability.glossary, ability.name])
      .map((name) => String(name ?? "").toLowerCase()).filter(Boolean);
    const candidates = await compendium.getAbilityCandidates(keywords);
    if (candidates.length) {
      await runCall(flow, "abilities", AI_TASK.ABILITY_SELECTION, () => ai.selectCreatureAbilities({
        concept, candidates
      }), ({ user }) => JSON.stringify({ abilityIds: catalogAfter(user, "Bestiary action catalog").slice(0, 2) }));
    }
  }

  const featCatalog = await compendium.getCreatureFeatCandidates({
    level: 24, limit: null,
    preferredNames: (concept.feats ?? []).map((feat) => typeof feat === "string" ? feat : feat.name),
    prompt: concept.gmPrompt ?? "",
    maxRarity: commonRarity
  });
  const featCandidates = compendium.rankCreatureFeatCandidates(featCatalog, {
    preferredNames: (concept.feats ?? []).map((feat) => typeof feat === "string" ? feat : feat.name),
    prompt: concept.gmPrompt ?? "",
    limit: 16
  }).filter((candidate) => candidate.level <= concept.level);
  if ((concept.feats ?? []).length && featCandidates.length) {
    await runCall(flow, "creatureFeats", AI_TASK.CREATURE_FEAT_SELECTION, () => ai.selectCreatureFeats({
      concept, candidates: featCandidates
    }), ({ user }) => JSON.stringify({ featIds: catalogAfter(user, "Feat catalog").slice(0, 2) }));
  }

  if (concept.equipment?.length) {
    const draftNames = [...concept.equipment.map((item) => item.name), ...concept.strikes.map((strike) => strike.name)];
    const keywords = [...new Set(draftNames.flatMap((name) => [
      String(name).toLowerCase(),
      ...String(name).toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2)
    ]))];
    const candidates = await compendium.getEquipmentCandidates(concept.level, keywords, { maxRarity: commonRarity });
    if (candidates.length) {
      await runCall(flow, "equipment", AI_TASK.EQUIPMENT_SELECTION, () => ai.selectEquipment({
        concept, candidates
      }), ({ user }) => equipmentReply(user));
    }
  }

  if (concept.loot?.length) {
    const lootNames = concept.loot.map((item) => String(item.name).toLowerCase());
    const keywords = [...new Set(lootNames.flatMap((name) => [
      name, ...name.split(/[^a-z0-9]+/).filter((token) => token.length > 2)
    ]))];
    const scrollKeywords = lootNames.filter((name) => name.startsWith("scroll of ")).map((name) => name.slice(10));
    const [candidates, scrollCandidates] = await Promise.all([
      compendium.getLootCandidates(concept.level, keywords, { maxRarity: commonRarity }),
      scrollKeywords.length ? compendium.getScrollSpellCandidates(10, scrollKeywords, { maxRarity: commonRarity }) : []
    ]);
    if (candidates.length || scrollCandidates.length) {
      await runCall(flow, "loot", AI_TASK.LOOT_SELECTION, () => ai.selectLoot({
        concept, candidates, scrollCandidates
      }), ({ user }) => lootReply(user));
    }
  }

  return flow;
}

async function runEncounterFlow(computer) {
  const { AI_TASK, ai, encounter } = computer;
  const flow = { name: "Encounter (moderate, party level 3, 4 PCs)", kind: "encounter", calls: [], concept: null };
  const composition = encounter.composeEncounter("moderate", 4, 3);
  const design = await runCall(flow, "design", AI_TASK.ENCOUNTER_DESIGN, () => ai.designEncounter({
    theme: prompts.encounter,
    partyLevel: 3,
    slots: composition.members,
    allowHazard: false
  }), () => JSON.stringify({
    name: "The Ashen Ambush",
    briefs: composition.members.map((slot, index) => `Ash-masked ${slot.role} ${index + 1} that fights from the smoke.`)
  }));
  flow.concept = design;
  flow.composition = composition;
  flow.members = [];
  for (let index = 0; index < composition.members.length; index++) {
    const slot = composition.members[index];
    const member = await runNpcFlow(computer, {
      label: `member ${index + 1} (${slot.role}, level ${slot.level})`,
      level: slot.level,
      prompt: `${design.briefs[index]} (Part of the encounter "${design.name}": ${prompts.encounter})`,
      gmPrompt: prompts.encounter
    });
    for (const call of member.calls) call.label = `member ${index + 1}: ${call.label}`;
    flow.members.push(member);
    flow.calls.push(...member.calls);
  }
  flow.conceptSets = flow.members.map((member) => member.concept);
  return flow;
}

/**
 * The optional second PC purchase pass (generator-app ~1923) makes one more
 * generatePCLoot + selectLoot round when more than a quarter of the loot
 * budget is still coin. Measured here on the level-8 Bard concept so its cost
 * can be reported separately instead of inflating every PC flow.
 */
async function measureExtraPass(computer, concept) {
  const { AI_TASK, ai, compendium } = computer;
  const flow = { name: "extra PC purchase pass (level 8 Bard)", kind: "pc", calls: [], concept };
  const draft = await runCall(flow, "lootDraft (extra)", AI_TASK.LOOT_DRAFT, () => ai.generatePCLoot({
    concept, amount: "standard"
  }), () => JSON.stringify({ loot: [
    { name: "Wand of Soothe", quantity: 1 },
    { name: "Cloak of Elvenkind", quantity: 1 },
    { name: "Potion of Healing", quantity: 2 }
  ] }));
  const extraConcept = { ...concept, loot: [...(concept.loot ?? []), ...draft.loot] };
  flow.concept = extraConcept;
  const lootNames = extraConcept.loot.map((item) => String(item.name).toLowerCase());
  const keywords = [...new Set(lootNames.flatMap((name) => [
    name, ...name.split(/[^a-z0-9]+/).filter((token) => token.length > 2)
  ]))];
  const scrollKeywords = lootNames.filter((name) => name.startsWith("scroll of ")).map((name) => name.slice(10));
  const [candidates, scrollCandidates] = await Promise.all([
    compendium.getLootCandidates(extraConcept.level, keywords, { maxRarity: commonRarity }),
    scrollKeywords.length ? compendium.getScrollSpellCandidates(10, scrollKeywords, { maxRarity: commonRarity }) : []
  ]);
  await runCall(flow, "loot (extra)", AI_TASK.LOOT_SELECTION, () => ai.selectLoot({
    concept: extraConcept, candidates, scrollCandidates
  }), ({ user }) => lootReply(user));
  return flow;
}

async function runForgeFlow(computer) {
  const { AI_TASK, ai, runes } = computer;
  const flow = { name: "Forge runed weapon (level 8, common)", kind: "forge", calls: [], concept: null };
  const [baseCandidates, runeCandidates, tiers] = await Promise.all([
    runes.getBaseItemCandidates("weapon", 8, { maxRarity: commonRarity }),
    runes.getPropertyRuneCandidates("weapon", 8, { maxRarity: commonRarity }),
    runes.getFundamentalRuneTiers("weapon", 8, { maxRarity: commonRarity })
  ]);
  flow.catalog = {
    bases: baseCandidates.length,
    propertyRunes: runeCandidates.length,
    potencyRunes: tiers.potencyCandidates.length,
    secondaryRunes: tiers.secondaryCandidates.length
  };
  const result = await runCall(flow, "concept", AI_TASK.RUNED_ITEM_CONCEPT, () => ai.generateRunedItemConcept({
    prompt: prompts.forge,
    level: 8,
    rarity: "common",
    kind: "weapon",
    baseCandidates,
    runeCandidates,
    potencyCandidates: tiers.potencyCandidates,
    secondaryCandidates: tiers.secondaryCandidates
  }), ({ system }) => {
    const aliasOf = (prefix) => {
      const line = nextLineAfter(system, prefix);
      return line.split(";")[0]?.split(" | ")[0]?.trim() ?? "";
    };
    return JSON.stringify({
      baseItemId: aliasOf("Base weapons available"),
      potencyRuneId: aliasOf("Potency runes available"),
      secondaryRuneId: aliasOf("Striking runes available") || "none",
      propertyRuneIds: [aliasOf("Property runes available")].filter(Boolean).slice(0, 1),
      description: "A soot-black blade whose fuller glows like a banked ember; it hums when the wind carries smoke."
    });
  });
  flow.concept = result.concept;
  return flow;
}

/* ------------------------------- Analysis ------------------------------- */

function splitSections(user) {
  const sections = new Map();
  let current = "opening";
  for (const line of user.split("\n")) {
    const label = /^([A-Z][^:]{0,55}):/.exec(line)?.[1] ?? null;
    if (label) current = label;
    sections.set(current, (sections.get(current) ?? 0) + line.length + 1);
  }
  return [...sections.entries()]
    .filter(([label]) => label !== "opening")
    .sort((a, b) => b[1] - a[1])
    .map(([label, chars]) => ({ label, chars }));
}

function analyse(flow, conceptSets) {
  const sets = (conceptSets ?? [flow.concept]).filter(Boolean).map((concept) => ({
    concept,
    fields: {
      backstory: concept?.backstory ?? "",
      description: concept?.description ?? "",
      blurb: concept?.blurb ?? "",
      gmPrompt: concept?.gmPrompt ?? ""
    }
  }));
  let repeatedCalls = 0;
  let repeatedChars = 0;
  for (const call of flow.calls) {
    const first = call.attempts[0];
    if (!first) continue;
    let best = { chars: 0, fields: [] };
    for (const set of sets) {
      const seenText = new Set();
      let chars = 0;
      const found = [];
      for (const [field, text] of Object.entries(set.fields)) {
        if (!text || text.length < 20 || seenText.has(text)) continue;
        if (first.user.includes(text)) {
          seenText.add(text);
          chars += text.length;
          found.push(field);
        }
      }
      if (chars > best.chars) best = { chars, fields: found };
    }
    call.repeated = best;
    if (best.chars) { repeatedCalls++; repeatedChars += best.chars; }
  }
  return { repeatedCalls, repeatedChars };
}

function callRow(call, repeated) {
  const first = call.attempts[0];
  const system = first?.system ?? "";
  const user = first?.user ?? "";
  const total = system.length + user.length;
  return {
    label: call.label,
    task: call.task,
    attempts: call.attempts.length,
    maxTokens: first?.maxTokens ?? null,
    systemChars: system.length,
    userChars: user.length,
    tokens35: Math.round(total / 3.5),
    tokens25: Math.round(total / 2.5),
    topSections: splitSections(user).slice(0, 3),
    repeatedChars: repeated?.chars ?? 0,
    repeatedFields: repeated?.fields ?? []
  };
}

function flowSummary(flow) {
  const repeated = analyse(flow, flow.conceptSets ?? (flow.concept ? [flow.concept] : []));
  const rows = flow.calls.map((call) => callRow(call, call.repeated));
  const totals = rows.reduce((accumulator, row) => ({
    calls: accumulator.calls + 1,
    attempts: accumulator.attempts + row.attempts,
    systemChars: accumulator.systemChars + row.systemChars,
    userChars: accumulator.userChars + row.userChars,
    tokens35: accumulator.tokens35 + row.tokens35,
    tokens25: accumulator.tokens25 + row.tokens25
  }), { calls: 0, attempts: 0, systemChars: 0, userChars: 0, tokens35: 0, tokens25: 0 });
  return {
    name: flow.name,
    kind: flow.kind,
    catalog: flow.catalog ?? null,
    rows,
    totals,
    repeated,
    optionalExtraPass: flow.kind === "pc"
  };
}

async function measureRetry(computer) {
  const { ai, AI_TASK, normalizePCConcept, catalogs } = computer;
  const flow = { name: "retry measurement", calls: [], concept: null };
  const level = 4;
  const concept = normalizePCConcept({ name: "Retry Probe", ancestry: "Human", background: "Acolyte", class: "Fighter", keyAbility: "str" }, { level });
  concept.gmPrompt = prompts.fighter;
  flow.concept = concept;
  await runCall(flow, "abc", AI_TASK.ABC_SELECTION, () => ai.selectAncestryBackgroundClass({
    concept,
    ancestryCandidates: catalogs.ancestries,
    heritageCandidates: catalogs.heritages,
    backgroundCandidates: catalogs.backgrounds,
    classCandidates: catalogs.classes
  }), ({ user, attempt }) => attempt === 1
    ? "{}"
    : abcReply(user, { ancestry: "Human", background: "Acolyte", class: "Fighter", keyAbility: "str" }));
  const entry = flow.calls[0];
  const [first, second] = entry.attempts;
  return {
    task: entry.task,
    attempts: entry.attempts.length,
    first: { systemChars: first.system.length, userChars: first.user.length, maxTokens: first.maxTokens },
    retry: { systemChars: second.system.length, userChars: second.user.length, maxTokens: second.maxTokens },
    fullResend: second.user.startsWith(first.user),
    suffixChars: second.user.length - first.user.length
  };
}

function formatTable(rows) {
  const lines = [
    "| # | call | task | maxTok | sys chars | user chars | tok @3.5 | tok @2.5 | top user sections |",
    "|---|---|---|---|---|---|---|---|---|"
  ];
  rows.forEach((row, index) => {
    const top = row.topSections
      .map((section) => `${section.label.replaceAll("|", "/")} ${section.chars}`)
      .join("; ");
    lines.push(`| ${index + 1} | ${row.label} | ${row.task} | ${row.maxTokens ?? "-"} | ${row.systemChars} | ${row.userChars} | ${row.tokens35} | ${row.tokens25} | ${top} |`);
  });
  return lines.join("\n");
}

/* ------------------------------- Main ------------------------------- */

async function main() {
  const ai = await import(pathToFileURL(join(ROOT, "scripts", "ai.mjs")).href);
  const compendium = await import(pathToFileURL(join(ROOT, "scripts", "compendium.mjs")).href);
  const runes = await import(pathToFileURL(join(ROOT, "scripts", "runes.mjs")).href);
  const encounter = await import(pathToFileURL(join(ROOT, "scripts", "encounter.mjs")).href);
  const pcBuilder = await import(pathToFileURL(join(ROOT, "scripts", "pc-builder.mjs")).href);
  const pcTables = await import(pathToFileURL(join(ROOT, "scripts", "pc-tables.mjs")).href);
  const pcSupport = await import(pathToFileURL(join(ROOT, "scripts", "pc-support.mjs")).href);
  const archetype = await import(pathToFileURL(join(ROOT, "scripts", "pc-caster-archetype.mjs")).href);
  const taskProfiles = await import(pathToFileURL(join(ROOT, "scripts", "ai-task-profiles.mjs")).href);

  const catalogs = await loadCatalog(compendium);
  const classDocs = classDocFor(catalogs.classes);
  const computer = {
    ai, compendium, runes, encounter,
    AI_TASK: taskProfiles.AI_TASK,
    normalizePCConcept: pcBuilder.normalizePCConcept,
    normalizeConcept: (await import(pathToFileURL(join(ROOT, "scripts", "builder.mjs")).href)).normalizeConcept,
    pcTables,
    classModelsFocusSpells: pcSupport.classModelsFocusSpells,
    casterArchetypePlans: archetype.casterArchetypePlans,
    buildFeatSlots: pcTables.buildFeatSlots,
    catalogs,
    classDocs
  };

  const flows = [];
  flows.push(await runPcFlow(computer, {
    label: "PC level 1 Fighter",
    level: 1,
    caster: false,
    archetype: false,
    prompt: prompts.fighter,
    concept: { name: "Mara Vell", class: "Fighter", keyAbility: "str" }
  }));
  flows.push(await runPcFlow(computer, {
    label: "PC level 8 Bard",
    level: 8,
    caster: true,
    archetype: false,
    prompt: prompts.bard,
    concept: {
      name: "Lysa Quill", class: "Bard", keyAbility: "cha", background: "Entertainer",
      blurb: "A court musician whose songs carry more truth than her smile.",
      spellcasting: {
        tradition: "occult",
        spells: [
          { name: "Courageous Anthem", rank: 0 }, { name: "Detect Magic", rank: 0 },
          { name: "Fear", rank: 1 }, { name: "Soothe", rank: 1 },
          { name: "Mirror Image", rank: 2 }, { name: "Invisibility", rank: 2 },
          { name: "Haste", rank: 3 }, { name: "Slow", rank: 3 },
          { name: "Confusion", rank: 4 }
        ]
      }
    }
  }));
  flows.push(await runPcFlow(computer, {
    label: "PC level 6 Fighter + Bard Dedication + Basic",
    level: 6,
    caster: true,
    archetype: true,
    prompt: prompts.archetype,
    concept: {
      name: "Bran Hallow", class: "Fighter", keyAbility: "str",
      blurb: "A soldier who picked up a few occult marching songs and never put them down.",
      spellcasting: null
    }
  }));
  flows.push(await runNpcFlow(computer, {
    label: "NPC level 5 spellcaster",
    level: 5,
    prompt: prompts.npc
  }));
  flows.push(await runEncounterFlow(computer));
  flows.push(await runForgeFlow(computer));

  const extraPass = flowSummary(await measureExtraPass(computer, flows[1].concept));
  const summaries = flows.map(flowSummary);
  const retry = await measureRetry(computer);
  const output = {
    generatedAt: new Date().toISOString(),
    pinned: PINNED_DIR,
    cache: CACHE_PATH,
    catalogs: {
      ancestries: catalogs.ancestries.length,
      heritages: catalogs.heritages.length,
      backgrounds: catalogs.backgrounds.length,
      classes: catalogs.classes.length
    },
    taskProfiles: Object.fromEntries(Object.values(taskProfiles.AI_TASK).map((task) => [task, {
      maxTokens: taskProfiles.taskMaxTokens(task)
    }])),
    flows: summaries,
    extraPurchasePass: extraPass,
    retry
  };

  if (AS_JSON) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return;
  }

  console.log(`simplyPF2e prompt budget (offline; pinned ${PINNED_DIR})`);
  console.log(`Catalogs: ${output.catalogs.ancestries} ancestries, ${output.catalogs.heritages} heritages, ${output.catalogs.backgrounds} backgrounds, ${output.catalogs.classes} classes`);
  for (const flow of summaries) {
    console.log(`\n## ${flow.name}`);
    if (flow.catalog) console.log(`Catalog pools: ${JSON.stringify(flow.catalog)}`);
    console.log(formatTable(flow.rows));
    console.log(`Totals: ${flow.totals.calls} calls (${flow.totals.attempts} requests), sys ${flow.totals.systemChars} chars, user ${flow.totals.userChars} chars, ${flow.totals.tokens35} tokens @3.5, ${flow.totals.tokens25} tokens @2.5`);
    if (flow.optionalExtraPass) console.log("Conditional extra purchase pass: +2 calls when >25% of the loot budget remains coin (measured below).");
    const detailed = flow.rows
      .filter((row) => row.repeatedChars)
      .map((row) => `${row.label}: ${row.repeatedFields.join("+")} ${row.repeatedChars}`)
      .join("; ");
    console.log(`Repeated concept text: ${flow.repeated.repeatedCalls}/${flow.totals.calls} calls, ${flow.repeated.repeatedChars} chars${detailed ? ` (${detailed})` : ""}`);
  }
  console.log("\n## Conditional extra PC purchase pass (level 8 Bard)");
  console.log(formatTable(extraPass.rows));
  console.log(`Extra-pass totals: ${extraPass.totals.calls} calls, ${extraPass.totals.tokens35} tokens @3.5, ${extraPass.totals.tokens25} tokens @2.5`);
  console.log("\n## Retry policy measurement");
  console.log(JSON.stringify(retry, null, 2));
}

main().catch((err) => {
  console.error(err?.stack ?? err);
  process.exitCode = 1;
});
