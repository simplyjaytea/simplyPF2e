# simplyPF2e — Agent Playbook

**Every agent (Claude, Codex, opencode, omp, human) starts here.** This file is the single operating manual: what the project is, the rules that must never break, how the code is laid out, how work is organized and reviewed, what is true right now, and what to do next. `CLAUDE.md` and `AGENTS.md` only point here.

Read order at session start (about five minutes):

1. This file, top to bottom, at least once per session. Sections 1–4 are stable; sections 7–8 change often.
2. [HANDOFF.md](HANDOFF.md) — the live baton from the previous session: what is in flight and the exact next step.
3. `git status` and `git log --oneline -10` — git is the only authority on branch state; never trust a document's description of it.
4. Only when you need *why*: [docs/HISTORY.md](docs/HISTORY.md) (session log, bug log with reusable patterns), then the [documentation map](docs/README.md).

---

## 1. What this project is

**simplyPF2e** is a [Foundry VTT](https://foundryvtt.com) module for the Pathfinder Second Edition (Remaster) system package `foundryvtt/pf2e`. A GM types a one-sentence brief; an LLM (any OpenAI-compatible endpoint, called from the GM's browser) invents the *concept*; the module turns that concept into a fully statted Foundry actor or item using only real installed compendium content and published benchmark tables.

Four generator modes plus a forge, all GM-only, all requiring the pf2e system:

| Surface | What it builds | Status (2026-10-25) |
| --- | --- | --- |
| **Monster / NPC** | One creature; numbers from GM Core "Building Creatures" tables; abilities, spells, gear cloned from compendiums | Stable, most battle-tested |
| **Encounter** | A themed group within an XP budget; the NPC pipeline per member | Stable (multi-member native checks still open) |
| **Player Character** | A level-N PC built from real Ancestry/Background/Class/heritage/feat items so pf2e derives the math itself | GM-reviewed beta; complete-only classes Fighter, Rogue, Investigator |
| **Item Forge** | Magic items: passive wondrous items from cloned Rule Elements, 1/day activations via prewritten macros, runed weapons/armor | Core flows live-verified |
| **Experimental tools** (off by default) | `/forge <brief> <level>` chat command; Creature Tools reskin + native elite/weak | Built, reviewed, **not native-accepted** |
| **Ordinary multiclass** (off by default) | Noncaster dedication catalog for PCs; Free Archetype slots | Built, **not native-accepted** |
| **Level shifting** | New NPC at level ±1/±2 via benchmark deltas | Internal API only, no UI |

Repo: `simplyjaytea/simplyPF2e`. Public install manifest: `https://github.com/simplyjaytea/simplyPF2e/releases/latest/download/module.json`. **Every merge to `main` auto-publishes a release that every install is offered immediately.**

Out of scope by decision: universal PF2e feat automation, caster multiclass dedications, hand-authored Rule Elements of any kind, image generation, anything the module would have to *guess* rather than *look up*.

## 2. Glossary

- **Foundry** — the VTT. **Actor** = a creature/character sheet. **Item** = anything embedded on one (feat, spell, weapon, action, condition...).
- **pf2e system** — `foundryvtt/pf2e`. "Real source" means that repo's actual TS/JSON, fetched live from `raw.githubusercontent.com/foundryvtt/pf2e/master/...` (or a version tag like `pf2e-8.5.0`), never recalled from memory.
- **Compendium / pack** — a bundled library of real game content. The module never invents content: a pick either resolves to a real document or is dropped/marked custom.
- **GM Core** — the sourcebook whose Building Creatures benchmarks `scripts/tables.mjs` hardcodes. **Remaster** — the 2023+ edition; the AI is repeatedly reminded to use Remaster names.
- **ABC item** — Ancestry/Background/Class, the real items a PC embeds. **Heritage** is a fourth in its own pack.
- **Grant** — an item that auto-bundles another when embedded (`system.items` on the granting doc). PF2e expands grant chains itself.
- **Rule Element (RE)** — a JSON object in `system.rules` that makes something happen mechanically. Foundry fails **silently** on a wrong key, so a hand-typed RE can look right and do nothing.
- **Spellcasting entry** — the item that owns a caster's spells and slots. `system.prepared.value` ∈ `prepared|spontaneous|innate|focus`. **Tradition** ∈ arcane/divine/occult/primal. **Focus pool** — 1–3 points, separate from slots.
- **Slug** — `ghost-touch`. PF2e sometimes needs **camelCase** (`ghostTouch`) instead; they are not interchangeable (recurring silent-bug source). Graded runes invert: "Flaming (Greater)" → `greaterFlaming`.
- **Trait** — a tag in `system.traits.value` used for filtering.
- **ChoiceSet** — a pf2e RE that prompts the user at embed time; the module pre-answers supported static ones.
- **Experimental gate** — `scripts/experimental-tools.mjs`; the world setting `experimentalTools` checked at every tool entry and again before every native write.
- **Native QA / native acceptance** — evidence from a real Foundry world with the pf2e system installed. Local tests stub Foundry; they never close a native row.
- **Ledger row (R01–R25, N01–N08)** — one native acceptance case in [docs/acceptance-ledger.md](docs/acceptance-ledger.md).

## 3. Invariants — never break these

1. **Branch + PR, never direct to `main`.** A merge auto-publishes. Treat it like `gh release create`. Changes to `.github/workflows/*.yml` additionally need a real test merge; YAML validity has never caught a trigger-chain bug here (two were found live).
2. **Clone a real Rule Element from a published item; never hand-author one.** See `scripts/rule-templates.mjs`. No hand-written fallback exists, by design.
3. **When a pf2e field name or shape matters, fetch the real `foundryvtt/pf2e` source.** This is the single most repeated bug source in the project's history (see the bug log). A delegate's claim of "verified" must quote the source line; unquoted = recalled = unverified.
4. **The in-module AI never emits a number or writes code.** It picks scale words and enum slugs; the module supplies values from tables, real documents, or prewritten macro bodies.
5. **Escape AI/user text before it reaches HTML** via `scripts/text.mjs` `esc`/`toHtml`. Escaping covers HTML, **not** Foundry enricher syntax (`@Check`, `@Damage`, `@UUID`, inline rolls); cosmetic AI text must also be proven enricher-inert (`reskin-policy.mjs`).
6. **Fail closed.** An unresolved pick is dropped with `console.warn`, never guessed. Exceptions: a PC feat slot and a PC caster's spell list (empty is worse than approximate) may fall back only to unused exact candidates from the same slot; skill preferences fall back to labeled key-ability defaults. Missing budgets/schedules or unsupported native mechanics are never guessed.
7. **Local tests never close a native acceptance row.** Report implemented / reviewed / published / installed / live-accepted as five separate facts.
8. **Never spend the user's provider tokens, write to the live world, publish, or run `gh` without an explicit, scoped, current authorization.** Approval of one batch is not approval of the next.

### Verified against real pf2e source — do not re-litigate

- Setting all five `build.attributes.boosts` tiers regardless of level is safe (`character/document.ts` slices each tier by `allowedBoosts`).
- A PC spellcasting entry's `proficiency.value` is a floor, not a cap (`spellcasting-entry/document.ts` takes `Math.max` with the actor's `base-spellcasting` rank).
- `details.languages.value` is not truncated to max; the system adds Int mod to `build.languages.max` itself.
- Not writing `system.price`/`system.level` on a runed item is correct (`physical/document.ts` recomputes both via `computeLevelRarityPrice()` every prep).
- A character's `resources.focus.max` is zeroed every prep and rebuilt only from ActiveEffectLike rules, so the PC focus pool needs a cloned RE; an NPC's can be plain actor data.
- PF2e 8.4.1+ `TreasurePF2e#isCoinage` is `system.category === "coin"`. Never hand-author coin items; clone the published Gold/Silver/Copper/Platinum Pieces documents (`ActorInventory.addCurrency` uses the same `coinCompendiumUuids`).
- NPC sheets forbid raw `feat` items (`actor/npc/document.ts` allowedItemTypes); feats become action items via `featToAction`. NPC `classDC` is a native level-derived value; Stunning Blows' save must be bridged to `@actor.attributes.classDC.value`.
- `applyAdjustment` (elite/weak) returns immediately for an already-selected state; the module never recomputes elite/weak math. A one-level benchmark delta is **not** the flat elite +2; a level-shifted clone must have `attributes.adjustment` null.
- Two different mechanisms write a feat's `system.location`: slot feats use `"<group>-<level>"`; an ABC item's own granted feat uses the granting item's embedded `_id`.
- Real PF2e Guard background has `trainedSkills.lore: []`; its Legal/Warfare choice exists only in prose, hence the explicit Background Lore control.

