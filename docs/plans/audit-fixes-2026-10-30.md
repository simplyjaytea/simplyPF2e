# Audit fixes 2026-10-30: part A (safety, correctness, test hardening)

Owner: Code Monkey (CM1). Branch `fix/safety`, base `integrate/2026-10-30@69af4c6`. This file holds CM1's sections only; other sections belong to their owners. Loot budget band and coin-padding cap are handed to CM2 and are not changed here.

## 1. Enricher-inert AI prose (items 1 and 2)

**Policy.** Foundry enrichers (`@UUID`, `@Check`, `@Damage`, `@Localize`, `@Template`, `@Embed`, inline `[[/r ...]]`) run on stored HTML by source text. AI prose is text, so it must not carry them. `inertText(text)` in `scripts/text.mjs` HTML-escapes the text, then writes `@` as `&#64;` and `[` as `&#91;`. The visible text is unchanged; the enricher no longer matches the source.

**Why character references.** Escaping HTML alone does not stop enrichers (PLAYBOOK invariant 5). Removing the characters would lose the text. A character reference keeps the visible text and fails the enricher match.

**Applied to** cosmetic fields only:
- NPC (`scripts/builder.mjs`): `description`/`blurb`, `readAloud`, `recallKnowledge`, `notes`, and narrative action text. The module's own `@Check[type:…|dc:…]` for recall stays live.
- PC (`scripts/pc-builder.mjs`, through the shared `toHtml`): backstory, appearance, allies.
- Forge (`scripts/item-builder.mjs`): magic item description, runed-item description and effect name, runed property-rune names in the summary (item 2: a hostile name such as `@UUID[...]` is escaped).
- Hazards (`scripts/hazard-builder.mjs`): reaction trigger/effect, save effect, routine text. The module's `@Check[${reaction.save.type}|dc:…]` stays live.
- Encounter text: `scripts/encounter.mjs` writes no prose. Encounter members go through `normalizeConcept` and `createActor` (`generator-app.mjs`), so they get the NPC policy.

**Tests:** `tests/text.inertProse.test.mjs` (eight token families; visible text kept; `toHtml` paragraphs), `tests/npc.inertProse.test.mjs`, `tests/item-builder.inertProse.test.mjs` (magic item and a runed build with a hostile property-rune name), and the PC biography block in `tests/pc-wizard.builder.test.mjs` (`enricherTokens` must find no token).

**Not verified:** a live Foundry session. The test oracle is `enricherTokens` from `scripts/reskin-policy.mjs`, which follows Foundry's enricher regex on source text. It is not Foundry's own parser.

## 2. Cancel and timeout while the body is read (item 3)

`scripts/ai.mjs`, non-streaming branch of `requestCompletion`: the `response.json()` catch rethrows an `AbortError` or an aborted controller. The outer handler then reports `Cancelled` (user signal) or `Timeout` (idle seconds). Before, both were reported as `InvalidResponse`.

**Test:** `tests/ai.abortBody.test.mjs`. A stub response whose `json()` waits and then rejects on abort. Cases: cancel reports `Cancelled`; timeout (10 s) reports `Timeout`; a genuinely bad body still reports `InvalidResponse` (negative control). Reverting the fix makes the first two fail.

## 3. Localization (item 4)

- Encounter budget error: `composeEncounter` (pure) throws with `messageKey`/`messageData`. `generator-app.mjs` formats it through `composeEncounterForGM`. Key: `SIMPLYPF2E.Generator.EncounterBudgetTooSmall`.
- Rollback survivor text: `rollbackCreatedActor` in `post-create.mjs` takes a `survivor` callback; the generator and loot paths localize it (`SIMPLYPF2E.Generator.Survivor.*`).
- Stat-line labels: `SIMPLYPF2E.Preview.StatAC`, `StatHP`, `StatPerception`, `StatDC` in the encounter and hazard previews.
- Test stubs in six `generator-app`/`itemforge-app` harnesses now localize these keys.

## 4. Test hardening (item 5)

Commits: `51851e6` (copy-paste replacement), `2cb6897` (PC levels, primal, settings), `978cc2e` (golden tables, Forge formulas, dynamic keys), and the parcel-runed primal case in `daa830f`.

