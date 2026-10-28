# HANDOFF.md — live session baton

Read [PLAYBOOK.md](PLAYBOOK.md) first. This file holds only what the last session left in flight. Overwrite it at every session end.

## Session 2026-10-28 (OpenBot) — remaining branches merged into `main`

- **Merged** `claude/post-release-docs-2026-10-28` and draft PR #117 (`codex/remaining-2026-10-26`: bounded hazard trait prompts, weekly read-only `PF2e source drift` workflow) through `integrate/2026-10-28`, pushed to `main` in one push, so Auto Release publishes one version after v0.3.5.79. The only conflict was the first import line of `scripts/ai.mjs`; both imports kept.
- **Gate on the head:** `node tools/check.mjs </dev/null` exit 0 on Node 22.23.4 (138 regression files, 178 links in 57 files), `git diff --check` clean. Drift check `--ref pf2e-8.5.0`: 0 failures, 28 warnings.
- **Unverified:** no installation, provider spend or Foundry run; ledger N12–N14 OPEN; the drift workflow's first scheduled/manual run on `main` not yet observed.
- **Exact next step:** (1) install the new release module-only in the `test` world and run the zero-spend preflights for N12–N14 (parcel tile and Create-as control with the gate on and off, the deck tile, the Wizard class tile) before any Batch A spend; (2) trigger `PF2e source drift` once by hand and record the result; (3) backlog in PLAYBOOK §9.
- **Stale remote branches** (all fully merged except `codex/audit-fixes`, an obsolete 2026-09-05 docs commit): `claude/omh-encounter-wizard-2026-10-27`, `claude/sprint-2026-10-25`, `claude/sprint-2026-10-27`, `claude/post-release-docs-2026-10-28`, `codex/remaining-2026-10-26`, and the eleven 2026-09 `codex/*` branches. Delete only with the user's say-so.
- **Orca terminals (handles are runtime-scoped; re-list with `orca terminal list --json`):** the user's OpenCode (DeepSeek V4.1 Flash Free, high), Claude Code (Haiku 5.5 high), Codex (GPT-6.1 Terra high). The user prefers Codex over opencode and wants several features per wave with one combined review.

## Preserved environment facts

- Live QA artifacts to preserve: [docs/evidence/live-qa-inventory.md](docs/evidence/live-qa-inventory.md). Last recorded installation v0.3.5.72 on Foundry 14.365 / PF2e 8.5.0, world `test`, provider `omniroute / auto/best-free`. Known provider spend lower bound 333,213 tokens.
- OpenBot server checkout: `/var/lib/openbot/OpenBot/Shared/simplyPF2e` (Linux); `gh` works there; system Node is 20, so run the gate with `PATH=/var/lib/openbot/OpenBot/Shared/.tools/node22/bin:$PATH`.
- On the user's Windows machine `gh` hangs; use `curl https://api.github.com/...` for reads; `git push` works with the stored credential. Node on PATH is v24.22.1; CI runs Node 22. Git identity for commits: `jt` / `jt_f@ymail.com`. `core.autocrlf=true`: docs written by scripts need `perl -pi -e 's/\r$//'` before `git diff --check`.
- pf2e upstream: `master` frozen 2025-05-31 (6.12.4); quote `pf2e-8.5.0` (installed) or `v14-dev` (schools moved to `packs/pf2e/class-features/wizard/`). Drift check: pass `--ref pf2e-8.5.0`.
- Worker launch recipe: `orca worktree create --name <wp> --base-branch <integration> --parent-worktree active --agent claude|codex|opencode [--model claude-haiku-5-5|gpt-6.1-terra --effort high] --surface terminal --prompt "$(cat brief)"`; Orca-launched Claude may stop at the Bypass Permissions menu (Down + Enter via `orca terminal send`); for the user's own terminals create the worktree without `--agent` and send the brief with `orca terminal send` (`MSYS_NO_PATHCONV=1`; handles go stale after an Orca restart). Workers write reports to the session scratchpad `reports/` folder. When a brief says "append only" but existing assertions encode the behavior being changed, the worker stops and the orchestrator authorizes the exact lines.
- Remote `codex/*` branches are historical; prune only with the user's say-so.
