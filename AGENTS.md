# simplyPF2e — agent entry point (tool-neutral)

**Read [PLAYBOOK.md](PLAYBOOK.md) first.** It is the operating manual for every agent working in this repository, whatever the tool (Codex, opencode, omp, Claude, a human). It holds the project scope, the invariants that must never break, the architecture and module map, the delegation and review workflow, the current state, and the ordered backlog. Then read [HANDOFF.md](HANDOFF.md) for what the previous session left in flight.

The six rules you will be held to, in one breath (details and rationale in PLAYBOOK §3):

1. Never push or merge to `main` directly; a merge auto-publishes a public release.
2. Clone real Rule Elements; never hand-author one.
3. When a pf2e field name or shape matters, fetch the real `foundryvtt/pf2e` source and quote it.
4. The in-module AI never emits numbers or code.
5. Escape AI/user text before HTML, and prove cosmetic text enricher-inert.
6. Fail closed; drop unresolved picks with `console.warn`.

Verification before any "done": `node tools/check.mjs` and `git diff --check`. Local tests never close a native acceptance row.

Session end: overwrite `HANDOFF.md`, append `docs/HISTORY.md`, leave the tree committed on a named branch.
