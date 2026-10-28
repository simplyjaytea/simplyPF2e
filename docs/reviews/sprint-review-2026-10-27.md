# Sprint review — 2026-10-27 loot actor container and Treasure parcel

Reviewer: Claude Opus 5.5 (high), fresh context, read-only, 2026-10-28. Target: `claude/sprint-2026-10-27` at `ecf5055` against `main` at `50aa045`. Plan: [sprint-2026-10-27](../plans/sprint-2026-10-27.md). Node v24.22.1.

- `node tools/check.mjs </dev/null`: exit 0, "Regressions passed: 131 files".
- `git diff --check main...claude/sprint-2026-10-27`: clean.
- The reviewer built two uncommitted scratch harnesses: one loads the real `itemforge-app.mjs` in a vm with the gate stubbed open and stubbed `Actor.create`, `fromUuid` and AI; the other diffs all 20 rows of plan §2.10 against `PARTY_TREASURE_BY_LEVEL`. Finding F8 asks for the first to become a committed test.

**Verdict: APPROVE WITH FIXES.** No P1. Everything new is invisible on a fresh session with the gate off, so merging changes nothing for ungated installs. One P2 traps a GM who turns the gate off mid-session; the rest are P3.

## Findings

**F1 — P2 — `scripts/itemforge-app.mjs:202`, `:457`, `:714` — CONFIRMED (harness case 7)**
- Defect: `#input.destination` stays `"loot"` after the gate closes. Create still routes on it, while the control that could change it is no longer rendered.
- Failure scenario: with the gate on, the GM picks Scroll and "Create as: Loot actor"; the GM turns `experimentalTools` off (no `requiresReload`; `ItemForgeApp` is a singleton, `simplypf2e.mjs:37`); the destination select disappears but the preview still says "Destination: Loot actor"; every scroll/wand Create, including after a fresh Generate, is refused with the gate error ("gate-off regenerate+create: writes 0 error GATE-CLOSED"); the GM cannot reach the ungated Items-directory path until the gate is back on or the page reloads. Breaks "with the gate off nothing user-visible changes".
- Fix: in `#onGenerate`, after `#readForm()`, reset `destination` to `"items"` when the gate is closed. An existing loot draft keeps its refusal (specified: nothing silently falls back). Optionally show the preview destination line only when the gate is open or a loot draft exists. The same stale state leaves `kind: "parcel"` with the "Party level" label (`:119`); recoverable by clicking another kind tile.

**F2 — P3 — `scripts/itemforge-app.mjs:522-523` — CONFIRMED by reading (edge case)**
- Defect: after the `#buildSpellConsumable` extraction, a result without `missing` and without a truthy `reason` is treated as a built item. A builder or `fromUuid` error with an empty message returns `{ reason: "" }`, which is pushed into `items` with no `source`; Create then passes `undefined` to `Item.create`. The old code called `dropped("")` and continued.
- Fix: `else if (!result.source) dropped(result.reason || "build failed"); else items.push(result);`. The parcel path at `:571` already checks `!built.source`.

**F3 — P3 — `scripts/itemforge-app.mjs:603` and the parcel table in `templates/itemforge.hbs` — CONFIRMED (harness case 1)**
- Defect: the parcel preview's "Level" column shows the slot item levels, not the level of the scroll built. A level-1 Scroll of Heal shows `2, 2, 1` under "Level"; a GM can read that as a level-2 item.
- Fix: show the built `level` and label the slot levels separately ("Slot levels").

**F4 — P3 — `scripts/itemforge-app.mjs:605` — CONFIRMED by reading**
- Defect: "Built {value} gp of table total {total} gp" uses the four-PC `row.totalGp`, while the built value includes the extra-PC currency and consumables for parties of 5–8.
- Fix: label it "four-PC table total", or omit the comparison when `extraPcs > 0`.

