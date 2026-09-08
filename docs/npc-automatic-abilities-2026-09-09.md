# Automatic NPC abilities — implementation and verification

Implementation branch: `codex/npc-automatic-abilities`. Published baseline is SimplyPF2e 0.3.5.69 on Foundry 14.365 / PF2e 8.5.0. This record tracks implementation of the [reviewed plan](npc-feat-plan-2026-09-09.md); it is not a release or native acceptance claim.

## Consumer contract

Generation offers source-backed abilities whose supporting dependencies can be completed automatically. The module supplies those dependencies before creating the NPC. Supporting combat abilities count toward the ability budget. The NPC keeps its GM Core baseline statistics and uses normal Foundry combat controls.

One grounded selection from the supported catalog can replace an unsupported AI suggestion. Invalid provider replies stop at the ability-selection stage; they do not authorize arbitrary replacements or an unbounded retry loop. Named user requirements are bound locally to source names and cannot be erased by the provider. This binding does not claim to understand every mechanical requirement expressed in free-form prose.

## Source findings that affect implementation

- PF2e's NPC actor derives `attributes.classDC.value` from its level. The class statistic named `monk` is a separate PC capability.
- Stunning Blows' localized Note uses `@Check[fortitude|against:monk|name:Monk|traits:incapacitation|overrideTraits:true]`. Native text enrichment resolves `against` through `actor.getStatistic`; a missing statistic yields DC 0. A supporting Flurry action alone cannot fix that save.
- The verified Flurry class-feature source is `NLHHHiAcdnZ5ohc2`; its native action equivalent is `nbfNETdpee8CVM17`. Same display names alone do not establish equivalence.
- Crane Stance's linked effect has `Strike.replaceAll: true`. PF2e's Strike rule only enforces that restriction for character actors. It must not be declared fully supported merely because its strike and AC modifier appear on an NPC.

Source files were fetched for installed PF2e 8.5.0 and checked against available master native code: `actor/npc/document.ts`, `item/ability/document.ts`, `rules/rule-element/strike.ts`, `system/text-editor.ts`, `static/lang/re-en.json`, and the published Monk feat/action/effect documents. Master content-pack paths have moved; the installed-version content URLs remain authoritative for this QA target. The parent independently inspected the NPC DC, action preparation, Stunning Note, text-enrichment and Crane restriction source boundaries.

## Slice audit ledger

| Slice | Implementation | Independent Astra audit |
| --- | --- | --- |
| Source selection | Astra; source-preserving all-class catalogs, short private aliases, atomic response validation and usage retention | Approved. Focused regressions and all six scoped syntax checks passed; no P1/P2 findings. |
| Dependency and execution packages | Astra core implementation; Luna completed generator rollback and exact-source overlap fixes | Approved. All findings closed: active/dormant roles, latent power budget, Flurry source drift, melee support, native grant staging, duplicate grants, late source revalidation and cleanup survivors. Crane Stance, Deflect Projectile's hands-free predicate, and arbitrary class resources/choices remain fail-closed. |
| Automatic generator flow | Astra; focused generator tests passed | Approved after fixing two P2s. Narrative names no longer authorize feats; named encounter requirements stop before provider spend when member attribution cannot be proven. Caller/lifecycle regressions and scoped syntax checks passed on re-review. |

## Native QA to complete

1. Confirm the installed release version after updating only SimplyPF2e through Setup.
2. Generate the reported level-15 martial-arts tavern proprietor, verify creation and inspect the resulting source-backed abilities and dependencies.
3. Generate an NPC explicitly requesting Stunning Blows. Verify Flurry support, usable unarmed attacks, the native save DC and incapacitation/condition links through ordinary Foundry controls.
4. Verify an unsupported explicitly named ability fails before document writes, and an optional unsupported suggestion can be replaced within the existing selection request.
5. Record exact versions, created artifact identities, provider spend and any native limitations. Preserve existing QA artifacts; do not infer universal class/feat support from these checks.

The .69 release remains installed pending publication. Final local verification passes 88 regression files, 124 script syntax checks, manifest/localization JSON and whitespace. Release file selection includes the new runtime module and excludes tests/fixtures. The lifecycle tests cover successful cleanup and failed-cleanup survivors for NPCs and encounters; package tests cover exact-source overlap with direct abilities and native grants. These checks do not establish native Foundry behavior. To respect the user's usage concern, live QA will use one focused level-15 martial-artist generation with an explicit Stunning Blows requirement, followed by native sheet/control inspection.
