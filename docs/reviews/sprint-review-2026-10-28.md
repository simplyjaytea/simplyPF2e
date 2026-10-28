# Sprint review, 2026-10-28: loot/parcel fix pass and wave 2

Reviewer: Claude Opus 5.5 (high), fresh context, read-only, 2026-10-28. Target: `claude/sprint-2026-10-27` at `b20272d` against `main` at `50aa045`. Plans: [sprint-2026-10-27](../plans/sprint-2026-10-27.md), [sprint-2026-10-28-wave2](../plans/sprint-2026-10-28-wave2.md). Node v24.22.1.

**Gate:** `node tools/check.mjs </dev/null` on a `git archive HEAD` copy exits 0 ("Regressions passed: 136 files", "Links passed: 166 links in 55 files", "0 unused keys"); `git diff --check main...HEAD` clean. The reviewer ran 19 source mutations on HEAD copies (scratch only, nothing committed); 17 were killed by the tests, 2 survived (G5, G6).

**Verdict: APPROVE WITH FIXES.** No P1. G1 (P2) breaks the ungated Character editor for every Wizard plan on every install; it is a one-line fix. Everything else is P3.

## Findings

**G1 — P2 — `scripts/generator-app.mjs:511` — CONFIRMED (harness, plus `ai.mjs:1042`, `pc-edit.mjs:217`, `pc-editor.mjs:67`)**
- Defect: `pcIdentityKey(plan.concept.classCandidate)` is called on a bare ref (`{packId,_id}`); `pcIdentityKey` reads `candidate.ref`, so `currentKey` is always `""` and the current caster class is never kept in the editor's class control.
- Failure scenario: a GM previews a Wizard plan and opens the Character editor; the class control lists only Fighter, Rogue and Investigator; `add()` (`:530-535`) finds no selected option and unshifts "Choose…", so the class reads as unchosen. Plan WP-C acceptance ("current = wizard gives [Fighter, Rogue, Wizard]") is unmet in the integrated app; `tests/pc-editor.test.mjs` passes a full candidate so the unit test cannot see it. Nothing is written silently.
- Fix: `pcIdentityKey({ ref: plan.concept.classCandidate })`, as `pc-identity.mjs:458` and `pc-editor.mjs:67` (`keyOf`) already do; add one app-level assertion that a Wizard plan's class control has Wizard selected.

**G2 — P3 — `scripts/itemforge-app.mjs:547`, `:673`, `templates/itemforge.hbs:32` — CONFIRMED by reading**
- Defect: a cantrip deck hides the level control, but `#consumables.level` still copies the hidden, stale `#input.level`; a gated "Create as: Loot actor" for decks writes it as the loot actor's `details.level.value` (level-15 wands, then decks → a level-15 loot actor of level-1 decks).
- Fix: `level: kind === "cantripDeck" ? 1 : this.#input.level`, or better the maximum built item `level` from the templates.

**G3 — P3 — `README.md:166`, `:134`, `docs/acceptance-ledger.md:58` — CONFIRMED by reading**
- Defect 1: README:166 states native behavior as fact ("Players with the default LIMITED ownership can loot a placed token…") without a "not live-verified" marker, although the first review lists it as unverifiable.
- Defect 2: README:134 and ledger N13 cite "a Champion with one focus spell"; Champion is not in `COMPLETE_PC_CLASS_SLUGS` (`pc-support.mjs:32`), so the clause cannot be executed live.
- Defect 3: README:132 omits D2 (the school spell is skipped silently when spellcasting is off).
- Fix: reword 166 as expected and unverified; drop or qualify the Champion example; replace the N13 Champion clause with an executable check; add the D2 sentence.

