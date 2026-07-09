# SimplyPF2e – AI Creature Forge

Turn a one-sentence idea into a fully statted, ready-to-run Pathfinder 2e NPC or monster — inside [Foundry VTT](https://foundryvtt.com), using the [Pathfinder Second Edition system](https://github.com/foundryvtt/pf2e).

## Install

Paste this manifest URL into **Foundry → Add-on Modules → Install Module**:

```
https://github.com/simplyjaytea/simplyPF2e/releases/latest/download/module.json
```

This link is **permanent** — it always resolves to the newest release, so Foundry will detect and offer updates automatically. You never need a new URL when the module updates.

Requires Foundry VTT **v13+** and the **pf2e** game system (6.0.0+).

## What it does

Type *"a cunning swamp hag who brews poisons from drowned travelers"*, pick a level, and get a complete creature: statistics, saves, strikes, skills, special abilities, spells, and gear. PF2e monsters normally take real prep time because everything has to be statted; the Forge does that work by splitting the job three ways:

1. **The AI invents the concept.** An LLM (DeepSeek by default, or any OpenAI-compatible API) receives your prompt and returns a structured concept: name, flavor, traits, which statistics should be *extreme / high / moderate / low*, what its strikes and signature abilities are, and which standard abilities, spells, and equipment it uses.
2. **The module does the math.** Every number — AC, HP, saves, perception, skill modifiers, strike attack bonuses, damage dice, spell DCs — is looked up from the official GM Core **"Building Creatures"** benchmark tables for the level you chose. The AI never outputs numbers, so creatures are always mechanically sound for their level.
3. **The compendiums provide the content.** Abilities (Grab, Knockdown, Frightful Presence, ...), spells, and equipment named by the AI are matched against the PF2e system's own compendium packs and the real documents are embedded in the actor. Nothing rules-critical is hallucinated: anything without a compendium match is either created as a clearly-marked custom ability or flagged in the preview so you can decide.

## Usage

1. Open the **Actors** sidebar tab and click **Creature Forge** (GM only), or run `game.modules.get("simplypf2e").api.open()` from a macro.
2. Describe the creature, set its level (−1 to 24) and rarity, choose whether spellcasting is allowed, and click **Generate**.
3. Review the stat-block preview, then click **Create Actor**. The finished NPC opens on its sheet, ready to drop onto the canvas.

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

> **Note on keys & requests:** requests are sent directly from the GM's browser to the provider, and the key is stored in world settings (visible to other GMs of the same world). Use a key you're comfortable with in that context.

## Known limitations (v0.1)

- Generated spellcasters use a spontaneous-style entry with 2 slots per rank; adjust on the sheet if you want prepared or innate casting.
- The benchmark tables were transcribed by hand from GM Core. If you spot a value that disagrees with the book, please open an issue.
- Elite/weak adjustments, focus spells, and "generate from an existing creature as a template" are on the roadmap.

## Releasing (for maintainers)

Publishing an update is one step: create a GitHub release with a tag like `v0.2.0`. A workflow stamps the version into `module.json`, builds `module.zip`, and attaches both to the release. Because the install link above points at `releases/latest`, existing users are offered the update automatically and the link never changes.

## Licensing & attribution

This module uses trademarks and/or copyrights owned by Paizo Inc., used under [Paizo's Community Use Policy](https://paizo.com/licenses/communityuse) and the ORC License. The benchmark values are rules data from *Pathfinder GM Core* © Paizo Inc. This module is not published, endorsed, or specifically approved by Paizo.

Module code is released under the MIT License (see `LICENSE`).
