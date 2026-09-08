# NPC class-feat grounding and compatibility plan

Status: diagnosis and proposal only. No runtime change, provider request, Foundry mutation, or publication. Baseline: released/installed SimplyPF2e 0.3.5.69, PF2e 8.5.0. User requested a solution across all classes and then explicitly preferred automatic prerequisite grants to manual consumer handling. The normal path must produce complete supported abilities without a manual-use fallback.

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
2. Validate returned IDs at the selector boundary. Distinguish valid empty selection, invalid IDs, unavailable catalogs, and request failure. Treat mixed valid/invalid replies atomically: reject the malformed selection and retain the draft, rather than accepting its valid subset and silently erasing the rest. After atomic rejection, recovery may only use the bounded automatic supported-package path in Slice 3. Retain spent usage and the original draft; do not turn failed selection into successful omission. Prefer the current bounded request/retry behavior over an additional repair loop.
3. Preserve current exact-name priority. Improve ranking of remaining alternatives using source names, relevant class traits inferred from exact source hits or an applicable preset, and prompt terms. Ranking only decides what to offer: it must not turn an approximate name into an accepted source reference. For this example, a real Deflect Projectile candidate can be offered and explicitly selected without a hardcoded Monk rename table.
4. Report the actual failed stage/reason immediately, with bounded diagnostics (enabled packs, candidate count, valid/invalid pick counts). Never log credentials or entire provider exchanges. A selector failure should not first appear as a generic late compendium error.

Acceptance: production request/caller tests for exact matches, wrong IDs, mixed valid/invalid replies, explicit empty selection, duplicate names across packs, preserved usage, candidate caps, renamed-ability alternatives, and successful references from multiple classes. Reuse current fixtures/helpers; no class-specific selection branches.

### Slice 2 — automatically complete and verify ability dependencies

1. Treat each potential signature ability together with its required supporting feats/features, effects, and runtime capabilities. Before final selection or any actor write, resolve the entire package against enabled real sources. Prerequisite auto-granting is authorized for the new NPC being generated.
2. Prefer native NPC-valid action/effect documents and verified source-backed conversions. Add required dependencies recursively, reuse already-present ones, and deduplicate by source identity. Detect cycles, missing sources, excessive expansion, incompatible choices and level violations. Never cut a dependency chain short and call the remaining package complete.
3. Use explicit source references wherever available. PF2e prerequisite lists are often prose, not an executable graph; the current PC prerequisite helper checks a supplied context and does not discover or grant missing dependencies. Reuse its supported parsing/evaluation logic where appropriate, but do not infer arbitrary requirements or derive PC proficiency ranks from an NPC's flat skill modifiers. Unreadable requirements make that package unavailable for automatic selection.
4. Verify each prerequisite's actual NPC execution, including predicates, grants, resources, DCs, strikes, and effects. Same-name action/feat documents are not interchangeable by name alone. Any NPC equivalent must have a verified source binding and behavior. Never insert a raw feat or an unchanged GrantItem that would grant an NPC-invalid item type.
5. Keep the NPC's existing GM Core baseline statistics. Add the functional supporting abilities needed by the selected powers; do not import an entire PC class progression or rebuild character feat slots. Any new NPC resource/DC/strike bridge needs actual native source verification and a defined module-owned calculation policy. Clone real Rule Elements; there is no hand-authored Rule Element fallback. The AI continues to choose IDs and enums; it never authors rules or numbers.
6. Account for the whole ability package when choosing the final set. A supporting prerequisite may itself add combat power; do not hide it from the ability budget merely because it was auto-granted. Prefer a smaller complete set to several incomplete sets.

For the reported example, PF2e publishes Flurry of Blows both as a PC class-feature feat (`NLHHHiAcdnZ5ohc2`) and as a standalone NPC-valid action (`nbfNETdpee8CVM17`). Their descriptions both specify two unarmed Strikes, normal multiple-attack penalty, combined damage for resistances/weaknesses when both hit the same target, and a once-per-turn flourish limit. The action is a valid source-backed starting point for automatic dependency completion. Its rules array is empty, however: adding that row alone does not wire the strikes, Stunning Blows save/DC, or stunned application. Qualifying the full package requires that execution work and native QA.

Acceptance: verified multi-level dependency chains; shared dependencies; exact source equivalents; alternatives with a fully provable branch; unsupported prose; cycles and missing sources; class-only fields; NPC-invalid grants; resource/DC/strike behavior; and complete rollback. For Stunning Blows specifically, prove the Flurry relationship and working save/condition flow, not merely the presence of named rows.

### Slice 3 — keep generation automatic

