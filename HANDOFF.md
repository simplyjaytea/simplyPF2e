# HANDOFF.md — live session baton

Read this first, then CLAUDE.md. Historical audit and QA evidence is preserved in HISTORY.md.

## Current session — 2026-09-04

- Public source is `origin/main` `cedbd9e` (PR #90) / release **v0.3.5.49**. This session did not merge or release.
- Active branch: `cursor/loot-coins-currency-a3ef` (PR #91), rebased onto that tip after Sentinel reported CONFLICTING / behind main.
- Bug: generated gold coins showed as custom treasure. Cause: production `exactContent: true` skipped `findEntry` for module-built coin lines (no AI candidate), so `buildLootItems` fell through to `customTreasureItem` without `system.category === "coin"`. PF2e 8.4.1 `TreasurePF2e#isCoinage` is `system.category === "coin"` (not master's `stackGroup === "coins"`).
- Fix: `resolveLoot` always loads published coinage, preferring the same `pf2e.equipment-srd` IDs `ActorInventory.addCurrency` uses (`JuNPeK5Qm1w6wpb4` / `B6B7tBWJSqOBz5zz` / `5Ew82vBF9YfaiY9f` / `lzJ8AVhRcbFul5fh`), then an exact-name treasure fallback. `buildLootItems` clones that document and never custom-treasures a coin line. Missing coinage docs warn and drop. `applyTreasureBudget` padding keeps the official Gold Pieces entry. Shared by NPC loot and PC starting wealth.
- Rejected: post-create `inventory.addCoins` / `addCurrency`. Cloning those same documents at build time is what addCurrency does, and it stays inside the existing Actor.create / createEmbeddedDocuments transaction and post-create expectedItems check. Lexicon already approved those hunks; do not invent coin schema.
- Local verification after rebase: `node --check` on touched `.mjs`; all **63** `scripts/*.test.mjs` pass (including `builder.coins.test.mjs` plus #90's progress/token tests). Live Foundry QA still required: generate NPC loot and a PC with coin starting wealth and confirm sheet currency, not a custom treasure line.

## Next step

Review PR #91 (do not merge to `main` from this agent). After publication, live-check NPC loot coins and PC starting-wealth coins on the VPS. The feat prerequisite evaluator remains a later slice.
