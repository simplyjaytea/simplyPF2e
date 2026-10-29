# Small gaps: requestJSON progress and rarity-cap paths (2026-10-30)

Branch `fix/small-gaps-bugs`, base `main@1c7f0cc` (v0.3.5.82).

## 1. `requestJSON` retry progress

Already handled on main; no code change. `scripts/ai.mjs` `requestJSON` (lines 229–233) replaces the caller's `onProgress` with a wrapper that calls the observer with optional chaining inside a `try`, logging `progress display failed` on a throw. Every progress call in `requestJSON` (`retrying` at 247, `validating` at 256) and, through the spread `args`, every call inside `requestCompletion` goes through that wrapper, so an absent or throwing observer cannot fail a retry. The earlier note "requestJSON calls `args.onProgress` with no guard" described the pre-wrapper code (commit `23bb97a`).

- `retrying` fires once, at attempt 1, after `throwIfGenerationCancelled` (line 246), so it is never emitted after a cancel.
- `validating` fires only for an attempt that returned content; a truncated or empty first attempt throws inside `requestCompletion` first, so it fires once on the normal retry path (existing assertion, `tests/ai.usage.test.mjs:80`). A cancel between a returned response and `validating` could emit one `validating` event, and the app drops it: `_onAIProgress` returns when `_generationAbort.signal.aborted` (`app-base.mjs:376`).

Added `tests/ai.requestJSON.progress.test.mjs` (no change to the code): a retry with no observer, a retry with an observer that throws on `retrying` and `validating`, and a cancel mid-request that is not retried and reports nothing afterward. Revert check: replacing the wrapper with the raw observer fails the test (`TypeError: args.onProgress is not a function`).

## 2. Rarity cap gaps

- **Character editor exact-content path.** `pc-edit.mjs` `DEFAULT_SERVICES.recompute` called `resolvePCConcept(concept, { exactContent: true })` with no `maxRarity`, so after an ancestry, background, class or class-path edit the regenerated feat-slot candidates were uncapped. `applyPCEdit(plan, edit, { maxRarity })` now passes the cap to `refresh` and `recompute(concept, { maxRarity })`; `generator-app.mjs` passes `this.#input.rarityCap`. Tests: `tests/pc-edit.rarityCap.test.mjs` (production `resolvePCConcept`, common/uncommon/no cap, and an injected recompute receives the cap), and `tests/generator-app.schoolSpellPreview.test.mjs` (f) (the editor action passes the form's cap).
- **Item Forge runed-item pools.** The Forge's other pools already used its rarity input (effect catalog `getForgeEffectCatalog`, scrolls, wands, cantrip decks, parcel permanent, wand, runed and valuable pools). `getBaseItemCandidates`, `getPropertyRuneCandidates` and `getFundamentalRuneTiers` (`runes.mjs`) took no cap, so a runed item at rarity common could be built on a rare base or rune. They now take `{ maxRarity }` (null filters nothing; a set cap drops an unknown rarity) and `#generateRuned` passes the Forge rarity. Tests: `tests/runes.rarityCap.test.mjs` and the pool-options assertion in `tests/itemforge-app.runedDrops.test.mjs`.

Behavior change: a runed Forge item at rarity common no longer offers uncommon or rare bases or runes. A GM who wants one picks a higher Forge rarity.

Revert checks (each killed): editor recompute ignores the cap, refresh drops it, generator drops it from `applyPCEdit`, base items, property runes and rune tiers uncapped, the Forge app passes no cap.

Not covered: the Forge's own "level" and "rarity" semantics are unchanged; no native test (a native row is not added).
