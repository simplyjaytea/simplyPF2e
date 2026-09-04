# HANDOFF.md — live session baton

Read this first, then CLAUDE.md. Historical audit and QA evidence is preserved in HISTORY.md.

## Current session — 2026-09-05

- Public source is `origin/main` `220741b` (PR **#96**) / **v0.3.5.56**. The single audit-fix PR merged and its auto-release completed successfully.
- Active branch: `codex/audit-fixes`. Its reviewed code commit `0b9e38b` is merged; any later commit on this branch is documentation-only session state and must not be merged merely to update the baton.
- Completed audit fixes on this branch:
  1. Cancellation is owned by each `SpfApp` run. `_beginProgress()` returns its run signal, and all generation/forge provider calls carry that signal through `requestJSON`/`requestCompletion`; the old module-global signal setter is removed. Connection and model probes remain independent.
  2. Prewritten generated macro commands include a fixed runtime HTML escape helper. Acting, target, and healing actor names are escaped immediately before chat content or roll flavor; pre-escaped item/effect/duration values remain unchanged.
  3. Runed-item assembly now returns source data plus transient `{ priceGp, level }` preview data. `Item.create()` preserves cloned base `system.price` and `system.level`; PF2e preparation derives runed totals, which the module does not overwrite. The catalog excludes PF2e-specific weapons/armor, so this ordinary-base preview contract is not offered an incompatible specific item.
  4. The reusable release workflow now validates `module.json` and `lang/en.json` with `jq empty` before syntax/regression gates, covering auto-release, tags, and manual runs.
- New regressions cover two concurrent cancellation signals, hostile runtime actor names in chat/flavor, and preserved runed base source fields with correct preview estimates.
- Local verification passed: all **65** `scripts/*.test.mjs`, syntax checks for all **100** `scripts/*.mjs`, `jq empty module.json lang/en.json`, and `git diff --check`. A fresh Sol/High review returned `ship` with no findings; PR #96 checks and Auto Release run `33896508187` passed, including the new release JSON gate, and published both assets. No Foundry/VPS mutation or live QA occurred. The untracked `.claude/` directory is user-owned and untouched.

## Next step

Live Foundry QA is next: run Generator and Item Forge concurrently and verify each Cancel affects only its own request; execute macro chat/fallback paths with harmless HTML-like actor names; and forge a runed weapon plus armor to compare preview price/level with the prepared sheets. Also note the non-blocking GitHub annotation that `actions/checkout@v4` and `actions/setup-node@v4` still target deprecated Node 20 internally and were forced onto Node 24 by the runner.
