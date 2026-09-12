# HANDOFF.md — live session baton

Read this first, then CLAUDE.md. Use the [documentation map](docs/README.md) for source records and historical evidence.

## Current work — 2026-09-12 repository organization and optimization

- User explicitly authorized **review, organize, optimize, push, and merge**. Branch `codex/repo-optimization` includes the existing .70 post-release QA/readiness documentation and focused cache/verification maintenance. Base runtime is public `origin/main` `d17a2b5` / **v0.3.5.70**.
- Shared async cache coalesces pending per-pack loads and evicts failed loads. Equipment and rule-source indexes retain successful results keyed by actual pack identity. Derived equipment, rule-exemplar, pricing, usage, and fundamental-rune views use current source selection; transient fallback values no longer become permanent aggregate results. Eligibility rules, schema fields, source identities and numeric formulas are preserved.
- `node tools/check.mjs` now owns local/PR/auto-release/reusable-release syntax, regression and JSON checks. Tooling/fixtures remain outside the archive. Documentation has an index; the long historical artifact list moved intact to [live QA inventory](docs/live-qa-inventory.md).
- Final Node22.23.2 gate passed **92 regression files, 129 script syntax checks plus one tooling syntax check**, JSON and whitespace. Four new regression files cover shared-cache semantics and 14 production cases that failed before their respective fixes. Independent `optimization_review` approved both cache/source changes and the downstream pricing/usage/rune follow-up with no blockers. Isolated verification-runner failure probes passed; details are in [maintenance evidence](docs/repository-maintenance-2026-09-12.md).
- Exact next step: commit, push, create a PR, verify CI, merge through GitHub, then verify the one automatic release and packaged source bytes. Do not write main directly. No further permission is needed for this explicitly authorized publication route.

## Last recorded installed state and native follow-up

- **SimplyPF2e0.3.5.70**, Foundry **14.365**, PF2e **8.5.0**, 77 ready packs in the existing `test` world. PR110/CI34257060796/release34257313518 and its bounded installation/QA are complete. No fresh Foundry access, provider call, module update or world mutation occurred in the current maintenance session.
- Native follow-up for this diff: switch equipment sources after warming Forge/rune lookups and confirm subsequent plans use the new source prices, usage choices and rune tiers; exercise overlapping Generator/Forge catalog loads. Node tests establish call sharing and failure recovery, not Foundry rendering or live latency.
- Earlier readiness limits remain: requested-PC fidelity, successful Rogue/racket acceptance, broader supported-PC levels, multi-member encounters, nested kits, duplicate-copy activations, NPC target-save/combat-turn/condition application, focus spells and screen-reader behavior. See [readiness assessment](docs/ship-readiness-2026-09-12.md).
- Same-object pack edits and successful source-discovery lists retain their session cache lifetime; reload after editing compendium contents. This change follows source *selection* and actual pack replacement, not automatic editing invalidation.
- Preserve all actors/items/macros/tokens/chat in [live QA inventory](docs/live-qa-inventory.md). No QA cleanup, provider spending or module/core/system update is part of this maintenance request.

## Environment

- Node22: `/home/jtf/.local/share/mise/installs/node/22.23.2/bin/node`. `gh` hangs; use public API reads and connected GitHub write tools/git push. Repo identity is jt / jt_f@ymail.com.
- Browser interaction uses CUA. Last recorded world URL is `https://foundry-test.gigaserver.xyz/game`; browser/tab availability and login must be rechecked. Earlier viewport overrides were reset. Preserve provider settings/credentials; do not expose them.
- Ignored local `module.zip` is an old verification artifact, not the current official release. Never install it. Preserve user-owned `.claude/` and branches with unique work.
