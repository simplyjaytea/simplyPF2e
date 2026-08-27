# AGENTS.md — operating rules for any AI agent in this repo

This file is the tool-neutral contract for every agent (Codex, Claude, or otherwise) working on simplyPF2e. The deep project brief lives in [CLAUDE.md](CLAUDE.md) — read it first; it holds the glossary, invariants, architecture, and current state. [HISTORY.md](HISTORY.md) holds the session-by-session narrative and the bug log — check it before re-investigating anything. [HANDOFF.md](HANDOFF.md) is the live baton between sessions — read it at session start, update it at session end.

## Non-negotiable rules (summarized from CLAUDE.md — that file wins on conflict)

1. **Never push or merge to `main` directly.** A merge to `main` auto-publishes a public release to every install. Branch + PR always.
2. **Clone real Rule Elements, never hand-author them.** No hand-written RE fallback exists, by design.
3. **When a pf2e system field name or shape matters, fetch the real source** from `raw.githubusercontent.com/foundryvtt/pf2e/master/...` — never recall it from memory. This is the single most repeated bug source in this repo's history.
4. **The AI (in-module) never emits numbers or code** — scale words and enum slugs only; the module supplies values.
5. **Escape AI/user text before HTML** via `text.mjs` `esc`/`toHtml`.
6. **Fail closed** — drop unresolved picks with `console.warn`, never guess (exceptions listed in CLAUDE.md invariant 5).

## Verification bar

- `node --check` on every touched `.mjs`.
- Run all regression tests: `for f in scripts/*.test.mjs; do node "$f"; done` — all must pass.
- Add a `*.test.mjs` for genuinely pure logic behind any bug-shaped change.
- Anything schema-dependent or balance-sensitive gets an **independent second-agent review** of the diff before the PR is called done — this has caught real bugs on 3+ separate occasions (see HISTORY.md process notes).
- Live Foundry behavior (rendering, derived stats, grant chains) is **not** self-checkable from this machine — flag what needs live QA in the PR body and in HANDOFF.md.

## Session protocol

At session **start**:
1. Read HANDOFF.md, then CLAUDE.md "Current state".
2. `git log --oneline -10` and `git status` — do not trust any file's description of branch state over git itself.
3. If HANDOFF.md says an audit/review is in flight, check whether its PR merged mid-review; if so, ship fixes as a *new* PR.

At session **end** (or before any risky long operation):
1. Update HANDOFF.md: what you did, what is in flight, exact next step, anything unverified.
2. If the session found bugs or made decisions worth keeping, append to HISTORY.md (newest first) and update CLAUDE.md "Current state" if it changed.
3. Leave the working tree clean or committed on a named branch — never leave uncommitted work on `main`.

## Known environment quirks

- `gh` CLI hangs indefinitely on this machine (mise-installed, auth/network issue). Use `curl https://api.github.com/repos/simplyjaytea/simplyPF2e/...` for reads; ask the user before any authenticated GitHub write.
- No local Foundry install. Live QA happens on the user's VPS-hosted Foundry — coordinate with the user for access.
- Git identity for this repo: `user.name "jt"`, `user.email "jt_f@ymail.com"`.
