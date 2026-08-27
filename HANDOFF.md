# HANDOFF.md — live session baton

Read this first at session start; overwrite it at session end. Keep it short — this is the *current* baton, not history. Anything worth keeping long-term moves to HISTORY.md; standing truths move to CLAUDE.md.

---

## Last session

- **Date:** 2026-08-28
- **Agent:** Claude (Fable 5, coordinator)
- **What happened:** Previous Codex session merged PR #70 (live-QA fixes) at 2026-08-27 13:58 UTC; release **v0.3.5.34** auto-published one minute later, then the session ended abruptly — the post-merge live re-test never happened. This session confirmed merge/release state via the GitHub API, ran the full test suite (26/26 pass, `node --check` clean), and ran a full-codebase multi-agent review (7 subsystem readers + adversarial verification). Findings recorded below. Created AGENTS.md and this file.

## In flight / blocked

- **Live re-test of the native PF2e character grant chain** (the PR #70 change) on v0.3.5.34 — blocked on access to the user's VPS-hosted Foundry. User has offered the URL; not yet provided.
- Full-codebase review findings below are triaged but **no fixes have been written yet**.

## Confirmed review findings (2026-08-28 full-codebase audit, adversarially verified)

High:
1. `pc-builder.mjs:135` — PC starting wealth reads `TREASURE_BY_LEVEL` (a *party per-level* progression table) as one character's own accumulated wealth; levels ≥2 get badly wrong gold. (Level 1 was already special-cased to 15 gp in PR #61; higher levels were not.)
2. `runes.mjs:314` — `propertyRuneKey` grade-reorder regex only handles `(Greater|Major)`; "(True)" grades (e.g. True Quenching → `trueQuenching`) key wrong and the rune is silently inert. Verified against real `runes.ts`.
3. `manage-presets-app.mjs:77` — XSS: preset name interpolated unescaped into DialogV2 delete-confirm HTML; same file escapes the same field elsewhere.

Medium:
4. `ai.mjs:1120` — mid-stream SSE `data: {"error":...}` payloads silently swallowed; surfaces as generic "empty response", burns the retry, hides the provider's real message.
5. `builder.mjs:1013` — AI-invented IWR/sense/language slugs written to actor data with bare `slugify`, no membership check (traits in the same function ARE whitelisted).
6. `builder.mjs:69` — `maxSpellRank = ceil(level/2)` uncapped; level 21+ creatures get rank 11–12 spells (PF2e ceiling is 10).
7. `pc-builder.mjs:172` — heritage↔ancestry consistency never validated in code (prompt-only); mismatched heritage embeds silently.
8. `item-builder.mjs:496` — condition-activation `duration` free text not `esc()`ed at normalize time (sibling selfBuff branch is).
9. `macro-templates.mjs:51` — AI item name unescaped in macro chat HTML.
10. `item-builder.mjs:309` — writing summed `system.price` on runed items is overwritten by pf2e's `computePrice`; preview number disagrees with sheet. (Also contradicts CLAUDE.md verified-facts entry: don't write price at all.)
11. `generator-app.mjs:319` — `#readForm` resets `partySize` to literal 4 outside encounter mode (field absent from DOM → `?? 4` overwrites saved input).
12. `generator-app.mjs:491` — `allowSpellcasting=false` is prompt-only, unenforced in normalize; and a phantom progress step drives the bar past 100%.

Second verification round (Sonnet agents, all completed 2026-08-28):
13. **[high — raised]** `builder.mjs:934` — NPC heightened spells: slot created at heightened rank but spell embedded without `location.heightenedLevel`, so pf2e groups it at base rank with 0/0 uses and never iterates the heightened rank's slot row — heightened spells effectively uncastable. Verified against real `spell/document.ts` + `spellcasting-entry/collection.ts`. The module's own scroll path (builder.mjs:393) sets `heightenedLevel` correctly — copy that.
14. **[medium]** auto-release.yml / release.yml — release-path verify jobs never parse `lang/en.json` (only pull-request.yml does); malformed en.json on main ships silently. Fix: add `jq empty module.json lang/en.json` to both verify jobs.
15. **[medium]** `pc-builder.mjs:676` — PC equipment embeds at zero cost; `applyTreasureBudget` only sees loot, so total assets exceed the wealth target by the gear's full value (worsens with level as runes scale).
REFUTED: "feat slot trait constraint dropped at resolution" — the slot-scoped ID allowlist in ai-candidate-format.mjs discards off-slot picks before resolveFor ever sees them.