**Copy-paste tests replaced by imports of the real code:**
- `runes.capRunes`: `capRuneTiers` and `runeGpFor` are now the pure cores of `capRunes`/`runeGp`. Exported from `scripts/runes.mjs`.
- `pc-builder.featslot`: `featSlotCandidates` (exported; retry logic moved out of `resolvePCConcept` unchanged).
- `pc-builder.languages`: `resolveLanguages` exported.
- `pc-builder.featdedup`: real `resolveFeatPicks` against a stub feats pack.
- `generator-app.goldshortfall`: `needsExtraPurchasePass` moved to `scripts/purchase-pass.mjs` (unchanged logic, plus the no-budget guard that was already inline). `generator-app.mjs` imports it. Ten generator harnesses gain the `needsExtraPurchasePass` mock, and `builder.equipmentValueGp` pins the predicate in its new module.

**New coverage:**
- `tables.golden.test.mjs`: snapshot of every `scripts/tables.mjs` table; encounter budgets and encounters; two creature stat blocks (a brute and a caster) through `computeStats` and `createActor`. Fixtures in `tests/fixtures/tables/`.
- `item-builder.formulas.test.mjs`: damage dice, save DC by rarity, price windows, with literal expectations.
- `pc-builder.abilityAndFeats.test.mjs`: boost levels, ability-priority order, level-20 boost, general feat levels.
- `settings.endpoints.test.mjs`: DeepSeek first-party host; keyless-local ranges incl. link-local.
- `spell-consumables` and `parcel-runed`: each magic tradition (primal included) drops `magical` in `traits.value`, and refuses a base.
- `lang.dynamicKeys.test.mjs`: 14 dynamic key families, 97 keys, all resolve in `lang/en.json`.

**Mutation results.** Each mutation is one exact replacement in a fresh copy of the tree. "Before" is the base commit `69af4c6` with its own tests. "After" is this branch. The killer set is every test file that names the mutated module. Driver: scratch only, not committed.

| ID | Mutation (one line, `scripts/` file) | Before: base suite | After: this branch |
|---|---|---|---|
| E1 | encounter severe budget 120→110 | survived (0/5) | killed (1/7: tables.golden) |
| E2 | encounter boss offset severe 2→1 | survived (0/5) | killed (1/7: tables.golden) |
| E3 | encounter minion tie-break reversed | survived (0/5) | killed (1/7: tables.golden) |
| F1 | saveDcForLevel ignores rarity | survived (0/11) | killed (1/13: item-builder.formulas) |
| F2 | saveDcForLevel uses high benchmark | survived (0/11) | killed (1/13: item-builder.formulas) |
| F3 | damageDiceForLevel uses high row | survived (0/11) | killed (1/13: item-builder.formulas) |
| F4 | priceForLevel MIN_PRICE_SAMPLES 5→4 | survived (0/11) | killed (1/13: item-builder.formulas) |
| F5 | uncommon rarity DC 2→3 | survived (0/21) | killed (1/24: tables.golden) |
| F6 | uncommon price multiplier 1.5→1.6 | survived (0/21) | killed (1/24: tables.golden) |
| P1 | ABILITY_BOOST_LEVELS last 20→19 | survived (0/8) | killed (1/9: pc-builder.abilityAndFeats) |
| P2 | GENERAL_FEAT_LEVELS last 19→20 | survived (0/8) | killed (1/9: pc-builder.abilityAndFeats) |
| P3 | ability priority: key ability not first | survived (0/24) | killed (1/25: pc-builder.abilityAndFeats) |
| P4 | ability priority: default tail reversed | survived (0/24) | killed (1/25: pc-builder.abilityAndFeats) |
| T1 | primal dropped from spell-consumables set | survived (0/4) | killed (1/4: spell-consumables) |
| T2 | primal dropped from parcel-runed set | survived (0/2) | killed (1/2: parcel-runed) |
| S1 | DeepSeek host suffix match | survived (0/26) | killed (1/28: settings.endpoints) |
| S2 | DeepSeek trailing dot not stripped | survived (0/26) | killed (1/28: settings.endpoints) |
| S3 | link-local 169.254 not recognized | survived (0/26) | killed (1/28: settings.endpoints) |
| S4 | 172.16/12 upper bound 31→32 | survived (0/26) | killed (1/28: settings.endpoints) |
| C1 | language automatic-skip removed | survived (0/24) | killed (1/25: pc-builder.languages) |
| C2 | language Int bonus ignored | killed (1/24: pc-builder.finalization) | killed (2/25: finalization, languages) |
| C3 | feat trait-retry removed (base: inline; after: featSlotCandidates) | survived (0/24) | killed (1/25: pc-builder.featslot) |
| C4 | feat cross-slot dedup removed | survived (0/24) | killed (1/25: pc-builder.featdedup) |
| C5 | rune cap level bound off by one | survived (0/8) | killed (1/8: runes.capRunes) |
| C6 | extra-pass threshold 25%→50% | killed (1/19: builder.equipmentValueGp source-text pin only; no behavioral test) | killed (2/12: goldshortfall, equipmentValueGp) |

