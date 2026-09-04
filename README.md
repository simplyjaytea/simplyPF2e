# SimplyPF2e

[![Latest release](https://img.shields.io/github/v/release/simplyjaytea/simplyPF2e?label=release)](https://github.com/simplyjaytea/simplyPF2e/releases/latest)
[![Foundry version](https://img.shields.io/badge/Foundry-v14-informational)](https://foundryvtt.com)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Turn a one-sentence idea into a fully statted Pathfinder 2e actor — monster, NPC, encounter, or player character — inside [Foundry VTT](https://foundryvtt.com), using the [Pathfinder Second Edition system](https://github.com/foundryvtt/pf2e).

> *"A cunning swamp hag who brews poisons from drowned travelers"* → a complete level-6 creature with statistics, strikes, spells, gear and loot, on its sheet, in about a minute.

**[Install](#install)** · **[Setup](#setup)** · **[Generate](#generate)** · **[Mode details](#mode-details)** · **[Troubleshooting](#troubleshooting)** · **[Limitations](#limitations)**

## Install

Paste this manifest URL into **Foundry → Add-on Modules → Install Module**:

```
https://github.com/simplyjaytea/simplyPF2e/releases/latest/download/module.json
```

The link always resolves to the newest release, so Foundry offers updates automatically. This line targets Foundry **v14** with the **pf2e** system **8.4.1**. Other version pairs need the same acceptance checks before being claimed as supported.

## Setup

1. Open **AI Provider Setup** under **Game Settings → Configure Settings → SimplyPF2e** (GM only), or click the gear beside the provider name in the generator.
2. Save a named connection (API Base URL, API Key, Model). Multiple connections stay in this browser so you can keep DeepSeek and a local server and switch which one generation uses.
3. Click **Save & Test**. That runs a tiny 64-token check through the same streaming path as generation and keeps setup open if the endpoint, key, model, CORS, or request shape is rejected. **Save & Authorize** skips the check for an offline provider.

| Setting | Description |
| --- | --- |
| Saved connections | Named profiles stored in this browser. The generator header switches the active one when more than one exists. |
| API Base URL | Any OpenAI-compatible API root or full `/chat/completions` endpoint. Defaults to DeepSeek. |
| API Key | Bound to that connection's exact Base URL. Leave blank for a keyless local server. |
| Model | The exact API identifier (`deepseek-v4-flash`, `gpt-5.6-luna`, …), not the marketing name. |

**Save & Test** may incur the provider's normal small token cost. Model listing does not. An empty model is caught before generation. If Foundry is served over HTTPS, an HTTP local provider is blocked by the browser.

> **Provider security:** requests go from the GM's browser to the configured provider. Keys are client settings, never synced to the world, and are not shown as plaintext in the ordinary Foundry settings form. Changing a connection's endpoint clears that profile's key unless a replacement is entered.

**Providers:** DeepSeek (`https://api.deepseek.com/v1`, recommended), OpenAI, OpenRouter, Ollama (`http://localhost:11434/v1`), and LM Studio (`http://localhost:1234/v1`). Local servers must allow the exact Foundry browser origin through CORS. Set Ollama's `OLLAMA_ORIGINS` to that origin; in LM Studio enable CORS in Developer → Server Settings.

Creativity, max response tokens, request timeout, and the optional Free Archetype variant live under advanced module settings. Grounding/selectors always use temperature 0. Complete one-click characters stop at level 2+ while Free Archetype is enabled, because that extra feat graph is not fully validated yet.

**Compendium sources:** by default the module draws from the PF2e system packs. Under **Compendium Sources** pick which Item packs supply abilities, spells, feats, equipment, and class features, plus which Actor packs supply bestiary scaffolds. Creature and encounter generation require an enabled bestiary Actor pack before they spend tokens.

## Generate

Open the **Actors** sidebar and click **SimplyPF2e** (GM only), or run `game.modules.get("simplypf2e").api.open()`. Pick a mode at the top.

| Mode | What it does |
| --- | --- |
| **Monster** | Creature-first combatant from a description and level (−1 to 24). |
| **NPC** | Story-focused, combat-ready non-player character. Same pipeline, different intent. |
| **Encounter** | Theme plus party level/size/threat → XP budget, roster, and a full creature pipeline per member. |
| **Character** | Real Ancestry/Background/Class items and feat slots. The pf2e system computes AC/HP/saves. |

**Generate** validates and creates in one pass. **Preview Plan** runs the same no-write plan first. The **dice** button sits beside Generate in every mode: it ignores the typed prompt, rolls a local surprise brief, and runs Preview Plan. Cancel aborts an in-flight generation (not a Foundry write already in progress).

Open **Advanced options** for a preset, rarity, treasure amount, and spellcasting. Character mode can also cap ancestry/background/heritage rarity. **Generate** is the quickstart; [Mode details](#mode-details) has the depth for Monster, NPC, Encounter, and Character.

## Status

| Feature | Status |
| --- | --- |
| **NPCs & monsters** | Stable. The oldest, most battle-tested path. |
| **Encounter mode** | Stable. |
| **Player Character mode** | Fighter stable; Rogue & Investigator offered — live grant-chain QA pending. |
| **Item forge** | Built and reviewed, **never verified in a live game**. Its UI buttons stay hidden; open it from the console (see [Item forge](#item-forge)). |

## What's new

- Smoother progress (fills within each step) with Cancel, thinking vs writing, and a compact last-run token cost that keeps **≈** when the provider did not report usage.
- Loot coins clone published PF2e currency items, so gold lands in the sheet's Currency section.
- The dice button is on all four generator modes.
- Named connection bank: save more than one provider profile in this browser and switch from the generator header.

## How it works

The AI never produces a number and never invents content. The job is split three ways:

| | Who decides | What that means |
| --- | --- | --- |
| **Concept** | The AI | Name, flavor, traits, and *which statistics should be extreme / high / moderate / low* — never the values themselves. |
| **Numbers** | The rules | NPCs: every stat comes from the GM Core **Building Creatures** benchmark tables for your chosen level. PCs: the PF2e system's own engine computes AC/HP/saves/proficiencies from the real embedded Ancestry/Background/Class items. |
| **Content** | Your compendiums | Every named spell, feat, ability, ancestry and item is matched against your installed packs and the **real document** is embedded. |

Every required published spell, feat, ancestry, background, class, item, and loot choice must resolve to the exact offered compendium document before one-click creation proceeds. A planned PC spell slot or a selected item with no exact document blocks creation; neither falls back to an unvetted name. Coins are built from real currency, and scrolls from an exact selected spell document. Deliberately custom creature narrative abilities stay visibly labeled and are never presented as published mechanics.

After Foundry creates a sheet, SimplyPF2e confirms that every exact source document survived and that each planned spell is attached to a real casting entry. A failed pre-commit check removes only the newly created documents. If Foundry cannot remove a partial actor or encounter folder, the plan is discarded and the survivor is named instead of allowing a duplicate retry. Sheet/notification display happens after the build commits, so a display error never removes a valid actor.

Creature strikes are constrained to PF2e's configured damage types, NPC attack traits, and attack effects. Ranged attacks use the system's structured range field rather than a legacy trait workaround.

## Mode details

### Monster and NPC

Describe the creature and set level (−1 to 24), then click the mode's Generate action to create and open the sheet. Choose **Preview Plan** to review the same validated plan without writing to the world.

Each creature also gets GM support baked into its notes: a **read-aloud block**, a **Recall Knowledge** line with the correct identification skill, a clickable check at the level- and rarity-based DC, and what a player learns on a success. **Art** is borrowed from the closest-matching bestiary creature, scored by shared creature-type traits, size and level.

### Encounter mode

Set party level and size, pick a threat (trivial → extreme), and give a theme — or roll one with the dice button. The module computes the XP budget and composition from the GM Core encounter rules (a headline creature matching the threat, backed by minions until the budget is spent); the AI then names the encounter and briefs each slot so the group feels cohesive, and every member runs the full creature pipeline.

The preview shows each member with count, level, role and key stats, plus the XP math and the group's total treasure value. **+/−** on each member adjusts how many you want (0 skips it), with the XP total updating live and turning red over budget. **Create All Actors** files the roster into a folder named after the encounter, numbering duplicates ("Goblin Skirmisher 1", "2", ...).

### Player Character mode

Describe a concept ("a grizzled dwarf ranger who hunts undead") and set a level (1–20), or use the **dice button** to ignore the prompt and roll a local adventurer brief at that level. In **Advanced options**, optionally cap the **Max rarity** of the ancestry/background/heritage the AI may pick — capping at Uncommon rules out Rare options like Fetchling, so they're never even offered.

Nothing here is scale-word math. A PC is assembled from real Ancestry, Background and Class items plus feats at every level slot (ancestry/class/skill/general per the Core Rulebook cadence, including any feat the background itself grants — like Acolyte's *Student of the Canon*), ability boosts, and skill increases past Trained. The PF2e system then computes AC, HP, saves and proficiencies exactly as it would for a character built by hand.

Complete one-click selection currently offers Fighter, Rogue, and Investigator. Rogue rackets and Investigator methodologies are chosen from enabled Class Features sources before the actor exists. Other classes are not widened just to produce a dialog-dependent or approximate build.

Starting wealth buys real gear rather than turning into raw coin, and fundamental runes on weapons and armor are capped to what the character's level actually allows. Single-class builds only — no multiclass archetypes, and no pre-create screen for swapping individual picks (regenerate instead).

After native features establish the character's actual proficiencies, the new sheet readies only its exact generated equipment: one proficient worn armor and no more than two hands of proficient weapons, shields, or tools. Incompatible or conflicting selections stay stowed and appear as a review warning. Compatible generated ammunition is selected for non-repeating reload-0 weapons; reloadable/repeating weapons, investment, and containers stay with the normal PF2e sheet controls.

**Skill completion:** the existing concept request supplies ordered core-skill preferences; no extra AI call or setup screen is needed. Preview shows those preferences followed by key-ability defaults. The module supplies the numbers: real class training plus native Intelligence, replacements for directly overlapping class/background training, and the class document's own skill-increase schedule. Increases are allocated in level order with the Expert/Master/Legendary gates, preserving native proficiencies and existing background Lore.

After creation, the generator shows a dismissible snapshot of resulting skill ranks, unspent/unsupported allocations, and any native choices with no recorded selection. Open Character returns to that exact actor. This is not a live validator or a repair tool: existing characters are untouched. Missing preferences use labeled automatic defaults; missing or invalid class schedules are not guessed.

### Item forge

> The UI buttons are hidden while this is unverified in a live game. A GM can open it from the browser console with `game.modules.get("simplypf2e").api.openItemForge()`; player calls are rejected.

Pick **Wondrous Item**, **Weapon**, or **Armor**, describe it, set level and rarity, and **Generate**.

**Wondrous items** get passive effects — item bonuses (AC, perception, saves, skills), resistances, weaknesses, immunities, senses, and speed grants — that *actually work* on a sheet, because:

- **Rule Elements are cloned from real published items, never written from memory.** Foundry fails *silently* on a wrong rule key — the ring just does nothing. So the forge finds a published item already carrying that kind of rule, clones it, and substitutes only the value, statistic or damage type. An effect kind with no real example in your world isn't offered at all.
- **Prices are empirical** — the median real compendium price at that level, scaled for rarity, not a remembered table.
- **Usage strings are harvested from real gear**, so the item slots correctly.

**Activated items** add a 1/day ability — damage, heal, condition, or self-buff — as a companion **macro**, with a clickable Activate link in the description and the macros filed in a "SimplyPF2e Item Forge" folder (auto-deleted with the item). Target a token, click Activate; damage and healing post as normal PF2e chat cards so the built-in Apply buttons handle the rest. Each copy tracks its own charge and recharges on a night's rest.

**Weapons and armor** use a rune pipeline: real base items, real property runes filtered by their actual usage string and the base armor category, and fundamental rune tiers whose real item level fits the target. The AI picks only from those candidates; the final price and level are summed from the resolved documents. Runes whose published restriction depends on armor material are excluded because the compendium index cannot prove material compatibility.

### Presets

The preset dropdown shapes the *build* while your description drives the *flavor*. "Level 5 hobgoblin veteran" + Fighter gives a disciplined soldier; the same prompt + Barbarian gives a reckless brute.

Eighteen built-ins: the twelve standard classes, plus six themes for concepts that don't map to one (Cultivator, Fire Mage, Assassin, Healer, Tank, Skill-Monkey). A preset can also carry defaults for rarity, spellcasting and Treasure amount.

- **Manage Presets** is the one place to create, edit, duplicate, export, or delete custom presets. It also offers Export All and Import. Export writes JSON you can hand to another GM; imports always get a fresh id so they never collide.

The description placeholder cycles five example concepts per preset as inspiration.

### Loot and treasure

Creatures carry what they drop: coins, consumables, scrolls and magic items, contextual to the creature and scaled to its level and rarity. Coins become real PF2e currency items (so they land in the sheet's Currency section) and scrolls are assembled the way the system does on spell drag-and-drop — the real spell embedded into the matching rank's scroll template.

The **Treasure amount** control shapes the haul twice. Up front it nudges what the AI proposes: Stingy leans to 2–3 cheap items and usually skips the magic item, Standard uses the baseline 3–8, Generous leans to 6–8 with at least one magic item. After generation the *value* is budgeted rather than guessed: the module computes a target from the GM Core Treasure by Level table (level, creature rarity, and the same Treasure setting), sums the real compendium prices of what was generated — runes included — and flexes the **coin** entries to land on target. Named items are never added or removed to hit a number.

Loot volume also follows your framing: describe a hoard or ask for "lots of loot" and the haul scales up. Happy with the creature but not the haul? **Reroll Loot** regenerates only the treasure.

## Troubleshooting

**Slow or stuck generations**

- Generation is **streamed** — you'll see one animated progress bar with a live percentage and token ticker. Reasoning models show "The model is thinking…" first; that's normal and can take a while. **Cancel** stops the in-flight request; it does not undo a sheet Foundry has already written.
- The **request timeout** aborts only on total silence from the provider, so slow-but-alive generations are never cut off. If you get timeouts, check the provider's status page and your model name.
- A large Ollama or LM Studio model may be silent while it loads, or while another request owns its only generation slot. Load/warm the model in the server first, wait for other work to finish, or temporarily raise **Request timeout**; a warm retry should start streaming much sooner.
- Check **Model** is the exact API identifier from your provider's docs. A wrong id normally returns an immediate error rather than hanging.
- Spellcasters make **three** AI calls (concept, a small spell-focus pass, then grounded selection), so they take longer. Creatures carrying gear make one more.
- After generation the preview shows an exact **token usage report** per call. If a provider doesn't report usage, the step is a clearly-marked estimate, and the compact last-run line beside the provider keeps **≈**.

**Odd results**

- **Missing an ability you expected** (Attack of Opportunity on a soldier, say) — the AI decides case by case; nudging the prompt usually gets it.
- **An unfamiliar item name** — the module targets current Remaster terminology. If it is not in an enabled source, the complete plan stops before creation; widen sources or choose a supported concept.
- **A plan reports unresolved content** — one or more required published picks was absent from the enabled sources. Use **Compendium Sources** to include the appropriate pack, then generate again.

## Limitations

**Generation quality**

- Presets guide the AI rather than constrain it; an occasional generation drifts. Regenerating usually lands it.
- Clickable rolls in custom abilities depend on the AI following the module's phrasing conventions. A phrase that slips through stays readable plain text.
- A custom (non-glossary) passive is only as interactive as its phrasing — anything outside the standard damage/save/check/heal/area conventions is flavor text you apply by hand.
- Required gear and treasure do not receive custom mechanical placeholders. An unresolved item blocks the complete plan instead of creating an approximation.

**Rules coverage**

- Complete one-click Player Character selection currently offers **Fighter, Rogue, and Investigator**. Wizard still needs verified class-owned spellbook and curriculum support. No class is widened merely to create a dialog-dependent or approximate build. NPCs retain spontaneous-style spellcasting entries.
- PF2e stores feat prerequisites as display text, not a general eligibility API. Complete-only catalogs keep a feat only when every published clause is readable and proven against the staged ancestry/background/class grants and already-known skill training. Unmet, malformed, or unprovable text (including most feat-chains, expert/master ranks not yet on the snapshot, and Free Archetype's extra graph) is dropped rather than guessed. Empty feat slots still block creation. NPC and legacy feat lists stay permissive.
- At level 2 or higher, enabling the module's Free Archetype variant stops complete one-click character generation before any AI request. Its eventual extra class-category feats are wired to the system's distinct `archetype-<level>` slots rather than ordinary class-feat slots.
- PC loadout readiness currently covers published equipment proficiency, one armor slot, the two-hand limit, and compatible selected ammunition for non-repeating reload-0 weapons. Reloadable/repeating ammunition, item investment, container placement, and broader item-specific activation requirements still use the native sheet controls.
- Matched feats become NPC action items — the PF2e system doesn't allow feat items on NPCs — keeping the feat's cost, rules text and automation.
- Only coin entries flex to hit the treasure budget. A haul whose named items already exceed it is left alone rather than losing items. Carried gear isn't counted against the budget.
- The benchmark tables were transcribed by hand from GM Core. If a value disagrees with the book, please open an issue.
- The rarity cap covers ancestry/background/heritage only — feats, spells and equipment aren't filtered by it yet.

**Not yet live-tested** (built, reviewed, and verified against the real pf2e system source, but not yet run in an actual game)

- **Rogue and Investigator** complete-only creation, including racket/methodology grant chains on a live sheet.
- **Focus spells**, for both PCs and NPCs. The pool size (spell count, capped at 3) is a defensible module default, not a verified GM Core rule. NPC focus spells only attach alongside normal spellcasting — a focus-only creature isn't supported.
- **Free Archetype.** Level-2+ complete one-click generation intentionally stops before provider spend. Its eventual slots are wired to PF2e's distinct `archetype-<level>` group.
- **Spontaneous spell-slot counts** for high-level PC casters are derived from the standard progression rather than copied from a verified table. Check a high-level caster's slots against Player Core before trusting them.
- **The item forge**, all three phases. If an item looks right in the preview but misbehaves on a sheet, that's the first thing to check. Its rune path has known gaps: no rune prerequisite or exclusivity validation (nothing stops Holy + Unholy), material-restricted armor runes are excluded, and shield/ammunition runes are out of scope. Category restrictions such as light-only or medium/heavy-only are enforced against the real base armor category.
- **Activated-item macros** lean on PF2e system APIs that can change between versions. Every call degrades to a plain descriptive chat message rather than throwing. Best-effort behaviours: a condition's duration is shown but not enforced, a save whose degree of success can't be read is left for the table to adjudicate, and 1/day recharge relies on the "Rest for the Night" flow firing.

## Roadmap

- [ ] **Chat command** — `/forge swamp hag 6` straight from the chat box during play.
- [ ] **Reskin an existing creature** — use a bestiary entry as the mechanical template and let the AI reflavor it.
- [ ] **Elite/weak adjustments** and level shifting for existing creatures.
- [ ] **Multiclass archetypes** and a pre-create screen for swapping individual PC picks.

Shipped features and their versions are in the [release notes](https://github.com/simplyjaytea/simplyPF2e/releases).

## For maintainers

Development conventions, architecture, and the full bug history live in [CLAUDE.md](CLAUDE.md) and [HISTORY.md](HISTORY.md).

Standalone, dependency-free regression checks guard historical bugs and production-safe pure helpers — `node scripts/<name>.test.mjs`, no framework required. CI syntax-checks every module, runs every `*.test.mjs`, and validates the JSON manifests on pull requests; the release pipeline repeats syntax and regression verification before publishing. Live Foundry behavior remains outside this suite and must be checked across supported Foundry/PF2e versions before a production release.

**Releases are automatic.** Every push to `main` triggers `auto-release.yml`, which bumps the last segment of the latest tag (`v0.3.5.1` → `v0.3.5.2`) and calls `release.yml` to build and publish. This means **merging to `main` is not a quiet, reversible action** — it ships a public release immediately, and every existing install is offered that update right away. Treat it with the care of a manual `gh release create`.

Manual paths still work for an out-of-band publish: push a tag (`git tag v0.4.0 && git push origin v0.4.0`) or run **Actions → Release → Run workflow**. Each verifies first, stamps the version into `module.json`, builds `module.zip`, and attaches both. Publishing a release directly in GitHub is intentionally unsupported because validation cannot stop an already-public release.

## Licensing & attribution

This module uses trademarks and/or copyrights owned by Paizo Inc., used under [Paizo's Community Use Policy](https://paizo.com/licenses/communityuse) and the ORC License. The benchmark values are rules data from *Pathfinder GM Core* © Paizo Inc. This module is not published, endorsed, or specifically approved by Paizo.

Module code is released under the MIT License (see `LICENSE`).
