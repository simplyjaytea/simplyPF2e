# AI prompt budget — Phase 1 measurement

**Branch:** `perf/prompt-budget` (off `main@03737af`, v0.3.5.86)
**Date:** 2026-10-30
**Status:** measurement only. No prompt, builder, selection, retry or output behavior was changed.

## What this measures

`tools/prompt-budget.mjs` runs the real prompt builders in `scripts/ai.mjs` with a stubbed `fetch`.
It captures the exact system and user strings the module would send, then returns a valid canned
JSON reply so the builder continues down its normal path. No Foundry world, no network, no provider
call, no live key.

Catalogs are built from the pinned pf2e 8.5.0 tree (`/tmp/pf2e-pf2e-8.5.0`) through the module's own
functions: `getAncestryCandidates`, `getHeritageCandidates`, `getBackgroundCandidates`,
`getClassCandidates`, `getFeatCandidates`, `getSpellCandidates`, `getFocusSpellCandidates`,
`getAbilityCandidates`, `getCreatureFeatCandidates`, `getEquipmentCandidates`, `getLootCandidates`,
`getScrollSpellCandidates`, `getBaseItemCandidates`, `getPropertyRuneCandidates`,
`getFundamentalRuneTiers`, `pcSpellPlan` and `casterArchetypePlans`. A compact index cache under
`/tmp/opencode` makes reruns fast; `--refresh` rebuilds it.

Token estimates are deliberately crude and shown two ways: `chars / 3.5` (prose-like) and
`chars / 2.5` (base64-heavy candidate IDs tokenize much worse than prose). Both cover system + user
characters. They are not provider counts; they are for comparing prompts and levers.

### Scenarios

| Scenario | Calls driven |
|---|---|
| Level 1 Fighter PC | concept, ABC, feats, equipment, PC loot draft, loot |
| Level 8 Bard PC (spontaneous occult, 5 cantrips + ranks 1–4) | concept, ABC, feats, spell focus, spells, equipment, PC loot draft, loot |
| Level 6 Fighter + Bard Dedication + Basic Bard Spellcasting | concept, ABC, feats, archetype spells, equipment, PC loot draft, loot |
| Level 5 spellcasting NPC | concept, spell focus, spells, abilities, creature feats, equipment, loot |
| Moderate encounter, party level 3, 4 PCs (80 XP: boss L4 + minion L1) | design + 2 × the NPC subflow |
| Forge runed weapon, level 8, common | runed item concept |

Common rarity was used for the ABC/spell/equipment/loot pools, matching the default generation
settings. `freeArchetype` was off; `multiclassArchetypes` was on (the archetype scenario needs it).

### Known approximations

- Feat slots use `buildFeatSlots` plus `getFeatCandidates` directly. Production's
  `resolvePCConcept` also stages documents, grants and prerequisite context before building those
  slot lists. Slot counts and schedules are exact; the offered feat lists are close but not
  byte-identical to a live world.
- NPC creature feats use `getCreatureFeatCandidates` + `rankCreatureFeatCandidates` with the same
  16-item cap, but without production's package-support filter (which needs loaded documents).
- PC equipment/loot run the real prompt builders, but not the later resolve/budget steps.
- Canned concepts carry a ~1,040-character backstory/description and a ~70-character blurb. Those
  lengths drive the "repeated concept text" columns; a live concept of a different length shifts
  them proportionally.
- Flow totals count the happy path (one request per call). The optional second PC purchase pass and
  the one-retry path are measured separately below. Native ChoiceSet (`selectCharacterChoices`),
  hazard members and parcel flows are out of scope for this phase.

## Per-call measurements

### PC level 1 Fighter