### Signed-off module decisions (not rules, but settled)

- Focus pool size = spell count capped at 3 (module default, not GM Core). Focus-only NPCs (no tradition, so no DC) unsupported.
- Rarity cap applies to ancestry/background/heritage only.
- Level shifting supports deltas −2, −1, +1, +2 only; narrow caster policy; abilities unchanged, skills shifted; first-instance Strike damage shifted; result named `<name> (Level T)`. These were C11's assumptions pending the user's confirmation — see §8.
- Multiclass catalog (PF2e 8.5.0 names): Fighter, Investigator, Barbarian, Monk, Ranger dedications + listed package feats; caster dedications unavailable.

## 4. Architecture

Three pipelines over shared compendium/table infrastructure, plus the experimental tools that reuse them.

**NPC / creature** (`builder.mjs`) — `generateConcept()` (one call, returns *scales* not numbers) → `normalizeConcept()` → spell narrowing/selection (2 calls) → equipment selection (1 call) → ground feats/abilities/loot against bounded real catalogs → `resolveConcept({ exactContent: true })` builds a completion manifest (any unresolved required pick blocks creation) → `createActor()` clones real items, applies runes/quantities, verifies persisted sources and spell links, commits. Encounter mode runs `designEncounter()` once then this pipeline per member. NPC class-feat requests resolve through `npc-ability-packages.mjs` (complete verified dependency graphs, e.g. Stunning Blows → Flurry of Blows + unarmed strike + class-DC bridge).

