# NPC class-feat grounding and compatibility plan

Status: diagnosis and proposal only. No runtime change, provider request, Foundry mutation, or publication. Baseline: released/installed SimplyPF2e 0.3.5.69, PF2e 8.5.0. User requested a solution across all classes rather than a Monk-specific patch.

## Reported reproduction

NPC level 15. Prompt:

> A mysterious master of martial arts disguised as a simple proprietor of a tavern. They have a keen eye and even keener magics. They are secretive and crafty, but seem to enjoy living the mortal life.

Generation details reports Compendium matching failed, with required unresolved `feat: crane stance`, `feat: deflect arrow`, and `feat: stunning blows`. The user did not request those specific feats. Preset, actual enabled-pack contents, and raw selector response were not supplied. No Foundry tab was available during this investigation.

## What is established

NPC generation already reads enabled PC class-feat packs. `getFeatCandidates` filters real feat documents by class category and level, without restricting NPCs to the three supported complete-PC classes. The creature caller uses a bounded all-class shortlist. Exact normalized draft names already receive priority before the 16-candidate cap; adding that behavior again would not fix this failure.

The failure is before native actor creation. When the feat catalog is empty, the selection request errors, or a nonempty reply maps to zero valid candidates, the caller retains the draft names. Final exact-source resolution refuses those name-only entries and the completion manifest blocks creation. This explains the displayed error path; the absent raw reply prevents identifying which branch occurred in this run. A valid explicit empty selection is already handled separately and clears the optional wishlist.

PF2e forbids embedding raw `feat` items on NPC actors, but SimplyPF2e already converts matched feats to `action` items in `featToAction`. That native restriction is not itself the cause of this matching error.

| Draft ability | Actual PF2e 8.5.0 source | Implication |
| --- | --- | --- |
| Crane Stance | Level-1 class feat; one action; points to Stance: Crane Stance effect | Not excluded by level 15. Needs the linked stance effect and native NPC strike/stat QA. |
| Deflect Arrow | Current corresponding feat is Deflect Projectile, level 4 | Naming drift. The model must select the real offered source; no unverified name-based substitution. |
| Stunning Blows | Level-2 class feat; prerequisite Flurry of Blows; RollOption and damage Note | Not excluded by level. Copying it does not supply Flurry of Blows or establish usable class-DC context. |

The 16-entry mixed-class shortlist remains a relevance limitation: non-exact alternatives can be crowded out. This can affect discovery of Deflect Projectile, but does not explain losing exact Crane Stance/Stunning Blows if those sources were enabled and indexed under their current names.

## Recommended design

Keep NPCs as NPCs with GM Core baseline statistics. Reuse the existing source catalog, exact-reference resolution, feat-to-action conversion, and completion checks. Support discovery from all enabled class-feat sources; determine execution support from a feat's actual rules and dependencies, not a class whitelist. This is separate from building a complete PC of every class.

### Slice 1 — reliable selection across classes

1. Use short request-local feat IDs for creature selection, sharing the existing alias mechanism in `ai-candidate-format.mjs`. The existing PC resolver is slot-shaped and cannot be reused literally for up to three choices from one creature list. Preserve private pack/document references. Same-name identity must be preserved at catalog admission first: current getFeatCandidates deduplicates by normalized name, so aliases alone cannot restore later-pack choices. Use NPC-scoped source-identity deduplication/ranking; do not inadvertently alter PC slot-catalog semantics.
2. Validate returned IDs at the selector boundary. Distinguish valid empty selection, invalid IDs, unavailable catalogs, and request failure. Treat mixed valid/invalid replies atomically: reject the malformed selection and retain the draft, rather than accepting its valid subset and silently erasing the rest. Explicit per-pick recovery belongs in the GM recovery step. Retain spent usage and the original draft; do not turn failed selection into successful omission. Prefer the current bounded request/retry behavior over an additional repair loop.
3. Preserve current exact-name priority. Improve ranking of remaining alternatives using source names, relevant class traits inferred from exact source hits or an applicable preset, and prompt terms. Ranking only decides what to offer: it must not turn an approximate name into an accepted source reference. For this example, a real Deflect Projectile candidate can be offered and explicitly selected without a hardcoded Monk rename table.
4. Report the actual failed stage/reason immediately, with bounded diagnostics (enabled packs, candidate count, valid/invalid pick counts). Never log credentials or entire provider exchanges. A selector failure should not first appear as a generic late compendium error.

Acceptance: production request/caller tests for exact matches, wrong IDs, mixed valid/invalid replies, explicit empty selection, duplicate names across packs, preserved usage, candidate caps, renamed-ability alternatives, and successful references from multiple classes. Reuse current fixtures/helpers; no class-specific selection branches.

### Slice 2 — honest NPC execution support

