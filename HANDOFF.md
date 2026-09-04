# HANDOFF.md — live session baton

Read this first, then CLAUDE.md. Historical audit and QA evidence is preserved in HISTORY.md.

## Current session — 2026-09-04

- Public source is `origin/main` `a8761fa` (PR #89) / release **v0.3.5.49**. This session did not merge or release.
- Active branch: `cursor/smooth-progress-tokens-a379`.
- Feature: smoother, more accurate generation progress + clearer token estimates.
  - Percent is weighted from AI task budgets (concept owns more of the bar than a short selector) and monotonic. Intra-step fill is **phase-only** (thinking → writing); extra streamed chars do not invent % of an unknown final length. The existing sheen is the within-step motion while width holds. Unknown step keys no-op.
  - Live token copy matches the report: `≈` / coarsened estimates mid-stream; exact numbers only when provider `usage` arrives. Spell focus vs selection is a detail sub-label, not extra bar steps.
  - Token reports still prefer complete provider usage. Total-only blocks show the total without a fake split. Partial blocks and char-based fallbacks stay labeled estimated; displayed estimates are coarsened. Estimator is ~4 chars/token with a JSON punctuation bump — not a tokenizer.
  - AI parse / retry / fail-closed invariants are untouched.
- Local verification: `node --check` on touched `.mjs`; all 62 `scripts/*.test.mjs` pass, including new `progress.test.mjs` and `tokens.test.mjs`.
- No VPS mutation, no merge to `main`. Live Foundry QA still required: generate Monster/NPC/Character/Encounter and watch the bar (no backward jumps, concept should dominate, thinking→writing should advance once then hold with sheen; `≈` until provider usage; spell step sub-labels focus vs selection).

## Next step

Review the progress/token PR (do not merge to `main` from this agent). After publication, live-check the bar and token report. The feat prerequisite evaluator remains a later slice.