Reading the table:
- Before: 23 of the 25 rows survived. C2 was killed by a finalization test. C6 was killed only by `builder.equipmentValueGp`, a source-text pin; no base test exercised the threshold behavior. C3 is the base inline retry (C3b in the driver); the base copy test survives it.
- After: all 25 rows are killed.

## 5. Dynamic lang keys (item 6)

`tests/lang.dynamicKeys.test.mjs` enumerates the values of each dynamic key family from the code tables (THREATS, TREASURE_AMOUNT_MULTIPLIER, DEFAULT_PACKS, PERMANENT_REASON, PARCEL_DROP and others) and checks each key in `lang/en.json`. The static integrity check only checks a prefix as a family.

## 6. Handoffs and gaps

- **Handed to CM2:** loot budget band (0.8/1.2 → 0.5/1.5) and coin-padding cap (100000 → 100), both in `applyTreasureBudget` (`scripts/builder.mjs` ~638–666).
- **Gap:** no live Foundry check of enricher-inert prose, cancel/timeout in a real browser, or localized strings in the UI.
- **Gap:** golden tables pin the current values. They prove no drift, not agreement with GM Core print. The README says the tables are hand-transcribed.

# Audit fixes, 2026-10-30

Record for the audit fix wave. Part B, "the AI never emits numbers" (PLAYBOOK §3 invariant 4), is below. Part A (text and escaping) is owned by the fix-safety checkout and is recorded separately.

Base: `integrate/2026-10-30@69af4c6`. Branch: `fix/numbers`. Worktree: `Shared/worktrees/fix-numbers`.

## B1. Finding and design

Code Reviewer HIGH #2: the creature, PC and loot prompts asked the model for numbers, and the module used them for speeds, senses ranges, equipment and loot quantities and values, coin counts, and priced custom items for unmatched names.

Decisions taken by the Lead, implemented here:

- The AI writes no price and no coin amount. Unmatched names are dropped with `console.warn`.
- Coins are set by the treasure budget from the real remainder.
- Speeds, senses ranges and ranged strike increments come from fixed lists.
- Named quantities keep a bounded count (1–10) as a documented carve-out. The budget trim decides what fits.

## B2. Inventory of AI numeric fields

Method: a grep of every AI schema and prompt in `scripts/ai.mjs` for `: number`, `number|`, `integer` and `"quantity"`, `"rank"`, `"value"`, `"range"`, `"speeds"`, `"senses"`. Each hit was then traced to its normaliser. Schemas with no numeric field were checked by reading the schema.

Classes:

- **(a)** not in the AI schema, or overridden by module data.
- **(b)** replaced by an enum or a module-owned value.
- **(c)** a bounded count or rank, kept as a documented carve-out.

