# simplyPF2e — project brief

Foundry VTT module. An AI generates PF2e (Remaster) NPCs/monsters, Player Characters, and magic items from a text prompt. Every named pick is grounded against the real installed compendium; numbers come from GM Core benchmark tables (NPCs) or from the pf2e system's own derived data (PCs). Repo: `simplyjaytea/simplyPF2e`.

**Session history, the full bug log, and PR narrative are in [HISTORY.md](HISTORY.md) — check there before re-investigating anything.** This file holds only what is true right now.

## Glossary

- **Foundry** — the VTT this is a module for. **Actor** = a character/creature sheet. **Item** = anything embedded on one.
- **pf2e system** — the official PF2e ruleset package (`foundryvtt/pf2e`). "Real source" = that repo's actual TS/JSON, fetched live, not recalled.
- **Compendium / pack** — a bundled library of real game content. The module never invents content: a pick either matches a real document or is marked custom.
- **GM Core** — the sourcebook whose Building Creatures benchmark tables (AC/HP/save/attack by level) `tables.mjs` hardcodes. **Remaster** — the 2023+ edition; the AI is repeatedly reminded to use Remaster names.
- **ABC item** — Ancestry/Background/Class, the real items a PC embeds to derive stats. **Heritage** — a 4th, in its own pack.
- **Grant** — an item that auto-bundles another when embedded (an ancestry grants its features), via `system.items` on the granting doc.
- **Rule Element (RE)** — a JSON rule object in `system.rules` that makes something mechanically happen. Foundry fails **silently** on a wrong key, so a hand-typed RE can look right and do nothing.
- **Spellcasting entry** — the item holding a caster's spells + slots. `system.prepared.value` = `prepared`|`spontaneous`|`innate`|`focus`.
- **Tradition** — arcane/divine/occult/primal. **Focus spell / pool** — a small pool (1–3) spent on class spells, refilled by Refocus, separate from slots.
- **Slug** — lowercase-hyphenated id (`ghost-touch`). PF2e sometimes needs **camelCase** instead (`ghostTouch`) — NOT interchangeable, a recurring silent-bug source.
- **Trait** — a tag in `system.traits.value` used for filtering (real focus spells all carry `focus`).

## Invariants

1. **Clone a real RE from a published item; never hand-author one.** See `rule-templates.mjs`. No hand-written fallback exists, by design.
2. **When a system field name or shape matters, fetch the real `foundryvtt/pf2e` source** (`raw.githubusercontent.com/foundryvtt/pf2e/master/...`, reachable here) instead of recalling it. This has bitten the project repeatedly — see HISTORY.md's first two bug-log entries.
3. **The AI never emits a number or writes code.** It picks scale words and enum slugs; the module supplies values from tables, real documents, or pre-written macro bodies.
4. **Escape AI text before it reaches HTML** — use `text.mjs`'s `esc`/`toHtml`. Generated names/descriptions land in `system.description.value`, actor notes, and macro chat content.
5. **Fail closed.** An unresolved pick is dropped with a `console.warn`, never guessed. Exception: a PC feat slot or a PC caster's spell list, where empty is worse than approximate.

## Architecture

Three pipelines over shared compendium/table infrastructure.

**1. NPC / creature** (`builder.mjs`, the most battle-tested path)
1. `generateConcept()` (`ai.mjs`) — one call against SYSTEM_PROMPT; returns a concept in *scales*, not numbers.
2. `normalizeConcept()` — coerce/clamp into a safe shape.
3. Spells (2 extra calls): `chooseSpellFocus()` → keywords → `getSpellCandidates()` narrows the real tradition list → `selectSpells()` picks from it.
4. Equipment (1 extra call): keywords tokenized locally → `getEquipmentCandidates()` → `selectEquipment()`. Failure keeps first-draft names.
5. `resolveConcept()` — fuzzy-match every pick via `findEntry()`.
6. `createActor()` — build real items, apply runes/quantities/carry state, create the actor.

Encounter mode: `designEncounter()` picks a theme + per-role briefs once, then the whole per-creature pipeline runs per member (N× system-prompt cost). Loot reroll: `generateLoot()`, a small call on the concept summary.

**2. Player Character** (`pc-builder.mjs`) — no math layer at all. Embed real ABC/heritage/feat items with correct `system.build` data and the pf2e system computes AC/HP/saves/proficiencies itself. `normalizePCConcept()` → `resolvePCConcept()` (ABC/grants/feat slots/focus spells) → `createCharacterActor()`. Single-class, no multiclass, no pre-create edit screen.

**3. Item forge** (`item-builder.mjs`, `rule-templates.mjs`, `itemforge-app.mjs`) — standalone magic items. Phase 1 passive wondrous (cloned REs), Phase 2 1/day activated (generated companion macro; AI supplies only numbers/enum slugs), Phase 3 rune weapons/armor (real base + real rune items, prices/levels summed).

## Files

