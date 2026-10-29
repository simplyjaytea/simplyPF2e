# Creature speeds and senses from published data: 2026-10-30

Owner: Code Monkey 3 (workstream W2, part 1). Branch `feat/speeds-default`, base `integrate/2026-10-30@baeb0a3`. Follows [audit-fixes part B4](audit-fixes-2026-10-30.md#b4-speeds-senses-strikes), which called these lists conventions. This record sources them.

## Source

- Data: `foundryvtt/pf2e` tag `pf2e-8.5.0` (commit `3601a90c`), `packs/pf2e/*bestiary*`: 60 directories, 2,350 JSON files, 1,362 NPCs, 0 parse errors. Hazards and `npc-gallery` are not in the scan. Read by a shallow sparse clone, scanned with a throwaway script (not committed).
- Fields: NPC `system.attributes.speed.value` (land) and `system.attributes.speed.otherSpeeds[].{type,value}`; `system.perception.senses[].{type,acuity,range}`; strike increments in `items[]` of type `melee`, `system.range.increment`.
- pf2e source for the fields:
  - `src/module/actor/npc/data.ts` 101–105 (8.5.0): `speed: { value: number; otherSpeeds: LabeledSpeed[]; details: string; }`.
  - `src/module/actor/creature/sense.ts` 30–36 (8.5.0): `range: new fields.NumberField({ required: true, nullable: true, integer: true, positive: true, initial: null })`. Any positive integer is valid to pf2e; the module's 5-foot steps are a module convention.
  - `src/module/item/melee/data.ts` 117–123 (8.5.0): `increment: new fields.NumberField({ required: true, integer: true, min: 5, step: 5, ...})`. Increments are multiples of 5 from 5.

## Scan results (maximum per type)

| Type | NPCs with the type | Published maximum | Where (file) | Count at maximum | Next value (count) |
|---|---|---|---|---|---|
| land | 1,360 | 120 ft | `pathfinder-bestiary-3/tolokand.json` | 1 | 100 (3) |
| fly | 373 | 240 ft | `howl-of-the-wild-bestiary/warden-of-peaks-and-skies.json` | 1 | 200 (17) |
| swim | 178 | 100 ft | `howl-of-the-wild-bestiary/warden-of-oceans-and-rivers.json`, `pathfinder-bestiary-2/shoal-linnorm.json`, `kingmaker-bestiary/elder-elemental-tsunami.json` | 3 | 80 (4) |
| climb | 163 | 60 ft | `rage-of-elements-bestiary/painted-stag.json`, `war-of-immortals-bestiary/weaver-of-webs.json` | 2 | 50 (5) |
| burrow | 87 | 60 ft | `howl-of-the-wild-bestiary/rumindrol.json` | 1 | 50 (1) |

Senses (`range`, all types):

| Sense | Published maximum | Where (file) | Count |
|---|---|---|---|
| lifesense | 1,000 ft | `night-of-the-gray-death-bestiary/gray-death.json` (`precise`) | 1 |
| tremorsense | 240 ft | `pathfinder-bestiary-3/sturzstromer.json` (`imprecise`) | 1 |
| scent | 200 ft | `book-of-the-dead-bestiary/queen-sluagh.json`, `howl-of-the-wild-bestiary/warden-of-oceans-and-rivers.json` | 2 |
| thoughtsense | 120 ft | published, 2 at 120 | 2 |

Excluded from the scan: one `otherSpeeds` entry with type `Freedom Of Movement` (25) in `the-slithering-bestiary/ahvothian.json`. It is not a movement type. Also 97 land speeds of 0: the module's nonsense rule drops them, as before.

## Lists now in code

`scripts/builder.mjs`, `stepsOf5(top)` gives 5, 10 … top.

| Type | List | Entries |
|---|---|---|
| land | 5–120 | 24 |
| fly | 5–240 | 48 |
| swim | 5–100 | 20 |
| climb | 5–60 | 12 |
| burrow | 5–60 | 12 |
| senses range (one list for all senses) | 5–1,000 | 200 |
| ranged strike increment | 10, 20, 30, 40, 60, 80, 100, 120, 150 | 9 (unchanged) |

## Rules

- Off-list value: snaps to the nearest listed value. Ties go to the lower value (`nearestListed`). A value over the top snaps to the top.
- Nonsense value: not a number (or a string that is not numeric), or 0 and below, is dropped. A speed is dropped and the land 25 ft default applies when nothing survives. A sense keeps its type and its range becomes null. A strike increment becomes null (the sheet's 30 ft default).
- An unknown movement type is dropped.
- The AI still picks from the list in the prompt (`scripts/ai.mjs` speeds and senses lines); the module snaps.

## Gaps and decisions for the Lead

- **Outlier maxima.** Each top is set by one creature (fly 240 by Warden of Peaks and Skies, land 120 by Tolokand, sense 1,000 by Gray Death). That gives long lists. If you want the tops at the round numbers the rest of the data uses, say which and I will trim.
- **Strike list not derived.** The published maximum increment is 200 ft (`pathfinder-bestiary-2/thunderbird.json`, Thunderbolt). The list stays 10–150 because the brief covers speeds and senses and the prompt line for strikes was out of scope. Off-list values now snap to 150. Decide whether to derive it in steps of 5 to 200.
- **Land 0.** 97 published land speeds are 0. A creature whose only entry is land 0 falls back to 25 ft, as before. This is unchanged and not covered by this record.
- **Not native-checked.** Foundry's sheet is not run here (N46–N47).
