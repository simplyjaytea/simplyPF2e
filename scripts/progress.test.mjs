// Pure progress-bar math: weighted steps, monotonic percent, phase fill.
// Run: node scripts/progress.test.mjs
import assert from "node:assert/strict";
import { AI_TASK, taskMaxTokens } from "./ai-task-profiles.mjs";
import {
  LOCAL_STEP_WEIGHT,
  PHASE_FILL,
  applyStep,
  classifyRequestAbort,
  createProgress,
  progressPercent,
  progressPhaseClass,
  resetStreamPhase,
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
assert.equal(creature.phase, "local");
assert.equal(creature.steps[0].weight, stepWeight("concept"));
assert.equal(creature.streamFrac, 0);

assert.equal(progressPhaseClass("thinking"), "thinking");
assert.equal(progressPhaseClass("writing"), "writing");
assert.equal(progressPhaseClass("cancelling"), "cancelling");
assert.equal(progressPhaseClass("nope"), "local");
assert.equal(classifyRequestAbort({ userAborted: true, aborted: true }), "cancelled",
  "a user cancel must not be classified as a timeout");
assert.equal(classifyRequestAbort({ userAborted: false, aborted: true }), "timeout");
assert.equal(classifyRequestAbort({}), null);

assert.equal(applyStep(creature.steps, "missing"), false);
assert.equal(creature.steps.every((s) => s.state === "pending"), true, "unknown keys must not mark steps done");

assert.equal(applyStep(creature.steps, "concept"), true);
assert.equal(creature.steps[0].state, "active");
assert.equal(creature.steps[1].state, "pending");

const start = progressPercent({
  steps: creature.steps,
  activeKey: "concept",
  streamFrac: PHASE_FILL.start,
  floor: 0
});
assert.ok(start >= 1 && start < 20, "the concept step should start near the left of the bar");

const thinkingPct = progressPercent({
  steps: creature.steps,
  activeKey: "concept",
  streamFrac: PHASE_FILL.thinking,
  floor: start
});
const writingPct = progressPercent({
  steps: creature.steps,
  activeKey: "concept",
  streamFrac: PHASE_FILL.writing,
  floor: thinkingPct
});
assert.ok(thinkingPct >= start, "thinking must not lower percent");
assert.ok(writingPct > thinkingPct, "writing must advance past thinking");

const skipped = progressPercent({
  steps: creature.steps,
  activeKey: "match",
  streamFrac: PHASE_FILL.start,
  floor: writingPct
});
assert.ok(skipped >= writingPct, "skipping to a later step must not rewind the bar");
assert.ok(skipped <= 99, "percent must stay inside the bar");

assert.equal(
  progressPercent({ steps: creature.steps, activeKey: "nope", streamFrac: 1, floor: 17 }),
  17,
  "an unknown active key keeps the floor"
);

assert.equal(streamFraction({ phase: "thinking" }), PHASE_FILL.thinking);
assert.equal(
  streamFraction({ phase: "thinking", prior: PHASE_FILL.thinking }),
  PHASE_FILL.thinking,
  "more thinking tokens must not invent extra fill"
);
assert.equal(
  streamFraction({ phase: "writing", prior: PHASE_FILL.thinking }),
  PHASE_FILL.writing
);
assert.equal(
  streamFraction({ phase: "writing", prior: PHASE_FILL.writing }),
  PHASE_FILL.writing,
  "chars-vs-unknown-length must not keep advancing the bar"
);
assert.equal(
  streamFraction({ phase: "thinking", prior: PHASE_FILL.writing }),
  PHASE_FILL.writing,
  "a later thinking tick must not rewind writing fill"
);
assert.equal(streamFraction({ phase: "start" }), PHASE_FILL.start);

const stream = createProgress([["concept", "Concept"]]);
stream.streamFrac = streamFraction({ phase: "thinking", prior: stream.streamFrac });
stream.streamFrac = streamFraction({ phase: "writing", prior: stream.streamFrac });
assert.equal(stream.streamFrac, PHASE_FILL.writing);
resetStreamPhase(stream);
assert.equal(stream.streamFrac, 0);

applyStep(creature.steps, "spells");
const percents = [];
let floor = writingPct;
for (const phase of ["thinking", "writing", "writing", "thinking", "writing"]) {
  creature.streamFrac = streamFraction({ phase, prior: creature.streamFrac });
  floor = progressPercent({
    steps: creature.steps,
    activeKey: "spells",
    streamFrac: creature.streamFrac,
    floor
  });
  percents.push(floor);
}
for (let i = 1; i < percents.length; i++) {
  assert.ok(percents[i] >= percents[i - 1], `monotonic phase fill: ${percents.join(",")}`);
}

console.log("progress.test.mjs: weighted monotonic progress assertions passed");
