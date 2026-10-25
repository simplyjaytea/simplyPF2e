# HANDOFF.md — live session baton

Read [PLAYBOOK.md](PLAYBOOK.md) first. This file holds only what the last session left in flight. Overwrite it at every session end.

## Session 2026-10-25 (second half) — sprint: integrity gate, level-shift UI, .74 parity, Batch A runbook

- **Done, on branch `claude/sprint-2026-10-25`** (built on `claude/playbook-init-2026-10-25`, which holds the playbook/test-move/docs reorg): see [sprint plan](docs/plans/sprint-2026-10-25.md) and the top entry of [docs/HISTORY.md](docs/HISTORY.md). Opus audit APPROVE WITH FIXES; every P2 and P3 fixed by Haiku; gate green on Node 22.23.4 and 26.12.1.
- **Publication state:** the branch is pushed and a PR is open (number in the final session report). **Merging publishes v0.3.5.75**; that is the user's call. Shipped runtime change: gated level-shift UI + `module.api.levelShift`; nothing changes with `experimentalTools` off.
- **Not done / unverified:** no installation, no provider spend, no Foundry run. Native ledger unchanged (zero PASS). Node 22 verification used a mise-installed Node 22.23.4.
- **Exact next step:** (1) user merges the PR when ready; (2) live QA Batch A per [runbook](docs/plans/qa-batch-a-2026-10-25.md) after installing the release that contains this work (module-only update), with the user's spend authorization (ceiling 1 generation / 40,000 tokens); (3) remaining local backlog in PLAYBOOK §9: dead-code and the 16 unused lang keys; Markdown link check in the gate.
- **Open decisions for the user:** Batch A spending envelope; screen-reader operator / isolated PF2e 8.4.1 environment or explicit deferral.
- **Housekeeping:** Orca worktrees `/home/jtf/orca/workspaces/simplyPF2e/wp{1,2,3}-*` and branches `simplyjaytea/wp{1,2,3}-*` are merged and can be removed; the user's opencode default model was restored to `opencode/glm-5.3-flash-free`.

## Preserved environment facts

- Live QA artifacts to preserve: [docs/evidence/live-qa-inventory.md](docs/evidence/live-qa-inventory.md). Last recorded installation v0.3.5.72 on Foundry 14.365 / PF2e 8.5.0, world `test`, provider `omniroute / auto/best-free`. Known provider spend lower bound 333,213 tokens.
- `gh` hangs here; use `curl https://api.github.com/...` for reads. Node 26.12.1 default and 22.23.4 via `mise exec node@22`. Git identity for commits: `jt` / `jt_f@ymail.com`.
- Remote `codex/*` branches are historical; prune only with the user's say-so.