| File | Role |
| --- | --- |
| `ai.mjs` | All AI calls, SYSTEM_PROMPT, `pcSystemPrompt()`, `lootGuide()`. Streaming SSE, retry-once, fail-closed JSON parsing. |
| `ai-task-profiles.mjs` / `ai-candidate-format.mjs` | Pure per-operation token/sampling caps and compact grounded-candidate encoding. |
| `settings.mjs` | Foundry settings plus exact-endpoint API-key binding and local/keyless provider readiness. |
| `builder.mjs` | NPC pipeline + shared resolve/build helpers used by both actor pipelines (`resolveEquipment`, `resolveLoot`, `resolveFocusSpells`, `buildEquipmentItems`, `buildLootItems`, `filterItemTypes`, `applyTreasureBudget`, `enrichDescription`). |
| `pc-builder.mjs` | PC pipeline. First file to check when PC generation misbehaves. |
| `compendium.mjs` | `findEntry` fuzzy match, pack indexes (incl. the extended equipment index), candidate lists, `getPacksFor`/`getAllPacksFor`, `priceToGp`, `RARITY_RANK`. |
| `runes.mjs` | All rune knowledge: parse out of a name, apply as system data, cap tiers to level, price from real rune docs, item-forge candidate lists. Never hardcodes a rune level or price. |
| `text.mjs` | `slugify`, `capitalized`, `esc`, `toHtml`. Zero deps, node-testable. |
| `tables.mjs` | GM Core Building Creatures benchmarks + Treasure by Level (NPC-only). |
| `pc-tables.mjs` | Core Rulebook PC leveling cadence (boost/skill/feat-slot levels). |
| `rule-templates.mjs` | Harvests real RE exemplars from installed packs at runtime. Used by the forge and the PC focus-pool rule. |
| `item-builder.mjs` | Item forge: normalize, empirical pricing, item assembly. |
| `generator-app.mjs` / `itemforge-app.mjs` / `manage-presets-app.mjs` / `sources-app.mjs` | UI apps over `app-base.mjs` (token tracking + progress). |
| `encounter.mjs` | XP budget/composition math. |
| `presets.mjs` | 18 built-in build presets + custom preset CRUD + random briefs. |
| `*.test.mjs` | Standalone regression checks (`node scripts/<name>.test.mjs`); CI runs every check before release. |

## How to work here

- **Branch + PR, never direct to main.** A merge to `main` auto-publishes a public release to every install's "latest" manifest — treat it like a manual `gh release create`. `.github/workflows/*.yml` changes need a real test merge; syntax validity doesn't catch trigger-chain bugs (two were found that way).
- **Verify:** `node --check` on everything touched; run the `*.test.mjs` checks; add one for genuinely pure logic behind a bug-shaped change. Most behavior (does the actor render/compute correctly in a live world) is **not** self-checkable.
- Local git identity for this repo: `user.name "jt"`, `user.email "jt_f@ymail.com"`.
- The user sometimes merges a PR while a requested review is still running. If an audit is in flight, say so; fixes for a mid-audit merge ship as a new PR, not folded into the merged one.

## Verified against real pf2e source — do not re-litigate

- Setting all five `build.attributes.boosts` tiers regardless of level is **safe** — `character/document.ts` slices each tier by `allowedBoosts`.
- A PC spellcasting entry's `proficiency.value` is a **floor, not a cap** — `spellcasting-entry/document.ts` takes `Math.max` with the actor's `base-spellcasting` rank, which class features raise.
- `details.languages.value` is **not** truncated to max, and the system already adds Int mod to `build.languages.max` itself.
- Not writing `system.price`/`system.level` on a runed item is **correct** — `physical/document.ts` recomputes both via `computeLevelRarityPrice()` every prep.
- A character's `resources.focus.max` is zeroed every prep and rebuilt only from ActiveEffectLike rules, so the PC focus pool needs a cloned RE; an NPC's can be plain actor data.

## Current state (2026-07-30)

Last work: a full project audit, then an optimization pass, on `claude/project-audit-s2ezn0`.

Shipped in that pass: shared `text.mjs`/`runes.mjs` extracted (four copies of `esc`, two halves of rune logic, ~45-line duplicated item-embedding loops in both actor pipelines, four duplicated preview mappers); rune tiers now level-gated and priced from real rune docs; both grounding prompts carve out the `+N striking` prefix they were silently stripping; `resolveFeatPicks` dedupes across slots; a PC caster no longer loses spellcasting when grounding comes up empty; Create Actor follows the visible preview instead of the mode radio; missing `SIMPLYPF2E.Generator.Creature` i18n key added.

**Unverified in a live world** (all logic-level checked only): focus spells (PC + NPC), Free Archetype, Int languages, PC runes, PC gold spend, the six new presets, the consolidated progress UI, and the **entire item forge**.

**Next task: a live-Foundry test.** The PC pipeline has the largest unverified surface; the item forge's first live item creation is the other major gap.

## Known gaps

- **`pc-tables.spontaneousSpellSlots`** (2/3 slots per rank) is rules-derived, not copied from a verified table — an audit suggested sorcerers should get 4/rank. Needs a human with Player Core.
- **Free Archetype slot placement is approximate** — the archetype feat can collide with a regular class feat on `system.location` at the same even level. The real variant rule uses a separate feat group; this doesn't.
- **Focus spells, v1 scope:** a focus-only NPC (no casting tradition, so no DC) is unsupported, and the pool-size convention (spell count, capped at 3) is a module default, not GM Core guidance. Both are signed-off decisions.
- **Rarity cap covers ancestry/background/heritage only** — feats/spells/equipment were explicitly excluded. `getFullCandidates()`'s `maxRarity` + `RARITY_RANK` are already in place if extending is wanted.
- **Item forge Phase 3:** no rune prerequisite/exclusivity validation, shield/ammunition runes out of scope. Armor property runes ARE now gated to the base armor's category (`propertyRuneFitsBase` in `runes.mjs`), but the three MATERIAL-constrained usages (`etched-onto-metal-armor`, `etched-onto-lm-nonmetal-armor`, `etched-onto-medium-heavy-metal-armor`) are excluded from candidates entirely — an armor's metal-ness isn't in the index data, so they fail closed.
- **Unbuilt roadmap:** chat command, reskin-existing-creature, elite/weak adjustments, multiclass.
