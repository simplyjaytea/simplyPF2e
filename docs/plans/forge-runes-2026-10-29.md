# Forge runes: slot and family rules, the metal-armor decision, and the leftovers

**Status:** implemented on `work/forge-runes` (based on `main@74acb07`, v0.3.5.81). Not pushed, not merged. Native rows N40–N42 are OPEN. Owner: the Forge runed-item path (`scripts/item-builder.mjs`, `scripts/runes.mjs`). Source: `foundryvtt/pf2e` at tag `pf2e-8.5.0`, fetched raw on 2026-10-29.

## 1. What pf2e 8.5.0 encodes, quoted

### Property-rune slots: capped by the potency rune

`src/module/item/physical/runes.ts`, `getPropertyRuneSlots` (lines 24–35):

> `const fromMaterial = item.system.material.type === "orichalcum" ? 1 : 0;`
> `const fromPotency = ABP.isEnabled(item.actor) ? … : item.system.runes.potency;`
> `return (fromMaterial + fromPotency) as ZeroToFour;`

Enforcement is at prep, and it is silent. `src/module/item/armor/document.ts`, `prepareBaseData` (lines ~103–106), has the comment `// Limit property rune slots`, then `const maxPropertySlots = getPropertyRuneSlots(this);` and `this.system.runes.property.length = Math.min(this.system.runes.property.length, maxPropertySlots);`. The weapon document does the same at line 440 (`runes.property.length = Math.min(runes.property.length, getPropertyRuneSlots(this));`). Any excess runes are cut off, and the array order decides which survive.

Forge items are unowned, so `ABP.isEnabled(item.actor)` is false and `fromPotency` is `item.system.runes.potency`.

**Enforced (module):** the Forge keeps at most `potency` property runes. Each excess pick is dropped with a warning, naming the rune and the slot count. The kept set is the same as before (the first N after the family rule), so a valid item is unchanged.

### Orichalcum +1 slot: unreachable for Forge bases

`fromMaterial` adds one slot only when `item.system.material.type === "orichalcum"`. A material that is not in the base item needs `specific` armor or weapons. `src/module/item/armor/document.ts`:

> `override get isSpecific(): boolean { return !!this.system.specific; }`

and `src/module/item/armor/data.ts` line 30: `/** Details of specific magic armor, storing the material and rune state when toggled on */ specific: SpecificArmorData | null;`.

The Forge's base list already drops every entry with `specific` set (`getBaseItemCandidates`, `!e.specific`). The pack has no weapon or armor document with an orichalcum material outside that path (`packs/pf2e/equipment/` holds only `orichalcum-chunk.json`, `orichalcum-ingot.json` and a figure). So the slot count is the potency rune alone for every Forge base.

### Duplicate and superseded grades: a module policy, not a pf2e rule

`runes.ts`, `prunePropertyRunes` (lines 37–49):

> `!runeSet.has(`greater${r.titleCase()}`) && !runeSet.has(`major${r.replace(/^greater/, "").titleCase()}`) && !runeSet.has(`true${r.replace(/^greater|^major/, "").titleCase()}`)`

This function is defined and exported (`runes.ts` 2484–2492), and the 8.5.0 source **never calls it**. A search of the item and sheet sources found no caller. Valuation (`getRuneValuationData`, lines 51–91) reads `item.system.runes.property` directly, without pruning. So pf2e 8.5.0 does not stop Flaming and Flaming (Greater) from being applied together.

The previous Forge comment said pf2e "calls prunePropertyRunes() before determining valuation". That premise is false, and this change removes the claim. The one-per-family rule stays as a **module policy**: the greater, major or true grade replaces the lesser grades of the same family, and a repeated pick is kept once. The module's rule list is the same as the function's, so the policy and the cited function agree.

### Prerequisites and exclusivity: not encoded

The real rune items carry no rule data. `packs/pf2e/equipment/flaming.json` (level 8, price 500 gp, `usage: etched-onto-a-weapon`) and `flaming-greater.json` (level 15, price 6500 gp, same usage) both have `"rules": []` and `prerequisites: null`. The rune source (`runes.ts`) has no `requirements`, `prerequisites` or exclusivity field.

