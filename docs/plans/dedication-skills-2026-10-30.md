# Dedication replacement skills and the Bard signature-spell editor — 2026-10-30

Owner: Code Monkey. Branch `feat/dedication-skills`, base `main@129b2a1`. Two local commits, no push and no merge. No Foundry session, no provider/AI call; every test runs against the pinned 8.5.0 fixtures in `tests/fixtures/pc-caster/`.

## 1. Dedication replacement skills

### What the pinned data says

Both spellcasting archetypes the module supports name their trained skills twice: once as a cloned `ActiveEffectLike` rule, and once in the item description.

| Dedication | Rule (cloned, not authored) | Journal text | Source |
|---|---|---|---|
| Bard | `performance` and `occultism` → rank 1, `mode: "upgrade"` | "You become trained in Occultism and Performance; for each of these skills in which you were already trained, you instead become trained in a skill of your choice." | `tests/fixtures/pc-caster/bard-dedication.json:52-61` (rules), `:15` (text) |
| Wizard | `arcana` → rank 1, `mode: "upgrade"` | "You become trained in Arcana; if you were already trained in Arcana, you instead become trained in a skill of your choice." | `tests/fixtures/pc-caster/wizard-dedication.json:34-37` (rules), `:15` (text) |

For context, the wider 8.5.0 set trains skills the same way when the skill is fixed (Investigator → Society, Ranger → Survival); Fighter and Monk build the skill path through a `ChoiceSet` and are not fixed-path dedications. The helper applies to every dedication the builder places, not only the two spellcasting archetypes (`scripts/pc-caster-archetype.mjs:58-105`): QA ran it on the real 8.5.0 dedications in the noncaster multiclass catalog, and Barbarian (Athletics), Investigator (Society) and Ranger (Survival) also gain one replacement on overlap, as their published text says. Fighter and Monk build the path from a ChoiceSet and gain none (fail closed). Only Bard and Wizard have builder tests.

### What pf2e does with an overlap

`upgrade` is `Math.max(current ?? 0, change)` (`/tmp/pf2e-pf2e-8.5.0/src/module/rules/rule-element/ae-like.ts:197-205`). Training an already-trained skill therefore does nothing: no flag, no second grant, no replacement. The replacement is published text only, and the module has to spend it.

### Change

- `scripts/pc-skills.mjs:61` `dedicationSkillTraining(featSystem)` reads only the feat's own `ActiveEffectLike` rules with `mode: "upgrade"`, a literal `system.skills.<skill>.rank` path and value 1. It deliberately ignores `ChoiceSet`-built paths (`{item|...}`): those cannot be resolved before the choice is made, so such a dedication contributes nothing (fail closed).
- `scripts/pc-skills.mjs:81` `dedicationSkillReplacements(featSystems, trainedRanks)` counts one replacement for each trained skill already at rank ≥ 1 in the initial ABC ranks.
- `scripts/pc-builder.mjs:1101-1103` adds that count to the same `replacements` budget that class/background duplicates already use, for `multiclassFeatInfo(name).role === "dedication"` only. The rank itself still comes from the cloned rule; the extra choice is allocated by the ordinary priority order, so the result is deterministic and identical to the existing replacement mechanism.

No new numbers are written: the rule's value comes from the cloned item, and the extra trained skill is a normal budget pick.

### Tests

- `tests/pc-skills.test.mjs`: pure helper cases (Bard two-skill rule, Wizard one-skill rule, a non-upgrade/ChoiceSet path contributes nothing, no overlap contributes nothing).
- `tests/pc-builder.dedicationSkills.test.mjs`: real fixtures through `createCharacterActor`, with a native stand-in that applies embedded `upgrade` rules as pf2e does.
  - Bard with Occultism already trained: budget 4, Occultism/Performance stay 1, the fourth pick is Arcana, one extra only.
  - Wizard with Arcana already trained: budget 4, Arcana stays 1, the fourth pick is Crafting.
  - Bard with no overlap: budget 3, no fourth skill.
- Fail-before on `main@129b2a1`: both suites fail (missing export; budget 3 where 4 is required).

## 2. Bard signature-spell editor control

### Behavior

