# HANDOFF.md — live session baton

Read this first, then CLAUDE.md. Detailed evidence: [docs/consumer-readiness-2026-09-08.md](docs/consumer-readiness-2026-09-08.md).

## Published and installed

- UI overhaul: PR #105, source `23bb97a`, merge `ee584e2`, CI 34231115320 / release 34231202994 successful, **v0.3.5.65**.
- Forge short aliases / prompt-copy follow-up: PR #106, source `6abf2ac`, merge `6f82c30132cdf91956ca13461da7254d956d00b3`, CI 34233281229 / release 34233487888 successful, **v0.3.5.66**. Both release assets verified.
- Setup updated **only SimplyPF2e** .64→.65→.66→.67 after the releases, and relaunched the existing `test` world each time. Current installed version **0.3.5.67**, Foundry **14.365**, PF2e **8.5.0**. Core/system/provider settings preserved.
- User authorization persists: **push/merge through a PR after checks, then update SimplyPF2e through Foundry**. Never direct main writes. Do not ask again for the already authorized module-only route.

## Current work

- Branch `codex/consumer-native-completion`, based on merged `origin/main` `16f9745`; local main stale, unique older `codex/consumer-readiness` preserved. Git is authoritative.
- Implemented authoritative Include equipment / Include treasure switches for Monster/NPC/Encounter, covering selectors, resolution, budgets and rerolls; Character unchanged. Astra found/fixed stale resolved equipment and error text in disabled-loot reroll.
- Fixed ABC validator requiring old name fields while the real prompt/decoder emits IDs. Nullable heritage and key-ability enum now match; new production request regression covers valid exact refs and bounded legacy rejection. Astra reviewed all other validated task contracts and found no further concrete mismatch.
- Fixed same-row-count completed NPC→PC progress reuse leaving old controls/completion visible. Shared SpfApp forces one full render at the first stage of every new run, then keeps incremental painting.
- Luna handled UI/ABC; Terra handled enforcement/rendering. Explicit **gpt-6-astra** independently approved each finished slice. Parent Node22 gate passed **86 regressions / 121 syntax checks**, both JSON files/duplicate keys and whitespace. Luna completed Generator failed-response token accounting, including tolerated failures; Astra approved the delta with no findings. Final parent gate passed all 86 regressions / 121 syntax checks, JSON/duplicate keys and whitespace; log `.git/consumer-controls-final-node22.log`.

## New installed blockers

- .67 NPC enforced empty holdings passed; Actor.1ORKYsTmXtnO5zBW Lantern Keeper has empty inventory/0gp/20HP, but provider still altered narrative/mechanics. 10,446 tokens.
- .67 Fighter passed ABC and15/15 grounding then failed post-create verification expecting kit Adventurer Pack to persist; native kits expand into contents. Terra implemented exact physical-leaf expectations before native writes; Astra approved with no blocking findings. Creation rolled back. 60,739tokens/104seconds.
- PC preview coin rows totaled60gp; Luna fixed selector coin duplication, zero-budget currency retention and unnecessary extra purchase request. Astra approved with no findings; final Node22 parent 86/121 +JSON/duplicates/whitespace passed.
- Immediate Forge cancellation passed at17%, no item, simultaneous Fighter continued; two completed preview-only timing attempts spent2,173+2,144tokens and wrote no item.

## Exact next step

PR #107 source `bfd698d` merged as `16f9745282c44f306071e0b81e43ba05186830e9` after successful CI 34238059322. Auto Release 34238176018 succeeded and published v0.3.5.67 with both release assets. Setup installed SimplyPF2e 0.3.5.67 and relaunched test. Enforced creature holdings, ABC, initial busy rendering, cancellation isolation and charm activation/rest now have installed evidence. Both kit and coin slices are complete and Astra-approved. Commit/push native-completion, create PR, wait CI, merge/verify automatic release, update only SimplyPF2e in Setup, then recheck native Fighter completion/kit contents. Other PC/encounter and duplicate-copy acceptance must remain unclaimed until tested. Record release/installed versions and final artifacts, then leave clean/committed named branch and reset temporary viewport.

## Installed QA results and preserved artifacts

- .65 provider test/draft focus retention and active Generator close/reopen passed. NPC no-gear failed closed on unresolved equipment; weapon failed closed on unoffered long ID. No documents created on .65.
- .66 weapon **+1 Ghost Touch Longsword**, `Item.tFgwn9t2X9sJ5Uks`: preview/native level 4/common / 110 gp, +1/Ghost Touch, no Striking; 4,410 tokens.
- .66 armor **+1 Slick Chain Shirt**, `Item.nHUw36mL1umsIl99`: preview/native level 5/common / 205 gp, +1/Slick, no Resilient; 2,056 tokens.
- .66 **Consumer Balm Charm**, `Item.VyS6JrJ2RMkPbd9G`: created with companion Activate macro link, native level 4/common / 75 gp, two-action 2d6 healing 1/day; 2,141 tokens. Owned/activated/rested on .67 as recorded below.
- .66 **Consumer Lantern Keeper**, `Actor.9pViFDJTsJUCmNIP`: one-click full 20/20 HP/fist/no spells; 10,793 tokens. No-gear/no-loot text FAILED: armor/lantern/manacles/oil and 14 gp. This is why explicit category switches were added. Preserve this actor without treating it as passed no-gear acceptance.
- .66 Fighter request stopped at ABC due proven validator mismatch, no PC created. UI reported only 3,189 completed-concept tokens, excluding unavailable failed ABC spend. Known session spend lower bound **134623 tokens**; exact release/results metadata in `.git/consumer-release-results.json`.
- Preserve all prior actors/items/macros/tokens/chat, including QA <b>Actor</b>, QA Caster, both Clockwork Moth Scouts, prior QA Audit items/Dock Watchman. No QA data deletion. No new token placements. Temporary QA character assignment was restored to original blank.

- Native charm activation/depletion/rest PASS on new blank QA PC `Actor.TsacxBU34OJIaSLa`, embedded charm `Item.2Y6igd9rh55M2X5y`: 2d6=7, depleted message, native rest, 2d6=4. GM character restored to original blank. No Apply Healing. Duplicate-copy native acceptance incomplete (drop attempts did not add second observed copy). Native world Duplicate did create `Item.E277US9VCMgYA3kV` Consumer Balm Charm (Copy); preserve it too.

## Browser/environment

- CUA only for browser interaction. In-app browser1/tab2 at `https://foundry-test.gigaserver.xyz/game`, GM logged in; Setup administrator authentication worked. Provider `omniroute / auto/best-free` authorized for QA; never expose/replace credentials.
- Temporary viewport 1280×960: reset at completion. Fixture server stopped/tab closed. Failed temporary tab3 is policy-blocked to select/close; do not retry.
- Node22 `/home/jtf/.local/share/mise/installs/node/22.23.2/bin/node`. Gate logs `.git/consumer-controls-node22.log`, `.git/consumer-followup-node22.log`, `.git/consumer-node22.log`.
- Ignored local `module.zip` is a stale .64.1 verification archive, not current official release. Never install it.

## Limits retained

Native grants/full PC loadout, final explicit category controls, activation/rest/copy handling and revised concurrent cancellation still need installed acceptance. Existing saved companion commands are not migrated; cross-client charges are not atomic. Unsupported classes and level 2+ Free Archetype stay gated. No general rune prerequisite engine or shield/ammunition forging; restricted material runes stay excluded. Spell sources remain necessary for scroll loot and bestiary for scaffolding.
