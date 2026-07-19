# simplyPF2e — project brief

Foundry VTT module. An AI generates PF2e (Remaster) NPC/monster concepts and Player Characters from a text prompt; the module grounds every named pick (spell, feat, item...) against the real installed compendium and either computes numbers from GM Core benchmark tables (NPCs) or embeds real character-build items and lets the PF2e system compute them itself (PCs). Repo: `simplyjaytea/simplyPF2e`, GitHub.

**Session-by-session history, the full bug log, and PR-by-PR narrative live in [HISTORY.md](HISTORY.md) — check there before re-investigating something a past session already root-caused.** This file only holds what's true right now: architecture, key files, how to work here, and the current handoff state.

## Glossary

Terms used below without re-explaining each time:

- **Foundry (VTT)** — the virtual tabletop app this is a module for. An **actor** is a character/creature sheet; an **item** is anything embedded on one (a feat, spell, weapon, spellcasting entry...).
- **pf2e system** — the official Pathfinder 2e ruleset package for Foundry (`foundryvtt/pf2e` on GitHub) that this module builds actors on top of. "Real pf2e source" = that repo's actual TypeScript/JSON, pulled live via `gh api`/`raw.githubusercontent.com` when a schema fact needs verifying rather than recalling from training data.
- **Compendium / pack** — a bundled library of real game content (spells, feats, items, ancestries...) either from the pf2e system itself or an installed add-on module. This module never invents content — everything a generated actor carries either matches a real compendium document or is clearly marked as a custom/estimated fallback.
- **GM Core** — the PF2e sourcebook whose "Building Creatures" benchmark tables (AC/HP/save/attack scales by level) this module hardcodes for the NPC pipeline (`tables.mjs`). **Remaster** — the current (2023+) edition of PF2e rules text/names; the AI is repeatedly reminded to use Remaster names, not older pre-Remaster ones.
- **ABC item** — Ancestry/Background/Class, the three real compendium item types a Player Character embeds to derive its stats. **Heritage** is a related 4th type (a subtype of ancestry, lives in its own compendium).
- **Grant** — an item automatically bundling another item onto the actor when embedded (e.g. an ancestry grants its ancestry features; a background grants its one skill feat) — tracked via a `system.items` field on the granting document.
- **Rule Element (RE)** — a small JSON rule object (`system.rules` on an item) that makes something actually happen mechanically (a bonus, a resistance, a pool increase...) rather than just being descriptive text. This module's core safety principle: **clone a real RE from a published item, never hand-author one** — Foundry fails silently on a wrong key/field/shape, so a hand-typed RE risks looking correct while doing nothing.
- **Spellcasting entry** — the item type that holds a caster's spell list + slots/pool. Its `system.prepared.value` says which kind: `"prepared"`, `"spontaneous"`, `"innate"`, or `"focus"`.
- **Tradition** — arcane/divine/occult/primal, which spell list a caster draws from.
- **Focus spell / focus pool** — a distinct PF2e casting mechanic: a small pool (1-3 points) spent on class-granted spells, refilled by a 10-minute Refocus activity, separate from a normal entry's daily slots.
- **Slug** — a lowercase-hyphenated machine-readable id derived from a name (e.g. "Ghost Touch" → `ghost-touch`); PF2e sometimes instead needs **camelCase** keys (e.g. `ghostTouch`) for certain fields — these two shapes are NOT always interchangeable, a recurring source of silent bugs (see HISTORY.md's rune-key bug).
- **Trait** — a tag on a document (`system.traits.value`) used for filtering/matching — e.g. real focus spells all carry the `"focus"` trait.

## Architecture

Three independent generation pipelines, sharing compendium/table infrastructure but otherwise separate code paths:

### 1. NPC / creature pipeline (the original, most battle-tested path)

Per creature:
1. `generateConcept()` (`scripts/ai.mjs`) — one AI call against a large SYSTEM_PROMPT, returns a JSON concept in *scales* not numbers (str/dex/etc, AC/HP/save scales, strikes, specialAbilities, feats, equipment, loot, spellcasting draft).
2. `normalizeConcept()` (`builder.mjs`) — coerce/clamp the raw JSON into a safe shape.
3. Spells (if spellcasting): `chooseSpellFocus()` (tiny call, concept only) returns 3-6 keyword tags → `getSpellCandidates(tradition, maxRank, keywords)` (`compendium.mjs`) pulls real tradition spells filtered by keyword, falls back to the full list if filtered `< 12` → `selectSpells()` makes the final AI pick from that narrowed list. 3 AI calls total for casters.
4. Equipment (if any): `#refineEquipment()` (`generator-app.mjs`) tokenizes keywords locally (no AI call) from first-draft gear + strike names, `getEquipmentCandidates(level, keywords)` pulls real level-capped non-treasure items, `selectEquipment()` picks final gear. Any failure keeps the first-draft names.
5. `resolveConcept()` (`builder.mjs`) — fuzzy-matches every named pick (abilities/feats/equipment/loot/focus spells) against the compendium via `findEntry()`.
6. `createActor()` (`builder.mjs`) — builds real Foundry items, applies runes/quantities/carry state, creates the actor.

Encounter mode: `designEncounter()` picks a theme + per-role briefs once, then the full per-creature pipeline above runs once per party member (N× the system-prompt cost). Loot reroll: `generateLoot()` is a separate small call (concept summary only) that regenerates just the loot array.

### 2. Player Character pipeline (`pc-builder.mjs`)

Structurally different from NPCs: a PC doesn't need a benchmark-table math layer at all. Once real Ancestry/Background/Class/Heritage/feat compendium items are embedded on a `type: "character"` actor with the right `system.build` data, the PF2e system's own derived-data prep computes AC/HP/saves/proficiencies itself — this pipeline's whole job is "assemble a fully-grounded, real-item build," not "invent another stat-lookup table."

`normalizePCConcept()` → `resolvePCConcept()` (ABC/heritage/grant/feat-slot/focus-spell resolution against the compendium, all real-source-verified — see HISTORY.md's bug log for the schema mistakes found and fixed along the way) → `createCharacterActor()` (embeds the real items, sets ability boosts/skill ranks/feat slot locations/spell slots/focus pool). Single-class only, no multiclass, no pre-create edit screen.

### 3. Item forge (`item-builder.mjs`, `rule-templates.mjs`, `itemforge-app.mjs`)

A separate generator (Items directory button) for standalone magic items, not tied to actor creation. Three phases, same "clone real data, never hand-author" principle as everywhere else: **Phase 1** passive wondrous items (cloned Rule Elements from real exemplars), **Phase 2** 1/day activated items (a generated companion macro, AI supplies only numbers/enum slugs — never writes code), **Phase 3** rune-based weapons/armor (real base item + real rune items, prices/levels summed from the real documents, no memorized rune list).

## Key files

- `scripts/ai.mjs` — all AI calls + SYSTEM_PROMPT (creature schema) + `pcSystemPrompt()` (PC schema) + `lootGuide()`. Streaming SSE, retry-once, JSON repair for truncation.
- `scripts/builder.mjs` — NPC pipeline: `normalizeConcept`, `resolveConcept`, `computeStats` (GM Core table lookups via `tables.mjs`), `createActor`, `enrichDescription` (text→clickable roll links), shared `resolveFocusSpells()` (used by both NPC and PC pipelines).
- `scripts/compendium.mjs` — `findEntry` fuzzy match, `getSpellCandidates`, `getPacksFor`/`getAllPacksFor` (configurable + auto-detected source packs per category).
- `scripts/generator-app.mjs` — NPC/PC generator UI app, orchestrates both pipelines, token usage tracking, progress steps.
- `scripts/tables.mjs` — GM Core Building Creatures benchmark tables (NPC-only; PCs don't need them).
- `scripts/encounter.mjs` — XP budget/composition math for encounter mode.
- `scripts/rule-templates.mjs` — harvests real Rule Element exemplars from installed compendiums at runtime (never hand-authors RE JSON); used by both the item forge and the PC pipeline's focus-pool Rule Element.
- `scripts/item-builder.mjs` — item forge: concept normalize, empirical pricing, item data assembly from cloned exemplar rules or real base-item + rune-item documents summed.
- `scripts/itemforge-app.mjs` — item forge UI, mirrors `generator-app.mjs` patterns.
- `scripts/pc-builder.mjs` — PC pipeline: `normalizePCConcept`, ABC/grant/feat-slot/focus-spell resolution, `createCharacterActor` (embeds real items + sets `system.build` — NPCs get none of this).
- `scripts/pc-tables.mjs` — Core Rulebook PC leveling cadence (ability boost / skill increase / feat slot levels), hardcoded the same way `tables.mjs` hardcodes GM Core's NPC benchmarks.
- `scripts/*.test.mjs` — standalone regression self-checks (zero deps, `node:assert/strict`, `node scripts/<name>.test.mjs`, no framework/CI wiring) for pure logic behind specific past bugs. See HISTORY.md for what each one covers and why it exists.

## How to work here

- **Push feature work as branch + PR, not direct to main** (standing preference — the one exception was an explicit one-off user request to merge docs-only work directly, see HISTORY.md).
- **Releases are automatic on merge to `main`** (`.github/workflows/auto-release.yml` → `release.yml`): a merge is NOT a quiet, reversible action — it ships a public release immediately to every install's "latest" manifest URL. Treat a main-bound merge with the care of a manual `gh release create`. `.github/workflows/*.yml` changes specifically need an actual test merge to trust — `node --check`/YAML-syntax-validity doesn't catch trigger-chain bugs (two were found this way, see HISTORY.md).
- **Verification**: no full test suite. Run `node --check <file>` on anything touched; run the relevant `scripts/*.test.mjs` self-check(s) if the change touches logic one already covers, and add a new one for genuinely pure logic behind a historical-bug-shaped change (see existing `*.test.mjs` files for the convention). Most of this module's actual behavior (does a generated actor render/compute correctly in a real Foundry+pf2e world) is **not** self-checkable — it needs a live world, and this module has a real history of schema assumptions that looked right and weren't (see HISTORY.md's bug log before trusting an unverified schema claim).
- **When a real system field name/shape matters, pull the actual `foundryvtt/pf2e` source** (`gh api repos/foundryvtt/pf2e/contents/...` or `raw.githubusercontent.com/foundryvtt/pf2e/master/...`, both reachable from this environment) instead of recalling it from training knowledge. This has bitten the project repeatedly — see HISTORY.md's bug log, especially the first two entries.
- Local git identity for this repo only: `user.name "jt"`, `user.email "jt_f@ymail.com"` (no global config touched).
- The user sometimes merges a PR right after requesting a review/audit, occasionally before the audit finishes — if a requested independent review is still in flight, say so explicitly; a merge landing mid-audit needs its fixes shipped as a new follow-up PR, not folded into the already-merged original.

## Current state (as of 2026-07-20)

- **Focus-spell support** (PC + NPC) merged to `main` via PR #62 — real-source-verified, logic-level self-checked, **still not live-tested**.
- **Security/quality audit fixes** merged to `main` (commit `51fae80`): escaped AI-generated text before HTML injection (actor notes, macro chat messages), moved the API key setting from world to client scope so it no longer syncs to players, plus several smaller correctness/cleanup fixes. One finding was deliberately left unfixed and flagged rather than guessed: `pc-tables.mjs`'s `spontaneousSpellSlots` progression is unverified against Player Core's actual caster tables — needs a human with the rulebook.
- **PC generator bug/feature batch for issue #64** merged to `main` via PR #65: Intelligence-bonus languages, level-gated runes on PC gear, reduced duplicate-item padding, feat-slot retry on empty candidates, a new optional **Free Archetype** setting, curated skill-item prompt hints, PC generation spends down more starting wealth, a consolidated single-bar progress UI with percentage, six new themed presets (Cultivator, Fire Mage, Assassin, Healer, Tank, Skill-Monkey), and a soft steer toward common ancestries. All logic-level self-checked (11 `scripts/*.test.mjs` files pass), **not live-tested**. Known caveat: a Free Archetype feat and a regular class feat at the same even level can land on the same `system.location`, so the archetype feat still embeds but may not sit in a dedicated FA slot in the sheet UI — needs a live check.
- Item forge (all 3 phases) remains completely unverified end-to-end in a live game.
- **Next natural task**: a real live-Foundry test — the PC pipeline now has the largest unverified surface (focus spells, languages, runes, feat slots incl. Free Archetype, gold spend, presets, progress UI), so that's the highest-value place to start; the item forge's first live item creation is the other major gap. `pc-builder.mjs` is the first file to check if PC generation misbehaves; `builder.mjs`'s NPC `createActor()` for creature-side issues.

Full narrative for all of the above — what was tried, what broke, why — is in HISTORY.md.

## Known gaps / roadmap next

- Chat command, reskin-existing-creature, elite/weak adjustments: unbuilt roadmap items (see README's Roadmap, grouped by feature area).
- Item forge Phase 3: no rune prerequisite/exclusivity validation (nothing stops picking contradictory runes — prompt guidance only), armor property runes aren't filtered to the base armor's actual category, shield/ammunition-only runes are out of scope.
- **Rarity cap only covers ancestry/background/heritage candidates** — feats, spells, and equipment/loot were explicitly excluded (user's own scope choice), so a rare feat/item can still surface even with Max rarity set low. `getFullCandidates()`'s `maxRarity` param + `RARITY_RANK` in `compendium.mjs` are already there if extending this is ever wanted.
- **Focus spells have two deliberate v1 scope gaps**: a focus-only NPC with no normal spellcasting tradition isn't supported (no DC to cast from), and the pool-size convention (spell count, capped at 3) is a module default flagged as unverified against GM Core's actual creature-design guidance — same class of gap as `TREASURE_BY_LEVEL`. Both are explicit, signed-off scope decisions, not bugs.
- **`pc-tables.mjs`'s `spontaneousSpellSlots`** progression (2/3 slots per rank) is flagged unverified against Player Core's actual spontaneous-caster tables — a past audit suggested it may be off (e.g. sorcerer should get 4/rank). Left as-is rather than guessed at; needs a human with the rulebook before trusting a spontaneous PC caster's slot counts.
- **Free Archetype's slot placement is approximate**: the new archetype feat slot (see Current state) can collide with a regular class feat slot at the same even level on `system.location` — the feat still embeds, but may not land in a distinct Free Archetype slot in the sheet UI. The real PF2e variant rule uses a separate feat group; this module doesn't yet.
