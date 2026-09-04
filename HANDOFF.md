# HANDOFF.md — live session baton

Read this first, then CLAUDE.md. Historical audit and QA evidence is preserved in HISTORY.md.

## Current session — 2026-09-05

- Public source is `origin/main` `eb779209` / **v0.3.5.55**. This session did not merge or release.
- Active branch: `codex/audit-fixes`, based on that public main. Do not merge directly to `main`.
- Completed audit fixes on this branch:
  1. Cancellation is owned by each `SpfApp` run. `_beginProgress()` returns its run signal, and all generation/forge provider calls carry that signal through `requestJSON`/`requestCompletion`; the old module-global signal setter is removed. Connection and model probes remain independent.
  2. Prewritten generated macro commands include a fixed runtime HTML escape helper. Acting, target, and healing actor names are escaped immediately before chat content or roll flavor; pre-escaped item/effect/duration values remain unchanged.
  3. Runed-item assembly now returns source data plus transient `{ priceGp, level }` preview data. `Item.create()` preserves cloned base `system.price` and `system.level`; PF2e preparation derives runed totals, which the module does not overwrite. The catalog excludes PF2e-specific weapons/armor, so this ordinary-base preview contract is not offered an incompatible specific item.
  4. The reusable release workflow now validates `module.json` and `lang/en.json` with `jq empty` before syntax/regression gates, covering auto-release, tags, and manual runs.
- New regressions cover two concurrent cancellation signals, hostile runtime actor names in chat/flavor, and preserved runed base source fields with correct preview estimates.
- Local verification passed: all **65** `scripts/*.test.mjs`, syntax checks for all **100** `scripts/*.mjs`, `jq empty module.json lang/en.json`, and `git diff --check`. No Foundry/VPS mutation, live QA, PR, merge, tag, or release occurred. The untracked `.claude/` directory is user-owned and untouched.

## Next step

Inspect every owned diff, then obtain an independent schema/balance review. After that, create one PR from `codex/audit-fixes`; only after merge can the release workflow run. Live Foundry QA is still required for concurrent Generator/Item Forge cancellation, macro cards with hostile actor names, and runed weapon/armor creation plus derived price/level display.
