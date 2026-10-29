# Bard spellcasting archetype (2026-10-30)

Branch `feat/bard-archetype`, base `main@728aaa0`. Spec: `docs/plans/caster-archetype-next-2026-10-30.md` (branch `docs/caster-archetype-next`, `fb76691`). Follows the Wizard record, [caster-multiclass-2026-10-30.md](caster-multiclass-2026-10-30.md): a plain `spellcastingEntry` built as document data, no hand-authored Rule Element, the AI picks ids only.

## Spike findings (both risks resolved; Bard is buildable)

Source: `pf2e-8.5.0`, fixtures `tests/fixtures/pc-caster` (blob SHAs match upstream).

**1. The muse ChoiceSet.** The Bard Dedication (`feats/archetype/bard/level-2/bard-dedication.json`) carries, in order, a `ChoiceSet` (`flag: dedicationMuse`, `choices: { filter: ["item:tag:bard-muse", { not: "item:tag:class-archetype" }], slugsAsValues: true }`), a `RollOption` `feature:{item|flags.system.rulesSelections.dedicationMuse}`, and two `ActiveEffectLike` skill upgrades. No `GrantItem`.

The spec said to persist the answer in `flags.pf2e.rulesSelections.dedicationMuse`. That is not where pf2e stores it. `src/module/rules/rule-element/choice-set/rule-element.ts`:

- the constructor reads the answer from the rule source: `this.selection = typeof data.selection === "string" || ... ? data.selection : null;`;
- when `selection` is set it assigns the derived item flag at preparation: `this.item.flags[SYSTEM_ID].rulesSelections[this.flag] = this.selection;` and sets the roll option (`#setRollOption`);
- `preCreate` persists a prompt answer by `this.selection = ruleSource.selection = selection.value;` and, when a matching `selection` is already present, skips the prompt (`#getPreselection`: `R.isDeepEqual(this.selection, c.value)`), also skipping choice validation (`inflateChoices`: `const validate = R.isNullish(this.selection)`).

So the native persisted form is `system.rules[i].selection = "<slug>"`, the flag and roll option follow. The module already uses this field for static ChoiceSets (`choice-set.mjs`). `applyArchetypeChoice` writes only `selection`, on the one ChoiceSet whose flag is `dedicationMuse` (it throws if there is not exactly one), and leaves every other member of every rule unchanged. The answer is the slug of the muse's name, which is the value `queryCompendium` returns with `slugsAsValues` (`value: choices.slugsAsValues ? (f.slug ?? sluggify(f.name)) : f.uuid`); the 8.5.0 muse features have a null `system.slug`, so the name's slug is used. Because the preselection skips validation, the module re-validates the answer itself at Create against the live `bard-muse` class features.

Muses at 8.5.0 (`packs/pf2e/class-features`, tag `bard-muse`): Enigma, Maestro, Polymath, Warrior (Player Core), Zoophonia (Howl of the Wild). None is tagged `class-archetype`.

**2. Signature spells.** `src/module/item/spell/data.ts`: `location: { value, signature?: boolean, heightenedLevel?, ... }`. `src/module/item/spellcasting-entry/collection.ts` 262–280: `canHaveSignatureSpells = this.entry.isSpontaneous || isFlexible`, signature spells are those with `s.system.location.signature`, shown at each rank group they fit. `spell/document.ts` 695: a spontaneous entry's signature spell gets the `signature` roll option. The module already writes `system.location.signature = true` for class signature spells (`pc-builder.mjs`). The journal gives the allowance: Basic, "At 6th level ... if you have a spell repertoire, you can select one spell from your repertoire as a signature spell". No new field or shape is needed.

## What was built

