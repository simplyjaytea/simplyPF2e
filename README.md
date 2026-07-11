# SimplyPF2e

[![Latest release](https://img.shields.io/github/v/release/simplyjaytea/simplyPF2e?label=release)](https://github.com/simplyjaytea/simplyPF2e/releases/latest)
[![Foundry version](https://img.shields.io/badge/Foundry-v13%2B-informational)](https://foundryvtt.com)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Turn a one-sentence idea into a fully statted, ready-to-run Pathfinder 2e NPC or monster — inside [Foundry VTT](https://foundryvtt.com), using the [Pathfinder Second Edition system](https://github.com/foundryvtt/pf2e).

**[Install](#install)** · **[Setup](#setup)** · **[Usage](#usage)** · **[Troubleshooting](#troubleshooting)** · **[Known limitations](#known-limitations)** · **[Roadmap](#roadmap)**

## What it does

Type *"a cunning swamp hag who brews poisons from drowned travelers"*, pick a level, and get a complete creature: statistics, saves, strikes, skills, special abilities, spells, gear, and loot. PF2e monsters normally take real prep time because everything has to be statted; SimplyPF2e does that work by splitting the job three ways:

1. **The AI invents the concept.** An LLM (DeepSeek by default, or any OpenAI-compatible API) receives your prompt and returns a structured concept: name, flavor, traits, which statistics should be *extreme / high / moderate / low*, what its strikes and signature abilities are, and which standard abilities, feats, spells, and equipment it uses.
2. **The module does the math.** Every number — AC, HP, saves, perception, skill modifiers, strike attack bonuses, damage dice, spell DCs — is looked up from the official GM Core **"Building Creatures"** benchmark tables for the level you chose. The AI never outputs numbers, so creatures are always mechanically sound for their level.
3. **The compendiums provide the content.** Abilities (Grab, Knockdown, Frightful Presence, Attack of Opportunity, ...), feats, spells, and equipment named by the AI are matched against the PF2e system's own compendium packs and the real documents are embedded in the actor. Nothing rules-critical is hallucinated: anything without a compendium match is either created as a clearly-marked custom item or flagged in the preview so you can decide.

### Highlights

- **Grounded, not hallucinated.** Spells, feats, abilities, and equipment are matched against your actual compendiums — see [Grounding in the compendium](#grounding-in-the-compendium) for how each category stays honest.
- **Real currency and treasure.** Loot generates as actual PF2e coin items, consumables, scrolls, and magic items — not text you have to convert by hand.
- **Encounter mode.** Describe a theme, get a whole cohesive group built to the GM Core XP budget in one pass.
- **Presets that shape the build.** Twelve built-in class road maps, plus save your own.
- **Nothing touches your world until you say so.** Every generation is a preview — regenerate, edit the prompt, reroll just the loot, or discard, freely.
- **Full visibility into cost.** Streamed progress per step and an exact token-usage report after every generation.

## Grounding in the compendium

Several parts of the concept get extra grounding so the AI can't invent things that don't exist in your game:

- **Spells are chosen *from* the compendium, in two steps.** First a small pass asks the AI for a handful of thematic keywords (descriptor traits, damage types, "healing", "control", ...) that fit the creature. Those keywords narrow the actual spell list for its tradition and level down to a relevant slice before a second pass picks the final spells from it — every pick lands as the real spell document on the sheet, and the narrowing keeps the second pass's prompt small instead of dumping the whole tradition's spell list on every generation.
- **Feats for trained creatures.** Creatures that would plausibly have class-like techniques — humanoid soldiers, monks, assassins — can be given real feats (Power Attack, Sudden Charge, ...), matched against the system's feats compendium and embedded on the NPC.
- **Equipment is chosen *from* the compendium too.** After the concept lands, a follow-up pass hands the AI a real, level-capped list of items from your equipment compendium — narrowed by keywords taken from the concept's own gear ideas and strikes, so the prompt stays small — and the AI picks the creature's carried gear from it. Every pick is a name that actually exists, so it lands as the real item document on the sheet.
- **Real, logical inventories.** The AI stocks each creature with the weapons and armor it actually wields (equipped and held correctly, and only when the creature would plausibly wear armor), general adventuring gear (rope, torches, rations, thieves' tools, and the like), consumables where they make sense (healing potions, elixirs, bombs, talismans — with quantities), and for creatures of level 2+ optionally a magic item. Fundamental-rune gear like **"+1 striking rapier"** is handled properly — the module parses the runes, embeds the real base weapon, and applies potency/striking as system data so the item works mechanically. Anything named that still doesn't match the compendium becomes a real inventory item — a custom gear item at the AI's estimated price — instead of silently disappearing. Coins never show up here — they're loot only.
- **Loot worth fighting for.** Creatures carry the treasure they drop on defeat: coins, consumables, and magic items contextual to the creature and scaled to its level and rarity, all matched against the equipment compendium. Coins ("Gold Coins", "150 silver pieces") become the real PF2e currency items, so they show up in the sheet's Currency section. Spell scrolls are assembled the same way the system builds them on spell drag-and-drop: the named spell is resolved from the spell compendium and embedded into the matching rank's scroll template, producing a fully usable consumable.
- **Passives lean on real automation.** A passive ability that matches a standard PF2e glossary entry (Regeneration, All-Around Vision, ...) is cloned from the compendium wholesale, so it carries the system's own working automation instead of being descriptive text you have to remember to apply.
- **Item names stay current.** Everything named — equipment, loot, scrolls — uses current PF2e Remaster terminology (e.g. "Blasting Stone", not the old "Thunderstone"), matched against your compendiums either way.

## Install

Paste this manifest URL into **Foundry → Add-on Modules → Install Module**:

```
https://github.com/simplyjaytea/simplyPF2e/releases/latest/download/module.json
```

This link is **permanent** — it always resolves to the newest published release, so Foundry will detect and offer updates automatically. You never need a new URL when the module updates.

Requires Foundry VTT **v13+** and the **pf2e** game system (6.0.0+).

## Setup

Configure the AI provider under **Game Settings → Configure Settings → SimplyPF2e** (GM only):

| Setting | Description |
| --- | --- |
| API Base URL | Any OpenAI-compatible endpoint. Defaults to DeepSeek (`https://api.deepseek.com/v1`). |
| API Key | Your provider API key. |
| Model | e.g. `deepseek-chat`, `deepseek-reasoner`, `gpt-4o`, or whatever your provider offers. |
| Creativity | Sampling temperature (0–2). |
| Max response tokens | Raise if complex creatures come back truncated. |
| Request timeout | Abort a generation if the provider sends *no data* for this long (default 90 s). |

Provider examples:

- **DeepSeek** – `https://api.deepseek.com/v1`, model `deepseek-chat` — cheap, strong JSON output, the recommended default.
- **OpenAI** – `https://api.openai.com/v1`, model `gpt-4o`
- **OpenRouter** – `https://openrouter.ai/api/v1`, any hosted model
- **Ollama (local)** – `http://localhost:11434/v1`, no key needed. Set `OLLAMA_ORIGINS=*` (or your Foundry origin) so the browser may call it. Expect more retries/lower quality unless you're running a large model.

> **Note on keys & requests:** requests are sent directly from the GM's browser to the provider, and the key is stored in world settings (visible to other GMs of the same world). Use a key you're comfortable with in that context.

### Choosing compendium sources

By default SimplyPF2e draws from the PF2e system packs (bestiary ability glossary, spells, feats, equipment). Under **Module Settings → SimplyPF2e → Compendium Sources** you can change that: the module scans every Item compendium in your world, detects which packs actually contain abilities, spells, feats, or equipment, and lets you check the ones each category may use — so homebrew compendiums and content modules (e.g. adventure-path packs) become available to the AI. The grounded spell selection reads from your chosen spell packs too, meaning the AI literally sees and picks from your homebrew spell list. Leaving a category empty falls back to the system defaults.

## Usage

1. Open the **Actors** sidebar tab and click **SimplyPF2e** (GM only), or run `game.modules.get("simplypf2e").api.open()` from a macro.
2. Optionally pick a **preset** from the dropdown, describe the creature, set its level (−1 to 24) and rarity, choose whether spellcasting is allowed, and click **Generate**.
3. Review the stat-block preview, then click **Create Actor**. The finished NPC opens on its sheet, ready to drop onto the canvas.

### Presets

The preset dropdown shapes the *build* while your description drives the *flavor*. Built-in presets cover the standard fantasy classes — Fighter, Barbarian, Rogue, Ranger, Monk, Cleric, Druid, Wizard, Sorcerer, Bard, Champion, and Alchemist — each encoding a GM Core-style road map (stat scales, techniques, casting tradition). "Level 5 hobgoblin veteran" + the Fighter preset gives a disciplined soldier; the same prompt with the Barbarian preset gives a reckless brute.

You can also save your own: click **+** next to the dropdown, give the preset a name and build guidance (written to the AI like the examples above), and it's stored in the world and appears in the dropdown marked with `*`. Select a custom preset and click the trash button to delete it.

The description box's placeholder shows a different example concept each time you switch presets — five per preset — as inspiration for what that preset can build.

### Random creatures

The dice button next to **Generate** rolls a surprise: it ignores the description box, rolls a brief locally (creature type × combat role × home × twist — thousands of combinations), and the AI builds it at the level you set. Every click rolls a brand-new brief, so it never converges on the same ideas — great for filling a dungeon room or sparking a session when you're out of prep.

### Encounter mode

Switch the toggle at the top of the dialog to **Encounter**, set your party's level and size (both with +/− steppers), pick a threat level (trivial → extreme), and optionally give a theme ("a smuggler ring run by wererats"). The module computes the XP budget and composition from the official GM Core encounter-building rules — a headline creature whose relative level matches the threat, backed by minions until the budget is spent — then the AI names the encounter, briefs each slot so the group feels cohesive, and every member runs through the full creature pipeline. The preview shows each member with count, level, role, and key stats plus the XP math; **+/− buttons on each member** adjust how many of it you want (0 skips it entirely), with the XP total updating live and turning red if you go over budget. **Create All Actors** files the whole roster into a folder named after the encounter — every copy of a duplicated member is created as its own actor, numbered so they stay distinguishable ("Goblin Skirmisher 1", "Goblin Skirmisher 2", ...).

### Read-aloud text, Recall Knowledge, and art

Every creature comes with GM support baked into its notes:

- A **read-aloud block** — two or three sensory sentences for theater of the mind, shown as a quote at the top of the description.
- A **Recall Knowledge line** — the correct identification skill for the creature type, a clickable check at the level- and rarity-based DC, and a short nugget of what a player learns on a success (its weakness, its most dangerous trick).
- **Art**: SimplyPF2e borrows art from the closest-matching bestiary creature — scored by shared creature-type traits, size, and level — and uses it for the sheet and token.

### Loot

The preview shows the creature's loot — coins, consumables, scrolls, and treasure — with anything that failed to match the compendium flagged so you can decide before creating. Happy with the creature but not the haul? Click **Reroll Loot**: it regenerates only the treasure with a fresh AI pass, leaving the concept, stats, and gear untouched. Loot volume follows your framing: a typical creature drops a modest 3-8 items, but describe it as guarding a hoard or ask for "lots of loot" and the haul scales up to match — both on initial generation and on reroll.

### Iterating on a creature

Generation is meant to be a conversation, not a one-shot:

- **Regenerate** re-rolls the concept from the same prompt — same level and math, new take.
- **Edit the prompt and regenerate** to steer it: add "make it a spellcaster", "give it a ranged attack", "less gear, more natural weapons", and so on.
- **Reroll Loot** re-rolls just the treasure (see [Loot](#loot)).
- **Discard** clears the preview without creating anything.
- Nothing touches your world until you click **Create Actor**, so iterate freely — and after creation the result is a completely normal PF2e NPC you can keep editing on the sheet.

## Troubleshooting

Slow or stuck generations:

- Responses are **streamed**: while generating you'll see a progress bar per step (concept, spell selection, compendium matching, ...) plus a live token ticker. Reasoning models (e.g. DeepSeek's reasoner variants) show "The model is thinking…" first — that can take a while and is normal.
- After generation the preview shows a **token usage report**: the exact prompt/completion tokens each AI call used (concept, spell selection, encounter design, each member, loot rerolls) and the total. If a provider doesn't report usage, the step falls back to a clearly-marked estimate.
- The **request timeout** setting (default 90 s) aborts the request only if the provider sends *no data* at all for that long, so slow-but-alive generations are never cut off. If you get timeout errors, check the provider's status page and your model name.
- Make sure **Model** is the exact API identifier from your provider's documentation (for DeepSeek e.g. `deepseek-chat` or `deepseek-reasoner`) — marketing names don't always match the API id. A wrong id normally returns an immediate error, not a hang.
- Spellcasters make **three** AI calls (concept, then a small spell-focus pass, then grounded spell selection), so they take a bit longer than martial creatures — the focus pass is small and fast, most of the extra time is still the final selection pass. Any creature that carries gear also makes one extra grounded equipment-selection call.

Odd generation results:

- **A creature is missing an ability you expected** (e.g. Attack of Opportunity on a disciplined soldier) — the AI decides case by case whether a standard ability fits; regenerating or nudging the prompt ("give it Attack of Opportunity") usually gets it.
- **An item name looks unfamiliar** — SimplyPF2e always targets current PF2e Remaster terminology; if a generation still surfaces an old pre-Remaster name, it'll simply fail to match the compendium and fall back to a flagged custom item (see [Known limitations](#known-limitations)) rather than break anything.

## Known limitations

- Generated spellcasters use a spontaneous-style entry with 2 slots per rank; adjust on the sheet if you want prepared or innate casting.
- The benchmark tables were transcribed by hand from GM Core. If you spot a value that disagrees with the book, please open an issue.
- Matched feats are converted to NPC action items (the PF2e system does not allow feat items on NPC actors) — they keep the feat's cost, rules text, and automation.
- Clickable rolls in custom abilities depend on the AI following the module's phrasing conventions; if a phrase slips through unconverted, it stays as readable plain text (regenerate or edit the ability to fix it).
- A custom (non-glossary) passive ability is only as interactive as its phrasing — anything outside the standard damage/save/check/heal/area conventions is flavor text the table applies by hand rather than a live automated effect.
- Presets guide the AI rather than hard-constrain it — an occasional generation may drift from the chosen road map; regenerating usually lands it.
- Loot and carried gear are level-appropriate, but their total value is not yet priced against the GM Core treasure-budget tables (see [Roadmap](#roadmap)).
- A named weapon, armor, or gear item that doesn't match anything in the compendium becomes a generic placeholder item at the AI's estimated price rather than a functional weapon/armor — it won't carry real mechanical bonuses. Carried gear is now picked from a real compendium candidate list (see [Grounding in the compendium](#grounding-in-the-compendium)), so this should be uncommon — mostly the fallback path when the grounded pass fails or a pick is copied imperfectly — but if you see one, swap in the intended item from the compendium by hand.

## Roadmap

- [x] **Templates / presets** — ✅ v0.2.0: built-in class presets (Fighter through Alchemist) plus user-created custom presets in a dropdown.
- [x] **Clickable rolls** — ✅ v0.1.4: damage, saves, checks, and area templates in custom abilities are inline roll links.
- [x] **Encounter mode** — ✅ v0.3.0: themed encounters built to the GM Core XP budget (threat level × party size × party level), created as a folder of actors. Covers the old "batch mode" idea.
- [x] **Recall Knowledge & read-aloud** — ✅ v0.3.0: theater-of-the-mind read-aloud block and a clickable Recall Knowledge check with a player-facing info nugget.
- [x] **Loot** — ✅ v0.3.3: AI-generated treasure (coins as real currency, consumables, scrolls built from spells, magic items) with a Reroll Loot button in the preview.
- [ ] **Chat command** — e.g. `/forge swamp hag 6` to generate straight from the chat box during play.
- [x] **Grounded equipment matching** — ✅ unreleased: mirrors the spell-selection approach — the AI picks carried gear from a real, level-capped candidate list out of the equipment compendium instead of naming items from memory.
- [ ] **Treasure budgets** — price carried gear and loot against the GM Core treasure-budget tables for the creature's level.
- [ ] **Full PC-power-level characters** — generate complete character-class-strength NPCs (villains, rivals, pregens) built to player-character power budgets.
- [ ] **Preset sharing** — export/import custom presets as JSON to trade with other GMs.
- [ ] **Reskin an existing creature** — use a bestiary entry as the mechanical template and let the AI reflavor it.
- [ ] Elite/weak adjustments and level shifting for existing creatures.
- [ ] Focus spells for spellcasters.

## Releasing (for maintainers)

Publishing an update is one step, done any of three ways:

- **Push a tag:** `git tag v0.4.0 && git push origin v0.4.0`. The workflow creates the release itself.
- **From Actions:** go to **Actions → Release → Run workflow** and enter a version like `0.4.0`.
- **From Releases:** draft and publish a release by hand with a tag like `v0.4.0`.

Either way the workflow stamps the version into `module.json`, builds `module.zip`, and attaches both to the release. Because the install link above points at `releases/latest`, existing users are offered the update automatically and the link never changes.

## Licensing & attribution

This module uses trademarks and/or copyrights owned by Paizo Inc., used under [Paizo's Community Use Policy](https://paizo.com/licenses/communityuse) and the ORC License. The benchmark values are rules data from *Pathfinder GM Core* © Paizo Inc. This module is not published, endorsed, or specifically approved by Paizo.

Module code is released under the MIT License (see `LICENSE`).
