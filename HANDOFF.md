# HANDOFF.md — live session baton

Read [PLAYBOOK.md](PLAYBOOK.md) first. This file holds only what the last session left in flight. Overwrite it at every session end.

## Session 2026-10-29 (OpenBot), fifth release: Bard spellcasting archetype

- **Ready to release.** `integrate/2026-10-30-bard` (head `303d3bb`) holds the Bard archetype on top of `main@b39b08d` (v0.3.5.84): Bard Dedication + Basic Bard Spellcasting, a spontaneous occult/Charisma entry, a muse ChoiceSet (native `dedicationMuse` flag, Maestro default), and one signature spell from level 6. Contents and records: PLAYBOOK §8.
- **Reviews:** Code Reviewer CHANGES REQUIRED (two MEDIUM: dropped muse slug; missing dedication could leave its spell entry without the feat), fixed at `303d3bb` with fail-before tests, re-reviewed PASS; QA APPROVE (21/21 mutations killed) and recheck APPROVE (5/5 mutations killed).
- **Behavior to note:** the signature spell is chosen by the module (lowest-rank ranked spell), not user-pickable in the editor yet (QA LOW). Native muse flag + signature representation still need Foundry verification.
- **Ledger:** N15–N28, N40–N48, N50–N54 plus the Bard native rows all OPEN. Nothing has been run in Foundry or against a provider.
- **Open user decisions:** speed and sense tops from single outlier creatures; pp from 100 gp; `magical` trait on runed clones (N26); rare/unique cantrip decks. (Strike cap resolved at 200 ft; commit attribution stays `jt`.)
- **Known gaps:** other caster archetypes unbuilt; the PC editor cannot edit spells.
- **Drift:** weekly workflow first run **2026-11-02 06:23 UTC** (dispatch gets HTTP 403 from this server).
- **Next step:** push to `main` (auto-publishes v0.3.5.85), then the user runs the Foundry checklist, then the backlog in PLAYBOOK §9.

## Preserved environment facts

- Live QA artifacts to preserve: [docs/evidence/live-qa-inventory.md](docs/evidence/live-qa-inventory.md). Last recorded installation v0.3.5.72 on Foundry 14.365 / PF2e 8.5.0, world `test`, provider `omniroute / auto/best-free`. Known provider spend lower bound 333,213 tokens.
- OpenBot server checkout: `/var/lib/openbot/OpenBot/Shared/simplyPF2e` (Linux); `gh` works there; system Node is 20, so run the gate with `PATH=/var/lib/openbot/OpenBot/Shared/.tools/node22/bin:$PATH`.
- On the user's Windows machine `gh` hangs; use `curl https://api.github.com/...` for reads; `git push` works with the stored credential. Node on PATH is v24.22.1; CI runs Node 22. Git identity for commits: `jt` / `jt_f@ymail.com`. `core.autocrlf=true`: docs written by scripts need `perl -pi -e 's/\r$//'` before `git diff --check`.
- pf2e upstream: `master` frozen 2025-05-31 (6.12.4); quote `pf2e-8.5.0` (installed) or `v14-dev` (schools moved to `packs/pf2e/class-features/wizard/`). Drift check: pass `--ref pf2e-8.5.0`.
- Worker launch recipe: `orca worktree create --name <wp> --base-branch <integration> --parent-worktree active --agent claude|codex|opencode [--model claude-haiku-5-5|gpt-6.1-terra --effort high] --surface terminal --prompt "$(cat brief)"`; Orca-launched Claude may stop at the Bypass Permissions menu (Down + Enter via `orca terminal send`); for the user's own terminals create the worktree without `--agent` and send the brief with `orca terminal send` (`MSYS_NO_PATHCONV=1`; handles go stale after an Orca restart). Workers write reports to the session scratchpad `reports/` folder. When a brief says "append only" but existing assertions encode the behavior being changed, the worker stops and the orchestrator authorizes the exact lines.
- Remote branches: only `main` remains on `origin` (checked 2026-10-28). Delete another only with the user's say-so.
