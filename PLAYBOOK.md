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
| **Player Character** | A level-N PC built from real Ancestry/Background/Class/heritage/feat items so pf2e derives the math itself | GM-reviewed beta; complete-only classes Fighter, Rogue, Investigator, Wizard (Wizard added 2026-10-26, zero live evidence) |
| **Item Forge** | Magic items: passive wondrous items from cloned Rule Elements, 1/day activations via prewritten macros, runed weapons/armor; scrolls and wands of real spells cloned from the pf2e blank rank templates | Core flows live-verified; scrolls/wands built 2026-10-26, **not live-verified** |
| **Experimental tools** (off by default) | `/forge <brief> <level>` chat command; Creature Tools reskin + native elite/weak | Built, reviewed, **not native-accepted** |
| **Ordinary multiclass** (off by default) | Noncaster dedication catalog for PCs (`multiclassArchetypes`); Free Archetype slots (`freeArchetype`); both settings default off | Built, **not native-accepted** |
| **Level shifting** (off by default) | New NPC at level ±1/±2 via GM Core benchmark deltas; source unchanged | Built behind `experimentalTools` (Creature Tools section + `api.levelShift`), **not native-accepted** |
| **Hazard generator** (off by default) | A simple or complex `hazard` actor; every number from GM Core "Building Hazards" tables (`hazard-tables.mjs`); the AI picks scale words, enum slugs and prose only | Built behind `experimentalTools` (generator Hazard mode) 2026-10-26, **not native-accepted** |

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
6. **Fail closed.** An unresolved pick is dropped with `console.warn`, never guessed. Exceptions (empty is worse than approximate): a PC feat slot may fall back only to unused exact candidates from the same slot; a PC caster's spell list may be completed from the vetted real tradition candidate list, but planned spells never fall back to unvetted names. Skill preferences fall back to labeled key-ability defaults. Missing budgets/schedules or unsupported native mechanics are never guessed.
7. **Local tests never close a native acceptance row.** Report implemented / reviewed / published / installed / live-accepted as five separate facts.
8. **Never spend the user's provider tokens, write to the live world, publish, or run `gh` without an explicit, scoped, current authorization.** Approval of one batch is not approval of the next.

### Verified against real pf2e source — do not re-litigate

- Setting all five `build.attributes.boosts` tiers regardless of level is safe (`character/document.ts` slices each tier by `allowedBoosts`).
- A PC spellcasting entry's `proficiency.value` is a floor, not a cap (`spellcasting-entry/document.ts` takes `Math.max` with the actor's `base-spellcasting` rank, which class features raise).
- `details.languages.value` is not truncated to max; the system adds Int mod to `build.languages.max` itself.
- Not writing `system.price`/`system.level` on a runed item is correct (`physical/document.ts` recomputes both via `computeLevelRarityPrice()` every prep).
- A character's `resources.focus.max` is zeroed every prep and rebuilt only from ActiveEffectLike rules, so the PC focus pool needs a cloned RE; an NPC's can be plain actor data.
- PF2e 8.4.1 `TreasurePF2e#isCoinage` is `system.category === "coin"` (`src/module/item/treasure/document.ts`). `stackGroup === "coins"` is the pre-8.4.1 source field; 8.4.1 `TreasureSystemData.migrateData` maps it to `category: "coin"`. Never hand-author coin items; clone the published Gold/Silver/Copper/Platinum Pieces documents. `ActorInventory.addCurrency` loads those same published coin docs from `coinCompendiumUuids` in `src/module/actor/inventory/index.ts`.
- NPC sheets forbid raw `feat` items (`actor/npc/document.ts` allowedItemTypes); feats become action items via `featToAction`. NPC `classDC` is a native level-derived value; Stunning Blows' save must be bridged to `@actor.attributes.classDC.value`.
- `applyAdjustment` (elite/weak) returns immediately for an already-selected state; the module never recomputes elite/weak math.
- Two different mechanisms write a feat's `system.location`: slot feats use `"<group>-<level>"`; an ABC item's own granted feat uses the granting item's embedded `_id`.
- In PF2e 8.5.0 the Guard background has `trainedSkills.lore: []`; its Legal/Warfare choice exists only in prose, hence the explicit Background Lore control. Current pf2e master stores the non-concrete descriptor `"<Legal or Warfare> Lore"` instead; `scripts/pc-background-lore.mjs` handles this.

