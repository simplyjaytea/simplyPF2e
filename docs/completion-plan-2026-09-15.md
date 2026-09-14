# Completion plan — 2026-09-15

## Scope and baseline

The user requested a plan to complete the outstanding list, with suitable work delegated to Luna to conserve usage. This plan includes the prioritized readiness gaps, latest catalog optimization acceptance, and all four README roadmap bullets (split into separate deliverables below). Planning does not begin implementation, authorize new provider spending, or publish a release.

PR #111 is merged at `019d17b67c96bc06831fe56a4cfe8784fee90762`; GitHub's latest public release is **v0.3.5.71**, with module.json and module.zip assets. The September 12 handoff's pending-publication instruction is superseded. The last recorded installation is **v0.3.5.70 / Foundry 14.365 / PF2e 8.5.0**. Publication is not proof of installation, archive byte parity, or live acceptance.

## Progress — 2026-09-15 implementation

- Step 0: .71 official assets/49 archive files verified; active .71 installation observed read-only in Foundry. Source-switch/overlapping-load native acceptance remains pending.
- Step 1: required-choice implementation and independent review complete locally on `codex/pc-identity`. User chose explicit required controls and stopping ambiguous prose. See [implementation/evidence](pc-identity-2026-09-15.md); final local gate and publication/native next steps live in HANDOFF.md.
- Steps 2–8: still outstanding. No provider/world/publication actions occurred in this implementation session.

## Execution and model allocation

- Parent owns behavior tracing, design, dependency ordering, integration and evidence. Delegate bounded, fully specified implementation, regression cases, templates/localization and documentation to **gpt-5.6-luna**. Give each assignment exact files, inputs, expected behavior, tests and stop conditions; use a short context packet instead of a full-history fork.
- Reserve stronger-model work for PC identity semantics, grant/prerequisite graphs, native adjustment behavior, rollback/concurrency design and independent schema/balance reviews. Luna can implement an agreed slice without owning an unresolved architectural decision. Escalate when a schema uncertainty, invariant conflict or failed hypothesis prevents a bounded fix; avoid repeated blind attempts.
- Run at most two independent implementation lanes plus the coordinator/reviewer as needed. Serialize shared owners such as generator-app.mjs, pc-builder.mjs and ai.mjs. Workers must accommodate others' changes and never revert unrelated work.
- Reuse reviewers for narrow follow-ups, but keep the required final reviewer independent of the implementation. Review a concrete diff, not a worker's summary. Fetch actual PF2e master source whenever a field/API shape matters, and compare with the installed target where compatibility matters.
- Reuse existing regression fixtures and deterministic provider mocks before paying for live generations. Group native checks so one created actor can cover several assertions. Record actual usage; stop a failed scenario at its first unexplained failure, fix it, then rerun only the affected checks. No endless generation retries.

## Ordered delivery