**Not enforced:** prerequisites (none are encoded); exclusivity beyond the family policy above (none is encoded); lesser and moderate grades, which the policy does not supersede because pf2e's rule list does not name them; and a rune's level against its potency, which is a published level with no rule attached.

## 2. Metal armor: keep the exclusion

The three usages `etched-onto-metal-armor`, `etched-onto-lm-nonmetal-armor` and `etched-onto-medium-heavy-metal-armor` need an armor's metal-ness. pf2e 8.5.0 does not encode it:

- The usage strings are labels only. `src/scripts/config/usage.ts` lines 91, 93 and 95 map them to `PF2E.TraitEtchedOntoMetalArmor`, `…LightMedNMArmor` and `…MediumHeavyMetalArmor`. No code reads them as a constraint in the item sources.
- Armor `group` is a material family, not a metal flag. `src/module/item/armor/values.ts` lists `ceramic, chain, cloth, composite, leather, plate, polymer, skeletal, wood`. It does not say which of these are metal.
- Pack armor carries no metal data. `packs/pf2e/equipment/breastplate.json`: `group: plate`, `traits: []`, `material: {grade: null, type: null}`. `chain-mail.json`: `group: chain`, `traits: ["flexible", "noisy"]`, `material: {grade: null, type: null}`.
- The material tables (`physical/materials.ts`, `physical/values.ts`) list precious materials only (`cold-iron`, `adamantine`, and so on). No `metal` material is defined.

Because the item data cannot prove metal-ness, the three usages stay excluded and fail closed, as before. Inferring metal from `group` (for example, chain or plate) would invent a rule, so it is not done.

## 3. The leftovers

- **Skillful Lessons name-form uuid (`pc-builder.mjs`).** Keep it. The 8.5.0 Investigator class document stores the name form in its level-3 item: `packs/pf2e/classes/investigator.json` lines 165–166, `"name": "Skillful Lessons"` and `"uuid": "Compendium.pf2e.classfeatures.Item.Skillful Lessons"`. The id form (`dmK1wya8GBi9MmCB`, `packs/pf2e/class-features/skillful-lessons.json`) is the same feature. Dropping the name form would stop the Investigator's odd-level skill slot from getting its mental-skill candidates. The drift tool keeps warning on it, which is accurate: a name is not a 16-character document id. `tests/pc-builder.native-feat-slots.test.mjs` now proves the name form resolves to the same candidates.
- **`builder.coins.test` pin.** The test now asserts that `coinEntry` resolves each denomination to its published id (`pp` → `JuNPeK5Qm1w6wpb4`, `gp` → `B6B7tBWJSqOBz5zz`, `sp` → `5Ew82vBF9YfaiY9f`, `cp` → `lzJ8AVhRcbFul5fh`). Before, a changed id would still pass through the name fallback.
- **Cantrip-deck rarity select.** Kept all four options, and added a deck-only note (`SIMPLYPF2E.ItemForge.Consumables.DeckRarityNote`): a deck uses common or uncommon cantrips, and a rare or unique choice is capped at uncommon. Filtering the options would drop the chosen rarity when the kind changes, which breaks H1 (`70d7b41`, rarity kept across kind switches), so the note was the simpler and safer choice.

## 4. Tests and revert checks

New file `tests/item-builder.runeSlots.test.mjs`. Each revert is applied to one line, the test is run, and the line is restored.

| Revert | Result |
| --- | --- |
| remove the potency slot cap (`kept.slice(0, potency)` → `kept`) | fails: "potency 1 holds one property rune" |
| remove the slot warning | fails: "the excess pick is dropped with a warning" |
| remove the family policy (`kept = selectedProperties`) | fails: "the greater grade replaces the lesser grade" |
| remove the duplicate warning | fails: "the second copy is warned" |

Regression: the valid-item case in the same file pins the full output of an existing valid item and asserts no warning. Run against HEAD's `item-builder.mjs`, the normalized output is byte-identical (`JSON.stringify` equal).

Other changed tests and their revert checks:

- `tests/pc-builder.native-feat-slots.test.mjs`: the name-form Skillful Lessons uuid resolves to the mental-skill candidate. Removing the name form from the list in `pc-builder.mjs` fails it.
- `tests/builder.coins.test.mjs`: the coin pin. Changing `gp` in `loot-actor.mjs` `COIN_UUIDS` fails it ("gp is looked up by its published id").
- `tests/itemforge-app.cantripDeck.test.mjs`: the deck note sits under the rarity select, for decks only, and the rarity select still lists every rarity. Removing the note fails it.