- The plan stores the pick as `concept.archetypeSpellcasting.signature` (a spell name). Absent means "the deterministic default": `chooseSignatureIndexes` picks the first ranked spell of the lowest rank.
- `scripts/pc-caster-archetype.mjs:179` `signatureSpellName(spells, signatures, stored)` accepts a stored name only while it is still a ranked (rank ≥ 1) repertoire spell; a stale name yields `null`, never a silent substitution.
- `scripts/pc-caster-archetype.mjs:218` `archetypeSignatureControl(plan)` exists only while the held plan allows a signature (Bard's Basic feat at level 6) and lists exactly the resolved, ranked repertoire spells. Cantrips and vanished entries are not offered. It lives here, not in `pc-editor.mjs`, to avoid an import cycle.
- `scripts/pc-editor.mjs:89-90` exposes the control; `scripts/pc-edit.mjs:435-442` applies the edit, accepting only an offered value and recomputing nothing else (the flag depends on no slot).
- `scripts/generator-app.mjs:598-601` adds the form control beside the muse; `#archetypeSpellRows` marks the stored pick, else the same default.
- Create revalidates before `Actor.create` (`scripts/pc-builder.mjs:1619-1644`): a stored pick must be a string, the plan must allow a signature, exactly one held ranked spell must match, and its identity must be found; otherwise it throws `SIMPLYPF2E.Errors.PCArchetypeSignature*`. `assembleCasterArchetypeEntry` (`scripts/pc-caster-archetype.mjs:321-322`) also throws if handed an identity the entry does not hold, so there is no fallback.
- `lang/en.json`: `SIMPLYPF2E.PCEdit.ArchetypeSignature`, `SIMPLYPF2E.Errors.PCArchetypeSignature`, `...SignatureNoSlot`, `...SignaturePick`; the Bard preview note now mentions the modeled replacement skill.

### Tests

- `tests/pc-caster-archetype.test.mjs`: `signatureSpellName` (default, stored pick, stale, cantrip, no allowance), the control's exact options/selection at 6 and absence at 4, and entry assembly for the chosen and missing identity.
- `tests/pc-editor.test.mjs`: control name/trim/blank, stored pick, stale placeholder, pending clears, no control before level 6.
- `tests/pc-edit.test.mjs`: valid edit, no-op, input immutability, stale/cantrip/non-string/no-slot/absent-plan refusals (`PC_EDIT_INVALID`), completion errors.
- `tests/pc-builder.bardArchetype.test.mjs`: chosen "Mirror Image" is the only signature; no pick keeps "Fear"; "Fireball"/"Detect Magic"/non-string and a level-4 pick fail before `Actor.create` with no actor or item written.
- `tests/generator-app.casterArchetype.test.mjs`: level 6 shows the control with `[Fear, Mirror Image]` and "Fear" selected; level 4 shows none.
- Fail-before on `main@129b2a1`: the export/control/edit tests fail with "unknown editor control", "not an editable PC field" or missing exports; the Bard builder test marks "Fear" instead of the pick; the generator test finds no control.

## Mutations (all killed)

| Mutation | Killed by | Observed |
|---|---|---|
| Drop `replacements += dedicationSkillReplacements(...)` | `pc-builder.dedicationSkills` | budget 3, expected 4 |
| Replacement helper never counts an overlap | `pc-builder.dedicationSkills` | budget 3, expected 4 |
| Replacement helper counts every dedication skill (no overlap test) | `pc-builder.dedicationSkills` | budget 5, expected 4 |
| `signatureSpellName` ignores the stored pick | `pc-caster-archetype` | "Fear", expected "Mirror Image" |
| Create skips stored-signature validation | `pc-builder.bardArchetype` | "Fear" written, expected "Mirror Image"; later stale cases do not throw |
| Control offers cantrips (`rank < 0`) | `pc-caster-archetype`, `generator-app.casterArchetype` | options include "Detect Magic" |
| `assembleCasterArchetypeEntry` always uses the default | `pc-builder.bardArchetype` | "Fear", expected "Mirror Image" |
| Drop the no-slot check at Create | `pc-builder.bardArchetype` | a level-4 pick is accepted (missing expected rejection) |

## Lead follow-up (QA findings, same branch)

QA approved with four LOW/MEDIUM-LOW findings. Closed in a third commit:

- Role guard pinned: `tests/pc-builder.dedicationSkills.test.mjs` holds the real 8.5.0 ancestry feat Adroit Manipulation (literal Thievery upgrade, fixture blob SHA matched) beside a class-trained Thievery; the budget stays 3. Removing the `role === "dedication"` guard now fails it (QA mutation O4).
- Preview marks the stored pick (`tests/generator-app.casterArchetype.test.mjs`, O14 now killed); a signature edit triggers no identity refresh (`tests/pc-edit.test.mjs`, O16 now killed).
- Same-named ranked spells: the control no longer offers an ambiguous name, a stored ambiguous pick is stale (`signatureSpellName` requires exactly one match), the preview marks one row only, and the control's default is computed over every ranked spell so it equals the spell Create marks.
- This record no longer claims only Wizard and Bard are affected.

## Known gaps

- Timing: the replacement joins the level-1 training budget although the dedication arrives at level 2 or later. QA swept levels 3–19 and no skill increase lands on it; LOW, cosmetic.
- Investigator Dedication also grants "another skill of your choice" beyond the replacement for an already-trained Society. The module supports only the Wizard and Bard archetypes, and the helper models the replacement-for-overlap rule only; a future Investigator archetype would need that extra pick modeled separately.
- A dedication whose training comes from a `ChoiceSet` path (Fighter, Monk) contributes no replacement. That is deliberate fail-closed behavior and is covered by the helper test.
- The native stand-in applies embedded `upgrade` rules like pf2e's `Math.max`; no live Foundry session was run.

## Gate

`PATH=/var/lib/openbot/OpenBot/Shared/.tools/node22/bin:$PATH node tools/check.mjs </dev/null`

`Syntax passed: 64 scripts, 177 tests, 4 tooling files` · `Integrity passed: 464 imports, 1175 exports, 15 templates, 681 localization keys; 0 unused keys` · `Links passed: 249 links in 71 files` · `Regressions passed: 177 files` · `Manifest/localization JSON passed; Node v22.23.4`

## Extra unconditional training (mini-batch)

Scanned the seven supported multiclass dedications (Fighter, Investigator, Barbarian, Monk, Ranger, Wizard and Bard) in pinned pf2e 8.5.0. Only Investigator has an unconditional unrestricted extra skill in addition to a named skill. `investigator-dedication` adds one to the existing training budget: `packs/pf2e/feats/archetype/investigator/investigator-dedication.json`, “You become trained in Society and another skill of your choice.” Its Society overlap replacement remains additive, so an existing Society rank produces two choices. The other six descriptions grant conditional replacements, already handled separately, or a bounded choice, not an unconditional extra.

The byte-identical source fixture and provenance live in `tests/fixtures/pc-caster/`. The builder test asserts no overlap +1 and Society overlap +2; its prior Bard case checks +0. This test fails on feb0e31 (3 vs 4) and passes with the change. `tests/miniBatch.test.mjs` pins the table and source sentence.
