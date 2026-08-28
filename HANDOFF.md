# HANDOFF.md — live session baton

Read this first, then CLAUDE.md. Historical audit and QA evidence is preserved in HISTORY.md.

## Current session — 2026-08-28

- User goal: bug repairs, QOL, and greater automation using Sol/Terra. Item Forge remains deferred.
- Working branch: `codex/pc-spellcasting`, stacked on local `6f188d0` and `be5859d`, based on `origin/main` `004bffc` (PR #82 / release v0.3.5.42 at last API check, not refreshed this pass). Check git for authoritative current state.
- No authenticated GitHub writes, push, PR, merge, or deployment in these local sessions. User permission to push/open a PR was requested and has not been granted. Branch + PR only; never direct main.
- User-owned untracked `.claude/` is untouched.

## Completed locally — awaiting publication permission

- `6f188d0`: new-PC current HP finalized from PF2e's derived max after awaited native item creation; existing Int-language expansion moved into the same rollback boundary. No module HP math or max/temp writes.
- `be5859d`: grounded choice automation: final cloned item sources are collected before Actor.create. Forced/key-ability/unambiguous concept choices resolve locally; other supported choices use a single optional callback batch. Generator supplies the configured AI provider. Exact opaque group/option IDs are validated and mapped locally to real values; first-option guessing is removed.
- Bounds: 24 groups, 32 options/group, 512 total options. Excess/unsupported/unanswered choices stay native, not truncated or guessed. Existing authored selections/preselect records are untouched. Only direct ChoiceSets and one-level GrantItem choices are reachable.
- UI separates AI selection progress from native feature application and tells GMs to answer remaining dialogs. Failed selection falls back to native input with a warning. Shared JSON request errors now retain spent token usage across failed attempts.
- Independent Sol review approved Terra/root implementation with no remaining actionable findings after fixing incomplete-catalog coercion and lost failure usage.
- Verification: 37 regression files pass; changed-module syntax, module/localization JSON parsing, and patch whitespace checks pass. Source checked against PF2e master and 8.4.1. No new live Foundry verification.

## Latest local spellcasting work

- Seven source-qualified Remaster profiles: Bard, Cleric, Druid, Oracle, Sorcerer, Witch, Wizard. Exact publication title + remaster flag and class identity gate the profile. Slots are base-only; Sorcerer/Oracle now use their published 3/4 progression, other supported profiles 2/3. Sol independently compared all 140 level rows against the real PF2e 8.4.1 Classes journal. Native class `spellcasting` is proficiency, not a slot table.
- Prepared classes create an explicit daily plan, including cantrips, using real embedded spell IDs and native prepared arrays. Repeated ranked picks may share a document across ranks/slots. Spontaneous spells retain assigned heightening and deduplicate by real document UUID + rank. Builder rechecks source type/traits/tradition/ritual/base rank/caps, derives profile from the grounded class, clears stale locations, and keeps known empty entries for manual completion.
- Existing selectSpells call now supports a PC plan: the AI selects exact names and rank enum slugs only; the module maps ranks and supplies counts. No extra AI stage. Candidate sampling reserves enough choices per rank inside the existing 96-candidate cap. New deterministic task cap 3072 tokens (configured ceiling and bounded retry still apply).
- Preview warns about base-only coverage, empty slots, signature spells, restricted bonus slots/spells, variable bloodline/patron traditions, and generic legacy/unsupported profiles. Failed/empty known plans keep empty slots instead of substituting an unplanned draft. No subclass, signature, spellbook/familiar inventory, font/curriculum, complex/mixed caster or feat-bonus automation is claimed.
- All 40 regression files, all module syntax checks, module/localization JSON parsing, and patch whitespace checks pass. Production tests cover provider request/enum validation and native document payloads; UI wiring is static-tested, not live Foundry-tested. No real provider calls in this pass.
- Final independent Sol review approved the base-profile diff and expanded tests with no remaining actionable findings. This is not approval of full subclass/signature automation or proof of live casting behavior.

## Exact next steps

1. Check git for the local HP, choice automation, and spellcasting commits. Obtain user permission before pushing/opening a PR; do not treat this goal continuation as publication approval.
2. PR/live QA checklist after release: create a level-1 Dwarf Fighter and a higher-level/high-Int PC; inspect grounded skill/feature selections, native grant chains, bonus languages, and current HP equal to final max.
3. Verify the UI transitions from AI selection to native feature application; complete remaining dialogs. Exercise a failing provider in a disposable test context and confirm native fallback, spent token reporting, and no duplicate/partial actor.
4. Automation still incomplete: ABC-generated/deeper/dynamic/predicated/optional/drop-enabled choices stay native. Closing a required native prompt can leave an ignored rule without rejecting creation. A future review report must distinguish this from suppressed or inapplicable choices; never delete actors merely for dismissed prompts.
5. Native HP caveat: Item._onCreate may launch detached actor updates (e.g. LoseHitPoints). The HP fix follows awaited item creation, not every rule/module follow-up; test unusual HP-mutating rules if present. No delays or hook overrides were added.
6. Release-workflow `lang/en.json` validation remains a separate open gap. Focus spells, Free Archetype, PC runes, presets, and a full local-provider actor flow also need targeted QA.
7. Spellcasting live QA after publication: create a level-1/5 Wizard or Cleric and a level-1/6 Sorcerer or Oracle; check base counts, five cantrips, prepared-slot IDs/casting/expending, repeated and heightened spells, entry ability/tradition, and unchanged native grants/full HP. Exercise an empty/failed plan and review notice; verify disabled casting stays disabled. Manually inspect restricted bonus slots and signature/bloodline/patron choices; those are not automated here.
8. Continue automation by grounding subclass-dependent casting and signature choices against the installed system; unsupported Magus/Summoner/Psychic/Animist/legacy casting still needs verified, distinct handling. Do not extrapolate the seven-profile table; PF2e master and the installed 8.4.1 packs differ materially for some classes.

## Prior live QA / environment

- Test world: https://foundry-test.gigaserver.xyz/game (Foundry 14.365 / PF2e 8.4.1 at last recorded QA, not rechecked this session).
- Previous agents verified native grants on v0.3.5.34 and full cloud creature/PC creation, heightened NPC spells, equipment-value deduction, responsive UI, and one passive/activated forged item on v0.3.5.39. This does not verify v0.3.5.42's changes or this branch.
- QA artifacts previously left: "Stormcaller Shaman", "Bryndra Ironveil", "Stormwarden's Amulet" + macro, plus earlier actors. Do not delete without user approval.
