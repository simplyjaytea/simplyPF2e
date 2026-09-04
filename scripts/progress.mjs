/**
 * Pure generation-progress math. Step weights come from AI task budgets so
 * concept writing owns more of the bar than a short selector call. Intra-step
 * fill is phase-based (thinking → writing), never chars-vs-unknown-length.
 */
import { AI_TASK, taskMaxTokens } from "./ai-task-profiles.mjs";

/** Display share for local (non-AI) steps — not a measured duration. */
export const LOCAL_STEP_WEIGHT = 400;

/** How much of the active step the bar may fill for each stream phase. */
export const PHASE_FILL = Object.freeze({
  start: 0.02,
  thinking: 0.35,
  writing: 0.75
});

export function stepWeight(key) {
  const name = String(key ?? "");
  if (/^member\d+$/.test(name)) {
    return taskMaxTokens(AI_TASK.CREATURE_CONCEPT)
      + taskMaxTokens(AI_TASK.SPELL_FOCUS)
      + taskMaxTokens(AI_TASK.SPELL_SELECTION)
      + taskMaxTokens(AI_TASK.ABILITY_SELECTION)
      + taskMaxTokens(AI_TASK.CREATURE_FEAT_SELECTION)
      + taskMaxTokens(AI_TASK.EQUIPMENT_SELECTION)
      + taskMaxTokens(AI_TASK.LOOT_SELECTION);
  }
  switch (name) {
    case "concept": return taskMaxTokens(AI_TASK.CREATURE_CONCEPT);
    case "spells": return taskMaxTokens(AI_TASK.SPELL_FOCUS) + taskMaxTokens(AI_TASK.PC_SPELL_SELECTION);
    case "abilities": return taskMaxTokens(AI_TASK.ABILITY_SELECTION);
    case "feats": return taskMaxTokens(AI_TASK.FEAT_SELECTION);
    case "equipment": return taskMaxTokens(AI_TASK.EQUIPMENT_SELECTION);
    case "loot": return taskMaxTokens(AI_TASK.LOOT_SELECTION);
    case "design": return taskMaxTokens(AI_TASK.ENCOUNTER_DESIGN);
    case "abc": return taskMaxTokens(AI_TASK.ABC_SELECTION);
    case "choices": return taskMaxTokens(AI_TASK.CHARACTER_CHOICES);
    default: return LOCAL_STEP_WEIGHT;
  }
}

export function createProgress(defs) {
  return {
    steps: (defs ?? []).map(([key, label]) => ({
      key,
      label,
      state: "pending",
      weight: stepWeight(key)
    })),
    detail: "",
    percent: 0,
    streamFrac: 0
  };
}

/** Unknown keys leave state unchanged so a missing step cannot mark everything done. */
export function applyStep(steps, key) {
  const list = Array.isArray(steps) ? steps : [];
  if (!list.some((step) => step.key === key)) return false;
  let reached = false;
  for (const step of list) {
    if (step.key === key) {
      step.state = "active";
      reached = true;
    } else {
      step.state = reached ? "pending" : "done";
    }
  }
  return true;
}

export function resetStreamPhase(progress) {
  if (!progress) return progress;
  progress.streamFrac = 0;
  return progress;
}

/**
 * Advance the active step's fill from the stream phase only.
 * Extra tokens do not move the bar — length is unknown until the call ends.
 */
export function streamFraction({ phase, prior = 0 }) {
  const next = phase === "writing" ? PHASE_FILL.writing
    : phase === "thinking" ? PHASE_FILL.thinking
    : PHASE_FILL.start;
  return Math.min(0.92, Math.max(Number(prior) || 0, next));
}

/**
 * Weighted percent in 0–99. `floor` keeps the bar monotonic across ticks and
 * step changes. An unknown active key returns `floor` unchanged.
 */
export function progressPercent({ steps, activeKey, streamFrac = 0, floor = 0 }) {
  const list = Array.isArray(steps) ? steps : [];
  const floorClamped = Math.max(0, Math.min(100, Number(floor) || 0));
  if (!list.length) return floorClamped;
  const idx = list.findIndex((step) => step.key === activeKey);
  if (idx < 0) return floorClamped;
  const totalWeight = list.reduce((sum, step) => sum + (Number(step.weight) || 0), 0) || 1;
  const doneWeight = list.slice(0, idx).reduce((sum, step) => sum + (Number(step.weight) || 0), 0);
  const frac = Math.min(0.92, Math.max(PHASE_FILL.start, Number(streamFrac) || 0));
  const raw = ((doneWeight + frac * (Number(list[idx].weight) || 0)) / totalWeight) * 100;
  const next = Math.round(Math.max(0, Math.min(99, raw)));
  return Math.max(floorClamped, Math.max(1, next));
}
