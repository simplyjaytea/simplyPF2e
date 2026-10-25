# HANDOFF.md — live session baton

Read [PLAYBOOK.md](PLAYBOOK.md) first. This file holds only what the last session left in flight. Overwrite it at every session end.

## Session 2026-10-25 — repository initialization and playbook

- **Done:** reconciled the repo's true state (v0.3.5.74 is the latest release, from PR #114 merged 2026-10-17; the previous CLAUDE.md/HANDOFF.md still described .73 and a half-integrated C01–C03). Wrote `PLAYBOOK.md` as the single agent manual; reduced `CLAUDE.md` and `AGENTS.md` to pointers. Moved all 109 regression tests from `scripts/` to `tests/` (gate updated in `tools/check.mjs`; release archive selection unchanged). Reorganized `docs/` into `plans/`, `reviews/`, `evidence/` (chunk records under `evidence/chunks-2026-10-17/`), moved `HISTORY.md` to `docs/HISTORY.md`, relinked every relative Markdown link, and added `docs/acceptance-ledger.md` (R01–R25, N01–N08 consolidated).
- **Branch:** `claude/playbook-init-2026-10-25`. Workers ran in isolated worktrees (Haiku 5.5, high); merged locally, gate green, independently reviewed by Opus 5.5 (verdict APPROVE WITH FIXES: 0 P1, 5 P2 docs-only, 14 P3), fixes applied by Sonnet 5.5. See `docs/HISTORY.md` top entry for details and the PR number once opened.
- **Not done / unverified:** nothing was installed, generated, published, or exercised natively. v0.3.5.74 release-asset parity is not re-verified. Native ledger unchanged: zero PASS rows.
- **Exact next step:** user picks from PLAYBOOK §9. Recommended order: backlog items 1–4 (local, no spend) can start immediately in parallel worktrees; item 5 (install .74 + Batch A) needs the user's explicit install and spending authorization.
- **Open decisions for the user:** level-shift entry point; confirm C11's assumed shift policy; Batch A spending envelope; screen-reader operator / isolated PF2e 8.4.1 environment or explicit deferral.

## Preserved environment facts

- Live QA artifacts to preserve: [docs/evidence/live-qa-inventory.md](docs/evidence/live-qa-inventory.md). Last recorded installation v0.3.5.72 on Foundry 14.365 / PF2e 8.5.0, world `test`, provider `omniroute / auto/best-free`. Known provider spend lower bound 333,213 tokens.
- `gh` hangs here; use `curl https://api.github.com/...` for reads. Node 26.12.1 local, Node 22 in CI. Git identity for commits: `jt` / `jt_f@ymail.com`.
- Remote `codex/*` branches are historical; prune only with the user's say-so.
