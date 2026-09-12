# Repository maintenance — 2026-09-12

Branch: `codex/repo-optimization`. Runtime baseline: public v0.3.5.70,
`d17a2b5`. The user authorized review, organization, optimization, push and
merge through a PR. Existing post-.70 QA and readiness notes are included.

## Changes

- One shared async cache owns pending-load coalescing and failure eviction.
  Compendium discovery, ordinary/equipment indexes and rule-source scans
  use it. Successful per-pack results use the actual pack object as their
  key; a missing or replaced pack cannot reuse a prior object's records.
- Equipment aggregates, rule exemplars, Forge prices/usage options and
  fundamental rune tables derive from cached indexes using current source
  selection. A transient empty fallback no longer freezes these views until
  reload. Source ordering, duplicate precedence, eligibility, exact identities,
  cloned Rule Elements and numeric formulas are preserved.
- `node tools/check.mjs` replaces repeated syntax/regression/JSON commands
  in PR, auto-release and reusable-release verification. It uses the current
  Node executable, discovers nested tests, fails when tests are missing, and
  retains failure output. Publication triggers, version computation, archive
  selection and draft-to-published release staging retain their behavior.
- The [documentation map](README.md) distinguishes current evidence from
  historical plans. The long [QA inventory](live-qa-inventory.md) moved intact
  out of HANDOFF.md, which now focuses on current work and native follow-up.
  Runtime tests remain colocated; maintenance tooling and fixtures remain
  outside the release archive.

## Verification and review

- The new production regressions reproduced six compendium-cache failures,
  five rule-source failures and three downstream price/usage/rune failures
  before their respective fixes. All pass afterward. Shared-cache tests also
  cover successful empty values and synchronous/asynchronous failure retry.
- The final local Node **22.23.2** gate passes all **92 regression files**,
  **129 script syntax checks**, the **one tooling syntax check**, both JSON
  files and whitespace checks.
- Isolated temporary-repository probes confirm the new verification command
  works from another working directory, discovers nested tests, and rejects
  bad syntax, failing tests, malformed JSON and missing regression suites.
- Independent reviewer `optimization_review` approved both the cache/source
  diff and the downstream consumer follow-up with no blockers. The fetched
  PF2e master Boots of Elvenkind source matches the test fixture SHA-256
  `943dd6515a9c0cb4da7eaa1b897d461b04828881fa0efb48474106a320253736`.

Concurrent regressions demonstrate one pack load for two overlapping callers
where the old implementation made two. Derived views now perform some local
iteration on each request instead of retaining potentially stale global
results. An independent synthetic Node check with 10,000 entries measured 30
calls at about 83 ms for pricing, 11 ms for usage, and 257 ms for paired rune
cap/price calls, with one index load total. These measurements describe the
bounded local tradeoff; they are not a live Foundry speedup claim.

## Release and native limits

PR CI and the real automatic-release run must verify the changed workflow
commands. HANDOFF.md and git/public GitHub state track publication completion.
No provider request, Foundry access, module update or world mutation occurred
during this maintenance work.

Live follow-up: warm Forge/rune catalogs, change equipment sources, and check
new plans' pricing, usage options and rune tiers; exercise overlapping
Generator/Forge catalog requests. Same-object compendium edits and successful
source-discovery lists retain their session cache lifetime, so reload after
editing pack contents. Existing native acceptance limits in the
[ship-readiness assessment](ship-readiness-2026-09-12.md) remain open.
