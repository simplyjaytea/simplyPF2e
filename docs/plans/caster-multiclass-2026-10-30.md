# Caster multiclass dedications — research spike and record (2026-10-30)

Workstream W3, branch `feat/caster-multiclass`, base `integrate/2026-10-30@baeb0a3`. Step 1 (this spike) was written before any code.

Sources: every pf2e quote below is from a local copy of the `pf2e-8.5.0` tree. Each cited file's git blob SHA was compared with `gh api repos/foundryvtt/pf2e/contents/<path>?ref=pf2e-8.5.0` and matched (wizard-dedication.json `e39fef93`, basic-wizard-spellcasting.json `fbac2f4e`, journals/archetypes.json `48f72322`, spellcasting-entry/document.ts `ab821f73`, spellcasting-entry/data.ts `b68403e4`). Nothing here is recalled.

## 1. Why caster dedications are refused today

There is no refusal branch. The catalog is an allow-list and everything not in it is unavailable (`scripts/pc-multiclass.mjs`, header and `MULTICLASS_PACKAGES`):

```
// Ordinary multiclass (C08): the noncaster archetype catalog and the dedication
// lock. Names are PF2e 8.5.0 source data; every name must match a compendium
// feat exactly, and anything not listed is unavailable.
```

Only Fighter, Investigator, Barbarian, Monk and Ranger packages are listed. `multiclassFeatCandidates()` (`pc-builder.mjs`) keeps only exact catalog names, so a caster dedication is never offered, and `resolveFeatPicks`/`pc-edit.mjs` reject any archetype-slot pick outside the catalog. PLAYBOOK §1 puts it out of scope by decision, and §10 item 12 says it is "blocked until a supported casting/grant path is identified and accepted". This spike is that identification.

## 2. What pf2e 8.5.0 caster dedications carry

All ten dedications tagged `spellcasting-multiclass-archetype` (`traits.otherTags`) and their Rule Elements, from `packs/pf2e/feats/archetype/**/*-dedication.json`:

| Dedication | `system.rules` | Notes |
| --- | --- | --- |
| Wizard | `ActiveEffectLike upgrade system.skills.arcana.rank 1` | nothing else |
| Magus | `ActiveEffectLike arcana rank 1`, `ActiveEffectLike attacks.simple.rank` | prerequisites "Strength or Dexterity +2" and "Intelligence +2" |
| Cleric | `GrantItem Compendium.pf2e.classfeatures.Item.Deity (Cleric)`, `ActiveEffectLike religion` | deity choice lives in the granted feature |
| Druid | `ActiveEffectLike nature`, `ChoiceSet druidicOrder`, `GrantItem {item\|flags.system.rulesSelections.druidicOrder}` | |
| Bard | `ChoiceSet dedicationMuse`, `RollOption`, `ActiveEffectLike performance`, `ActiveEffectLike occultism` | |
| Sorcerer | `ChoiceSet bloodline`, `GrantItem {bloodline}` | tradition comes from the bloodline |
| Witch | `ChoiceSet patron`, `GrantItem {patron}`, `GrantItem Familiar (Witch)` | tradition from the patron; spells live on a familiar |
| Oracle | `ActiveEffectLike religion`, `ChoiceSet mystery`, `GrantItem {mystery}`, `GrantItem Oracular Curse` | |
| Psychic | `ActiveEffectLike occultism`, `ChoiceSet consciousMind`, `GrantItem {mind}` | key attribute is whichever the PC qualified with |
| Summoner | `GrantItem` (eidolon) | eidolon actor |

**No dedication has a Rule Element that creates a spellcasting entry.** The Wizard Dedication (`packs/pf2e/feats/archetype/wizard/wizard-dedication.json`, level 2, `prerequisites.value: [{"value":"Intelligence +2"}]`) carries exactly:

```json
"rules": [ { "key": "ActiveEffectLike", "mode": "upgrade", "path": "system.skills.arcana.rank", "value": 1 } ]
```

and its description gives the casting rules as prose only:

> You cast spells like a wizard, gaining a spellbook with four common arcane cantrips of your choice. You gain the Cast a Spell activity. You can prepare two cantrips each day from your spellbook. You're trained in the spell attack modifier and spell DC statistics. Your key spellcasting attribute for wizard archetype spells is Intelligence, and they are arcane wizard spells. You become trained in Arcana; if you were already trained in Arcana, you instead become trained in a skill of your choice. Select a school; you don't gain any abilities from your choice of school, but qualify for feats as a member.

