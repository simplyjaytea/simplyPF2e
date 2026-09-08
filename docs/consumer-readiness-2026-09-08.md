# Consumer UI and generation readiness — 2026-09-08

## Scope and delivery

Implement the approved UI overhaul over public v0.3.5.64 (`89f9a35`) on `codex/consumer-ui-release`. Retain Monster, NPC, Encounter, Fighter/Rogue/Investigator, and the three existing Forge kinds. Actor **Generate & Create** remains the primary path; Preview Plan and random preview never create documents. Forge remains plan → review → Create Item.

The user requested delegation to smaller models, an Astra audit after each completed slice, and publication through a PR followed by a SimplyPF2e-only update in Foundry. Luna implemented the shared UI and auxiliary apps; Terra implemented Forge identity and generator/Forge orchestration; the parent integrated and verified the work. An explicitly selected `gpt-6-astra` reviewer independently audited core, application, and UI slices. All actionable findings were fixed and rechecked.

**Readiness position:** Published and installed .68 is an audited, released baseline for GM-reviewed use along the exercised paths. The native evidence is bounded and does not certify blanket complete one-click generation for every requested PC or supported mode.

## Completed slices

1. **Shared interface.** Opaque burgundy/brass light and dark surfaces; responsive controls follow the application container; shared provider header distinguishes configured from tested in this window. Preserve prompt drafts through provider tests and auxiliary settings saves. Accessible labels and persistent feedback cover Sources, Provider Setup, and Presets.
2. **Run lifecycle and loading.** One run identity, clock, cancellation signal, token report, and estimated progress through generation and native creation. Animated SVG rune, live stage description, elapsed time, expandable stage outcomes, and reduced motion. Closing hides the window while work continues. Success/warning reaches 100%; failed/cancelled runs retain their last percentage. Unneeded stages are skipped, tolerated failures are warnings, and stale callbacks cannot affect a new run.
3. **Creation and Forge integrity.** Reserve busy state before asynchronous readiness. Explicit Create cannot join a pending write; one-click continuation has an explicit internal run identity. Native writes lock cancellation after a final check. Persisted results remain available if sheet/macro presentation fails. Forge choices use opaque offered IDs and exact pack/document references. Final creation rechecks sources. A temporary native PF2e item prepares preview price/level/rarity while the cloned source remains unchanged.
4. **Acceptance and publication.** Local regressions and browser layout checks pass. PR #105 merged at `ee584e2`; PR checks (34231115320) and Auto Release (34231202994) succeeded, publishing v0.3.5.65 with `module.json` and `module.zip`. PR #106 then published .66, PR #107 (source `bfd698d4733ee45ff414049b0ee74acf58a2aef4`, merged as `16f9745282c44f306071e0b81e43ba05186830e9`) published **v0.3.5.67** after CI 34238059322 and Auto Release 34238176018 succeeded, and PR #108 (source `ee52c91471fe87fa3ca80e11246ec161b9d1649e`, merged as `425e9339faf0a6b52099fa63c42fb2600b9986ee`) published **v0.3.5.68** after CI 34241316182 and Auto Release 34241400856 succeeded. Setup installed exact .68 and the existing test world was rejoined as GM; installed checks are recorded separately below.

## Source and review evidence

Fetched PF2e master and installed-era 8.5.0 source for the native item boundary:

- `src/module/item/physical/document.ts`: level/rarity getters; construction performs preparation; lines 355–358 assign computed native level, rarity, and price.
- `src/module/item/physical/runes.ts:37–48`: native pruning preserves surviving rune-key order and removes superseded greater/major/true grades. Lesser and Moderate Dread are distinct keys.
- `src/module/item/base/document.ts`: native item proxy dispatch and in-memory `new CONFIG.Item.documentClass(source)` pattern.

Audit corrections include native rune valuation (custom pack prices do not override native RUNE_DATA), exact source admission rechecks, two duplicate-run/write races, readiness exception cleanup, post-commit warning outcomes, encounter member warning keys, reduced-motion selector specificity, boolean warning copy, asynchronous draft retention, and restored review/Forge/preset regression guards.

The existing spell-source readiness requirement is retained: noncasters can receive scroll loot. Bestiary sources still supply creature art/token scaffolding. No general rune prerequisite engine, new classes, hand-authored Rule Elements, saved-macro migration, or provider dependency was added.

## Verification

