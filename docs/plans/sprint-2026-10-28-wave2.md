# Sprint plan, 2026-10-28, wave 2: Wizard school focus spell, cantrip deck, review leftovers

Status: accepted by the orchestrator on 2026-10-28 (planner: Claude Opus 5.5, high; the user said "run the plan"). The §6 decisions D1–D7 are taken as recommended; D1's quotes were spot-checked by the orchestrator against `pf2e-8.5.0` before dispatch.

- **Base:** `claude/sprint-2026-10-27` at `c81b0bd` (WP0–WP5 of [sprint-2026-10-27](sprint-2026-10-27.md), the Opus review record and the F1–F8 fix pass are merged there; the WP6 docs close-out is still pending and is folded into this wave's close-out).
- **Integration branch:** the same `claude/sprint-2026-10-27`.
- **Protocol:** PLAYBOOK §6, roster of 2026-10-28 (Codex GPT-6.1 Terra preferred; Haiku 5.5 high; opencode free models only as overflow).
- **Out of bounds:** no push, PR, `gh`, provider spend, live world or publication.

Shared constraints for every worker, identical to the 10-27 plan:
- Never write `main`, and never push.
- Never hand-author a Rule Element.
- The AI emits no numbers.
- Escape AI and user text with `esc`/`toHtml`.
- Fail closed.
- Quote the real pf2e line, with its URL, at `pf2e-8.5.0` or `v14-dev`. Never quote `master`.
- Before reporting, see `node tools/check.mjs </dev/null` exit 0 and `git diff --check` clean, and report `node --version`.
- Workers never touch `PLAYBOOK.md`, `HANDOFF.md`, `docs/**`, `README.md`, `CLAUDE.md`, `AGENTS.md`, `.github/**` or `module.json`.

---

## 1. Goal and v1 boundary

**Ships in this wave:**

1. **WP-A: Wizard school focus spell.**
   - At Create, after `stageClassPaths` has fixed the Arcane School, the module reads the school's own description.
   - It parses the "School Spells … initial:" `@UUID` link, loads that real spell and embeds it in a `prepared.value: "focus"` entry.
   - pf2e itself sizes the focus pool (§2.A.4).
   - **Correction found while planning:** the module's cloned focus-pool Rule Element double-counts on every PC focus class. pf2e already adds +1 per non-cantrip focus spell. WP-A removes the clone (decision D1).
2. **WP-B: Cantrip deck in the Item Forge** (new consumable kind `cantripDeck`, ungated like scrolls and wands).
   - Each deck is one item built from the pinned `Cantrip Deck (5-pack)` template.
   - It holds one real common cantrip, with no embedded spell (native behavior, §2.B.2).
   - WP-B also owns `ai.mjs`, so it takes two leftovers: (c) the hazard gate and (d) the TemplateMissing assertion.
3. **WP-C: Review leftovers.**
   - (a) The Character editor's class control offers only noncaster classes, plus the current class.
   - (b) For a class without a modeled focus source, the spell step requests no focus candidates.
   - (e) An encounter hazard member gets the hazard task's token cap in the progress plan.

**Deferred, with reasons:**
- **Advanced school spell.** It comes from a level-8 feat. Its grant path was not researched.
- **Showing the school spell in the preview.** When the school is not required, the bounded chooser picks it at Create, so the preview cannot know it yet.
- **Curriculum slots and the familiar.** These are prose only (wizard research §4).
- **Uncommon cantrip decks, multi-deck quantity, staves, mystified items.**
- **Any change to NPC focus.** NPC data is unaffected (§2.A.4: `prepareActorData` returns early for non-characters).

## 2. pf2e source findings (quoted)

### 2.A Wizard school spell and focus pool

**A.1 The school feature grants nothing.**
- All 14 closed 8.5.0 schools have `"rules": []`. They were fetched 2026-10-28 from `https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/<file>.json`:
  - red-mantis-magic-school, school-of-ars-grammatica, -battle-magic, -civic-wizardry, -gates, -kalistrade, -keen-inquiry, -magical-technologies, -mentalism, -nexian-spaces, -protean-form, -quantic-control, -the-boundary, -the-reclamation.
  - Each has `otherTags: ["wizard-arcane-school"]`.
- `school-of-battle-magic.json` (`_id E4GZDMn4DYk6qSEV`, the same file as `tests/fixtures/pc-wizard/school-of-battle-magic.json`):
  ```json
  "rules": [],
  "traits": { "otherTags": ["wizard-arcane-school"], "rarity": "common", "value": ["wizard"] }
  ...<p><strong>School Spells</strong> initial: @UUID[Compendium.pf2e.spells-srd.Item.Force Bolt]; advanced: @UUID[Compendium.pf2e.spells-srd.Item.Energy Absorption]</p>
  ```
- The Arcane School bridge (`arcane-school.json`, the same at 8.5.0 and at `v14-dev/packs/pf2e/class-features/arcane-school.json`) has only `ChoiceSet` (`item:tag:wizard-arcane-school`) and `GrantItem {item|flags.system.rulesSelections.arcaneSchool}`.
- Wizard Spellcasting only grants Cast a Spell (research §2).

**Decision:** pf2e does **not** grant the school spell, so the module must add it. It is not a duplicate.

**A.2 The two description shapes in the 8.5.0 sources** (every closed school was checked):
- 13 schools: `<p><strong>School Spells</strong> initial: @UUID[…]; advanced: @UUID[…]</p>`
- `school-of-magical-technologies.json` (`dPAwM9IdabdH68mW`): `<p><strong>School Spells</strong> <em>initial:</em> @UUID[Compendium.pf2e.spells-srd.Item.Augmented Body] <em>advanced:</em> @UUID[Compendium.pf2e.spells-srd.Item.Conjured Clockwork]</p>`
- `v14-dev` moved the schools to `packs/pf2e/class-features/wizard/` and added Corentyn Armada and Shadow Veils. Both use the first shape, and Battle Magic is unchanged.

**A.3 The installed (built) compendium rewrites the link to id form with a label.**

`https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/build/lib/compendium-pack.ts`, line 229:
```ts
uuid: /@UUID\[Compendium\.(?:pf2e|sf2e)\.(?<packName>[^.]+)\.(?<docType>Actor|JournalEntry|Item|Macro|RollTable)\.(?<docName>[^\]]+)\]\{?/g,
```
Lines 407–419:
```ts
            const documentId: string | undefined = namesToIds.get(docName);
            ...
            const sourceId = this.#sourceIdOf(documentId, { packId, docType });
            const labelBraceOrFullLabel = match.endsWith("{") ? "{" : `{${docName}}`;
            return `@UUID[${sourceId}]${labelBraceOrFullLabel}`;
        };
        if (!remap) return JSON.stringify(docSource);
        return JSON.stringify(docSource)
            .replace(CompendiumPack.LINK_PATTERNS.uuid, replace)
```
Line 426: `` return `Compendium.${this.systemId}.${packId}.${docType}.${documentId}`; ``
`v14-dev` has the same rewrite at lines 427–429.

So a live world reads `@UUID[Compendium.pf2e.spells-srd.Item.Hu38hoAUSYeFpkVa]{Force Bolt}`, while the repo fixture reads the name form. **The parser must accept both.**

Side finding: lines 446–452 convert `system.items` uuids (class, ancestry, background, kit) to ids, and line 462 converts rule uuids. The research risk "name-form uuid resolution unverified" therefore does not arise on built packs. That remains unobserved live.

**A.4 The focus spells:**
- `…/pf2e-8.5.0/packs/pf2e/spells/focus/force-bolt.json`: `_id Hu38hoAUSYeFpkVa`, `level {value:1}`, `traits {"rarity":"uncommon","traditions":[],"value":["focus","force","manipulate","wizard"]}`, `rules []`. It is identical at `v14-dev`.
- `charming-push.json`: `_id KMFRKzNCq7hVNH7H`, `["concentrate","focus","incapacitation","mental","wizard"]`.
- `augmented-body.json`: `_id pSepsfCrrAKuwA0N`.
- `energy-absorption.json`: `_id LoBjvguamA12iyW0`, level 4.

**A.5 Focus pool: PLAYBOOK §3 "verified" bullet is incomplete.**

`…/pf2e-8.5.0/src/module/actor/character/document.ts`, lines 369–373 (`v14-dev` 374–378):
```ts
        resources.focus = {
            value: resources.focus?.value || 0,
            max: 0,
            cap: 3,
        };
```
`…/pf2e-8.5.0/src/module/item/spell/document.ts`, lines 650–657 (the same at `v14-dev` 650–657 and at `pf2e-8.4.1` 650–656; re-fetched by the orchestrator 2026-10-28):
```ts
    override prepareActorData(): void {
        if (!this.actor?.isOfType("character")) return;

        // Increase focus point max if this is a non-cantrip focus spell
        const { traits } = this;
        if (traits.has("focus") && !traits.has("cantrip")) {
            this.actor.system.resources.focus.max += 1;
        }
    }
```
`…/pf2e-8.5.0/src/module/actor/base.ts`, lines 852–873: `prepareDataFromItems()` runs `item.prepareActorData?.()` for every item, then `this.rules = this.prepareRuleElements()`. Line 890: `.flatMap((item) => item.prepareRuleElements())` covers every item type. `item/base/data/system.ts` line 110 shows `rules: RuleElementSource[]` on every item system, spellcasting entries included.

`…/pf2e-8.5.0/src/module/actor/creature/document.ts`, lines 491–495 (`v14-dev` 549):
```ts
        const resources = this.system.resources;
        if (resources.focus) {
            resources.focus.max = Math.floor(Math.clamp(resources.focus.max, 0, resources.focus.cap)) || 0;
        }
```
**Consequence:** today `pc-builder.mjs` lines 1088–1099 clone a `focusPool` ActiveEffectLike with `value = min(n, 3)` onto the focus entry. On top of the native +n this gives `min(n + min(n, 3), 3)`. A Champion with one focus spell gets 2 points instead of 1. This is a P2 found by source reading, unobserved live.

Native counting equals the signed-off module default (count capped at 3) except for focus cantrips, which correctly add nothing. NPCs are unaffected (the early return for non-characters).

### 2.B Cantrip deck

**B.1 Template.** `…/pf2e-8.5.0/packs/pf2e/equipment/cantrip-deck-5-pack.json` (`v14-dev` gives the same id, category, uses, price and level):
```json
"_id": "tLa4bewBhyqzi6Ow", "name": "Cantrip Deck (5-pack)", "type": "consumable",
"category": "other", "level": {"value": 1}, "price": {"per": 1, "value": {"gp": 5}}, "quantity": 1, "rules": [],
"traits": {"rarity": "common", "value": ["magical"]}, "usage": {"value": "held-in-one-hand"},
"uses": {"autoDestroy": true, "max": 5, "value": 5},
"description": "...<p>This pack contains 5 cards of a single common cantrip (such as @UUID[Compendium.pf2e.spells-srd.Item.Light]).</p>... The deck casts that cantrip as a 1st-rank spell, with a DC of 15 and a spell attack modifier of +5..."
```

**B.2 Native builder.** `…/pf2e-8.5.0/src/module/item/consumable/spell-consumables.ts`, lines 22–75 (`v14-dev` lines 60–75 are identical):
```ts
        rank = spell.baseRank,
...
    const uuid = data?.compendiumUuids[rank] ?? null;
...
    traits.value = R.unique([...traits.value, ...spell.system.traits.value]);
    traits.rarity = spell.rarity;
    if (traits.value.includes("magical") && traits.value.some((t) => setHasElement(MAGIC_TRADITIONS, t))) {
        traits.value.splice(traits.value.indexOf("magical"), 1);
    }
    traits.value.sort();
    consumableSource.name = data?.nameTemplate
        ? _loc(data.nameTemplate, { name: spell.name, level: rank })
...
        paragraphElement.append(spell.sourceId ? `@UUID[${spell.sourceId}]{${spell.name}}` : spell.description);
...
    // Cantrip-only categories (e.g. cantrip deck) aren't single-spell consumables — skip embedding.
    if (!data?.cantripsOnly) {
        consumableSource.system.spell = fu.mergeObject(
```
`…/pf2e-8.5.0/src/scripts/config/spell-consumables.ts`, lines 64–79 (`v14-dev` 68 and 79 are the same):
```ts
        cantripDeck5: {
            name: "PF2E.SpellcastingItemCreator.CantripDeck5",
            nameTemplate: "PF2E.Item.Physical.FromSpell.CantripDeck5",
            compendiumUuids: {
                1: "Compendium.pf2e.equipment-srd.Item.tLa4bewBhyqzi6Ow",
                2: null, ... 10: null,
            },
            cantripsOnly: true,
```
`…/apps/spellcasting-item-creator/app.svelte`, line 28: `const resolvedItem = $derived(itemTypeData?.cantripsOnly ? compendiumUuids?.[1] : compendiumUuids?.[Number(rank)]);`. Line 56: `{#if !itemTypeData?.cantripsOnly}` hides the rank selector.

`…/pf2e-8.5.0/static/lang/en.json`, line 2810: `"CantripDeck5": "Cantrip Deck of {name} (5-pack)"` (`v14-dev` line 2829).

`…/pf2e-8.5.0/packs/pf2e/spells/spells/cantrip/light.json`: `_id WBmvzNDfpwka3qT4`, `level {value:1}`, `traits {"rarity":"common","traditions":["arcane","divine","occult","primal"],"value":["cantrip","concentrate","light","manipulate"]}`. So a cantrip's `baseRank` is 1 (`spell/document.ts` lines 96–98: `get baseRank(): OneToTen { return this.system.level.value; }`).

**Decisions that follow:**
- One item per deck, with `uses` 5/5 from the template and `quantity` 1. Nothing is written over the template.
- No `system.spell`.
- Rank is the module constant 1. Level and price come from the template.
- `selectSpellConsumables` serves the deck with `kind: "cantripDeck"`. The response shape `{picks:[]}` is unchanged, so no new AI task is needed.

### 2.C Leftover sites (module code at `ecf5055`; `itemforge-app.mjs` line numbers moved by the F1–F8 fix pass, re-locate by symbol)

- **(a)** `generator-app.mjs` line 537 offers `catalogs.offeredClass`, which includes Wizard. `pc-edit.mjs` lines 354–356 refuse it with `DEFERRED` (`castsSpells`, lines 74–77). Fixtures: `wizard.json` `"spellcasting": 1`; `precedent/fighter-class.json`, `rogue-class.json` and `investigator-class.json` `spellcasting: 0`.
- **(b)** The call site is `generator-app.mjs` `#refineSpells`, lines 1864–1867 (`getFocusSpellCandidates`), reached from the PC run at line 1733. It is **not** `pc-builder.mjs`, so it has no ownership clash with WP-A. `selectSpells` already handles `focusCandidates: []` (`ai.mjs` lines 621 and 636).
- **(c)** `ai.mjs` lines 1513 and 1526 use `hazardOptionalProblem(…strike.name…)`, so a strike object without a name passes the gate. `normalizeHazardStrike` (lines 1573–1578) then silently drops it. The builder refuses it: `hazard-builder.mjs` `objectOf` (lines 97–101) throws on a non-object, and `strikeOrNull` → `nameText` (lines 160–184) throws `MISSING_NAME`.
- **(d)** `tests/itemforge-app.consumables.test.mjs` asserts DroppedPick and RankAboveLevel. The F8 fix pass (`b32432e`) added SpellMissing/TemplateMissing coverage at its line 245; WP-B re-checks that the TemplateMissing label itself is asserted and adds the assertion if it is not.
- **(e)** `generator-app.mjs` line 1181 gives every member the creature caps. `ai-task-profiles.mjs` line 57 reads `[AI_TASK.HAZARD_CONCEPT]: { maxTokens: 2000, … }`. Steps carry `weight` (`progress.mjs` lines 45–50).

## 3. Design

### 3.1 WP-A data flow (inside `createCharacterActor`, after `stageClassPaths`)

1. If `concept.spellcasting` is null (the GM turned spellcasting off), skip silently (D2).
2. For each `stagedClassPaths.expectedPaths[i]._stats.compendiumSource`:
   - `fromUuid` → `toObject()`;
   - keep the sources where `isArcaneSchoolSource(source)` holds (`otherTags` includes `"wizard-arcane-school"`).
   - None: not a Wizard, so do nothing. More than one: warn and skip.
3. `schoolInitialSpellLink(source.system.description.value)` returns `{uuid, label}` or null. Null: warn and skip.
4. `fromUuid(link.uuid)`. The result must be `type === "spell"`, include the `"focus"` trait, and sit in a pack listed by `getPacksFor("spells")`. Otherwise warn and skip.
5. Run `toItemData(doc)` and merge the result into the focus-spell list, deduplicated by `_stats.compendiumSource`.
6. **Focus entry** (shared with other classes' AI focus spells):
   - `prepared.value "focus"`, tradition from `concept.spellcasting`, ability = key ability.
   - **`rules: []`. No cloned pool rule (D1).**
   - `resources.focus.value` = min(3, number of embedded non-cantrip focus spells).
7. The AI focus picks for Wizard stay dropped. `classModelsFocusSpells("wizard")` stays false, because the school spell is module-derived and not an AI pick.

Every skip is `console.warn` naming the school, and the build continues: the spell was manual before this wave.

### 3.2 WP-B data flow

The Forge kind `cantripDeck` joins `CONSUMABLE_KINDS`. It therefore inherits the preview, Create, and the gated loot destination.

1. `getCantripCandidates(keywords)` returns enabled spells with the `cantrip` trait, without `focus` or `ritual`, `rarity === "common"` (D4). Sorting and the cut follow `getScrollSpellCandidates`.
2. `selectSpellConsumables(brief, { kind: "cantripDeck", candidates, count: 6 })`. The prompt asks for spell ids only, and every pick gets `rank: CANTRIP_DECK_RANK` (1).
3. `#buildSpellConsumable("cantripDeck", candidate, 1)`, unchanged except that `consumableMaxRank("cantripDeck", _) === 1`.
4. The level control is hidden for decks (D6).

### 3.3 Invariants

- No Rule Element is created. WP-A removes one clone, and the deck template has `rules: []`, which is enforced.
- The AI emits only ids.
- No AI text reaches the documents.
- Every unresolved pick or link is dropped with a warning.

## 4. Work packages

**Tiers (2026-10-28 roster):**
- `codex-terra-high` (Codex GPT-6.1 Terra, high) for judgment. It takes precedence over opencode.
- `haiku-high` (Claude Haiku 5.5, high) for bounded logic.
- `opencode-free-high` only as overflow for mechanical work (for example the fixture downloads).
- Fix ladder: Haiku high, then Codex Terra high, then Opus xhigh.

**Report shape (all WPs):**
- Model and effort actually run.
- Branch and base SHA, final SHA.
- `git diff --stat`.
- Each command with its exit code, including `node --version`.
- The "Integrity", "Links" and test-summary lines of the gate.
- `git diff --check` output.
- Every pf2e quote used, with its URL.
- Deviations and blockers.
- No claims of native behavior.

**Verification (all WPs):** `node tools/check.mjs </dev/null` and `git diff --check`.

**File ownership across the wave, checked against WP5's files:**

| File | Owner |
| --- | --- |
| `scripts/pc-builder.mjs`, `scripts/pc-support.mjs`, `scripts/rule-templates.mjs`, `scripts/school-spells.mjs` (NEW) | WP-A |
| `scripts/spell-consumables.mjs`, `scripts/compendium.mjs`, `scripts/ai.mjs`, `scripts/itemforge-app.mjs`, `templates/itemforge.hbs`, **`lang/en.json`** | WP-B |
| `scripts/generator-app.mjs`, `scripts/pc-edit.mjs`, `scripts/pc-editor.mjs` | WP-C |

- `lang/en.json` belongs to WP-B only. WP-A and WP-C add no keys: their warnings go to the console, and their UI changes reuse existing strings.
- `README.md` belongs to the orchestrator at close-out.

### WP-A — Wizard school focus spell and the focus-pool correction

- **Tier:** `codex-terra-high`. It touches `createCharacterActor` and corrects a "verified" invariant.
- **Depends on:** `c81b0bd` only.
- **Owned files:**
  - `scripts/school-spells.mjs` (NEW, pure)
  - `tests/school-spells.test.mjs` (NEW)
  - `scripts/pc-builder.mjs`: the focus block (lines 889–893 and 1079–1124), the actor `resources.focus` comment (lines 1213–1216), and the imports
  - `scripts/pc-support.mjs`: doc comments only (lines 24–27 and 44–51)
  - `scripts/rule-templates.mjs`: delete the `focusPool` kind spec (lines 89–98) and simplify `EFFECT_KINDS` (line 109) and its comment (D1 accepted).
  - `tests/pc-wizard.builder.test.mjs`
  - `tests/fixtures/pc-wizard/force-bolt.json`, `charming-push.json`, `school-of-magical-technologies.json` (NEW, byte-identical downloads from `pf2e-8.5.0`, URLs in §2.A)
  - `tests/fixtures/pc-wizard/README.md`: append three rows
- **Forbidden:** everything else, especially `class-paths.mjs`, `builder.mjs`, `generator-app.mjs`, `lang/en.json` and `tests/pc-support.test.mjs`.

**Contract of `scripts/school-spells.mjs`** (pure; quote §2.A.1–A.3 in the header):
```js
export const WIZARD_ARCANE_SCHOOL_TAG = "wizard-arcane-school";
export function isArcaneSchoolSource(source);
// true iff source.system.traits.otherTags is an array that includes the tag.
export function schoolInitialSpellLink(descriptionHtml);
// → { uuid, label } | null. Rules:
//  1. Non-string → null.
//  2. Exactly one /<strong>\s*School Spells\s*<\/strong>/ match, else null.
//  3. Take the text from that match to the next "</p>"; no "</p>" → null.
//  4. Inside it, exactly one match of
//     /(?:<em>\s*)?initial:\s*(?:<\/em>)?\s*@UUID\[(Compendium\.[^.\]]+\.[^.\]]+\.Item\.[^\]]+)\](?:\{([^}]*)\})?/
//     else null.
//  5. Return { uuid: match[1].trim(), label: match[2] ?? null }.
```

**`pc-builder.mjs` changes:**
- Add a private `resolveSchoolFocusSpell(expectedPaths)` exactly as in §3.1, steps 2–5.
- The warning texts contain `simplypf2e | ` and the school's name.
- Call it only when `concept.spellcasting` is truthy.
- Build the focus entry when `focusSpells.some(s => s.entry) || schoolSpell`.
- Remove `findRuleExemplar("focusPool")` and the `poolRule`, and write `rules: []` (D1).
- `focusPoolSize` = min(3, count of embedded focus spells without the `cantrip` trait).
- Replace the comment at lines 1079–1087 with the §2.A.5 quote lines.

**Acceptance:**
1. A Wizard with spellcasting and any of the 14 closed schools embeds exactly that school's initial spell in a focus entry with `rules: []`.
2. Unparseable text, a missing spell, a non-focus spell or a disabled pack: one warning, no focus entry, and the build still succeeds.
3. Spellcasting off: no school spell and no warning.
4. A non-Wizard focus class (the Champion control) keeps its entry, now with `rules: []`, and `resources.focus.value` equals 1.
5. The AI focus picks for Wizard are still dropped, with exactly one warning.
6. No `focusPool` exemplar search runs.
7. Zero unused lang keys (none are added).

**Tests** (expected values typed from the §2.A quotes, not computed by the module):

`tests/school-spells.test.mjs`:
- `school-of-battle-magic.json` gives `{uuid:"Compendium.pf2e.spells-srd.Item.Force Bolt", label:null}`.
- `school-of-mentalism.json` gives `…Item.Charming Push`.
- `school-of-magical-technologies.json` gives `…Item.Augmented Body` (the `<em>` form).
- The built-form literal `<p><strong>School Spells</strong> initial: @UUID[Compendium.pf2e.spells-srd.Item.Hu38hoAUSYeFpkVa]{Force Bolt}; advanced: @UUID[Compendium.pf2e.spells-srd.Item.LoBjvguamA12iyW0]{Energy Absorption}</p>` gives `{uuid:"Compendium.pf2e.spells-srd.Item.Hu38hoAUSYeFpkVa", label:"Force Bolt"}`.
- These give null:
  - `spell-blending.json` (no paragraph);
  - two School Spells paragraphs;
  - `initial: Force Bolt` without a link;
  - `@UUID[Item.abc]`;
  - `undefined`.
- `isArcaneSchoolSource`: battle magic true; `spell-blending.json` and `arcane-school.json` false.

`tests/pc-wizard.builder.test.mjs`:
- Add `"pf2e.spells-srd": [forceBolt, charmingPush, focusSpell]` to the world.
- Keep scenarios 1–7. Their concepts have no `spellcasting`, so they still see no school entry, and no new warning may appear.
- Update the scenario 5 Champion control: no `game.packs` iterator patch; `focusEntry.system.rules` deep-equals `[]`.
- New 8: required Battle Magic with `spellcasting: {tradition:"arcane", spells:[]}` gives one `prepared.value === "focus"` entry. Force Bolt sits at `system.location.value === entry._id` with `_stats.compendiumSource === "Compendium.pf2e.spells-srd.Item.Hu38hoAUSYeFpkVa"`, and `resources.focus.value === 1`.
- New 9: a world without `force-bolt` gives one warning matching `/School of Battle Magic/`, no focus entry, and the actor still created.
- New 10: a labelled synthetic copy of battle magic with the School Spells paragraph removed gives a warning and no entry.
- New 11: an AI focus pick plus the school gives only the school spell.

**Commit:** `feat(pc): Wizard school focus spell from the staged school; stop double-counting the PC focus pool`.

### WP-B — Cantrip deck (Forge), plus leftovers (c) and (d)

- **Tier:** `codex-terra-high`. It is a Foundry-facing Forge change across `ai.mjs` and the app.
- **Depends on:** `c81b0bd`.
- **Owned files:**
  - `scripts/spell-consumables.mjs`
  - `scripts/compendium.mjs`: new export only
  - `scripts/ai.mjs`: `selectSpellConsumables` and the hazard gate helpers only
  - `scripts/itemforge-app.mjs`
  - `templates/itemforge.hbs`
  - `lang/en.json`: keys under `SIMPLYPF2E.ItemForge.Consumables.*` only
  - `tests/spell-consumables.test.mjs`, `tests/ai.spellConsumables.test.mjs`, `tests/ai.hazardConcept.test.mjs`, `tests/itemforge-app.consumables.test.mjs`: append only
  - `tests/compendium.cantripCandidates.test.mjs` (NEW, mirrors `compendium.scrollCandidates.test.mjs`)
  - `tests/itemforge-app.cantripDeck.test.mjs` (NEW, mirrors the consumables harness)
  - `tests/fixtures/consumables/cantrip-deck-5-pack.json` and `light.json` (NEW, real 8.5.0) plus README rows
  - Minimal adjustments to `tests/itemforge-app.kindSelection.test.mjs`, `tests/ui.layout.test.mjs` and `tests/itemforge-app.parcel.test.mjs`. Delete no assertion and report each change.
- **Forbidden:** everything else, especially `builder.mjs` (NPC loot scrolls must stay byte-identical in behavior), `generator-app.mjs`, `pc-*.mjs` and `ai-task-profiles.mjs` (no new task).

**Changes:**

1. **`spell-consumables.mjs`:**
   - `export const CANTRIP_DECK_RANK = 1;` with the config line 68 and svelte line 28 quotes.
   - `spellConsumableTemplateUuid("cantripDeck", 1)` returns `SPELL_CONSUMABLE_TEMPLATES.cantripDeck` and any other rank returns null. This is a special case: today `SPELL_CONSUMABLE_TEMPLATES.cantripDeck[1]` would index a string.
   - `NAME_TEMPLATES.cantripDeck = "Cantrip Deck of {name} (5-pack)"`.
   - `spellConsumableRankProblem` for `cantripDeck`, in this order:
     - kind;
     - rank must be 1;
     - spell data present;
     - the `cantrip` trait is required;
     - `focus` is refused;
     - `ritual` is refused;
     - `traits.rarity` other than `common` is refused (D4).
   - Scroll and wand messages are unchanged.
   - `buildSpellConsumable` for the deck:
     - template category must be `"other"` (quote B.1) and the source must be pinned;
     - same traits, name and description code;
     - **no `system.spell`** (quote B.2 lines 68–75);
     - never write `uses`, `quantity`, `price` or `level`.
2. **`compendium.mjs`:** `getCantripCandidates(keywords = [])` per §3.2.1.
3. **`ai.mjs` `selectSpellConsumables`:**
   - Accept `"cantripDeck"`.
   - The prompt asks for `{ "picks": [ { "spellId": string } ] }`, lists `ID | name | traits` (no rank), and states "Do not emit ranks, prices, item levels, DCs, damage or any other number."
   - Ignore any `rank` in the reply and set `rank: CANTRIP_DECK_RANK`.
   - Scroll and wand behavior is unchanged.
4. **`itemforge-app.mjs`:**
   - `CONSUMABLE_KINDS` gains `cantripDeck`, and `consumableMaxRank` returns 1 for it.
   - Candidates come from `getCantripCandidates` for decks; empty gives the new `NoCantripCandidates` error.
   - A tile with icon `fa-layer-group`, ungated.
   - `isCantripDeck` in the context hides the level group.
5. **`itemforge.hbs`:** wrap the level group in `{{#unless isCantripDeck}}`.
6. **`lang/en.json`:** add `Consumables.KindCantripDeck` ("Cantrip deck"), `KindCantripDeckHint` ("Five cards of one real common cantrip"), `NoCantripCandidates`, and `DeckNote` ("A cantrip deck casts its cantrip as a 1st-rank spell; as in pf2e, the spell is not embedded.") shown in the deck preview.
7. **(c), in `ai.mjs`:** add `hazardStrikeProblem(field, strike)`. It returns null for null or undefined. For a non-plain-object it returns `hazardFieldProblem(field)`. Otherwise it returns `hazardTextProblem(field + ".name", strike.name, HAZARD_NAME)`. Use it at lines 1513 and 1526.
8. **(d):** append to `tests/itemforge-app.consumables.test.mjs` a pick whose pinned template is absent from the `templates` map. Assert that the preview warning includes `TemplateMissing` and not `DroppedPick` (skip if the F8 fix pass already asserts exactly this; say so in the report).

**Acceptance:**
- Scroll, wand and NPC-loot outputs are unchanged: the existing tests pass untouched.
- A deck of Light equals the expected source below.
- An uncommon, focus or non-cantrip spell is refused for a deck.
- The deck tile shows with the gate off. The loot destination for decks appears only with the gate on.
- 0 unused lang keys.
- The hazard gate retries once on a nameless strike object, then fails closed.

**Tests** (values typed from §2.B):

`spell-consumables.test.mjs`:
- `spellConsumableTemplateUuid("cantripDeck",1) === "Compendium.pf2e.equipment-srd.Item.tLa4bewBhyqzi6Ow"`; ranks 0 and 2 give null.
- The Light deck from the fixtures (template `_stats.compendiumSource` set to the pinned UUID, Light set to `Compendium.pf2e.spells-srd.Item.WBmvzNDfpwka3qT4`):
  - name `"Cantrip Deck of Light (5-pack)"`;
  - category `"other"`;
  - `traits.value` deep-equals `["cantrip","concentrate","light","magical","manipulate"]`, rarity `"common"`;
  - description starts with `<p>@UUID[Compendium.pf2e.spells-srd.Item.WBmvzNDfpwka3qT4]{Light}</p><hr>` and ends with the template text verbatim;
  - `"spell" in item.system === false`;
  - `uses` deep-equals `{autoDestroy:true,max:5,value:5}`, `quantity` 1, `price` `{per:1,value:{gp:5}}`, `level` `{value:1}`, `rules` `[]`;
  - inputs not mutated.
- Refusals: Light at rank 2; Heal as a deck; Light with an added `focus` trait; Light with rarity `uncommon`; a template with the wrong source or category `scroll`.
- Light as a scroll is still refused.

`ai.spellConsumables.test.mjs`:
- A deck pick round-trips with rank 1 even when the reply says rank 7.
- The prompt contains no "base rank" and contains the no-numbers rule.
- An unknown id is dropped.

`compendium.cantripCandidates.test.mjs`: excludes focus cantrips, rituals, non-cantrips and uncommon entries.

`itemforge-app.cantripDeck.test.mjs`: the generate → preview → Create path writes one Item per distinct pick, from the stubbed template and Light.

`ai.hazardConcept.test.mjs`:
- `reaction.strike: {damageType:"piercing"}`, then a valid reply: two requests, and the final strike name is present.
- `routine.strike: {name:"", damageType:"piercing"}` twice: the call rejects with `SIMPLYPF2E.Hazard.Errors.Field`.
- `reaction.strike: "spikes"` is rejected the same way.

**Commits:**
- `feat(forge): cantrip decks of real common cantrips from the pinned template`
- `fix(hazard): AI gate requires a strike name like the builder`
- `test(forge): assert the TemplateMissing label`

### WP-C — Editor class filter, focus candidates, hazard token cap

- **Tier:** `haiku-high`. The logic is bounded and every site is specified. Escalate to `codex-terra-high` if the vm harness for (b) fails twice.
- **Depends on:** `c81b0bd`.
- **Owned files:**
  - `scripts/pc-edit.mjs`: rename the private `castsSpells` to the exported `classCastsSpells` and keep its internal use
  - `scripts/pc-editor.mjs`: new export
  - `scripts/generator-app.mjs`: line 537 and `#pcEditCatalogs` (lines 499–506) for (a); `#refineSpells` and the call at line 1733 for (b); line 1181 for (e); plus imports
  - `tests/pc-edit.test.mjs`, `tests/pc-editor.test.mjs`, `tests/generator-app.encounterHazard.test.mjs`: append or adjust stubs only
  - `tests/generator-app.pcFocusCandidates.test.mjs` (NEW, a vm harness mirroring `tests/pc-wizard.generator.test.mjs`)
- **Forbidden:** everything else, including `pc-support.mjs` (import only), `ai.mjs` and `lang/en.json`.

**Changes:**

(a) Editor class control:
- `pc-editor.mjs` gets `export function editableClassCandidates(candidates, classDocsByKey, currentKey)`. It returns the candidates whose doc (looked up by `pcIdentityKey(candidate)`) exists and `!classCastsSpells(doc)`, plus the candidate whose key equals `currentKey` if it is missing, in the original order. A missing doc excludes the candidate unless it is the current one.
- `#pcEditCatalogs` loads `getDocument(candidate.ref)` for each `offeredClass`, adds `editableClass`, and line 537 uses it.
- `pc-edit` keeps refusing casters (defense in depth).

(b) Focus candidates:
- `#refineSpells(concept, signal, { focus = true } = {})`; `const focusCandidates = focus ? await getFocusSpellCandidates(…) : [];`.
- The PC call becomes `await this.#refineSpells(concept, signal, { focus: classModelsFocusSpells(resolved.classDoc) });`.
- Import `classModelsFocusSpells` from `./pc-support.mjs`.
- The NPC and encounter calls are unchanged.

(e) Hazard token cap: `composition.members.map((member, i) => [`member${i}`, memberLabel(i), member.role === "hazard" ? taskMaxTokens(AI_TASK.HAZARD_CONCEPT) : <existing creature sum>])`.

**Acceptance:**
- The editor never lists Wizard (or any caster) unless it is the current class.
- A Wizard PC run makes zero `getFocusSpellCandidates` calls and passes `focusCandidates: []`.
- A class outside the complete-only registry still requests focus candidates.
- The hazard member's step weight equals the hazard task cap.
- Every other step weight is unchanged.

**Tests:**
- `pc-edit.test.mjs`: `classCastsSpells` is true for the real `wizard.json` (`spellcasting: 1`) and false for `precedent/fighter-class.json` (`spellcasting: 0`).
- `pc-editor.test.mjs`, with fighter, rogue and wizard fixtures:
  - current = fighter gives `[Fighter, Rogue]`;
  - current = wizard gives `[Fighter, Rogue, Wizard]`;
  - a candidate with no doc is excluded.
- `generator-app.pcFocusCandidates.test.mjs`: the PC run with mocks stops by making `selectSpells` throw `{cancelled:true}` after recording its arguments. Use the real `classModelsFocusSpells`.
  - Wizard: 0 calls, `focusCandidates` deep-equals `[]`.
  - "Champion": 1 call.
- `generator-app.encounterHazard.test.mjs`:
  - Stubs become `AI_TASK: { HAZARD_CONCEPT: "hazardConcept" }` and `taskMaxTokens: (t) => t === "hazardConcept" ? 2000 : 100`.
  - Assert the weights `[100, 600, 2000, 600, 1600]` for `design, member0, member1 (hazard), member2, match`.
  - Mirror the change in the second hazard scenario if it checks steps.

**Commits:**
- `fix(pc-editor): offer only noncaster classes in the editor class control`
- `fix(pc): no focus-spell candidates for classes without a modeled focus source`
- `fix(encounter): hazard member progress uses the hazard token cap`

## 5. Integration and review order

1. Create three worktrees from `claude/sprint-2026-10-27@c81b0bd`: WP-A, WP-B and WP-C, in parallel. They share no files.
2. Merge in this order, gating after each merge:
   - WP-C (smallest, haiku);
   - WP-A;
   - WP-B (largest).
   Expect no textual conflicts. If one appears, it is a brief violation: stop and report.
3. **Combined review:** Claude Opus 5.5 (high), fresh context, over `main..claude/sprint-2026-10-27`. That range covers the loot/parcel work (WP0–WP5, already reviewed once and fixed) and this wave. Mandatory checks for this wave:
   - the focus-pool claim against the §2.A.5 quotes;
   - the parser against both link forms;
   - fail-closed paths;
   - scroll, wand and NPC loot unchanged;
   - the deck field map against §2.B;
   - no AI numbers;
   - the gate parity in (c);
   - test honesty (values typed, not computed).
   Plus the 10-27 plan's §5 checklist.
4. **Fix ladder:** Haiku high, then Codex Terra high, then Opus xhigh. The orchestrator verifies each finding against the code first and records the rung. At most two re-review rounds.
5. Docs close-out (below), then the gate, then stop. Push, PR and merge wait for the user.

**Close-out docs (orchestrator), for both waves:**
- **README:**
  - Item forge: loot destination and parcel (gated); cantrip decks (common cantrips, no embedded spell, ungated); limitations and the licensing line for Party Treasure by Level.
  - Wizard paragraph and Limitations: the initial school spell is added and pf2e sizes the pool; the advanced school spell, curriculum and familiar stay manual.
  - Focus pool wording.
  - Keep `tests/presets.catalog.test.mjs` green.
- **PLAYBOOK:**
  - §1: Forge row adds loot container, parcel and cantrip decks; PC row adds Wizard school spell.
  - §3: loot schema "verified" bullet (10-27 plan §2.1–2.5); replace the focus-pool "verified" bullet with the §2.A.5 quotes; add the built-pack id-form link bullet (compendium-pack.ts 229, 407–419, 446–452); simplify the signed-off "pool size = count capped at 3" decision: native pf2e does it. F9: reconcile §6 (fix ladder) and CLAUDE.md to the current roster.
  - §4: Forge row adds `loot-actor.mjs`, `treasure-parcel.mjs`, `treasure-tables.mjs`; PC row adds `school-spells.mjs`; pure-module sentence.
  - §8: both waves shipped locally; the review results.
  - §9: items 1, 2, 3 and 5 done. Follow-ups: parcel v2 (permanent slots, wands, gems, denomination split, merchant mode, unify coin UUIDs with `builder.mjs`, drift default ref); advanced school spell; school spell in the preview; uncommon decks; drift check must follow the `v14-dev` move of schools to `class-features/wizard/`.
  - §10: loot/parcel limits; Wizard limits; focus-spell scope; scrolls/wands (cantrip deck now supported; no staves).
- **Ledger rows:** N12 loot actor and parcel; N13 Wizard school spell and focus pool (Battle Magic Wizard shows Force Bolt in a Focus entry, pool max 1; Champion with one focus spell shows max 1, not 2; spellcasting off → no focus entry; installed school link resolves); N14 cantrip deck ("Cantrip Deck of Light (5-pack)", level 1, 5 gp, uses 5/5, no embedded spell; link opens Light; gate-on loot destination works). All OPEN.
- **HISTORY:** both waves; the focus double-count finding, with **Pattern:** "a 'zeroed every prep' claim must also search every writer of the field (`prepareActorData`), not only the reset site"; the built-pack link rewrite; the frozen-`master` finding; the decisions.
- **`docs/README.md`:** rows for both plans and the review.

## 6. User decisions (recommendation first) and limits

**D1. Focus pool.** Taken: remove the cloned `focusPool` Rule Element for all PC focus classes, because pf2e adds +1 per non-cantrip focus spell itself (§2.A.5). This also removes the now-dead `focusPool` kind from `rule-templates.mjs`. This reopens a PLAYBOOK §3 "do not re-litigate" bullet, with quotes.

**D2.** Taken: add the school spell only when the character has spellcasting. With "Allow spellcasting" off, it is skipped silently.

**D3.** Taken: resolve the school spell at Create, not in the preview; a preview line is a follow-up.

**D4.** Taken: cantrip decks hold common cantrips only. The published text says "5 cards of a single common cantrip". Stricter than native, which copies any rarity.

**D5.** Taken: cantrip decks are ungated, like scrolls and wands; the loot destination stays gated. One item per distinct cantrip, using the template's `uses`, never a quantity.

**D6.** Taken: hide the level control for decks, which are always level 1 from the template.

**D7.** Taken: the (c) gate is slightly stricter than the builder: a nameless strike with an unoffered damage type now triggers a retry instead of a silent drop.

**Not verifiable without live Foundry** (N13 and N14):
- the native focus max after the change (1 for Wizard and for Champion);
- that the installed school description holds the id-form link and that `fromUuid` resolves it;
- that the school spell casts from the focus entry with Int and arcane;
- the deck sheet, "Pick a Card" and `autoDestroy`;
- that the deck works with no embedded spell (native is the same);
- the editor class list;
- progress bar weights.

**Technical risks:**
- The parser depends on the prose shape. Mitigation: two real shapes plus the built form are tested, and anything else fails closed with a warning.
- `v14-dev` moved the school files. That affects fixture URLs and the drift check, not the 8.5.0 runtime.
- The large-world candidate cut also applies to cantrips (`SPELL_CANDIDATE_LIMIT`).
- The HANDOFF worker-tooling note still applies: if a plugin hook refuses Write or Edit for subagents, use the scratchpad-and-`cp` recipe.

## 7. Estimated size

| WP | Lines (approx.) | Tier |
| --- | --- | --- |
| WP-A | ~60 module + ~70 pc-builder (net −10 with the Rule Element removal) + ~10 rule-templates + ~110 tests + ~80 builder-test + 3 fixtures | codex-terra-high |
| WP-B | ~45 spell-consumables + ~25 compendium + ~45 ai + ~40 itemforge + ~5 hbs + 4 lang keys + ~300 tests + 2 fixtures | codex-terra-high |
| WP-C | ~3 pc-edit + ~20 pc-editor + ~25 generator-app + ~200 tests | haiku-high |
| Close-out | ~150 docs | orchestrator |