| # | call | task | maxTok | sys chars | user chars | tok @3.5 | tok @2.5 | top user sections | repeated concept chars |
|---|---|---|---|---|---|---|---|---|---|
| 1 | concept | pcConcept | 8000 | 7619 | 209 | 2237 | 3131 | Spellcasting allowed 97; Concept from the GM 94; Character level 19 | 72 |
| 2 | abc | abcSelection | 1024 | 462 | 41437 | 11971 | 16760 | Available heritages (ID / name) 19298; Available backgrounds (ID / name) 18647; Available classes (ID / name) 1587 | 1161 |
| 3 | feats | featSelection | 3072 | 384 | 810 | 341 | 478 | Feat catalog (ID / exact name) 369; Blurb 252; Slots (number / type / character level / allowed IDs) 150 | 66 |
| 4 | equipment | equipmentSelection | 1536 | 2396 | 4962 | 2102 | 2943 | Available items 3538; Description 1037; Traits 190 | 1161 |
| 5 | lootDraft | lootDraft | 1600 | 2469 | 1154 | 1035 | 1449 | Backstory 1035; Blurb 74; Character 31 | 1089 |
| 6 | loot | lootSelection | 2048 | 1472 | 6826 | 2371 | 3319 | Available items 3628; Available scroll spells (ID / name / base rank) 2752; First-draft loot (recreate this haul from the list) 112 | 138 |

**Flow total:** 6 calls, 14802 system chars, 55398 user chars, **20057 tokens @3.5**, **28080 tokens @2.5**. Repeated concept text: 6/6 calls, 3687 chars.

### PC level 8 Bard

| # | call | task | maxTok | sys chars | user chars | tok @3.5 | tok @2.5 | top user sections | repeated concept chars |
|---|---|---|---|---|---|---|---|---|---|
| 1 | concept | pcConcept | 8000 | 7619 | 168 | 2225 | 3115 | Concept from the GM 85; Spellcasting allowed 65; Character level 19 | 63 |
| 2 | abc | abcSelection | 1024 | 462 | 41430 | 11969 | 16757 | Available heritages (ID / name) 19298; Available backgrounds (ID / name) 18647; Available classes (ID / name) 1587 | 1152 |
| 3 | feats | featSelection | 3072 | 385 | 3383 | 1077 | 1507 | Feat catalog (ID / exact name) 2123; Slots (number / type / character level / allowed IDs) 976; Blurb 247 | 61 |
| 4 | spellFocus | spellFocus | 768 | 725 | 1264 | 568 | 796 | Description 1042; Original GM request 85; Blurb 69 | 1152 |
| 5 | spells | pcSpellSelection | 3072 | 2486 | 5496 | 2281 | 3193 | Available spells 3774; Description 1042; Available focus spells 243 | 1152 |
| 6 | equipment | equipmentSelection | 1536 | 2396 | 10440 | 3667 | 5134 | Available items 9027; Description 1042; Traits 187 | 1152 |
| 7 | lootDraft | lootDraft | 1600 | 2469 | 1152 | 1035 | 1448 | Backstory 1040; Blurb 69; Character 32 | 1089 |
| 8 | loot | lootSelection | 2048 | 1472 | 6945 | 2405 | 3367 | Available items 3763; Available scroll spells (ID / name / base rank) 2752; First-draft loot (recreate this haul from the list) 112 | 124 |

**Flow total:** 8 calls, 18014 system chars, 70278 user chars, **25227 tokens @3.5**, **35317 tokens @2.5**. Repeated concept text: 8/8 calls, 5945 chars.

### PC level 6 Fighter + Bard Dedication + Basic

| # | call | task | maxTok | sys chars | user chars | tok @3.5 | tok @2.5 | top user sections | repeated concept chars |
|---|---|---|---|---|---|---|---|---|---|
| 1 | concept | pcConcept | 8000 | 7619 | 184 | 2229 | 3121 | Concept from the GM 101; Spellcasting allowed 65; Character level 19 | 79 |
| 2 | abc | abcSelection | 1024 | 462 | 41466 | 11979 | 16771 | Available heritages (ID / name) 19298; Available backgrounds (ID / name) 18647; Available classes (ID / name) 1587 | 1188 |
| 3 | feats | featSelection | 3072 | 385 | 2891 | 936 | 1310 | Feat catalog (ID / exact name) 1817; Slots (number / type / character level / allowed IDs) 771; Blurb 262 | 76 |
| 4 | archetypeSpells | pcSpellSelection | 3072 | 1304 | 3536 | 1383 | 1936 | Available spells 2220; Description 1047; Original GM request 101 | 1188 |
| 5 | equipment | equipmentSelection | 1536 | 2396 | 9440 | 3382 | 4734 | Available items 7987; Description 1047; Traits 190 | 1188 |
| 6 | lootDraft | lootDraft | 1600 | 2469 | 1176 | 1041 | 1458 | Backstory 1045; Blurb 84; Character 33 | 1109 |
| 7 | loot | lootSelection | 2048 | 1472 | 6934 | 2402 | 3362 | Available items 3717; Available scroll spells (ID / name / base rank) 2752; First-draft loot (recreate this haul from the list) 112 | 155 |

