# Completion proposal — 2026-10-17

Status: proposed, awaiting user direction. This updates the execution order in the September 15 completion plan; its detailed acceptance criteria remain applicable. Planning does not begin implementation, publication, installation or paid generation.

## Baseline and outcome

PR #113 is merged at feeeec605bfb23077cc210bcbd718467d5375807 and v0.3.5.73 is published, confirmed through git and public GitHub reads on October 17. Required PC identity and the Guard Lore follow-up are implemented. Last recorded installation is .72; .73 asset parity, installation and native Guard Lore acceptance are unverified.

Deliver two milestones: (A) the currently supported product has completed its acceptance matrix, and (B) every agreed roadmap feature is implemented and accepted within an explicit supported scope. Broader caster coverage, universal NPC ability compatibility, shield/ammunition runes and universal rune exclusivity remain separate limitations unless a selected feature requires a specifically tracked prerequisite.

## Phase 1 — Establish the current baseline and finish PC acceptance

1. Verify .73 release assets against the merge, run the Node 22 repository gate, and reconcile stale README/current-state/completion-plan wording.
2. Prepare exact native cases before requesting a QA batch. Record intended world, module-only update, provider/model, run ceiling, token/cost budget and stop conditions. Do not assume the previous two-generation allowance remains available.
3. Within the authorized QA window, inspect actual installed versions and update only the module if necessary. Preserve the existing world, provider settings and QA artifacts.
4. First batch proposal: at most two level-1 Guard/Thief generations, one Legal Lore and one Warfare Lore, stopping at the first unexplained failure. Check exact identity, concrete trained Lore, grants, skills, full HP and loadout. This is a run ceiling, not an assumed token allowance; agree the spending ceiling before execution. A single completed run previously used 26,839 reported tokens, which is evidence rather than a forecast.
5. After that batch passes, use a separately bounded batch for higher-level Rogue plus Fighter and Investigator at source-verified feat/skill progression boundaries. Reuse generated actors for related inventory and accessibility checks where suitable.
6. Verify source-switch cache invalidation and overlapping Generator/Forge loads in the same QA window. Use read-only instrumentation to prove coalescing; ordinary UI observations alone cannot establish it. Restore changed source settings.

Exit: current release/install evidence is recorded, both Guard Lore choices have native evidence, representative supported-PC progression passes, and cache acceptance is complete. A failed case produces a reproducible fix and focused rerun; unsupported mechanics remain explicitly gated.

## Phase 2 — Close current-feature live acceptance

Execute the existing completion plan's matrix in small batches, reusing preserved artifacts where safe:

- NPC combat: target saves, incapacitation, condition application and turn use for the supported Stunning Blows/Flurry package.
- Encounters: at least two members, composition/XP/loot and independent item/spell links; controlled failure rolls back only the new documents from that attempt.
- Inventory: nested kit quantities, physical contents and container links.
- Item Forge: duplicate copies, intended-copy selection, charges, damage/self-buff activations, depletion, recharge and missing-context behavior. Record the existing cross-client atomicity limitation.
- Focus: supported NPC casting/DC/resource behavior; exercise a supported PC grant path if available. If none exists, explicitly defer that PC acceptance row pending a verified class/grant expansion rather than reporting a pass.
- Accessibility: keyboard, focus return, labels/errors, progress, reduced motion and a real screen-reader session.
- Compatibility: supported installed target plus a smoke test on the declared PF2e minimum in a separate compatible world. Lack of that world leaves an explicit open acceptance row.

Exit / milestone A: all applicable current-feature acceptance rows pass with versioned evidence; any explicitly agreed deferrals appear in the supported-scope statement. A tracked failure alone does not count as completion. Publish a concise readiness report and accurate user-facing limits.

## Phase 3 — Deliver the bounded creature tools

Implement in three reviewable slices:

1. Chat command `/forge swamp hag 6` through the existing guarded generator lifecycle. Validate syntax/levels, preserve unrelated chat and verify access, cancellation and duplicate-run behavior.
2. Cosmetic reskinning: select an exact creature source, preview allowed text/art changes, create a new actor and retain original mechanics and embedded rules. Define the cosmetic field allowlist before coding; verify mechanical parity and source preservation.
3. Elite/weak adjustments through verified native PF2e behavior. Explicit target/preview, reversible normal/elite/weak transitions and repeated-use checks prevent stacking. Test on designated QA copies before any real actor edits.

Exit: each tool passes local checks, applicable independent review and native acceptance. Bundle release publication only where the resulting change set stays coherent and reviewable.

## Phase 4 — Add the editable PC preview

Extend the existing authoritative-choice contract. First support identity/path and equipment changes, then eligible feat and spell choices where the current supported classes permit them. Define dependency invalidation before implementation: an ABC/path edit must recompute affected grants, prerequisites, skill budgets, feat/spell slots and loadout without discarding unaffected choices.

Exit: users can change supported individual choices from exact catalogs; stale dependent picks cannot survive; creation remains blocked until the edited plan passes completion checks. Native acceptance covers representative edits and class/path changes. This phase does not promise full caster-class support.

## Phase 5 — Add multiclass and Free Archetype packages

First produce a concrete source-backed candidate catalog with prerequisites, grants, resources and supported choice shapes. Choose the initial supported packages at that design checkpoint. Implement ordinary multiclass first, then separately test Free Archetype's feat graph and native slot ownership. Reuse the editable preview and existing prerequisite evaluator.

Exit: every advertised package has deterministic prerequisite/grant tests and native end-to-end evidence. Unsupported packages remain unavailable, and the exact catalog is published. A small supported catalog does not imply universal archetype support.

## Phase 6 — Deliver arbitrary creature level shifting

Proposed change from the old order: do this after the PC editor and archetype work. It has no prerequisite role for those features and the greatest unresolved balance scope.

Before coding, present a supported shift range, source-backed scaling policy, handling for spells/abilities/resources, and exclusions. Prefer a new adjusted actor with an explicit preview and preserved original. Implement only conversions justified by that policy; reject unsupported cases. Review martial and caster examples across the supported range, including damage, defenses, attacks, DCs and ability interactions.

Exit / milestone B: independent balance review and native sample acceptance pass, all six roadmap features meet their defined scope, and README checkboxes/evidence are current. If the supported range or package catalog remains undecided, the roadmap remains incomplete.

## Execution, checks and approvals

- Coordinator owns architecture, integration, source verification and the evidence record. Follow the existing plan's economical delegation policy for bounded implementation slices if that workflow is approved; discover the live model catalog before assigning workers. Keep grant/scaling decisions and independent schema/balance review with suitably capable reviewers. Serialize shared files and the live browser session.
- For every implementation slice: fetch real PF2e source for relevant schema; syntax-check touched modules; run every regression through the Node 22 gate; check JSON and whitespace; add regression coverage for genuinely pure bug logic. Independent second-agent review is mandatory for schema/balance changes. Local mocks do not close native acceptance rows.
- Use named branches and PRs. Prepare and review concrete changes before requesting authenticated GitHub publication authorization, as AGENTS.md requires. Every merge auto-publishes. Verify CI and release artifacts before installing a release for acceptance.
- QA batches have explicit run/spending ceilings and stop at their first unexplained failure. Inspect and reproduce locally before another paid attempt. Preserve existing artifacts; failure cleanup touches only the attempt's new documents. Record actual usage and retain failed-run usage.
- Report each slice as implemented, reviewed, published, installed and live-accepted separately. Keep HANDOFF, HISTORY, README and evidence aligned; do not publish a documentation-only release merely to advance this proposal.

## Proposed first authorization

Approve the sequence and start Phase 1's local/read-only preparation: release-asset verification, baseline checks, documentation reconciliation and an exact QA checklist. This is enough to make the next action concrete. Module installation and paid QA need a specific subsequent batch authorization because HANDOFF preserves an expired stop-on-failure budget; authenticated publication needs the repository-required authorization once a reviewed change exists. No defensible calendar or total token estimate is available before baseline acceptance and the level-shifting/archetype design checkpoints.