- Parent baseline: 82 regression files passed on Node 22.23.2.
- Final independent Astra gate: **85 regressions, 120 script syntax checks, module/localization JSON, and whitespace checks passed** on Node 22.23.2.
- Current follow-up parent gate: **86 regression files, 121 script syntax checks, JSON/duplicate-key and whitespace checks passed** on Node 22.23.2. Astra approved the final Generator failure-token accounting slice.
- Failed AI responses now retain their reported usage once under the active/originating stage label. The production PC lifecycle regression proves a five-token concept plus a rejected 17-token ABC request reports one 22-token run.
- New production-boundary regressions cover actual SpfApp/GeneratorApp lifecycle, exact Forge identities/native preview preparation, and asynchronous provider feedback/draft handling. Checked-in race cases include double Generate during deferred readiness, readiness rejection/retry, duplicate explicit Create during a pending native write, and grouped encounter warnings.
- Actual branch Handlebars templates were rendered with native Foundry, PF2e, and icon CSS in their normal cascade layers. Browser checks covered 360/480/720px application widths, both themes, short height, long provider/pack/preset names, and keyboard access to preview actions. No application horizontal overflow was observed; text inputs scroll internally and long preset names intentionally ellipsize.
- At 360px, keyboard navigation originally scrolled the clipped outer window by 198px. Positioning the inner scroll region fixed this: outer scrollTop 0 and scrollHeight/clientHeight 522; inner body scrolls normally. Progress cards now retain intrinsic height instead of flex-shrinking to 18px.
- The fixture forced the reduced-motion media block active to test the actual CSS cascade. All four decorative animations computed `none` and the bar transition computed `0s`; progress retained a 272px card at 480px. This tests the stylesheet branch, not an OS preference toggle.
- The temporary fixture and Handlebars dependency live under `/tmp/simplypf2e-ui-qa`; neither is a module dependency. No revised-module installation or provider spend occurred during local verification.

## Installed Foundry checklist

The module-only updates to **0.3.5.65**, **0.3.5.66**, **0.3.5.67**, and **0.3.5.68** are verified in Setup; **.68 is the latest installed baseline**. Setup installed the exact .68 release and the existing `test` world was rejoined as GM. Foundry remains **14.365**, PF2e remains **8.5.0**, and the existing world and provider settings are preserved. The .67 acceptance results and bounded .68 native results are recorded below; multi-member encounter, nested-kit, duplicate-copy, and full screen-reader checks remain open.

### Installed v0.3.5.65 results

- Generator/Forge entry points load the revised shell. Provider test completed using the existing `omniroute / auto/best-free` connection (705 tokens); text typed while the test was pending and input focus survived completion.
- Closing and reopening Generator during an NPC request retained its active run, elapsed time, and expanded stage details. Failure retained the prompt, restored controls, and stopped at 80% rather than claiming completion.
- NPC1 no-equipment/no-loot brief failed closed on unresolved Lantern, Oil Flask, Whistle, Manacles, and Rations (17,990 tokens). No actor was created. The original brief is forwarded to the equipment selector and explicit empty equipment is already supported; the raw selector reply was not captured, so its precise content is unknown. This does not pass no-gear/no-loot acceptance.
- Weapon4 Ghost Touch Longsword plan failed closed at 77% with an unoffered base candidate ID (17,837 tokens). No item was created. The current schema and exact-catalog check are correct. The follow-up uses short request-local B/P/S/R aliases, restores original source IDs locally, and rejects unknown/wrong-group aliases. Native preview parity is not established by the failed run.
- Follow-up copy and equipment-prompt slices passed Astra review. Forge alias mapping retains same-name source identities and secondary `none`; rejected responses retain their spent token usage. Production request/caller regressions cover these boundaries. Astra approved the final Forge slice; the parent full Node22 gate passed all 85 regressions, 120 syntax checks, JSON/duplicate keys and whitespace. This Forge follow-up shipped in .66 and is retained in .68; its version-specific native results follow.
- Total provider usage through these checks: **36,532 tokens**. Existing documents, macros, tokens, and chat were preserved.

### Installed v0.3.5.66 results

