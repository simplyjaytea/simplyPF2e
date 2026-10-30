# Caster-archetype fixtures

Copied unchanged from the `pf2e-8.5.0` tree (`foundryvtt/pf2e`, the installed system version). Each file's git blob SHA was compared with `gh api repos/foundryvtt/pf2e/contents/<path>?ref=pf2e-8.5.0` on 2026-10-30 and matched. Fixtures are excluded from release archives. Record: [caster-multiclass-2026-10-30.md](../../../docs/plans/caster-multiclass-2026-10-30.md).

Feats (`packs/pf2e/feats/archetype/wizard/`): `wizard-dedication.json` (level 2, prerequisite "Intelligence +2", one Rule Element: Arcana rank), `basic-wizard-spellcasting.json` (level 4), `expert-wizard-spellcasting.json` (level 12, "master in Arcana"), `master-wizard-spellcasting.json` (level 18, "legendary in Arcana"). None creates a spellcasting entry.

`archetypes-spellcasting-page.json`: the "Spellcasting Archetypes" page (`DOc3Pf8wmVxanTIv`) of `packs/pf2e/journals/archetypes.json`, extracted with its journal id and name; the page object is unchanged. It carries the slot progression the module's table transcribes.

Spells (`packs/pf2e/spells/spells/`): cantrips `detect-magic`, `electric-arc`, `light`, `telekinetic-projectile`; rank 1 `fear`, `grim-tendrils`; rank 2 `mirror-image`; rank 3 `fireball`. All common and arcane.
Also (fix/caster-gate): rank 2 `invisibility`, `web`; rank 3 `lightning-bolt`, same provenance (blob SHAs matched).

Bard (feat/bard-archetype), same provenance (blob SHAs matched `pf2e-8.5.0`): `bard-dedication.json` (`feats/archetype/bard/level-2/`), `basic-bard-spellcasting.json` (`level-4/`), `expert-bard-spellcasting.json` (`level-12/`), `master-bard-spellcasting.json` (`level-18/`); the five bard muses `enigma`, `maestro`, `polymath`, `warrior`, `zoophonia` (`packs/pf2e/class-features/`, tag `bard-muse`); spell `haste` (rank 3, arcane/occult/primal).

Dedication skills (feat/dedication-skills), same provenance (blob SHA `5f3379aa` matched `pf2e-8.5.0`): `adroit-manipulation.json` (`packs/pf2e/feats/ancestry/halfling/level-1/`), an ancestry feat with a literal Thievery `ActiveEffectLike` upgrade, used to pin that only a dedication's overlap grants a replacement skill.