**Flow total:** 7 calls, 16107 system chars, 65627 user chars, **23352 tokens @3.5**, **32692 tokens @2.5**. Repeated concept text: 7/7 calls, 4983 chars.

### NPC level 5 spellcaster

| # | call | task | maxTok | sys chars | user chars | tok @3.5 | tok @2.5 | top user sections | repeated concept chars |
|---|---|---|---|---|---|---|---|---|---|
| 1 | concept | creatureConcept | 8000 | 9072 | 261 | 2667 | 3733 | Concept from the GM 88; Spellcasting allowed 50; Equipment included 24 | 66 |
| 2 | spellFocus | spellFocus | 768 | 725 | 1127 | 529 | 741 | Description 866; Original GM request 88; Blurb 82 | 992 |
| 3 | spells | spellSelection | 1536 | 1428 | 4004 | 1552 | 2173 | Description 866; Rank 3 693; Rank 2 631 | 992 |
| 4 | abilities | abilitySelection | 1536 | 884 | 5864 | 1928 | 2699 | Bestiary action catalog (ID / exact name) 4741; Description 866; Original GM request 88 | 992 |
| 5 | creatureFeats | creatureFeatSelection | 1536 | 872 | 1212 | 595 | 834 | Description 866; Original GM request 88; Blurb 82 | 992 |
| 6 | equipment | equipmentSelection | 1536 | 2396 | 6440 | 2525 | 3534 | Available items 5164; Description 866; Strikes 167 | 992 |
| 7 | loot | lootSelection | 2048 | 1472 | 9776 | 3214 | 4499 | Available items 6639; Available scroll spells (ID / name / base rank) 2712; First-draft loot (recreate this haul from the list) 97 | 140 |

**Flow total:** 7 calls, 16849 system chars, 28684 user chars, **13010 tokens @3.5**, **18213 tokens @2.5**. Repeated concept text: 7/7 calls, 5166 chars.

### Encounter (moderate, party level 3, 4 PCs)

Composition from `composeEncounter("moderate", 4, 3)`: boss level 4 + minion level 1, 80/80 XP.

| # | call | task | maxTok | sys chars | user chars | tok @3.5 | tok @2.5 | top user sections | repeated concept chars |
|---|---|---|---|---|---|---|---|---|---|
| 1 | design | encounterDesign | 1024 | 605 | 203 | 231 | 323 | Theme from the GM 92; Slot 2 39; Slot 1 37 | 71 |
| 2 | member 1: concept | creatureConcept | 8000 | 9072 | 356 | 2694 | 3771 | Concept from the GM 183; Spellcasting allowed 50; Equipment included 24 | 71 |
| 3 | member 1: spellFocus | spellFocus | 768 | 725 | 1134 | 531 | 744 | Description 867; Original GM request 93; Blurb 82 | 998 |
| 4 | member 1: spells | spellSelection | 1536 | 1428 | 3758 | 1482 | 2074 | Description 867; Rank 2 756; Cantrips 754 | 998 |
| 5 | member 1: abilities | abilitySelection | 1536 | 884 | 5871 | 1930 | 2702 | Bestiary action catalog (ID / exact name) 4741; Description 867; Original GM request 93 | 998 |
| 6 | member 1: creatureFeats | creatureFeatSelection | 1536 | 872 | 1272 | 613 | 858 | Description 867; Feat catalog (ID / exact name) 110; Original GM request 93 | 998 |
| 7 | member 1: equipment | equipmentSelection | 1536 | 2396 | 5455 | 2243 | 3140 | Available items 4172; Description 867; Strikes 167 | 998 |
| 8 | member 1: loot | lootSelection | 2048 | 1472 | 8333 | 2801 | 3922 | Available items 5190; Available scroll spells (ID / name / base rank) 2712; First-draft loot (recreate this haul from the list) 97 | 145 |
| 9 | member 2: concept | creatureConcept | 8000 | 9072 | 358 | 2694 | 3772 | Concept from the GM 185; Spellcasting allowed 50; Equipment included 24 | 71 |
| 10 | member 2: spellFocus | spellFocus | 768 | 725 | 1139 | 533 | 746 | Description 870; Original GM request 93; Blurb 82 | 1001 |
| 11 | member 2: spells | spellSelection | 1536 | 1428 | 3007 | 1267 | 1774 | Description 870; Cantrips 754; Rank 1 743 | 1001 |
| 12 | member 2: abilities | abilitySelection | 1536 | 884 | 5876 | 1931 | 2704 | Bestiary action catalog (ID / exact name) 4741; Description 870; Original GM request 93 | 1001 |
| 13 | member 2: equipment | equipmentSelection | 1536 | 2396 | 4797 | 2055 | 2877 | Available items 3509; Description 870; Strikes 167 | 1001 |
| 14 | member 2: loot | lootSelection | 2048 | 1472 | 6774 | 2356 | 3298 | Available items 3629; Available scroll spells (ID / name / base rank) 2712; First-draft loot (recreate this haul from the list) 97 | 145 |

