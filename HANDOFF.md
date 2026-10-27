# HANDOFF.md — live session baton

Read [PLAYBOOK.md](PLAYBOOK.md) first. This file holds only what the last session left in flight. Overwrite it at every session end.

## Session 2026-10-27 — encounter hazards, Wizard preflight, review repair, status correction

- **Nothing pushed.** No push, PR, merge to `main`, release, provider spend, or Foundry/world access this session. This clone has no remote-tracking ref for any `*-2026-10-27` branch.
- **Integration branch:** `claude/omh-encounter-wizard-2026-10-27` at `8e03283`, clean, ahead of `main` (`27ce615`). It holds Encounter-mode hazards (`4c83685`), the Wizard preflight closed-candidate check (`4865230`), the hazard design records and the OMH §6 rules. Details: [top entry of docs/HISTORY.md](docs/HISTORY.md) and the [hazard plan](docs/plans/encounter-hazard-integration-2026-10-27.md).
- **Committed, not merged into integration:**
  - `claude/encounter-review-fixes-2026-10-27` at `11857b3`, from `8e03283`. Repairs the verify pass's P2 (the hazard brief now names the requested kind) and P3 (hazard rows tagged `Hazard`). Worktree clean.
  - `claude/docs-closeout-2026-10-27`: the commit `docs: correct review and preflight status` on top of `f62cc05`. Corrects the stale status in PLAYBOOK, the plan and HISTORY.
- **Review state:** the 2026-10-27 verify pass on `8e03283` found no unmet criterion. It is not the independent architect review the design note requires, and it is not an approval. No independent architect review is confirmed run on the repaired code or the integrated branch.
- **Not observed, not claimed:** native Foundry acceptance of any of this (N10 covers the standalone hazard only; no ledger row covers a hazard member inside an encounter); CI on any branch; the Auto Release for v0.3.5.77; PR; push; merge; release.
- **Worktrees** (`git worktree list` and `git status`, at the time of writing):
  - `C:/Users/jtf/projects/simplypf2e` — `main` at `27ce615`, clean. Root checkout; not touched this session.
  - `simplypf2e-omh-integration` — `claude/omh-encounter-wizard-2026-10-27` at `8e03283`, clean.
  - `simplypf2e-wt-review-code` — `claude/encounter-review-fixes-2026-10-27` at `11857b3`, clean.
  - `simplypf2e-wt-docs-closeout` — `claude/docs-closeout-2026-10-27`, clean once the status correction commit is in.
  - `simplypf2e-wt-docs` (`claude/omh-playbook-2026-10-27`, `69a22f5`), `simplypf2e-wt-encounter` (`claude/encounter-hazards-2026-10-27`, `4c83685`), `simplypf2e-wt-wizard` (`claude/wizard-preflight-2026-10-27`, `4865230`): clean; each commit is an ancestor of `8e03283`.
- **Ordered next steps** (push and cleanup only after the final gate and review, as the user authorized):
  1. In `simplypf2e-omh-integration`: `git merge --no-ff claude/encounter-review-fixes-2026-10-27`, then `git merge --no-ff claude/docs-closeout-2026-10-27`. If a conflict appears, stop and report it; do not guess a resolution.
  2. Gate the integration branch: `node tools/check.mjs </dev/null` and `git diff --check`. Both must exit 0.
  3. Independent architect review of the integrated branch: fresh context, not a builder. Verify each finding technically before acting. Fix by the ladder (Haiku 5.5 xhigh, then Sonnet 5.5 xhigh, then Opus 5.5 xhigh) and re-gate. Re-review at most two rounds.
  4. Record the integrated gate result and the review verdict in PLAYBOOK §8 and in HISTORY, and commit that on the integration branch.
  5. Push `claude/omh-encounter-wizard-2026-10-27` only (`git push -u origin claude/omh-encounter-wizard-2026-10-27`). Do not open a PR or merge to `main` unless the user asks.
  6. Clean up the temporary worktrees with `git worktree remove`: `simplypf2e-wt-docs-closeout`, `simplypf2e-wt-review-code`, `simplypf2e-wt-docs`, `simplypf2e-wt-encounter`, `simplypf2e-wt-wizard`. Keep `simplypf2e-omh-integration` and the root. Do not delete branches without the user's say-so.
  7. Coordinator: add a ledger row for a hazard member inside an encounter, or record an explicit gap (plan Open §1).
  8. Carried over from 2026-10-26: confirm the Auto Release for v0.3.5.77 and record its run id in PLAYBOOK §8; re-base the [Batch A runbook](docs/plans/qa-batch-a-2026-10-25.md) on .77 (needs the user's spend envelope).
- **Open decisions for the user:** the Batch A spending envelope; the screen-reader operator and isolated PF2e 8.4.1 environment, or an explicit deferral; whether encounter hazard kind needs a hard guarantee (an `ai.mjs` change to pass the kind into the payload, outside this repair's scope).
- **Worker tooling (2026-10-26):** Write/Edit are refused for subagents by a plugin hook; a worktree guard refuses `cd` into hand-made worktrees and refuses heredocs with object-literal or nested-brace syntax inside agent worktrees. Working recipe: Agent-tool `isolation: worktree`, `git merge` the integration branch first, draft files in the session scratchpad with heredocs, `cp` them in one per command. Orca cannot set an opencode model at launch (`capability_unsupported`); the user replaced the opencode workers with Haiku in the 2026-10-26 sprint.

## Preserved environment facts

- Live QA artifacts to preserve: [docs/evidence/live-qa-inventory.md](docs/evidence/live-qa-inventory.md). Last recorded installation v0.3.5.72 on Foundry 14.365 / PF2e 8.5.0, world `test`, provider `omniroute / auto/best-free`. Known provider spend lower bound 333,213 tokens.
- `gh` hangs here; use `curl https://api.github.com/...` for reads; `git push` works with the stored credential. Node 26.12.1 is the PLAYBOOK §7 default and 22.23.4 is available via `mise exec node@22`; the 2026-10-27 session's PATH node was v24.22.1, so check `node --version` before citing gate results. Git identity for commits: `jt` / `jt_f@ymail.com`.
- `git ls-remote origin` on 2026-10-27 showed `claude/sprint-2026-10-25` and `codex/remaining-2026-10-26`, and no `*-2026-10-27` branch. Remote `codex/*` branches are historical; prune only with the user's say-so.
