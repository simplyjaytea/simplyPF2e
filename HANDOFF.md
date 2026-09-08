# HANDOFF.md — live session baton

Read this first, then CLAUDE.md. Detailed current evidence and installed acceptance checklist: [docs/consumer-readiness-2026-09-08.md](docs/consumer-readiness-2026-09-08.md).

## Current session — 2026-09-08 consumer UI

- Branch `codex/consumer-ui-release`, based on public `origin/main` `89f9a35` / PR #104 / **v0.3.5.64**. Local main is stale. Older unique branch `codex/consumer-readiness` is preserved; do not reset it.
- Implemented shared refined fantasy light/dark UI, provider feedback, auxiliary apps, animated SVG rune loading card, continuous one-click run lifetime, accurate stage/terminal states, cancellation/close behavior, duplicate-run/write prevention, exact Forge source identities, and native prepared preview metadata. See the report for scope, native-source references, audit fixes, and retained limitations.
- Luna handled UI; Terra handled Forge/app integration. Explicit **gpt-6-astra** reviewer independently approved core, application lifecycle and final UI slices with **no remaining actionable findings**. Final independent Node **22.23.2** gate passed **85 regressions, 120 script syntax checks, both JSON files, and whitespace**. All review findings and lost semantic-test coverage were fixed/rechecked.
- Parent final Node22 gate also passed 85 regressions, 120 syntax checks, both JSON files (including duplicate-key detection), and whitespace. Candidate ZIP contains 47 release entries, including the new provider partial and no tests.
- Parent browser fixture used actual templates and native CSS layers at 360/480/720px, light/dark, long labels, short height and keyboard navigation. Corrected nested outer scrolling, shrinking progress cards and reduced-motion CSS specificity. Forced reduced-motion stylesheet branch computes all decorative animations `none` and transition `0s`. Fixture evidence is not installed ApplicationV2 or PF2e acceptance.
- The user instructed **push and merge, then update SimplyPF2e through Foundry**. This authorizes the branch/PR publication and module-only update. Do not push/merge directly to main. No revised-code installation or public release has occurred yet in this session. The previous question about manual candidate installation is superseded by the user-requested release/update route.

## Exact next step

Finish the parent verification gate, commit the complete branch, push it, create the PR with explicit outstanding live-QA limits, wait for required CI, merge the PR, and verify automatic release assets/version. Then return the test Foundry server to Setup and update **only SimplyPF2e** through its manifest; relaunch the same world and run the installed checklist. If Setup requests administrator authentication that is not available, ask the user to complete that login and continue. Record exact PR/release/installed versions and live evidence at session end.

## Test world and preserved data

- Existing logged-in GM world: `https://foundry-test.gigaserver.xyz/game`. The server module manifest currently reports **SimplyPF2e 0.3.5.64**; last recorded native baseline evidence was **0.3.5.63** on **Foundry 14.365 / PF2e 8.5.0**. No world/core/system update or provider call occurred during current local QA.
- Existing connection `omniroute / auto/best-free` may be used for the authorized QA. Do not expose or replace keys/settings.
- Preserve all previous actors/items/macros/tokens/chat, including `QA <b>Actor</b>`, `QA Caster`, both Clockwork Moth Scouts, earlier forged items and companion macros.
- Prior audit artifacts: `Item.4zojkUhnP0mA7hWm` **QA Audit — Ghost Touch Longsword**; `Item.OcXYMsSWCyKluKdn` **QA Audit — Slick Chain Shirt**; `Actor.VsI4lYxCL0DbvVRq` **QA Audit — Dock Watchman**. No new native documents have been created in this session so far.
- Temporary local fixture: `/tmp/simplypf2e-ui-qa/server.cjs` on port8765; it contains no credentials or module runtime dependency. Temporary browser viewport must be reset at completion.

## Material limits

- Revised-code live acceptance is outstanding: all three Forge kinds, new activation/rest/copy cases, cancellation isolation/close-reopen, creature/encounter no-gear/no-loot, Fighter/Rogue/Investigator native grants/feats/gear.
- Existing companion commands/mechanics are not migrated. Same-client charge guards do not provide cross-client atomicity. Passive screening remains conservative and custom activation benchmarks are module defaults, not official custom-item balance.
- Unsupported classes and level2+ Free Archetype remain gated. Rune prerequisites/exclusivity are not a general engine; material-restricted armor, shields and ammunition forging remain excluded. Spell sources are still needed for scroll loot and bestiary sources for scaffolding.
