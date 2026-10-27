# HANDOFF.md — live session baton

Read [PLAYBOOK.md](PLAYBOOK.md) first. This file holds only what the last session left in flight. Overwrite it at every session end.

## Session 2026-10-27 — encounter hazards, Wizard preflight, status close-out

- **Local state, nothing pushed.** The integration branch `claude/omh-encounter-wizard-2026-10-27` at `8e03283` holds Encounter-mode hazards (`4c83685`), the Wizard preflight closed-candidate check (`4865230`), the hazard design records and the OMH §6 rules, merged onto `main` `27ce615`. Details: [top entry of docs/HISTORY.md](docs/HISTORY.md) and the [hazard plan](docs/plans/encounter-hazard-integration-2026-10-27.md).
- **Not observed, not claimed:** native Foundry acceptance of any of this (N10 covers the standalone hazard only; no row covers a hazard member inside an encounter); CI; PR; push; merge; release. The Auto Release for v0.3.5.77 was not checked this session.
- **Worktrees and branches** (`git worktree list` at close-out):
  - `C:/Users/jtf/projects/simplypf2e` — `main` at `27ce615`, clean.
  - `simplypf2e-omh-integration` — `claude/omh-encounter-wizard-2026-10-27` at `8e03283`, clean.
  - `simplypf2e-wt-review-code` — `claude/encounter-review-fixes-2026-10-27` from `8e03283`. Review fixes in progress; one uncommitted edit in `tests/generator-app.encounterHazard.test.mjs` at close-out. Not merged.
  - `simplypf2e-wt-docs-closeout` — `claude/docs-closeout-2026-10-27`: this close-out commit.
  - `simplypf2e-wt-docs` (`claude/omh-playbook-2026-10-27`), `simplypf2e-wt-encounter` (`claude/encounter-hazards-2026-10-27`), `simplypf2e-wt-wizard` (`claude/wizard-preflight-2026-10-27`): clean, and their commits are ancestors of the integration branch.
- **Review:** the verify pass on `8e03283` found no unmet criterion and raised:
  - P2, `scripts/generator-app.mjs` (around lines 1547–1556): `generateHazardConcept` gets only level and brief, so the requested kind is not sent and a mismatch is dropped at random after provider spend. Suggested fix: name the kind in the brief or pass it as a constraint.
  - P3, `templates/generator.hbs:456`: a hazard row is labelled like a creature.
  - P3, `scripts/generator-app.mjs:2412`: create refuses on a closed gate even with 0 hazard copies. Fails closed; accepted, no fix.
  - The independent architect reviewer the design note requires is not confirmed as run. The verify pass is not that review and is not an approval.
- **Exact next steps:**
  1. In `claude/encounter-review-fixes-2026-10-27`: finish the fixes. Check each finding against the code first. Use the fix ladder (Haiku 5.5 xhigh, then Sonnet 5.5 xhigh, then Opus 5.5 xhigh). Then `node tools/check.mjs` and `git diff --check`.
  2. Independent re-review with fresh context, at most two rounds.
  3. Merge the fixes into `claude/omh-encounter-wizard-2026-10-27`; re-run the gate there.
  4. Push `claude/omh-encounter-wizard-2026-10-27` only. The user authorized the push only after the final gates and review. Then clean up the temporary worktrees listed above. Do not merge to `main`; do not delete branches without the user's say-so.
  5. Coordinator: add a ledger row, or an explicit gap, for a hazard member inside an encounter (plan, Open §1).
  6. Coordinator, next docs pass: PLAYBOOK §10 Wizard limits still says the closed-candidate case fails at Create (`4865230` changed that). The plan's "Why" paragraph still says §9 is unchanged.
  7. Carried over from 2026-10-26: confirm the Auto Release for v0.3.5.77 and record its run id in PLAYBOOK §8; re-base the [Batch A runbook](docs/plans/qa-batch-a-2026-10-25.md) on .77 (needs the user's spend envelope).
- **Open decisions for the user:** Batch A spending envelope; screen-reader operator and isolated PF2e 8.4.1 environment, or an explicit deferral.
- **Worker tooling (2026-10-26):** Write/Edit are refused for subagents by a plugin hook; a worktree guard refuses `cd` into hand-made worktrees and refuses heredocs with object-literal or nested-brace syntax inside agent worktrees. Working recipe: Agent-tool `isolation: worktree`, `git merge` the integration branch first, draft files in the session scratchpad with heredocs, `cp` them in one per command. Orca cannot set an opencode model at launch (`capability_unsupported`); the user replaced the opencode workers with Haiku in the 2026-10-26 sprint.

## Preserved environment facts

- Live QA artifacts to preserve: [docs/evidence/live-qa-inventory.md](docs/evidence/live-qa-inventory.md). Last recorded installation v0.3.5.72 on Foundry 14.365 / PF2e 8.5.0, world `test`, provider `omniroute / auto/best-free`. Known provider spend lower bound 333,213 tokens.
- `gh` hangs here; use `curl https://api.github.com/...` for reads; `git push` works with the stored credential. Node 26.12.1 is the PLAYBOOK §7 default and 22.23.4 is available via `mise exec node@22`; the 2026-10-27 session's PATH node was v24.22.1, so check `node --version` before citing gate results. Git identity for commits: `jt` / `jt_f@ymail.com`.
- `git ls-remote origin` on 2026-10-27 showed `claude/sprint-2026-10-25` and `codex/remaining-2026-10-26`, and no `*-2026-10-27` branch. Remote `codex/*` branches are historical; prune only with the user's say-so.
