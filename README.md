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

The link always resolves to the newest release, so Foundry offers updates automatically. The manifest declares Foundry **v14** and a **pf2e** system minimum of **8.5.0**, the version the module is built and tested against (live QA ran on Foundry 14.365 with pf2e 8.5.0). Older pf2e versions are not supported; other version pairs need the same acceptance checks before being claimed as supported.

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

Creativity, max response tokens, request timeout, and the optional Free Archetype variant live under advanced module settings. Grounding/selectors always use temperature 0. With Free Archetype enabled, each even class-feat level from 2 gains an archetype slot filled only from the proven catalog, with dedication ability prerequisites checked against the character.

**Compendium sources:** by default the module draws from the PF2e system packs. Under **Compendium Sources** pick which Item packs supply abilities, spells, feats, equipment, and class features, plus which Actor packs supply bestiary scaffolds. Creature and encounter generation require an enabled bestiary Actor pack before they spend tokens.

## Generate

Open the **Actors** sidebar and click **SimplyPF2e** (GM only), or run `game.modules.get("simplypf2e").api.open()`. Pick a mode at the top.

| Mode | What it does |
| --- | --- |
| **Monster** | Creature-first combatant from a description and level (−1 to 24). |
| **NPC** | Story-focused, combat-ready non-player character. Same pipeline, different intent. |
| **Encounter** | Theme plus party level/size/threat → XP budget, roster, and a full creature pipeline per member. |
| **Character** | Real Ancestry/Background/Class items and feat slots. The pf2e system computes AC/HP/saves. |

