# simplyPF2e — condensed project brief

Foundry VTT module. AI generates PF2e (Remaster) NPC/monster concepts; module computes numbers from GM Core benchmark tables; compendium matching fills real items. Repo: `simplyjaytea/simplyPF2e`, GitHub.

## Pipeline (per creature)

1. `generateConcept()` (scripts/ai.mjs) — huge SYSTEM_PROMPT, one AI call, returns JSON concept (scales not numbers: str/dex/etc, AC/HP/save scales, strikes, specialAbilities, feats, equipment, loot, spellcasting draft).
2. `normalizeConcept()` (builder.mjs) — coerce/clamp raw JSON into safe shape.
3. Spells (if spellcasting): `chooseSpellFocus()` — tiny call, concept only, returns 3-6 keyword tags. Then `getSpellCandidates(tradition, maxRank, keywords)` (compendium.mjs) — pulls real tradition spells, filters by keyword match on traits/name, falls back to full list if filtered <12. Then `selectSpells()` — final AI pick from that narrowed list. 3 AI calls total for casters.
4. `resolveConcept()` (builder.mjs) — fuzzy-match abilities/feats/equipment/loot names against compendium via `findEntry()`.
5. `createActor()` (builder.mjs) — build real Foundry items, apply runes/quantities/carry state, create actor.

Encounter mode: `designEncounter()` picks theme+briefs once, then full per-creature pipeline runs once per party member (N× system prompt cost).

Loot reroll: `generateLoot()` — separate small call, concept summary only (blurb/level/rarity/traits, no full description), regenerates just loot array.

## Key files

- `scripts/ai.mjs` — all AI calls + SYSTEM_PROMPT (creature schema) + LOOT_GUIDE. Streaming SSE, retry-once, JSON repair for truncation.
- `scripts/builder.mjs` — normalizeConcept, resolveConcept, computeStats (GM Core table lookups via tables.mjs), createActor, enrichDescription (text→clickable roll links).
- `scripts/compendium.mjs` — findEntry fuzzy match, getSpellCandidates, getPacksFor (configurable source packs per category).
- `scripts/generator-app.mjs` — UI app, orchestrates pipeline, token usage tracking (#recordTokens), progress steps.
- `scripts/tables.mjs` — GM Core Building Creatures benchmark tables.
- `scripts/encounter.mjs` — XP budget/composition math.

## Recent work (this session, commit 487362f on main)

- Spell selection: 2-stage keyword-focus-then-pick (cuts unbounded spell-list token dump).
- Equipment: added `value` field (gp estimate) end-to-end (prompt→normalizeConcept→resolveConcept→createActor); unmatched equipment now falls back to `customEquipmentItem()` (type "equipment") instead of vanishing; prompt broadened to explicit adventuring-gear category + armor-only-when-plausible guidance, count 2-6→3-8.
- Token trims: SYSTEM_PROMPT wording tightened (~8% smaller), generateLoot context dropped full description.
- Miss-rate logging added in generator-app.mjs (`equipment matches: X/Y` console log) to measure before building grounded equipment-candidate pass (not yet built — roadmap item).

## Known gaps / roadmap next

- Equipment not yet grounded against real compendium candidates like spells are (model names from memory, fuzzy-matched after). Measure miss rate first via console log before building.
- Treasure-budget pricing not implemented.
- Chat command, preset sharing, reskin-existing-creature: unbuilt roadmap items.

## Bug log

- **Attack of Opportunity not generating** (fixed, unreleased). Schema comment (ai.mjs specialAbilities.glossary) cited "Attack of Opportunity" as a valid glossary-ability example, but the design-guidance "use standard glossary abilities" enumeration bullet never listed it, so the model almost never picked it — schema comments alone don't drive output frequency, the design-guidance bullets do. Fix: added "Attack of Opportunity" to that enumeration + explicit call-out on the Soldier road-map line. **Pattern for future "X not generating" bugs**: check whether X is only mentioned once as a schema-comment example vs. actually reinforced in the "Design guidance" section — if it's schema-only, add it to the relevant enumeration/road-map bullet there, same fix shape.
- **Gold coins appearing in equipment** (fixed, unreleased). Coins are only supposed to live in `loot` (handled by `parseCoins()`/`normalizeLoot()` in builder.mjs, which map "Gold Coins"/"150 gold pieces"/"20 gp" to real currency). The `equipment` schema comment never told the model NOT to put coins there, so it sometimes did, and equipment has no coin-to-currency conversion — the coin name just became a junk placeholder item via `customEquipmentItem()`. Two-part fix: (1) added "NO coins or currency here" to the equipment schema comment; (2) defensive code fix reusing existing `parseCoins()` in `normalizeConcept()`'s equipment mapping (builder.mjs) to drop any equipment entry that parses as pure coins, regardless of what the model outputs. **Pattern**: prompt-only fixes are necessary but not sufficient for "wrong bucket" bugs — pair with a cheap defensive filter using logic that already exists elsewhere in the file, so a prompt regression doesn't silently reopen the bug.
- **Pre-Remaster item names leaking through (e.g. "Thunderstone" instead of "Blasting Stone")** — fixed on branch `fix/remaster-item-names` (commit `8b29a94`), not this branch. `LOOT_GUIDE` already told the model to use current Remaster names with an example, but the `equipment` schema comment never had that reminder at all — same "reinforced in one sibling field, missing in the other" shape as the two bugs above. Fix: extracted the reminder into a shared `REMASTER_NOTE` const (ai.mjs) with two concrete examples (Thunderstone→Blasting Stone, Bag of Holding→Spacious Pouch), interpolated into both `LOOT_GUIDE` and the `equipment` schema comment. **Pattern reinforced**: whenever the model names a published item/ability/spell in more than one schema field, grep for where the naming-convention reminder already exists and make sure every sibling field that also names published content gets the same reminder — ideally via a shared const, not copy-pasted text.
- **Passives were inert prose instead of "just working"** — also on branch `fix/remaster-item-names` (commit `8b29a94`). Custom (non-glossary-matched) passive `specialAbilities` only get automation from `enrichDescription()`'s phrasing conventions (damage/save/check/heal/area) — anything else (an aura, a conditional bonus, a persistent tick effect) is just prose the GM has to remember to apply. Real glossary-matched abilities (Regeneration, All-Around Vision, ...) get cloned wholesale from the compendium and carry actual working Rule Elements. Fix (prompt-only, deliberately NOT a new Rule-Element-generation feature — that's a much bigger, riskier feature, left for later if ever): added a Design-guidance bullet nudging the model to prefer a real glossary match for passives specifically, and to phrase any necessarily-custom mechanical passive using the existing DESCRIPTION CONVENTIONS so it stays clickable instead of unactionable prose.

## Workflow prefs

- Push feature work as branch + PR, not direct to main (user correction, applies going forward).
- Local git identity set in this repo only: `user.name "jt"`, `user.email "jt_f@ymail.com"` (no global config touched).
- No test suite in repo; verify JS changes with `node --check <file>`.
