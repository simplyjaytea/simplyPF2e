# HANDOFF.md — live session baton

Read this first, then CLAUDE.md. Use the [documentation map](docs/README.md) for source records and historical evidence.

## Current work — 2026-09-15 native PC follow-up

- Branch: codex/pc-native-acceptance, based on PR #112 merge df8d53040027e7f1f3655b09085dd87bb2695694. User authorized merging the identity slice and continuing work; #112 merged after successful CI34865591818. Auto Release34865642787 published v0.3.5.72. Luna verified both official asset hashes and all 50 packaged files.
- Updated only SimplyPF2e from .71 to .72 through Setup, relaunched existing test world and rejoined Gamemaster. Foundry14.365/PF2e8.5.0 and omniroute / auto/best-free remain unchanged. Source counts: 77 Monster packs / 12 Character packs. Installed version observed; installed byte parity not independently established.
- User approved up to two QA generations, stopping at first unexpected failure. ONE run completed: QA Native Thief, Actor.W6CEjvm7ABmNlCI2, 26,839 reported tokens / 2:48 including dialogs. Exact Human/no heritage/Guard/Rogue/Dexterity/Thief and literal name retained; native Thief source, grants,17/17HP,AC18,8/8additional training passed. Guard Lore was missing. No second generation is authorized under the stop-on-failure condition without renewed budget approval. Cumulative known provider spend lower bound:333,213tokens.
- Arcane Tattoos and Assurance required native dialogs; selected Shield and Thievery. No native spellcasting entry was created. User explicitly chose KEEP spellcasting behavior and clarify its label. Local Character label is now Generate spell lists with an accessible explanation that native feats can still grant magic/choices. Other modes retain their label.
- Local follow-up adds an explicit Guard Background Lore choice, source-bound Legal/Warfare options, early rejection before avoidable spending, source validation, concrete Lore prerequisite context/native embedding, preview display and stale-choice protection. Automatic/Random background catalogs omit Guard without this choice. Other concrete source Lore remains supported; arbitrary prose-only background choices remain unsupported. No invented Rule Elements or extra provider calls.
- Luna implemented bounded helper/identity/UI slices; parent integrated generator/builder, production regression fixtures, tests and evidence. Independent identity_review approved final diff after correcting non-Guard selection handling ahead of missing-Lore returns. Live acceptance of the follow-up is still pending. Final Node22.23.2 gate passed 96 regression files, 135 script syntax checks plus one tooling check, JSON and whitespace.

## Exact next step

The reviewed follow-up and evidence are committed on this named branch. Obtain authorization for this new authenticated GitHub publication (push/PR/merge auto-publishes) and a fresh bounded QA run. The previous authorization published #112; do not treat it as unlimited release/spending permission. Never write main directly. After release verification/module-only installation, recheck a level-1 Guard/Thief with explicit Legal or Warfare Lore; inspect native trained Lore and then proceed to higher-level acceptance only within the renewed budget and stop conditions.

Broader steps2–8 and cache acceptance remain open; see [completion plan](docs/completion-plan-2026-09-15.md). Ordinary UI cannot prove internal cache coalescing; Luna prepared a checklist but no source settings were changed. Native NPC combat, multi-member encounters, nested kits, duplicate activations, focus and screen-reader checks are still pending.

## Preserved environment and artifacts

- Preserve QA Native Thief and every earlier actor/item/macro/token/chat in [live inventory](docs/live-qa-inventory.md). No cleanup or combat writes occurred. Browser remains in test world with the actor's Feats sheet open. Temporary1280×900viewport was RESET. User's second GitHub tab remains untouched.
- Source/implementation/publication/native evidence: [PC identity record](docs/pc-identity-2026-09-15.md). Real unchanged Guard8.5/master fixtures live under tests/fixtures/pc-backgrounds; excluded from release assets.
- Node22: /home/jtf/.local/share/mise/installs/node/22.23.2/bin/node. gh hangs; use public API reads, connected GitHub write tools and git push after authorization. Git identity jt / jt_f@ymail.com.
- .72 verified assets: /tmp/simplypf2e-72.2Mh72A. Ignored local module.zip is an old artifact; preserve and never install it. Preserve user-owned .claude/ and branches with unique work.