| AI field | Schema | Class | Module behaviour (file) |
|---|---|---|---|
| creature `speeds[].value` | creature | (b) | Fixed list per movement type; off-list dropped; land 25 default (`builder.mjs` `SPEED_VALUES`) |
| creature `senses[].range` | creature | (b) | `30`, `60`, `120` or null (`builder.mjs` `SENSE_RANGES`) |
| creature `strikes[].range` (ranged) | creature | (b) | Fixed increments `10`–`150` (`STRIKE_RANGES`); the `thrown-N` trait's own number is kept, since PF2e derives it |
| creature `strikes[].attackScale`, `damageScale` | creature | (b) | Scale words only (`scale4`) |
| creature `spellcasting.spells[].rank` | creature | (b) | Clamped to `0..maxSpellRank` from level (`builder.mjs` ~310); lifted to the real spell's base rank (~796) |
| creature `spellcasting.dcScale`, `skills[].scale`, `abilityScales` | creature | (b) | Scale words only |
| creature `equipment[].quantity` | creature | (c) | Clamped 1–10 (`normalizeConcept`) |
| creature `equipment[].value` | creature | **removed** | Was read as a fallback price; now the field is absent from the schema and not read |
| creature `loot[].quantity` (named) | creature | (c) | Clamped 1–10 (`normalizeLoot`) |
| creature `loot[].value` | creature | **removed** | As above |
| creature loot coin lines (`"Gold Coins"` with a count) | creature, PC loot | **removed** | `normalizeLoot` drops them with a warning; `applyTreasureBudget` sets coin amounts |
| resistances, weaknesses | creature | (a) | Types only; values come from the benchmark tables |
| HP, AC, saves, level, XP, strike bonus and damage | creature, hazard | (a) | Not in any schema; computed from `tables.mjs` and `hazard-tables.mjs` |
| grounded equipment pass `quantity` | grounded pass | (c) | Clamped 1–10 (`ai.mjs` ~762) |
| grounded loot pass `quantity` | grounded pass | (c) | No cap at the AI; `normalizeLoot` clamps named quantities to 10 |
| grounded loot pass scroll `rank` | grounded pass | (b) | Clamped to the real spell's base rank and to 10 (`ai.mjs`, `resolveLoot`) |
| grounded loot and equipment `value` | grounded pass | **removed** | Was `0`; the field is gone |
| spell consumable pick `rank` | scroll, wand | (c) | Integer from the spell's base rank to the kind's ceiling; out-of-range dropped (`ai.mjs` ~889) |
| itemforge pick `slot` | forge | (b) | Identifier from the listed slots; validated against the list |
| PC spell `rank` | PC | (b) | Enum slugs (`PC_SPELL_RANKS`), mapped to numbers and validated (`pc-builder.mjs` ~1107) |
| PC equipment `quantity` | PC | (c) | Clamped 1–10 (`pc-builder.mjs` `normalizeConcept`) |
| PC equipment and loot `value` | PC | **removed** | As the creature rows |
| PC feats, skill priorities | PC | (b) | Names from issued candidate lists; priorities are words |
| PC starting wealth | PC | (a) | Module computed (`pcStartingWealthGp`) |
| encounter composition (`briefs`, `hazard`) | encounter | (b) | `hazard` is `none`, `simple` or `complex` (`encounter.mjs` `hazardRequest`); counts and XP are module budget |
| hazard `complex` | hazard | (b) | Now fixed by the request when the composition sets it (B5) |
| hazard `routine.actions` | hazard | (c) | Integer 1–3, `ROUTINE_ACTIONS` (`hazard-builder.mjs` ~209); a structural action count |
| hazard dispel counteract rank | hazard | (a) | Module convention, half the level rounded up (`hazard-builder.mjs` ~313) |
| hazard `stealth`, `ac`, `saves`, `disable[].scale` | hazard | (b) | Scale words only |
| parcel valuables and runed picks | parcel | (b) | Issued ids; values from the compendium (a) |

Carve-out classes (c): named quantities 1–10, grounded quantities 1–10, scroll, wand and PC spell ranks within their module bounds, and `routine.actions` 1–3. These are the only AI integers that reach the sheet. PLAYBOOK §3 records them next to invariant 4.

## B3. Prices and coins

