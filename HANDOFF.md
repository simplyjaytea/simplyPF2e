# HANDOFF.md — live session baton

Read this first, then CLAUDE.md. Historical audit and QA evidence is preserved in HISTORY.md.

## Current session — 2026-08-28

- Codex coordinating Sol review and Terra implementation. User wants bug repairs, QOL, and greater automation; Item Forge remains deferred.
- Git/API checked: `origin/main` = `004bffc` (PR #82), latest release v0.3.5.42. PR #77 audit fixes and PRs #79–#82 UI/QA/partial ChoiceSet/loot work are already merged. Old "no fixes / native QA pending" notes were stale.
- Working branch: `codex/pc-creation-finalization`, based on `004bffc`. No authenticated GitHub writes, push, PR, merge, or deployment in this session. Ask the user before authenticated writes; branch + PR only, never direct main.
- User-owned untracked `.claude/` directory is untouched.

## Completed locally — awaiting publication permission

- PC starting HP: the old 9999 seed on an empty actor can be replaced by PF2e's per-item native HP adjustments before the final batch maximum is derived. An earlier live new-character run showed current/max HP 11/22.
- Local patch finalizes current HP from the real derived maximum AFTER awaiting native embedded items/choices; preserves `keepId`, never computes/writes max HP, and moves the existing Int-language finalization into the same rollback boundary. No ChoiceSet policy changes.
- Verification: all 35 regression files pass (34 baseline + the new production-import finalization test); touched-module syntax, module/localization JSON parsing, and patch whitespace checks pass. Independent Sol review approved the scoped Terra implementation and tests with no remaining actionable findings. Do not call this live-verified.
- Native lifecycle caveat: PF2e's item `_onCreate` can launch detached actor updates, including a `LoseHitPoints` rule. This patch follows awaited native item creation; it does not await every rule/module follow-up or override native hooks. Include unusual HP-mutating rules in targeted live QA if present.

## Exact next steps

1. The scoped fix/docs are ready for a local commit on the named branch. Check git for the authoritative commit state.
2. Ask permission before pushing/opening a PR; include the live-QA checklist below in its body. No further implementation is needed for this bounded fix unless review or live QA finds a defect.
3. PR/live QA checklist after release: generate a level-1 Dwarf martial and a higher-level/high-Int PC; answer any native choices; verify current HP equals final derived max, native grants remain intact, and bonus languages are retained. Check failure cleanup in a disposable test context. This machine has no local Foundry installation.
4. Next small QOL candidate: show persistent creation guidance while awaiting native choices. Some ABC-generated/deeper/dynamic choices still prompt despite PR #81. Closing a required native prompt can leave an ignored rule without rejecting creation—do not assume success means every choice was completed, and do not delete actors merely for dismissed prompts.
5. The release-workflow `lang/en.json` validation gap remains open; treat workflow changes separately with the required verification.

## Prior live QA / environment

- Test world: https://foundry-test.gigaserver.xyz/game (Foundry 14.365 / PF2e 8.4.1 at last recorded QA; not rechecked this session).
- Previous agents verified native grants on v0.3.5.34 and full cloud creature/PC generation, heightened NPC spells, equipment-value deduction, responsive UI, and one passive/activated forged item on v0.3.5.39. That does not verify subsequent v0.3.5.42 changes or this branch.
- Previously left QA artifacts: "Stormcaller Shaman", "Bryndra Ironveil", "Stormwarden's Amulet" and its macro; earlier sessions also left other actors. Do not delete without user approval.
- Focus spells, Free Archetype, Int languages, PC runes, presets, and a full local-provider actor flow still need targeted QA. See HISTORY.md for details and the correction about old reload-time Clan Dagger warnings.
