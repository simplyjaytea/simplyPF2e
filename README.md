# SimplyPF2e – AI Creature Forge

Turn a one-sentence idea into a fully statted, ready-to-run Pathfinder 2e NPC or monster — inside [Foundry VTT](https://foundryvtt.com), using the [Pathfinder Second Edition system](https://github.com/foundryvtt/pf2e).

## Install

Paste this manifest URL into **Foundry → Add-on Modules → Install Module**:

```
https://github.com/simplyjaytea/simplyPF2e/releases/latest/download/module.json
```

This link is **permanent** — it always resolves to the newest published release, so Foundry will detect and offer updates automatically. You never need a new URL when the module updates. (If it returns a 404, no release has been published yet — see [Releasing](#releasing-for-maintainers) below.)

Requires Foundry VTT **v13+** and the **pf2e** game system (6.0.0+).

## What it does

Type *"a cunning swamp hag who brews poisons from drowned travelers"*, pick a level, and get a complete creature: statistics, saves, strikes, skills, special abilities, spells, and gear. PF2e monsters normally take real prep time because everything has to be statted; the Forge does that work by splitting the job three ways:

1. **The AI invents the concept.** An LLM (DeepSeek by default, or any OpenAI-compatible API) receives your prompt and returns a structured concept: name, flavor, traits, which statistics should be *extreme / high / moderate / low*, what its strikes and signature abilities are, and which standard abilities, feats, spells, and equipment it uses.
2. **The module does the math.** Every number — AC, HP, saves, perception, skill modifiers, strike attack bonuses, damage dice, spell DCs — is looked up from the official GM Core **"Building Creatures"** benchmark tables for the level you chose. The AI never outputs numbers, so creatures are always mechanically sound for their level.
3. **The compendiums provide the content.** Abilities (Grab, Knockdown, Frightful Presence, ...), feats, spells, and equipment named by the AI are matched against the PF2e system's own compendium packs and the real documents are embedded in the actor. Nothing rules-critical is hallucinated: anything without a compendium match is either created as a clearly-marked custom ability or flagged in the preview so you can decide.

Two pieces of the concept get extra grounding:

- **Spells are chosen *from* the compendium.** When a creature is a spellcaster, the module reads the actual spell list for its tradition (filtered to the ranks a creature of that level may cast) out of the PF2e compendium and hands that list to the AI, which picks from it. The AI can't invent spells that don't exist, and every pick lands as the real spell document on the sheet.
- **Feats for trained creatures.** Creatures that would plausibly have class-like techniques — humanoid soldiers, monks, assassins — can be given real feats (Power Attack, Sudden Charge, ...), matched against the system's feats compendium and embedded on the NPC.

## Usage

1. Open the **Actors** sidebar tab and click **Creature Forge** (GM only), or run `game.modules.get("simplypf2e").api.open()` from a macro.
2. Optionally pick a **preset** from the dropdown, describe the creature, set its level (−1 to 24) and rarity, choose whether spellcasting is allowed, and click **Generate**.
3. Review the stat-block preview, then click **Create Actor**. The finished NPC opens on its sheet, ready to drop onto the canvas.

### Presets

The preset dropdown shapes the *build* while your description drives the *flavor*. Built-in presets cover the standard fantasy classes — Fighter, Barbarian, Rogue, Ranger, Monk, Cleric, Druid, Wizard, Sorcerer, Bard, Champion, and Alchemist — each encoding a GM Core-style road map (stat scales, techniques, casting tradition). "Level 5 hobgoblin veteran" + the Fighter preset gives a disciplined soldier; the same prompt with the Barbarian preset gives a reckless brute.

You can also save your own: click **+** next to the dropdown, give the preset a name and build guidance (written to the AI like the examples above), and it's stored in the world and appears in the dropdown marked with `*`. Select a custom preset and click the trash button to delete it.

The description box's placeholder shows a different example concept each time you switch presets — five per preset — as inspiration for what that preset can build.

### Random mode

Pick **🎲 Random (just pick a level)** from the preset dropdown, set a level, and click Generate. The Forge rolls a surprise brief locally (creature type × combat role × home × twist — thousands of combinations) and the AI builds it. Every Regenerate rolls a brand-new brief, so it never converges on the same ideas — great for filling a dungeon room or sparking a session when you're out of prep.

### Encounter mode

Switch the toggle at the top of the dialog to **Encounter**, set your party's level and size, pick a threat level (trivial → extreme), and optionally give a theme ("a smuggler ring run by wererats"). The module computes the XP budget and composition from the official GM Core encounter-building rules — a headline creature whose relative level matches the threat, backed by minions until the budget is spent — then the AI names the encounter, briefs each slot so the group feels cohesive, and every member runs through the full creature pipeline. The preview shows each member with count, level, role, and key stats plus the XP math; **Create All Actors** files the whole roster into a folder named after the encounter.

### Read-aloud text, Recall Knowledge, and portraits

Every creature now comes with GM support baked into its notes:

- A **read-aloud block** — two or three sensory sentences for theater of the mind, shown as a quote at the top of the description.
- A **Recall Knowledge line** — the correct identification skill for the creature type, a clickable check at the level- and rarity-based DC, and a short nugget of what a player learns on a success (its weakness, its most dangerous trick).
- **Art**: if you configure an image model in settings (any OpenAI-compatible `/images/generations` endpoint, e.g. OpenAI's `gpt-image-1` — DeepSeek doesn't offer images, so this can be a different provider than your text one), the Forge generates a portrait from the read-aloud text and uses it for the sheet and token. With no image model configured, it borrows art from the closest bestiary creature by type, size, and level instead. Encounter members always use bestiary art (no per-member image calls).

### Iterating on a creature

Generation is meant to be a conversation, not a one-shot:

- **Regenerate** re-rolls the concept from the same prompt — same level and math, new take.
- **Edit the prompt and regenerate** to steer it: add "make it a spellcaster", "give it a ranged attack", "less gear, more natural weapons", and so on.
- **Discard** clears the preview without creating anything.
- Nothing touches your world until you click **Create Actor**, so iterate freely — and after creation the result is a completely normal PF2e NPC you can keep editing on the sheet.

## Setup

Configure the AI provider under **Game Settings → Configure Settings → SimplyPF2e** (GM only):

| Setting | Description |
| --- | --- |
| API Base URL | Any OpenAI-compatible endpoint. Defaults to DeepSeek (`https://api.deepseek.com/v1`). |
| API Key | Your provider API key. |
| Model | e.g. `deepseek-chat`, `deepseek-reasoner`, `gpt-4o`, or whatever your provider offers. |
| Creativity | Sampling temperature (0–2). |
| Max response tokens | Raise if complex creatures come back truncated. |

Provider examples:

- **DeepSeek** – `https://api.deepseek.com/v1`, model `deepseek-chat`
- **OpenAI** – `https://api.openai.com/v1`, model `gpt-4o`
- **OpenRouter** – `https://openrouter.ai/api/v1`, any hosted model
- **Ollama (local)** – `http://localhost:11434/v1`, no key needed. Set `OLLAMA_ORIGINS=*` (or your Foundry origin) so the browser may call it.

### Choosing compendium sources

By default the Forge draws from the PF2e system packs (bestiary ability glossary, spells, feats, equipment). Under **Module Settings → SimplyPF2e → Compendium Sources** you can change that: the module scans every Item compendium in your world, detects which packs actually contain abilities, spells, feats, or equipment, and lets you check the ones each category may use — so homebrew compendiums and content modules (e.g. adventure-path packs) become available to the AI. The grounded spell selection reads from your chosen spell packs too, meaning the AI literally sees and picks from your homebrew spell list. Leaving a category empty falls back to the system defaults.

### Troubleshooting slow or stuck generations

- Responses are **streamed**: while generating you'll see a live progress bar with the current step and a character counter. Reasoning models (e.g. DeepSeek's reasoner variants) show "The model is thinking…" first — that can take a while and is normal.
- A **request timeout** setting (default 90 s) aborts the request only if the provider sends *no data* at all for that long, so slow-but-alive generations are never cut off. If you get timeout errors, check the provider's status page and your model name.
- Make sure **Model** is the exact API identifier from your provider's documentation (for DeepSeek e.g. `deepseek-chat` or `deepseek-reasoner`) — marketing names don't always match the API id. A wrong id normally returns an immediate error, not a hang.
- Spellcasters make **two** AI calls (concept, then grounded spell selection), so they take roughly twice as long as martial creatures.

> **Note on keys & requests:** requests are sent directly from the GM's browser to the provider, and the key is stored in world settings (visible to other GMs of the same world). Use a key you're comfortable with in that context.

## Known limitations (v0.2)

- Generated spellcasters use a spontaneous-style entry with 2 slots per rank; adjust on the sheet if you want prepared or innate casting.
- The benchmark tables were transcribed by hand from GM Core. If you spot a value that disagrees with the book, please open an issue.
- Matched feats are converted to NPC action items (the PF2e system does not allow feat items on NPC actors) — they keep the feat's cost, rules text, and automation.
- Clickable rolls in custom abilities depend on the AI following the module's phrasing conventions; if a phrase slips through unconverted, it stays as readable plain text (regenerate or edit the ability to fix it).
- Presets guide the AI rather than hard-constrain it — an occasional generation may drift from the chosen road map; regenerating usually lands it.
- Carried equipment is level-appropriate but not priced against treasure-budget tables yet (see roadmap).

## To do / Roadmap

- [x] **Templates / presets** — ✅ v0.2.0: built-in class presets (Fighter through Alchemist) plus user-created custom presets in a dropdown.
- [x] **Clickable rolls** — ✅ v0.1.4: damage, saves, checks, and area templates in custom abilities are inline roll links.
- [x] **Encounter mode** — ✅ v0.3.0: themed encounters built to the GM Core XP budget (threat level × party size × party level), created as a folder of actors. Covers the old "batch mode" idea.
- [x] **Recall Knowledge & read-aloud** — ✅ v0.3.0: theater-of-the-mind read-aloud block and a clickable Recall Knowledge check with a player-facing info nugget.
- [x] **Creature art** — ✅ v0.3.0: optional AI portrait generation, with closest-bestiary-match art as the no-API fallback.
- [ ] **Chat command** — e.g. `/forge swamp hag 6` to generate straight from the chat box during play.
- [ ] **Treasure** — price carried gear and loot against the GM Core treasure-budget tables for the creature's level.
- [ ] **Full PC-power-level characters** — generate complete character-class-strength NPCs (villains, rivals, pregens) built to player-character power budgets.
- [ ] **Preset sharing** — export/import custom presets as JSON to trade with other GMs.
- [ ] **Reskin an existing creature** — use a bestiary entry as the mechanical template and let the AI reflavor it.
- [ ] Elite/weak adjustments and level shifting for existing creatures.
- [ ] Focus spells for spellcasters.

## Releasing (for maintainers)

Publishing an update is one step, done any of three ways:

- **Push a tag:** `git tag v0.1.1 && git push origin v0.1.1`. The workflow creates the release itself.
- **From Actions:** go to **Actions → Release → Run workflow** and enter a version like `0.1.1`.
- **From Releases:** draft and publish a release by hand with a tag like `v0.1.1`.

Either way the workflow stamps the version into `module.json`, builds `module.zip`, and attaches both to the release. Because the install link above points at `releases/latest`, existing users are offered the update automatically and the link never changes.

## Licensing & attribution

This module uses trademarks and/or copyrights owned by Paizo Inc., used under [Paizo's Community Use Policy](https://paizo.com/licenses/communityuse) and the ORC License. The benchmark values are rules data from *Pathfinder GM Core* © Paizo Inc. This module is not published, endorsed, or specifically approved by Paizo.

Module code is released under the MIT License (see `LICENSE`).