### Signed-off module decisions (not rules, but settled)

- Focus pool size = spell count capped at 3 (module default, not GM Core). Focus-only NPCs (no tradition, so no DC) unsupported.
- Rarity cap applies to ancestry/background/heritage only.
- Level shifting supports deltas −2, −1, +1, +2 only; narrow caster policy; abilities unchanged, skills shifted; first-instance Strike damage shifted; result named `<name> (Level T)`. Confirmed by the user on 2026-10-25; the gated UI shipped in the 2026-10-25 sprint.
- A one-level benchmark delta is **not** the flat elite +2; a level-shifted clone must have `attributes.adjustment` null (C10 design decision, not pf2e source).
- Multiclass catalog (PF2e 8.5.0 names): Fighter, Investigator, Barbarian, Monk, Ranger dedications + listed package feats; caster dedications unavailable.

## 4. Architecture

Three pipelines over shared compendium/table infrastructure, plus the experimental tools that reuse them.

**NPC / creature** (`builder.mjs`) — `generateConcept()` (one call, returns *scales* not numbers) → `normalizeConcept()` → spell narrowing/selection (2 calls) → equipment selection (1 call) → ground feats/abilities/loot against bounded real catalogs → `resolveConcept({ exactContent: true })` builds a completion manifest (any unresolved required pick blocks creation) → `createActor()` clones real items, applies runes/quantities, verifies persisted sources and spell links, commits. Encounter mode runs `designEncounter()` once then this pipeline per member. NPC class-feat requests resolve through `npc-ability-packages.mjs` (complete verified dependency graphs, e.g. Stunning Blows → Flurry of Blows + unarmed strike + class-DC bridge).

**Player Character** (`pc-builder.mjs`) — no math layer. Embed real ABC/heritage/feat items with correct `system.build` data and pf2e derives AC/HP/saves itself. `normalizePCConcept()` → identity binding (`pc-identity.mjs`, `pc-background-lore.mjs`) → `resolvePCConcept()` (ABC/grants/feat slots via `pc-prerequisites.mjs`, skills via `pc-skills.mjs`, class paths via `class-paths.mjs`, ChoiceSets via `choice-set.mjs`, multiclass via `pc-multiclass.mjs`) → editable preview (`pc-edit.mjs` contract, `pc-editor.mjs` form mapping) → `createCharacterActor()` → `pc-loadout.mjs` readies gear after native proficiencies exist.

**Item Forge** (`item-builder.mjs`, `rule-templates.mjs`, `macro-templates.mjs`, `runes.mjs`) — passive items clone unchanged REs from eligible published equipment; activations use four prewritten macro bodies; runed weapons/armor clone a real base plus real rune items. PF2e derives final price/level.

**Experimental** — `forge-command.mjs` parses `/forge` and feeds the Monster lifecycle; `reskin.mjs` + `reskin-policy.mjs` clone one exact bestiary NPC and append AI flavor proven inert; `creature-tools.mjs` wraps those plus native `applyAdjustment` and the level-shift flows; `level-shift.mjs` + `level-shift-policy.mjs` build a new NPC by benchmark delta. All pass through `experimental-tools.mjs`.

**Shared** — `completion.mjs` (required-content manifests, persisted-source checks) and `post-create.mjs` (commit/rollback boundary: failures roll back only new documents; failed cleanup reports survivors and discards the draft to prevent duplicate retries). `compendium.mjs` (`findEntry` fuzzy match, pack indexes, candidate lists, `priceToGp`, `RARITY_RANK`), `async-cache.mjs` (pending-load coalescing, failed-load eviction), `ai.mjs` (all provider calls, streaming SSE, retry-once, fail-closed JSON), `tables.mjs` / `pc-tables.mjs` (benchmarks, PC cadence, casting profiles).

### Module map (`scripts/`)

