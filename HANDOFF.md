# HANDOFF.md — live session baton

Read this first, then CLAUDE.md. Historical audit and QA evidence is preserved in HISTORY.md.

## Current session — 2026-09-04

- Public source is `origin/main` `e969e435` (PR #93) / **v0.3.5.53**. This session did not merge or release.
- Active branch: `cursor/feat-prereq-staged-43e3`. Do not merge to `main`.
- Shipped on this branch:
  1. Fail-closed ordinary feat prerequisite evaluator (`scripts/pc-prerequisites.mjs`) against a staged ABC/grant/skill snapshot. Cites PF2e 8.4.1 `FeatSystemSchema.prerequisites.value` as display text (`src/module/item/feat/data.ts`); `FeatPF2e.embedHTMLString` joins the strings and `_onCreate` does not evaluate them. ABC grants come from `system.items` `{ uuid, img, name, level }` (`src/module/item/abc/data.ts`).
  2. Complete-only catalogs pass that snapshot into `getFeatCandidates` instead of the empty-array-only gate. `requireNoPrerequisites` without a context remains empty-array. NPC/legacy callers stay permissive. Empty feat entitlements still block the completion manifest.
  3. `COMPLETE_PC_CLASS_SLUGS` is now `fighter`, `rogue`, `investigator`. Wizard still excluded (spellbook/curriculum). Free Archetype level-2+ preflight refusal remains.
  4. GM-facing README refresh (lead/install/setup/modes/status/what's new). No HANDOFF dump, no v0.3.5.43 recoverability prose.
- Local verification: `node --check` on touched `.mjs`; all **63** `scripts/*.test.mjs` pass (evaluator cases live in `pc-prerequisites.test.mjs`; class registry in `pc-support.test.mjs`).
- No VPS mutation. Live Foundry Rogue/Investigator grant-chain QA is still required. Item forge remains unverified.

## Next step

Independent schema review of this PR (Lexicon: cite 8.4.1 feat/abc prerequisite and grant field shapes; Sentinel: fail-closed boundaries, Rogue/Investigator widening, README truth). Do not merge to `main` from this agent. After publication, live-check a Rogue (Racket) and Investigator (Methodology) complete-only create, including class-path grants and feat-prerequisite filtering on the sheet. Parked after that: Free Archetype graph, Wizard spellbook/curriculum. Custom-provider/Tailnet harden stays cancelled.
