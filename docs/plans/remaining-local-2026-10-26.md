# Remaining local work — 2026-10-26

The user requested Sol and Luna workers, local completion, workspace cleanup and a GitHub push. Work integrates on `codex/remaining-2026-10-26`; pushing this branch does not publish a release. The earlier sprint published v0.3.5.77 at 2026-10-26T04:23:42Z; Auto Release run 40268765920 succeeded for `27ce615`.

Workers own isolated worktrees: Sol implements encounter hazards, Sol implements Forge batches and cantrip decks, Luna closes bounded review findings. A separate reviewer must inspect schema-dependent and balance-sensitive changes after integration. Native acceptance remains open; no Foundry write or provider spend is authorized by this local work.

## Hazard prompt measurement and bound

Fetched [PF2e 8.5.0 trait configuration](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/scripts/config/traits.ts). Lines 1032–1035 declare `const hazardTraits = {`, `...creatureTraits,`, `...damageTraits,`, `...magicTraditions,`; lines 1041–1044 include `environmental`, `fear`, `haunt`, `inhaled`. Recursively collecting the object keys from those four native objects produces 308 distinct runtime slugs. The comma-separated trait line alone contains 2,814 characters. This is a character measurement, not a tokenizer estimate or a provider request.

`hazard-candidates.mjs` keeps catalogs of at most 96 slugs complete. Larger catalogs prioritize literal brief slugs, matching mechanical/haunt/magical/environmental theme vocabulary, and common hazard traits, then fill in stable lexical order. All returned slugs must occur in the runtime catalog. A haunted-grave example offers 96 slugs, 869 comma-separated characters: 1,945 fewer characters (69%). Runtime addon slugs explicitly named in the brief receive highest priority. No game statistic is calculated by this helper.

The smaller offered list is used for both prompting and response validation. The builder still checks the full runtime catalog. Tests cover bounds, determinism, input immutability, unknown-slug refusal, themes, explicit custom traits, and unchanged small catalogs.

## Scheduled upstream audit

The read-only `PF2e source drift` workflow compares both the installed-version target `pf2e-8.5.0` and `master`, with the job's `GITHUB_TOKEN`. A Monday schedule and manual dispatch maintain coverage; path-filtered pull requests exercise the actual merge tree before merge. Reports are retained as artifacts even when a comparison fails. Existing release workflows are unchanged.

GitHub documents that [scheduled workflows run on the default branch](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule). Therefore YAML parsing and local checks do not establish the new workflow's native acceptance: record the PR drift job result, then verify a schedule/manual run after merge. No merge is performed in this session.

## Remaining native dependencies

The Batch A runbook now targets v0.3.5.77 and adds zero-spend Wizard/hazard/Forge visibility preflights. These instructions have not been run. Batch A still needs its explicit generation/token envelope authorization. Screen-reader operation and the isolated PF2e 8.4.1 environment remain external dependencies. Local tests never close acceptance rows.
