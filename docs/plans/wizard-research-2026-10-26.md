# Wizard as a complete-only PC class — upstream research record (2026-10-26)

Read-only research by a Haiku 5.5 worker, verified against `https://raw.githubusercontent.com/foundryvtt/pf2e/<ref>/...` at `pf2e-8.5.0` (installed) and `master`. Path discovery used the GitHub trees API. The downloaded copies and the mirror script were kept outside the repo. Nothing was executed in Foundry.

## Corrections to assumptions

1. At `pf2e-8.5.0` the source JSON lives under `packs/pf2e/` (`packs/pf2e/classes/wizard.json`, `packs/pf2e/class-features/<slug>.json`, `packs/pf2e/journals/classes.json`). `master` uses `packs/classes/`, `packs/classfeatures/`, `packs/journals/`.
2. No class-feature file has `system.slug` at either ref.
3. "Drain Bonded Item" is an action granted by Arcane Bond, not a class item. The Wizard class lists four level-1 items: Wizard Spellcasting, Arcane School, Arcane Bond, Arcane Thesis.
4. Six 8.5.0 schools are absent from master (Breathtaking Influence, Gates, Kalistrade, Keen Inquiry, Nexian Spaces, Quantic Control).

## 1. Class document (byte-identical at both refs, `_id RwjIZzIxzPpUglnK`)

```json
"13v1o": {"level": 1, "name": "Wizard Spellcasting", "uuid": "Compendium.pf2e.classfeatures.Item.Wizard Spellcasting"},
"3XT0E": {"level": 1, "name": "Arcane School", "uuid": "Compendium.pf2e.classfeatures.Item.Arcane School"},
"45yt7": {"level": 1, "name": "Arcane Bond", "uuid": "Compendium.pf2e.classfeatures.Item.Arcane Bond"},
"QLL2z": {"level": 1, "name": "Arcane Thesis", "uuid": "Compendium.pf2e.classfeatures.Item.Arcane Thesis"}
```
```json
"spellcasting": 1,
"keyAbility": {"value": ["int"]},
"trainedSkills": {"additional": 2, "value": ["arcana"]},
"publication": {"license": "ORC", "remaster": true, "title": "Pathfinder Player Core"},
"rules": []
```
UUIDs use the name form (`Item.Arcane School`), as Rogue and Fighter do at 8.5.0. `spellcasting` is the starting proficiency rank (`src/module/item/class/data.ts` lines 16-17 on master).

## 2. Level-1 class features (all `type: "feat"`, `category: "classfeature"`, `remaster: true`)

- **Wizard Spellcasting** (`S6WW4Yyg4XonXGHD`, identical at both refs): `rules: [{"key": "GrantItem", "uuid": "Compendium.pf2e.actionspf2e.Item.Cast a Spell"}]`.
- **Arcane School** (`7nbKDBGvwSx9T27G`). 8.5.0:
  ```json
  "rules": [
    {"adjustName": false, "choices": {"filter": ["item:tag:wizard-arcane-school"]}, "flag": "arcaneSchool", "key": "ChoiceSet", "prompt": "PF2E.SpecificRule.Wizard.ArcaneSchool.Prompt"},
    {"key": "GrantItem", "uuid": "{item|flags.system.rulesSelections.arcaneSchool}"}
  ]
  ```
  master: the filter is `["item:tag:wizard-arcane-school", {"or": [{"and": ["class:wizard", "item:tag:wizard-arcane-school"]}, {"and": ["item:tag:wizard-arcane-school", {"not": "item:tag:class-archetype"}]}]}]` (two entries) and the grant flag is `flags.pf2e.rulesSelections.arcaneSchool`.
