# SimplyPF2e – AI Creature Forge

A [Foundry VTT](https://foundryvtt.com) module for the [Pathfinder Second Edition system](https://github.com/foundryvtt/pf2e) that turns a one-sentence idea into a fully statted, ready-to-run NPC or monster.

Type *"a cunning swamp hag who brews poisons from drowned travelers"*, pick a level, and get a complete creature: stats, saves, strikes, skills, special abilities, spells and gear — with **all the math computed from the official GM Core "Building Creatures" benchmark tables** and abilities/spells/equipment **pulled from the PF2e system compendiums**, not hallucinated.

## How it works

The design deliberately splits responsibilities:

1. **The AI invents the concept.** An LLM (DeepSeek by default, or any OpenAI-compatible API) receives your prompt and returns a structured concept: name, flavor, traits, which stats should be *extreme / high / moderate / low*, what its strikes and signature abilities are, which glossary abilities (Grab, Knockdown, Frightful Presence, ...), spells and equipment it uses.
2. **The module does the math.** Every number — AC, HP, saves, perception, skill modifiers, strike attack bonuses, damage dice, spell DCs — is looked up from the GM Core benchmark tables for the level you chose. The AI never outputs numbers, so creatures are always mechanically sound.
3. **The compendiums provide the content.** Glossary abilities, spells and equipment named by the AI are fuzzy-matched against the PF2e system packs (`bestiary-ability-glossary-srd`, `spells-srd`, `equipment-srd`) and the real documents are embedded in the actor. Anything with no match is either created as a custom ability (with the AI's rules text) or clearly flagged in the preview.

## Usage

1. Open the **Actors** sidebar tab and click **Creature Forge** (GM only), or run `game.modules.get("simplypf2e").api.open()` from a macro.
2. Describe the creature, set its level (−1 to 24) and rarity, and click **Generate**.
3. Review the stat-block preview. Warning icons mark spells/equipment that had no compendium match. Click **Regenerate** for a new take, or edit the prompt and try again.
4. Click **Create Actor**. The NPC is created and its sheet opens, ready to drop on the canvas or tweak further.

## Setup

Configure the AI provider under **Game Settings → Configure Settings → SimplyPF2e** (GM only):

| Setting | Description |
| --- | --- |
| API Base URL | Any OpenAI-compatible endpoint. Defaults to DeepSeek (`https://api.deepseek.com/v1`). |
| API Key | Your provider API key. |
| Model | e.g. `deepseek-chat`, `deepseek-reasoner`, `gpt-4o`, or whatever your provider offers. |
| Creativity | Sampling temperature (0–2). |
| Max response tokens | Raise if complex creatures come back truncated. |

Tested provider examples:

- **DeepSeek** – `https://api.deepseek.com/v1`, model `deepseek-chat`
- **OpenAI** – `https://api.openai.com/v1`, model `gpt-4o`
- **OpenRouter** – `https://openrouter.ai/api/v1`, any hosted model
- **Ollama (local)** – `http://localhost:11434/v1`, no key needed. Set `OLLAMA_ORIGINS=*` (or your Foundry origin) so the browser may call it.

> **Note on keys & requests:** requests are sent directly from the GM's browser to the provider, and the key is stored in world settings (visible to other GMs of the same world). Use a key you're comfortable with in that context.

## Compatibility

- Foundry VTT **v13** and **v14**
- Pathfinder Second Edition (pf2e) system **6.0.0+**

## Known limitations (v0.1)

- Generated spellcasters use a spontaneous-style entry with 2 slots per rank; adjust on the sheet if you want prepared or innate casting.
- The benchmark tables were transcribed by hand from GM Core. If you spot a value that disagrees with the book, please open an issue.
- Elite/weak adjustments, focus spells, and "generate from an existing creature as a template" are on the roadmap.

## Licensing & attribution

This module uses trademarks and/or copyrights owned by Paizo Inc., used under [Paizo's Community Use Policy](https://paizo.com/licenses/communityuse) and the ORC License. The benchmark values are rules data from *Pathfinder GM Core* © Paizo Inc. This module is not published, endorsed, or specifically approved by Paizo.

Module code is released under the MIT License (see `LICENSE`).