| Order | Deliverable and existing owner | Allocation | Completion evidence |
| --- | --- | --- | --- |
| 0 | Reconcile .71 release/installation evidence and finish cache acceptance. Owners: async-cache.mjs, compendium.mjs, rule-templates.mjs, runes.mjs, item-builder.mjs. | Luna: public release/asset comparison and evidence checklist. Parent: native session and source-switch checks. | Verify assets against the merge; record actual installed version. Warm lookups, switch enabled equipment sources, confirm subsequent prices/usage/rune tiers follow selection; overlap Generator/Forge catalog loads. Restore test settings and preserve QA artifacts. |
| 1 | Authoritative requested PC choices, using the existing input → concept → ABC selection → resolution → creation flow. Owners: generator-app.mjs, ai.mjs, pc-builder.mjs, class-paths.mjs and existing templates. | Parent designs request semantics; Luna implements bounded validation/UI/tests after the contract is fixed; independent stronger reviewer checks affected native rules. | Requested class, name, ancestry, heritage, background, key ability and class path are retained when supported; ambiguity or unavailable required choices prevents silent substitution. Rejection precedes avoidable downstream provider calls and all actor writes. |
| 2 | Successful Rogue and broader supported-PC acceptance after step 1. Owners: pc-support.mjs, class-paths.mjs, choice-set.mjs, pc-prerequisites.mjs, pc-skills.mjs, pc-loadout.mjs. | Luna: fixture gaps and concrete fixes with known causes. Parent: native diagnosis; stronger reviewer for schema/grant changes. | Successful low-level Rogue/Thief and representative higher-level Rogue, plus Fighter/Investigator checks at relevant feat/skill progression boundaries. Inspect exact requested identity, racket/methodology grants, prerequisite eligibility, skills, full HP and loadout. Record native dialogs and unresolved choices honestly. |
| 3 | Close the remaining current-feature acceptance matrix below. | Luna prepares cases and handles bounded reproducible fixes. Parent coordinates native runs; accessibility acceptance includes a real assistive-technology session. | Every matrix row has versioned pass evidence or a tracked failing fix. A local mock or sheet link alone cannot close a live behavior requirement. |
| 4 | Chat command, reusing the guarded generator entrypoint and normal lifecycle. Owner: simplypf2e.mjs → GeneratorApp. | Luna implements after parent defines syntax and error behavior. | `/forge swamp hag 6` reaches the same supported creature flow and lifecycle; GM/PF2e checks, invalid level/empty input, unrelated chat, escaping, cancellation and duplicate-run protections verified. No second generation pipeline. |
| 5 | Reskin an existing creature. Reuse source lookup, text escaping, preview and document commit/rollback helpers. | Parent defines a narrow cosmetic field allowlist; Luna implements selector/preview and agreed clone edits. | Create a new actor from the exact selected source; change only approved cosmetic fields. Do not route through builder.createActor’s generated-stat assembly; the existing art scaffold is not a mechanical clone. Compare mechanical data and embedded rules before/after; original world actor/compendium document remains intact. Narrative is not a promise of new mechanics. |
| 6a | Elite/weak adjustments for existing creatures. Prefer verified native PF2e behavior. | Parent verifies API and adjustment semantics; Luna implements the UI and bounded adapter; independent schema/balance review. | Normal/elite/weak transitions produce native results without stacking twice; switching back restores the correct state. Preview and explicit target selection protect existing actors; adjustment lifecycle and rollback have live coverage. |
| 6b | Arbitrary creature level shifting, separate from elite/weak. Reuse benchmark ownership in tables.mjs/builder.mjs only where it matches the defined transformation. | Stronger-model design/review; Luna implements specified pure transformations and tests. | Define the supported shift range and scaling policy from real rules before coding. Verify attacks, defenses, damage, spells and abilities as a whole; exact published items/rules stay source-backed. Unsupported conversions fail closed. Test a mixed martial/caster sample with balance review; do not mark complete merely because the displayed level changes. |
| 7 | Pre-create editing of individual PC picks, extending the current preview and step-1 authoritative choices. | Parent defines invalidation dependencies; Luna implements controls, localization and bounded recomputation tests. | Swap ABC/path, feat, spell where supported, and equipment choices from exact eligible catalogs. Recompute affected grants, prerequisites, skill/slot plans, equipment and completion checks; remove stale dependent picks. No actor writes until the edited plan passes; unaffected selections survive. |
| 8 | Multiclass archetypes, including a separately verified Free Archetype path. Owners: pc-prerequisites.mjs, pc-builder.mjs, pc-support.mjs, choice-set.mjs and step-7 preview. | Stronger-model design and grant/prerequisite review; Luna implements mapped slices, fixtures and UI. | Prove dedication prerequisites, subsequent feat chains, native grants/resources/choices and slot ownership. Ordinary multiclass and Free Archetype need separate regression/live cases. Enable each supported package only after end-to-end acceptance; keep unproven packages gated and publish the exact supported catalog. |

Sequence: **0 → 1 → 2 → 3**, then **4 → 5 → 6a → 6b → 7 → 8**. Step 0's native checks can share the first authorized QA window for steps 1–2. Independent read-only research/checklist work can overlap, but shared runtime owners and native browser sessions remain serialized. Steps 1 and 7 must share the same authoritative-choice contract rather than create two implementations.

## Step 1 design checkpoint

Observed current behavior: `GeneratorApp.#generatePC` accepts the ABC selector's returned identity into the concept. `selectAncestryBackgroundClass` labels the concept's earlier identity as inspiration; it checks catalog membership, not the original user's intended identity. PC identity enforcement must therefore live at input/selection/resolution boundaries, not only in prompt wording or after actor creation.

1. Keep original user intent separate from AI-authored concepts. Define explicit choices versus preferences, including Random and flavor presets, before changing code.
2. Prefer exact catalog-backed input choices for authoritative mechanical fields, and a literal name field. Reuse these choices later in the editable preview. Define a bounded interpretation for supported explicit prose requests; ambiguous prose must surface the interpreted choices for correction, not silently assert reliable natural-language parsing. Do not copy the NPC name-matching grammar wholesale: HISTORY.md records false positives.
3. Resolve and validate supplied choices against selected sources and native compatibility; filter the ABC selection to those choices and recheck its output. Unsupported or conflicting required selections need a clear local error/review state. Do not spend on feats/equipment/loot before resolving the conflict.
4. Preserve required identity through refinement and verify it again at creation. Test a provider selecting an offered but wrong class, missing requested heritage, invalid key ability, unavailable source, negated/ambiguous names, preset conflict, Random behavior and cancellation/usage accounting. A requested Rogue must never silently become an Investigator.

