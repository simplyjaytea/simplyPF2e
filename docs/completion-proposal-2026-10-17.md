# Completion proposal — 2026-10-17

Status: proposed, awaiting user direction. This updates the execution order in the September 15 completion plan; its detailed acceptance criteria remain applicable. Planning does not begin implementation, publication, installation or paid generation.

Independent review: Opus 5.5 at high effort returned **approve with changes** on October 17. This revision incorporates the parent's assessment in [the review record](completion-review-2026-10-17.md); the revised text has not had a second review. Proposed evidence-method changes and scope choices below are not silently treated as accepted deferrals.

## Baseline and outcome

PR #113 is merged at feeeec605bfb23077cc210bcbd718467d5375807 and v0.3.5.73 is published, confirmed through git and public GitHub reads on October 17. Required PC identity and the Guard Lore follow-up are implemented. Last recorded installation is .72; .73 asset parity, installation and native Guard Lore acceptance are unverified.

Deliver two milestones: (A) the currently supported product has completed its acceptance matrix, and (B) every agreed roadmap feature is implemented and accepted within an explicit supported scope. Broader caster coverage, universal NPC ability compatibility, shield/ammunition runes and universal rune exclusivity remain separate limitations unless a selected feature requires a specifically tracked prerequisite.

## Phase 1 — Establish the current baseline and finish PC acceptance

1. Verify .73 release assets against the merge, run the Node 22 repository gate, and reconcile stale README/current-state/completion-plan wording.
2. Prepare exact native cases before requesting a QA batch. Map every Phase 1–2 row to an existing artifact or a counted new generation, including encounter member count and expected additional calls. Record intended world, module-only update, provider/model, run ceiling, token/cost budget and stop conditions. Pin a model where the authorized provider permits it, or record the actual serving model when exposed; retain exact requests and responses securely for diagnosis. Unknown auto-routing identity is an evidence limitation, not proof that a failure is provider-caused. Do not assume the previous two-generation allowance remains available.
3. Within the authorized QA window, inspect actual installed versions and update only the module if necessary. Preserve the existing world, provider settings and QA artifacts.
4. First batch proposal: one level-1 Guard/Thief generation with Legal Lore, stopping at the first unexplained failure. Check exact identity, concrete trained Lore, grants, skills, full HP and loadout. This is a run ceiling, not an assumed token allowance; agree the spending ceiling before execution. A single completed run previously used 26,839 reported tokens, which is evidence rather than a forecast.
5. After that batch passes, propose at most three progression generations: higher-level Rogue, Guard/Fighter with Warfare Lore, and Investigator, at source-verified feat/skill progression boundaries. This covers the second Lore choice without a redundant level-1 generation. Reuse generated actors for related inventory and accessibility checks where suitable. Any needed additional boundary case must be counted before its batch starts.
6. Verify observable source-switch effects and overlapping Generator/Forge behavior in the same QA window: prices, rune tiers and usage must follow the selected sources. Restore changed source settings. Proposed evidence split: local cache regressions prove pending-load coalescing, while native checks prove observable source-selection behavior. UI alone does not prove internal coalescing. If native instrumentation is still required, design and review an exact temporary runtime harness and restoration procedure first; do not call function wrapping read-only.

Exit: current release/install evidence is recorded, both Guard Lore choices have native evidence, representative supported-PC progression passes, and cache acceptance is complete. A failed case produces a reproducible fix and focused rerun; unsupported mechanics remain explicitly gated.

## Phase 2 — Close current-feature live acceptance

Execute the existing completion plan's matrix in small batches, reusing preserved artifacts where safe:

