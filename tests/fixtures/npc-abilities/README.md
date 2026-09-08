# Native NPC ability source fixtures

Unchanged JSON fetched from `foundryvtt/pf2e` tag `pf2e-8.5.0` on 2026-09-09. Publication and license metadata are retained in each document. These are test inputs; the module always loads installed source documents at runtime.

Base URL: https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/

| Fixture | Upstream path |
| --- | --- |
| stunning-blows.json | packs/pf2e/feats/class/monk/level-2/stunning-blows.json |
| flurry-of-blows.json | packs/pf2e/actions/class/monk/flurry-of-blows.json |
| flurry-class-feature.json | packs/pf2e/class-features/flurry-of-blows.json |
| crane-stance.json | packs/pf2e/feats/class/monk/level-1/crane-stance.json |
| stance-crane-stance.json | packs/pf2e/feat-effects/stance-crane-stance.json |
| deflect-projectile.json | packs/pf2e/feats/class/monk/level-4/deflect-projectile.json |
| nimble-dodge.json | packs/pf2e/feats/class/rogue/level-1/nimble-dodge.json |
| sudden-charge.json | packs/pf2e/feats/class/shared-class-feats/level-1/sudden-charge.json |
| stunned.json | packs/pf2e/conditions/stunned.json |

The test's localized Stunning Blows Note is copied from `static/lang/re-en.json`, `PF2E.SpecificRule.Monk.StunningFist.Note`: `@Check[fortitude|against:monk|name:Monk|traits:incapacitation|overrideTraits:true]` with the native Stunned UUID and its Stunned 1 / Stunned 3 labels.

Native behavior was inspected against both tag 8.5.0 and master source (master pack paths above returned 404):

- `src/module/actor/npc/document.ts`: `attributes.classDC` uses the native level-based DC and elite/weak adjustment; `syntheticWeapons.flatMap((w) => w.toNPCAttacks({ keepId: true }))` supplies native melee attacks.
- `src/module/actor/base.ts`: `getRollData()` returns `{ actor: this }`; `attributes` returns `this.system.attributes`.
- `src/module/system/text-editor.ts`: `actor.getStatistic(params.against)?.clone({ rollOptions })` and `statistic?.dc.value ?? 0` explain why `against:monk` fails on NPCs. `dc.startsWith("resolve")` and `Roll.replaceFormulaData(resolveString, rollData)` support the cloned Note's native class-DC expression.
- `src/module/rules/rule-element/strike.ts`: `if (this.ignored || !this.actor.isOfType("character")) return;` in `afterPrepareData()` means `replaceAll` stance restrictions are not implemented for NPCs. Crane Stance is rejected.
- `src/module/rules/rule-element/grant-item/rule-element.ts`: `tempGranted.prepareActorData?.()` runs before creation on the original type; `allowDuplicate` defaults to true. Raw feat grants, choices, conditional grants, and duplicating grants are rejected.

Local regressions verify source traversal, conversion data, controls encoded in source text/rules, and transaction contracts. They do not execute PF2e's actual strike/save/condition controls. Native Foundry QA remains required.
