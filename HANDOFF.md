# HANDOFF.md — live session baton

Read [PLAYBOOK.md](PLAYBOOK.md) first. This file holds only what the last session left in flight. Overwrite it at every session end.

## Session 2026-10-29 (OpenBot), third release: small-gaps fixes

- **Ready to release.** `integrate/2026-10-30-fixes` (head `3cd1705`) holds the small-gaps fixes on top of `main@1c7f0cc` (v0.3.5.82): encounter preview skipped-items line; three surviving mutants killed; rarity cap in the Character editor recompute and the Forge runed-item pools; strike list extended to 200 ft; `requestJSON` retry progress regression pin. Contents and records: PLAYBOOK §8.
- **Reviews:** Code Reviewer APPROVE and QA APPROVE on `1c7f0cc..3cd1705`. QA's two LOW notes (unknown-rarity test gap, runed-pool ledger/docs note) are folded in on the release branch.
- **Behavior change to watch:** a runed Forge item at Common rarity no longer offers uncommon/rare base items, property runes or rune tiers (N54). The `requestJSON` retry guard was already on `main`; the old "no guard" note predates commit 23bb97a.
- **Ledger:** N15–N28, N40–N48, N50–N54 OPEN. Nothing has been run in Foundry or against a provider.
- **Open user decisions:** speed and sense tops from single outlier creatures; pp from 100 gp; `magical` trait on runed clones (N26); rare/unique cantrip decks. (Strike cap resolved at 200 ft; commit attribution stays `jt`.)
- **Known gaps:** other caster archetypes unbuilt; the PC editor cannot edit spells.
- **Drift:** weekly workflow first run **2026-11-02 06:23 UTC** (dispatch gets HTTP 403 from this server).
- **Next step:** push to `main` (auto-publishes v0.3.5.83), then the user runs QA's 13-step Foundry checklist, then the backlog in PLAYBOOK §9.

## Preserved environment facts

- Live QA artifacts to preserve: [docs/evidence/live-qa-inventory.md](docs/evidence/live-qa-inventory.md). Last recorded installation v0.3.5.72 on Foundry 14.365 / PF2e 8.5.0, world `test`, provider `omniroute / auto/best-free`. Known provider spend lower bound 333,213 tokens.
- OpenBot server checkout: `/var/lib/openbot/OpenBot/Shared/simplyPF2e` (Linux); `gh` works there; system Node is 20, so run the gate with `PATH=/var/lib/openbot/OpenBot/Shared/.tools/node22/bin:$PATH`.
- On the user's Windows machine `gh` hangs; use `curl https://api.github.com/...` for reads; `git push` works with the stored credential. Node on PATH is v24.22.1; CI runs Node 22. Git identity for commits: `jt` / `jt_f@ymail.com`. `core.autocrlf=true`: docs written by scripts need `perl -pi -e 's/\r$//'` before `git diff --check`.
- pf2e upstream: `master` frozen 2025-05-31 (6.12.4); quote `pf2e-8.5.0` (installed) or `v14-dev` (schools moved to `packs/pf2e/class-features/wizard/`). Drift check: pass `--ref pf2e-8.5.0`.
- Worker launch recipe: `orca worktree create --name <wp> --base-branch <integration> --parent-worktree active --agent claude|codex|opencode [--model claude-haiku-5-5|gpt-6.1-terra --effort high] --surface terminal --prompt "$(cat brief)"`; Orca-launched Claude may stop at the Bypass Permissions menu (Down + Enter via `orca terminal send`); for the user's own terminals create the worktree without `--agent` and send the brief with `orca terminal send` (`MSYS_NO_PATHCONV=1`; handles go stale after an Orca restart). Workers write reports to the session scratchpad `reports/` folder. When a brief says "append only" but existing assertions encode the behavior being changed, the worker stops and the orchestrator authorizes the exact lines.
- Remote branches: only `main` remains on `origin` (checked 2026-10-28). Delete another only with the user's say-so.