Basic, Expert and Master Wizard Spellcasting (`basic-wizard-spellcasting.json` level 4, `expert-…` level 12, `master-…` level 18) all have `"rules": []`. Basic Wizard Spellcasting reads: "You gain the Basic Spellcasting Feat benefits. Each time you gain a spell slot of a new rank from the wizard archetype, add two common spells of that rank to your spellbook." Expert and Master add the prerequisites "master in Arcana" and "legendary in Arcana".

The slot progression is in `packs/pf2e/journals/archetypes.json`, page "Spellcasting Archetypes" (`DOc3Pf8wmVxanTIv`), which the feats link to:

> Basic Spellcasting Feat: Usually available at 4th level, these feats grant a 1st-rank spell slot. At 6th level, they grant you a 2nd-rank spell slot, and if you have a spell repertoire, you can select one spell from your repertoire as a signature spell. At 8th level, they grant you a 3rd-rank spell slot. … Expert … 4th-rank slot (12th), 5th (14th), 6th (16th). … Master … 7th-rank slot (18th), 8th (20th).

**Conclusion for question 2:** pf2e does not create the entry from any Rule Element, and it does not expect a grant. Rule Elements give the skill training (and, for the choice-bearing dedications, choices and granted features). The spellcasting entry is something the player adds by hand.

## 3. How pf2e prepares an archetype spellcasting entry

An entry is an ordinary `spellcastingEntry` item. The sheet's "add spellcasting entry" dialog is the only creator the system has (`src/module/actor/sheet/spellcasting-dialog.ts` 183 ff.): it builds `{ type: "spellcastingEntry", system: { ability: { value }, spelldc: { value: 0, dc: 0 }, tradition: { value }, prepared: { value } } }` from what the player picked and calls `actor.createEmbeddedDocuments("Item", [updateData])`. The schema (`spellcasting-entry/data.ts`):

```ts
interface SpellcastingEntrySystemSource extends ItemSystemSource {
    ability: { value: AttributeString | "" };
    spelldc: { value: number; dc: number };
    tradition: { value: MagicTradition | "" };
    prepared: SpellCollectionTypeSource;      // { value, flexible?, validItems? }
    showSlotlessLevels: { value: boolean };
    proficiency: { slug: string; value: ZeroToFour };
    slots: SpellcastingEntrySlots;            // slot0..slot10: { prepared[], value, max }
    autoHeightenLevel: { value: OneToTen | null };
```

Preparation (`spellcasting-entry/document.ts`):

- `prepareStatistic()`: for a character, `baseStat = actor.getStatistic(this.system.proficiency.slug || "base-spellcasting")`, then `this.system.proficiency.value = Math.max(this.rank, baseStat.rank ?? 0)`. The entry rank is a **floor**. The key attribute is the entry's own `ability.value` (`baseStat.attribute ?? this.system.ability.value`, and `base-spellcasting` has no attribute).
- `creature/document.ts` 416–420 (`spellcasting.rank ||= 1`): "If you can cast spells using spellcasting prof, you logically need to be at least trained" — a character with any real entry is at least trained, which is what the dedication grants.
- `prepareBaseData()` pads each prepared slot group to `group.max` and, for a flexible entry, empties every group but `slot0`.
- There is no `isFlexible` or archetype flag that computes slots. Slots are plain data (`slots.slotN.max`); the system never derives them from a class or a feat. `prepared.flexible` is a user-set boolean.

So for a class caster the module already hand-assembles exactly this: `pc-builder.mjs` `createCharacterActor()` pushes `{ type: "spellcastingEntry", system: { tradition, prepared: { value, flexible: false }, ability, proficiency: { value: 1 }, slots, spelldc, showSlotlessLevels } }`, and the slot counts and mode/tradition/attribute come from the module's own `REMASTER_SPELLCASTERS` table in `pc-tables.mjs`, because "class data itself contains only spell proficiency". pf2e supplies the table only as published prose, for classes (`journals/classes.json`) and archetypes (`journals/archetypes.json`) alike.

