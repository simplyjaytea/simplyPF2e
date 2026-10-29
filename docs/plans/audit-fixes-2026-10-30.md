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

Commits: `51851e6` (copy-paste replacement), `2cb6897` (PC levels, primal, settings), `978cc2e` (golden tables, Forge formulas, dynamic keys), and the parcel-runed primal case (see the PARCEL commit below).

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