| Domain | Modules |
| --- | --- |
| Entry & apps | `simplypf2e.mjs` (hooks, `module.api = { open, openItemForge, openCreatureTools }`), `app-base.mjs`, `generator-app.mjs`, `itemforge-app.mjs`, `creature-tools-app.mjs`, `provider-setup-app.mjs`, `sources-app.mjs`, `manage-presets-app.mjs`, `progress.mjs`, `tokens.mjs` |
| AI | `ai.mjs`, `ai-task-profiles.mjs`, `ai-candidate-format.mjs`, `ai-response-validation.mjs`, `presets.mjs` |
| Settings & gates | `settings.mjs` (`freeArchetype`, `multiclassArchetypes`, `experimentalTools`; client-local connection bank), `experimental-tools.mjs` |
| NPC | `builder.mjs`, `encounter.mjs` (creature and hazard XP), `npc-ability-packages.mjs`, `art.mjs`, `tables.mjs` |
| Hazard | `hazard-tables.mjs` (GM Core Building Hazards tables), `hazard-builder.mjs` (concept normalization, prose policy, actor source), `hazard-labels.mjs` |
| PC | `pc-builder.mjs`, `pc-identity.mjs`, `pc-background-lore.mjs`, `pc-support.mjs`, `class-paths.mjs`, `pc-prerequisites.mjs`, `pc-skills.mjs`, `pc-loadout.mjs`, `pc-tables.mjs`, `choice-set.mjs`, `pc-multiclass.mjs`, `pc-edit.mjs`, `pc-editor.mjs` |
| Forge | `item-builder.mjs`, `rule-templates.mjs`, `macro-templates.mjs`, `runes.mjs`, `spell-consumables.mjs` (pinned scroll/wand templates; also used by NPC loot scrolls) |
| Experimental | `forge-command.mjs`, `reskin.mjs`, `reskin-policy.mjs`, `creature-tools.mjs`, `level-shift.mjs`, `level-shift-policy.mjs` |
| Shared | `compendium.mjs`, `completion.mjs`, `post-create.mjs`, `async-cache.mjs`, `text.mjs` |

Modules named `*-policy.mjs`, `pc-edit.mjs`, `pc-editor.mjs`, `pc-skills.mjs`, `progress.mjs`, `text.mjs`, `encounter.mjs`, `hazard-tables.mjs`, `hazard-builder.mjs`, `spell-consumables.mjs` are pure (no Foundry globals) and node-testable without stubs.

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
tools/check.mjs      the CI gate: syntax, check-integrity.mjs (ESM linking, templates, i18n), check-links.mjs (Markdown links), every regression, JSON — not shipped
tools/check-pf2e-drift.mjs   opt-in, network: module's pf2e references vs upstream at a ref (see §7) — not shipped
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
- Before calling anything done: `node tools/check.mjs` (CI runs it on Node 22; locally only Node 26.x is installed under mise and passes — Node 22 is NOT installed, so if a Node-version-specific failure is suspected, `mise exec node@22 -- node tools/check.mjs` would first download Node 22) and `git diff --check`.
- Add a `tests/*.test.mjs` for genuinely pure logic behind any bug-shaped change. Do not add tests that merely restate implementation.
- Live Foundry behavior (rendering, derived stats, grant chains, dialogs) is **not** self-checkable from this machine. Say so in the PR body and in HANDOFF.md, and open/keep the ledger row.

<!-- omh:agent-instructions:begin -->
### Orchestration

Which section applies depends on what runs the session. The shared rules apply to every run; then pick the run shape.

#### Shared rules (every run)

- **Worktrees for parallel work.** Each worker gets its own git worktree, and each shared file has one owner. The coordinator owns `PLAYBOOK.md`, `HANDOFF.md`, `docs/HISTORY.md` and `docs/README.md`. A worker touches one of them only when its brief names the paragraph.
- **Complete briefs.** A brief names the exact files owned, what not to touch, the verification command, the commit message and the report shape.
- **Kept with the coordinator.** pf2e schema verification and release or workflow `.yml` reasoning are never delegated. The worker fetches and quotes real source; the coordinator spot-checks the quote.
- **Independent review.** A schema-dependent or balance-sensitive diff (pf2e fields, encounter budget and XP math, hazard tables, Rule Elements) gets a reviewer with fresh context who did not build it, before the change is called done. This has caught real bugs before.
- **Reports are not evidence.** A worker report, an OMH route, a card or a handoff is prepared work. Done means observed output from `node tools/check.mjs` and `git diff --check` in the run.
- **Record what ran.** Each worker reports the model and reasoning effort it actually ran, not the one requested.
- **Fix ladder.** The coordinator checks each review finding against the code before acting on it. A confirmed finding goes to the lowest rung first and moves up one rung only when that rung fails (wrong fix, gate still red, or the reviewer rejects it). The report records which rung fixed each finding.

