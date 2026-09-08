# Automatic NPC abilities — implementation and verification

Implementation branch: `codex/npc-automatic-abilities`; publication/QA record: `codex/npc-automatic-abilities-qa`. SimplyPF2e **0.3.5.70** implements the [reviewed plan](npc-feat-plan-2026-09-09.md). Installation/native acceptance on Foundry 14.365 / PF2e 8.5.0 is tracked separately below.

Publication: [PR #110](https://github.com/simplyjaytea/simplyPF2e/pull/110), source `55bbccd68c8eeec7ebf1408d7fadc86760e774bb`, passed [CI 34257060796](https://github.com/simplyjaytea/simplyPF2e/actions/runs/34257060796) and merged as `d17a2b507070ed5f403a7bb70176b335f139f7fc`. [Auto Release 34257313518](https://github.com/simplyjaytea/simplyPF2e/actions/runs/34257313518) succeeded and published **v0.3.5.70**. Both release assets passed SHA-256 verification, the archive manifest matches the standalone manifest, and all 48 archive files match the merge except expected manifest stamping. The runtime package module is included; tests/fixtures are excluded. Setup updated only SimplyPF2e from .69 to .70 with a successful toast, relaunched the existing `test` world, and rejoined GM; Foundry 14.365 / PF2e 8.5.0, provider `omniroute / auto/best-free`, and 77 ready packs were preserved. One bounded focused native acceptance run succeeded.

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

## Focused native QA result

A single modified NPC15 run completed in 67 seconds with 12,103 reported provider tokens and no prerequisite dialogs. The original martial-artist tavern-proprietor prompt was augmented with `This NPC has the Stunning Blows feat.`; no preset, Common rarity, Standard treasure amount, and Allow spellcasting, Include equipment, and Include treasure all disabled. This was not an exact replay of the earlier provider request.

The run created **Innkeeper Veyra**, `Actor.jNqHlGaZ2W1mpepB`, at 275/275HP and AC37. Exactly one **Flurry of Blows**, `Item.eYAHuup1FYiLDAD1`, persisted from `Compendium.pf2e.actionspf2e.Item.nbfNETdpee8CVM17`; **Stunning Blows**, `Item.9jmKiWMVn0gVqeFj`, had a working toggle, native DC34 Fortitude link, incapacitation metadata, and Stunned 1/3 links to `Compendium.pf2e.conditionitems.Item.dfCMdR4wnpbYNTix`. The module supporting **Unarmed Strike**, `Item.p1lAOuYvRoAhUHpT`, was agile/nonlethal/unarmed at +28 with 3d8+17 damage (MAP +24/+20); its standard dialog roll produced 35. The Stunned 1 link opened the native condition sheet with full text. Provider-supplied Fist +30 lacked the unarmed trait and is not counted as the supported strike; Thrown Tankard +28 and two labeled narrative abilities were also present. No damage or condition was applied.

The preserved damage message `ChatMessage.6h0tk2Q8aGEuyUrO` contains the native Stunning Blows Note with DC34 Fortitude, `data-pf2-traits="incapacitation"`, and both Stunned links. After inspection, the condition window and generator were closed, the new NPC's Stunning toggle was restored to false, and the temporary browser viewport was reset. The NPC sheet remains available. The PR body includes the installed evidence and limits.

## Remaining native QA limits

1. Target-save and combat-turn behavior, including actual damage application and condition application, remain untested.
2. The generated summary reported compendium4/module-built currency/scrolls1/narrative2; inventory contents were not separately inspected.
3. This one modified run does not establish exact narrative fidelity, a universal NPC ability matrix, or support for Crane Stance (`Strike.replaceAll`), Deflect Projectile's hands-free predicate, arbitrary class resources/choices, or other excluded mechanics.
4. Existing QA artifacts remain preserved; total lower-bound provider spend is **306,374 tokens**. Do not infer broader native acceptance from this bounded result.

The .70 release is published and module-only installation succeeded; the bounded focused native QA run passed. Final local verification passes 88 regression files, 124 script syntax checks, manifest/localization JSON and whitespace. Release file selection includes the new runtime module and excludes tests/fixtures. The lifecycle tests cover successful cleanup and failed-cleanup survivors for NPCs and encounters; package tests cover exact-source overlap with direct abilities and native grants. These checks do not establish native Foundry behavior beyond the bounded result above.
