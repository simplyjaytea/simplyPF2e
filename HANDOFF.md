# HANDOFF.md — live session baton

Read this first, then CLAUDE.md. Historical audit and QA evidence is preserved in HISTORY.md.

## Current session — 2026-08-31

- Public source is `origin/main` `1527282` / release **v0.3.5.45** (PR #85). User-owned untracked `.claude/` remains untouched.
- Active branch: `codex/fix-generator-selection-completeness`, created from `origin/main`.
- Live reproduction on the VPS found two remaining bugs. Switching from NPC to Encounters correctly checked Encounters, but Foundry's re-render focused the first hidden radio and gave Monster a misleading second focus outline. A failed level-7 NPC generation reported every feat and carried-equipment line unresolved even though Compendium Content showed 77 enabled packs.
- Fixes/evidence boundary: `generator-app.mjs` now restores focus to the checked mode after the render. Live logs did not capture raw selector payloads; code tracing separately found and reproduced a shared decoder defect when a provider returns an exact offered name in the JSON `id` field. `ai.mjs` now accepts that exact, unique issued-catalog name, including the already-authorized fundamental-rune prefix over an exact offered base item. It still rejects fuzzy names, ambiguous names, fabricated references, invented rune bases, and entries outside the issued catalog. Post-release QA must confirm this matches the real provider response.
- Production-path regressions cover name-in-`id` feat/equipment replies and post-render radio focus. All 59 `scripts/*.test.mjs` files pass, every touched `.mjs` passes `node --check`, and `git diff --check` passes.
- No push, PR, merge, release, or VPS mutation has been performed. A fresh Sol/High review returned `ship` after the evidence wording was corrected; its broader sandbox made read-only discipline procedural, and before/after diff hashes confirmed no mutation. Required next step: commit/publish through branch + PR only if the user authorizes GitHub writes. After release, live-check one NPC/Monster plan with feats and equipment and switch through all four modes.
- Separate preserved work: `codex/release-json-validation-main` at `47f09e9` remains unpushed and must stay in its own PR.

## Live-QA boundary

The in-app browser reproduced the current release behavior without generating a new actor or changing VPS files. Local tests cannot prove the patched focus behavior or real provider/compendium flow inside Foundry; both need the post-release checks above.
