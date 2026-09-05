# HANDOFF.md — live session baton

Read this first, then CLAUDE.md. Release/review history belongs in HISTORY.md; detailed audit evidence is in [docs/audit-2026-09-05.md](docs/audit-2026-09-05.md).

## Current session — 2026-09-05 Item Forge and generator audit

- Branch: `codex/forge-generator-audit`, based on clean `b043a51` (PR #103). GitHub's public API confirms **v0.3.5.63**; main was still `b043a51` at the final read. The previous cleanup/publication task is complete. This audit's fixes are **local, unpublished, and not installed**.
- Fixed forge UI clipping; overlapping generation and final cancellation; committed item/actor retry boundaries; AI numeric forge mechanics; restricted/unsupported passive catalogs; charge persistence/copy selection/click guards; shared macro deletion and owner-local rest. Fixed creature loot reroll atomicity/exact grounding, original-brief fidelity, empty-loot preservation, ammo/quantities/unit pricing, vanished-source preflight, encounter budgets, and duplicate Perception. Fixed PC worn gear, native feat schedules/earned-level prerequisites, and restricted Investigator skill-slot proof.
- Final parent verification on **Node 22.23.2** passed **82 regression files**, **117 script syntax checks**, module/localization JSON (2), and whitespace checks. Full log is local `.git/audit-node22.log`. Existing test regressions were extended and 13 new regression files added. No runtime dependency was added to the project.
- Independent reviewer `independent_audit_review` inspected the final diff and source evidence, ran all 82 regressions, and approved with **no remaining actionable findings**. Review-found catalog/investment/PC-cancellation issues were fixed and rechecked. No review remains in flight.
- Actual forge template/CSS rendered with native Foundry CSS fits at **360, 480, and 720px** with no horizontal overflow. This is browser layout evidence, not an installed revised ApplicationV2 acceptance run.
- Prepared PR text is local `.git/forge-generator-audit-pr.md`. The user explicitly authorized **push and merge** of the reviewed audit. Publish through a PR after its required checks pass and verify the automatic release; do not push main directly. Code is committed as `1ee5b5b`; no revised-code installation or live acceptance has occurred.

## Live QA performed — installed baseline only

- Verified installed **SimplyPF2e 0.3.5.63**, Foundry **14.365**, PF2e **8.5.0**, existing GM session at `https://foundry-test.gigaserver.xyz/game`. No module/core/system update performed.
- Directory Forge row, singleton reopening, exclusive kind selection and prompt/level/rarity retention passed. Live tile overflow reproduced and fixed locally.
- Generated/created Ghost Touch longsword: preview/native **level 4, 110 gp**. Slick chain shirt: preview/native **level 5, 205 gp**, passive-only description. NPC Dock Watchman: one-click completion and native sheet, **level 2, AC17, HP30/30**, no spells with Allow spellcasting disabled.
- NPC had duplicate Perception and two leather armors; duplicate Perception is fixed locally. Duplicate gear is a prompt-fidelity observation, not proof of the new fidelity fix. Original constraints now reach refinements; deliberate spare gear is preserved.
- Total displayed provider usage **32,172 tokens** (3,242 weapon + 1,909 armor + 27,021 NPC). Existing `omniroute / auto/best-free` connection used; no keys/settings changed. No captured SimplyPF2e error logs in the browser's checked buffer.

## Preserve QA artifacts

Preserve every earlier actor/item/macro/token listed in prior HISTORY: `QA <b>Actor</b>`, `QA Caster`, both Clockwork Moth Scouts, earlier forged items/macros, and chat evidence. No earlier QA artifact was deleted or changed.

New this session (created, then named through their sheets):

- `Item.4zojkUhnP0mA7hWm` — **QA Audit — Ghost Touch Longsword**.
- `Item.OcXYMsSWCyKluKdn` — **QA Audit — Slick Chain Shirt**.
- `Actor.VsI4lYxCL0DbvVRq` — **QA Audit — Dock Watchman**.

No new macros or tokens were created. GM character assignment and targets were preserved. Browser ends on Items directory; temporary QA viewport is reset. No reliance on old BrowserOS page17 state.

## Exact next step

Complete the authorized branch push and PR merge after CI, then verify the automatic release. Revised-code live QA remains outstanding after updating **only SimplyPF2e** in the test world: all three forge kinds; new companion activation/rest/multiple-copy cases; cancellation and failure boundaries; NPC/monster/encounter creation; no-gear/no-loot requests; Fighter/Rogue/Investigator native first-level/accelerated feat placement, grant chains, ammo and worn gear. Record CI/release/version and live results; preserve all QA artifacts.

## Material limits

- Old companions save command snapshots. A module update fixes global rest/cleanup hooks but **does not rewrite old macro commands or forged mechanics**. Test new companions; do not silently migrate old macros.
- Charge locking covers one client. Foundry updates do not offer atomic cross-client compare-and-swap.
- Passive source screening is conservative (including detected prose restrictions), not a full rule-interaction/balance proof. Activation dice/DCs remain module-defined GM Core defaults, not published magic-item balance. Condition durations need manual adjudication.
- Investigator restricted odd-level feats require explicit proven mental-skill/Lore rank prerequisites; generic or unmodeled methodology exceptions remain excluded. Complete-only classes remain Fighter/Rogue/Investigator. Level2+ Free Archetype stays gated.
- Existing known gaps remain: rune prerequisites/exclusivity, material-constrained armor runes, shield/ammo forging, broader focus/casting/loadout acceptance, local-provider actor flow, and unsupported classes. See CLAUDE.md and audit report.