#### OMH-native DAG runs (Hermes parent)

Use this shape when a Hermes session runs an OMH DAG with native `delegate_task` children. The Claude roster below does not apply.

- **Coordinator.** The active Hermes parent stays the coordinator at its actual model and effort. Nothing here assumes the parent is any particular model. Report the parent's model as observed.
- **Route each child in its dispatch turn.** Before each `delegate_task`, call `omh_delegate_route` with `action=set` in the same turn. In the TUI and CLI a route set in an earlier turn is restored when that turn ends, so the child would run on the parent's model. Sequence per lane: set the route, dispatch that lane, then set the next lane's route. A route change does not affect children already running.
- **Choose the category by difficulty (suggested).** Bounded, already-specified execution: `quick` or `simple-work`. Escalation: `deep`. Independent review: `architect`. The category resolves to a model through OMH's chain; the report records the model that actually ran.
- **Named models.** When the user names a model for a run, pass it as `model` (with `provider`) on every lane of that run, and keep the category for the lane label.
- **Unavailable models are never silently substituted.** Hermes has no provider-side fallback. A child whose model the account cannot serve fails with an HTTP 400 yet still reports as completed. Treat a completed child with no recorded model usage as a failed dispatch. Then either stop and report, or advance with `omh_delegate_route` `action=fallback` and state in the report which model was named, which was unavailable and which ran. When the user named the model, ask before falling back.
- **Per-child report.** Lane; route set (category or model, and effort); model and effort observed in the delegation record; files changed; commands with exit codes; blockers. The parent's final report lists the same fields for every lane.
- **Review.** The reviewer is a separate child on a review route, not the builder. Re-review is capped at two rounds; after that, remaining blockers that cite a criterion are reported, not re-reviewed.

#### Claude Code and opencode runs (conditional)

Use this shape when the session is Claude Code, opencode or Orca rather than an OMH-native Hermes DAG. This is the user's standing roster (revised 2026-10-26): follow it without being told again, and change it only when the user says so.

- **Orchestrator: Claude Fable 5.5 at high thinking.** Plans, writes briefs, delegates, verifies, integrates, owns HANDOFF.md and the final report. Does not do bulk execution itself. May spin up as many subagents as the work needs. Codex, opencode and omp are available at the orchestrator's judgment.
- **Workers**, one of:
  - **Claude Haiku 5.5 at very high thinking** (`effort: xhigh`) for bounded, already-specified execution (apply a mapped fix, write a test mirroring an existing one, mechanical moves/renames, doc synthesis from named sources).
  - **opencode on a free model, `opencode/glm-5.3-flash-free` or `opencode/beam-free`, at very high thinking** (match the Haiku level; see §7 for how the model is set).
- **Escalation:** if the orchestrator judges a task needs more reasoning than a Haiku worker can give, it may upgrade that worker to **Claude Sonnet 5.5** (same brief, same worktree rules). Say so in the brief and in the report.
- **Parallel work** uses git worktrees (`isolation: worktree`, one worker per worktree, one owner per shared file).
- **Merge, review, fix ladder (addendum 2026-10-26):**
  1. **Merge.** When a worktree's work is complete, merge it into a local integration branch (`claude/<topic>-<date>`). Nothing goes to `main` directly.
  2. **Gate** the integration branch: `node tools/check.mjs` and `git diff --check`.
  3. **Review.** Claude Opus 5.5 at high thinking reviews the integration branch with fresh context (not a builder). The orchestrator verifies each finding technically before acting on it.
  4. **Fix, escalating one step at a time.** Haiku 5.5 at very high thinking first; if it fails, Sonnet 5.5 at very high thinking; if that fails, Opus 5.5 at very high thinking. Record the rung that fixed each finding.
  5. **Re-gate and re-review** after fixes. Repeat from step 3 until the reviewer has no open findings; then the user decides whether to open or merge the PR.
- **Review handling:** verify technically before accepting a reviewer finding. If the user merged mid-review, put the fix in one follow-up PR per merged PR.
<!-- omh:agent-instructions:end -->

### Session protocol

Start: read PLAYBOOK §7–8 and HANDOFF.md; `git status`, `git log --oneline -10`, `git fetch`; check whether an in-flight PR merged (`curl -s "https://api.github.com/repos/simplyjaytea/simplyPF2e/pulls?state=all&per_page=3"`).

