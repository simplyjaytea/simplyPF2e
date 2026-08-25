/**
 * Output/sampling policy for each AI operation.
 *
 * Global settings remain upper bounds. Small grounding operations must not
 * inherit the same output allowance or creativity as full concept writing.
 * Keeping this module pure makes policy testable without Foundry globals.
 * All current operations request structured JSON, so separated reasoning is
 * disabled to reserve the bounded completion allowance for a complete object.
 */
export const AI_TASK = Object.freeze({
  CONNECTION_TEST: "connectionTest",
  CREATURE_CONCEPT: "creatureConcept",
  PC_CONCEPT: "pcConcept",
  LOOT_DRAFT: "lootDraft",
  SPELL_FOCUS: "spellFocus",
  SPELL_SELECTION: "spellSelection",
  EQUIPMENT_SELECTION: "equipmentSelection",
  LOOT_SELECTION: "lootSelection",
  ABC_SELECTION: "abcSelection",
  FEAT_SELECTION: "featSelection",
  MAGIC_ITEM_CONCEPT: "magicItemConcept",
  RUNED_ITEM_CONCEPT: "runedItemConcept",
  ENCOUNTER_DESIGN: "encounterDesign"
});

const TASK_PROFILES = Object.freeze({
  [AI_TASK.CONNECTION_TEST]: { maxTokens: 64, deterministic: true, disableReasoning: true },
  [AI_TASK.CREATURE_CONCEPT]: { maxTokens: 8000, deterministic: false, disableReasoning: true },
  [AI_TASK.PC_CONCEPT]: { maxTokens: 8000, deterministic: false, disableReasoning: true },
  [AI_TASK.LOOT_DRAFT]: { maxTokens: 1600, deterministic: false, disableReasoning: true },
  [AI_TASK.SPELL_FOCUS]: { maxTokens: 768, deterministic: true, disableReasoning: true },
  [AI_TASK.SPELL_SELECTION]: { maxTokens: 1536, deterministic: true, disableReasoning: true },
  [AI_TASK.EQUIPMENT_SELECTION]: { maxTokens: 1536, deterministic: true, disableReasoning: true },
  [AI_TASK.LOOT_SELECTION]: { maxTokens: 2048, deterministic: true, disableReasoning: true },
  [AI_TASK.ABC_SELECTION]: { maxTokens: 1024, deterministic: true, disableReasoning: true },
  [AI_TASK.FEAT_SELECTION]: { maxTokens: 3072, deterministic: true, disableReasoning: true },
  [AI_TASK.MAGIC_ITEM_CONCEPT]: { maxTokens: 4000, deterministic: false, disableReasoning: true },
  [AI_TASK.RUNED_ITEM_CONCEPT]: { maxTokens: 2000, deterministic: false, disableReasoning: true },
  [AI_TASK.ENCOUNTER_DESIGN]: { maxTokens: 1024, deterministic: false, disableReasoning: true }
});

const finiteNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Resolve effective completion options, honoring user settings as ceilings. */
export function completionOptionsFor(task, {
  configuredTemperature,
  configuredMaxTokens,
  retryAttempt = 0
} = {}) {
  const profile = TASK_PROFILES[task];
  if (!profile) throw new TypeError(`Unknown AI task profile: ${String(task)}`);

  const parsedLimit = Math.trunc(finiteNumber(configuredMaxTokens, 8000));
  const configuredLimit = parsedLimit >= 1 ? parsedLimit : 8000;
  const creativeTemperature = Math.min(2, Math.max(0, finiteNumber(configuredTemperature, 0.8)));
  const taskLimit = profile.maxTokens * (Number(retryAttempt) > 0 ? 2 : 1);
  return {
    temperature: profile.deterministic ? 0 : creativeTemperature,
    maxTokens: Math.min(configuredLimit, taskLimit),
    reasoningEffort: profile.disableReasoning ? "none" : null,
    thinkingType: profile.disableReasoning ? "disabled" : null
  };
}
