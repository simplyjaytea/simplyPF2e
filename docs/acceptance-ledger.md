# Native acceptance ledger

This file is the live native-QA ledger. Rows are updated in place when native evidence lands; no row is PASS.
The origin records are the chunk files: [C01 §8](evidence/chunks-2026-10-17/c01.md) (rows R01–R25) and [C12 §5](evidence/chunks-2026-10-17/c12.md) (rows N01–N08 and the C12 status notes on R01–R25).

Installed version as currently recorded: last recorded installation is v0.3.5.72; v0.3.5.73 and v0.3.5.74 installations are unverified.

Status: **OPEN** means no acceptable evidence. **BLOCKED** means a prerequisite or verified feature path is missing. **PASS** requires versioned native evidence; none is recorded.

In each Row cell, the parenthetical gives new or reuse, then counted provider generations / proposed per-run reported-token ceiling. Neither is authorized.

## R rows (installed-target and PC/NPC/forge acceptance)

| ID | Row (short) | Status | Prerequisite / blocker | Source |
| --- | --- | --- | --- | --- |
| R01 | Installed version: SimplyPF2e 0.3.5.73 active on Foundry 14.365 / PF2e 8.5.0; world, provider settings and other packages unchanged (module-only update; 0 / —). Target is now v0.3.5.74 (latest release); c01 was written against .73. | OPEN | Install authorization; existing `test` world. Asset parity for v0.3.5.74 verified (63/63 entries; digests match) — see [release-parity-2026-10-25](evidence/release-parity-2026-10-25.md). | c01 §8; Runbook: [qa-batch-a-2026-10-25](plans/qa-batch-a-2026-10-25.md) |
| R02 | Batch A: Guard/Thief, level 1, Legal Lore; literal name, Rogue, Human, no heritage, Guard, Dexterity, Thief, spellcasting off, treasure Standard (new, required; 1 / 40,000) | OPEN | Batch A authorization; R01 | c01 §8; Runbook: [qa-batch-a-2026-10-25](plans/qa-batch-a-2026-10-25.md) |
| R03 | Batch B-1: Guard/Fighter, Warfare Lore; level chosen from `pc-tables.mjs` cadence and checked against the real Fighter class document (new; 1 / 65,000) | OPEN | Batch B authorization; R02 passed | c01 §8 |
| R04 | Batch B-2: higher-level Rogue with a racket at a source-verified boundary; Guard background keeps its Lore choice (new; 1 / 65,000) | OPEN | Batch B | c01 §8 |
| R05 | Batch B-3: Investigator boundary; methodology grant; restricted Skillful Lessons slots proven or excluded (new; 1 / 65,000) | OPEN | Batch B | c01 §8 |
| R06 | Zero-spend identity preflight: Guard without Lore, conflicting `Background` declarations, ambiguous class or heritage prose, path without explicit class each stop before any request (UI only; 0 / 0) | OPEN | UI access | c01 §8; Runbook: [qa-batch-a-2026-10-25](plans/qa-batch-a-2026-10-25.md) |
| R07 | Reuse-only PC checks on QA Native Thief, Bren Blackthorn and Kaelen Voss: sheet links, Lore visibility, inventory drag and sort (reuse; 0 / 0) | OPEN | GM access | c01 §8; Runbook: [qa-batch-a-2026-10-25](plans/qa-batch-a-2026-10-25.md) |
| R08 | Source switch (plan step 0): price, level, tier and usage follow the selected sources; toggles restored and verified (reuse baselines (c01 §6); 0–2 previews / 5,000) | OPEN | Settings writes, restored afterward | c01 §8 |
| R09 | Overlapping loads, UI-observable outcome: forge preview during a Generator catalog load resolves; cancelling leaves no item (UI; 0 within R08 ceiling) | OPEN | — | c01 §8 |
| R10 | NPC combat with Stunning Blows and Flurry against a designated existing target (reuse Veyra; 0 / 0) | OPEN | Scoped world-write authorization for target condition and chat; target named | c01 §8 |
| R11 | Multi-member encounter: at least two actual members; composition and XP match `encounter.mjs` budget math; loot and item links per member (new; 1 / 35,000) | OPEN | Batch C authorization | c01 §8 |
| R12 | Native partial-write rollback (encounter) on the R11 plan: harness cancels one item of member 2; no residue; retry creates once (same plan; 0 extra / 0) | OPEN | Self-check passes (c01 §9.4); GM console; approval for the temporary harness | c01 §8 |
| R13 | Survivor branch, optional: same fault plus a cancelled delete for the stranded actor; survivor reported, no duplicate on retry (new, plan discarded; 1 / 15,000) | OPEN | Decision to run; R12 self-check | c01 §8 |
| R14 | Nested kit: expands to every physical leaf once, with quantities and container links intact (new, possibly shared with R19; 1 / 35,000 shared, or contingent 25,000) | OPEN | A candidate kit with nested contents must be generated | c01 §8 |
| R15 | Forged copies: two copies with distinct IDs; activating one decrements only that copy's charge and uses that copy's macro (reuse Consumer Balm Charm and copy; 0 / 0) | OPEN | Documented method to embed a second copy | c01 §8 |
| R16 | Forge damage activation: target-based damage posts a native chat card with Apply; charge persists; companion macro in the "SimplyPF2e Item Forge" folder (new forge creation; 1 / 5,000) | OPEN | Forge creation step | c01 §8 |
| R17 | Forge self-buff activation: self-buff applied as the item defines; chat output; charge decrements (new forge creation; 1 / 5,000) | OPEN | — | c01 §8 |
| R18 | Depletion, rest and missing context: depleted state shown; rest restores; missing target gives a descriptive chat message (reuse R16/R17 items and QA Consumer Activation; 0 / 0) | OPEN | — | c01 §8 |
| R19 | NPC focus and casting: pool size equals the module default (spell count, capped at 3); focus DC matches the native entry; Refocus; slot spells unaffected (new; 1 / 35,000) | OPEN | Batch C | c01 §8 |
| R20 | PC focus through a supported granted path (—; 0 / 0) | BLOCKED | A verified class or grant path first | c01 §8; c12 §5.1 note: PC focus path still unverified |
| R21 | Keyboard and states (non-assistive-technology parts): keyboard reach, focus return, labelled errors and progress, reduced motion; run within the R02–R06 windows (UI; 0 / 0) | OPEN | — | c01 §8; c12 §5.1 note: unchanged; Runbook: [qa-batch-a-2026-10-25](plans/qa-batch-a-2026-10-25.md) |
| R22 | Real screen-reader session with an operator; product, version, browser and OS recorded; announcements recorded (operator; 0 / 0) | BLOCKED | Operator not yet established | c01 §8; c12 §5.1 note: real screen-reader session required; not performed |
| R23 | Installed-target matrix (Foundry 14.365 / PF2e 8.5.0): covered by R01 and rows R02–R21 run on the installed pair (—) | OPEN | R01 | c01 §8; c12 §5.1 note: unchanged |
| R24 | Declared minimum smoke (PF2e 8.4.1): separate Foundry data directory with PF2e 8.4.1 and SimplyPF2e .73; module loads; gate; generator opens; zero-spend preflight subset; optional single NPC (separate instance; 0, +1 optional / 15,000). Target is now v0.3.5.74 (latest release); c01 was written against .73. | BLOCKED | Operator-provisioned instance | c01 §8; c12 §5.1 note: isolated PF2e 8.4.1 instance required; not performed |
| R25 | Cache acceptance split: native evidence limited to the observable switching in R08 and R09; native coalescing is not claimed (—) | OPEN | — | c01 §8; c12 §5.1 note: unchanged |

