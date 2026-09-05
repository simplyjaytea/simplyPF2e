# HANDOFF.md — live session baton

Read this first, then CLAUDE.md. Keep only current work and unresolved acceptance here; release/review history belongs in HISTORY.md.

## Current session — 2026-09-05 repository cleanup

- Branch: `codex/repo-cleanup`, based on fetched `origin/main` `7f8558e` (PR #102). GitHub's public API confirms release **v0.3.5.62** and both module assets. The earlier Item Forge publication task is complete; its post-update live QA remains unrecorded.
- The checkout initially had a stale local `main` at `62fb942`. Created this cleanup branch directly from the current remote. The user-owned `.claude/` directory remains untouched; new ignore rules exclude it, OS metadata, and the two release build outputs.
- Cleanup: shared HTML escaping now always escapes all five HTML-sensitive characters without a Foundry dependency, including quotes in preset attributes; the preset dialogs use that shared helper. Removed two unused CSS blocks. Reconciled the project brief and README with shipped behavior and replaced the accumulated handoff with this current baton. Historical detail remains in HISTORY.md and git.
- New direct-production escaping regression reproduced the original failure and passes after the fix. Baseline: all 68 regression files passed before edits. Final checks passed all **69 regression files**, **104 script syntax checks**, module/localization JSON parsing, and `git diff --check` on local Node **26.7.0** (CI targets Node 22). Independent reviewer `cleanup_final_review` approved with no correctness findings after inspecting the final diff and exercising text, macro, UI-layout, and actual preset-dialog paths with test stubs. Removed the obsolete macro-test escaping stub at the reviewer's suggestion and reran that regression/syntax check.
- The user has now explicitly authorized pushing/merging the cleanup and cleaning up branches. Publication is proceeding through a PR with CI and automatic-release verification. Remove only merged branches and clean, unused merged worktrees; preserve unique commits, dirty worktrees, main, release tags, and QA artifacts. No provider request, module update, or Foundry/world mutation is part of this continuation.

## Outstanding live acceptance

- Last recorded installed module: **v0.3.5.60**, Foundry **14.365** / PF2e **8.5.0**. Do not assume the public v0.3.5.62 release is already installed. The earlier user request for a module-only update and forge UI QA is preserved as pending work, not a completed action.
- **Forge UI refresh (#102):** confirm the directory row sits below native controls; repeated renders/clicks produce one button/window; Wondrous/Weapon/Armor selection is exclusive; prompt/level/rarity survive switching; narrow resizable windows remain usable. This UI acceptance needs no provider request or item creation.
- **Cleanup:** confirm preset create/edit/delete dialogs display names containing quotes, angle brackets, and ampersands literally. Local escaping tests cover the boundary; actual Foundry dialog rendering has not run here.
- **Previous coverage limits:** full Rogue/Investigator grant chains; native skill completion, current HP, languages, loadout/runes; focus spells; broader Item Forge passive/activation paths; a complete local-provider actor flow; and an omission-bearing provider/UI creature-feat run. Complete-only PC support stays Fighter/Rogue/Investigator; Wizard and level-2+ Free Archetype remain gated. See CLAUDE.md known gaps.
- **Recorded accepted paths:** v0.3.5.56 cancellation isolation, runed weapon/armor preview-sheet parity, healing/condition macro escaping; v0.3.5.60 courier preview with 19/19 matches and correct scroll label. Its separate direct selector returned `feats: []`, `omitted: true`; the preview itself did not request that selector, so it is not full omission-bearing UI evidence.
- Extra spells/gear despite a minimal prompt and armor prose mentioning activation remain uninvestigated fidelity observations. Earlier raw feat-failure responses are unavailable; do not claim their exact causes were proven.

## Preserve existing QA artifacts

The last recorded world has 19 actors, 5 world items, and 5 macros; BrowserOS page 17 retained the courier preview (page/session availability must be rechecked). Preserve `QA <b>Actor</b>`, `QA Caster`, their tokens, the two `Clockwork Moth Scout` actors, forged items/companion macros, `QA Open Item Forge`, `QA Prepare Markup Actor`, and chat evidence. Prior QA restored GM assignment and targets. Do not delete these artifacts without explicit approval. Prior programmatic targeting logged a Foundry/PF2e `_drawTargetArrows` error; it was not traced to SimplyPF2e.

## Next step

Push `codex/repo-cleanup`, open its PR, verify CI, merge through GitHub, and confirm the single automatic release. Then fast-forward local main and remove safely merged branches/worktrees. Git and GitHub are authoritative for final publication state; the local cleanup inventory/results are recorded under `.git/repo-cleanup-report.json` so recording branch deletions does not trigger a documentation-only release. Recheck installed state before any later forge UI acceptance; preserve existing QA artifacts.
