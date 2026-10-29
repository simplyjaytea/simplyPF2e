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
