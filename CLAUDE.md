# simplyPF2e — Claude entry point

**Read [PLAYBOOK.md](PLAYBOOK.md) first.** It is the single operating manual for every agent: project scope, glossary, invariants, architecture, repo layout, how work is delegated and reviewed, current state, and the ordered backlog. Then read [HANDOFF.md](HANDOFF.md) for what is in flight. Nothing in this file overrides the playbook.

Claude-specific notes:

- When running as Fable with subagent tools, Claude is the **orchestrator** (PLAYBOOK §6 "Orchestration roster"): Fable 5.5 high plans and delegates; workers are Haiku 5.5 or opencode `glm-5.3-flash-free` / `beam-free`, all at very high effort; Sonnet 5.5 only as an escalation; finished worktrees merge into a local integration branch, Opus 5.5 high reviews it, fixes go Haiku xhigh then Sonnet xhigh then Opus xhigh.
- Subagent briefs must name owned files, forbidden files, the verification command (`node tools/check.mjs` and `git diff --check`), the commit message, and the report shape. A subagent's "verified against pf2e source" counts only with a quoted source line.
- Local Claude state lives in `.claude/` (gitignored). Persistent memory holds the user's standing orchestration preferences; the repo documents hold everything project-specific.
- Writing to `main`, pushing, publishing, spending provider tokens, or touching the live Foundry world each require the user's explicit, current authorization (PLAYBOOK §3 invariants 1 and 8).
