# Required PC identity — 2026-09-15

## Delivered locally

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