- NPC combat: target saves, incapacitation, condition application and turn use for the supported Stunning Blows/Flurry package.
- Encounters: at least two members, composition/XP/loot and independent item/spell links. Before scheduling native partial-write rollback acceptance, define a controlled failure mechanism confined to disposable QA documents and its restoration procedure. Preflight source rejection or cancellation alone cannot demonstrate partial-write rollback. Prefer a temporary isolated test harness over shipping a failure-injection setting; feasibility remains a preparation task. Local rollback tests remain useful evidence but do not silently close the native row. If no safe harness is available, propose an explicit deferral rather than claim a pass.
- Inventory: nested kit quantities, physical contents and container links.
- Item Forge: duplicate copies, intended-copy selection, charges, damage/self-buff activations, depletion, recharge and missing-context behavior. Record the existing cross-client atomicity limitation.
- Focus: supported NPC casting/DC/resource behavior; exercise a supported PC grant path if available. If none exists, explicitly defer that PC acceptance row pending a verified class/grant expansion rather than reporting a pass.
- Accessibility: keyboard, focus return, labels/errors, progress, reduced motion and a real screen-reader session.
- Compatibility: supported installed target plus a smoke test on the declared PF2e minimum in a separate compatible Foundry instance/data directory, with an appropriate Foundry version. A second world in the existing data directory shares the installed system version and is insufficient. Lack of the isolated environment leaves an explicit open acceptance row.

Exit / milestone A: all applicable current-feature acceptance rows pass with versioned evidence; any explicitly agreed deferrals appear in the supported-scope statement. A tracked failure alone does not count as completion. Publish a concise readiness report and accurate user-facing limits.

## Phase 3 — Deliver the bounded creature tools

After Phase 1 establishes the baseline, independent local Phase 3 work may overlap Phase 2's externally scheduled QA. Missing screen-reader access or an isolated compatibility environment does not block unrelated local work, but leaves those acceptance rows open. Serialize shared files/browser use. Implement in three reviewable slices:

1. Chat command `/forge swamp hag 6` through the existing guarded generator lifecycle. Proposed default: Monster-mode one-click creation, with an explicit preview option; finalize this contract before coding. Validate syntax/levels, preserve unrelated chat and verify access, cancellation and duplicate-run behavior.
2. AI cosmetic reskinning: initially select an exact bestiary compendium creature, make one bounded AI call for allowlisted plain-text names/flavor/biography, preview changes and create a new actor while preserving the source. World-actor sources are a separate scope choice. Preserve mechanical item descriptions, rules and working enrichers exactly; add generated narrative separately. HTML escaping alone does not neutralize Foundry enrichment syntax. Reject or neutralize generated `@Check`, `@Damage`, `@UUID` and inline-roll syntax; do not pass cosmetic text through `enrichDescription`. AI emits no numerical mechanics or code. Verify mechanical/enricher parity and that cosmetic output creates no new rolls, checks or links. Any art changes use a separately defined user selection; no image-generation dependency is implied.
3. Elite/weak: PF2e already provides native sheet toggles and `applyAdjustment`, including repeated-state protection. Define the module's added workflow before implementation: a previewed convenience action for a selected existing creature is the narrow original scope; generation-time controls, encounter variants or batch adjustment are optional expansions requiring explicit selection. Reuse the native API and test the adapter's target, rollback and transition behavior; never recreate native stat math. Do not mark a roadmap feature complete merely by discovering an existing native toggle.

Exit: each tool passes local checks, applicable independent review and native acceptance. Bundle release publication only where the resulting change set stays coherent and reviewable.

## Phase 4 — Add the editable PC preview

Extend the existing authoritative-choice contract. First support identity/path and equipment changes, then eligible feat choices. Spell editing is deferred until a specific supported casting/granted-spell path is identified and accepted; Fighter/Rogue/Investigator selection alone does not establish that path. Define dependency invalidation before implementation: an ABC/path edit must recompute affected grants, prerequisites, skill budgets, feat slots and loadout without discarding unaffected choices. Any future spell editor must explicitly add spell-slot and grant invalidation.

Exit: users can change supported individual choices from exact catalogs; stale dependent picks cannot survive; creation remains blocked until the edited plan passes completion checks. Native acceptance covers representative edits and class/path changes. This phase does not promise full caster-class support.

## Phase 5 — Add multiclass and Free Archetype packages

