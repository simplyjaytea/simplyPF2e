# Independent review — sprint 2026-10-26 (`claude/sprint-2026-10-26`, `main..HEAD` at `1f10f9f`)

Reviewer: Claude Opus 5.5 (high), fresh context, read-only, with two read-only forks for WP4 and WP6. Gate on HEAD: `Regressions passed: 123 files`, `git diff --check` clean. Verdict: **APPROVE WITH FIXES** (P1-1 before merge; P2-1 to P2-5 before release). Fix ladder results are recorded in the "Resolution" column (filled by the orchestrator after the fix pass).

| Id | Sev | Where | Defect | Resolution |
| --- | --- | --- | --- | --- |
| P1-1 | P1 | `itemforge-app.mjs:492` | Template cloned with `toObject()` has no `_stats.compendiumSource`; `buildSpellConsumable` refuses it, so every Forge scroll/wand pick throws and the run aborts. Tests stubbed the builder. | F1 (Haiku xhigh): `toItemData`, per-pick try/catch → DroppedPick, real-module test |
| P2-1 | P2 | `itemforge-app.mjs:480` | Spell cloned without `_stats.compendiumSource`, so the description falls back to escaped spell HTML instead of the `@UUID` link. | F1 |
| P2-2 | P2 | `compendium.mjs:574` | `getScrollSpellCandidates` still offers focus spells while `resolveLoot` now rejects them; an NPC naming a focus-spell scroll fails "Generation is incomplete" (regression vs main). | F1 |
| P2-3 | P2 | `ai.mjs:446`, `generator-app.mjs:1726`, `pc-builder.mjs:1063` | README says Wizard school focus spells are not granted, but the build embeds any focus spell the AI picks plus a pool. | F2 (Sonnet xhigh) |
| P2-4 | P2 | `class-paths.mjs:236`, `pc-builder.mjs:926` | Bridge-shape guard fires only at Create, after all provider spend; on master-shaped data every Wizard run burns tokens then throws. | F2: chooser-free preflight filters offered classes and runs in identity validation |
| P2-5 | P2 | `hazard-builder.mjs:337` | Dispel Magic link uses a name-form uuid; built packs use ids; name resolution unverified live. | F3 (Haiku xhigh): id-form uuid quoted from 8.5.0 source |
| P3-1 | P3 | `generator-app.mjs` `hazardErrorText` | `{reason}` placeholder never filled; test locks the bug in. | F3 |
| P3-2 | P3 | `ai.mjs:1387` vs `hazard-builder.mjs:143` | Name checks differ (`|`); a `|` name passes the paid gate then throws. | F3: one shared name check |
| P3-3 | P3 | `lang` `Hazard.Gated`, `encounter.mjs` `hazardXP` | New dead surface right after WP1. | F3 |
| P3-4 | P3 | `ai-response-validation.mjs` | No `RULES` entry for `HAZARD_CONCEPT`; works only via the `validate` hook. | F3 |
| P3-5 | P3 | `itemforge-app.mjs:448` | Candidate filtering after the 96-candidate cap. | F1 |
| P3-6 | P3 | Forge level | Level ignored for scrolls/wands ("Scroll of Wish" at level 1). | F1: rank capped by template level |
| P3-7 | P3 | `spell-consumables.mjs:159` | Spell name unescaped in the link label. | F1 |
| P3-8 | P3 | `builder.mjs:723` | Loot scroll template requires `pf2e.equipment-srd` configured; preview shows a scroll, Create throws. | F1: unresolved entry, preview fails closed |
| P3-9 | P3 | `pc-edit.mjs:326` | Class edit into Wizard yields a spell-less Wizard marked complete. | F2: refused until spell editing exists |
| P3-10 | P3 | `pc-editor.mjs:87`, `pc-edit.mjs:159` | Alias/map seams: bridge-labelled alias not shown selected; bridge-less clear leaves concept school/thesis. | F2 |
| P3-11 | P3 | tests | Weak assertions (rarity, TemplateMissing label); Runelord exclusion untested. | F1 + F2 |
| P3-12 | P3 | docs/CSS | Stale evidence-note sentence; no `.spf-consumables` CSS; Forge picks not de-duplicated. | F1 + F3 |

## Verified correct by the reviewer

- Hazard tables: every row of Tables 2-13, 2-15, 2-16 for levels −1..24 matches the research record (0 mismatches); Low-DC upper bound and midpoint floors; Table 2-14 band edges; clamping and throws; XP maps match GM Core pg. 56.
- Hazard actor/items: every written field matches the field map and the Spear Launcher / Spinning Blade Pillar samples; no derived keys; no Rule Elements; all AI prose escaped; every number table-derived or the bounded `routine.actions`.
- Hazard gate: re-checked at generate entry, after the AI call, at create entry and before `Actor.create`; gate off leaves nothing user-visible; stale-preview drop and rollback work.
- WP1 removals have no consumer anywhere; WP2 and WP3 tooling wired and offline-tested.
- WP4: fixtures match 8.5.0 shapes; guard does not misfire on Fighter/Rogue/Investigator/Wizard level-1 features; open schools never offered; single-`classPath` behavior unchanged.
- WP6: UUID table matches the record; trait union, rarity, name, fresh `_id`, `location.heightenedLevel` match native; no price/level written; loot path uses `toItemData` and the spell uuid correctly.
