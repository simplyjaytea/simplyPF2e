# HANDOFF.md — live session baton

Read [PLAYBOOK.md](PLAYBOOK.md) first. This file holds only what the last session left in flight. Overwrite it at every session end.

## Session 2026-10-27 — encounter hazards, Wizard preflight, review repair, integrated gate and review

- **Nothing pushed.** No push, PR, merge to `main`, release, provider spend, or Foundry/world access this session. This clone has no remote-tracking ref for any `*-2026-10-27` branch.
- **Integration branch:** `claude/omh-encounter-wizard-2026-10-27`, ahead of local `main` (`27ce615`). The candidate that passed the gate and review is `bab2666`. Docs-only commits on top of it: `27fa564` (`docs: record integrated gate and review`) and `docs: finalize review and backlog status`. Together they change PLAYBOOK §8 and §9, the plan status line, `docs/HISTORY.md` and this file. Details: [top entry of docs/HISTORY.md](docs/HISTORY.md) and the [hazard plan](docs/plans/encounter-hazard-integration-2026-10-27.md).
- **Gate:** `node tools/check.mjs </dev/null` and `git diff --check` passed on `bab2666` (Node v24.22.1). The docs-only `27fa564` passed the same gate, and the status commit was checked the same way before it was committed. Node 22 (the CI version) was not run.
- **Review:** a fresh review of `bab2666` returned SHIP with high confidence and no unmet run-goal criterion. Route evidence: the parent's `omh_delegate_route` dispatch applied `category=architect`, `model=claude-opus-5-5`, `provider=anthropic`, `reasoning_effort=high`, and the delegation completion reported actual model `claude-opus-5-5`. The reviewer's own report could not observe its route; it reports `claude-opus-5-5` from its session header. No blocking findings. Nonblocking residuals: (1) a hazard-kind mismatch is still dropped after provider spend (documented fail-closed behavior); (2) create refuses on a closed gate even with zero hazard copies (accepted fail-closed behavior); (3) hazard progress estimates use creature token caps (PLAYBOOK §9 item 5).
- **Not observed, not claimed:** native Foundry acceptance of any of this (N10 covers the standalone hazard only; no ledger row covers a hazard member inside an encounter); CI on any branch; the Auto Release for v0.3.5.77; PR; push; merge; release.
- **Worktrees** (`git worktree list`, checked at close-out):
  - `C:/Users/jtf/projects/simplypf2e` — `main` at `27ce615`, clean. Root checkout; not touched this session.
  - `simplypf2e-omh-integration` — `claude/omh-encounter-wizard-2026-10-27`. Keep.
  - Temporary; clean up after the push: `simplypf2e-wt-docs-closeout` (`de1cbeb`), `simplypf2e-wt-review-code` (`11857b3`), `simplypf2e-wt-docs` (`69a22f5`), `simplypf2e-wt-encounter` (`4c83685`), `simplypf2e-wt-wizard` (`4865230`).
- **Next steps** (the push-then-cleanup sequence is authorized by the user; none of it has run):
  1. Push `claude/omh-encounter-wizard-2026-10-27` only: `git push -u origin claude/omh-encounter-wizard-2026-10-27`. Do not open a PR or merge to `main` unless the user asks.
  2. Verify that the remote branch head equals the local head.
  3. Remove only the five temporary worktrees above (`git worktree remove`). Keep `simplypf2e-omh-integration` and the root. Do not delete branches without the user's say-so.
  4. Coordinator: add a ledger row for a hazard member inside an encounter, or record an explicit gap (plan Open §1).
  5. Carried over from 2026-10-26: confirm the Auto Release for v0.3.5.77 and record its run id in PLAYBOOK §8; re-base the [Batch A runbook](docs/plans/qa-batch-a-2026-10-25.md) on .77 (needs the user's spend envelope).
- **Stale text left as is (outside the named sections):** PLAYBOOK §1's table header still reads "Status (2026-10-25)". PLAYBOOK §6 (line 149) and §7 (line 214) say Node 22 is not installed locally. HISTORY's 2026-10-25 entry records a Node 22.23.4 check run via mise, and the Preserved environment facts below say 22.23.4 is available via `mise exec node@22`. `mise` is not on PATH in the 2026-10-27 shell, so the Node 22 state was not verified here; the disagreement is not reconciled.
- **Open decisions for the user:** the Batch A spending envelope; the screen-reader operator and isolated PF2e 8.4.1 environment, or an explicit deferral; whether encounter hazard kind needs a hard guarantee (an `ai.mjs` change to pass the kind into the payload, outside this repair's scope).
- **Worker tooling (2026-10-26):** Write/Edit are refused for subagents by a plugin hook; a worktree guard refuses `cd` into hand-made worktrees and refuses heredocs with object-literal or nested-brace syntax inside agent worktrees. Working recipe: Agent-tool `isolation: worktree`, `git merge` the integration branch first, draft files in the session scratchpad with heredocs, `cp` them in one per command. Orca cannot set an opencode model at launch (`capability_unsupported`); the user replaced the opencode workers with Haiku in the 2026-10-26 sprint.

## Preserved environment facts

- Live QA artifacts to preserve: [docs/evidence/live-qa-inventory.md](docs/evidence/live-qa-inventory.md). Last recorded installation v0.3.5.72 on Foundry 14.365 / PF2e 8.5.0, world `test`, provider `omniroute / auto/best-free`. Known provider spend lower bound 333,213 tokens.
- `gh` hangs here; use `curl https://api.github.com/...` for reads; `git push` works with the stored credential. Node 26.12.1 is the PLAYBOOK §7 default and 22.23.4 is available via `mise exec node@22`; the 2026-10-27 session's PATH node was v24.22.1, so check `node --version` before citing gate results. Git identity for commits: `jt` / `jt_f@ymail.com`.
- `git ls-remote origin` on 2026-10-27 showed `claude/sprint-2026-10-25` and `codex/remaining-2026-10-26`, and no `*-2026-10-27` branch. Remote `codex/*` branches are historical; prune only with the user's say-so.