- **Arcane Bond** (`au0lwQ1nAcNQwcGh`). 8.5.0: `rules: [{"key": "GrantItem", "uuid": "Compendium.pf2e.actionspf2e.Item.Drain Bonded Item"}]`. master adds `"predicate": [{"not": "feature:improved-familiar-attunement"}]`.
- **Arcane Thesis** (`M89l9FOnjHe63wD7`). Both refs: `"choices": {"filter": ["item:tag:wizard-arcane-thesis"]}`, `"flag": "arcaneThesis"`, GrantItem `{item|flags.<system|pf2e>.rulesSelections.arcaneThesis}`.

Tagged options at 8.5.0 (875 class-feature files scanned on `system.traits.otherTags`):

| Feature | otherTags | rules |
|---|---|---|
| Spell Blending, Spell Substitution, Staff Nexus | `wizard-arcane-thesis` | `[]` |
| Improved Familiar Attunement | `wizard-arcane-thesis` | ActiveEffectLike, GrantItem (Familiar), ItemAlteration x2 |
| Experimental Spellshaping | `wizard-arcane-thesis` | ChoiceSet (object filter), GrantItem template |
| 14 schools: Red Mantis Magic, Ars Grammatica, Battle Magic, Civic Wizardry, Gates, Kalistrade, Keen Inquiry, Magical Technologies, Mentalism, Nexian Spaces, Protean Form, Quantic Control, the Boundary, the Reclamation | `wizard-arcane-school` | `[]` |
| School of Rooted Wisdom | `wizard-arcane-school` | ChoiceSet (unlabelled uuids), GrantItem template |
| School of Unified Magical Theory | `wizard-arcane-school`, `wizard-elemental-school` | ChoiceSet (object filter), GrantItem template |
| Runelord | `class-archetype`, `wizard-arcane-school` | GrantItem x2 (one predicated on level ≥ 2), ItemAlteration, MartialProficiency |
| Thassilonian Rune Magic, Breathtaking Influence | none | (not candidates) |
| Elemental School | `wizard-elemental-school` only | (not a candidate) |

## 3. Eligibility against `scripts/class-paths.mjs` (8.5.0)

`singlePathTag()` needs exactly one ChoiceSet whose `choices.filter` is a single `item:tag:` string with no `predicate`/`allowNoSelection`/`allowedDrops`/`ignored`. Candidates need every own ChoiceSet static with a normalisable flag and `descendantsHaveNoChoices` true. `choiceSetOptions` returns null for an object `choices` without a string `config`, and `choicesFromData` returns null for an unlabelled `Compendium.` uuid choice.

| Feature | Single tag filter | Static choices | Descendants choice-free | Verdict |
|---|---|---|---|---|
| Arcane School (bridge) | yes at 8.5.0; **no at master** (two-entry filter) | n/a | n/a | Eligible bridge at 8.5.0 only |
| Arcane Thesis (bridge) | yes at both refs | n/a | n/a | Eligible bridge |
| 14 closed schools | no ChoiceSet | vacuous | yes | Eligible |
| Rooted Wisdom, Unified Magical Theory, Runelord | — | no | no | Not eligible (fail closed) |
| Improved Familiar Attunement | no ChoiceSet | n/a | yes if name-form uuids resolve: Familiar → Pet (ActiveEffectLike only) | Eligible, conditional |
| Spell Blending, Spell Substitution, Staff Nexus | `rules: []` | yes | yes | Eligible (text-only effects) |
| Experimental Spellshaping | object filter | no | no | Not eligible |

Mirror counts (script over the downloaded pack, not a Foundry run): 8.5.0 offers 14 schools and 4 theses; master would recognise no school bridge and offers 9 closed schools behind a filter shape the module does not accept. Precedent: Rogue's Racket `{"filter": ["item:tag:rogue-racket"]}`, Methodology `{"filter": ["item:tag:investigator-methodology"]}`; Fighter has no bridge.

## 4. Curriculum