**G4 — P3 — `PLAYBOOK.md:69`, `:78`, `:234`, `:246-249`, `:282`, `:285`, `:287`; `HANDOFF.md:9` (at HEAD) — CONFIRMED by reading**
- Defect: at HEAD, PLAYBOOK §3 still lists as "verified — do not re-litigate" that the PC focus pool needs a cloned RE; §8–§10 still say school focus spells are manual and "no cantrip deck"; HANDOFF says the wave-2 plan was never received; F9 (roster reconcile) is open. A future agent obeying §3 would reintroduce the double count.
- Fix: commit the PLAYBOOK, HANDOFF and HISTORY close-out before merging (the orchestrator's uncommitted working-tree edits were not reviewed).

**G5 — P3 — `tests/itemforge-app.cantripDeck.test.mjs` (mocks ~66-110) — CONFIRMED (mutation `deckcandidates` survived)**
- Defect: the harness's `getScrollSpellCandidates` mock also returns Light, so routing decks through the scroll query still passes; nothing proves `getCantripCandidates` is used.
- Fix: make the scroll mock throw or record calls; assert 0 scroll-candidate calls and 1 cantrip-candidate call.

**G6 — P3 — `scripts/spell-consumables.mjs:188` — CONFIRMED (mutation `deckdelete` survived)**
- Defect: `delete item.system.spell` is dead code (the template has no `system.spell`); the real guard is the early `return item` (mutation `deckblock` killed).
- Fix: none required; optionally comment the line as defensive.

**G7 — P3 — `scripts/pc-builder.mjs:874-902`, `tests/pc-wizard.builder.test.mjs` — CONFIRMED by reading**
- Defect: the fail-closed paths "multiple arcane schools" and "resolved doc is not a spell" have no test; the contract's `WIZARD_ARCANE_SCHOOL_TAG` export is missing (the literal is inlined).
- Fix: add the two scenarios; export the constant or amend the contract.

**G8 — P3 — `scripts/itemforge-app.mjs:474`; `templates/itemforge.hbs:47` — CONFIRMED by reading**
- Defect 1: `(experimentalToolsEnabled() || this.#consumables)` is always true (`:470` already returned when `#consumables` is null); the guard is dead and F1 is carried by the reset at `:303`.
- Defect 2: the rarity select stays visible for decks but is ignored (`getCantripCandidates` is common-only), so "Uncommon" silently yields common decks.
- Fix: delete the dead clause; hide or annotate the rarity control for `isCantripDeck`.

## Mandatory checks

| # | Check | Result | Evidence |
| --- | --- | --- | --- |
| 1 | First-review fixes F1–F8 present and tested | PASS | Table below; mutations `f1reset`, `f2`, `f7` each make `tests/itemforge-app.parcel.test.mjs` exit 1. |
| 2 | Focus pool | PASS | `pc-builder.mjs:1152` `rules: []`; `:1134-1137` min(3, focus-and-not-cantrip); `:1251` writes only `resources.focus.value`. Fetched at `pf2e-8.5.0`: `src/module/item/spell/document.ts:650-657`, `src/module/actor/character/document.ts:369-373`, `creature/document.ts:493-494` match the plan verbatim. `builder.mjs` untouched. `grep focusPool` over scripts/tests/lang/templates: no hits. Mutation `focusrules` killed. |
| 3 | `school-spells.mjs` parser and resolver fail-closed | PASS (G7 gaps) | Tests cover the name form, the `<em>initial:</em>` form, the built id form with label and 7 null cases; fixtures byte-identical to `pf2e-8.5.0`; the rewrite confirmed at `build/lib/compendium-pack.ts:229`. Resolver paths each warn `simplypf2e \| <school>: …` and return null; called only when `concept.spellcasting` is truthy (`:1114`, mutation `spellguard` killed); `getPacksFor` returns pack-id strings (`compendium.mjs:86`) matching `doc.pack` (mutation `packcheck` killed). |
| 4 | Scroll, wand and NPC loot unchanged | PASS | Every new branch is `kind === "cantripDeck"`; `ai.mjs:858-889` scroll/wand prompt and rank check byte-identical inside the ternaries; `builder.mjs` untouched; the four changed pre-existing assertions encoded "deck unsupported" or the tile count only. Mutation `magical` killed. |
| 5 | Deck field map vs §2.B | PASS | Fetched `spell-consumables.ts:44-75`, `config/spell-consumables.ts:64-79`, `static/lang/en.json:2810`, the template JSON (category `other`, uses 5/5, 5 gp, level 1, traits `["magical"]`, no `spell` key). Module: pinned template `:66`, category `:143`, name `:56`, no `uses`/`quantity`/`price`/`level` write, traits `:160-169`, early return `:187-190`, refusal order `:83-92`. |
| 6 | No AI numbers | PASS | Deck prompt `ai.mjs:861-863` asks for `{ "spellId": string }` with the no-numbers sentence; reply rank ignored (`:893`, mutation `deckrank` killed); `selectParcelSpells` unchanged; hazard gate validates names only. |
| 7 | Hazard gate parity | PASS | `hazardStrikeProblem` (`ai.mjs:1509-1513`) matches `hazard-builder.mjs:96-100` `objectOf` and `:161-167` `nameText`; D7 documented; tests cover nameless-object retry, `{name:""}` ×2 and `"spikes"` ×2 rejections. Mutation `hazardgate` killed. |
| 8 | WP-C | FAIL (G1) | `editableClassCandidates` correct in isolation; call site passes the wrong key. `getDocument` returns null for a missing pack (`compendium.mjs:283-288`), rejections caught at `:520-521`. `#refineSpells` defaults `focus = true` (`:1846`); NPC/encounter calls unchanged. Hazard weight `:1188-1190`; test asserts `[100,600,2000,600,1600]`; mutation `hazardweight` killed. |
| 9 | Test honesty | PASS with G5, G6, G7 | Expected values typed from plans and fixtures; 17 of 19 mutations killed; survivors `deckdelete` (G6) and `deckcandidates` (G5); the authorized `classModelsFocusSpells` stub is the real function. |
| 10 | Docs honesty | FAIL (G3, G4) | README:166 states LIMITED looting as fact; README:134 and N13 rely on an unreachable Champion; PLAYBOOK §3:69 at HEAD contradicts the code. Correct: the Create-as sentence (gate on only), README:132/:222 vs `pc-builder.mjs` apart from D2; N12–N14 OPEN; every new README feature row says not live-verified; `docs/README.md` accurate. |

Other items: no import cycles (`spell-consumables.mjs`, `school-spells.mjs` import nothing; `foundry` read only inside `randomId`); the deck tile, generate and Create run ungated while `showDestination` stays gated; Handlebars blocks well formed; `localize` hash usage matches the existing pattern.

## First-review fixes

| Fix | Present | Tested | Evidence |
| --- | --- | --- | --- |
| F1 stale loot destination | Yes | Yes | `itemforge-app.mjs:303` resets the destination when the gate is closed; `:300-301` and `:735-736` keep the refusals; parcel test asserts 0 writes, `preview.destination === null`, then 1 Items write. |
| F2 source-less item | Yes | Yes | `:540`; `emptyBuildError` block asserts "build failed" and no write. |
| F3 level column | Yes | Yes | `templates/itemforge.hbs:115`; test asserts `level` 1 and `itemLevels "2, 2, 1"`. |
| F4 four-PC total | Yes | Yes | `:623` `extraPcs`; hbs:118 `ValueExtra`; test asserts `extraPcs === 1`. |
| F5 parcel level and blank size | Yes | Yes | Clamps `:140-141`, `:196-200`, `:290-292`; blank size keeps the previous value `:208-210`; test asserts `maxLevel 20`, level 21 refused with 0 AI calls, size kept, `levelUp` capped. |
| F6 prompt lost on refusal | Yes | Yes | `#readForm()` `:299` before the gate check `:300`; test asserts the typed prompt survives. |
| F7 presentation warning | Yes | Yes | `:643-648` and `:674`; test asserts outcome `warning`, `created.warning`, the notice. |
| F8 committed gated test | Yes | Yes | `tests/itemforge-app.parcel.test.mjs` covers gate-closed, verify failure, delete failure, clean payload (scroll ×3, Gold ×40, `rules: []`), level 21; consumables test asserts `SpellMissing`/`TemplateMissing`. |

## Cannot be verified without live Foundry

- pf2e deriving focus max 1 for a Battle Magic Wizard with Force Bolt; the starting `focus.value` surviving prep and the `_preUpdate` clamp.
- The installed school description carrying the id-form link, `fromUuid` resolving it, `doc.pack === "pf2e.spells-srd"` on the live document.
- Force Bolt casting from the module's focus entry with Int and arcane.
- The cantrip deck sheet, "Pick a Card", `autoDestroy` at 0 uses, the description link, the deck with no embedded spell.
- The Character editor class list rendering (G1 is source-confirmed).
- Progress-bar weights in the real ApplicationV2 UI.
- Everything on the first review's list (loot `Actor.create`, `compendiumSource` persistence, stacking, sheet mode, LIMITED looting, notification escaping, destination select re-render, multi-quantity scrolls, `localize` hash formatting on Foundry 14.365).

## Fix record

Filled in by the orchestrator as the fix ladder runs (see [docs/HISTORY.md](../HISTORY.md)).