**F5 — P3 — `scripts/itemforge-app.mjs:138`, `:204`, `:284` — CONFIRMED (harness cases 8 and 9)**
- Defect 1: for a parcel the level input's `max` and `#stepLevel` still allow 1–24; 21–24 is refused only at Generate (before any AI call, so no spend).
- Defect 2: a blank party-size field reads as 1 (`Number("") === 0`, clamped to 1); the description then says "size 1" and adds the below-four note.
- Fix: pass `maxLevel: 20` to the template and clamp `#stepLevel` to 1–20 for the parcel kind; treat an empty party size as the previous value or 4.

**F6 — P3 — `scripts/itemforge-app.mjs:289-291` — CONFIRMED by reading**
- Defect: the gate-closed parcel refusal returns before `#readForm()`, so the re-render rebuilds the form from stale `#input` and the prompt text typed since the last read is lost.
- Fix: call `#readForm()` first; the `#generateParcel` assert still guards the run.

**F7 — P3 — `scripts/itemforge-app.mjs:625` — CONFIRMED by reading**
- Defect: when the loot actor is committed but the notification or sheet render fails, the error is only logged; the outcome stays "success" and the GM gets no `CreatedPresentationFailed` warning. The Items paths set outcome "warning" in the same situation.
- Fix: set `this.#created.warning = true` and return a flag so `#createLootDraft` finishes with `"warning"`. Create correctly stays disabled.

**F8 — P3 — tests — CONFIRMED**
- Defect: no committed test runs any gated WP5 code (`#generateParcel`, the `#createLootActor` sequence, rollback and survivor wiring, gate refusal at Create, the parcel preview). The three `experimentalToolsEnabled: () => false` stubs hide no failure (without them the vm linker would supply a throwing function), but with them pinned to false the gate is never open in any test. The consumables test does not exercise the extracted `SpellMissing` or `TemplateMissing` branches.
- Fix: commit `tests/itemforge-app.parcel.test.mjs` modelled on the scratch harness, proving: gate closed at Create → 0 writes, draft kept; verify failure → `delete()` called, draft kept; delete failure → survivor message appended, draft discarded; clean create → payload keys `name`, `type`, `img`, `system`, `items`, `system` holding only the four allowed keys, items = a scroll with quantity 3 and Gold Pieces with quantity 40, both `rules: []`; level 21 → refused with 0 AI calls.

**F9 — P3 — `PLAYBOOK.md:190` vs `:196` (WP0) — CONFIRMED by reading**
- Defect: the escalation rules disagree: the new Escalation bullet says Codex GPT-6.1 Terra (high) then Opus (xhigh); fix-ladder step 4 still says Haiku very high, then Sonnet, then Opus; `CLAUDE.md` names Haiku/opencode workers with a Sonnet escalation; plan WP0 item 3 says both "unchanged" and "becomes Haiku high, Codex Terra high, Opus xhigh".
- Fix: reconcile to the user's current roster in WP6.

## Mandatory checks