## N rows (feature-slice live checks, C02–C11)

| ID | Row (short) | Status | Prerequisite / blocker | Source |
| --- | --- | --- | --- | --- |
| N01 | Experimental gate, live: setting off refuses `/forge` and the Creature Tools button and `api.openCreatureTools()`; setting on opens them for the GM; non-GM and wrong system refused | OPEN | Live world, GM and player accounts | c12 §5.2 (chunks C02, C04); Runbook: [qa-batch-a-2026-10-25](plans/qa-batch-a-2026-10-25.md) |
| N02 | Forge preview and create: `/forge --preview` gives a preview with no actor; Create works with the gate on; disabling the gate while a preview awaits Create blocks Create | OPEN | Provider configured; zero-spend preflight first | c12 §5.2 (chunk C02) |
| N03 | Mid-run gate disable: native write blocked with a visible error and draft kept; reroll with the gate off refused | OPEN | Provider spend in progress | c12 §5.2 (chunk C02) |
| N04 | Reskin end to end: source list shows enabled bestiary NPCs only; preview has no writes; create leaves the source unchanged; cancel mid-request writes nothing | OPEN | Provider configured | c12 §5.2 (chunks C03, C04) |
| N05 | Reskin fidelity: embedded item IDs preserved; HTML sanitized; Foundry enricher syntax correct in rendered descriptions | OPEN | Native inspection of created actor | c12 §5.2 (chunk C03) |
| N06 | Creature elite/weak: preview names current and target state; apply changes HP and stats via native `applyAdjustment`; non-persisting target rolls back; compendium and token copies refused; troop segments unchanged | OPEN | Existing world NPC | c12 §5.2 (chunk C04) |
| N07 | PC editor live: each editable control applies through the C05 contract; pending choice blocks commit; equipment cap of 120 enforced; create refused while blockers remain | OPEN | Existing PC draft | c12 §5.2 (chunks C05, C06) |
| N08 | Multiclass and Free Archetype native prompts: multiclass ChoiceSets resolve natively; archetype-slot prompts render and resolve; level-shift Strike damage and caster rules verified against native results; approval assumptions confirmed | OPEN | Native world; level-shift entry point decision (c12 §3.4) | c12 §5.2 (chunks C08, C09, C11) |
| N09 | Wizard one-click build on pf2e 8.5.0: both bridges (Arcane School, Arcane Thesis) staged with no native dialog; required School/Thesis declarations honored; `Compendium.pf2e.feats-srd.Item.Familiar` name-form uuid resolves (Improved Familiar Attunement offered); prepared arcane entry with 5 cantrips and 2 first-rank slots at level 1 | OPEN | Native world, provider spend | [wizard-research-2026-10-26](plans/wizard-research-2026-10-26.md); sprint plan WP4 |
| N10 | Hazard generator (gate on): `Actor.create` accepts the built `hazard` source; sheet shows Stealth DC, disable `@Check` enrichers, AC/saves/HP/hardness; reaction and Strike items render; gate off hides the mode and refuses create | OPEN | Native world, provider spend, `experimentalTools` on for the session only | [hazard-generator-2026-10-26](evidence/hazard-generator-2026-10-26.md); sprint plan WP5 |
| N11 | Scrolls and wands: Forge scroll/wand kinds create consumables whose price and level match the pf2e templates after prep; embedded spell casts from the item; NPC loot scrolls still create with the migrated builder | OPEN | Native world, provider spend | [consumables-research-2026-10-26](plans/consumables-research-2026-10-26.md); sprint plan WP6 |
| N12 | Loot actor and treasure parcel (gate on): `Actor.create` accepts the `loot` source; sheet opens in Loot mode with the module description; scrolls cast from the actor after players move them; Gold Pieces land in Currency; token is linked and players with LIMITED can loot; gate off hides the tile and the Create-as control and refuses Create | OPEN | Native world, provider spend, `experimentalTools` on for the session only | [sprint-2026-10-27](plans/sprint-2026-10-27.md); [review](reviews/sprint-review-2026-10-27.md) |
| N13 | Wizard school spell and focus pool: a level-1 Wizard (School of Battle Magic) shows Force Bolt in a Focus entry with pool max 1; a Wizard with the school spell plus one AI focus pick shows max 1 (the AI pick is dropped); spellcasting off gives no focus entry; the installed school description's id-form `@UUID` link resolves | OPEN | Native world, provider spend | [sprint-2026-10-28-wave2](plans/sprint-2026-10-28-wave2.md) |
| N14 | Cantrip deck: the Forge creates "Cantrip Deck of Light (5-pack)" at level 1, 5 gp, uses 5/5, with no embedded spell; the description link opens Light; with the gate on the loot destination works for decks | OPEN | Native world, provider spend | [sprint-2026-10-28-wave2](plans/sprint-2026-10-28-wave2.md) |
| N15 | Encounter with a hazard member (gate on): the encounter creates with one `hazard` member built inside the XP budget left after the boss, and the minions take the rest; the hazard sheet shows the native stats; a hazard that fits no level is dropped with a warning and the boss is not stepped down; gate off refuses Create | OPEN | Native world, provider spend, `experimentalTools` on for the session only | [encounter-hazard-integration-2026-10-27](plans/encounter-hazard-integration-2026-10-27.md); PLAYBOOK §10 |
| N16 | Advanced school spell: a level-8 Wizard with the Advanced School Spell feat and spellcasting on has one focus entry holding the initial school spell and the advanced one (for School of Battle Magic, Energy Absorption); the sheet's focus pool starts at 2; without the feat only the initial spell is embedded | OPEN | Native world, provider spend for a level-8 Wizard build | [wizard-v2-2026-10-29](plans/wizard-v2-2026-10-29.md) |
| N17 | School spell in the PC preview: with the school named in the concept, the preview shows the initial school spell and, when the feat is picked, the advanced one; with the school left to Create, it shows "School spell: chosen with the school at Create"; no line without spellcasting | OPEN | Native world, provider spend for a Wizard preview | [wizard-v2-2026-10-29](plans/wizard-v2-2026-10-29.md) |
| N18 | Uncommon cantrip deck: a Forge at uncommon offers uncommon cantrips; the created deck carries the cantrip's rarity, with the same template price and level as a common deck; a rare cantrip is never offered | OPEN | Native world, provider spend | [wizard-v2-2026-10-29](plans/wizard-v2-2026-10-29.md); [consumables-research-2026-10-26](plans/consumables-research-2026-10-26.md) |

Accessibility of new UI (keyboard, focus return, screen reader) is covered by R21 and R22 and is not repeated in the N rows. R22 remains BLOCKED.

## Batch mapping

Batch mapping: Batch A is R02. Batch B (R03, R04, R05) starts only after A passes. Batch C covers R11 (with R12 on the same plan), R19 (with R14 if a nested kit appears), and a contingent R14 run. Batch D covers R16, R17 and the R08 previews. Zero-spend windows: R01, R06, R07, R09, R10, R15, R18, R21, R23.

Spending ceilings and expected ranges for each batch are in [c01 §11](evidence/chunks-2026-10-17/c01.md). None is authorized.