**Player Character** (`pc-builder.mjs`) — no math layer. Embed real ABC/heritage/feat items with correct `system.build` data and pf2e derives AC/HP/saves itself. `normalizePCConcept()` → identity binding (`pc-identity.mjs`, `pc-background-lore.mjs`) → `resolvePCConcept()` (ABC/grants/feat slots via `pc-prerequisites.mjs`, skills via `pc-skills.mjs`, class paths via `class-paths.mjs`, ChoiceSets via `choice-set.mjs`, multiclass via `pc-multiclass.mjs`) → editable preview (`pc-edit.mjs` contract, `pc-editor.mjs` form mapping) → `createCharacterActor()` → `pc-loadout.mjs` readies gear after native proficiencies exist.

**Item Forge** (`item-builder.mjs`, `rule-templates.mjs`, `macro-templates.mjs`, `runes.mjs`) — passive items clone unchanged REs from eligible published equipment; activations use four prewritten macro bodies; runed weapons/armor clone a real base plus real rune items. PF2e derives final price/level.

**Experimental** — `forge-command.mjs` parses `/forge` and feeds the Monster lifecycle; `reskin.mjs` + `reskin-policy.mjs` clone one exact bestiary NPC and append AI flavor proven inert; `creature-tools.mjs` wraps those plus native `applyAdjustment`; `level-shift.mjs` + `level-shift-policy.mjs` build a new NPC by benchmark delta. All pass through `experimental-tools.mjs`.

**Shared** — `completion.mjs` (required-content manifests, persisted-source checks) and `post-create.mjs` (commit/rollback boundary: failures roll back only new documents; failed cleanup reports survivors and discards the draft to prevent duplicate retries). `compendium.mjs` (`findEntry` fuzzy match, pack indexes, candidate lists, `priceToGp`, `RARITY_RANK`), `async-cache.mjs` (pending-load coalescing, failed-load eviction), `ai.mjs` (all provider calls, streaming SSE, retry-once, fail-closed JSON), `tables.mjs` / `pc-tables.mjs` (benchmarks, PC cadence, casting profiles).

