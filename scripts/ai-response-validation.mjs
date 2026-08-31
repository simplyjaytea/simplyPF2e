import { AI_TASK } from "./ai-task-profiles.mjs";

const CREATURE_KEYS = [
  "name", "blurb", "description", "readAloud", "recallKnowledge", "size", "traits", "languages",
  "abilityScales", "acScale", "hpScale", "perceptionScale", "saveScales", "speeds", "senses",
  "skills", "strikes", "specialAbilities", "spellcasting", "focusSpells", "feats", "equipment",
  "loot", "resistances", "weaknesses", "immunities"
];

const PC_KEYS = [
  "name", "ancestry", "heritage", "background", "class", "keyAbility", "blurb", "backstory",
  "appearance", "age", "gender", "height", "weight", "ethnicity", "nationality", "personality",
  "alignmentFlavor", "likes", "dislikes", "allies", "enemies", "organizations", "languages", "feats",
  "spellcasting", "focusSpells", "equipment"
];

const RULES = Object.freeze({
  [AI_TASK.CREATURE_CONCEPT]: {
    required: CREATURE_KEYS,
    arrays: [
      "traits", "languages", "speeds", "senses", "skills", "strikes", "specialAbilities",
      "focusSpells", "feats", "equipment", "loot", "resistances", "weaknesses", "immunities"
    ],
    objects: ["abilityScales", "saveScales"],
    nonEmptyStrings: ["name", "description"]
  },
  [AI_TASK.PC_CONCEPT]: {
    required: PC_KEYS,
    arrays: ["languages", "feats", "focusSpells", "equipment"],
    nonEmptyStrings: ["name", "ancestry", "background", "class", "backstory"]
  },
  [AI_TASK.LOOT_DRAFT]: { required: ["loot"], arrays: ["loot"] },
  [AI_TASK.SPELL_FOCUS]: { required: ["keywords"], arrays: ["keywords"] },
  [AI_TASK.SPELL_SELECTION]: { required: ["spells"], arrays: ["spells"] },
  [AI_TASK.PC_SPELL_SELECTION]: { required: ["spells"], arrays: ["spells"] },
  [AI_TASK.EQUIPMENT_SELECTION]: { required: ["equipment"], arrays: ["equipment"] },
  [AI_TASK.LOOT_SELECTION]: { required: ["loot"], arrays: ["loot"] },
  [AI_TASK.ABILITY_SELECTION]: { required: ["abilityIds"], arrays: ["abilityIds"] },
  [AI_TASK.CREATURE_FEAT_SELECTION]: { required: ["featIds"], arrays: ["featIds"] },
  [AI_TASK.ABC_SELECTION]: {
    required: ["ancestry", "heritage", "background", "class", "keyAbility"],
    nonEmptyStrings: ["ancestry", "background", "class", "keyAbility"]
  },
  [AI_TASK.FEAT_SELECTION]: { required: ["picks"], arrays: ["picks"] },
  [AI_TASK.CHARACTER_CHOICES]: { required: ["picks"], arrays: ["picks"] },
  [AI_TASK.MAGIC_ITEM_CONCEPT]: {
    required: ["name", "description", "level", "rarity", "usage", "traits", "bulk", "invested", "effects"],
    arrays: ["traits", "effects"],
    nonEmptyStrings: ["name", "description", "rarity", "usage"]
  },
  [AI_TASK.RUNED_ITEM_CONCEPT]: {
    required: ["baseItemName", "potency", "secondaryTier", "propertyRunes", "description"],
    arrays: ["propertyRunes"],
    nonEmptyStrings: ["baseItemName", "description"]
  },
  [AI_TASK.ENCOUNTER_DESIGN]: {
    required: ["name", "briefs"],
    arrays: ["briefs"],
    nonEmptyStrings: ["name"]
  }
});

const isPlainObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));

/** Return concise structural problem text, or null when required shape exists. */
export function taskResponseProblem(task, data) {
  const rule = RULES[task];
  if (!rule) return `unknown task ${String(task)}`;
  if (!isPlainObject(data)) return "root must be a JSON object";

  const missing = rule.required.filter((key) => !Object.hasOwn(data, key));
  if (missing.length) return `missing required fields: ${missing.join(", ")}`;

  const wrongArrays = (rule.arrays ?? []).filter((key) => !Array.isArray(data[key]));
  if (wrongArrays.length) return `fields must be arrays: ${wrongArrays.join(", ")}`;

  const wrongObjects = (rule.objects ?? []).filter((key) => !isPlainObject(data[key]));
  if (wrongObjects.length) return `fields must be objects: ${wrongObjects.join(", ")}`;

  const emptyStrings = (rule.nonEmptyStrings ?? [])
    .filter((key) => typeof data[key] !== "string" || !data[key].trim());
  if (emptyStrings.length) return `fields must be non-empty strings: ${emptyStrings.join(", ")}`;
  return null;
}