First produce a concrete source-backed candidate catalog with prerequisites, grants, resources and supported choice shapes. This read-only research may overlap Phases 3–4. Explicitly inventory general archetype rules, including dedication restrictions and variant exceptions, that per-feat prerequisite text may not capture; verify the relevant rules/source before implementing them. Initially exclude caster dedications until their casting entries/resources have a supported accepted implementation. Choose the initial supported packages at that design checkpoint. Implement ordinary multiclass first, then separately test Free Archetype's feat graph and native slot ownership. Reuse and extend the editable preview and existing prerequisite evaluator rather than assume it already models the general rules.

Exit: every advertised package has deterministic prerequisite/grant tests and native end-to-end evidence. Unsupported packages remain unavailable, and the exact catalog is published. A small supported catalog does not imply universal archetype support.

## Phase 6 — Deliver arbitrary creature level shifting

Proposed change from the old order: do this after the PC editor and archetype work. It has no prerequisite role for those features and the greatest unresolved balance scope.

Before coding, present a supported shift range, source-backed scaling policy, handling for spells/abilities/resources, and exclusions. Prefer a new adjusted actor with an explicit preview and preserved original. Implement only conversions justified by that policy; reject unsupported cases. Review martial and caster examples across the supported range, including damage, defenses, attacks, DCs and ability interactions.

Exit / milestone B: independent balance review and native sample acceptance pass, all six roadmap features meet their defined scope, and README checkboxes/evidence are current. If the supported range or package catalog remains undecided, the roadmap remains incomplete.

## Execution, checks and approvals

- Coordinator owns architecture, integration, source verification and the evidence record. Follow the existing plan's economical delegation policy for bounded implementation slices if that workflow is approved; discover the live model catalog before assigning workers. Keep grant/scaling decisions and independent schema/balance review with suitably capable reviewers. Serialize shared files and the live browser session.
- For every implementation slice: fetch real PF2e source for relevant schema; syntax-check touched modules; run every regression through the Node 22 gate; check JSON and whitespace; add regression coverage for genuinely pure bug logic. Independent second-agent review is mandatory for schema/balance changes. Local mocks do not close native acceptance rows.
- Use named branches and PRs. Prepare and review concrete changes before requesting authenticated GitHub publication authorization, as AGENTS.md requires. Every merge auto-publishes. Verify CI and release artifacts before installing a release for acceptance.
- Proposed release protection: new actor-creating/modifying roadmap tools remain off by default behind an explicit experimental setting until native acceptance passes; release notes state that limit. Verify the gate at UI and API boundaries. This permits the existing release/install QA route without presenting unaccepted tools as ready. Enabling by default is a separate reviewed change after acceptance.
- QA batches have explicit run/spending ceilings and stop at their first unexplained failure. Inspect and reproduce locally before another paid attempt. Preserve existing artifacts; failure cleanup touches only the attempt's new documents. Record actual usage and retain failed-run usage.
- A user-approved phase spending envelope may cover its listed batches without repeated approval, provided scope, ceiling and stop conditions remain satisfied. Approval of one phase is not unlimited spending authorization. Budget overruns and recovery after a stop need a concrete revised proposal.
- Later changes to shared generation/build/commit behavior trigger the affected native acceptance rows again in the next QA window. Reusing an old actor validates its current interaction behavior, not creation by the new release. Record these distinctions explicitly.
- Report each slice as implemented, reviewed, published, installed and live-accepted separately. Keep HANDOFF, HISTORY, README and evidence aligned; do not publish a documentation-only release merely to advance this proposal.
- Carry this branch's documentation commits into the first implementation PR so reconciliation is not lost. Until publication, explicitly identify the proposal as local; do not claim main's stale documentation is updated.

## Proposed first authorization

Approve the sequence and start Phase 1's local/read-only preparation: release-asset verification, baseline checks, documentation reconciliation and an exact QA checklist. This is enough to make the next action concrete. Module installation and paid QA need a specific subsequent batch authorization because HANDOFF preserves an expired stop-on-failure budget; authenticated publication needs the repository-required authorization once a reviewed change exists. No defensible calendar or total token estimate is available before baseline acceptance and the level-shifting/archetype design checkpoints.