### Module map (`scripts/`)

| Domain | Modules |
| --- | --- |
| Entry & apps | `simplypf2e.mjs` (hooks, `module.api = { open, openItemForge, openCreatureTools }`), `app-base.mjs`, `generator-app.mjs`, `itemforge-app.mjs`, `creature-tools-app.mjs`, `provider-setup-app.mjs`, `sources-app.mjs`, `manage-presets-app.mjs`, `progress.mjs`, `tokens.mjs` |
| AI | `ai.mjs`, `ai-task-profiles.mjs`, `ai-candidate-format.mjs`, `ai-response-validation.mjs`, `presets.mjs` |
| Settings & gates | `settings.mjs` (`freeArchetype`, `multiclassArchetypes`, `experimentalTools`; client-local connection bank), `experimental-tools.mjs` |
| NPC | `builder.mjs`, `encounter.mjs`, `npc-ability-packages.mjs`, `art.mjs`, `tables.mjs` |
| PC | `pc-builder.mjs`, `pc-identity.mjs`, `pc-background-lore.mjs`, `pc-support.mjs`, `class-paths.mjs`, `pc-prerequisites.mjs`, `pc-skills.mjs`, `pc-loadout.mjs`, `pc-tables.mjs`, `choice-set.mjs`, `pc-multiclass.mjs`, `pc-edit.mjs`, `pc-editor.mjs` |
| Forge | `item-builder.mjs`, `rule-templates.mjs`, `macro-templates.mjs`, `runes.mjs` |
| Experimental | `forge-command.mjs`, `reskin.mjs`, `reskin-policy.mjs`, `creature-tools.mjs`, `level-shift.mjs`, `level-shift-policy.mjs` |
| Shared | `compendium.mjs`, `completion.mjs`, `post-create.mjs`, `async-cache.mjs`, `text.mjs` |

Modules named `*-policy.mjs`, `pc-edit.mjs`, `pc-editor.mjs`, `pc-skills.mjs`, `progress.mjs`, `text.mjs`, `encounter.mjs` are pure (no Foundry globals) and node-testable without stubs.

## 5. Repository layout

```
PLAYBOOK.md          this file — agents start here
HANDOFF.md           live baton between sessions (overwrite at session end)
CLAUDE.md, AGENTS.md pointers to this playbook (+ tool-specific notes)
README.md            user-facing docs; shipped in module.zip
module.json          manifest (version is stamped by CI; source value is a placeholder)
scripts/             runtime ES modules (shipped)
templates/ styles/ lang/   Handlebars, CSS, en.json (shipped)
tests/               *.test.mjs regressions + tests/fixtures/ (real pf2e JSON) — not shipped
tools/check.mjs      the CI gate: syntax, every regression, JSON — not shipped
docs/                README.md (map) · HISTORY.md · acceptance-ledger.md · plans/ · reviews/ · evidence/
.github/workflows/   pull-request.yml (gate), auto-release.yml → release.yml (publish on main)
```

Release archive = `module.json LICENSE README.md lang scripts styles templates` minus `*.test.mjs`. Nothing else ships.

### Which document to update when

| Event | Update |
| --- | --- |
| Any session end, or before a risky long step | `HANDOFF.md` (overwrite: done / in flight / exact next step / unverified) |
| A bug found, a decision made, a release or QA result | `docs/HISTORY.md` (newest first; add a **Pattern:** line to the bug log when reusable) |
| Durable truth changed (invariant, architecture, module added, current state) | `PLAYBOOK.md` §3/§4/§7/§8 |
| A native row gets evidence | `docs/acceptance-ledger.md` row in place, link the evidence record |
| User-facing behavior or limits changed | `README.md` (note `tests/presets.catalog.test.mjs` asserts some README sentences) |
| A plan, review or QA record is produced | new file under `docs/plans/`, `docs/reviews/` or `docs/evidence/` + a row in `docs/README.md` |

