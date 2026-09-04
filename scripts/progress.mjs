/**
 * Pure generation-progress math. Step weights come from AI task budgets so
 * concept writing owns more of the bar than a short selector call. Stream
 * ticks map into the active step's share and never lower the percent.
 */
import { AI_TASK, taskMaxTokens } from "./ai-task-profiles.mjs";

/** Display share for local (non-AI) steps — not a measured duration. */
export const LOCAL_STEP_WEIGHT = 400;

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
    streamFrac: 0,
    tokenBase: 0,
    lastTokens: 0,
    peakTokens: 0
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

export function resetStreamCounters(progress) {
  if (!progress) return progress;
  progress.streamFrac = 0;
  progress.tokenBase = 0;
  progress.lastTokens = 0;
  progress.peakTokens = 0;
  return progress;
}

/**
 * Fold a new streamed token count into the active step.
 * A drop in `tokens` is a new call or thinking→writing, not a rewind.
 * Exact late usage never lowers the peak (and does not double-count a reset).
 */
export function accumulateStreamTokens(progress, tokens, { exact = false } = {}) {
  const n = Math.max(0, Number(tokens) || 0);
  if (exact) {
    progress.lastTokens = n;
    progress.peakTokens = Math.max(progress.peakTokens || 0, n);
    return progress.peakTokens;
  }
  const last = progress.lastTokens || 0;
  if (n < last) progress.tokenBase = (progress.tokenBase || 0) + last;
  progress.lastTokens = n;
  progress.peakTokens = Math.max(progress.peakTokens || 0, (progress.tokenBase || 0) + n);
  return progress.peakTokens;
}

/**
 * Map streamed tokens into [0, 0.92] of the active step.
 * Thinking saturates in the first 30%; writing scales against the step budget.
 */
export function streamFraction({ phase, tokens, expectedTokens, prior = 0 }) {
  const t = Math.max(0, Number(tokens) || 0);
  const expected = Math.max(1, Number(expectedTokens) || 1);
  const next = phase === "thinking"
    ? 0.3 * (1 - Math.exp(-t / 96))
    : 0.92 * Math.min(1, t / expected);
  return Math.min(0.92, Math.max(prior, next));
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
  const frac = Math.min(0.92, Math.max(0.02, Number(streamFrac) || 0));
  const raw = ((doneWeight + frac * (Number(list[idx].weight) || 0)) / totalWeight) * 100;
  const next = Math.round(Math.max(0, Math.min(99, raw)));
  return Math.max(floorClamped, Math.max(1, next));
}