End (or before any risky long operation): overwrite HANDOFF.md; append HISTORY.md; update PLAYBOOK §8 if current state changed; leave the tree clean or committed on a named branch. Never leave uncommitted work on `main`.

### Live QA discipline

Live QA runs on the user's Foundry (Foundry 14.365 / PF2e 8.5.0, world `test`) and spends the user's provider tokens. Each batch needs: the exact ledger rows, generation count ceiling, token ceiling, stop condition (stop at first unexplained failure), and the user's explicit go. Record actual usage; retain failed-run usage. Preserve every existing QA artifact listed in [docs/evidence/live-qa-inventory.md](docs/evidence/live-qa-inventory.md). Module-only updates; never touch core/system/world settings.

## 7. Environment

- No local Foundry. No local pf2e checkout; fetch files from GitHub raw as needed (reachable).
- `gh` CLI hangs on this machine. Read GitHub via `curl https://api.github.com/repos/simplyjaytea/simplyPF2e/...`; push/PR only with the user's authorization.
- opencode model selection: Orca cannot pass a model at worker launch. Set `"model"` in `~/.config/opencode/opencode.json` (e.g. `opencode/beam-free` with high thinking) before launching, confirm the TUI footer shows the model and effort, then restore the user's default `opencode/glm-5.3-flash-free`.
- Node via mise: only 26.12.1 is installed; Node 22 (used by CI) is NOT installed locally, and `mise exec node@22 -- node tools/check.mjs` would first download it. Gate takes ~7 s.
- Git identity for this repo: `user.name "jt"`, `user.email "jt_f@ymail.com"` (the checkout may show a different global identity; set it per-repo before committing).
- Prior sessions' worktrees lived under `/home/jtf/.t3/worktrees/` (Codex "T3"); remote branches `codex/*` are historical and may be pruned only with the user's say-so.

**Drift check:** `node tools/check-pf2e-drift.mjs [--ref <git-ref>] [--json]` compares the module's pf2e pack ids, `Compendium.pf2e` UUIDs, catalog names and fixtures with upstream `foundryvtt/pf2e` at `--ref` (default `master`; a tag such as `pf2e-8.5.0` pins a version). It needs network access and is deliberately kept out of `node tools/check.mjs`, which stays offline; exit 2 means the check could not run (network or rate limit), not that drift was found. Run it before every release and whenever pf2e ships a new version.

## 8. Current state — 2026-10-27

