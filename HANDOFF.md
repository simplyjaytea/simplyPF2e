# HANDOFF.md — live session baton

Read this first, then CLAUDE.md. Detailed evidence: [docs/consumer-readiness-2026-09-08.md](docs/consumer-readiness-2026-09-08.md).

## Published and installed

- PR #105 UI overhaul: source `23bb97a`, merge `ee584e2`, v0.3.5.65.
- PR #106 Forge aliases/copy: source `6abf2ac`, merge `6f82c30`, v0.3.5.66.
- PR #107 generation controls, ABC validation, initial busy rendering and failed-token accounting: source `bfd698d`, merge `16f9745`, CI34238059322 / release34238176018 successful, v0.3.5.67.
- PR #108 native kit expectations / zero-budget currency: source `ee52c91471fe87fa3ca80e11246ec161b9d1649e`, merge `425e9339faf0a6b52099fa63c42fb2600b9986ee`, CI34241316182 / release34241400856 successful, **v0.3.5.68**, both release assets verified.
- PR #109 early ABC rejection and public readiness documentation: source `165d25e551408af8e1a40910d18ea2a97396c586`, merge `dcd19fdd816ccaa6ca04efb0b3655127c654178e`, CI34245166276 / release34245250286 successful, **v0.3.5.69**, both assets verified.
- Setup updated **only SimplyPF2e** after every release and relaunched the existing `test` world. Current installed **0.3.5.69**; Foundry **14.365**, PF2e **8.5.0**, provider settings preserved.
- User authorization persists: **push/merge through PR after checks, then update SimplyPF2e through Foundry**. Never direct main writes; do not ask again for the already authorized route.

## Current work and exact next step

- New task: user reported level-15 NPC grounding failure for Crane Stance, Deflect Arrow and Stunning Blows; asked for an all-class solution and emphasized the NPC sheet's feat limitations. This session is investigation/design only. Plan: [docs/npc-feat-plan-2026-09-09.md](docs/npc-feat-plan-2026-09-09.md).
- Branch `codex/npc-feat-plan` starts from the locally committed final .69 QA records. No runtime edits, provider requests, Foundry writes, or publication in this task. .69 remains installed; the earlier UI/generation work and all its implementation audits are complete.
- Luna verified that NPC selection already scans enabled class-feat sources across classes and prioritizes exact draft names before the16-entrycap. Empty catalogs, selection errors, or all-invalid nonempty replies retain draft names; final exact matching blocks. No raw reply/catalog snapshot is available to identify this run's precise branch.
- Terra verified installed PF2e8.5.0/master sources; parent independently fetched key files. Crane Stance1, Stunning Blows2 and Deflect Projectile4 are below NPC15. Deflect Arrow is name drift. PF2e rejects raw feats on NPCs; current featToAction already converts them, but conversion loses feat-specific preparation/rolloptions and cannot safely retain GrantItem→feat. Stunning Blows needs Flurry of Blows and DC context; source grounding alone is insufficient.
- User now prefers no manual consumer setup and authorizes automatic prerequisite grants for generated NPCs. Revised slices: reliable source selection; complete verified dependency packages including supporting abilities/effects/resources; prefilter buildable packages and bounded automatic reselection for AI suggestions. No manual-reference output mode. Unsupported explicit requirements still fail before writes; do not silently substitute or infer authorization from the provider. Work across classes through common mechanics; full PC-feat automation is not yet implemented.
- Astra approved the earlier diagnosis/design, including source admission identity, atomic invalid replies and compatibility release gate. Astra reviewed the user-directed automatic-dependency revision; its two wording clarifications are applied and no other design blockers were reported. Actual Flurry has a native action source distinct from its PC-only class-feature feat, verified by Terra/parent; the action has no REs, so adding it alone is not automated Stunning Blows. Next: implement the revised design if requested. Do not treat diagnosis as a proven reconstruction of the missing provider response.

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
- Temporary viewport1280×960 was reset at completion. Default viewport378×982 is below Foundry’s1024×768 requirement; retain that context when assessing the narrow embedded browser.
- Failed temporary tab3 is policy-blocked to select/close; do not retry. Fixture server/tab stopped.
- Node22 `/home/jtf/.local/share/mise/installs/node/22.23.2/bin/node`. `gh` hangs; gitpush/GitHub connectors work.
- Ignored local `module.zip` is stale .64.1 verification archive, not current official release; never install it.

## Limits retained

Flat-kit native expansion passed; nested backpack quantities/container links remain unverified. Existing equipment-alone overspend policy keeps starting gear with warning. Exact narrative fidelity, Rogue and broader supported-PC/multi-member encounter acceptance, duplicate-copy activation and full screen-reader behavior remain unproven until recorded. Existing saved companion commands are not migrated; cross-client charges are not atomic. Unsupported classes and level2+ FreeArchetype stay gated; no general rune prerequisite engine or shield/ammunition forging.