Low-severity list (17 items) lives in the session scratchpad review.json and in this session's report to the user; fold worthwhile ones into fix PRs opportunistically.

## Live QA status (2026-08-28, user's VPS Foundry at foundry-test.gigaserver.xyz)

- **Native PF2e grant chain VERIFIED live on v0.3.5.34** (Foundry 14.365 / PF2e 8.4.1): embedding Dwarf + Rock Dwarf + Warrior + Fighter via `createEmbeddedDocuments(..., { keepId: true })` produced the full grant fan-out — Clan Dagger feat → granted Clan Dagger weapon, Reactive Strike feat → granted action, granted Shield Block, background feat Intimidating Glare — with correct derived stats (HP 21, AC 13, saves 6/5/4, languages common+dwarven). Test actor deleted after.
- **Important learning:** the native embed path opens blocking pf2e `PickAThingPrompt` dialogs (Fighter key-skill choice, Dwarf clan-weapon choice) and the `createEmbeddedDocuments` promise **waits on them silently**. The module does not pre-answer or suppress these — a GM generating a character must answer the popups or generation appears hung. Consider a future UX note or pre-supplied `flags.pf2e.rulesSelections`.
- **AI-dependent live QA (full generation, item forge)** still open: the Claude in-app browser blocks page-initiated cross-origin fetches (`ERR_BLOCKED_BY_CLIENT`), so the module's AI calls can't run there. Endpoint itself is healthy (TLS + CORS verified from shell). Needs the user's own browser or the Claude in Chrome extension.

## Fix status (2026-08-28, end of session)

All 15 confirmed findings are FIXED on `release/audit-fixes` (one stacked integration branch: 9 fix branches + this docs branch, each independently reviewed by a second agent before merging; two reviewer findings — a forge-preview double-escape and an empty `error:{}` stream-abort — were fixed pre-merge, and an equipment-value/dedup mismatch was fixed post-review). Full test suite green (30 standalone checks). NOT yet merged to main. Remaining un-fixed: the en.json jq step in the release workflows (workflow-file change, needs its own carefully-tested PR) and the 17 low-severity findings (heritage-fallback inefficiency added as an 18th).

`feat/ui-overhaul` (separate branch/PR): full visual overhaul of all five apps — shared token-based CSS kit, segmented mode switch, progress step chips; JS↔template contracts script-verified; needs live-Foundry eyeballing (list in the branch report/PR).

## Post-merge live QA (v0.3.5.39, 2026-08-28, VPS Foundry)

All merged fixes spot-checked LIVE on the updated world (Foundry 14.365 / PF2e 8.4.1 / module v0.3.5.39):
- `propertyRuneKey`: "Quenching (True)" → `trueQuenching`, "Dread (Lesser)" → `lesserDread`, Greater/plain unchanged. ✓
- `heightenedLevelFor`: heightened → rank recorded, same-rank → null, cantrip → null. ✓
- `PC_WEALTH_BY_LEVEL`: 15 / 270 / 112000 at levels 1/5/20. ✓
- `heritageMatchesAncestry`: versatile-null accepts, cross-ancestry rejects. ✓
- Preset-name XSS: hostile `<img onerror>` name renders fully escaped in the delete dialog, nothing executes. ✓
- UI overhaul: generator renders with segmented mode switch, cards, primary Generate, empty state; encounter mode shows partySize/threat, character mode hides partySize with correct legend; item forge renders with own primary; provider setup usable at 360px with no horizontal overflow; no module console errors. ✓

NOT live-tested (blocked: the Claude in-app browser blocks page-initiated cross-origin fetches, so the module's AI calls can't run there): full AI generation on any pipeline, SSE error surfacing against a real failing provider, heightened-spell sheet rendering on a generated caster, PC wealth/equipment deduction end-to-end, item forge creation. These need a normal browser session (user-driven or Claude in Chrome extension).

## Next steps (in order)
2. Fix PR wave 1 (branch per theme, PR each): (a) high #1–#3, (b) escaping cluster #8/#9, (c) NPC data validation #5/#6, (d) SSE error surfacing #4, (e) UI fixes #11/#12, (f) price-write removal #10, heritage validation #7.
3. Independent second-agent review on each fix PR before requesting merge.
4. Then resume the pre-existing roadmap: local-provider live actor flow, Item Forge first live creation.