Prose only at both refs. Wizard Spellcasting: "…prepare up to two 1st-rank spells and five cantrips each morning from the spells in your spellbook (see below), as well as one extra curriculum cantrip and one extra curriculum spell of each rank you can cast from your arcane school." Class journal: "Each day, you can prepare an extra cantrip from your curriculum. You also gain an extra spell slot at each spell rank for which you have wizard spell slots. You can prepare only spells from your school's curriculum in these extra slots." School curricula are `@UUID` links in the school description (e.g. Battle Magic: "Curriculum cantrips: @UUID[Compendium.pf2e.spells-srd.Item.Shield], …", "School Spells initial: @UUID[Compendium.pf2e.spells-srd.Item.Force Bolt]"). No rule element writes a spell-slot path for any Wizard feature; the only curriculum rule in the pool is the Thassilonian `ItemAlteration` that tags spells `runelord-curriculum-spell`. `src/module/item/spellcasting-entry/*` and `src/module/actor/character/*` contain no `curriculum`, `arcaneSchool`, `wizard` or `spellbook` (the only "school" is the Pathfinder Society field).

## 5. Spellbook and prepared entries

`src/module/item/spellcasting-entry/document.ts` (identical logic at both refs): `isPrepared` is `system.prepared.value === "prepared"`; `prepareBaseData` pads each `slotN.prepared` to `max` with `{ id: null, expended: false }`; the entry's spells are `actor.itemTypes.spell.filter((s) => s.system.location.value === this.id)`; prepared casting matches the spell `id` inside `system.slots[slotKey].prepared`. `collection.ts` renders prepared rows from `group.prepared.map((slot) => this.get(slot.id))` and lists every spell in the entry by `baseRank`. **A Wizard's spellbook is the set of spell items located in the entry; `prepared` arrays point at the prepared subset. Nothing else stores known spells.** The `book` item type (`category: "formula" | "spell"; capacity; contents: ItemUUID[]`) exists but no consumer was found in the fetched code; the published "Spellbook (Blank)" is `type: "equipment"`.

`scripts/pc-builder.mjs` lines 947-1043 already build exactly this shape for Cleric/Druid/Witch (prepared entry, `slots[slotN].prepared.push({ id, expended: false })`, every embedded spell occupies a slot). It matches the native model.

## 6. Class table (journal page `wDukeO3euLEGn6FA`, identical at both refs)

Levels 1-3: `1 | 5 cantrips | 2 first-rank`, `2 | 5 | 3`, `3 | 5 | 3 | 2`. `pcSpellSlots(level, {baseSlots: 2})` in `pc-tables.mjs` yields the same values (checked by reading).

## 7. Familiar

No native familiar from the class or its level-1 features. Improved Familiar Attunement grants `Compendium.pf2e.feats-srd.Item.Familiar` (which grants `Pet`, `ActiveEffectLike` on `system.attributes.familiarAbilities.value`) and at 8.5.0 alters the Drain Bonded Item action's name and description; master instead grants Drain Familiar and predicates Arcane Bond. The familiar actor itself is outside the item graph.

## 8. What the module would need (VERIFIED = source or module line quoted above; INFERRED = reasoned)

