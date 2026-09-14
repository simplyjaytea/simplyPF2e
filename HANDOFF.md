# HANDOFF.md — live session baton

Read this first, then CLAUDE.md. Use the [documentation map](docs/README.md) for source records and historical evidence.

## Current work — 2026-09-15 completion planning

- User requested a plan to complete the outstanding list and delegate suitable tasks to **Luna** to conserve usage. The full ordered plan, owners, dependencies and acceptance gates are in [completion plan](docs/completion-plan-2026-09-15.md). A read-only Luna roadmap pass is incorporated.
- Planning branch: `codex/completion-plan`, based on main `019d17b67c96bc06831fe56a4cfe8784fee90762`. **PR #111 has merged and v0.3.5.71 is published** with both assets. The old instruction to publish `codex/repo-optimization` is superseded. .71 archive byte comparison and installation/native acceptance are not established by this planning session.
- Sequence: reconcile .71/cache acceptance; authoritative PC identity; Rogue and supported-PC acceptance; remaining native/accessibility checks; chat command; reskin; elite/weak; level shifting; editable PC preview; multiclass/Free Archetype. Keep optional broader casting/rune/resource limitations explicit.
- Exact next step when implementation begins: parent defines the authoritative PC input/selection contract; Luna verifies .71 assets and prepares bounded regression cases. Dispatch Luna implementation only after the contract and file ownership are concrete. Stronger models own unresolved architecture and independent schema/balance review.
- This session changes documentation only. No provider calls, Foundry access, world mutation, module/core/system update, or GitHub publication. Keep the planning commit local; merging documentation alone would publish a release. Confirm the concrete native QA/provider budget and implementation publication scope when those actions become relevant.
- Planning-session validation: Node22.23.2 passed all 92 regression files, 129 script/one tooling syntax checks, JSON and whitespace. No runtime files changed.
- Previous maintenance proof: Node22.23.2 passed 92 regression files, 129 script syntax checks plus one tooling check, JSON and whitespace; independent `optimization_review` approved the cache/source/pricing changes. See [maintenance evidence](docs/repository-maintenance-2026-09-12.md). Native cache acceptance remains below.

## Last recorded installed state and native follow-up

- **SimplyPF2e0.3.5.70**, Foundry **14.365**, PF2e **8.5.0**, 77 ready packs in the existing `test` world. PR110/CI34257060796/release34257313518 and its bounded installation/QA are complete. No fresh Foundry access, provider call, module update or world mutation occurred in this planning session.
- Native follow-up for the .71 cache diff: switch equipment sources after warming Forge/rune lookups and confirm subsequent plans use the new source prices, usage choices and rune tiers; exercise overlapping Generator/Forge catalog loads. Node tests establish call sharing and failure recovery, not Foundry rendering or live latency.
- Earlier readiness limits remain: requested-PC fidelity, successful Rogue/racket acceptance, broader supported-PC levels, multi-member encounters, nested kits, duplicate-copy activations, NPC target-save/combat-turn/condition application, focus spells and screen-reader behavior. See [readiness assessment](docs/ship-readiness-2026-09-12.md).
- Same-object pack edits and successful source-discovery lists retain their session cache lifetime; reload after editing compendium contents. This change follows source *selection* and actual pack replacement, not automatic editing invalidation.
- Preserve all actors/items/macros/tokens/chat in [live QA inventory](docs/live-qa-inventory.md). No QA cleanup, provider spending or module/core/system update is part of this planning request.

## Environment

- Node22: `/home/jtf/.local/share/mise/installs/node/22.23.2/bin/node`. `gh` hangs; use public API reads and connected GitHub write tools/git push. Repo identity is jt / jt_f@ymail.com.
- Browser interaction uses CUA. Last recorded world URL is `https://foundry-test.gigaserver.xyz/game`; browser/tab availability and login must be rechecked. Earlier viewport overrides were reset. Preserve provider settings/credentials; do not expose them.
- Ignored local `module.zip` is an old verification artifact, not the current official release. Never install it. Preserve user-owned `.claude/` and branches with unique work.
