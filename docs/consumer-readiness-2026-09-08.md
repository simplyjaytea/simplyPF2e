# Consumer UI and generation readiness — 2026-09-08

## Scope and delivery

Implement the approved UI overhaul over public v0.3.5.64 (`89f9a35`) on `codex/consumer-ui-release`. Retain Monster, NPC, Encounter, Fighter/Rogue/Investigator, and the three existing Forge kinds. Actor **Generate & Create** remains the primary path; Preview Plan and random preview never create documents. Forge remains plan → review → Create Item.

The user requested delegation to smaller models, an Astra audit after each completed slice, and publication through a PR followed by a SimplyPF2e-only update in Foundry. Luna implemented the shared UI and auxiliary apps; Terra implemented Forge identity and generator/Forge orchestration; the parent integrated and verified the work. An explicitly selected `gpt-6-astra` reviewer independently audited core, application, and UI slices. All actionable findings were fixed and rechecked.

## Completed slices

1. **Shared interface.** Opaque burgundy/brass light and dark surfaces; responsive controls follow the application container; shared provider header distinguishes configured from tested in this window. Preserve prompt drafts through provider tests and auxiliary settings saves. Accessible labels and persistent feedback cover Sources, Provider Setup, and Presets.
2. **Run lifecycle and loading.** One run identity, clock, cancellation signal, token report, and estimated progress through generation and native creation. Animated SVG rune, live stage description, elapsed time, expandable stage outcomes, and reduced motion. Closing hides the window while work continues. Success/warning reaches 100%; failed/cancelled runs retain their last percentage. Unneeded stages are skipped, tolerated failures are warnings, and stale callbacks cannot affect a new run.
3. **Creation and Forge integrity.** Reserve busy state before asynchronous readiness. Explicit Create cannot join a pending write; one-click continuation has an explicit internal run identity. Native writes lock cancellation after a final check. Persisted results remain available if sheet/macro presentation fails. Forge choices use opaque offered IDs and exact pack/document references. Final creation rechecks sources. A temporary native PF2e item prepares preview price/level/rarity while the cloned source remains unchanged.
4. **Acceptance and publication.** Local regressions and browser layout checks pass. PR #105 merged at `ee584e2`; PR checks (34231115320) and Auto Release (34231202994) succeeded, publishing v0.3.5.65 with `module.json` and `module.zip`. Foundry Setup updated only SimplyPF2e from .64 to .65, then relaunched the existing test world. Installed checks are recorded separately below.

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
- New production-boundary regressions cover actual SpfApp/GeneratorApp lifecycle, exact Forge identities/native preview preparation, and asynchronous provider feedback/draft handling. Checked-in race cases include double Generate during deferred readiness, readiness rejection/retry, duplicate explicit Create during a pending native write, and grouped encounter warnings.
- Actual branch Handlebars templates were rendered with native Foundry, PF2e, and icon CSS in their normal cascade layers. Browser checks covered 360/480/720px application widths, both themes, short height, long provider/pack/preset names, and keyboard access to preview actions. No application horizontal overflow was observed; text inputs scroll internally and long preset names intentionally ellipsize.
- At 360px, keyboard navigation originally scrolled the clipped outer window by 198px. Positioning the inner scroll region fixed this: outer scrollTop 0 and scrollHeight/clientHeight 522; inner body scrolls normally. Progress cards now retain intrinsic height instead of flex-shrinking to 18px.
- The fixture forced the reduced-motion media block active to test the actual CSS cascade. All four decorative animations computed `none` and the bar transition computed `0s`; progress retained a 272px card at 480px. This tests the stylesheet branch, not an OS preference toggle.
- The temporary fixture and Handlebars dependency live under `/tmp/simplypf2e-ui-qa`; neither is a module dependency. No revised-module installation or provider spend occurred during local verification.

## Installed Foundry checklist

The module-only update to **0.3.5.65** is verified in Setup. Foundry remains **14.365**, PF2e remains **8.5.0**, and the existing `test` world and provider settings are preserved. Continue to update SimplyPF2e through Setup after each authorized follow-up PR/release.

### Installed v0.3.5.65 results

- Generator/Forge entry points load the revised shell. Provider test completed using the existing `omniroute / auto/best-free` connection (705 tokens); text typed while the test was pending and input focus survived completion.
- Closing and reopening Generator during an NPC request retained its active run, elapsed time, and expanded stage details. Failure retained the prompt, restored controls, and stopped at 80% rather than claiming completion.
- NPC1 no-equipment/no-loot brief failed closed on unresolved Lantern, Oil Flask, Whistle, Manacles, and Rations (17,990 tokens). No actor was created. The original brief is forwarded to the equipment selector and explicit empty equipment is already supported; the raw selector reply was not captured, so its precise content is unknown. This does not pass no-gear/no-loot acceptance.
- Weapon4 Ghost Touch Longsword plan failed closed at 77% with an unoffered base candidate ID (17,837 tokens). No item was created. The current schema and exact-catalog check are correct. The follow-up uses short request-local B/P/S/R aliases, restores original source IDs locally, and rejects unknown/wrong-group aliases. Native preview parity is not established by the failed run.
- Follow-up copy and equipment-prompt slices passed Astra review. Forge alias mapping retains same-name source identities and secondary `none`; rejected responses retain their spent token usage. Production request/caller regressions cover these boundaries. Astra approved the final Forge slice; the parent full Node22 gate passed all 85 regressions, 120 syntax checks, JSON/duplicate keys and whitespace. Follow-up installed acceptance awaits publication/update.
- Total provider usage through these checks: **36,532 tokens**. Existing documents, macros, tokens, and chat were preserved.

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
