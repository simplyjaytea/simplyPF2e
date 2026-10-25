# Independent completion-plan review — 2026-10-17

Reviewer: Claude Opus 5.5, effort high, via T3 delegation. Target: proposal at commit 19cd6ad. Verdict: **approve with changes**. Review was read-only; no implementation or native QA occurred. Task ID is recorded in HANDOFF.md.

The reviewer found five main issues: underspecified added value over native elite/weak; a second world cannot isolate a different installed PF2e version; AI reskinning needs explicit text/enricher boundaries; spell editing has no identified accepted casting path; and native partial-write rollback requires a defined failure mechanism. Additional findings concern release-before-QA, unnecessary sequential blocking, generation cost, model reproducibility, cache evidence, and general archetype rules.

## Parent assessment and disposition

- **Elite/weak:** accept the missing product-scope decision. The original proposal already required native behavior, so it did not actually mandate rebuilding native math. Parent independently fetched master and pf2e-8.5.0 `src/module/actor/npc/document.ts`: `applyAdjustment` returns immediately for an already-selected state and otherwise updates native adjustment/HP. Clarify what the module adds and keep additional generation/encounter/batch features optional. Do not assume all arbitrary shifts can be partitioned into native plus/minus-one cases without checking boundary behavior.
- **Compatibility:** correct the environment requirement to a separate compatible instance/data directory. The row stays open until tested or expressly deferred; this does not block unrelated local development.
- **Reskin:** accept. Parent inspected `text.mjs`: escaping covers five HTML characters, not Foundry enrichment syntax. The proposal now explicitly bounds the AI call, preserves source mechanical descriptions/enrichers, and requires cosmetic text to remain inert. Initial source scope is bestiary compendium entries, matching the README roadmap.
- **Spell editing:** accept the need for a concrete target. Parent checked `pc-support.mjs`'s Fighter/Rogue/Investigator allowlist. Defer spell editing pending an identified accepted path; do not infer that those characters can never receive magic from other grants.
- **Rollback:** accept the missing test mechanism. Do not accept the review's implication that fault injection necessarily must ship publicly: a temporary isolated harness is another design option. Keep native rollback open until a safe mechanism is reviewed; local tests plus preflight rejection are not equivalent evidence.
- **Release exposure:** propose an off-by-default experimental gate for new roadmap tools until native acceptance, including API checks. This is a plan recommendation, not a setting change or publication authorization.
- **Sequence:** allow independent Phase 3 local work during Phase 2 QA scheduling after baseline establishment; require affected native cases to be rerun when later shared behavior changes. Keep milestone A's open rows visible.
- **Cost:** one level-1 Legal Lore run, then at most three progression runs including Guard/Fighter/Warfare. Prepare an artifact-reuse/new-generation ledger for every remaining row before spending. Existing NPCs can cover interaction tests but cannot establish creation by a new version.
- **Reproducibility:** pin a model where authorized/available or record the serving model. Preserve diagnostic inputs/outputs securely. Unknown routing is an evidence limit, not proof that a product failure is caused by the provider or inherently unreproducible.
- **Cache:** propose deterministic tests for load coalescing and native checks for observable source switching; do not describe runtime function wrapping as read-only. This evidence split must remain explicit rather than silently claiming native coalescing acceptance.
- **Archetypes:** add source-verified general dedication/variant rules to the design checkpoint and defer caster dedications until their native casting path is supported.
- **Other improvements:** specify the proposed chat-command behavior, carry local documentation commits into the first implementation PR, mark the old plan's stale execution instructions, and permit early read-only archetype research. A phase-level approved spending envelope can remove redundant batch approval round trips while retaining ceilings and stop conditions.

## Remaining decisions

Before the affected work, establish the screen-reader operator and isolated compatibility environment; select the elite/weak workflow; approve or revise experimental release gating and chat behavior; agree concrete QA spending envelopes. These decisions do not require five immediate user questions and do not block further planning. No deferral, budget or release authorization has been inferred.

The parent revised the proposal after assessing the findings. Opus has not reviewed that revised text; its verdict applies to the original proposal with the above requested changes, not to any implementation.

Source spot-checks: [PF2e master NPC document](https://raw.githubusercontent.com/foundryvtt/pf2e/master/src/module/actor/npc/document.ts), [PF2e 8.5.0 NPC document](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/module/actor/npc/document.ts). No full native-source or balance audit is claimed for this planning review.