- PR #106 (`6abf2ac` source, `6f82c30` merge) passed CI 34233281229 and Auto Release 34233487888. Release v0.3.5.66 has both assets; Setup updated only SimplyPF2e from .65 to .66 and relaunched the existing test world.
- Short-alias weapon selection succeeded (4,410 tokens). Preview and native `Item.tFgwn9t2X9sJ5Uks` **+1 Ghost Touch Longsword** agree: level 4, common, 110 gp, +1/Ghost Touch and no Striking.
- Armor plan and native `Item.nHUw36mL1umsIl99` **+1 Slick Chain Shirt** agree: level 5, common, 205 gp, +1/Slick and no Resilient (2,056 tokens).
- NPC one-click creation completed (10,793 tokens, 37 seconds). `Actor.9pViFDJTsJUCmNIP` **Consumer Lantern Keeper** has 20/20 HP and a fist strike; it has no spellcasting. **No-gear/no-loot fidelity failed:** native inventory contains Padded Armor, Hooded Lantern, Simple Manacles, oil, and 14 gp. The provider also changed the requested name. Stronger prompt guidance is insufficient to enforce these text constraints.
- Follow-up scope: explicit **Include equipment / Include treasure** switches for Monster/NPC/Encounter, enforced by the module independently of AI output. Defaults preserve current generation; Character remains unchanged. No natural-language parser or name-based grounding fallback is introduced.
- Wondrous preview and creation succeeded (2,141 tokens): native `Item.VyS6JrJ2RMkPbd9G` Consumer Balm Charm, level 4, 75 gp, invested, two-action 2d6 healing 1/day, with an Activate macro link. Activation/rest/copy behavior remains unverified.

### Installed v0.3.5.67 results

- PR #107 source `bfd698d4733ee45ff414049b0ee74acf58a2aef4` merged as `16f9745282c44f306071e0b81e43ba05186830e9` after CI 34238059322 and Auto Release 34238176018 succeeded. Release **v0.3.5.67** has both assets; Setup installed the exact .67 release and the existing `test` world was rejoined as GM.
- Foundry remained **14.365** with PF2e **8.5.0**; provider settings and world data were preserved. This entry records the .67 publication and installation state; its later acceptance results are recorded below.

### Installed v0.3.5.68 status

- PR #108 source `ee52c91471fe87fa3ca80e11246ec161b9d1649e` merged as `425e9339faf0a6b52099fa63c42fb2600b9986ee` after CI 34241316182 and Auto Release 34241400856 succeeded. Release **v0.3.5.68** has both assets; Setup installed the exact .68 release and the existing `test` world was rejoined as GM.
- Foundry remains **14.365** with PF2e **8.5.0**; provider settings and world data are preserved. Native .68 QA records bounded Fighter and Investigator-path results plus a focused Rogue failure; multi-member encounter and broader supported-PC coverage remains open.

| Check | Required result |
| --- | --- |
| Generator and Forge entry points | One window per app; all supported modes/kinds, labels, narrow layout, theme, draft retention work. |
| Progress | One run through Generate & Create; monotonic estimate, elapsed time, skipped/warning outcomes; close/reopen retains run and result. |
| Cancel/retry | Cancellation affects only that app; no world writes from preview/random or cancelled generation; native writes cannot be cancelled midway. |
| Creature and encounter | One-click completion, no duplicate actors, required content grounded; no-gear/no-loot briefs respected. |
| Supported PCs | Fighter/Rogue/Investigator, native first-level/accelerated feats, grants, full HP and worn gear; report native unresolved choices. |
| Forge weapon and armor | Exact source plan rechecked; preview and prepared created item agree on price/level/rarity. |
| Wondrous and activation | Published passive source, companion creation, activation, rest, and multiple-copy charge behavior; preserve old companions. |

Native grant chains, derived actor statistics, full activation balance, cross-client charge atomicity, and full screen-reader behavior are not established by Node tests or static browser fixtures. Existing documented scope limits remain in README and CLAUDE.md.

### v0.3.5.67 generation-control follow-up

- The entries below describe the reviewed generation-control fixes published in PR #107 and installed as .67. The native kit and zero-budget currency fixes were published separately in PR #108 and installed as .68.
- Fighter .66 stopped at the ABC stage after a bounded retry; no PC was created. The last displayed 3,189 tokens cover the completed concept stage, not the failed ABC requests (their spend is unavailable in the UI). The prompt/decoder require ID fields but the validator required legacy names. The corrected validator and production ABC integration regression now agree on exact issued IDs, nullable heritage, and key-ability enums. A review of all other validated task contracts found no additional concrete drift.
- Generator error accounting now retains usage attached to failed AI responses in outer and tolerated catches under the active/originating stage label. The production lifecycle regression records the failed ABC request once and reports the combined 22-token run; Astra approved this final accounting slice.
- First-stage full rendering corrects the completed-NPC to PC run that reused the same progress-row count and left old controls/content visible. Subsequent progress updates stay incremental; close/hide invariants remain intact.
- Luna implemented the holdings UI and ABC validation; Terra implemented authoritative category enforcement, coherent rerolls and shared initial rendering. Explicit Astra reviewed each completed slice and approved the final fixes, including Generator failure-token accounting. Parent checks pass **86 regression files, 121 syntax checks**, both JSON files with duplicate-key detection, and whitespace on Node 22.23.2. PR #107 published these reviewed generation-control fixes as .67; PR #108 separately published the native kit and currency fixes as .68.

