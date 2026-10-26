# HANDOFF.md — live session baton

Read [PLAYBOOK.md](PLAYBOOK.md) first. This file holds only what the last session left in flight. Overwrite it at every session end.

## Session 2026-10-26 — sprint: hygiene tooling, drift check, Wizard class, Hazard generator, scrolls and wands

- **Done, on branch `claude/sprint-2026-10-26`**: see [sprint plan](docs/plans/sprint-2026-10-26.md) and the top entry of [docs/HISTORY.md](docs/HISTORY.md). Six work packages merged (WP1 dead code, WP2 link check, WP3 drift check, WP4 Wizard, WP5 Hazard generator gated, WP6 scrolls/wands) plus a drift legacy-alias fix, a hazard fix pass and a merge reconciliation. Gate: 54 scripts, 123 tests, 4 tooling files; `Integrity passed: 311 imports, 804 exports, 15 templates, 579 localization keys; 0 unused keys`; `Links passed`; exit 0 on Node 26.12.1.
- **Review:** Opus 5.5 (high) review of `main..HEAD`: APPROVE WITH FIXES (1 P1, 5 P2, 12 P3; [record](docs/reviews/sprint-review-2026-10-26.md)). All fixed by F1/F3 (Haiku xhigh) and F2 (Sonnet xhigh); re-check verdict in HISTORY.
- **Publication state:** the user instructed, on 2026-10-26, a direct merge of this branch into `main` and a push (no PR). That merge publishes **v0.3.5.77** to every install with zero live QA on Wizard, hazards (gated, invisible with `experimentalTools` off), scrolls and wands. If the merge has happened, `git log main` shows it and the Auto Release run should be checked via `curl https://api.github.com/repos/simplyjaytea/simplyPF2e/releases?per_page=3`.
- **Not done / unverified:** no installation, no provider spend, no Foundry run. Native ledger N09 (Wizard), N10 (hazard), N11 (scrolls/wands) added, all OPEN; zero PASS rows overall. Node 22 gate not re-run this sprint (CI runs it on the PR/main push).
- **Exact next step:** (1) confirm the Auto Release for .77 succeeded and record the run id in PLAYBOOK §8; (2) re-base the [Batch A runbook](docs/plans/qa-batch-a-2026-10-25.md) on .77 and, with the user's spend authorization, run it; add N09–N11 zero-spend preflights (gate on/off visibility, Wizard class tile present) to the same session; (3) local backlog in PLAYBOOK §9 (hazards in Encounter mode; loot actor for consumables; Wizard school focus spell).
- **Open decisions for the user:** Batch A spending envelope; screen-reader operator / isolated PF2e 8.4.1 environment or explicit deferral.
- **Housekeeping:** all sprint worktrees under `.claude/worktrees/` and the Orca worktrees `h1-hazard-tables`, `h2-hazard-builder`, `c2-forge-consumables` were removed; the user's opencode default model `opencode/glm-5.3-flash-free` was restored after a config-swap launch attempt. The roster branch `claude/roster-2026-10-26` is contained in the sprint branch and can be deleted after the merge.

## Preserved environment facts

- Live QA artifacts to preserve: [docs/evidence/live-qa-inventory.md](docs/evidence/live-qa-inventory.md). Last recorded installation v0.3.5.72 on Foundry 14.365 / PF2e 8.5.0, world `test`, provider `omniroute / auto/best-free`. Known provider spend lower bound 333,213 tokens.
- `gh` hangs here; use `curl https://api.github.com/...` for reads; `git push` works with the stored credential. Node 26.12.1 default and 22.23.4 via `mise exec node@22`. Git identity for commits: `jt` / `jt_f@ymail.com`.
- Worker tooling: Write/Edit are refused for subagents by a plugin hook; a worktree guard refuses `cd` into hand-made worktrees and refuses heredocs with object-literal or nested-brace syntax inside agent worktrees. Working recipe: Agent-tool `isolation: worktree`, `git merge` the integration branch first, draft files in the session scratchpad with heredocs, `cp` them in one per command. Orca cannot set an opencode model at launch (`capability_unsupported`); the user replaced the opencode workers with Haiku this sprint.
- Remote `codex/*` branches are historical; prune only with the user's say-so.