- **Latest release: v0.3.5.76**, published 2026-10-25T11:30:48Z from the PR #116 merge (`29add59`, post-release docs only). v0.3.5.75 (11:27:30Z) came from the PR #115 merge (`1248382`: playbook, test relocation, docs reorg, integrity gate, gated level-shift UI, .74 parity, Batch A runbook) and was parity-verified (digests match; 63/63 archive entries identical except the stamped manifest). **The 2026-10-26 sprint was merged into local `main` at `27ce615` by the user's explicit instruction (direct merge, no PR). That merge should publish v0.3.5.77; the 2026-10-27 session did not check the Auto Release.**
- **Local, not pushed (2026-10-27):** integration branch `claude/omh-encounter-wizard-2026-10-27` at `8e03283` is eight commits ahead of `main`. It holds Encounter-mode hazards (`4c83685`, behind `experimentalTools`; [plan](docs/plans/encounter-hazard-integration-2026-10-27.md)), the Wizard preflight closed-candidate check (`4865230`), the hazard design records (`05a2386`, `9fe217c`, `69a22f5`) and the OMH orchestration rules in §6 (`ba00ac9`). It is not on origin. No PR, no merge to `main`, no release.
- **Review (in progress):** a read-only verify pass on `8e03283`, with fresh context, found no unmet criterion. It raised a P2: the hazard concept request does not name the requested kind, so a mismatch is dropped at random after provider spend. It also raised P3s: a hazard row is labelled like a creature in `templates/generator.hbs`, and the plan status and §9 wording were stale (corrected by this close-out). That pass is not confirmed as the independent architect review the design note requires, and its SHIP verdict covers the local branch only; it is not an approval. Fixes are being prepared on `claude/encounter-review-fixes-2026-10-27` (edits in progress, uncommitted); they are not merged.
- **Native acceptance: unobserved.** No ledger row covers a hazard member inside an encounter; N10 covers the standalone hazard. The Wizard preflight has no native row (N09 open). Multi-member encounter checks remain open (§10).
- **Before any push:** merge the review fixes, run the final gate (`node tools/check.mjs`, `git diff --check`) and an independent re-review on the integration branch. The user authorized the push of `claude/omh-encounter-wizard-2026-10-27` only after that, and cleanup of the temporary worktrees afterwards.
- **Shipped in the 2026-10-26 sprint** ([plan](docs/plans/sprint-2026-10-26.md)): Wizard as a complete-only PC class with a per-bridge class-path contract and a fail-closed bridge-shape guard; Hazard generator mode behind `experimentalTools`; scrolls and wands in the Item Forge, with NPC loot scrolls migrated to the same pinned-template builder (rarity from the spell, `@UUID` description line, focus spells excluded); dead-code and lang-key sweep (0 unused keys); Markdown link check in the gate; opt-in pf2e drift check.
- **Last recorded installation: v0.3.5.72.** Nothing from .73 onward has been installed or natively exercised. Level shifting, Wizard, hazards, scrolls/wands, the PC editor, multiclass and Free Archetype have zero live evidence.
- **Local gate (2026-10-27, close-out commit on `8e03283`):** `node tools/check.mjs` exit 0 on Node v24.22.1, the PATH node this session (Node 26.12.1 and Node 22 not run): `Syntax passed: 54 scripts, 126 tests, 4 tooling files`; `Integrity passed: 330 imports, 829 exports, 15 templates, 580 localization keys; 0 unused keys`; `Links passed: 155 links in 52 files`; `Regressions passed: 126 files`. The integration run matched on every count except links (152 in 52 files before this commit).
- **Drift check** (`node tools/check-pf2e-drift.mjs --ref master`, 2026-10-26): 0 failures, 37 warnings (legacy alias; 16 `equipment-srd` UUIDs beyond the unauthenticated fetch budget; 13 fixtures that pin 8.5.0 and differ on master; 2 display-name literals).
- **Native ledger:** R01–R25 (22 OPEN, 3 BLOCKED) and N01–N11 all OPEN (N09 Wizard, N10 hazard, N11 scrolls/wands added 2026-10-26). Zero PASS rows. Known provider spend lower bound 333,213 tokens.
- **Decided 2026-10-26:** Wizard v1 = prepared arcane caster + closed school + closed thesis + Arcane Bond; curriculum extras, school focus spells and familiar actors stay manual. Hazard scale words are extreme/high/low; HP and hardness ranges resolve to the floor of the midpoint; the Low DC range resolves to its upper value; the Dispel Magic counteract rank is derived as `ceil(level/2)` clamped 1..10 (module convention). Scroll/wand templates are pinned by UUID; wand rank 10 is refused; cantrips, focus spells and rituals are refused.
- **Decided 2026-10-27 (user-approved; [plan](docs/plans/encounter-hazard-integration-2026-10-27.md)):** Encounter hazard v1, behind `experimentalTools`. The AI requests `none`, `simple` or `complex` and never writes a level or XP. The module takes the feasible level nearest party level within ±4 (ties upward) whose XP fits the budget left after the boss. If none fits, the hazard is dropped with a warning and the boss is not stepped down. At most one hazard; minions take the rest of the budget.
- **Open decisions the user owns:** a QA spending envelope for Batch A ([runbook](docs/plans/qa-batch-a-2026-10-25.md), which must be re-based on v0.3.5.77); screen-reader operator and isolated 8.4.1 environment, or explicit deferral.
- Historical narrative and the full bug log: [docs/HISTORY.md](docs/HISTORY.md). Research records for this sprint: [Wizard](docs/plans/wizard-research-2026-10-26.md), [hazards](docs/plans/hazard-research-2026-10-26.md), [spell consumables](docs/plans/consumables-research-2026-10-26.md).

## 9. Backlog — what to do next

Ordered. Pick the top item whose prerequisites are met; move finished items to §8 / HISTORY.

### Ready now — local only, no spend, no live world, no publication

