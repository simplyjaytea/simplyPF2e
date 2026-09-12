# HANDOFF.md — live session baton

Read this first, then CLAUDE.md. Detailed evidence: [docs/consumer-readiness-2026-09-08.md](docs/consumer-readiness-2026-09-08.md).

## Published and installed

- PR #105 UI overhaul: source `23bb97a`, merge `ee584e2`, v0.3.5.65.
- PR #106 Forge aliases/copy: source `6abf2ac`, merge `6f82c30`, v0.3.5.66.
- PR #107 generation controls, ABC validation, initial busy rendering and failed-token accounting: source `bfd698d`, merge `16f9745`, CI34238059322 / release34238176018 successful, v0.3.5.67.
- PR #108 native kit expectations / zero-budget currency: source `ee52c91471fe87fa3ca80e11246ec161b9d1649e`, merge `425e9339faf0a6b52099fa63c42fb2600b9986ee`, CI34241316182 / release34241400856 successful, **v0.3.5.68**, both release assets verified.
- PR #109 early ABC rejection and public readiness documentation: source `165d25e551408af8e1a40910d18ea2a97396c586`, merge `dcd19fdd816ccaa6ca04efb0b3655127c654178e`, CI34245166276 / release34245250286 successful, **v0.3.5.69**, both assets verified.
- PR #110 automatic NPC prerequisites: source `55bbccd68c8eeec7ebf1408d7fadc86760e774bb`, merge `d17a2b507070ed5f403a7bb70176b335f139f7fc`, CI **34257060796** / release **34257313518** successful, **v0.3.5.70**. Both release assets verified by SHA-256; all 48 archive files match the merge except the expected stamped manifest. Installation and one bounded focused native QA run succeeded.
- Setup updated **only SimplyPF2e** from **0.3.5.69** to **0.3.5.70** and relaunched the existing `test` world; the update succeeded with a visible toast and GM was rejoined. Foundry **14.365**, PF2e **8.5.0**, provider `omniroute / auto/best-free`, and **77 ready packs** are preserved.
- User authorization persists: **push/merge through PR after checks, then update SimplyPF2e through Foundry**. Never direct main writes; do not ask again for the already authorized route.

## Current session — 2026-09-12 ship-readiness review

- User asked whether the repo is ready to ship. Assessed public **v0.3.5.70** / `d17a2b5`; the initial local main was 20 commits behind. Created `codex/ship-readiness-2026-09-12` from fetched origin/main and fast-forwarded the existing documentation-only QA history through `c8e06d3`. Runtime code is unchanged from the published release.
- Verdict: **suitable for a GM-reviewed beta on exercised paths**. Dependable requested-PC generation and broad native acceptance remain incomplete. Details and priorities: [ship-readiness assessment](docs/ship-readiness-2026-09-12.md).
- Fresh checks: all **88 regression files**, **124 script syntax checks**, manifest/localization JSON and whitespace passed on **Node 22.23.2**. Public PR CI34257060796 and Auto Release34257313518 succeeded. Both release asset SHA-256 digests matched GitHub; all **48 archive files** match the release selection and source bytes apart from expected manifest stamping. No open PRs were returned.
- Independent reviewer `release_mechanics_review` reviewed the latest NPC package diff, fetched real master and installed-era native sources, and reported no new actionable P1/P2 findings against PF2e8.5.0. This is bounded code/source review, not universal native rules acceptance.
- No runtime changes, new provider spend, Foundry access/update/world mutation, authenticated GitHub write, or release occurred in this review. Existing publication authorizations above are historical context; this task assessed readiness and leaves its report local.
- Exact next step: make essential requested PC choices authoritative or review substitutions before creation, then obtain a successful native Rogue/racket run and representative higher-level coverage. Follow with multi-member encounter/cleanup, target-save/combat-turn/condition application for the new NPC package, nested-kit and duplicate-copy activation checks. Preserve all listed QA artifacts and the explicit exclusions below.
- v0.3.5.70 implementation, publication, module-only installation and the earlier bounded native NPC QA are complete; do not repeat the stale instruction to publish PR #110. Existing detailed mechanics/source findings are retained in [the implementation record](docs/npc-automatic-abilities-2026-09-09.md), CLAUDE.md and HISTORY.md.

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
- .70 focused modified NPC15 run created **Innkeeper Veyra**, `Actor.jNqHlGaZ2W1mpepB`: native NPC sheet 275/275HP, AC37, 67sec, provider-reported 12,103 tokens, and no prerequisite dialogs. Exactly one **Flurry of Blows**, `Item.eYAHuup1FYiLDAD1`, persisted from `Compendium.pf2e.actionspf2e.Item.nbfNETdpee8CVM17`; **Stunning Blows**, `Item.9jmKiWMVn0gVqeFj`, had a working toggle. The module supporting **Unarmed Strike**, `Item.p1lAOuYvRoAhUHpT`, was agile/nonlethal/unarmed at +28 with 3d8+17 damage (MAP +24/+20). Provider-supplied Fist +30 lacked the unarmed trait and is not counted as the supported strike; Thrown Tankard +28 and two labeled narrative abilities were also present. Stunning Blows showed a native DC34 Fortitude link, incapacitation metadata and Stunned 1/3 links to `Compendium.pf2e.conditionitems.Item.dfCMdR4wnpbYNTix`; the supporting strike damage roll was 3d8+17 = 35 through the standard dialog. The Stunned 1 link opened the native condition sheet with full text. No damage or condition was applied, and target-save/combat-turn behavior was not tested.
- Preserve all earlier QA actors/items/macros/tokens/chat including QA <b>Actor</b>, QA Caster, both Clockwork Moth Scouts, QA Audit items/Dock Watchman and these new artifacts. No new token placements; temporary character assignment restored.
- Known provider spend lower bound after .68 Fighter, Investigator, failed Rogue retry, and .70 focused NPC run: **306,374 tokens** (failed .66 ABC spend unavailable; cancellation downstream billing unknown). Exact metadata: `.git/consumer-release-results.json`.

## Browser/environment

- CUA only for browser interaction. Current browser1/tab5, `https://foundry-test.gigaserver.xyz/game`, GM signed in. A fresh read-only inspection confirmed .70 / PF2e8.5.0 / Foundry14.365 with **77 ready packs**. Provider `omniroute / auto/best-free` authorized for QA; never expose/replace credentials.
- Temporary 1280×960 viewport override was reset after QA; the browser is back at its default viewport.
- Failed temporary tab3 is policy-blocked to select/close; do not retry. Fixture server/tab stopped.
- Node22 `/home/jtf/.local/share/mise/installs/node/22.23.2/bin/node`. `gh` hangs; gitpush/GitHub connectors work.
- Ignored local `module.zip` is stale .64.1 verification archive, not current official release; never install it.

## Limits retained

Flat-kit native expansion passed; nested backpack quantities/container links remain unverified. The .70 NPC run was a bounded modified replay with spellcasting, equipment and treasure disabled; its summary reported compendium4/module-built currency/scrolls1/narrative2, without an inventory inspection. No target-save/combat-turn or condition-application test was performed. Existing equipment-alone overspend policy keeps starting gear with warning. Exact narrative fidelity, Rogue and broader supported-PC/multi-member encounter acceptance, duplicate-copy activation and full screen-reader behavior remain unproven until recorded. Existing saved companion commands are not migrated; cross-client charges are not atomic. Unsupported classes and level2+ FreeArchetype stay gated; Crane Stance, Deflect Projectile, arbitrary class resources/choices, no general rune prerequisite engine, and no shield/ammunition forging remain out of scope.