## 5. Decisions

1. Keep the potency cap and make its drops visible (a warning per dropped pick). No change to which runes are kept.
2. The one-per-family rule stays, as a module policy, with its citation corrected. pf2e 8.5.0 does not call the function that the earlier comment cited.
3. Metal-armor usages stay excluded (no metal data in 8.5.0).
4. Skillful Lessons keeps both uuid forms.
5. Deck rarity: a note, not a filtered list.

## 6. Gaps

- No Foundry run. N40–N42 are OPEN. Nothing has yet confirmed on a native sheet that a Forge item built under the family policy shows only the kept rune.
- The family policy is a module decision. A GM who edits a created item by hand can still stack Flaming and Flaming (Greater), because pf2e does not stop it.
- The drift tool still warns on the name-form Skillful Lessons uuid. That warning is accurate and is accepted.
- `lesser` and `moderate` grades are not in the family policy. The question of whether they supersede a base rune is not answered by 8.5.0 data.

## 7. Repair round (Code Reviewer, APPROVE WITH FIXES on `b0dec6c`)

### Dropped runes reach the preview

`normalizeRunedItemConcept` now returns `propertyDrops`: one entry per dropped property rune, with its `reason` (`slot`, `family`, `duplicate` or `category`), its `name`, and for `slot` the `slots` count and for `category` the base category. `category` is the fourth reason: the earlier record listed three, but a category drop is also a rune the GM asked for and did not get, so it is shown too. The `console.warn` lines are kept.

`itemforge-app.mjs` builds one localized line per drop (`droppedRuneLines`, literal keys under `SIMPLYPF2E.ItemForge.Dropped`) and the runed preview renders them with `{{this}}`, under the rune list. Lines never block Create.

Each line reads the English text in `lang/en.json`, for example: "Fire was not kept: a potency +1 rune leaves 1 property-rune slot(s) for this item."

### Golden regression for the built concept

`tests/fixtures/forge-runes/normalize-cases.json` holds eight rune combinations (valid two-rune plate, an overflow at potency +1, a light base with a light-only rune, Flaming with Flaming (Greater), a duplicate pick, a category drop, a weapon with one Flaming rune, and no property runes). Each case stores its candidate specs, the picks by label, and `expected`.

How `expected` was captured: `git show 74acb07:scripts/item-builder.mjs` was copied to a temporary module next to the scripts. Each case's candidates were issued with `issueCandidate({ packId: "test.runes", _id })`, labels were mapped to the issued ids, and `normalizeRunedItemConcept` ran with the same arguments the test uses. The output was written as JSON. The temporary module and capture script were deleted afterwards, and no capture artifacts are in the fixture.

`tests/item-builder.golden.test.mjs` replays each case through the current code. The built concept must equal `expected` exactly, except for the new `propertyDrops` key, which is checked separately to be an array.

### Tests and revert checks (this round)

| Revert | Caught by |
| --- | --- |
| drops removed from the preview context | `itemforge-app.runedDrops`: overflow line |
| preview block removed from the template | `itemforge-app.runedDrops`: wiring check |
| preview block changed to unescaped output | `itemforge-app.runedDrops`: escaping check |
| family drop not returned | `itemforge-app.runedDrops`: family line |
| duplicate drop not returned | `itemforge-app.runedDrops`: duplicate line |
| slot drop not returned | `itemforge-app.runedDrops`: overflow line |
| slot cap removed | `item-builder.golden`: overflow case differs from main@74acb07 |
| a drop blocks Create | `itemforge-app.runedDrops`: Create still writes |
| a lang key removed | `check.mjs` integrity: "Missing localization key" (the key is now literal) |

All revert checks were run on the file and restored from a copy. The app test also checks that the console warning still appears.

### Gate

`node tools/check.mjs </dev/null` exits 0 on Node 22.23.4: `Integrity passed: 386 imports, 992 exports, 15 templates, 640 localization keys; 0 unused keys`; `Links passed: 209 links in 61 files`; `Regressions passed: 148 files`. `git diff --check main..HEAD` is clean.
