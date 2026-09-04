# HANDOFF.md — live session baton

Read this first, then CLAUDE.md. Historical audit and QA evidence is preserved in HISTORY.md.

## Current session — 2026-09-04

- Public source is `origin/main` `a8761fa` (PR #89) / release **v0.3.5.49**. This session did not merge or release.
- Active branch: `cursor/smooth-progress-tokens-a379`.
- Feature: smoother, more accurate generation progress + clearer token estimates.
  - Percent is weighted from AI task budgets (concept owns more of the bar than a short selector), monotonic (`floor` + peak stream tokens), and updated in place so `.spf-progress-fill` CSS width transitions actually run. Unknown step keys no-op.
  - Stream ticks (thinking/writing) map into the active step’s share; a token drop is treated as a new call, not a rewind. Late provider `usage` on the SSE stream emits one `exact` tick — the bar never shrinks if the estimate was high; the detail line drops the `~`.
  - Token reports still prefer complete provider usage. Total-only blocks show the total without a fake split. Partial blocks and char-based fallbacks stay labeled estimated; displayed estimates are coarsened. Estimator is ~4 chars/token with a JSON punctuation bump — not a tokenizer.
  - AI parse / retry / fail-closed invariants are untouched.
- Local verification: `node --check` on touched `.mjs`; all 62 `scripts/*.test.mjs` pass, including new `progress.test.mjs` and `tokens.test.mjs`.
- No VPS mutation, no merge to `main`. Live Foundry QA still required: generate Monster/NPC/Character/Encounter and watch the bar (no backward jumps, concept should dominate, stream should ease within a step) and a provider that omits `usage` plus one that sends usage on the last SSE chunk.

## Next step

Review the progress/token PR (do not merge to `main` from this agent). After publication, live-check the bar and token report. The feat prerequisite evaluator remains a later slice.