- AI schemas drop `value` (creature, PC, loot prompt, grounded passes). `normalizeConcept`, `normalizeLoot` and the PC normaliser no longer read it.
- `resolveLoot` and `resolveEquipment` drop an unmatched name with `console.warn`. They do not create a priced custom item. `customTreasureItem` and `customEquipmentItem` are deleted.
- `equipmentValueGp` values only real compendium prices. An unmatched line values at 0, and resolveEquipment has already dropped it.
- AI coin lines are dropped with a warning. `applyTreasureBudget` adds or trims Gold Pieces to the real remainder, as before.

## B4. Speeds, senses, strikes

Speed lists (module convention, not quoted from a published table; see B8):

| Type | Values (ft) |
|---|---|
| land | 5–60, steps of 5 |
| fly | 5–60, steps of 5 |
| swim | 5–40, steps of 5 |
| climb | 5–40, steps of 5 |
| burrow | 5–30, steps of 5 |

Senses range: `30`, `60`, `120`, or null (imprecise or no range). Ranged strike increments: `10, 20, 30, 40, 60, 80, 100, 120, 150`, or null (the sheet keeps its default of 30).

Off-list values are dropped, not rounded. The land default of 25 ft stays when no speed survives.

## B5. Hazard kind (PLAYBOOK §10)

- `generateHazardConcept` takes `complex` (true, false, or unset). When set, the payload carries `kind`, the system prompt fixes `"complex"` to that value, and the validator rejects a concept of the other kind with the same field check it uses for any bad field.
- The rejection happens inside the call. The provider's validation retry produces the requested kind. A mismatch can therefore reach the caller only if the validator is bypassed.
- Spend: a mismatched first attempt still costs one provider call. The retry is the only extra cost, and it is bounded by the existing one-retry policy. This part does not avoid that first call, because the kind cannot be known before the model answers.
- The encounter composition passes `complex: Boolean(slot.complex)`. The post-hoc drop in `#encounterHazardMember` stays as a backstop.

## B6. Rarity cap (README Limitations)

- The generator's Max rarity setting (`rarityCap`, default `unique`, which filters nothing) now filters: feats (`getFeatCandidates`, `getCreatureFeatCandidates`, PC multiclass feats), spells (`getSpellCandidates`, `getFocusSpellCandidates`), equipment (`getEquipmentCandidates`) and loot (`getLootCandidates`).
- Each filter takes an optional `maxRarity`. Without it, or with `unique`, the pool is unchanged.
- The generator passes `this.#input.rarityCap` at each call site: PC `resolvePCConcept` (three calls), PC equipment candidates, creature spells, focus spells, creature feats, NPC equipment and loot candidates.
- Not covered: the Character editor's `pc-edit.mjs` path (exact content only, no candidate pool), and Forge pools, which have their own rarity input.

## B7. Verification

Recorded in the final report. Each revert check was run against a copy and restored; committed files were never reset.

- Price and coin revert: `tests/builder.numbers.test.mjs` fails when AI coins are kept (M4), unmatched loot is kept (M5) or unmatched equipment is kept (M6), when NPC padding is removed (M7), and when the AI equipment `value` is read again (M8). Speed, senses and strike free-range reverts (M1–M3) also fail.
- Hazard kind revert: `tests/ai.hazardConcept.test.mjs` fails when the validator no longer checks the kind (R1). `tests/generator-app.encounterHazard.test.mjs` fails when the pass-through is removed (R2).
- Rarity revert: `tests/compendium.rarityCap.test.mjs` fails when the spell filter is removed (R3).

## B8. Gaps and conventions

- **Speed and sense lists are module conventions.** They are not quoted from the pf2e 8.5.0 source, which was not fetched in this part. The Lead's rule is to quote a published source or record a convention. This is the convention. To source it: pull the bestiary creature speeds and sense ranges from `foundryvtt/pf2e` at `pf2e-8.5.0` and tighten the lists if they differ.
- **Strike increments** are a module convention, like the speed lists.
- **requestJSON retry**: `ai.mjs` calls `args.onProgress({ phase: "retrying" })` without a guard, so a caller that passes no `onProgress` gets a `TypeError` on the retry instead of the retry. Production always passes one. It is noted here, not changed in this part.
- Coin lines from the AI are dropped rather than kept as a hint. The Lead allowed either; dropping is the simpler contract.
