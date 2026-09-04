# HANDOFF.md — live session baton

Read this first, then CLAUDE.md. Historical audit and QA evidence is preserved in HISTORY.md.

## Current session — 2026-09-04

- Public source is `origin/main` `a2bfa6f` (PR #91) / **v0.3.5.51** (progress #90 + coin currency #91). This session did not merge or release.
- Active branch: `cursor/t2-ui-polish-0918` — PR **#92**. Do not merge to `main`.
- T2 UI polish (Architect-approved): (3) Cancel aborts in-flight multi-call pipelines (not Foundry writes); (4) PC apply stays on the progress step card; (5) thinking vs writing phase + `prefers-reduced-motion`, no false 100%; (7) compact last-run token cost near the provider strip, `≈` kept when estimated.
- Local verification: `node --check` on touched `.mjs`; all **63** `scripts/*.test.mjs` pass (cancel vs timeout on the production request path, last-run totals, phase/abort classification, UI contracts).
- No VPS mutation. Live Foundry click-through still required for Cancel, PC apply chrome, phase motion, last-run line, and error visibility.

## Next step

Review PR #92 (do not merge to `main` from this agent). After publication, live-check Cancel on all generator modes plus Item Forge, Character apply chrome, and last-run cost after a real provider run.