**Flow total:** 14 calls, 33431 system chars, 48333 user chars, **23361 tokens @3.5**, **32705 tokens @2.5**. Repeated concept text: 14/14 calls, 9497 chars.

Member 2 (level 1) has no creature-feat call: no ranked class-feat candidate sat at or below level 1
after the same 16-item shortlist production uses, so that stage is skipped. A live world with a
different source set may include it (+~0.6k tokens).

### Forge runed weapon (level 8, common)

Catalog pools: 183 base weapons, 19 property runes, 1 potency tier, 1 secondary tier.

| # | call | task | maxTok | sys chars | user chars | tok @3.5 | tok @2.5 | top user sections | repeated concept chars |
|---|---|---|---|---|---|---|---|---|---|
| 1 | concept | runedItemConcept | 2000 | 6464 | 142 | 1887 | 2642 | Item concept from the GM 104; Weapon target level 23; Rarity 16 | - |

**Flow total:** 1 call, 6464 system chars, 142 user chars, **1887 tokens @3.5**, **2642 tokens @2.5**.

### Conditional extra PC purchase pass (level 8 Bard)

`generator-app.mjs` makes one more `generatePCLoot` + `selectLoot` round when more than a quarter of
the loot budget is still coin (`needsExtraPurchasePass`). Measured on the level-8 Bard concept:

| # | call | task | maxTok | sys chars | user chars | tok @3.5 | tok @2.5 | top user sections |
|---|---|---|---|---|---|---|---|---|
| 1 | lootDraft (extra) | lootDraft | 1600 | 2469 | 1152 | 1035 | 1448 | Backstory 1040; Blurb 69; Character 32 |
| 2 | loot (extra) | lootSelection | 2048 | 1472 | 12599 | 4020 | 5628 | Available items 9353; Available scroll spells (ID / name / base rank) 2752; First-draft loot (recreate this haul from the list) 176 |

**Extra-pass total:** 2 calls, **5055 tokens @3.5**, 7076 @2.5. This is a real, avoidable 20% of a
level-8 Bard generation when the first pass leaves coin unspent.

## Calls per flow and retry policy

| Flow | AI calls (happy path) | Requests | Notes |
|---|---|---|---|
| L1 Fighter PC | 6 | 6 | +2 when the extra purchase pass triggers |
| L8 Bard PC | 8 | 8 | +2 when the extra purchase pass triggers |
| L6 Fighter + Bard Dedication | 7 | 7 | +2 when the extra purchase pass triggers |
| L5 spellcasting NPC | 7 | 7 | one concept call carries the whole draft |
| Moderate encounter (2 slots) | 14 | 14 | 1 design + 2 members; a requested hazard adds the separate hazard flow (not measured here) |
| Forge runed item | 1 | 1 | one call, no follow-ups |

`requestJSON` allows **exactly one retry** (`for attempt < 2`). On the second attempt it re-sends the
**same system prompt and the entire same user prompt**, appends a fixed 153-character
`IMPORTANT RETRY` suffix, and doubles the task's output allowance
(`completionOptionsFor(..., retryAttempt)` → `maxTokens × 2`, capped by the configured 8000).
It is a full re-send, not a targeted repair, and it re-bills the full input.

Measured on the ancestry/background/class call:

| | system chars | user chars | output cap |
|---|---|---|---|
| first attempt | 462 | 40316 | 1024 |
| retry | 462 | 40469 | 2048 |

