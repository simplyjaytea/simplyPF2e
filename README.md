# SimplyPF2e

[![Latest release](https://img.shields.io/github/v/release/simplyjaytea/simplyPF2e?label=release)](https://github.com/simplyjaytea/simplyPF2e/releases/latest)
[![Foundry version](https://img.shields.io/badge/Foundry-v13%2B-informational)](https://foundryvtt.com)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Turn a one-sentence idea into a fully statted, ready-to-run Pathfinder 2e actor — NPC, monster, whole encounter, or player character — inside [Foundry VTT](https://foundryvtt.com), using the [Pathfinder Second Edition system](https://github.com/foundryvtt/pf2e).

**[Install](#install)** · **[Setup](#setup)** · **[Usage](#usage)** · **[Troubleshooting](#troubleshooting)** · **[Known limitations](#known-limitations)** · **[Roadmap](#roadmap)**

## What it does

SimplyPF2e's scope is **any PF2e actor a GM needs, built correctly the first time**, not just monsters. Right now that's two generators sharing one grounding philosophy:

- **NPCs & monsters** (the core, released feature). Type *"a cunning swamp hag who brews poisons from drowned travelers"*, pick a level, and get a complete creature: statistics, saves, strikes, skills, special abilities, spells, gear, and loot — solo, or a whole themed **Encounter** built to the GM Core XP budget in one pass.
- **Player characters** (released, younger than NPC mode — see [Player Character mode](#player-character-mode)). Same idea, different mechanism: a PC is a real Ancestry/Background/Class plus chosen feats, so the PF2e system itself computes the numbers once those real items are embedded, rather than a benchmark table.

PF2e statblocks and character builds normally take real prep time because everything has to be correct *and* statted; SimplyPF2e does that work by splitting the job three ways:

1. **The AI invents the concept.** An LLM (DeepSeek by default, or any OpenAI-compatible API) receives your prompt and returns a structured concept — for NPCs: name, flavor, traits, which statistics should be *extreme / high / moderate / low*, strikes and signature abilities; for PCs: ancestry/background/class leaning, personality, and a first-draft build wishlist.
2. **The numbers are never the AI's job.** For NPCs, every stat — AC, HP, saves, perception, skill modifiers, strike attack bonuses, damage dice, spell DCs — is looked up from the official GM Core **"Building Creatures"** benchmark tables for the level you chose. For PCs, the PF2e system's own derived-data engine computes AC/HP/saves/proficiencies from the real embedded Ancestry/Background/Class/feat items. Either way, the AI never outputs a number, so builds are always mechanically sound for their level.
3. **The compendiums provide the content.** Abilities (Grab, Knockdown, Frightful Presence, Attack of Opportunity, ...), feats, spells, ancestries, backgrounds, classes, and equipment named by the AI are matched against the PF2e system's own compendium packs and the real documents are embedded in the actor. Nothing rules-critical is hallucinated: anything without a compendium match is either created as a clearly-marked custom item or flagged in the preview so you can decide (loot keeps a narrow, documented exception for coins and scrolls).

### Highlights

- **Grounded, not hallucinated.** Spells, feats, abilities, and equipment are matched against your actual compendiums — see [Grounding in the compendium](#grounding-in-the-compendium) for how each category stays honest.
- **Real currency and treasure.** Loot generates as actual PF2e coin items, consumables, scrolls, and magic items — not text you have to convert by hand.
- **Encounter mode.** Describe a theme, get a whole cohesive group built to the GM Core XP budget in one pass. The dice button rolls a random theme here too.
- **Player Character mode.** Describe a concept, get a full player-character build — real Ancestry, Background, Class, feats at every level slot (including a background's own built-in feat, like Acolyte's "Student of the Canon"), skill proficiency increases, and spells/gear, all grounded in your compendium. Unlike NPCs, the PF2e system itself computes AC/HP/saves/proficiencies once the real items are embedded — see [Player Character mode](#player-character-mode).
- **Compendium-match visibility.** Every generated pick that resolved to a real compendium item gets a checkmark right in the preview — spells, feats, equipment, loot, and (in PC mode) ancestry/background/class — plus a per-generation "X/Y compendium matches" summary in the header, so you can see how grounded a build actually is at a glance instead of hunting for warning icons.
- **Item forge.** Describe a wondrous magic item and get a real Foundry item with *working* passive automation — its Rule Elements are cloned from published items, never invented. Or forge a magic weapon or suit of armor built from real fundamental and property runes, priced by summing the actual rune and base-item documents (see [Item forge](#item-forge)).
- **Presets that shape the build.** Twelve built-in class road maps, plus save, edit, duplicate, and share your own — see [Presets](#presets).
- **Nothing touches your world until you say so.** Every generation is a preview — regenerate, edit the prompt, reroll just the loot, or discard, freely.
- **Full visibility into cost.** Streamed progress per step and an exact token-usage report after every generation.

## Grounding in the compendium

Several parts of the concept get extra grounding so the AI can't invent things that don't exist in your game:

- **Spells are chosen *from* the compendium, in two steps.** First a small pass asks the AI for a handful of thematic keywords (descriptor traits, damage types, "healing", "control", ...) that fit the creature. Those keywords narrow the actual spell list for its tradition and level down to a relevant slice before a second pass picks the final spells from it — every pick lands as the real spell document on the sheet, and the narrowing keeps the second pass's prompt small instead of dumping the whole tradition's spell list on every generation.
- **Feats for trained creatures.** Creatures that would plausibly have class-like techniques — humanoid soldiers, monks, assassins — can be given real feats (Power Attack, Sudden Charge, ...), matched against the system's feats compendium and embedded on the NPC.
- **Equipment is chosen *from* the compendium too.** After the concept lands, a follow-up pass hands the AI a real, level-capped list of items from your equipment compendium — narrowed by keywords taken from the concept's own gear ideas and strikes, so the prompt stays small — and the AI picks the creature's carried gear from it. Every pick is a name that actually exists, so it lands as the real item document on the sheet.
- **Real, logical inventories.** The AI stocks each creature with the weapons and armor it actually wields (equipped and held correctly, and only when the creature would plausibly wear armor), general adventuring gear (rope, torches, rations, thieves' tools, and the like), consumables where they make sense (healing potions, elixirs, bombs, talismans — with quantities), and for creatures of level 2+ optionally a magic item. Fundamental-rune gear like **"+1 striking rapier"** is handled properly — the module parses the runes, embeds the real base weapon, and applies potency/striking as system data so the item works mechanically. Anything named that still doesn't match the compendium becomes a real inventory item — a custom gear item at the AI's estimated price — instead of silently disappearing. Coins never show up here — they're loot only.
- **Loot worth fighting for.** Creatures carry the treasure they drop on defeat: coins, consumables, and magic items contextual to the creature and scaled to its level and rarity, all matched against the equipment compendium. Coins ("Gold Coins", "150 silver pieces") become the real PF2e currency items, so they show up in the sheet's Currency section. Spell scrolls are assembled the same way the system builds them on spell drag-and-drop: the named spell is resolved from the spell compendium and embedded into the matching rank's scroll template, producing a fully usable consumable.
- **Loot is priced to a real budget.** The same authority split as the statistics: the module computes an expected gp value from the GM Core Treasure by Level table (scaled by creature rarity and your **Treasure amount** setting), the AI only themes and names items within it, and the loot's real compendium prices are summed against that target — if the haul lands meaningfully off budget, the coin entries flex to close the gap (named items are never added or removed to hit a number). Encounter mode shows the group's total treasure value against its budget, right next to the XP math.
- **Passives lean on real automation.** A passive ability that matches a standard PF2e glossary entry (Regeneration, All-Around Vision, ...) is cloned from the compendium wholesale, so it carries the system's own working automation instead of being descriptive text you have to remember to apply.
- **Item names stay current.** Everything named — equipment, loot, scrolls — uses current PF2e Remaster terminology (e.g. "Blasting Stone", not the old "Thunderstone"), matched against your compendiums either way.
- **Player characters get the same grounding, plus a rarity cap.** Ancestry, background, class, heritage, feats, spells, gear, and starting-wealth items are all matched against real compendium documents the same way NPC content is — and in Character mode you can additionally cap the **Max rarity** of ancestry/background/heritage candidates, so the AI is never even shown (let alone able to pick) something rarer than the GM allows.

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
2. Optionally pick a **preset** from the dropdown, describe the creature, set its level (−1 to 24) and rarity, pick a **Treasure amount** (Stingy / Standard / Generous — how rich the loot budget runs), choose whether spellcasting is allowed, and click **Generate**.
3. Review the stat-block preview, then click **Create Actor**. The finished NPC opens on its sheet, ready to drop onto the canvas.

### Presets

The preset dropdown shapes the *build* while your description drives the *flavor*. Built-in presets cover the standard fantasy classes — Fighter, Barbarian, Rogue, Ranger, Monk, Cleric, Druid, Wizard, Sorcerer, Bard, Champion, and Alchemist — each encoding a GM Core-style road map (stat scales, techniques, casting tradition). "Level 5 hobgoblin veteran" + the Fighter preset gives a disciplined soldier; the same prompt with the Barbarian preset gives a reckless brute.

A preset can also carry defaults for **rarity**, **allow spellcasting**, and **Treasure amount** — selecting one restores any of those three it defines, leaving fields it doesn't touch as you left them.

- **Save** captures your *current* form — the build guidance you write plus whatever rarity/spellcasting/treasure amount are set right now — as a new custom preset (or, if a custom preset is already selected, updates that same preset in place instead of creating a duplicate). Custom presets are stored in the world and appear in the dropdown marked with `*`.
- **Duplicate** starts a new custom preset pre-filled from whichever preset is currently selected — built-in or custom — so you can take "Fighter" and tweak it into your own house archetype without typing a guidance paragraph from scratch.
- **Delete** removes the selected custom preset (built-ins can't be deleted).
- **Manage Presets** opens a dialog listing all your custom presets with Edit, Duplicate, Export, and Delete on each row, plus **Export All** and **Import** at the bottom. Export writes a JSON file you can hand to another GM; Import reads one back in (invalid entries are skipped, valid ones always get a fresh internal id so they never collide with presets you already have) — this is how you trade presets between worlds or with other GMs.

The description box's placeholder shows a different example concept each time you switch presets — five per preset — as inspiration for what that preset can build.

### Random creatures

The dice button next to **Generate** rolls a surprise: it ignores the description box, rolls a brief locally (creature type × combat role × home × twist — thousands of combinations), and the AI builds it at the level you set. Every click rolls a brand-new brief, so it never converges on the same ideas — great for filling a dungeon room or sparking a session when you're out of prep. The same dice button is available in Encounter mode, where it rolls a random encounter theme instead.

### Encounter mode

Switch the toggle at the top of the dialog to **Encounter**, set your party's level and size (both with +/− steppers), pick a threat level (trivial → extreme), and optionally give a theme ("a smuggler ring run by wererats") — or click the dice button for a random one. The module computes the XP budget and composition from the official GM Core encounter-building rules — a headline creature whose relative level matches the threat, backed by minions until the budget is spent — then the AI names the encounter, briefs each slot so the group feels cohesive, and every member runs through the full creature pipeline. The preview shows each member with count, level, role, and key stats plus the XP math; **+/− buttons on each member** adjust how many of it you want (0 skips it entirely), with the XP total updating live and turning red if you go over budget. **Create All Actors** files the whole roster into a folder named after the encounter — every copy of a duplicated member is created as its own actor, numbered so they stay distinguishable ("Goblin Skirmisher 1", "Goblin Skirmisher 2", ...).

### Player Character mode

> **Status: released, but younger and less battle-tested than NPC mode.** The initial build (PR [#49](https://github.com/simplyjaytea/simplyPF2e/pull/49)) shipped with several character-build field names asserted from training knowledge rather than confirmed against the pf2e system. Live testing found real problems, and several rounds of fixes since (PRs [#54](https://github.com/simplyjaytea/simplyPF2e/pull/54), [#57](https://github.com/simplyjaytea/simplyPF2e/pull/57)–[#61](https://github.com/simplyjaytea/simplyPF2e/pull/61)) — each verified against the actual `foundryvtt/pf2e` system source — landed attribute boosts, feat slots (including a background's own built-in feat), spell slots, HP, skills and skill-proficiency increases, bio/personality fields, and starting wealth. Most of that is now confirmed working in a live world; the newest changes (see the roadmap below) are not yet. Sanity-check a generated character's numbers on its sheet before trusting it in play.

Switch the toggle to **Player Character**, describe a concept ("a grizzled dwarf ranger who hunts undead"), optionally cap the **Max rarity** of the ancestry/background/heritage the AI can pick (excludes anything rarer, e.g. capping at Uncommon rules out Rare options like Fetchling), set a level (1–20), and generate. Unlike NPC mode, nothing here is scale-word math — a PC is built from real Ancestry, Background, and Class compendium items plus chosen feats at every level slot (ancestry/class/skill/general, per the Core Rulebook's leveling cadence, including any feat the background itself automatically grants) and ability boosts, and the PF2e system's own derived-data engine computes AC, HP, saves, and proficiencies once those real items are embedded, the same way it would for a character built by hand on the sheet. Skill proficiency also advances past Trained at the Core Rulebook's skill-increase levels, not just at character creation.

Every choice is grounded the same way spells and equipment already are for NPCs: the AI drafts first-draft ancestry/background/class/feat/spell names as inspiration, then a grounded pass matches each against your real compendium and the AI picks only from what actually exists — nothing is invented except loot (which follows the exact same free-form exception NPCs already have for coins and scrolls). Starting gear is grounded and budgeted the same way NPC equipment is, scaled to the character's own level instead of an NPC's encounter share — and starting wealth now actually buys real magic items (potions, scrolls, wands, and the like) the same way NPC loot does, instead of turning entirely into raw coin.

Single-class builds only for now — multiclass archetypes, a pre-create screen for swapping individual AI picks, and the Free Archetype variant rule are explicitly out of scope for this first pass.

### Item forge

Open the **Items** sidebar tab and click **Item Forge** (GM only), run `game.modules.get("simplypf2e").api.openItemForge()`, or click the **Item Forge** button next to the Single/Encounter toggle in the NPC generator window — all three open the same app. Pick an item type — **Wondrous Item**, **Weapon**, or **Armor** — describe the item, pick a level and rarity, and **Generate**.

For a wondrous item ("a charred iron circlet that shields the wearer's mind and lets it see in the dark"), the preview shows usage, bulk, price, traits, a plain-English list of its passive effects, and — if the concept calls for one — an activated ability; **Create Item** places it in the Items directory with its sheet open, ready to drag onto a character sheet — where the effects *just work*, no manual setup.

For a weapon or suit of armor, the forge switches to a rune-based pipeline: it harvests real candidates from your equipment compendium — base weapons/armor at or under the target level, property runes filtered by their real usage string (etched onto a weapon vs. onto light/medium-heavy armor), and fundamental rune tiers (potency, striking or resilient) whose real item level actually fits the target — and the AI picks a build only from those exact candidates, never inventing a rune or base item. The final item sums the real base item's and rune items' actual prices, and its overall level is the highest level among them (the real PF2e rule); the name follows the standard "+N [runes] [base name]" convention, assembled from the resolved documents' own names.

The forge builds **passive** effects: item bonuses (AC, perception, saves, skills), resistances, weaknesses, immunities, senses (darkvision, scent, ...), and speed grants (fly/swim/climb/burrow). What makes them trustworthy is the same grounding philosophy as the rest of the module:

- **Rule Elements are cloned from real published items, never written from memory.** Foundry fails *silently* when a Rule Element has a wrong key or field name — the ring simply doesn't do anything. So the forge scans your installed compendiums for published items that already carry each kind of rule (e.g. Hellfire Boots for a resistance), clones that working rule, and substitutes only the value, statistic, or damage type. If your world has no real example of some effect kind, that kind simply isn't offered to the AI — the forge never falls back to hand-writing a rule.
- **Prices are empirical.** The gp price is the median real compendium price of items at the chosen level (widened to neighboring levels when a level has few priced items), scaled up for uncommon/rare/unique — not a remembered price table.
- **Usage strings are harvested from real gear** ("worn", "wornshoes", "held-in-one-hand", ...), so the item slots correctly on a sheet.

**Activated items** now work too. When a concept implies a triggered ability ("once per day, unleash a blast of frost", "heal a wounded ally", "frighten a foe"), the forge builds one of four activation kinds — **damage**, **heal**, **condition**, or **self-buff** — and generates a companion **macro** you click to use it. The item's description gets a clickable **Activate** link, and the macros are filed in a "SimplyPF2e Item Forge" macro folder (auto-deleted when you delete the item). To use one: target a token (for damage/condition effects), then click Activate. Damage and healing post as normal PF2e chat cards, so the built-in **Apply Damage / Apply Half / Apply Healing** buttons handle the rest — the macro leans on the system's own battle-tested UI rather than touching HP directly. Activated items are **1/day**: each copy tracks its own charge and recharges on a night's rest.

### Read-aloud text, Recall Knowledge, and art

Every creature comes with GM support baked into its notes:

- A **read-aloud block** — two or three sensory sentences for theater of the mind, shown as a quote at the top of the description.
- A **Recall Knowledge line** — the correct identification skill for the creature type, a clickable check at the level- and rarity-based DC, and a short nugget of what a player learns on a success (its weakness, its most dangerous trick).
- **Art**: SimplyPF2e borrows art from the closest-matching bestiary creature — scored by shared creature-type traits, size, and level — and uses it for the sheet and token.

### Loot

The preview shows the creature's loot — coins, consumables, scrolls, and treasure — with anything that failed to match the compendium flagged so you can decide before creating. Happy with the creature but not the haul? Click **Reroll Loot**: it regenerates only the treasure with a fresh AI pass, leaving the concept, stats, and gear untouched. Loot volume follows your framing: a typical creature drops a modest 3-8 items, but describe it as guarding a hoard or ask for "lots of loot" and the haul scales up to match — both on initial generation and on reroll.

The **Treasure amount** control shapes the haul twice. Up front, it nudges what the AI proposes: Stingy leans toward the low end (2-3 cheap, common items, usually skipping the magic-item slot entirely), Standard uses the baseline 3-8 item guidance as written, and Generous leans toward the high end (6-8 items, always including at least one treasure or magic item). Then, after generation, the haul's *value* is budgeted, not guessed: the module computes a target gp value from the GM Core Treasure by Level table for the creature's level (party level in encounter mode), multiplied up for uncommon/rare/unique creatures and by the same Treasure amount setting (Stingy halves it, Generous adds half). The real compendium prices of the generated items are summed against that target, and the coin entries are adjusted to land the total on budget — so a level 5 creature drops level-5-appropriate wealth whether or not the AI guessed prices well.

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
- Loot value is budgeted against the GM Core Treasure by Level table, but only the coin entries flex to hit the target — a haul whose named items alone already exceed the budget is left as-is (with a console note) rather than losing items. Carried gear (weapons, armor, adventuring kit) is not counted against the treasure budget.
- The item forge builds **passive** effects, **1/day activated** abilities (damage, heal, condition, self-buff), and **rune-based weapons/armor**. Passive effect kinds depend on your installed compendiums: each needs at least one published item carrying that rule to serve as a template (all six kinds have one in the standard PF2e equipment/bestiary packs), and a kind with no real example in your world is not offered rather than guessed at. The rune-based weapon/armor path has its own gaps: nothing validates rune prerequisites or exclusivity (you can pick contradictory runes like Holy and Unholy on the same item — this is prompt guidance only, not enforced), armor property runes aren't filtered to the base armor's actual category (light vs. medium/heavy — all usage variants are offered regardless of which armor was picked), and shield- and ammunition-only runes are out of scope entirely.
- The item forge — all three phases — has been built and independently reviewed, but not yet verified end-to-end on an actual character sheet in a live Foundry game. If a generated item looks structurally correct in the preview but doesn't behave as expected once it's on a sheet, that mismatch is the first thing to check.
- Activated-item macros lean on the PF2e system's own APIs, which can change between system versions. Every call is wrapped so a failure degrades to a plain descriptive chat message ("deal 4d6 fire damage, DC 22 basic Reflex save — apply manually") rather than throwing. A few behaviours are **best-effort**: an inflicted condition's *duration* is shown as text but not auto-enforced (remove it by hand when it lapses); condition effects apply on a failed save, but if the save's degree of success can't be read the condition is skipped with a manual-adjudication chat message rather than applied automatically; and 1/day recharge relies on the PF2e "Rest for the Night" flow firing (otherwise reset the item's charge by hand). If a generated macro misbehaves in play, its script is readable in the macro folder — check the console for the logged fallback reason.
- A named weapon, armor, or gear item that doesn't match anything in the compendium becomes a generic placeholder item at the AI's estimated price rather than a functional weapon/armor — it won't carry real mechanical bonuses. Carried gear is now picked from a real compendium candidate list (see [Grounding in the compendium](#grounding-in-the-compendium)), so this should be uncommon — mostly the fallback path when the grounded pass fails or a pick is copied imperfectly — but if you see one, swap in the intended item from the compendium by hand.
- **Player Character mode is younger and less battle-tested than NPC mode.** Its initial build asserted several character-build field names from training knowledge rather than confirmed schema; live testing since has found and fixed real problems across several rounds (attribute boosts, feat slots including a background's own built-in feat, spell slots, HP, skills/skill increases, bio/personality fields, starting wealth, rarity cap), each verified against the real `foundryvtt/pf2e` source. Before trusting a generated character's numbers, open its sheet and sanity-check AC/HP/saves/proficiencies/feats against what its ancestry/background/class/level should produce; if something looks off, `scripts/pc-builder.mjs` is the first place to check. Single-class builds only — no multiclass archetypes, and there's no pre-create screen to swap individual AI picks (regenerate for a different build instead).
- **Focus spells are freshly built and not yet live-tested at all.** Both PCs and NPCs can get a real focus spellcasting entry and pool, and the schema was verified against real `foundryvtt/pf2e` source (how a focus entry is identified, how a PC's pool max needs a cloned Rule Element vs. an NPC's pool being settable as plain data) — but nobody has generated a character or creature with focus spells in an actual running world yet. The pool-size convention (spell count, capped at 3) is a defensible default, not a verified GM Core rule. NPC focus spells only attach alongside normal spellcasting; a focus-only creature isn't supported yet.

## Roadmap

Grouped by feature area rather than build order. Version tags mark when a feature shipped; "unreleased" means it's on `main` but hasn't been through a full live-play verification pass yet — see [Known limitations](#known-limitations) for what that means in practice.

### Core generation

- [x] **Presets** — ✅ v0.2.0, overhauled unreleased: built-in class presets plus user-created custom ones, each capturing rarity/spellcasting/treasure-amount defaults alongside build guidance. Save edits an already-selected custom preset in place; Duplicate clones any preset (built-in or custom) as a starting point; the Manage Presets dialog adds Edit/Export/Import — export/import as JSON covers **preset sharing**.
- [x] **Clickable rolls** — ✅ v0.1.4: damage, saves, checks, and area templates in custom abilities are inline roll links.
- [x] **Grounded equipment matching** — ✅ unreleased: the AI picks carried gear from a real, level-capped compendium candidate list instead of naming items from memory.
- [x] **Loot & treasure budgets** — ✅ v0.3.3/unreleased: AI-generated treasure (real currency, consumables, scrolls, magic items) with a Reroll Loot button, priced against the GM Core Treasure by Level table (level + rarity scaled, Stingy/Standard/Generous control) — coin entries flex to land on budget, encounter mode reports the group's total alongside the XP math.
- [x] **Compendium-match confirmation** — ✅ v0.3.5.22: every generated pick that resolved to a real compendium item gets a checkmark in the preview, plus a per-generation match-rate summary in the header.

### Encounters

- [x] **Encounter mode** — ✅ v0.3.0: themed encounters built to the GM Core XP budget (threat × party size × party level), created as a folder of actors.
- [x] **Recall Knowledge & read-aloud** — ✅ v0.3.0: theater-of-the-mind read-aloud block and a clickable Recall Knowledge check with a player-facing info nugget.

### Item forge

- [x] **Phase 1 — passive items** — ✅ unreleased: describe a wondrous item, get a real Foundry item whose passive Rule Elements are cloned from published exemplars (item bonuses, resistances, weaknesses, immunities, senses, speeds), priced from empirical compendium medians.
- [x] **Phase 2 — activated items** — ✅ unreleased: 1/day activated abilities (damage, heal, condition, self-buff) delivered as a click-to-run companion macro, with per-copy charge tracking and a chat-card-first, plain-message-fallback design.
- [x] **Phase 3 — rune weapons & armor** — ✅ v0.3.5.1: generated magic weapons/armor assembled from real base items plus real fundamental and property rune items, priced and leveled by summing the real documents — no memorized rune list or price table.

### Player Characters

- [x] **Full PC-power-level characters** — ✅ v0.3.5.16+: a Player Character generator mode builds real single-class characters (Ancestry/Background/Class/feats/spells/gear, all compendium-grounded) and lets the PF2e system compute stats from the real embedded items — see [Player Character mode](#player-character-mode). Several live-testing rounds have hardened this since first ship; see the status note there for what's still shaking out.
- [x] **Starting wealth buys real items** — ✅ v0.3.5.23: a character's starting wealth drafts and grounds a wishlist of real magic items (potions, scrolls, wands) against the compendium instead of becoming 100% raw coin.
- [x] **Rarity cap** — ✅ v0.3.5.23: a Max rarity control in Character mode excludes ancestries/backgrounds/heritages rarer than the GM's chosen cap from what the AI can even pick. Currently only covers those three categories — feats/spells/equipment aren't filtered yet.
- [x] **Focus spells** — ✅ unreleased, not yet live-tested: PCs get a real `prepared:"focus"` spellcasting entry with a cloned Rule Element sizing the focus pool (1-3 points, PF2e's hard cap); NPCs get the same entry shape but set the pool directly (only alongside normal spellcasting — a focus-only creature with no spellcasting tradition isn't supported yet). The exact pool-size convention (spell count, capped at 3) is a defensible module default, not checked against GM Core's own creature-design guidance for the number.

### Not yet built

- [ ] **Chat command** — e.g. `/forge swamp hag 6` to generate straight from the chat box during play.
- [ ] **Reskin an existing creature** — use a bestiary entry as the mechanical template and let the AI reflavor it.
- [ ] **Elite/weak adjustments** and level shifting for existing creatures.

## Development (for maintainers)

There's no full test suite, but a handful of pure-logic regression checks guard specific historical bugs — each is a standalone, dependency-free script (`node scripts/<name>.test.mjs`), no framework or CI wiring. Where the real function touches Foundry's `game`/`foundry` globals (unavailable outside a running world), the check ports the relevant logic verbatim with a comment citing the source lines to keep in sync. Otherwise verify JS changes with `node --check <file>`.

## Releasing (for maintainers)

**Releases are automatic.** Every push to `main` triggers `.github/workflows/auto-release.yml`: it reads the latest git tag, bumps its last version segment (`v0.3.5.1` → `v0.3.5.2`), and calls `release.yml` directly as a reusable workflow to build and publish — no manual tag or dispatch step required.

This changes the risk profile of merging: **merging a PR to `main` is no longer a quiet, reversible action.** It ships a public release immediately, and since the install link above points at `releases/latest`, every existing install is offered that update right away. Treat a main-bound merge with the same care you'd give a manual `gh release create`.

The old manual paths still work as a fallback or override if you need to publish out-of-band (e.g. re-cutting a broken release):

- **Push a tag:** `git tag v0.4.0 && git push origin v0.4.0`.
- **From Actions:** go to **Actions → Release → Run workflow** and enter a version like `0.4.0`.
- **From Releases:** draft and publish a release by hand with a tag like `v0.4.0`.

Any of these stamps the version into `module.json`, builds `module.zip`, and attaches both to the release.

## Licensing & attribution

This module uses trademarks and/or copyrights owned by Paizo Inc., used under [Paizo's Community Use Policy](https://paizo.com/licenses/communityuse) and the ORC License. The benchmark values are rules data from *Pathfinder GM Core* © Paizo Inc. This module is not published, endorsed, or specifically approved by Paizo.

Module code is released under the MIT License (see `LICENSE`).
