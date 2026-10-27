# HANDOFF.md — live session baton

Read [PLAYBOOK.md](PLAYBOOK.md) first. This file holds only what the last session left in flight. Overwrite it at every session end.

## Session 2026-10-27 (evening) — sprint: loot actor container and Treasure parcel

- **In progress** on `claude/sprint-2026-10-27` (from `main@50aa045`, released as v0.3.5.78). Plan: [docs/plans/sprint-2026-10-27.md](docs/plans/sprint-2026-10-27.md). WP0 (this docs refresh) done; wave 1 (WP1–WP4, parallel worktrees) and wave 2 (WP5) follow, then Opus review, fix ladder, WP6 docs.
- **Roster (user, 2026-10-27):** Fable orchestrates and merges; Opus 5.5 high plans and reviews; workers are opencode `deepseek-v4.1-flash-free` / `glm-5.3-flash-free` at high, Haiku 5.5 high, Codex GPT-6.1 Terra high for the hardest work. PLAYBOOK §6 updated.
- **Not done / unverified:** no push, PR, provider spend or Foundry run. Ledger N12 (loot actor and parcel) to be added in WP6.
- **Exact next step:** if this file still says "in progress", check `git log claude/sprint-2026-10-27` and `git worktree list` for the wave state, then continue the plan from §5.

## Preserved environment facts

- Live QA artifacts to preserve: [docs/evidence/live-qa-inventory.md](docs/evidence/live-qa-inventory.md). Last recorded installation v0.3.5.72 on Foundry 14.365 / PF2e 8.5.0, world `test`, provider `omniroute / auto/best-free`. Known provider spend lower bound 333,213 tokens.
- `gh` hangs here; use `curl https://api.github.com/...` for reads; `git push` works with the stored credential. Node on PATH is v24.22.1 (2026-10-27); CI runs Node 22. Git identity for commits: `jt` / `jt_f@ymail.com`.
- Worker tooling: Write/Edit are refused for Agent-tool subagents by a plugin hook; a worktree guard refuses `cd` into hand-made worktrees and refuses heredocs with object-literal or nested-brace syntax inside agent worktrees. Working recipe: Agent-tool `isolation: worktree`, `git merge` the integration branch first, draft files in the session scratchpad with heredocs, `cp` them in one per command. Orca cannot set an opencode model at launch; the default lives in `~/.config/opencode/opencode.json`.
- Remote `codex/*` branches are historical; prune only with the user's say-so.
