// Pure progress-bar math: weighted steps, monotonic percent, stream mapping.
// Run: node scripts/progress.test.mjs
import assert from "node:assert/strict";
import { AI_TASK, taskMaxTokens } from "./ai-task-profiles.mjs";
import {
  LOCAL_STEP_WEIGHT,
  accumulateStreamTokens,
  applyStep,
  createProgress,
  progressPercent,
  resetStreamCounters,
  stepWeight,
  streamFraction
} from "./progress.mjs";

assert.equal(stepWeight("concept"), taskMaxTokens(AI_TASK.CREATURE_CONCEPT));
assert.equal(
  stepWeight("spells"),
  taskMaxTokens(AI_TASK.SPELL_FOCUS) + taskMaxTokens(AI_TASK.PC_SPELL_SELECTION)
);
assert.equal(stepWeight("match"), LOCAL_STEP_WEIGHT);
assert.ok(
  stepWeight("concept") > stepWeight("spells"),
  "concept writing must own more of the bar than spell selection"
);
assert.ok(
  stepWeight("member0") > stepWeight("concept"),
  "an encounter member covers the whole creature pipeline, not just the concept call"
);
assert.equal(stepWeight("member2"), stepWeight("member0"));

const creature = createProgress([
  ["concept", "Concept"],
  ["spells", "Spells"],
  ["match", "Match"]
]);
assert.equal(creature.percent, 0);
assert.equal(creature.steps[0].weight, stepWeight("concept"));

assert.equal(applyStep(creature.steps, "missing"), false);
assert.equal(creature.steps.every((s) => s.state === "pending"), true, "unknown keys must not mark steps done");

assert.equal(applyStep(creature.steps, "concept"), true);
assert.equal(creature.steps[0].state, "active");
assert.equal(creature.steps[1].state, "pending");

const start = progressPercent({
  steps: creature.steps,
  activeKey: "concept",
  streamFrac: 0.02,
  floor: 0
});
assert.ok(start >= 1 && start < 20, "the concept step should start near the left of the bar");

const mid = progressPercent({
  steps: creature.steps,
  activeKey: "concept",
  streamFrac: 0.5,
  floor: start
});
assert.ok(mid >= start, "stream ticks must not lower percent");
assert.ok(mid > start, "halfway through concept must advance the bar");

const skipped = progressPercent({
  steps: creature.steps,
  activeKey: "match",
  streamFrac: 0.02,
  floor: mid
});
assert.ok(skipped >= mid, "skipping to a later step must not rewind the bar");
assert.ok(skipped <= 99, "percent must stay inside the bar");

assert.equal(
  progressPercent({ steps: creature.steps, activeKey: "nope", streamFrac: 1, floor: 17 }),
  17,
  "an unknown active key keeps the floor"
);

const thinking = streamFraction({ phase: "thinking", tokens: 400, expectedTokens: 8000 });
const stillThinking = streamFraction({
  phase: "thinking", tokens: 200, expectedTokens: 8000, prior: thinking
});
assert.equal(stillThinking, thinking, "a lower thinking count must not shrink the step share");
const writing = streamFraction({
  phase: "writing", tokens: 1, expectedTokens: 8000, prior: thinking
});
assert.ok(writing >= thinking, "switching to writing must not jump backward");
const lateWrite = streamFraction({
  phase: "writing", tokens: 8000, expectedTokens: 8000, prior: writing
});
assert.ok(lateWrite <= 0.92, "streaming must leave a sliver until the step completes");
assert.ok(lateWrite > writing);

const stream = createProgress([["concept", "Concept"]]);
accumulateStreamTokens(stream, 100);
accumulateStreamTokens(stream, 250);
assert.equal(stream.peakTokens, 250);
accumulateStreamTokens(stream, 10);
assert.equal(stream.peakTokens, 260, "a token drop is a new call, not a rewind");
accumulateStreamTokens(stream, 40, { exact: true });
assert.equal(stream.peakTokens, 260, "late exact usage below the estimate must not shrink the peak");
accumulateStreamTokens(stream, 300, { exact: true });
assert.equal(stream.peakTokens, 300);
resetStreamCounters(stream);
assert.equal(stream.peakTokens, 0);
assert.equal(stream.streamFrac, 0);

applyStep(creature.steps, "spells");
const percents = [];
let floor = 0;
for (const tokens of [10, 80, 200, 80, 400]) {
  accumulateStreamTokens(creature, tokens);
  creature.streamFrac = streamFraction({
    phase: "writing",
    tokens: creature.peakTokens,
    expectedTokens: stepWeight("spells"),
    prior: creature.streamFrac
  });
  floor = progressPercent({
    steps: creature.steps,
    activeKey: "spells",
    streamFrac: creature.streamFrac,
    floor
  });
  percents.push(floor);
}
for (let i = 1; i < percents.length; i++) {
  assert.ok(percents[i] >= percents[i - 1], `monotonic stream: ${percents.join(",")}`);
}

console.log("progress.test.mjs: weighted monotonic progress assertions passed");
