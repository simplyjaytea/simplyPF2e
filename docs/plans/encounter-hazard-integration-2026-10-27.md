# Encounter hazard integration — 2026-10-27

**Status:** accepted design (user-approved 2026-10-27), implemented locally and integrated on `claude/omh-encounter-wizard-2026-10-27` (candidate `bab2666`); not pushed. The initial read-only verify pass, on `8e03283`, found no unmet criterion and raised a P2 about the hazard-kind prompt and P3 notes. Repair `11857b3` now names the requested kind in the brief and tags hazard rows correctly. On `bab2666`, `node tools/check.mjs` and `git diff --check` passed, and a fresh review returned SHIP with high confidence. The reviewer reports model `claude-opus-5-5`; the architect route and high effort were not observed. No native Foundry evidence; no ledger row covers a hazard member inside an encounter.

**Why.** At the time of the 2026-10-26 backlog, Encounter mode composed a boss and minions to an XP budget (`composeEncounter` in `scripts/encounter.mjs`) but admitted no hazard. The [sprint plan](sprint-2026-10-26.md) deferred encounter membership to a later package (WP5 decision 5). This note recorded the design for that work. PLAYBOOK §9 required the design note before implementation; it now lists the feature under Done locally and links here.

## Accepted design

1. The AI requests `none`, `simple` or `complex`. Any other value is dropped with `console.warn` and treated as `none`.
2. The AI writes no hazard level and no XP. The module chooses a feasible level and computes the XP.
3. Hazard XP shares the encounter budget with the boss and minions. The budget is unchanged: `encounterBudget(threat, partySize)`.
4. At most one hazard per encounter.
5. Budget left after the hazard can go to minions, as it does today.
6. `none` leaves the encounter output exactly as it is now.
7. Include hazard generation and writes only when the existing `experimentalTools` setting is enabled.

## Mechanics that follow from the design

The implementation brief confirms these. The independent reviewer checks them.

- **XP.** `hazardXP(level, partyLevel, isComplex)` already exists. Simple hazards use the GM Core simple column; complex hazards use the creature column. Source: [hazard research §4](hazard-research-2026-10-26.md).
- **Order.** Boss first (the existing rule), then the hazard, then minions from the remainder. The minion loop stays as it is, except that it starts from `spent` = boss XP + hazard XP.
- **Feasible level.** A level is feasible when it lies in `HAZARD_MIN_LEVEL`..`HAZARD_MAX_LEVEL` (−1..24, `scripts/hazard-tables.mjs`) and its XP fits the budget left after the boss.
- **Selection rule (user-approved 2026-10-27).** Among feasible levels within party level ±4 (the range the XP maps cover), take the one nearest party level. On a tie, take the higher level.
- **No feasible level (user-approved 2026-10-27).** Drop the hazard with `console.warn` and preserve the no-hazard output. Do not step the boss down to make room: that changes the boss rule, which is a balance change and needs review.
- **Kind.** The complex flag comes from the request. The hazard concept's own `complex` value must match it, or the hazard is dropped with a warning.
- **Member shape.** `{ role: "hazard", level, count: 1, xpEach, complex }`. Minions keep `role: "minion"`.
- **Where the request lives.** One field in the `designEncounter()` output (`scripts/ai.mjs`). The AI themes the roster there today.
- **Pipeline.** The hazard member runs the hazard path (`generateHazardConcept` → `normalizeHazardConcept` → `buildHazardSource`). Boss and minions run the NPC path. Standalone hazard creation is not yet native-accepted (ledger row N10).
- **Gate (user-approved 2026-10-27).** Behind `experimentalTools`, as the Hazard generator mode is (WP5 decision 1).

## Tests the implementation must add

- `none`: the existing `tests/encounter.test.mjs` passes without edits, including the exact `members` assertion.
- A hazard that fits: exactly one `hazard` member; `spent` ≤ budget; minion XP ≤ the budget left after the hazard.
- A hazard that does not fit: dropped with a warning; output equals the `none` output.
- An invalid request value: dropped; output equals the `none` output.
- The normalized hazard concept carries no level or XP value from the AI.

## Review

Budget math, XP, the boss rule and the hazard source are schema- and balance-sensitive. The implementation needs an independent reviewer with fresh context who did not build it, per [PLAYBOOK §6](../../PLAYBOOK.md).

## Open

1. Native acceptance: ledger row N10 covers a standalone hazard. No native row covers a hazard member inside an encounter, and multi-member encounter checks are open (PLAYBOOK §10).