## 4. Decision

**BUILD, narrowly.** Applying the decision rule literally:

- Is the entry created by a Rule Element the module can clone? **No.** Nothing exists to clone, and nothing needs authoring: the entry is not a Rule Element in pf2e either.
- Can the module build the entry the same way it builds class spellcasting today? **Yes.** The class path writes plain `spellcastingEntry` document data from a small module-owned profile table cited to the published prose. An archetype entry is the same document type with the same fields, and its inputs (tradition, key attribute, prepared/spontaneous, cantrip count, slot-per-level) are each stated in the 8.5.0 feat text and journal quoted above.
- Is any hand-authored data needed that pf2e does not supply? **No Rule Element and no rule.** The one new table (tradition, attribute, mode, cantrip counts, slot levels) is the same kind of cited transcription as `REMASTER_SPELLCASTERS` and `pcSpellSlots`. It is pinned by tests that read the real 8.5.0 feat JSON and journal text, and by the drift tool, so a change in the published text fails the gate.

This is a judgment call on "hand-authored data" and is flagged for the Lead: if the rule is read as "no module-owned table at all", this stops here at "dedication feat only, no entry". I read the existing class precedent as settling it.

### Which archetypes (smallest complete subset)

Only **Wizard** is buildable without new capabilities:

- Wizard Dedication has no `ChoiceSet`, no `GrantItem`, no eidolon or familiar. Its one Rule Element (Arcana rank) is cloned when the feat is embedded, as for every catalog dedication.
- Every other caster dedication carries a `ChoiceSet` (Druid, Bard, Sorcerer, Witch, Oracle, Psychic) or a granted feature with its own choice (Cleric's deity), or a non-spell companion (Summoner's eidolon, Witch's familiar), or an either-or prerequisite (Magus `Strength or Dexterity +2`, Psychic `Intelligence +2 or Charisma +2`) that the AND-only `abilities` model cannot express. The existing catalog already excludes Rogue Dedication for the same reason ("choice-bearing dedication"), and no catalog dedication today answers a `ChoiceSet` at all. Sorcerer, Witch and Summoner additionally take their tradition from the choice, and Psychic its key attribute from the prerequisite the PC met. Adding any of these is a separate feature (answer a ChoiceSet, resolve tradition from it), not a table row.

### Package feats

- **Basic Wizard Spellcasting** (level 4, prerequisite "Wizard Dedication"): built. It gives rank 1 at level ≥ 4, rank 2 at level ≥ 6, rank 3 at level ≥ 8 (one slot each), and two common spellbook spells per rank gained.
- **Expert Wizard Spellcasting** (prerequisite "master in Arcana") and **Master Wizard Spellcasting** ("legendary in Arcana"): unavailable, exactly like the existing "expert … prerequisite is not provable by the staged evaluator" rows. They would also change the entry's proficiency rank.
- The other Wizard archetype feats (e.g. Arcane School Spell, Hand of the Apprentice) are not in scope.

### What the PC gets

- Wizard Dedication (and Basic Wizard Spellcasting when picked), cloned unchanged; pf2e's own Rule Element trains Arcana.
- One plain `spellcastingEntry`: arcane, key attribute Intelligence, `prepared` (not flexible), `proficiency.value: 1`, slot0 max 2 (two cantrips prepared per day), and with the Basic feat slot1/2/3 max 1 by level. Spells in the entry: four common arcane cantrips (the "spellbook with four cantrips"), and two common arcane spells per rank gained through the Basic feat. Prepared slots are filled from the spellbook, first N per rank.
- Spells are chosen the way class spells are: the vetted tradition candidate list (`getSpellCandidates`), one AI selection call that returns candidate ids, module-side validation against the plan, fail-closed on anything off-plan. No number comes from the AI.

### Known gaps (documented, not hidden)

- "Select a school" has no mechanical effect or sheet field in pf2e (no Rule Element); it is not recorded.
- "If you were already trained in Arcana you instead become trained in a skill of your choice" is not modeled; the same gap already exists for the noncaster dedications' skill sentences.
- Expert/Master Wizard Spellcasting, other casters, and spell editing in the Character editor.
- Not native-accepted; no Foundry here.

## 5. Build notes (filled in as built)

See the sections below added with the implementation.
