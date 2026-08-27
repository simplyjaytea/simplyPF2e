# SimplyPF2e

[![Latest release](https://img.shields.io/github/v/release/simplyjaytea/simplyPF2e?label=release)](https://github.com/simplyjaytea/simplyPF2e/releases/latest)
[![Foundry version](https://img.shields.io/badge/Foundry-v13%2B-informational)](https://foundryvtt.com)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Turn a one-sentence idea into a fully statted, ready-to-run Pathfinder 2e actor — NPC, monster, whole encounter, or player character — inside [Foundry VTT](https://foundryvtt.com), using the [Pathfinder Second Edition system](https://github.com/foundryvtt/pf2e).

> *"A cunning swamp hag who brews poisons from drowned travelers"* → a complete level-6 creature with statistics, strikes, spells, gear and loot, on its sheet, in about a minute.

**[Install](#install)** · **[Setup](#setup)** · **[Usage](#usage)** · **[Troubleshooting](#troubleshooting)** · **[Limitations](#limitations)** · **[Roadmap](#roadmap)**

## How it works

The AI never produces a number and never invents content. The job is split three ways:

| | Who decides | What that means |
| --- | --- | --- |
| **Concept** | The AI | Name, flavor, traits, and *which statistics should be extreme / high / moderate / low* — never the values themselves. |
| **Numbers** | The rules | NPCs: every stat comes from the GM Core **Building Creatures** benchmark tables for your chosen level. PCs: the PF2e system's own engine computes AC/HP/saves/proficiencies from the real embedded Ancestry/Background/Class items. |
| **Content** | Your compendiums | Every named spell, feat, ability, ancestry and item is matched against your installed packs and the **real document** is embedded. |

Anything the AI names that doesn't match a real document is either dropped or created as a clearly-marked custom item — and flagged in the preview either way, with an "X/Y compendium matches" score in the header so you can see how grounded a build is at a glance.

Nothing touches your world until you click **Create**. Regenerate, edit the prompt, reroll just the loot, or discard, freely.

## Status

| Feature | Status |
| --- | --- |
| **NPCs & monsters** | Stable. The oldest, most battle-tested path. |
| **Encounter mode** | Stable. |
| **Player Character mode** | Released and hardened over several live-testing rounds, but younger than NPC mode. Sanity-check a generated character's numbers on its sheet before play. |
| **Item forge** | Built and reviewed, **never verified in a live game**. Its UI buttons are hidden for that reason; open it from the console (see [Item forge](#item-forge)). |

Recent additions — focus spells, Free Archetype, Intelligence languages, runes on PC gear — are on `main` but have not been through a live-play pass yet. See [Limitations](#limitations).

## Install

Paste this manifest URL into **Foundry → Add-on Modules → Install Module**:

```
https://github.com/simplyjaytea/simplyPF2e/releases/latest/download/module.json
```

The link is permanent — it always resolves to the newest release, so Foundry offers updates automatically. Requires Foundry **v13+** and the **pf2e** system (6.0.0+).

## Setup

Open **AI Provider Setup** under **Game Settings → Configure Settings → SimplyPF2e** (GM only), or click the gear beside the provider name in the generator. It is the single place to configure a provider's API Base URL, API Key, and Model. Pick a cloud/local preset. If its Model field is blank, click **Load Models**: setup saves and authorizes the displayed endpoint/key, then offers the provider's `/models` IDs without preventing manual entry. Confirm the model and click **Save & Test**. It makes a tiny 64-token check through the same streaming request path used for generation and keeps setup open if the provider rejects the endpoint, key, model, CORS, or request shape. **Save & Authorize** skips the check for an offline provider. A cloud provider may charge its normal small token cost for a test; model listing itself does not generate tokens, and the signal button beside a ready provider repeats the generation check later.

Provider setup:

| Setting | Description |
| --- | --- |
| API Base URL | Any OpenAI-compatible API root or full `/chat/completions` endpoint. Defaults to DeepSeek. |
| API Key | Your provider key, stored in this browser and bound to the exact API Base URL. Leave blank for a keyless local server. |
| Model | e.g. `deepseek-v4-flash`, `deepseek-v4-pro`, `gpt-5.6-luna` — the exact API identifier, not the marketing name. |

Advanced module settings:

| Setting | Description |
| --- | --- |
| Creativity | Sampling temperature (0–2) for creative generation. Grounding/selectors always use temperature 0. |
| Max response tokens | Global ceiling. Each operation applies a smaller production-safe cap where possible. |
| Request timeout | Aborts only if the provider sends *no data* for this long (default 90 s). |
| Free Archetype | Optional variant rule, off by default. Adds an extra archetype feat slot at every even level in Character mode. |

**Providers**

- **DeepSeek** — `https://api.deepseek.com/v1`, model `deepseek-v4-flash`. Cheap, strong JSON, the recommended default.
- **OpenAI** — `https://api.openai.com/v1`, model `gpt-5.6-luna`
- **OpenRouter** — `https://openrouter.ai/api/v1`, any hosted model
- **Ollama (local)** — `http://localhost:11434/v1`, usually no key. Set `OLLAMA_ORIGINS` to the exact Foundry browser origin (for example `http://localhost:30000`) so the browser may call it; avoid wildcard origins.
- **LM Studio (local)** — `http://localhost:1234/v1`, no key unless server authentication is enabled. Enable CORS in **Developer → Server Settings** (or start with `lms server start --cors`) for browser access. Keep the server bound to loopback, and enable authentication when CORS or LAN serving is enabled. **Load Models** lists only loaded models unless LM Studio's Just-In-Time loading is enabled. LM Studio 0.4.8+ honors Chat Completions reasoning controls; older versions still work through compatibility fallback but may not disable reasoning.

SimplyPF2e uses current OpenAI Chat Completions fields for OpenAI and the broadly supported OpenAI-compatible fields everywhere else. If a provider explicitly rejects an optional field, instruction role, or token-limit spelling, the module removes or negotiates only that part and retries the request. It also disables separate model reasoning for structured generation where the provider supports that control, so bounded response budgets are spent on complete JSON.

The provider and model currently in use are always shown at the top of the generator. An empty model is caught before generation. If Foundry is served over HTTPS, an HTTP local provider will be blocked by the browser; serve the provider over HTTPS, or access Foundry over HTTP on the same trusted local network. Local servers must also allow the exact Foundry browser origin through CORS.

> **Provider security:** requests go straight from the GM's browser to the configured provider. API keys are client settings, never synced to the world, and the ordinary Foundry settings form does not expose them as plaintext fields. Manage keys through the masked **AI Provider Setup** dialog; both save actions authorize a key only for the exact Base URL displayed there, and **Save & Test** additionally makes the small provider request described above. Changing endpoints clears the old provider's key unless a replacement is entered; changing the raw Base URL setting leaves any saved key disabled until the endpoint is confirmed. Existing keys from older SimplyPF2e versions also start disabled after this upgrade. Generated prompts and character data are sent to remote providers when a remote endpoint is configured.

### Compendium sources

By default the module draws from the PF2e system packs. Under **Compendium Sources** it scans every Item compendium in your world, detects which packs actually contain abilities, spells, feats, or equipment, and lets you pick which each category may use — so homebrew and content-module packs become available to the AI. The AI literally sees and picks from your homebrew spell list. An empty category falls back to the system defaults.

## Usage

Open the **Actors** sidebar and click **SimplyPF2e** (GM only), or run `game.modules.get("simplypf2e").api.open()`. Pick a mode at the top of the dialog.

### Single creature

Optionally pick a **preset**, describe the creature, set level (−1 to 24) and rarity, choose a **Treasure amount** and whether spellcasting is allowed, then **Generate**. Review the stat-block preview and **Create Actor**.

The **dice button** rolls a surprise instead: it ignores the description and rolls a brief locally (creature type × combat role × home × twist — thousands of combinations), so every click is a genuinely new idea. Good for filling a dungeon room.

Each creature also gets GM support baked into its notes: a **read-aloud block** for theater of the mind, a **Recall Knowledge line** with the correct identification skill, a clickable check at the level- and rarity-based DC, and what a player learns on a success. **Art** is borrowed from the closest-matching bestiary creature, scored by shared creature-type traits, size and level.

### Encounter mode

Set party level and size, pick a threat (trivial → extreme), and give a theme — or roll one with the dice button. The module computes the XP budget and composition from the GM Core encounter rules (a headline creature matching the threat, backed by minions until the budget is spent); the AI then names the encounter and briefs each slot so the group feels cohesive, and every member runs the full creature pipeline.

The preview shows each member with count, level, role and key stats, plus the XP math and the group's total treasure value. **+/−** on each member adjusts how many you want (0 skips it), with the XP total updating live and turning red over budget. **Create All Actors** files the roster into a folder named after the encounter, numbering duplicates ("Goblin Skirmisher 1", "2", ...).

### Player Character mode

Describe a concept ("a grizzled dwarf ranger who hunts undead"), set a level (1–20), and optionally cap the **Max rarity** of the ancestry/background/heritage the AI may pick — capping at Uncommon rules out Rare options like Fetchling, so they're never even offered.

Nothing here is scale-word math. A PC is assembled from real Ancestry, Background and Class items plus feats at every level slot (ancestry/class/skill/general per the Core Rulebook cadence, including any feat the background itself grants — like Acolyte's *Student of the Canon*), ability boosts, and skill increases past Trained. The PF2e system then computes AC, HP, saves and proficiencies exactly as it would for a character built by hand.

Starting wealth buys real gear rather than turning into raw coin, and fundamental runes on weapons and armor are capped to what the character's level actually allows. Single-class builds only — no multiclass archetypes, and no pre-create screen for swapping individual picks (regenerate instead).

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

- **Save** captures your current form as a new custom preset — or updates the selected custom preset in place.
- **Duplicate** starts a new preset pre-filled from any preset, built-in or custom.
- **Manage Presets** lists your custom presets with Edit / Duplicate / Export / Delete, plus Export All and Import. Export writes JSON you can hand to another GM; imports always get a fresh id so they never collide.

The description placeholder cycles five example concepts per preset as inspiration.

### Loot and treasure

Creatures carry what they drop: coins, consumables, scrolls and magic items, contextual to the creature and scaled to its level and rarity. Coins become real PF2e currency items (so they land in the sheet's Currency section) and scrolls are assembled the way the system does on spell drag-and-drop — the real spell embedded into the matching rank's scroll template.

The **Treasure amount** control shapes the haul twice. Up front it nudges what the AI proposes: Stingy leans to 2–3 cheap items and usually skips the magic item, Standard uses the baseline 3–8, Generous leans to 6–8 with at least one magic item. After generation the *value* is budgeted rather than guessed: the module computes a target from the GM Core Treasure by Level table (level, creature rarity, and the same Treasure setting), sums the real compendium prices of what was generated — runes included — and flexes the **coin** entries to land on target. Named items are never added or removed to hit a number.

Loot volume also follows your framing: describe a hoard or ask for "lots of loot" and the haul scales up. Happy with the creature but not the haul? **Reroll Loot** regenerates only the treasure.

## Troubleshooting

**Slow or stuck generations**

- Generation is **streamed** — you'll see one animated progress bar with a live percentage and token ticker. Reasoning models show "The model is thinking…" first; that's normal and can take a while.
- The **request timeout** aborts only on total silence from the provider, so slow-but-alive generations are never cut off. If you get timeouts, check the provider's status page and your model name.
- A large Ollama or LM Studio model may be silent while it loads, or while another request owns its only generation slot. Load/warm the model in the server first, wait for other work to finish, or temporarily raise **Request timeout**; a warm retry should start streaming much sooner.
- Check **Model** is the exact API identifier from your provider's docs. A wrong id normally returns an immediate error rather than hanging.
- Spellcasters make **three** AI calls (concept, a small spell-focus pass, then grounded selection), so they take longer. Creatures carrying gear make one more.
- After generation the preview shows an exact **token usage report** per call. If a provider doesn't report usage, the step is a clearly-marked estimate.

**Odd results**

- **Missing an ability you expected** (Attack of Opportunity on a soldier, say) — the AI decides case by case; nudging the prompt usually gets it.
- **An unfamiliar item name** — the module always targets current Remaster terminology. A stray pre-Remaster name simply fails to match and falls back to a flagged custom item rather than breaking anything.
- **A pick shows as custom, not matched** — that item isn't in your enabled compendium sources. Swap in the real one by hand, or widen your sources.

## Limitations

**Generation quality**

- Presets guide the AI rather than constrain it; an occasional generation drifts. Regenerating usually lands it.
- Clickable rolls in custom abilities depend on the AI following the module's phrasing conventions. A phrase that slips through stays readable plain text.
- A custom (non-glossary) passive is only as interactive as its phrasing — anything outside the standard damage/save/check/heal/area conventions is flavor text you apply by hand.
- An item with no compendium match becomes a placeholder at the AI's estimated price, not a functional weapon or armor. This should be rare (gear is picked from a real candidate list), but swap in the real item if you see one.

**Rules coverage**

- Generated spellcasters use a spontaneous-style entry; adjust on the sheet for prepared or innate casting.
- Matched feats become NPC action items — the PF2e system doesn't allow feat items on NPCs — keeping the feat's cost, rules text and automation.
- Only coin entries flex to hit the treasure budget. A haul whose named items already exceed it is left alone rather than losing items. Carried gear isn't counted against the budget.
- The benchmark tables were transcribed by hand from GM Core. If a value disagrees with the book, please open an issue.
- The rarity cap covers ancestry/background/heritage only — feats, spells and equipment aren't filtered by it yet.

**Not yet live-tested** (built, reviewed, and verified against the real pf2e system source, but not yet run in an actual game)

- **Focus spells**, for both PCs and NPCs. The pool size (spell count, capped at 3) is a defensible module default, not a verified GM Core rule. NPC focus spells only attach alongside normal spellcasting — a focus-only creature isn't supported.
- **Free Archetype.** The archetype feat can land in the same slot location as a regular class feat at that level, so it embeds on the character but may not appear in a distinct Free Archetype slot on the sheet.
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
