# HANDOFF.md — live session baton

Read this first, then CLAUDE.md. Historical audit and QA evidence is preserved in HISTORY.md.

## Current session — 2026-09-04

- Public source is `origin/main` `37d60b4` (PR #88) / release **v0.3.5.48**. This session did not merge or release.
- Active branch: `cursor/unify-generator-dice-c13e`, created from that main tip.
- Feature: one dice/random control on Monster, NPC, Encounter, and Character. Placement and styling are the existing `spf-random-button` in `spf-generate-row`. Dice ignores the typed prompt, rolls `randomBrief(mode)`, and runs `#runGeneration(true, { create: false })` — the same preview path as Preview Plan. Character uses a person-oriented adventurer brief; other modes keep the creature type × role × place × twist sentence. Encounter's extra `generateRandomEncounter` action is gone.
- Tooltips are i18n keys (`RandomTooltip` / `RandomNpcTooltip` / `RandomEncounterTooltip` / `RandomCharacterTooltip`) via `randomTooltipKey`. No AI/number/schema changes; Advanced controls are not randomized.
- No VPS mutation, no merge to `main`. Live Foundry QA still required: click dice in all four modes, confirm the typed prompt is ignored, Character does not receive a monster brief, and Generate/Preview Plan are unchanged.

## Next step

Review the dice-unify PR (do not merge to `main` from this agent). After publication, live-check all four dice buttons. The feat prerequisite evaluator remains a later slice.