1. Extend the existing conversion boundary to inspect the selected source and its dependencies before a write. Preserve original cost/text, supported rules, self-effects, and provenance; handle other mechanical fields only after verifying their native source semantics.
2. Reuse native effects and rules where NPC execution is verified. Source identity alone is not proof of working mechanics: test actual predicates, strike behavior, resources, grants, and derived data. Unconditional NPC baseline statistics must remain owned by the existing builder.
3. Block unverified automated conversion of feat-only preparation, character-only fields, or grants of NPC-invalid item types. Native `GrantItem` can accept an NPC host while still trying to prepare a granted `feat`, which fails. Changing a feat to an action also loses feat preparation and changes item roll-option namespaces. Do not recursively convert arbitrary grants or fabricate missing PC class machinery.
4. Represent a known source that needs GM execution as a distinct **source-backed manual reference**, never as fully working automation. Introducing this alternative must require an explicit GM choice and a clear completion/report status; add a new pre-write compatibility gate that blocks unverified mechanics until that choice exists. Current strict creation checks exact grounding; they do not already provide this mechanics gate. Manual reference mode would keep official text/provenance without running unverified rules. It is different from custom narrative.

Acceptance: native Crane Stance activation/deactivation and resulting strike/AC; Deflect Projectile reaction/toggle/context; Stunning Blows with and without verified Flurry/DC support; cross-class rule predicates; valid effect grants versus prohibited feat grants; missing dependencies and rollback. No claim that every feat is automated merely because it appears on a sheet.

### Slice 3 — recover without losing the NPC concept

Keep the generated draft when grounding fails. Show the exact unresolved or incompatible choices and offer a targeted selection retry, exact-source replacement, or explicit removal/manual-reference choice. Preserve already validated sections and spent-token accounting. No automatic deletion of a requested mechanic and no silent fallback to narrative. If a choice is removed, refresh resolution and the completion manifest before creation.

Keep this recovery bounded to the existing generation draft and feat-selection step; do not introduce a general workflow engine. In the reported prompt these feats were AI suggestions, so the GM can choose suitable supported techniques without rewriting the tavern-keeper concept.

## Scope and delivery

The general solution is all-class discovery with explicit, per-source execution status. Universal automatic support for every PC feat is a separate and much larger task because many depend on PC class resources, predicates, subclass data, prerequisite chains, or prose-only rules. Do not claim that copying JSON supplies those systems.

Implementation can begin with selection reliability, then compatibility and explicit recovery. Publication must be cohesive: do not release expanded successful feat conversion until the source-compatibility gate and explicit recovery/manual-choice behavior are ready. Diagnostics-only changes that do not expand execution may be shipped separately after review. Short IDs are a reliability improvement, not a proven reconstruction or fix of this particular missing response. Delegate bounded alias/diagnostic/UI work to Luna, source-dependent compatibility work to Terra, and audit every finished slice with Astra. Run the repository regressions and syntax checks; use installed PF2e live QA for mechanics. Publication, if implementation is subsequently requested, follows the already authorized PR → CI → merge → release → SimplyPF2e-only Foundry update route.

## Source evidence

Inspected current master and the installed 8.5.0 source. Parent independently fetched the three feat documents and the native actor/item/grant boundaries.

- [Crane Stance, PF2e 8.5.0](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/feats/class/monk/level-1/crane-stance.json): `"level": { "value": 1 }`, empty rules, linked `selfEffect`.
- [Stunning Blows, PF2e 8.5.0](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/feats/class/monk/level-2/stunning-blows.json): level 2, prerequisite `Flurry of Blows`, `RollOption` and `Note` rules.
- [Deflect Projectile, PF2e 8.5.0](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/feats/class/monk/level-4/deflect-projectile.json): level 4, conditional `FlatModifier`, explicit `deflect-projectile` roll option.
- [Crane stance effect](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/feat-effects/stance-crane-stance.json): published effect with Strike, AC modifier, Note and RollOption rules.
- [NPC item types](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/module/actor/npc/document.ts#L36-L38): allowed additions include `action` and exclude `feat`.
- [Feat preparation](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/module/item/feat/document.ts#L150-L153): `if (!actor?.isOfType("character")) throw ErrorPF2e("Feats much be embedded in PC-type actors");`.
- [Default item roll options](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/module/item/base/document.ts#L159): `getRollOptions(prefix = this.type, ...)`; [action preparation](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/module/item/ability/document.ts#L52-L60) does not perform feat actor preparation.
- [GrantItem preparation](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/module/rules/rule-element/grant-item/rule-element.ts#L206): `tempGranted.prepareActorData?.()` runs on the original granted item type.
- Repository trace: `compendium.mjs` exact-name candidate cap and `getFeatCandidates`; `ai.mjs` `selectCreatureFeats`; `generator-app.mjs` `#refineCreatureFeats`; `builder.mjs` exact feat resolution and `featToAction`; `completion.mjs` `assertComplete`. Luna independently traced catalog/selection; Terra verified native source and conversion restrictions.

## Independent design review

Astra independently verified the named feat/effect and actor/grant boundaries and reviewed the proposal. The final plan incorporates catalog-admission preservation of same-name sources, atomic mixed-valid/invalid handling, and a release gate that recognizes current grounding does not establish NPC mechanics. The reviewed diagnosis remains conditional about the unavailable provider reply.

Final Astra recheck: approved, no remaining design findings. No implementation or native-mechanics approval is inferred. All 86 existing regression files and whitespace checks pass; only documentation changed.