That retry costs another **~11.5k input tokens @3.5** (the same 40k-char catalog is sent twice). The
recorded live evidence includes one failed PC generation that spent 36,184 tokens and created no
actor.

Retryable failures are only the transient/structural ones: empty content, reasoning without JSON,
truncated output, unparseable JSON, and `taskResponseProblem` structural failures (missing fields,
wrong array/object/string types, bad enum). Auth, HTTP, configuration and cancellation errors are
not retried. The harness cannot measure how often live replies fail validation; it measures the cost
when they do.

## Output allowances

| Task | Cap | What the harness can say |
|---|---|---|
| `pcConcept`, `creatureConcept` | 8000 | Recorded live totals minus measured input imply roughly 6-7k output tokens on the .72 Fighter (26,839 total vs 20,057 measured input @3.5). That makes the 8000 cap plausibly near-binding, but this is an inference, not a provider measurement. |
| spell/equipment/loot/ability/feat selection | 1536-3072 | Replies are small id arrays; caps are not the driver. |
| `runedItemConcept` | 2000 | One short object; not binding. |
| `encounterDesign` | 1024 | One name + brief per slot; not binding. |

Lowering the concept cap is not a free saving: a truncated reply is retryable, so the module re-sends
the whole input and doubles the cap. That can make one character cost more than no change.

## Ranked reduction levers

Savings below are computed from the measured prompt sizes above at `chars / 3.5`; the `@2.5` number is
roughly 1.4× larger. Levers interact (aliases shrink the text that later caps remove), so the
"after aliases" ranges are the realistic ones.

| # | Lever | Measured basis | Estimated saving | Quality / fail-closed risk |
|---|---|---|---|---|
| 1 | **Short per-request aliases for ABC** (the feat pattern already in `ai-candidate-format.mjs`) | ABC prompt is 41.4k chars; 623 entries carry 27,909 chars of `c-`+base64 IDs (67%). Two-character aliases cut that to ~1.2k. | PC **−7.6k tokens** per generation: L1 20.1k→12.4k (−38%), L8 25.2k→17.6k (−30%), arch 23.4k→15.7k (−33%). No NPC/Forge effect. | Low. Same candidates, same validation; only the wire format changes. Must keep the per-request alias→candidate map and required-choice matching, or a required pick breaks fail-closed. |
| 2 | **Scope heritages to the drafted ancestry + versatile/no-ancestry heritages** | 298 common heritages = 19,298 chars. The Human pool is 8 entries: 6 Human heritages plus the 2 common heritages with no ancestry owner. | **−5.4k tokens** alone; **−1.7k after aliases** (L1 −8%, L8 −7%). | Medium-low. The concept's drafted ancestry can be wrong, and this removes the chance to switch ancestry+heritage together. Keep all ancestries plus the unowned/versatile heritages (2 common; uncommon/rare ones are outside the common cap anyway). |
| 3 | **Rank/cap backgrounds** (e.g. 48 or 96 of 288, keyword-relevant first) | 288 backgrounds = 18,613 chars. 48 entries ≈ 3.1k chars. | **−4.4k tokens** alone; **−1.4k after aliases** (L1 −7%, L8 −6%). | Medium. A cap can exclude the best thematic background. Mitigate: keyword ranking, always include the drafted background, keep a broad baseline. |
| 4 | **Compact concept summary in selectors** instead of the full backstory/description | Selectors repeat 1,040 chars of concept text each; measured 3,687 chars (L1), 5,945 (L8), 4,983 (arch), 5,166 (NPC), 9,497 (encounter) per flow. | L1 −1.0k, L8 −1.7k, arch −1.7k, NPC −1.0k, encounter −1.9k tokens. | Medium. Spell/equipment/feat choice quality depends on theme detail. Keep the full text for the concept and loot-draft calls; summarize only grounding selectors. |
| 5 | **Cap candidate lists**: equipment 120→60, loot 120→60, scroll spells ~40→24, abilities 96→48 | Measured list sections: equipment 3.5-9.0k chars, loot 3.6-6.6k, scroll 2.7k, abilities 4.7k. | PC −1.0 to −2.5k; NPC −1.2k; encounter −2.5k. | Medium. Fewer niche options, but every pick is still checked against the offered IDs, so fail-closed behavior is unchanged. |
| 6 | **Trim static system prompts** | PC concept 7,619 chars, NPC concept 9,072, Forge 6,464, equipment 2,396, loot 1,472. The concept schema prose is the bulk. | PC −0.8 to −1.2k; NPC −1.2k; Forge −0.4k. | Low-medium. Keep every output key and constraint; remove repetition and examples, not rules. |
| 7 | **Fewer or deterministic calls** | Spell focus 0.53-0.57k; abilities 1.9k; equipment 2.1-3.7k; extra purchase pass 5.1k. | PC up to −2.5k (equipment + focus); NPC −1.9k; encounter −4k; **−5.1k when the extra pass triggers**. | High for abilities/equipment (AI chooses among real packages; a deterministic map may pick worse or fail closed); medium for focus keywords; medium for the extra pass (can leave wealth as coin). |
| 8 | **Cheaper retries** (re-ask only missing fields / reuse the catalog) | Retry re-sends the full 40.3k-char ABC prompt; measured +153-char suffix and doubled output cap. | −11.5k per avoided full ABC resend; the live failed PC retry burned 36.2k with no actor. | High if the retry drops context needed for fail-closed resolution; medium if it only re-asks omitted keys against the same candidate list. |
| 9 | **Cap/rank the Forge base list** | 183 base weapons drive most of the 6,464-char system prompt. | ~−1.0k on a 1.9k Forge call (−53%). | Medium. Base choice is the item's identity; rank by keywords/type and keep a broad spread. |
| 10 | **Lower output caps** | PC/NPC concept cap 8000; live inference suggests output is a material share. | No input saving. A truncated reply costs the full input again. | High. Do not lower without per-call live output data. |