1. Offer the AI only ability packages the module can complete. Automatically add required supporting abilities and resolve supported native choices using the existing grounded selection machinery. There is no ordinary consumer prerequisite dialog and no manual-reference output mode.
2. When an AI-suggested ability cannot be completed, select a compatible, source-backed alternative fitting the original concept before creating the actor. Use the existing bounded request budget or validated already-offered alternatives; do not add an unbounded repair loop. Preserve valid draft sections and token usage.
3. Do not substitute a power that the user explicitly required and then claim it was honored. If such a requirement cannot be completed, stop before writing with a specific unsupported-capability error. Where intent is ambiguous, do not rely on the provider's optional/required classification to authorize silent omission. Exact requirements need a reliable binding or must retain the fail-closed path.
4. The consumer flow stays Describe → Generate & Create → ready NPC. An optional result summary can say “3 signature abilities; 2 supporting abilities added automatically.” This is informational, not an approval step. Ordinary combat choices still use normal Foundry controls; removing manual setup does not mean the module plays combat for the GM.

## Scope and delivery

The general solution is all-class discovery with automatic dependency completion and verified execution packages. Universal automatic support for every PC feat is a separate and much larger task because many depend on PC class resources, predicates, subclass data, prerequisite chains, or prose-only rules. Do not claim that copying JSON supplies those systems.

Implementation can begin with selection reliability, then automatic dependency completion and compatible reselection. Publication must be cohesive: do not release expanded successful feat conversion until the dependency/execution gate and bounded automatic recovery behavior are ready. Diagnostics-only changes that do not expand execution may be shipped separately after review. Short IDs are a reliability improvement, not a proven reconstruction or fix of this particular missing response. Delegate bounded alias/diagnostic/UI work to Luna, source-dependent dependency/execution work to Terra, and audit every finished slice with Astra. Run the repository regressions and syntax checks; use installed PF2e live QA for mechanics. Publication, if implementation is subsequently requested, follows the already authorized PR → CI → merge → release → SimplyPF2e-only Foundry update route.

## Source evidence

Inspected current master and the installed 8.5.0 source. Parent independently fetched the three feat documents and the native actor/item/grant boundaries.

- [Crane Stance, PF2e 8.5.0](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/feats/class/monk/level-1/crane-stance.json): `"level": { "value": 1 }`, empty rules, linked `selfEffect`.
- [Stunning Blows, PF2e 8.5.0](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/feats/class/monk/level-2/stunning-blows.json): level 2, prerequisite `Flurry of Blows`, `RollOption` and `Note` rules.
- [Deflect Projectile, PF2e 8.5.0](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/feats/class/monk/level-4/deflect-projectile.json): level 4, conditional `FlatModifier`, explicit `deflect-projectile` roll option.
- [Flurry of Blows action](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/actions/class/monk/flurry-of-blows.json) and [class feature](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/flurry-of-blows.json): distinct exact sources; action versus feat; both have empty rules arrays. Parent independently fetched both.
- [Crane stance effect](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/feat-effects/stance-crane-stance.json): published effect with Strike, AC modifier, Note and RollOption rules.
- [NPC item types](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/module/actor/npc/document.ts#L36-L38): allowed additions include `action` and exclude `feat`.
- [Feat preparation](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/module/item/feat/document.ts#L150-L153): `if (!actor?.isOfType("character")) throw ErrorPF2e("Feats much be embedded in PC-type actors");`.
- [Default item roll options](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/module/item/base/document.ts#L159): `getRollOptions(prefix = this.type, ...)`; [action preparation](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/module/item/ability/document.ts#L52-L60) does not perform feat actor preparation.
- [GrantItem preparation](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/module/rules/rule-element/grant-item/rule-element.ts#L206): `tempGranted.prepareActorData?.()` runs on the original granted item type.
- Repository trace: `compendium.mjs` exact-name candidate cap and `getFeatCandidates`; `ai.mjs` `selectCreatureFeats`; `generator-app.mjs` `#refineCreatureFeats`; `builder.mjs` exact feat resolution and `featToAction`; `completion.mjs` `assertComplete`. Luna independently traced catalog/selection; Terra verified native source and conversion restrictions.

## Independent design review

Astra approved the initial diagnosis and required source-identity preservation at catalog admission, atomic mixed-valid/invalid handling, and a compatibility release gate. The user subsequently requested automatic prerequisite completion instead of manual consumer handling. This revision keeps those correctness requirements and replaces manual-reference/recovery with verified automatic dependency completion and bounded compatible reselection. Astra reviewed the automatic-dependency revision and independently checked both Flurry sources. Its two requested clarifications are incorporated: atomic failure uses bounded automatic recovery, and any new execution bridge must clone real Rule Elements without a hand-authored fallback. No other design blockers were reported; no implementation approval is inferred.
