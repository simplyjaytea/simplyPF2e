# HANDOFF.md — live session baton

Read this first, then CLAUDE.md. Detailed evidence: [docs/consumer-readiness-2026-09-08.md](docs/consumer-readiness-2026-09-08.md).

## Published and installed

- PR #105 UI overhaul: source `23bb97a`, merge `ee584e2`, v0.3.5.65.
- PR #106 Forge aliases/copy: source `6abf2ac`, merge `6f82c30`, v0.3.5.66.
- PR #107 generation controls, ABC validation, initial busy rendering and failed-token accounting: source `bfd698d`, merge `16f9745`, CI34238059322 / release34238176018 successful, v0.3.5.67.
- PR #108 native kit expectations / zero-budget currency: source `ee52c91471fe87fa3ca80e11246ec161b9d1649e`, merge `425e9339faf0a6b52099fa63c42fb2600b9986ee`, CI34241316182 / release34241400856 successful, **v0.3.5.68**, both release assets verified.
- Setup updated **only SimplyPF2e** after every release and relaunched the existing `test` world. Current installed **0.3.5.68**; Foundry **14.365**, PF2e **8.5.0**, provider settings preserved.
- User authorization persists: **push/merge through PR after checks, then update SimplyPF2e through Foundry**. Never direct main writes; do not ask again for the already authorized route.

## Current work and exact next step

- Branch `codex/consumer-final-qa`, based on `origin/main` `425e933`; local main stale, unique older `codex/consumer-readiness` preserved. Git is authoritative.
- All runtime slices are published and independently Astra-approved. Luna handled bounded UI, ABC, currency and accounting; Terra handled lifecycle, Forge identity and native kits. Final parent Node22 gate: **86 regressions / 121 syntax checks**, JSON/duplicate keys and whitespace; `.git/consumer-native-final-node22.log`.
- .68 Fighter passed native creation, full HP, flat-kit expansion and zero currency. Requested Rogue instead yielded a valid native Investigator: class/name/key-ability fidelity failed. A focused Rogue retry failed closed late at83%; required ABC membership is not checked until after downstream spend. Luna implemented the early selector-boundary rejection/localization; root completed the production regression. Parent gate passes86regressions/121syntax/JSON/whitespace; Astra approved the final slice with no blocking findings. Next: follow-up PR/CI/release/Foundry update. A small .68 single-member encounter passed native creation and empty holdings/spells; no provider run is active.
- Root integrated Luna’s docs/runtime changes and owns final verification/publication and browser QA. All agents are read-only or stopped and Astra has approved the final audit. Keep .68 live passes version-specific. Reset temporary viewport at completion.

## Installed evidence and preserved artifacts