### Installed v0.3.5.67 acceptance

- Enforced creature categories passed. With spellcasting, equipment and treasure unchecked, `Actor.1ORKYsTmXtnO5zBW` **Lantern Keeper** was created in 39 seconds (10,446 tokens), has 20/20 HP, empty native inventory and 0 gp total wealth. Equipment/loot stages read Not needed. Exact narrative fidelity did not pass: the provider changed the name, supplied Lantern Bash/darkvision and a narrative Raise Alarm despite the mundane unarmed brief.
- Completed NPC→Fighter rendering passed: the prior completion panel cleared and all generation/provider controls disabled at the first stage. ABC exact-ID selection passed and a 15/15 compendium plan reached native creation. Creation failed with `expected documents missing (kit: Compendium.pf2e.equipment-srd.Item.2req0jGaxz8hScdB)` and rolled back; no Kaelen Voss remains in the Actors directory. PF2e consumes this Adventurer's Pack kit and expands its physical contents. The plan also showed four coin rows totaling 60 gp despite a 0 gp remaining budget. These are distinct follow-up bugs, not accepted PC completion. Total 60,739 tokens / 104 seconds.
- Forge cancellation passed at 17%, retaining its prompt and restoring controls while the independent Fighter run continued into creation. Two preceding preview-only runs completed before the cancel click (2,173 and 2,144 tokens); neither created a world item. The cancelled run reported 0 tokens; downstream provider billing after cancellation is not measurable here.
- Native charm activation/depletion/rest passed on new manually created blank PC `Actor.TsacxBU34OJIaSLa` **QA Consumer Activation**, using embedded `Item.2Y6igd9rh55M2X5y` from the existing Consumer Balm Charm. Worn/invested activation produced a 2d6 healing card (7); repeat use produced the depleted message; native Rest for the Night recharged it and a later activation produced 2d6 (4). No Apply Healing click was made. The prior blank GM character assignment was restored. Repeated native source-drop attempts did not create a second observed copy, so duplicate-copy acceptance remains incomplete; its cause was not diagnosed. Native world Duplicate also created `Item.E277US9VCMgYA3kV` **Consumer Balm Charm (Copy)**, preserved with the original world item/macro and all earlier QA data. It was not successfully embedded as a second copy; no duplicate activation claim is made.

### Native kit completion follow-up

Terra implemented transaction-local persisted expectations for native kits in both PC/NPC builders. Before any actor write, exact published physical leaf UUIDs replace the kit expectation; backpacks persist alongside contents and nested kits expand. Missing/nonphysical/cyclic content fails closed. The normal persisted-source verifier remains active. Astra independently approved the slice, including empty backpacks and duplicate leaves, after checking PF2e master and `pf2e-8.5.0/src/module/item/kit/document.ts`. The fix is published in .68. The installed .68 Fighter run below passed a flat kit’s physical-leaf expansion; nested backpack quantities and container links remain PF2e-owned behavior and unverified.

### Zero-budget currency follow-up

Luna traced the 60 gp preview to currency entering the loot-selector catalog, being appended to preserved draft coins, and escaping `applyTreasureBudget` when the remaining budget was zero. The fix excludes native `category: coin` and legacy `stackGroup: coins`, defensively removes selected currency during refinement, strips only fungible coins at zero/negative budget and prevents an extra purchase request at zero budget. Existing positive padding/trimming, PC named-item caps and equipment-alone overspend policy remain unchanged. Astra approved the stable slice with no blocking findings. Five regression deltas cover real-schema catalogs, all denominations, the 18.9 gp fixture, stale selected coins and the production PC call boundary. The fix is published in .68 and installed; the Fighter run below confirmed 0 gp native currency. Final parent gate: 86 regressions / 121 syntax checks, JSON/duplicate keys and whitespace on Node22; `.git/consumer-native-final-node22.log`.