| # | Check | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Loot actor source against plan §2.1–2.5 | PASS | `loot-actor.mjs:175-190` writes only `name`, `type`, `img`, `system{details.description, details.level.value, lootSheetType, hiddenWhenEmpty}`; no `ownership`/`prototypeToken`/`attributes`/`traits`; nine item types at `:47-49`, a foreign type throws (`:167`), Rule Elements throw (`:170`); `itemforge-app.mjs:617` calls `Actor.create({ ...built.actor, items })`. Fetched at `pf2e-8.5.0`: `src/module/actor/loot/data.ts` 9–34 and 55–59 match the plan verbatim; `src/module/item/physical/values.ts` 3–13 lists the nine types; `src/module/actor/base.ts` 133–139 (`getDefaultArtwork`) and 663–668 (`case "loot"` inside `createDocuments`) match; `src/module/actor/loot/sheet.ts` 37–40 enriches the description; `item/base/document.ts` 657–663 match. |
| 2 | `treasure-tables.mjs` rows and party-size rule | PASS | 20 rows × 6 columns against plan §2.10: 0 mismatches; the AoN page (Rules ID 2656) is server-rendered and matches all 20 rows; `treasure-tables.mjs:99-118` applies "Two consumables, usually one of the party's level and one of 1 level higher" per extra PC, capped at level 20; the test expects 6th: 4, 5th: 4. |
| 3 | No AI numbers | PASS | `selectParcelSpells` parses only `slot` and `spellId` strings, checks them against issued ids, caps at `slots.length`, prompt carries the no-numbers rule; ranks from `scrollRankForItemLevel`; quantity is a slot count; currency from the table and `coinItemSource`; actor level is `row.level` or the Forge level; prices and levels from the pinned templates (`itemforge-app.mjs:548-549`). |
| 4 | Escaping and enricher-freeness | PASS | `lootDescriptionHtml` escapes every line and throws on enricher tokens, `[[` or `@` (`loot-actor.mjs:131`); description lines are localized text plus numbers; no Loot/Parcel string in `en.json` contains `@` or `[[`; the GM-typed name is written only as plain `name`, escaped in the notification (`:622`) and by Handlebars `{{ }}`; the `localize` helper with hash arguments is already used on `main` (`CreatedSummary name=…`). |
| 5 | Commit/rollback and the gate | PASS except F1 | `#createLootActor` (`:610-631`): assert → build → `persistedExpectedItems` → assert → `_lockCreation` → `Actor.create` → verify → commit → notify; rollback before commit; draft discarded only on a survivor (harness cases 2–4). Gate at UI (`:116-118`, tile `:148`), parcel generate (`:289`, `:552`), Create (`:640`, `:612`), before `Actor.create` (`:615`). No fallback to the Items directory. |
| 6 | Scroll/wand unchanged after the extraction | PASS with F2 edge | Old and new paths compared line by line: branches, warning keys, `compendiumSource` stamp, template load and result fields identical; the consumables test proves build, thrown-build drop, rank cap, single write and description link; missing-spell/missing-template branches equivalent by reading only. |
| 7 | Test honesty | PASS with F8 | Tables, loot, parcel and AI tests type expected values from the plan; `treasure-parcel.integration.test.mjs` (node:test) runs under the gate and a mutated copy failed with exit 1, which `check.mjs` treats as failure; its base count comes from the module row, acceptable because the tables test types the rows. |

## Other items checked

- `#readForm` parcel level unclamped: intentional and refused before any AI call; the mismatch with the level buttons is F5.
- `_onRender` override: correct; `SpfApp._onRender` exists (`app-base.mjs:163`) and the listener goes on a freshly rendered element.
- `en.json` "Ability" block: whitespace-only reformat; all six pairs identical.
- Ungated Forge for every install: new imports have no Foundry globals at module top level and no import cycle; `experimentalToolsEnabled` fails closed; with the gate off the template renders no new DOM; the consumables test passes with an unmocked `assertExperimentalToolAccess` that would throw, so the ungated Create path never calls the gate.

## Cannot be verified without live Foundry

- Whether `Actor.create` with embedded items skips `checkItemValidity` (the module checks item types itself either way).
- Whether `_stats.compendiumSource` persists on embedded scroll and coin items of a loot actor; `verifyCreatedActor` depends on it, and a mismatch would roll back every create.
- Whether pf2e merges or restacks the Gold Pieces or scroll stacks on create.
- Whether the loot sheet renders the module description and item stacks and opens in Loot mode.
- Whether LIMITED default ownership and a linked token let players loot a placed token.
- Whether Foundry v13/14 `ui.notifications` escapes its message by default (if so, `esc(actor.name)` double-escapes `&`, `'`, `<`; `generator-app.mjs:2723` already does the same).
- Whether `selectedIndex` and `change` on the destination select behave as expected in the real ApplicationV2 part re-render.
- Whether a scroll at quantity 2 or more behaves, and whether players can cast from scrolls after moving them off the loot actor.
- Whether the `localize` helper's hash formatting matches the stubbed behavior on Foundry 14.365.

## Fix record

Filled in by the orchestrator as the fix ladder runs (see [docs/HISTORY.md](../HISTORY.md)).
