# Wizard class-path fixtures

Fetched unchanged on 2026-10-26 from the official PF2e repository and compared byte for byte against a second download. Ref `pf2e-8.5.0` is the installed system version; `master` is used for one file only, to prove the guard in `scripts/class-paths.mjs` refuses a shape the module cannot stage. Publication and license metadata is retained in each file; fixtures are excluded from release archives. Facts and quoted lines: [wizard-research-2026-10-26.md](../../../docs/plans/wizard-research-2026-10-26.md).

Class and level-one class features (`pf2e-8.5.0`):

- [`wizard.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/classes/wizard.json): `system.items` lists four level-one features (Wizard Spellcasting, Arcane School, Arcane Bond, Arcane Thesis); `spellcasting` 1; key ability Intelligence.
- [`wizard-spellcasting.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/wizard-spellcasting.json): `GrantItem` of Cast a Spell; no choice.
- [`arcane-school.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/arcane-school.json): first bridge; one `ChoiceSet` with the single filter `item:tag:wizard-arcane-school`, flag `arcaneSchool`, then `GrantItem` of `{item|flags.system.rulesSelections.arcaneSchool}`.
- [`arcane-bond.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/arcane-bond.json): `GrantItem` of Drain Bonded Item; no choice.
- [`arcane-thesis.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/arcane-thesis.json): second bridge; single filter `item:tag:wizard-arcane-thesis`, flag `arcaneThesis`.

Schools and theses (`pf2e-8.5.0`, all tagged in `system.traits.otherTags`):

- [`school-of-battle-magic.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/school-of-battle-magic.json) and [`school-of-mentalism.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/school-of-mentalism.json): `wizard-arcane-school`, `rules: []` (closed, text-only).
- [`school-of-rooted-wisdom.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/school-of-rooted-wisdom.json): `ChoiceSet` over unlabelled `Compendium.` uuid choices (open; never offered).
- [`school-of-unified-magical-theory.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/school-of-unified-magical-theory.json): `ChoiceSet` with an object filter (open; never offered).
- [`runelord.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/runelord.json): `wizard-arcane-school` (rare, Lost Omens Rival Academies) with no `ChoiceSet` of its own, but a `GrantItem` of School of Thassilonian Rune Magic and a second `GrantItem` of Runelord Dedication gated by a `predicate` (level 2). The predicated grant fails the closed-path check by itself, and the granted school fails it again (open; never offered).
- [`school-of-thassilonian-rune-magic.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/school-of-thassilonian-rune-magic.json): granted by Runelord; a `ChoiceSet` over the seven sins (open). Present so the Runelord regression resolves the whole chain rather than failing on a missing document.
- [`spell-blending.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/spell-blending.json), [`spell-substitution.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/spell-substitution.json) and [`staff-nexus.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/staff-nexus.json): `wizard-arcane-thesis`, `rules: []` (closed, text-only).
- [`improved-familiar-attunement.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/improved-familiar-attunement.json): `wizard-arcane-thesis`; `GrantItem` of `Compendium.pf2e.feats-srd.Item.Familiar` plus rules with no choice (closed once its grant chain resolves).
- [`experimental-spellshaping.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/experimental-spellshaping.json): `wizard-arcane-thesis` with a `ChoiceSet` over an object filter (open; never offered).

Grant chain of Improved Familiar Attunement (`pf2e-8.5.0`):

- [`familiar.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/feats/class/shared-class-feats/level-1/familiar.json): `GrantItem` of `Compendium.pf2e.feats-srd.Item.Pet`.
- [`pet.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/feats/general/level-1/pet.json): `ActiveEffectLike` only; no choice.

Guard fixture (`master`):

- [`arcane-school-master.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/master/packs/classfeatures/arcane-school.json): the `choices.filter` has two entries (`item:tag:wizard-arcane-school` plus an `or` object) and the grant flag path is `flags.pf2e.rulesSelections.arcaneSchool`. `singlePathTag()` returns null for it, so the bridge would not be staged and PF2e would open a native dialog after a one-click build. The regression asserts that this shape throws before any write.

Precedent classes (`pf2e-8.5.0`), used to prove the guard leaves the classes that already build untouched:

- [`precedent/fighter-class.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/classes/fighter.json): Fighter: two level-one features, no bridge.
- [`precedent/reactive-strike.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/reactive-strike.json): Fighter level-one feature; `GrantItem` only.
- [`precedent/shield-block.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/shield-block.json): Fighter level-one feature; `GrantItem` only.
- [`precedent/rogue-class.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/classes/rogue.json): Rogue: Rogue's Racket bridge plus Sneak Attack and Surprise Attack.
- [`precedent/rogues-racket.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/rogues-racket.json): Rogue bridge; single filter `item:tag:rogue-racket`.
- [`precedent/sneak-attack.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/sneak-attack.json): Rogue level-one feature; no `ChoiceSet`.
- [`precedent/surprise-attack.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/surprise-attack.json): Rogue level-one feature; no `ChoiceSet`.
- [`precedent/thief.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/thief.json): A closed racket (`FlatModifier`, `ActiveEffectLike`).
- [`precedent/investigator-class.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/classes/investigator.json): Investigator: Methodology bridge plus three level-one features.
- [`precedent/methodology.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/methodology.json): Investigator bridge; single filter `item:tag:investigator-methodology`.
- [`precedent/on-the-case.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/on-the-case.json): Investigator level-one feature; `GrantItem` only.
- [`precedent/devise-a-stratagem.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/devise-a-stratagem.json): Investigator level-one feature; `GrantItem` only.
- [`precedent/strategic-strike.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/strategic-strike.json): Investigator level-one feature; `DamageDice` only.
- [`precedent/interrogation-methodology.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/interrogation-methodology.json): A closed methodology whose grant chain is the next two files.
- [`precedent/no-cause-for-alarm.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/feats/skill/level-1/no-cause-for-alarm.json): Granted by Interrogation; `rules: []`.
- [`precedent/pointed-question.json`](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/actions/class/investigator/pointed-question.json): Granted by Interrogation; `rules: []`.

`world.mjs` is the only code here: stand-ins for Foundry's compendium access (`game.packs`, `pack.getIndex/getDocument`, `fromUuid`) built from these files. The regressions (`tests/pc-wizard.class-paths.test.mjs`, `tests/pc-wizard.builder.test.mjs` and `tests/pc-wizard.generator.test.mjs`) use it to prove candidate discovery, staging payloads and refusals, and that `createCharacterActor` stages both bridges (or refuses) before `Actor.create`, and that a class whose bridges cannot be staged is not offered by the generator and a required one fails before any provider call. They do not prove live Foundry behavior; a Wizard build still needs a native pass on PF2e 8.5.0.