- .65 provider/draft retention and active close/reopen passed. No-gear NPC and long-ID Forge trials failed closed, no documents.
- .66 **+1 Ghost Touch Longsword**, `Item.tFgwn9t2X9sJ5Uks`: native level4/common/110gp, +1/GhostTouch/noStriking. **+1 Slick Chain Shirt**, `Item.nHUw36mL1umsIl99`: level5/common/205gp, +1/Slick/noResilient. Preview/native parity passed.
- .66 **Consumer Balm Charm**, `Item.VyS6JrJ2RMkPbd9G`, companion `Macro.APHICPnePyZHziV5`: level4/common/75gp, invested two-action2d6 healing1/day.
- .66 **Consumer Lantern Keeper**, `Actor.9pViFDJTsJUCmNIP`: full20HP/fist/no spells, but no-gear/no-loot text FAILED. Provider added holdings. .66 Fighter stopped at ABC validation mismatch and created no PC.
- .67 enforced equipment/treasure switches passed: `Actor.1ORKYsTmXtnO5zBW` **Lantern Keeper**,20/20HP, empty native inventory and0gp. Narrative fidelity still failed (changed name, LanternBash/darkvision/narrativeRaiseAlarm);10,446tokens/39seconds.
- .67 Fighter passed ABC/15-of-15 grounding then rolled back on consumed-kit expectation; native inventory preview also had60gp despite0lootbudget. Both root causes fixed in .68.60,739tokens/104seconds; no Kaelen Voss actor remains.
- .67 Forge immediate cancellation passed17%, restored controls/prompt, no item; independent Fighter continued through native creation. Two preview-only timing runs completed before cancel (2,173+2,144tokens), no items.
- .67 charm native activation/depletion/rest passed on new manually created blank **QA Consumer Activation**, `Actor.TsacxBU34OJIaSLa`, embedded charm `Item.2Y6igd9rh55M2X5y`:2d6=7, depleted message, native rest,2d6=4. No ApplyHealing clicked. GM original blank character assignment restored.
- Native world Duplicate created `Item.E277US9VCMgYA3kV` **Consumer Balm Charm (Copy)**. Attempts to embed a second copy via browser drops did not create a second observed actor item; copy activation acceptance remains incomplete. Preserve copy/original/macro.
- .68 Fighter `Actor.tGJ7V0WmT4iNvMJn` **Bren Blackthorn**: Human/Guard/Fighter,21/21HP AC17 Str4,3/3additional trained; longsword+shield held and chainmail worn. Cartographer’s Kit expanded five exact leaves qty1; currency0gp, gearwealth60.55gp under existing overspend policy.129sec50,010tokens. Heritage blank under optional-heritage contract; name/kit request fidelity failed.
- .68 requested Rogue yielded `Actor.W3KnL25GUo74J80O` **Kaelen Voss**, native Investigator/Interrogation with class grants,16/16HP AC14 Int4/Dex0/Str3,8/8extra trained,1.5gp currency/14.17gp wealth. Natural Ambition choice That’s Odd completed.264sec61,845tokens. This passes native Investigator path only; requested Rogue/Thief/Dex/name fidelity failed.
- .68 focused Rogue retry: no actor,83%59sec36,184tokens, late exact class-ref rejection. Preliminary permissive class resolution had passed; malformed/unoffered ABC ID is likely, raw reply unavailable. The proven selector-boundary validation gap is the bounded follow-up.
- .68 small encounter `Actor.pVOyzfvNBrxXrUsL` **Cellar Matriarch**, in same-name folder: party2/level1/Moderate, native creature1,20/20HP AC15, empty inventory and0gp, no spells, Narrative: Swarmed.35sec11,609tokens; no combat or multi-member acceptance inferred.
- Preserve all earlier QA actors/items/macros/tokens/chat including QA <b>Actor</b>, QA Caster, both Clockwork Moth Scouts, QA Audit items/Dock Watchman and these new artifacts. No new token placements; temporary character assignment restored.
- Known provider spend lower bound after .68 Fighter, Investigator and failed Rogue retry: **294,271 tokens** (failed .66 ABC spend unavailable; cancellation downstream billing unknown). Exact metadata: `.git/consumer-release-results.json`.

## Browser/environment

- CUA only for browser interaction. Browser1/tab2, `https://foundry-test.gigaserver.xyz/game`, GM signed in. Provider `omniroute / auto/best-free` authorized for QA; never expose/replace credentials.
- Temporary viewport1280×960 currently active. Default viewport378×982 is below Foundry’s1024×768 requirement; it was briefly restored, then overridden again to finish native actions. **Reset at completion.**
- Failed temporary tab3 is policy-blocked to select/close; do not retry. Fixture server/tab stopped.
- Node22 `/home/jtf/.local/share/mise/installs/node/22.23.2/bin/node`. `gh` hangs; gitpush/GitHub connectors work.
- Ignored local `module.zip` is stale .64.1 verification archive, not current official release; never install it.

## Limits retained

Flat-kit native expansion passed; nested backpack quantities/container links remain unverified. Existing equipment-alone overspend policy keeps starting gear with warning. Exact narrative fidelity, Rogue and broader supported-PC/multi-member encounter acceptance, duplicate-copy activation and full screen-reader behavior remain unproven until recorded. Existing saved companion commands are not migrated; cross-client charges are not atomic. Unsupported classes and level2+ FreeArchetype stay gated; no general rune prerequisite engine or shield/ammunition forging.