## Native acceptance matrix for steps 2–3

| Case | Required observation |
| --- | --- |
| Supported PCs | Exact identity and source references; ordinary Rogue/racket success; representative higher-level Rogue plus Fighter/Investigator progression boundaries; grants, feats, skills, HP, loadout and any native dialog limits. |
| NPC combat | Stunning Blows/Flurry package exercised against a target: native save DC/result, incapacitation, condition application and combat-turn use, not just displayed links. Preserve native/manual responsibilities in product wording. |
| Multi-member encounter | At least two actual members; correct composition, XP/loot allocation, independent item/spell links; a controlled pre-commit failure verifies rollback of only newly created documents. Preserve pre-existing QA records. |
| Nested kits | Nested quantities and container links survive native expansion; inspect physical leaves and duplicate contents, not just top-level totals. |
| Forged activations | Two copies of the same item use the intended copy and charges; damage, self-buff, depletion and rest/recharge paths; missing-context fallback stays descriptive and reports failure accurately. Record existing cross-client atomicity limits separately. |
| Focus spells | Exercise supported NPC focus alongside ordinary casting, with native DC, casting and resource behavior. Test PC focus through a supported granted path if one exists; otherwise track it as blocked on verified PC casting/class expansion, not as a passed test. Focus-only NPCs remain outside the signed-off v1 scope. |
| Accessibility | Keyboard-only navigation, focus placement/return, labels/errors, progress announcements and reduced motion; actual screen-reader exercise. Automated semantic checks alone are insufficient. |
| Compatibility | Main native matrix on the recorded supported target after verifying actual versions. A targeted smoke on the declared PF2e minimum requires a separate compatible test world; do not downgrade the existing world. Otherwise retain the explicit older-version evidence gap. |

Before native execution, confirm access and establish the allowed QA world, provider budget and module installation actions from the user's current authorization. Reuse the preserved QA inventory where safe; use clearly identified new test documents when required. Do not delete earlier artifacts. Intentional failure/rollback cases may clean up only their own newly created documents through the normal lifecycle. Manual cleanup and any in-place creature edits need concrete targets and rollback plans.

## Definition of done and release discipline

Each implementation slice needs appropriate syntax checks, all regression files via Node 22 `tools/check.mjs`, JSON and `git diff --check`; add regression tests for genuinely pure bug logic. Schema-dependent or balance-sensitive diffs require independent second-agent review with fetched native-source evidence. Keep local checks distinct from live acceptance.

Use named `codex/` branches and PRs. Never push/merge main directly. Every merge publishes a public release, so bundle coherent tested changes and preserve documented beta limits; do not merge this planning-only branch merely to publish documentation. Establish publication authorization for the implementation batch, then verify CI, release assets and installed bytes/version as appropriate. A release with pending native checks must say so; it cannot close those acceptance rows.

Update HANDOFF.md, HISTORY.md, relevant readiness evidence and README checkboxes as each deliverable actually completes. An intentional scope gate is not a completed feature. Step 8's exact supported archetype catalog and step 6b's supported transformation range require design review before implementation; unrestricted support must not be implied by a few passing examples.

Other documented limitations (all caster classes, shield/ammunition runes, universal rune exclusivity, arbitrary NPC class resources and wider rarity filtering) are not silently added to this list. If they are prerequisites for a promised deliverable, scope and track that prerequisite explicitly. They remain visible limitations afterward. This plan makes no calendar or token estimate before those design checkpoints are resolved.

## Planning evidence

A bounded read-only Luna pass mapped the roadmap to current entrypoints: simplypf2e.mjs API/GM gates, GeneratorApp generation/preview lifecycle, art.mjs scaffold lookup, builder.mjs stat assembly, and pc-builder.mjs exact selection/resolution. Its key integration findings are incorporated above. This is planning evidence, not the required independent review of a future implementation diff.

## Immediate next assignment

Parent: define and trace the step-1 authoritative PC input contract and its integration with the existing preview. In parallel, Luna: verify .71 public release assets against the merge and prepare a concise deterministic test matrix for the agreed PC contract. Then dispatch one bounded Luna implementation slice, review it and run the gate before native QA.