### Cumulative estimate (levers 1-6, with interactions)

| Flow | Measured @3.5 | After 1+2+3 | After +4 | After +5 | After +6 |
|---|---|---|---|---|---|
| L1 Fighter | 20,057 | 9,379 | 8,408 | 6,803 | ~6,000 (−70%) |
| L8 Bard | 25,227 | 14,549 | 13,235 | 10,809 | ~9,900 (−61%) |
| L6 archetype | 23,352 | 12,674 | 11,360 | 9,100 | ~8,300 (−64%) |
| L5 NPC | 13,010 | 13,010 | 11,896 | 8,954 | ~8,000 (−38%) |
| Encounter | 23,361 | 23,361 | 21,275 | 16,273 | ~14,400 (−38%) |
| Forge | 1,887 | 1,887 | 1,887 | 1,887 | ~850 with lever 9 |

This is a prompt-size model, not a promise: real provider tokenizers weight base64 and JSON
punctuation differently, and the live totals also include output. The direction is clear —
**characters, especially the ABC call, are the problem**; NPC and encounter costs are spread more
evenly across selection calls.

The safest first cut is lever 1 alone: it is a wire-format change with no selection change and cuts
about a third of every PC generation. Levers 2 and 3 are the next best ratio of savings to risk;
levers 7 and 8 need a design decision because they can change what gets selected or how a failure is
recovered.

## Gate decision

**Not added to `tools/check.mjs`.** The harness depends on an external pinned pack tree
(`/tmp/pf2e-pf2e-8.5.0`) that is not in the repository, so CI cannot run it. It is also not reliably
under five seconds: a cold first run builds the index in 12.4s; warm runs take 1.2-2.1s and are
deterministic (the only difference between two `--json` runs is the `generatedAt` timestamp). It
stays a rerunnable tool.

Run it with:

```bash
PATH=/var/lib/openbot/OpenBot/Shared/.tools/node22/bin:$PATH node tools/prompt-budget.mjs
# or machine-readable
PATH=/var/lib/openbot/OpenBot/Shared/.tools/node22/bin:$PATH node tools/prompt-budget.mjs --json
```

## Reproduction notes

- Repo revision: `main@03737af` (v0.3.5.86), branch `perf/prompt-budget`.
- Pinned data: `/tmp/pf2e-pf2e-8.5.0` (pf2e 8.5.0 packs); common-rarity pools.
- No provider calls, no Foundry, no network. `fetch` is replaced in-process before `scripts/ai.mjs`
  is imported.
- A failed structural reply forces the real one-retry path; the retry measurement above is produced
  by deliberately returning `{}` once, then a valid object.
