# HANDOFF.md — live session baton

Read [PLAYBOOK.md](PLAYBOOK.md) first. This file holds only what the last session left in flight. Overwrite it at every session end.

## Session 2026-10-29 (OpenBot) — integrate branch, Wizard v2, QA repair round

- **Nothing is pushed or merged.** `main` is still `c86aa7a` (v0.3.5.80). The integrate branch `integrate/2026-10-29` (head: see `git log`) holds the cleanup branch `work/cleanup-2026-10-29` (drift tool defaults and token scan, ledger N15, stale docs) and `work/wizard-v2` (advanced school spell with the level-8 feat, school spell in the PC preview, uncommon cantrip decks; ledger N16–N18), plus the QA repair round.
- **QA repair round (2026-10-29):** QA's APPROVE WITH FIXES on `acd4058` (F1 preview lines never rendered, F2 deck rarity control hidden, F3 untested focus dedupe, F4 one 503 aborted a drift run, F5 fail-open rarity map, F6 unguarded preview call, F7 stale docs) is closed on the integrate branch. Each finding names its test in the commit messages and [HISTORY](docs/HISTORY.md).
- **Ledger:** N15 (hazard member inside an encounter), N16 (advanced school spell, level 8), N17 (school spell in the preview), N18 (uncommon cantrip deck) are all OPEN. Nothing has been run in Foundry, and N16 needs a provider-spend Wizard build.
- **Gate on the integrate head:** `node tools/check.mjs </dev/null` exit 0 on Node 22.23.4; `git diff --check c86aa7a..HEAD` clean.
- **Drift:** the weekly `PF2e source drift` workflow has not run on `main` yet. This server's token gets HTTP 403 on workflow dispatch, so the first run is the Monday schedule, **2026-11-02 06:23 UTC**, after the branch merges. Locally, the default-ref run with a token passes with 0 failures.
- **Next step:** QA re-checks the integrate head against the F1–F7 list. Then the user decides whether to push and merge to `main`, which publishes a release. Before that: review the workflow matrix change (`master` to `v14-dev`), and the module policy that keeps rare and unique cantrips out of decks.
- **Cleanup after merge:** remove the worktrees under `/var/lib/openbot/OpenBot/Shared/worktrees/` (`cleanup`, `wizard-v2`, `integrate`) and their local branches once they are merged into `main`.
- **Attribution:** commits carry `Co-Authored-By: Claude Haiku 5.5`, following the system attribution reminder; the briefs asked for Opus 5.5. Confirm before the release.
- **Orca terminals (handles are runtime-scoped; re-list with `orca terminal list --json`):** the user's OpenCode (DeepSeek V4.1 Flash Free, high), Claude Code (Haiku 5.5 high), Codex (GPT-6.1 Terra high). The user prefers Codex over opencode and wants several features per wave with one combined review.

## Preserved environment facts

- Live QA artifacts to preserve: [docs/evidence/live-qa-inventory.md](docs/evidence/live-qa-inventory.md). Last recorded installation v0.3.5.72 on Foundry 14.365 / PF2e 8.5.0, world `test`, provider `omniroute / auto/best-free`. Known provider spend lower bound 333,213 tokens.
- OpenBot server checkout: `/var/lib/openbot/OpenBot/Shared/simplyPF2e` (Linux); `gh` works there; system Node is 20, so run the gate with `PATH=/var/lib/openbot/OpenBot/Shared/.tools/node22/bin:$PATH`.
- On the user's Windows machine `gh` hangs; use `curl https://api.github.com/...` for reads; `git push` works with the stored credential. Node on PATH is v24.22.1; CI runs Node 22. Git identity for commits: `jt` / `jt_f@ymail.com`. `core.autocrlf=true`: docs written by scripts need `perl -pi -e 's/\r$//'` before `git diff --check`.
- pf2e upstream: `master` frozen 2025-05-31 (6.12.4); quote `pf2e-8.5.0` (installed) or `v14-dev` (schools moved to `packs/pf2e/class-features/wizard/`). Drift check: pass `--ref pf2e-8.5.0`.
- Worker launch recipe: `orca worktree create --name <wp> --base-branch <integration> --parent-worktree active --agent claude|codex|opencode [--model claude-haiku-5-5|gpt-6.1-terra --effort high] --surface terminal --prompt "$(cat brief)"`; Orca-launched Claude may stop at the Bypass Permissions menu (Down + Enter via `orca terminal send`); for the user's own terminals create the worktree without `--agent` and send the brief with `orca terminal send` (`MSYS_NO_PATHCONV=1`; handles go stale after an Orca restart). Workers write reports to the session scratchpad `reports/` folder. When a brief says "append only" but existing assertions encode the behavior being changed, the worker stops and the orchestrator authorizes the exact lines.
- Remote branches: only `main` remains on `origin` (checked 2026-10-28). Delete another only with the user's say-so.
