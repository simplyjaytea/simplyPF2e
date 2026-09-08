# HANDOFF.md — live session baton

Read this first, then CLAUDE.md. Detailed evidence and acceptance checklist: [docs/consumer-readiness-2026-09-08.md](docs/consumer-readiness-2026-09-08.md).

## Current session — 2026-09-08 consumer UI and installed QA

- **Published/installed:** PR #105 merged as `ee584e2f3ac54d5044c9363689f4e5991fa03720`, source `23bb97a72d1fde579ec89373ace15588c65bddee`. PR CI 34231115320 and Auto Release 34231202994 succeeded. Release **v0.3.5.65** has both assets. Foundry Setup updated only SimplyPF2e from .64 to **.65**, then relaunched the existing `test` world on Foundry **14.365 / PF2e 8.5.0**.
- **Working branch:** `codex/consumer-live-qa`, created from merged `origin/main` `ee584e2`. Local main is stale; preserve unique `codex/consumer-readiness`. Git is authoritative.
- Shared refined fantasy UI, SVG rune progress, continuous generation/create lifetime, cancellation/busy guards, exact Forge source identities and native prepared previews shipped in #105. Luna/Terra implemented bounded slices; explicit **gpt-6-astra** approved every completed slice. Parent and Astra gates passed **85 regressions / 120 syntax checks** on Node22, JSON and whitespace. Native-template browser fixtures covered widths/themes/reduced-motion cascade; not a substitute for installed mechanics QA.
- The user explicitly requested **push/merge, then update SimplyPF2e through Foundry**. Authorization persists for the follow-up fixes. Always branch + PR and wait for CI/automatic release; never direct main writes. Update only this module; preserve provider configuration, core/system versions and world data.

## Live evidence and active follow-up

- Installed provider probe passed (705 tokens). Prompt text typed during the pending probe and focus were retained. Closing/reopening Generator during a request retained run identity, elapsed time and expanded details.
- NPC1 no-gear/no-loot Lantern Keeper request failed closed before actor creation on five ungrounded equipment names (17,990 tokens), at80%. Original brief reaches selector; explicit empty selection is supported. Raw response was not captured, so precise provider failure is unknown. Luna clarified conditional gear guidance/issued IDs; Astra approved prompt/test slice with no findings. Runtime decoding remains fail closed.
- Weapon4 Ghost Touch Longsword plan failed closed at77% (17,837 tokens). Warning names unoffered base ID `c-cGYyZS5lcXVpcG1lbnQtc3JkAE1kY0xKb0VabG9IWE1XbVI`. Terra traced correct current schema and exact-catalog check; no name fallback or reference loss. Terra implemented short AI-only Forge aliases with exact local reverse mapping, following the existing feat encoder pattern. Unknown/wrong-group/old opaque IDs fail closed. Rejected response usage is retained and recorded once. Astra approved the final alias/accounting slice with no remaining findings.
- Three localization corrections (Generator/Forge empty hints and shared creation-stage wording) are implemented; Astra approved with no findings.
- Provider usage so far **36,532 tokens**; no new actor/item/macro was created by these checks. Both failed results preserved prompts and reenabled controls. This is not successful generation acceptance.

## Exact next step

All follow-up slices are complete and Astra-approved. Parent final Node22 gate passed 85 regressions, 120 syntax checks, both JSON files including duplicate keys, and whitespace. Commit/push the follow-up PR, wait for CI and merge. Verify automatic release, update only SimplyPF2e in Setup, relaunch `test`, and retry focused NPC/Forge acceptance. Record results honestly; do not claim full public readiness while required native checks fail or remain untested.

## Browser and preserved data

- GM browser: `https://foundry-test.gigaserver.xyz/game`, in-app browser1/tab2. Server administrator authentication previously worked. All browser interaction through CUA.
- Temporary viewport override1280×960 must be reset before completion. Fixture server stopped, fixture tab closed. Failed temporary tab3 cannot be selected/closed through Browser Use URL policy; do not keep retrying it.
- Existing connection `omniroute / auto/best-free` is authorized for QA; do not expose or replace credentials/settings.
- Preserve all actors/items/macros/tokens/chat, including `QA <b>Actor</b>`, QA Caster, both Clockwork Moth Scouts, prior QA Audit items and Dock Watchman. No deletion of QA artifacts.
- `.git/consumer-release-results.json` holds exact release data; `.git/consumer-node22.log` holds previous final checks. Ignored local `module.zip` is a stale prerelease .64.1 verification archive, not official .65; never install it.

## Material limits

- Installed acceptance remains incomplete: successful NPC/encounter/no-gear/no-loot, all Forge kinds/native price parity, activation/rest/copies, supported Fighter/Rogue/Investigator grants/feats/loadout, and revised cancellation isolation.
- Existing companion commands are not migrated. Same-client charges are not cross-client atomic. Source screening and custom activation balance are conservative module defaults.
- Unsupported classes and level2+ Free Archetype stay gated. No general rune prerequisite engine; material-restricted armor/shields/ammunition forging remain excluded. Scroll loot requires spell sources and scaffolding requires bestiary sources.