1. Add `wizard` to `COMPLETE_PC_CLASS_SLUGS` (`pc-support.mjs` line 11). VERIFIED.
2. Wizard has two level-1 bridges; `stageClassPaths` already loops over every bridge. VERIFIED.
3. **Blocker:** the identity contract carries one `classPath` (`pc-builder.mjs` 193-204 and 912, `pc-editor.mjs` 69, `pc-edit.mjs` 144-183, `generator-app.mjs` 301/317/411). A required school plus a required thesis would throw on the second bridge. VERIFIED; a per-bridge contract is INFERRED.
4. 14 schools and 4 theses at 8.5.0 (mirror result). Live counts unverified.
5. `class-paths.mjs` has no publication filter; `isEnabledClassFeature` tests only the pack id. Eligible schools come from Player Core and several Lost Omens books, all `remaster: true`. VERIFIED (no check); an allowlist is a decision.
6. **master is unsafe:** the two-entry Arcane School filter makes `singlePathTag()` return null, `stageClassPaths` skips the entry, and the native ChoiceSet would prompt after a one-click build, which `class-paths.mjs` lines 11-15 forbid. VERIFIED; a fail-closed guard is INFERRED.
7. `REMASTER_SPELLCASTERS` already has Wizard (`pc-tables.mjs` line 125) and matches by name because the class has no slug. VERIFIED. The base slot grid needs no change. VERIFIED.
8. Spellbook: the current build embeds only prepared spells, which is the native model. VERIFIED. Unprepared spellbook entries would be extra spells located in the entry with no slot; INFERRED.
9. Curriculum extras (extra cantrip, extra restricted slot per rank) are prose; no rule implements them; PLAYBOOK §10 already lists "restricted font/curriculum slots" as manual. VERIFIED.
10. School spells are focus spells linked by `@UUID` in the school description; no rule grants them; the focus-pool path reads only `resolved.focusSpells`. VERIFIED for data; resolver input INFERRED.
11. Familiar only through the thesis; companion actor outside the graph; already listed as manual in §10. VERIFIED.
12. Spell Blending, Spell Substitution, Staff Nexus and most schools have `rules: []`; a one-click build creates them with no automated effect. VERIFIED; disclosure INFERRED.
13. Flag-path drift (`flags.system` vs `flags.pf2e`) is not a blocker: `stageClassPaths` matches the substring `rulesSelections`. VERIFIED.
14. Any Wizard work must be tied to the 8.5.0 data (Arcane Bond and Arcane School differ on master). VERIFIED.
15. Local tests never close a native row; a Wizard build needs live QA on pf2e 8.5.0. VERIFIED (invariant 7).

## 9. Risks and unknowns

- Name-form uuid resolution (`Compendium.pf2e.feats-srd.Item.Familiar`) was not verified in Foundry; if it fails, `descendantsHaveNoChoices` returns false and Improved Familiar Attunement fails closed.
- The mirror script is not Foundry: it did not evaluate the compendium index or `CONFIG.PF2E`-based `choiceSetOptions`.
- Source `packs/pf2e/class-features/` to built pack `pf2e.classfeatures` is inferred from the 8.5.0 manifest (`system.pf2e.json` lists `classfeatures` at `packs/class-features`).
- Not analysed: Wizard class-feat slots (`spellbook-prodigy.json`), feat prerequisites, skills (`arcana` plus 2 additional).

## 10. Other observations

`preselectChoiceSets` (`choice-set.mjs` 336-445) pre-answers a bridge's ChoiceSet from the offered list via `pickChoiceSelection` (key-ability match, then concept-name match, then sole option), otherwise the batch callback. With 14 schools and 4 theses the callback or a required path is needed. `GrantItem.preselectChoices` is vacuous for closed candidates with no ChoiceSet.

## Files fetched

Prefixes `B8` = `…/pf2e-8.5.0/`, `BM` = `…/master/`. `packs/pf2e/classes/wizard.json` (B8), `packs/classes/wizard.json` (BM); the class journals; the four level-1 features; all 24 school/thesis files listed in §2 at both refs; all 875 class-feature files at B8 and 784 at BM (for the tag scan); `drain-bonded-item.json`, `drain-familiar.json` (BM), `familiar.json`, `pet.json`, `spellbook-prodigy.json`, `spellbook-blank.json`; precedent classes and features (rogue, fighter, investigator, rogues-racket, methodology, reactive-strike, shield-block); `system.pf2e.json` (B8), `static/system.json` (BM); every `.ts`/`.svelte` under `src/module/item/spellcasting-entry/` and `src/module/actor/character/`; `src/module/item/class/{data,document}.ts`, `src/module/item/book/{data,document}.ts`, `src/module/rules/rule-element/{choice-set,grant-item}/rule-element.ts`, `src/module/rules/helpers.ts`, `src/util/uuid.ts`, `src/global.ts`.
