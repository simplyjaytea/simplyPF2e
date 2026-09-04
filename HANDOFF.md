# HANDOFF.md — live session baton

Read this first, then CLAUDE.md. Historical audit and QA evidence is preserved in HISTORY.md.

## Current session — 2026-09-04

- Public source is `origin/main` `51c47a6` / PR #86; latest GitHub release **v0.3.5.46**. User-owned untracked `.claude/` remains untouched.
- Active branch: `cursor/fix-ai-json-parse-0e21`, created from `origin/main`.
- Live QA (JT) hit `SIMPLYPF2E.Errors.BadJson` during NPC Generate/Preview. Provider/model unknown. Mode-radio focus already works; module enabled.
- This session audited `requestJSON` / `requestCompletion` / `parseConceptJSON` and replaced first-`{` + last-`}` extraction with string-aware matching braces. Length truncation (`length` and `max_tokens`) still fails closed before parse. Reasoning-channel JSON is still rejected; empty content with reasoning now uses a distinct error plus truncated console diagnostics (length, finish_reason, preview). Bounded retry prompt/logging verified. `response_format: json_object` is still sent unless a named 400/422 compatibility retry removes it.
- Not done: live Foundry retest of NPC Generate/Preview with the original provider; feat-prerequisite evaluator; merge/release.

## Live-QA boundary

Local `scripts/*.test.mjs` cover parse recovery and mocked provider retries. They cannot prove a live NPC concept call against JT's provider. After merge/release, rerun NPC Generate and Preview Plan once and confirm either a parsed concept or a non-BadJson error that matches the real failure mode (Truncated / ReasoningWithoutJson / BadStructure / provider error).