**Generate & Create** validates and creates in one pass. **Preview Plan** runs the same plan without creating documents. The **dice** button sits beside Generate in every mode: it ignores the typed prompt, rolls a local surprise brief, and runs Preview Plan. Cancel aborts an in-flight generation (not a Foundry write already in progress). Mode-by-mode depth is under [Mode details](#mode-details).

Open **Advanced options** for a preset, rarity, treasure amount, and spellcasting. Monster, NPC, and Encounter also offer **Include equipment** and **Include treasure**. Turn either off to enforce an empty category regardless of the AI response; turning off treasure also prevents coin padding. These switches do not change Character starting equipment or wealth. The rarity cap applies to ancestry, background, heritage, feats, spells and equipment. The preset menu is **— No preset —**, then **Standard classes** (the 23 Remaster PF2e classes as flavor guides), then **Custom presets** only when this world has saved any. Picking Magus or Witch there does not make those classes complete-only.

Character mode has **Required character choices** for name, class, ancestry, heritage, background, key ability, and the supported racket, methodology, arcane school, and arcane thesis. Choose an exact source to keep it through generation; choose **No heritage** to require none. You can also write separate lines such as `Class: Rogue`, `Name: Kaelen`, and `Racket: Thief` (a racket, methodology, school, or thesis requires an explicit class; a Wizard has one control for each of its two choices, written, for example, `School: School of Mentalism` and `Thesis: Staff Nexus` with the exact published names). Recognized identity mentions in free prose stop before AI spending until you set the corresponding required choice. Duplicate source names, conflicting declarations and unavailable choices also stop. Unrecognized prose remains flavor guidance; this is a bounded input grammar, not a general language interpreter. Random ignores required choices. If you change the request or required choices after Preview Plan, generate a new plan before creating.

Required key abilities must be proven by the class's native base options; path-granted alternatives such as Ruffian Strength remain unavailable in this slice. Existing supported-class and live-QA limits still apply.

The official **Guard** background also requires **Background Lore: Legal Lore** or **Warfare Lore**. Select Guard under Required choices to reveal its Lore control; separate `Background: Guard` and `Background Lore: Legal Lore` declarations work too. The choice appears in the preview and creates one trained Lore skill. Guard is omitted from automatic/Random background selection until its Lore is supplied. Other backgrounds retain concrete Lore supplied by their source; unresolved source placeholders stop creation. Background choices recorded only in prose still need separate support.

In Character mode, **Generate spell lists** controls generated spell lists. Turning it off still permits feats and native features that grant magic or ask you to choose a spell.

## Status

| Feature | Status |
| --- | --- |
| **NPCs & monsters** | Stable. The oldest, most battle-tested path. |
| **Encounter mode** | Stable. |
| **Presets** | **Standard** lists the 23 Remaster PF2e classes as flavor guides. **Custom** appears only when this world has saved presets. Magus, Witch, and the other Standard classes do not finish complete-only Characters. |
| **Player Character mode** | Released for GM-reviewed use with **Fighter**, **Rogue**, **Investigator**, and **Wizard** offered. Native Fighter and Investigator paths have bounded live coverage; Rogue acceptance remains incomplete, and Wizard has no live coverage yet. Wizard now also embeds the chosen school's initial focus spell (not live-verified). Standard presets guide flavor only. Review the class, heritage, choices, equipment, and numbers before play. |
| **Item forge** | Core flows live-verified on Foundry 14 / PF2e 8.5: cancellation isolation, runed sheet parity, and generated-macro escaping. GMs open it from the Items directory; the v0.3.5.57 entry point passed live click and singleton-window checks. Scrolls and wands are implemented but not yet live-verified. Cantrip decks are implemented, ungated, and not live-verified. The loot actor destination and the Treasure parcel are built behind `experimentalTools` and not live-verified. |
| **Ordinary multiclass** | Behind the default-off world setting **Ordinary multiclass archetypes**. The noncaster catalog is offered, plus the Wizard and Bard spellcasting archetypes (Dedication and Basic Spellcasting feats) when spellcasting is allowed; no live Foundry acceptance is recorded. |
| **Experimental tools** | Behind the **Enable experimental tools** setting (on by default since 2026-10-30; a GM can turn it off), GM only. Includes the `/forge` chat command, the Creature Tools reskin and elite/weak flows, and `openCreatureTools`. Not native-accepted; may create actors or fail differently from the stable generator. |
| **Level shifting** | Behind the **Enable experimental tools** setting (on by default since 2026-10-30; a GM can turn it off), GM only. Creates a new NPC shifted by one or two levels using GM Core benchmark deltas; the source is unchanged. Not native-accepted. |
| **Hazard** | Built behind `experimentalTools`, not native-accepted. While the **Enable experimental tools** setting is on (GM only), the Generator offers a Hazard mode: the AI picks words and scale words, the module fills every number from the GM Core Building Hazards tables, and you review the preview before Create makes the hazard actor. Nothing is written before Create. |

## What's new

- Advanced presets list the 23 Remaster classes under **Standard**, with world-saved **Custom** presets in their own group when any exist. Magus, Witch, and the rest are flavor guides; complete-only Character is still Fighter, Rogue, Investigator, and Wizard.
- Refreshed light and dark interfaces, clearer primary actions, and an animated rune loading card. Progress stays in one run through creation, shows elapsed time and stage outcomes, and respects reduced-motion preferences.
- Provider headers distinguish configured connections from connections tested in this window; saved profiles remain local to your browser.
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

Creature class abilities are selected as complete packages. The module adds supported prerequisite abilities automatically, counts those supporting powers toward the ability budget, and checks the sources again before creating the NPC. Unsupported AI suggestions can be replaced during the existing grounded selection. An explicitly required unsupported ability stops creation with an explanation. Normal strikes, saves, conditions and effect activation still use Foundry's controls.

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

Describe a concept ("a grizzled dwarf ranger who hunts undead") and set a level (1–20), or use the **dice button** to ignore the prompt and roll a local adventurer brief at that level. In **Advanced options**, optionally cap the **Max rarity** of the ancestry, background, heritage, feats, spells and equipment the AI may pick — capping at Uncommon rules out Rare options like Fetchling, so they're never even offered.

Nothing here is scale-word math. A PC is assembled from real Ancestry, Background and Class items plus feats at every level slot (ancestry/class/skill/general from the real class schedules, including first-level class feats, accelerated Rogue/Investigator skill feats, and any feat the background itself grants — like Acolyte's *Student of the Canon*), ability boosts, and skill increases past Trained. The PF2e system then computes AC, HP, saves and proficiencies exactly as it would for a character built by hand.

Complete one-click selection currently offers Fighter, Rogue, Investigator, and Wizard. Rogue rackets, Investigator methodologies, and a Wizard's arcane school and arcane thesis are chosen from enabled Class Features sources before the actor exists. A **Standard** Magus or Witch preset only guides flavor and fighting style; it does not make those classes complete-only. Other classes are not widened just to produce a dialog-dependent or approximate build.

A Wizard's initial Arcane School focus spell is read from the chosen school's own description link and embedded in a focus entry. If that link cannot be parsed or the spell is unavailable, the build continues with a console warning and no focus entry. The advanced school spell is embedded in the same focus entry when the level-8 Advanced School Spell feat is built; curriculum extras and the familiar stay manual. The preview names the school spells before Create, or says they are chosen at Create. If **Allow spellcasting** is off, the school spell is skipped silently.

**Focus pool:** the module no longer adds its own focus-pool rule. pf2e counts one point per non-cantrip focus spell, capped at 3, by itself. This corrects an over-count on every PC focus class: a class outside the offered set that embeds one focus spell now gets 1 point, not 2. Not live-verified.

**Review the character concept before play.** The provider can choose a different offered class or omit heritage even when the prompt requests one. Use **Preview Plan** when those details must be checked before creation, and complete any native PF2e choice dialogs. Compendium match counts establish source grounding; they do not verify that every requested detail was followed.

Starting wealth buys real gear rather than turning into raw coin, and fundamental runes on weapons and armor are capped to what the character's level actually allows. Builds are single-class unless the GM enables **Ordinary multiclass archetypes** in world settings (off by default). That setting offers the noncaster dedication catalog and its package feats in class feat slots, with dedication locks enforced. One spellcasting archetype is built, Wizard: with spellcasting allowed in the generator, **Wizard Dedication** (Intelligence +2) and **Basic Wizard Spellcasting** can be picked, and the character gets a separate arcane, Intelligence, prepared "Wizard Archetype Spells" entry (two prepared cantrips from a four-cantrip spellbook; one slot each of ranks 1, 2 and 3 at levels 4, 6 and 8 with the Basic feat; two spellbook spells per rank), filled from common arcane spells in your compendium. The preview lists the spellbook, and the editor does not change these feats or their spells. Bard works the same way: **Bard Dedication** (Charisma +2) and **Basic Bard Spellcasting** give a separate spontaneous occult, Charisma "Bard Archetype Spells" entry (two cantrips, then one slot and one repertoire spell each of ranks 1, 2 and 3 at levels 4, 6 and 8, and one signature spell from level 6), and the preview shows and lets you change the bard muse, which is saved on the Bard Dedication (the muse's own feature, starting feat and spell are not granted), and the signature spell. When a dedication trains a skill the character already has, the character gets one replacement skill, picked in the same priority order as its other skills (a dedication whose skill is itself a choice, such as Fighter or Monk, gets none). Expert and Master spellcasting feats, the Wizard school choice, and every other caster dedication (Cleric, Druid, Sorcerer, Witch, Oracle, Psychic, Magus, Summoner) are not built. The Character preview lets you edit each identity, feat, and equipment choice before creation; spell-affecting choices are still deferred.

After native features establish the character's actual proficiencies, the new sheet readies only its exact generated equipment: one proficient worn armor and no more than two hands of proficient weapons, shields, or tools. Incompatible or conflicting selections stay stowed and appear as a review warning. Compatible generated ammunition is selected for non-repeating reload-0 weapons; reloadable/repeating weapons, investment, and containers stay with the normal PF2e sheet controls.

**Skill completion:** the existing concept request supplies ordered core-skill preferences; no extra AI call or setup screen is needed. Preview shows those preferences followed by key-ability defaults. The module supplies the numbers: real class training plus native Intelligence, replacements for directly overlapping class/background training, and the class document's own skill-increase schedule. Increases are allocated in level order with the Expert/Master/Legendary gates, preserving native proficiencies and existing background Lore.

After creation, the generator shows a dismissible snapshot of resulting skill ranks, unspent/unsupported allocations, and any native choices with no recorded selection. Open Character returns to that exact actor. This is not a live validator or a repair tool: existing characters are untouched. Missing preferences use labeled automatic defaults; missing or invalid class schedules are not guessed.

### Item forge

GMs can open the forge from the **Item Forge** button in the Items directory. The same GM-only entry point is available from the browser console with `game.modules.get("simplypf2e").api.openItemForge()`; player calls are rejected.

Pick **Wondrous Item**, **Weapon**, **Armor**, **Scroll**, or **Wand**, describe it, set level and rarity, and choose **Generate Item Plan**. Review the result, then choose **Create Item**. The completion card retains an **Open Item** action and lets you **Forge Another**.

**Wondrous items** get passive effects — item bonuses (AC, perception, saves, skills), resistances, weaknesses, immunities, senses, and speed grants — that *actually work* on a sheet, because:

- **Rule Elements are cloned from real published items, never written from memory.** Foundry fails *silently* on a wrong rule key — the ring just does nothing. The forge offers supported rules from ordinary priced equipment at or below the chosen level and rarity, excluding artifacts and sources with detected access or prerequisite restrictions. This conservative screening does not prove every interaction in a custom combination. It clones the selected rule unchanged, including its statistic, value, range, and acuity, and preserves the source's investment requirement. The AI chooses only offered targets and scale words; an unavailable effect is omitted.
- **Prices are empirical** — the median real compendium price at that level, scaled for rarity, not a remembered table.
- **Usage strings are harvested from real gear**, so the item slots correctly.

**Activated items** add a 1/day ability — damage, heal, condition, or self-buff — as a companion **macro**, with a clickable Activate link in the description and the macros filed in a "SimplyPF2e Item Forge" folder (auto-deleted with the item). Target a token, click Activate; damage and healing post as normal PF2e chat cards so the built-in Apply buttons handle the rest. Each copy tracks its own charge and recharges through Rest for the Night, including player-owned rests. The charge must save before an effect runs; repeated clicks on the same client cannot activate the same copy concurrently. Companion macros remain while another world, actor, or token copy still references them. Activation dice and DCs use module-owned GM Core benchmarks; these are custom-item defaults, not published magic-item balance values.

**Weapons and armor** use a rune pipeline: real base items, real property runes filtered by their actual usage string and the base armor category, and fundamental rune tiers whose real item level fits the target. The forge's chosen rarity caps every pool, so a Common item offers only common bases, property runes and fundamental tiers, and uncommon or rare candidates appear only when the forge rarity is raised. The AI picks only from those candidates. Selections retain their exact compendium references, even when packs contain identically named items. A temporary native PF2e item prepares the preview price, level, and rarity without saving anything. Create checks the selected sources again and preserves the cloned base source values for native preparation. Property runes are capped at the potency rune's slots, as pf2e caps them. When a family's greater, major or true grade is chosen, the lesser grades of that family are dropped, as a module rule. Any dropped rune is named in the preview with the reason, and a drop never blocks creation. Runes whose published restriction depends on armor material are excluded because the compendium index cannot prove material compatibility.

**Scrolls and wands** are built from real spells. The forge lists the spells in your configured spell packs; cantrips, focus spells, and rituals are never offered, and a spell rarer than the chosen rarity is left out. The AI picks up to six spells and a rank for each one from that list. The rank runs from the spell base rank up to the cap that the forge level sets, so a rank-10 spell cannot become a wand. The cap is the lower of the native ceiling (10 for scrolls, 9 for wands) and the level limit: (level + 1) / 2 rounded down for scrolls, and (level - 1) / 2 rounded down for wands. Each consumable is cloned from the matching pf2e blank scroll or wand template, pinned by UUID, so its price and level come from that template and PF2e recomputes them on prep. Nothing is written until **Create Item**. A pick that cannot be built, or that sits above the cap, is dropped, and the preview lists the reason.

**Cantrip decks** are built from the pinned pf2e `Cantrip Deck (5-pack)` template. The forge makes one deck per distinct common or uncommon cantrip the AI picks from your enabled spell packs. Each deck holds the cantrip's name link but, as in pf2e, no embedded spell. Price, level and the 5 uses come from the template. A deck takes its cantrip's rarity: a common Forge offers common cantrips, and an uncommon, rare or unique Forge offers up to uncommon. Rare and unique cantrips, focus cantrips and rituals are never offered. The level control is hidden because a deck is always level 1.

**Loot actor and Treasure parcel (experimental).** While **Enable experimental tools** is on, scrolls, wands and cantrip decks can be created as a **Loot actor**: one pf2e Loot actor holds the whole batch, and the Item Forge form chooses that destination. A **Treasure parcel** always goes to a Loot actor. It fills the GM Core Party Treasure by Level row for the party level (1–20) and party size (1–8) with scrolls of real spells and with permanent items from published equipment (not all slots always fill), and it splits the row's currency into pp, gp, sp and cp. The AI picks only spells and items by name from the candidate lists; the module supplies every level, rank, count and price. Nothing is written before **Create**, and a failed create is rolled back. pf2e's default LIMITED ownership is expected to let players loot a placed token without seeing the actor in the directory (not live-verified).

**Items with rules go to a world folder (parcel option, off by default).** Many published magic items carry built-in rule effects, which a pf2e Loot actor cannot hold, so a parcel skips them. Turn this option on and those items are created unchanged in a world Item folder named after the parcel, next to the Loot actor. Drag them onto the characters who receive them. The preview shows which items go where, and the total stays exact. If any part of the create fails, the folder, its items and the actor are removed.

### Experimental tools

On by default in a fresh world since 2026-10-30 (a user decision, before native acceptance). A GM can turn off **Enable experimental tools** in world settings to hide the `/forge <brief> <level>` chat command (add `--preview` to plan without creating) and the **Creature Tools** directory button. Creature Tools offers AI reskins of an existing bestiary-based creature and native elite/weak adjustments to an explicitly selected NPC. Each action rechecks the setting before any provider request or world write. These flows have no live Foundry acceptance yet.

### Presets

The preset dropdown shapes the *build* while your description drives the *flavor*. "Level 5 hobgoblin veteran" + Fighter gives a disciplined soldier; the same prompt + Barbarian gives a reckless brute.

**Standard** is the 23 Remaster PF2e classes (Alchemist through Wizard), listed in their own menu group. They are flavor guides, not pack bindings, and they do not widen complete-only Character generation beyond Fighter, Rogue, Investigator, and Wizard. **Custom** is a second group that appears only when this world has saved presets — the menu never shows an empty Custom group. A preset can also carry defaults for rarity, spellcasting and Treasure amount.

- **Manage Presets** is the one place to create, edit, duplicate, export, or delete custom presets. Built-in Standard classes are not editable there. Export writes JSON you can hand to another GM; imports always get a fresh id so they never collide.

The description placeholder cycles five example concepts per preset as inspiration.

### Loot and treasure

Creatures carry what they drop: coins, consumables, scrolls and magic items, contextual to the creature and scaled to its level and rarity. Coins become real PF2e currency items (so they land in the sheet's Currency section) and scrolls are assembled the way the system does on spell drag-and-drop — the real spell embedded into the matching rank's scroll template.

The **Treasure amount** control shapes the haul twice. Up front it nudges what the AI proposes: Stingy leans to 2–3 cheap items and usually skips the magic item, Standard uses the baseline 3–8, Generous leans to 6–8 with at least one magic item. The prompt prioritizes explicit no-loot requests, and a valid empty loot draft remains empty without automatic coin padding. The original GM brief is retained through the grounding passes. For a nonempty haul, the *value* is budgeted rather than guessed: the module computes a target from the GM Core Treasure by Level table (level, creature rarity, and the same Treasure setting), sums the real compendium prices of what was generated — runes included — and flexes the **coin** entries to land on target. Named items are never added or removed to hit a number.

Loot volume also follows your framing: describe a hoard or ask for "lots of loot" and the haul scales up. Happy with the creature but not the haul? **Reroll Loot** regenerates only the treasure.

## Troubleshooting

**Slow or stuck generations**

- The rune loading card shows **estimated progress**, the current stage, and elapsed time. It follows provider waiting, thinking, writing, retry, and validation activity; the percentage is a progress estimate, not a promise of time remaining. Expand **Generation details** for stage outcomes.
- **Cancel** stops an in-flight request before native creation starts. Closing the window hides it while work continues; reopen it from the directory to see the same run or result. Failures and cancellations retain their last progress instead of showing 100%.
- The rune animation and bar movement stop when your browser or operating system requests reduced motion.
- The **request timeout** aborts only on total silence from the provider, so slow-but-alive generations are never cut off. If you get timeouts, check the provider's status page and your model name.
- A large Ollama or LM Studio model may be silent while it loads, or while another request owns its only generation slot. Load/warm the model in the server first, wait for other work to finish, or temporarily raise **Request timeout**; a warm retry should start streaming much sooner.
- Check **Model** is the exact API identifier from your provider's docs. A wrong id normally returns an immediate error rather than hanging.
- Spellcasters make **three** AI calls (concept, a small spell-focus pass, then grounded selection), so they take longer. Creatures carrying gear make one more.
- After generation the preview shows an exact **token usage report** per call. If a provider doesn't report usage, the step is a clearly-marked estimate, and the compact last-run line beside the provider keeps **≈**.

**Odd results**

- **Missing an ability you expected** (Attack of Opportunity on a soldier, say) — the AI decides case by case; nudging the prompt usually gets it.
- **An unfamiliar item name** — the module targets current Remaster terminology. If it is not in an enabled source, the complete plan stops before creation; widen sources or choose a supported concept.
- **A plan reports unresolved content** — one or more required published picks was absent from the enabled sources. Use **Compendium Sources** to include the appropriate pack, then generate again. Spell sources also support scroll loot, so they remain required for noncasters; bestiary sources provide creature art and token scaffolding.

## Limitations

**Generation quality**

- Presets guide the AI rather than constrain it; an occasional generation drifts. Regenerating usually lands it.
- Clickable rolls in custom abilities depend on the AI following the module's phrasing conventions. A phrase that slips through stays readable plain text.
- Existing forged companions store their command text. Module updates do not rewrite earlier macros or item mechanics; the new charge checks and click guard apply to newly generated companions. Simultaneous activations from different clients still lack atomic charge locking.
- A custom (non-glossary) passive is only as interactive as its phrasing — anything outside the standard damage/save/check/heal/area conventions is flavor text you apply by hand.
- Required gear and treasure do not receive custom mechanical placeholders. An unresolved item blocks the complete plan instead of creating an approximation.

**Rules coverage**

- Complete one-click Player Character selection currently offers **Fighter, Rogue, Investigator, and Wizard**. No class is widened merely to create a dialog-dependent or approximate build. NPCs retain spontaneous-style spellcasting entries.
- **Wizard** is built as a prepared arcane caster from PF2e 8.5.0 data: the class, its native Arcane Bond, one closed arcane school and one closed arcane thesis, with a spellbook equal to the prepared spells. Only schools and theses whose grant chain asks no further question are offered; Rooted Wisdom, Unified Magical Theory, Runelord, and Experimental Spellshaping are not. The curriculum's extra cantrip and extra restricted spell slot per rank are manual. The initial school focus spell is embedded in a focus entry (see [Player Character mode](#player-character-mode)); the advanced school spell is embedded when the level-8 feat is built, and a focus spell the model names for a Wizard is still dropped. Text-only schools and theses (Spell Blending, Spell Substitution, Staff Nexus, and most schools) create their feature without automated effects, and familiar actors are not created. If the installed Arcane School data has a shape this module cannot stage, Wizard is not offered and a required Wizard is refused before any AI call, instead of a PF2e dialog opening after creation starts.
- PF2e stores feat prerequisites as display text, not a general eligibility API. Complete-only PC catalogs keep a feat only when every published clause is readable and proven against the staged ancestry/background/class grants and already-known skill training. Unmet, malformed, or unprovable text (including most feat-chains and expert/master ranks not yet on the snapshot) is dropped rather than guessed. Empty feat slots still block creation. Prerequisites are evaluated at the slot's earned level. Investigator's restricted Skillful Lessons slots currently require proven explicit mental-skill or Lore rank prerequisites; generic choices and unmodeled methodology exceptions are excluded.
- With the Free Archetype variant enabled, each even class-feat level from 2 gains an archetype feat slot. Those slots use the system's distinct `archetype-<level>` group rather than ordinary class-feat slots, take only proven catalog dedications and their package feats, check dedication ability prerequisites against the slot's derived modifiers, and enforce the ordinary multiclass lock. A dedication of the PC's own class is refused.
- PC loadout readiness currently covers published equipment proficiency, one armor slot, the two-hand limit, and compatible selected ammunition for non-repeating reload-0 weapons. Reloadable/repeating ammunition, item investment, container placement, and broader item-specific activation requirements still use the native sheet controls.
- NPC discovery includes enabled class-feat sources across classes, but execution is limited to supported rule and dependency packages. Feats become NPC action items because PF2e forbids raw feats on NPC sheets. PC-only resources, unproven prose prerequisites, unsupported native choices and incompatible grants remain unavailable. This is not universal automation for every PC feat.
- Explicit named NPC abilities use bounded local requirement matching. Ambiguous names or exclusions stop rather than granting unintended powers. Encounter themes containing named ability constraints stop before generation because the module cannot reliably assign a free-form requirement to a particular member; generate that constrained NPC separately.
- Only coin entries flex to hit the treasure budget. A haul whose named items already exceed it is left alone rather than losing items. Carried gear isn't counted against the budget. The AI writes no prices or coin amounts: a name with no compendium match is dropped with a console warning, and only real compendium prices count.
- The benchmark tables were transcribed by hand from GM Core. If a value disagrees with the book, please open an issue.
- The Max rarity cap covers ancestry, background, heritage, feats, spells and equipment. The Character editor applies it when it recomputes after an identity edit. The Item Forge caps its pools (including base weapons and armor and runes for a runed item) by its own rarity input.

**Remaining live-acceptance gaps** (built, reviewed, and source-verified; the cases below still need actual-game coverage)

- **Wizard** has no live pass: the school and thesis staging, the native Arcane Bond grant, the prepared spellbook, and the familiar grant of Improved Familiar Attunement are verified against PF2e source and local regressions only.
- **Rogue** has one bounded live pass in v0.3.5.72: a level-1 Thief kept its exact identity, racket, and Sneak Attack grants, but its Guard Background Lore was missing. The Guard Lore choice in v0.3.5.73 awaits native recheck, and higher-level Rogue coverage remains open. One **Investigator** methodology/grant path passed on a live sheet, but broader class, feat, and level coverage remains open.
- **Focus spells**, for both PCs and NPCs. For PCs, pf2e sets the pool (one point per non-cantrip focus spell, capped at 3) and the module adds no pool rule of its own. For NPCs, the pool size (spell count, capped at 3) is a defensible module default, not a verified GM Core rule. NPC focus spells only attach alongside normal spellcasting — a focus-only creature isn't supported.
- **Free Archetype.** Archetype slots are catalog-only, with ability prerequisites checked per slot. Native ChoiceSet prompts and live slot rendering are not yet verified.
- **PC spellcasting beyond complete-only classes.** Base-slot regressions cover all 140 rows of seven Remaster class tables, but native casting/expending, restricted class slots, and spellbook/familiar inventories still need live coverage. Complete one-click class selection remains limited to Fighter, Rogue, Investigator, and Wizard.
- **Item Forge coverage beyond the accepted paths.** A passive wondrous item, runed weapon/armor sheet parity, cancellation isolation, and generated healing/condition macro escaping have live evidence. The full passive-effect and activation matrix does not. Its rune path also has known gaps: no general rune prerequisite or exclusivity engine, material-restricted armor runes are excluded, and shield/ammunition runes are out of scope. Category restrictions such as light-only or medium/heavy-only are enforced against the real base armor category.
- **Scrolls, wands and cantrip decks** (Item Forge) are built from pinned pf2e templates and covered by offline tests, but no live Foundry run has verified them yet. Cantrip decks take common and uncommon cantrips. Staves and mystified items are not built.
- **Loot actor and Treasure parcel** (Item Forge, behind `experimentalTools`) have no live evidence. Permanent slots are filled from published magical equipment, generic and special wands, and ordinary fundamental-runed weapons and armor. Mundane level-0 gear is not offered. Up to three published gems or art objects can replace part of the gold. Coins are split into pp, gp, sp and cp, with no pp under 100 gp. Even-level consumable slots take the scroll one level lower. Parties under four use the four-PC row with no subtraction. For larger parties, the parcel value is compared with the four-PC table total.
- **Remaining activated-item macro paths** lean on PF2e system APIs that can change between versions. Damage, self-buff, and fallback branches still need live coverage. Every call degrades to a plain descriptive chat message rather than throwing. Best-effort behaviours: a condition's duration is shown but not enforced, a save whose degree of success can't be read is left for the table to adjudicate, and 1/day recharge relies on the "Rest for the Night" flow firing.

## Roadmap

Built, not native-accepted, and on by default behind **Enable experimental tools** (a GM can turn it off):

- **Chat command** `/forge <brief> <level>` (with `--preview`) and the **Creature Tools** reskin and elite/weak flows, behind **Enable experimental tools**.
- **Ordinary multiclass archetypes** (the noncaster catalog and the Wizard spellcasting package), behind their own setting.

Not yet available as user-facing features:

- **Level shifting** is available behind the **Enable experimental tools** setting (on by default), GM only, through the Creature Tools app and `module.api.levelShift`. Not native-accepted.
- **Hazard generator** (GM Core Building Hazards, simple and complex) is built behind the **Enable experimental tools** setting (on by default) as a Generator mode with a reviewed preview and Create. An encounter's hazard member is requested with its simple or complex kind fixed in the request; a wrong first answer costs one extra provider call before the retry. Not native-accepted.
- **Other caster multiclass dedications** (only Wizard and Bard are built, without Expert and Master spellcasting) and spell editing in the Character editor.
- **Native acceptance** of every experimental and multiclass row listed under Remaining live-acceptance gaps.

Shipped features and their versions are in the [release notes](https://github.com/simplyjaytea/simplyPF2e/releases).

## For maintainers

Development conventions, architecture, and the full bug history live in [PLAYBOOK.md](PLAYBOOK.md) and [HISTORY.md](docs/HISTORY.md). Use the [documentation map](docs/README.md) to find current acceptance records and historical plans.

Runtime modules live in `scripts/`; regression tests and their published-source fixtures live under `tests/`, and repository tooling is under `tools/`. Fixtures, tests and tooling are excluded from the release archive. The parcel and loot code is `treasure-tables.mjs`, `treasure-parcel.mjs`, `treasure-permanent.mjs`, `parcel-runed.mjs` and `loot-actor.mjs`; the extra-purchase trigger for the PC loot pass is `purchase-pass.mjs`. The full module map is in [PLAYBOOK.md](PLAYBOOK.md) §4.

Run the same dependency-free verification command used by pull-request and release CI with Node 22:

```bash
node tools/check.mjs
git diff --check
```

The command syntax-checks every script, test and tooling module, runs every `tests/**/*.test.mjs`, and parses the module/localization JSON. It also runs a static integrity check over relative imports and their named exports, template paths and registered partials, and `SIMPLYPF2E.*` localization keys (unused keys are reported as a warning count). Run a single regression directly with `node tests/<name>.test.mjs` when investigating a focused change.

CI syntax-checks every module, runs every `*.test.mjs`, and validates the JSON manifests on pull requests; the release pipeline repeats syntax, regression, and JSON verification before publishing. Live Foundry behavior remains outside this suite and must be checked across supported Foundry/PF2e versions before a production release.

**Releases are automatic.** Every push to `main` triggers `auto-release.yml`, which bumps the last segment of the latest tag (`v0.3.5.1` → `v0.3.5.2`) and calls `release.yml` to build and publish. This means **merging to `main` is not a quiet, reversible action** — it ships a public release immediately, and every existing install is offered that update right away. Treat it with the care of a manual `gh release create`.

Manual paths still work for an out-of-band publish: push a tag (`git tag v0.4.0 && git push origin v0.4.0`) or run **Actions → Release → Run workflow**. Each verifies first, stamps the version into `module.json`, builds `module.zip`, and attaches both. Publishing a release directly in GitHub is intentionally unsupported because validation cannot stop an already-public release.

## Licensing & attribution

This module uses trademarks and/or copyrights owned by Paizo Inc., used under [Paizo's Community Use Policy](https://paizo.com/licenses/communityuse) and the ORC License. The benchmark values are rules data from *Pathfinder GM Core* © Paizo Inc. The Party Treasure by Level table (GM Core Table 10-9, transcribed from Archives of Nethys) is rules data used under the same terms as the other benchmark tables. This module is not published, endorsed, or specifically approved by Paizo.

Module code is released under the MIT License (see `LICENSE`).