### Installed .68 native acceptance (2026-09-09 KST)

- Fighter creation passed after completing PF2e’s Natural Ambition dialog with Reactive Shield. `Actor.tGJ7V0WmT4iNvMJn` **Bren Blackthorn** has native Human/Guard/Fighter, 21/21 HP, AC 17, Strength +4, three of three extra-trained skills, a longsword and steel shield held one-handed, and chain mail worn. Duration 129 seconds; 50,010 tokens.
- Native kit verification passed: the provider chose Cartographer’s Kit, and PF2e expanded it into Compass, Standard Astrolabe, Writing Set, Ruler, and Survey Map (one each). All exact-source expectations survived without rollback. This covers a flat kit; nested backpack links and quantities were not exercised live.
- Zero-budget currency passed: native inventory has 0 gp currency. Total gear wealth 60.55 gp remains under the existing policy retaining starting equipment even when over target. The provider substituted the kit and character name. Native heritage is empty; read-only tracing confirms the existing optional-heritage contract accepts null/unoffered heritage and omits it from the manifest. This is a prompt-fidelity/completeness limitation, not full character rules validation.
- A focused .68 request for Rogue/Thief with Dexterity focus and requested name **QA Consumer Rogue** created **Kaelen Voss**, `Actor.W3KnL25GUo74J80O` as native Human / Skilled Human (Stealth) / Guard / Investigator. The native Investigator path passed: Interrogation Methodology → No Cause for Alarm, On the Case, Devise a Stratagem, Strategic Strike, the Natural Ambition dialog → That’s Odd, Underworld Investigator, and Quick Coercion; 16/16 HP, AC 14, Int +4/Dex +0/Str +3, 8/8 additional trained skills, 1.5 gp currency, and 14.17 gp wealth. Explicit Rogue/class/name/key-ability fidelity failed, so this is Investigator grant-path evidence only; no full rules validation is claimed. Duration 264 seconds including native-choice wait; 61,845 tokens.
- Terra’s read-only trace found that the draft class may be replaced by the ABC choice among all three supported classes, while the preset supplies flavor guidance only. No raw ABC reply is available, so the drift cannot be attributed to a particular provider call; no deterministic schema bug is established.
- A second focused retry using an explicit Rogue/Thief/Dexterity brief, the Rogue preset, and a Common cap failed closed before actor creation at 83% after 59 seconds and 36,184 tokens: `Could not find class "Rogue" in compendium at resolvePCConcept:262`. The preliminary permissive resolver had found Rogue, but final exact-source validation failed. An unoffered ABC ID is consistent with the trace; the raw reply is unavailable. The deterministic issue is that required ABC membership was checked only after downstream requests. Rogue acceptance failed.
- A level-2 Rogue with the world’s existing Free Archetype variant was blocked before provider spend as intended. Variant settings were preserved; the supported-class results above remain bounded.
- The measured provider-spend lower bound is now **294,271 tokens**; the earlier .66 ABC spend remains unavailable. These results support audited, released GM-reviewed use along exercised paths, not blanket complete requested-PC acceptance. Multi-member encounter acceptance, nested backpack quantities/container links, duplicate-copy activation, and full screen-reader behavior remain open.

- Small encounter acceptance passed: party size 2, party level 1, Moderate threat created one native **Cellar Matriarch**, `Actor.pVOyzfvNBrxXrUsL`, in its named folder. Creature level 1, 20/20 HP, AC 15, animal, empty native inventory and 0 gp currency/wealth, no spellcasting entries, and one labeled custom Narrative: Swarmed ability. Duration 35 seconds; 11,609 tokens. No combat, token placements, or multi-member acceptance is inferred.

### Early ABC rejection follow-up

The required ancestry/background/class membership check now runs immediately after the ABC response maps to offered candidates. An unoffered required ID throws a localized, nonretryable AIRequestError carrying the completed request’s usage and stable field names, before feat/equipment/loot calls. Optional heritage and exact source mapping retain their existing contracts. Production selector cases cover each required field, valid display names accompanying wrong IDs, retained usage, optional heritage, and successful references. This reduces wasted requests and explains invalid selections; it does not enforce a typed class request when the provider chooses another offered class.

Astra approved this final slice with no blocking findings, independently running the selector and production Generator lifecycle checks. Parent Node22 gate passed all 86 regressions, 121 syntax checks, module/localization JSON with duplicate-key detection, and whitespace; log `.git/consumer-abc-final-node22.log`.