1. **Loot actor container for Forge consumables**: create a pf2e `loot` actor holding a scroll/wand batch (fetch and quote the loot actor schema first). Bridge to a Treasure-parcel generator (GM Core Treasure by Level).
2. **Wizard school focus spell**: resolve the chosen school's "School Spells initial" `@UUID` link from its description into `focusSpells` (fail closed when unparseable); see research §4.
3. **Cantrip deck** in the Forge (template pinned already; builder refuses it today).
4. **Drift check with `GITHUB_TOKEN`** in CI on a schedule, so the 16 `equipment-srd` UUIDs are actually resolved; consider pinning `--ref` to the installed pf2e tag.
5. **Review leftovers (P3, 2026-10-26)**: filter casters out of the Character editor's class control (pc-edit refuses them); skip focus candidates in the spell step when `classModelsFocusSpells` is false; make the hazard AI gate require `strike.name` like the builder; assert the Forge TemplateMissing label.
6. **Hazard prompt breadth**: expose `CONFIG.PF2E.hazardTraits` subsets by theme to keep the prompt short on large worlds; measure prompt size first.

Done locally on 2026-10-27 (on `claude/omh-encounter-wizard-2026-10-27`, not pushed, not native-accepted; [plan](docs/plans/encounter-hazard-integration-2026-10-27.md)): hazards inside Encounter mode, gated by `experimentalTools` (review fixes in progress); the Wizard preflight refuses a bridge with no closed candidate before provider spend (`4865230`).

Done in the 2026-10-26 sprint ([plan](docs/plans/sprint-2026-10-26.md)): dead-code and lang-key sweep; Markdown link check; pf2e drift check; Wizard complete-only class; Hazard generator (gated); scrolls and wands. Done in the 2026-10-25 sprint ([plan](docs/plans/sprint-2026-10-25.md)): static integrity check in the gate; gated level-shift UI + `api.levelShift`; v0.3.5.74 release parity; Batch A runbook.

### Needs user authorization — live world and/or provider spend

7. **Install the latest release module-only** in the `test` world (R01), then **Batch A** (R02: level-1 Guard/Thief with Legal Lore, ceiling 1 generation / 40,000 tokens) plus the zero-spend windows R06, R07, R21.
8. **Batch B** (R03 Guard/Fighter Warfare Lore, R04 higher-level Rogue, R05 Investigator boundary) only after Batch A passes.
9. **N01–N11** experimental/multiclass/editor/Wizard/hazard/consumable native rows — enable the gates in the test world only for the session; disable afterwards.
10. **Batch C/D** (encounter R11–R13 with the rollback harness, NPC focus R19, forge activations R15–R18, source switch R08–R09).

### Needs a decision or an external resource

11. Screen-reader session (R22) and isolated PF2e 8.4.1 smoke (R24): obtain operator/environment or record an explicit deferral in the ledger and README.
12. Caster multiclass dedications and PC spell editing: blocked until a supported casting/grant path is identified and accepted.
13. Enabling any experimental or multiclass gate by default: a separate reviewed change after its N rows pass.

### Standing hygiene

- Keep HANDOFF.md truthful at every stop. Keep §8 of this file truthful whenever a release, install or QA result lands.
- Prune merged `codex/*` remote branches only with the user's say-so.

## 10. Known gaps (pointers)