| Piece | Where | Behavior |
| --- | --- | --- |
| Table | `pc-caster-archetype.mjs` `CASTER_ARCHETYPES.bard` | occult, `cha`, `spontaneous`, 2 repertoire cantrips, 0 cantrip slots, 1 spell per rank, `signatureFromLevel: 6`, ChoiceSet definition (flag, tag, excluded tag, default `maestro`) |
| Plans | `casterArchetypePlans` | Basic adds one slot and one spell at ranks 1/2/3 at levels 4/6/8 (shared with Wizard); `signatures` is 1 from level 6 with Basic |
| Entry | `assembleCasterArchetypeEntry` | spontaneous, non-flexible, `proficiency.value: 1`, slots `value = max`, no prepared slots; signature flag on the spell chosen by `chooseSignatureIndexes` (first spell of the lowest ranked rank, the same function the preview uses) |
| Muse options | `eligibleArchetypeChoices`, `casterArchetypeChoiceOptions` (`pc-builder.mjs`) | the dedication's own filter over `getClassFeatureCandidates("bard-muse")` (which now also returns `tags`); `defaultArchetypeChoice` takes Maestro only while eligible, never another |
| Catalog | `pc-multiclass.mjs` | Bard Dedication (Charisma +2), Basic Bard Spellcasting; Expert and Master Bard Spellcasting listed unavailable (master/legendary Occultism); a second spellcasting archetype is refused (defence in depth: the lock already blocks it, since a caster package has one feat) |
| Plan and preview | `generator-app.mjs` | `concept.archetypeSpellcasting.choice` (options, value); preview shows the muse, the repertoire and the signature spell, and a Bard-specific note |
| Create | `pc-builder.mjs` | before anything is written: the muse must still be an eligible answer (`SIMPLYPF2E.Errors.PCArchetypeChoice`); the answer is written to the dedication's ChoiceSet `selection`; the repertoire is revalidated as for Wizard |
| Completion | `completion.mjs` | an `archetype-choice` record, unresolved while the answer is missing or not listed |
| Editor | `pc-edit.mjs`, `pc-editor.mjs`, `generator-app.mjs` | a new `archetypeChoice` value edit (only listed answers; no recompute); completion errors on a missing or ineligible answer; the Bard feats themselves stay uneditable |

The AI is unchanged: it returns candidate ids for the module's plan (the prompt says "repertoire" for Bard), picks no muse, rank, count or number.

## Verification

Tests: `pc-caster-archetype.test.mjs` (Bard table pinned to the feat and journal text, plans by level, signature rules, option filtering and default, `applyArchetypeChoice`, entry), `pc-builder.bardArchetype.test.mjs` (real dedication cloned, the answered `selection` is the only change, no muse feature or starting feat, entry and signature at level 8, no signature at 4, dedication only, and nothing written for a missing, ineligible or `class-archetype` muse, a removed pick, an arcane-only spell or a changed rank), `pc-builder.casterCandidates.test.mjs`, `generator-app.casterArchetype.test.mjs`, `pc-edit.test.mjs`, `pc-editor.test.mjs`, `completion.test.mjs`. Bard was unavailable before this change, so these fail on the base by construction.

Revert checks: 18 mutations, all killed (selection not written; Create validation skipped; `class-archetype` not excluded; default falls back to the first muse; signature from level 4; signature on the highest rank; signature flag not set; tradition arcane; prepared mode; three cantrips; Charisma minimum 1; editor accepts any muse; completion ignores the choice; generator takes the first muse; muse control not offered; second-caster guard removed; editor selection missing; "repertoire" wording dropped).

## Gaps

- Not native-accepted (rows N55, N56). The preselected `selection` suppressing the prompt, the resolved `feature:<muse>` roll option and the signature display are read from source, not observed.
- Replacement skills when Occultism or Performance is already trained are not chosen (same gap as the other dedications).
- Expert and Master Bard Spellcasting are unavailable. The editor cannot edit the repertoire.
- Muse features beyond the dedication's own (the starting feat, the muse spell) are deliberately not granted, as the feat text says.
- One extra provider call per run that holds the dedication, as for Wizard.
