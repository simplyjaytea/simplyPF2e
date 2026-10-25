# Level-shift UI entry point — 2026-10-25

## What was added

- `scripts/creature-tools.mjs`: `prepareCreatureLevelShift(actor, targetLevel)` and `createCreatureLevelShift(prepared)`, both asserting the experimental gate at entry and mapping `LevelShiftError` codes to localized messages. `prepareCreatureLevelShift` returns `{ prepared, preview }` where `preview` is `describeLevelShift(prepared.plan)` (source/target levels, resulting name, changed fields, and every problem when rejected). `createCreatureLevelShift` delegates to `level-shift.mjs` `createLevelShift` and returns its result.
- `scripts/creature-tools-app.mjs` + `templates/creature-tools.hbs`: third fieldset "Level shift (experimental)" with a world-NPC select, a target-level control offering only `sourceLevel + d` for `d` in `SUPPORTED_SHIFTS` within the policy range, Preview, Create (enabled only after a successful preview for the same source and target), and Discard. Re-checks the gate before preview and create via `#refusedNow()`. Changing the NPC or target level clears the reviewed preview. Create runs only when the form still matches the reviewed NPC UUID and target level, and any create error clears the preview (the GM must preview again). Errors show backend problems and the surviving-actor name when a rollback fails. Creation accepts only previews issued by `prepareCreatureLevelShift` in the session (`LEVEL_SHIFT_NOT_ISSUED` otherwise). On success shows the created name and opens the sheet.
- `scripts/simplypf2e.mjs`: `module.api.levelShift = { prepare, create }`, both refusing when the gate is closed.
- `lang/en.json`: new keys under `SIMPLYPF2E.CreatureTools.Shift.*` and `SIMPLYPF2E.CreatureTools.Errors.LevelShift*`.
- `README.md`: Status row and Roadmap bullet updated.

## Policy as confirmed (user-confirmed, not changed)

Supported deltas −2, −1, +1, +2 only (`SUPPORTED_SHIFTS`). Narrow caster rule. Abilities unchanged. Skills shifted. First-instance Strike damage shifted. Result named `<name> (Level T)`. `attributes.adjustment` is null on the shifted clone.

## Gate points

- `prepareCreatureLevelShift` and `createCreatureLevelShift` call `assertExperimentalToolAccess()` first.
- `createCreatureLevelShift` delegates to `level-shift.mjs`, which re-checks the gate immediately before `Actor.create` and before rollback delete.
- The app re-checks the gate in `#refusedNow()` before preview and create.
- With `experimentalTools` off the Creature Tools directory button is not rendered and `openCreatureTools()` returns null with a warning.

## Not verified

No Foundry run was performed. Native rendering, native create, and live stale-source detection are unverified. This feeds ledger row N08.

## Native row

N08 (multiclass and Free Archetype native prompts, including level-shift Strike damage and caster rules) remains OPEN.