Condensed from the former `CLAUDE.md` "Known gaps". User-facing wording lives in the [README Limitations](README.md#limitations); evidence lives under `docs/evidence/`.

- **NPC feat compatibility:** since v0.3.5.70, source-backed ability packages clone complete verified dependency graphs. Stunning Blows supports its verified Flurry source, class-DC bridge and unarmed support. Crane Stance (`Strike.replaceAll`), Deflect Projectile's hands-free predicate and arbitrary class resources/choices fail closed. Target-save, combat-turn and condition application are untested. See [automatic ability record](docs/evidence/npc-automatic-abilities-2026-09-09.md) and [NPC feat plan](docs/plans/npc-feat-plan-2026-09-09.md).
- **Skill completion limits:** unknown grant timing, non-floor native rank transformations and missing class data are warned, not inferred. Duplicate native feat grants and arbitrary new Lore replacements stay manual. Not a full feat-prerequisite validator or historical level-up simulator.
- **Native acceptance limits:** only bounded native checks exist (see [PC identity evidence](docs/evidence/pc-identity-2026-09-15.md), [consumer readiness](docs/evidence/consumer-readiness-2026-09-08.md) and the [acceptance ledger](docs/acceptance-ledger.md)). Nested backpack quantities/container links, multi-member encounters, duplicate-copy activation and screen-reader behavior are unverified; complete supported-PC acceptance is not established.
- **PC casting coverage:** seven supported Remaster casting profiles (Bard, Cleric, Druid, Oracle, Sorcerer, Witch, Wizard) are regression-checked against all 140 rows of the PF2e 8.4.1 class tables; ordinary signatures for the three qualified spontaneous classes are selected in the spell pass. Legacy/complex profiles, subclass-granted spells, restricted font/curriculum slots, bonus signature feats, variable-tradition consistency and full spellbook/familiar inventories are manual. Empty or invalid plans never invent preparations. Live casting acceptance is outstanding.
- **Wizard limits (v1, 2026-10-26):** complete-only on pf2e 8.5.0 data. Two level-1 bridges (Arcane School, Arcane Thesis) resolve to closed candidates only (14 schools, 4 theses at 8.5.0; Runelord, Rooted Wisdom, Unified Magical Theory and Experimental Spellshaping fail closed). The spellbook equals the prepared spells; curriculum extra cantrip and restricted slots, school focus spells and familiar actors are manual. Text-only theses and schools are created without automated effects. Any class whose level-1 item carries an unstaged ChoiceSet (master's two-entry Arcane School filter, for example) refuses the one-click build with a named error instead of opening a native dialog. Name-form uuid resolution (`Compendium.pf2e.feats-srd.Item.Familiar`) is unverified live; if it fails, Improved Familiar Attunement drops out. A chooser-free preflight (`preflightClassPaths`) removes a class from the offered list and fails identity validation before any provider call when a bridge shape is unsupported; it does not yet check that each bridge has at least one closed candidate, so that case still fails closed at Create. Wizard focus spells from the AI are dropped with a warning (no modeled school focus source). Record: [wizard-research-2026-10-26](docs/plans/wizard-research-2026-10-26.md).
- **Hazard generator limits (v1, gated):** numbers come from Archives of Nethys' transcription of GM Core Tables 2-13 to 2-16 (not in the pf2e repo; not checked against print). Published hazards sit off-table more often than on (research §3.7), so output is table-faithful, not sample-faithful. One melee strike per hazard; routine text is prose in `details.routine`; no immunities/weaknesses/resistances; no art lookup; Foundry's acceptance of the `hazard` source on 8.5 is unverified. Record: [hazard-research-2026-10-26](docs/plans/hazard-research-2026-10-26.md).
- **Scrolls and wands limits:** the native `createConsumableFromSpell` is unreachable from a module, so the module clones the pinned blank templates and mirrors the native field map; `magical` is kept unless `traits.value` holds a tradition word (native rule). Wand rank 10, cantrips, focus spells and rituals are refused; no cantrip deck, no staves, no mystified state; the Forge prompt lists traits but not traditions. Record: [consumables-research-2026-10-26](docs/plans/consumables-research-2026-10-26.md).
- **Free Archetype is catalog-only:** archetype slots take only the proven catalog, with dedication ability and lock checks at pick time and in the PC edit path. Native ChoiceSet prompts and live slot rendering are unverified.
- **Focus spells, v1 scope:** focus-only NPCs (no tradition, no DC) are unsupported; the pool size convention (spell count, capped at 3) is a module default. Both are signed-off decisions.
- **Rarity cap covers ancestry/background/heritage only.** `getFullCandidates()`'s `maxRarity` + `RARITY_RANK` exist if extending is wanted.
- **Item forge Phase 3:** no rune prerequisite/exclusivity validation; shield and ammunition runes are out of scope. Armor property runes are gated to the base armor's category (`propertyRuneFitsBase` in `runes.mjs`), but the material-constrained usages `etched-onto-metal-armor`, `etched-onto-lm-nonmetal-armor` and `etched-onto-medium-heavy-metal-armor` are excluded because an armor's metal-ness is not in the index data.
- **Roadmap gates:** `/forge`, Creature Tools reskin and elite/weak are behind default-off `experimentalTools`; noncaster multiclass behind `multiclassArchetypes`; none native-accepted. Level shifting is behind the same `experimentalTools` gate since the 2026-10-25 sprint, and the Hazard generator mode since 2026-10-26. Caster multiclass dedications are unbuilt. See [completion proposal](docs/plans/completion-proposal-2026-10-17.md).
