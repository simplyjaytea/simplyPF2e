# HANDOFF.md — live session baton

Read [PLAYBOOK.md](PLAYBOOK.md) first. This file holds only what the last session left in flight. Overwrite it at every session end.

## Release candidate 2026-10-30

The next push ships one combined v0.3.5.88 batch: Round 2 selector summaries and candidate limits, Forge base shortlists, Investigator extra training, character prose validation, alias collision protection, level-bounded NPC loot scrolls, visible tolerated-stage warnings, PF2e 8.5.0 minimum, and corrected live-test instructions and ledger expectations.

Lead reviewed the code. Moss independently approved Round 2 at bc57160, mini features at d3559f6, and runtime repairs at cb14437. Follow-up 89caa21 corrects the unsupported editor instruction and kills the Forge relevance mutation. Ledger correction e32d9bd was cherry-picked separately. Final combined gate and publication must be checked before calling this shipped.

No Foundry or provider calls were made. Native rows remain OPEN. The user tests with docs/plans/first-live-test-2026-10-30.md. Druid remains held pending N55. Known deferred issues include solo-party encounter budget policy and selector-level consumable rank validation, whose Forge boundary already drops invalid picks.

## Earlier session 2026-10-30 (OpenBot): dedication replacement skills, Bard signature pick, Druid spec, token cut

- **Released after:** v0.3.5.87, AI prompt-size cut phase 2a ([record](docs/plans/token-budget-2026-10-30.md)). Phase 2b (pick-changing levers) waits for the user. Measure live: compare the provider's reported tokens and the picks on the first real PC and NPC.

- **Released:** v0.3.5.86 from `main` (merges of `feat/dedication-skills` at `f06eaca` and `docs/caster-archetype-third` at `1b7f583`). Contents: PLAYBOOK §8.
- **Reviews:** Lead PASS; QA APPROVE with four LOW/MEDIUM-LOW notes, all closed at `f06eaca`.
- **Held:** Druid archetype ([spec](docs/plans/caster-archetype-third-2026-10-30.md)) waits for N55 to pass natively and a GrantItem spike. Proposed rows N57–N58 are not in the ledger yet.
- **Ledger:** N15–N28, N40–N48, N50–N56 OPEN. N53 and N56 now also cover the replacement skill and the signature pick. Nothing has been run in Foundry or against a provider.
- **Open user decisions:** speed and sense tops from single outlier creatures; pp from 100 gp; `magical` trait on runed clones (N26); rare/unique cantrip decks. (Strike cap resolved at 200 ft; commit attribution stays `jt`.)
- **Releases on GitHub:** more than the keep-5 policy; deleting old ones waits for the user's OK.
- **Drift:** weekly workflow first run **2026-11-02 06:23 UTC** (dispatch gets HTTP 403 from this server).
- **Next step:** the user runs the Foundry checklist (N55 first, it unblocks Druid), then the backlog in PLAYBOOK §9.

## Preserved environment facts

- Live QA artifacts to preserve: [docs/evidence/live-qa-inventory.md](docs/evidence/live-qa-inventory.md). Last recorded installation v0.3.5.72 on Foundry 14.365 / PF2e 8.5.0, world `test`, provider `omniroute / auto/best-free`. Known provider spend lower bound 333,213 tokens.
- OpenBot server checkout: `/var/lib/openbot/OpenBot/Shared/simplyPF2e` (Linux); `gh` works there; system Node is 20, so run the gate with `PATH=/var/lib/openbot/OpenBot/Shared/.tools/node22/bin:$PATH`.
- On the user's Windows machine `gh` hangs; use `curl https://api.github.com/...` for reads; `git push` works with the stored credential. Node on PATH is v24.22.1; CI runs Node 22. Git identity for commits: `jt` / `jt_f@ymail.com`. `core.autocrlf=true`: docs written by scripts need `perl -pi -e 's/\r$//'` before `git diff --check`.
- pf2e upstream: `master` frozen 2025-05-31 (6.12.4); quote `pf2e-8.5.0` (installed) or `v14-dev` (schools moved to `packs/pf2e/class-features/wizard/`). Drift check: pass `--ref pf2e-8.5.0`.
- Worker launch recipe: `orca worktree create --name <wp> --base-branch <integration> --parent-worktree active --agent claude|codex|opencode [--model claude-haiku-5-5|gpt-6.1-terra --effort high] --surface terminal --prompt "$(cat brief)"`; Orca-launched Claude may stop at the Bypass Permissions menu (Down + Enter via `orca terminal send`); for the user's own terminals create the worktree without `--agent` and send the brief with `orca terminal send` (`MSYS_NO_PATHCONV=1`; handles go stale after an Orca restart). Workers write reports to the session scratchpad `reports/` folder. When a brief says "append only" but existing assertions encode the behavior being changed, the worker stops and the orchestrator authorizes the exact lines.
- Remote branches: only `main` remains on `origin` (checked 2026-10-28). Delete another only with the user's say-so.
