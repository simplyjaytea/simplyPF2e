# Hazard generator: AI concept contract (WP5 H3a) - 2026-10-26

Scope: the in-module AI returns a hazard concept made of words and scale words only. The module fills every number from the GM Core Building Hazards tables (H1) and assembles the actor (H2, hazard-builder.mjs). The whole path is gated behind the experimentalTools setting. No Generator mode ships in this package.

## What was added

- scripts/ai-task-profiles.mjs: AI_TASK.HAZARD_CONCEPT, 2000 max tokens, creative sampling, reasoning disabled, following the magic-item entry.
- scripts/ai.mjs: generateHazardConcept(brief, options) returns { concept, usage }. It calls assertExperimentalToolAccess() before any provider request, then uses the same requestJSON retry as generateConcept. requestJSON gained one optional validate hook. Other tasks still use taskResponseProblem, unchanged. The hook is needed because RULES in ai-response-validation.mjs has no hazard entry, and that file is outside this package.
- scripts/hazard-labels.mjs: HAZARD_LABEL_KEYS, field name to localization key.
- lang/en.json: SIMPLYPF2E.Hazard.* (mode, level, complexity, preview labels, gate notice, three error messages).
- README.md: Hazard row in the Status table and a Roadmap bullet, both marked in development behind experimental tools.

## What the AI returns

One JSON object with these keys: name, description, traits, rarity, complex, stealth, disable (skill and scale pairs), dispel (rank or null), ac, saves (fortitude, reflex, will), hasHP, reaction (name, trigger, effect, strike, save), routine (actions, text, strike, or null), reset.

Scale words are extreme, high and low; a reaction save uses extreme or high only. Traits, damage types and disable skills come from the caller's lists. The only integers the AI may write are routine actions (1 to 3) and dispel rank (1 to 10). Those are closed choices, not statistics.

## What the module fills (not in this package)

- Stealth DC and disable DCs: Table 2-13 by scale. Stealth stores DC minus 10. Stealth proficiency: Table 2-14, high tier.
- AC, saves, HP and hardness: Table 2-15 by scale (saves use the E, H and L columns, one per scale word). HP and hardness are ranges that resolve to the floor of the midpoint (decision 2 of the sprint plan).
- Reaction save DC: Table 2-16 EDC or HDC.
- Strike bonus: Table 2-16 S. Atk for simple hazards, C. Atk for complex. Damage: Table 2-16 dice.
- XP: the simple hazard map for simple hazards, creatureXP for complex ones (H1 and encounter.mjs).

## Validation policy (fail closed)

- Missing keys, wrong types, an invalid rarity, a missing reaction, or a complex hazard without a routine or with a routine whose actions are not 1 to 3: the existing single retry runs, then the call throws AIRequestError with the hazard detail.
- Prose (name, description, reset, reaction and routine text, nested strike and save text): any digit, square or curly bracket, @ command or control character is rejected through the same retry. Numbers belong in the tables, not in prose.
- Optional values: unoffered traits, skills, damage types or scale words, a dispel rank outside 1 to 10, a malformed strike or save, unknown keys, and a routine on a simple hazard are dropped with console.warn. A number in a scale slot is an unoffered value and is dropped. No value is guessed.
- Caller lists must be non-empty, and level must be an integer from -1 to 24; otherwise a TypeError is thrown before any request.
- Gate closed: no provider request is made.

Consequence for H2: a dropped ac leaves AC null. hazard-builder must refuse such a concept rather than default it.

## Unverified

- No live Foundry run. Native rendering, Actor.create acceptance and PF2e acceptance of the hazard source are unverified (PLAYBOOK invariant 7).
- Provider behavior: the tests use a stub provider. Whether a real model keeps prose free of digits, and how often the single retry is needed, is not measured.
- Table transcription (H1), hazard-builder (H2) and the Dispel counteract DC (not generated here) are other packages.

## Ledger row to add later

When H3b wires the mode, add an experimental hazard row to the acceptance ledger: AI concept, builder and actor create on Foundry 14 with PF2e 8.5. Status: OPEN, no native evidence. This package does not add that row.

Test: tests/ai.hazardConcept.test.mjs.
