# Required PC identity — 2026-09-15

## Implementation delivered

The user authorized starting the completion plan, delegated suitable work to Luna, and selected **Use required choices; stop on ambiguity**. Branch `codex/pc-identity` extends the existing Generator → ABC selector → PC resolver → creation lifecycle. This is the first implementation slice, not completion of the whole roadmap or native acceptance.

- Required controls cover literal name, class, ancestry, heritage (including explicit none), background, key ability and supported racket/methodology. Mechanical controls select exact source keys; same-name sources remain distinct. Native class-path choices shared by multiple class sources are issued once with all picker class relationships retained.
- Separate `Name:`, `Class:`, `Ancestry:`, `Heritage:`, `Background:`, `Key ability:`, `Racket:`, `Methodology:` and `Class path:` lines/semicolon clauses support exact declarations. Duplicate/unknown/conflicting declarations fail. Recognized free-prose catalog names and identity markers require explicit choices; arbitrary language interpretation is not claimed. Random ignores the saved requirements and typed request.
- Required identity is module-owned and attached after provider concept normalization. Normalization drops any provider-injected requirement object. The original request accompanies later selection/refinement; required values constrain the ABC catalog and are checked again against the returned result. Failed selection retains billed usage and does not trigger downstream spending.
- Native preflight verifies current selected sources and compatible required ABC/key-ability/path choices. Required heritage never takes the legacy fallback. A path requires an explicit class. Resolution and creation both recheck the concept and prepared native documents against the requirements; deselecting a required source after preview stops creation. Changed required controls/request/rarity cap require a new preview.
- Default catalog deduplication remains unchanged for existing consumers; identity catalogs opt into distinct source entries. Class-path discovery reuses the existing enabled-source, single-tag, closed-descendant gate and the original cloned native rules.

## Division of work and review

Luna implemented the pure identity contract/tests, the native validation/class-path slice, and the source-distinct catalog follow-up. Parent traced behavior, defined the contract, integrated generator/selector/UI, added production lifecycle/selector tests, and consolidated final native guards.

Independent `identity_review` fetched real PF2e sources and reviewed the actual diff. Review found hidden duplicate ABC sources, deselected-but-installed preview sources, and duplicate path records when different class sources share one bridge. All three were fixed with production-path regressions. Final review approved with no remaining blockers; six focused checks and the final shared-path regression passed.

## Native source evidence

Retrieved from raw GitHub during this session:

- [Master class source shape](https://raw.githubusercontent.com/foundryvtt/pf2e/master/src/module/item/class/data.ts): `keyAbility: { value: AttributeString[]; selected: AttributeString | null };`.
- [Master heritage schema](https://raw.githubusercontent.com/foundryvtt/pf2e/master/src/module/item/heritage/data.ts): ancestry link has name/slug/UUID and is nullable. Existing `heritageMatchesAncestry` remains the compatibility owner.
- [Installed-era Rogue class](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/classes/rogue.json): base key ability is `dex`.
- [8.5.0 Rogue's Racket](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/class-features/rogues-racket.json): singleton `item:tag:rogue-racket` filter and native GrantItem selection reference.
- [Current master Racket](https://raw.githubusercontent.com/foundryvtt/pf2e/master/packs/classfeatures/rogues-racket.json): now has a second predicate expression. The existing simple-filter gate stays conservative; this change does not claim support for the newer complex predicate shape.
- [Master Thief](https://raw.githubusercontent.com/foundryvtt/pf2e/master/packs/classfeatures/thief.json): published classfeature carries the native Rogue path tag and its published rules. Required-path selection narrows the native offered values; it does not invent rules.

Path-granted key-ability alternatives such as Ruffian Strength remain explicitly unsupported here. A base-class key-ability rejection does not claim the build is illegal in PF2e; it identifies an unmodeled native path.

## Verification and pending native cases

Final local gate: Node 22.23.2 `tools/check.mjs`, all regression files, script/tooling syntax, manifest/localization JSON, and `git diff --check`. Counts and final result are recorded in HANDOFF.md. New production coverage includes source-distinct catalogs, declarations/controls, early wrong-class rejection and retained usage, no-heritage/key-ability constraints, stale controls, Random behavior, prepared native source/name/heritage drift, deselected installed sources, and shared class paths.

Native acceptance still required on the installed target after publication/installation:

1. Render required controls at a usable Foundry viewport; verify keyboard labels, changed/stale selections and same-name source choices.
2. Generate an explicitly named Rogue/Thief, with exact ABC and Dexterity, and inspect identity, native racket grants, HP, skills and loadout. One representative higher-level Rogue follows after ordinary success. Preserve all previous QA artifacts.
3. Exercise invalid/ambiguous requirements without provider spending, then a valid generation and preview input change. Record actual usage, native prompts and failures; no blind repeated generation.
4. Complete .71 catalog-source switching/overlapping loads and the remaining broader native matrix separately. Current-master complex class-path predicates, Ruffian Strength, broad casting/Free Archetype and screen-reader acceptance are not marked complete.

No new provider request, world mutation, module update, authenticated GitHub write or publication occurred during implementation. The existing world was inspected read-only.

## .71 release and installed baseline reconciliation

Luna verified PR #111 merged at `019d17b67c96bc06831fe56a4cfe8784fee90762`, successful Auto Release **34685111718**, and official .71 asset digests:

- module.json SHA-256 `b7369824e6bb25d1266eb0371d7e7f5d296aec7b9e900560a87a3f5c552a6474`.
- module.zip SHA-256 `a9777a9f6ebe533b4f73e8194893d56c74a778cec74649c97dcccb2143053067`.

All 49 packaged files match merge-source bytes with the expected manifest stamping, and archive selection matches the workflow. Temporary verification artifacts: `/tmp/simplypf2e-71.0BSAuW`; the user's old ignored module.zip was untouched.

Parent inspected the existing GM session's Module Management UI: **SimplyPF2e 0.3.5.71** is active, alongside Foundry **14.365** / PF2e **8.5.0**. No settings were saved. The browser reported a 509×1178 viewport below Foundry's supported minimum; no live functionality acceptance is inferred. These observations supersede the old .70 installation note, but do not establish installed source byte parity or the new branch's UI behavior.

## Publication and installation

User authorized merge and continuation. PR [#112](https://github.com/simplyjaytea/simplyPF2e/pull/112), source `86fa01dff1e9fd602b6ace3a495baf2319e5e42a`, passed CI **34865591818** and merged as `df8d53040027e7f1f3655b09085dd87bb2695694`. Auto Release **34865642787** succeeded and published **v0.3.5.72**. Luna verified all **50** selected archive files against the merge, with only expected manifest stamping, and both official SHA-256 digests:

- module.json: `81399cb65624cc918dfb915ee5e919d4e501488ca41d2ab8b4b6cb4a648629b3`.
- module.zip: `0a72d4d59144cb7ab2e957c7b3b0ab74e121d0d564b29c314e92b99af2254be7`.

Foundry Setup updated only SimplyPF2e from .71 to **.72**, then relaunched the existing `test` world and rejoined Gamemaster. Foundry **14.365**, PF2e **8.5.0**, provider **omniroute / auto/best-free**, credentials and existing world artifacts were preserved. Ready source counts: 77 packs in Monster mode and 12 enabled packs in Character mode. Installed version was visibly confirmed; installed byte parity is not independently established.

## Native PC acceptance — .72

The user approved up to two generation runs with the configured provider, stopping after the first unexpected failure. Required controls rendered in three columns at a temporary 1280×900 viewport and retained choices through the class-triggered rerender; the racket menu narrowed to Rogue paths. Full keyboard/screen-reader acceptance remains separate.

Two expected preflight failures completed at 0% / 0:00 without provider calls or document creation:

- `Class: Rogue or Fighter`: declaration did not match one offered catalog name.
- `Class: Rogue`, `Key ability: Strength`, `Racket: Thief`: unsupported base key ability rejected locally.

First approved run: level **1**, literal name **QA Native Thief**, exact **Rogue / Human / no heritage / Guard / Dexterity / Thief** controls, no preset, Unique rarity cap, Standard treasure, Allow spellcasting off. Description: “A careful former watch officer who now investigates missing goods. Prefer Nimble Dodge for a class feat. Use ordinary starting equipment and no spellcasting.”

- Created **QA Native Thief**, `Actor.W6CEjvm7ABmNlCI2`, in **2:48**, including manual native-dialog time; **26,839 provider-reported tokens**. Completion showed 26/26 matches, comprising 22 compendium picks, three native selections and one module-built currency/scroll pick. Known cumulative provider spend lower bound is now **333,213 tokens**.
- Native sheet retained exact name, Human, blank heritage, Guard and Rogue. Dexterity +4 and Rogue class DC17 were observed. HP **17/17**, AC18, Strength +3, Constitution +1, Intelligence +1, Wisdom/Charisma +0. This is a bounded identity/native derivation pass, not full PC acceptance.
- Rogue's Racket granted exactly one visible Thief, plus Sneak Attack and Surprise Attack, without a racket dialog. Thief `Item.togpUX6E4HqAIl7R` showed Source ID `Compendium.pf2e.classfeatures.Item.wAh2riuFRzz0edPl`, the native finesse melee Dexterity damage rule and `system.skills.thievery.rank` upgrade to 1 in its Rules UI. Nimble Dodge and Guard's Quick Coercion were present in their native feat groups.
- Arcane Tattoos opened a native spell ChoiceSet; parent chose **Shield**. Assurance opened a native skill ChoiceSet; parent chose **Thievery**. Native spellcasting entries remained empty. Existing checkbox behavior suppresses generated spell lists, while feats can still supply native magic choices. User explicitly chose **keep current behavior; clarify label**. These dialogs were not a failed Rogue grant chain or a changed required identity.
- Core training report showed **8/8 additional trained skills**, with native Stealth/Thievery +7 and Intimidation +3. **Lore Skills was empty**, although Guard promises Legal or Warfare Lore. This is an unresolved acceptance failure being traced locally; the level-4 generation was not run.
- Loadout retained a two-handed Halfling Sling Staff, stowed Dagger/Clan Dagger/Sling, worn Leather Armor, 10 Sling Darts, and assorted ordinary gear. Native inventory showed **1 gp currency / 15.28 gp total wealth**. One Beekeeper's Smoker and one Signal Whistle persisted despite duplicate preview rows. The report warned that an extra held item was stowed and ammunition still needs native loading. No attack, damage or spell was executed.
- All old artifacts and the new QA actor remain preserved. The temporary viewport was reset, and the actor sheet remains open on Feats. No second generation or provider retry was started. Broader PC, cache, combat, encounter, nested-kit, duplicate-activation and accessibility acceptance remain open.

## Reviewed local follow-up

On `codex/pc-native-acceptance`, official Guard now requires a local **Background Lore** choice: Legal or Warfare. The same scalar choice supports exact declarations, remains attached to the module-owned identity, appears in preview and invalidates stale previews. Required Guard without Lore stops before the concept call; automatic/Random catalogs omit this known incomplete background until a choice is supplied. Resolution and creation use the same concrete Lore names in prerequisite context and the existing native trained-Lore embedding path.

The bridge is bound to `pf2e.backgrounds / 6UmhTxOQeqFnppxx` and validates relevant source data. [8.5.0 Guard](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/backgrounds/guard.json) has an empty Lore array; [master Guard](https://raw.githubusercontent.com/foundryvtt/pf2e/master/packs/backgrounds/guard.json) has `<Legal or Warfare> Lore`. Neither is embedded as a name. Changed Guard data, conflicting identities and unresolved placeholders fail closed. Concrete Lore from other backgrounds is preserved; other prose-only choices remain outside this bounded bridge.

Character mode's **Generate spell lists** label and accessible helper implement the user's requested clarification. Runtime spell behavior remains unchanged. Native Arcane Tattoos dynamic ChoiceSet evidence was checked against [8.5.0](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/feats/ancestry/human/level-1/arcane-tattoos.json).

Luna implemented bounded helper/identity/copy work; parent integrated generator/builder, source fixtures and production regressions. Independent review approved after fixing selection validation ahead of missing/nonarray Lore returns. Final Node22.23.2 gate passed **96 regressions**, **135 script syntax checks plus one tooling check**, JSON and whitespace. The regression suite creates both concrete trained Lore choices from real 8.5.0/master fixtures using a native-preparation stand-in, checks source/selection failures before writes and confirms UI retention/Random filtering. This follow-up is committed locally for publication review; its installed UI and native Lore still require acceptance after release.