## 6. How we work

### Branching, gate, release

- Work on a named branch (`claude/<topic>-<date>`, `codex/<topic>`). Open a PR. The user decides when to merge; **merging publishes**.
- Before calling anything done: `node tools/check.mjs` (CI runs it on Node 22; locally Node 26 is installed and passes — if a Node-version-specific failure is suspected, `mise exec node@22 -- node tools/check.mjs`) and `git diff --check`.
- Add a `tests/*.test.mjs` for genuinely pure logic behind any bug-shaped change. Do not add tests that merely restate implementation.
- Live Foundry behavior (rendering, derived stats, grant chains, dialogs) is **not** self-checkable from this machine. Say so in the PR body and in HANDOFF.md, and open/keep the ledger row.

### Orchestration roster (user's standing instruction, 2026-10-25)

- **Coordinator: Claude Fable.** Understands scope, plans, writes briefs, delegates, verifies, integrates, owns HANDOFF.md and the final report. Decides which tool to use; Codex, opencode and omp are available and may be used at the coordinator's judgment.
- **Workers: Claude Haiku 5.5 at high effort** for bounded, already-specified execution (apply a mapped fix, write a test mirroring an existing one, mechanical moves/renames, doc synthesis from named sources).
- **Fixers: Claude Sonnet 5.5 at high effort** for anything a review flags.
- **Opus 5.5 / Fable** for open-ended design, hard debugging, and *independent review* of schema-dependent or balance-sensitive diffs.
- **Parallel work always uses git worktrees** (`isolation: worktree`, one worker per worktree, one owner per shared file). When the pieces are done: merge the worktrees into the integration branch, run the gate, then review the **merged** result, then fix with Sonnet.
- Never delegate without the brief stating: the exact files owned, what not to touch, the verification command, the commit message, and the report shape. Never delegate the two things that bite this repo: pf2e schema verification (the delegate must fetch real source and quote it; the coordinator spot-checks), and release/workflow `.yml` reasoning.
- Every schema-dependent or balance-sensitive diff gets an independent reviewer with fresh context (not the builder) before the PR is called done — this has caught real bugs on three separate occasions.
- Review handling: verify technically before accepting a reviewer finding; one fix PR per merged PR if the user merged mid-review.

### Session protocol

Start: read PLAYBOOK §7–8 and HANDOFF.md; `git status`, `git log --oneline -10`, `git fetch`; check whether an in-flight PR merged (`curl -s https://api.github.com/repos/simplyjaytea/simplyPF2e/pulls?state=all&per_page=3`).

End (or before any risky long operation): overwrite HANDOFF.md; append HISTORY.md; update PLAYBOOK §8 if current state changed; leave the tree clean or committed on a named branch. Never leave uncommitted work on `main`.

### Live QA discipline

Live QA runs on the user's Foundry (Foundry 14.365 / PF2e 8.5.0, world `test`) and spends the user's provider tokens. Each batch needs: the exact ledger rows, generation count ceiling, token ceiling, stop condition (stop at first unexplained failure), and the user's explicit go. Record actual usage; retain failed-run usage. Preserve every existing QA artifact listed in [docs/evidence/live-qa-inventory.md](docs/evidence/live-qa-inventory.md). Module-only updates; never touch core/system/world settings.

## 7. Environment

- No local Foundry. No local pf2e checkout; fetch files from GitHub raw as needed (reachable).
- `gh` CLI hangs on this machine. Read GitHub via `curl https://api.github.com/repos/simplyjaytea/simplyPF2e/...`; push/PR only with the user's authorization.
- Node via mise: 26.12.1 installed; CI uses 22. Gate takes ~7 s.
- Git identity for this repo: `user.name "jt"`, `user.email "jt_f@ymail.com"` (the checkout may show a different global identity; set it per-repo before committing).
- Prior sessions' worktrees lived under `/home/jtf/.t3/worktrees/` (Codex "T3"); remote branches `codex/*` are historical and may be pruned only with the user's say-so.

## 8. Current state — 2026-10-25

