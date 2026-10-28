# HANDOFF.md — live session baton

Read [PLAYBOOK.md](PLAYBOOK.md) first. This file holds only what the last session left in flight. Overwrite it at every session end.

## Session 2026-10-29 (OpenBot) — overnight release: cleanup, Wizard v2, Treasure parcel v2

- **Released.** `integrate/2026-10-29` was pushed to `main` on 2026-10-29; Auto Release publishes the next tag after v0.3.5.80 (check `gh release list`). It holds the repo cleanup and drift follow-ups, Wizard v2, and Treasure parcel v2 parts 1 and 2 ([records](docs/plans/wizard-v2-2026-10-29.md), [parcel](docs/plans/parcel-v2-2026-10-29.md)).
- **Reviews:** QA APPROVE and Code Reviewer APPROVE WITH FIXES on the combined branch (`d23ee18`). The two Code Reviewer findings (one failed compendium read or scroll provider error discarded the whole parcel after spend) and the QA test gaps (Create-time revalidation, `intelligent`/`artifact` exclusions) were fixed in `8e2e981`..`32386ed`, each with a mutation-checked test.
- **Default path:** every parcel feature (permanent items, wands, valuables, Merchant sheet, coin split) is behind `experimentalTools`. With the gate off, QA found no behavior change; NPC loot coins resolve the same four ids.
- **Ledger:** N15–N24 are OPEN. Nothing has been run in Foundry; N16 needs a provider-spend level-8 Wizard build.
- **Drift:** with a token, default ref: 140 checked, 0 failures, 3 warnings. The weekly workflow's first run is **2026-11-02 06:23 UTC** (dispatch gets HTTP 403 from this server).
- **Decisions taken by the Lead (reversible, recorded in the parcel record):** pp only from 100 gp; pf2e `values.ts` rates; rare/unique cantrips stay out of decks; workflow matrix `master` replaced by `v14-dev`.
- **Next step:** install the release module-only in the `test` world and run the zero-spend preflights for N12–N24 with the gate on, then off. Then the backlog in PLAYBOOK §9.

## Preserved environment facts

- Live QA artifacts to preserve: [docs/evidence/live-qa-inventory.md](docs/evidence/live-qa-inventory.md). Last recorded installation v0.3.5.72 on Foundry 14.365 / PF2e 8.5.0, world `test`, provider `omniroute / auto/best-free`. Known provider spend lower bound 333,213 tokens.
- OpenBot server checkout: `/var/lib/openbot/OpenBot/Shared/simplyPF2e` (Linux); `gh` works there; system Node is 20, so run the gate with `PATH=/var/lib/openbot/OpenBot/Shared/.tools/node22/bin:$PATH`.
- On the user's Windows machine `gh` hangs; use `curl https://api.github.com/...` for reads; `git push` works with the stored credential. Node on PATH is v24.22.1; CI runs Node 22. Git identity for commits: `jt` / `jt_f@ymail.com`. `core.autocrlf=true`: docs written by scripts need `perl -pi -e 's/\r$//'` before `git diff --check`.
- pf2e upstream: `master` frozen 2025-05-31 (6.12.4); quote `pf2e-8.5.0` (installed) or `v14-dev` (schools moved to `packs/pf2e/class-features/wizard/`). Drift check: pass `--ref pf2e-8.5.0`.
- Worker launch recipe: `orca worktree create --name <wp> --base-branch <integration> --parent-worktree active --agent claude|codex|opencode [--model claude-haiku-5-5|gpt-6.1-terra --effort high] --surface terminal --prompt "$(cat brief)"`; Orca-launched Claude may stop at the Bypass Permissions menu (Down + Enter via `orca terminal send`); for the user's own terminals create the worktree without `--agent` and send the brief with `orca terminal send` (`MSYS_NO_PATHCONV=1`; handles go stale after an Orca restart). Workers write reports to the session scratchpad `reports/` folder. When a brief says "append only" but existing assertions encode the behavior being changed, the worker stops and the orchestrator authorizes the exact lines.
- Remote branches: only `main` remains on `origin` (checked 2026-10-28). Delete another only with the user's say-so.