- **Latest release: v0.3.5.74**, published 2026-10-17 from PR #114 (`d0ec85e`, "Integrate completion chunks C01–C13" plus six P2 fixes from a consolidated Opus review). Auto Release run 39051396149 succeeded. Release-asset parity for .74 against the merge has **not** been re-verified (C01 did this for .73).
- **Last recorded installation: v0.3.5.72.** Nothing from .73 or .74 has been installed or natively exercised. The Guard Lore fix (.73), all experimental tools, the PC editor, multiclass, Free Archetype and level shifting have zero live evidence.
- **Local gate:** 50 runtime modules, 109 regression files, exit 0 on Node 26.12.1.
- **Native ledger:** R01–R25 (22 OPEN, 3 BLOCKED: R20 PC focus path, R22 screen-reader operator, R24 isolated PF2e 8.4.1 instance) and N01–N08 all OPEN. Zero PASS rows. Known provider spend lower bound 333,213 tokens.
- **Open decisions the user owns:** (a) level-shift entry point — add a gated Creature Tools section + `module.api` member, or leave internal; (b) confirm C11's assumed policy (deltas ±1/±2, narrow caster rule); (c) a QA spending envelope for Batch A; (d) screen-reader operator and isolated 8.4.1 environment, or explicit deferral.
- Historical narrative and the full bug log: [docs/HISTORY.md](docs/HISTORY.md). Last large plans: [completion proposal](docs/plans/completion-proposal-2026-10-17.md), [execution ledger](docs/plans/completion-execution-2026-10-17.md), [consolidated review record](docs/reviews/completion-review-2026-10-17.md).

## 9. Backlog — what to do next

Ordered. Pick the top item whose prerequisites are met; move finished items to §8 / HISTORY.

### Ready now — local only, no spend, no live world, no publication

1. **Dead code and localization sweep** (flagged by C12 §3.5, never done): exports with no production consumer (`findFundamentalRune`, `availableEffectKinds`, others) and unused `lang/en.json` keys (`NoExemplars`, `Generator.CreateAll`, `Presets.*Tooltip`...). Haiku worker; verify each with grep across `scripts/ templates/`; keep anything a test uses; gate must stay green.
2. **Release-asset parity check for v0.3.5.74**: download both assets, compare digests and every archive entry against `d0ec85e` (mirror C01 §2 method). Documentation outcome goes to the acceptance ledger R01 prerequisites.
3. **Level-shift entry point design note** (decision (a) above): write a one-page proposal (gated Creature Tools section + `api.levelShift`, preview-first, same rollback contract) so the user can approve or decline. No code until approved.
4. **Link check in the gate**: add a dependency-free relative-link checker for `*.md` to `tools/` and call it from `check.mjs`, so the reorganized docs cannot rot.

### Needs user authorization — live world and/or provider spend

5. **Install .74 module-only** in the `test` world (R01), then **Batch A** (R02: level-1 Guard/Thief with Legal Lore, ceiling 1 generation / 40,000 tokens) plus the zero-spend windows R06, R07, R21.
6. **Batch B** (R03 Guard/Fighter Warfare Lore, R04 higher-level Rogue, R05 Investigator boundary) only after Batch A passes.
7. **N01–N08** experimental/multiclass/editor native rows — enable the gates in the test world only for the session; disable afterwards.
8. **Batch C/D** (encounter R11–R13 with the rollback harness, NPC focus R19, forge activations R15–R18, source switch R08–R09).

### Needs a decision or an external resource

9. Screen-reader session (R22) and isolated PF2e 8.4.1 smoke (R24): obtain operator/environment or record an explicit deferral in the ledger and README.
10. Caster multiclass dedications and PC spell editing: blocked until a supported casting/grant path is identified and accepted.
11. Enabling any experimental or multiclass gate by default: a separate reviewed change after its N rows pass.

### Standing hygiene

- Keep HANDOFF.md truthful at every stop. Keep §8 of this file truthful whenever a release, install or QA result lands.
- Prune merged `codex/*` remote branches only with the user's say-so.
