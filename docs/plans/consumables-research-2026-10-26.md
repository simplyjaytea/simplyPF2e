# Scrolls and wands of real spells — upstream research record (2026-10-26)

Read-only research by a Haiku 5.5 worker against foundryvtt/pf2e at `pf2e-8.5.0` (installed) and `master`. Nothing was executed in Foundry; the repo was not modified during the run.

# Consumables research: scrolls and wands of real spells (pf2e 8.5.0 vs master)

Date: 2026-10-26. Read-only research. No file in /home/jtf/orca/simplyPF2e was modified.

## 0. Header

- **Refs.** `pf2e-8.5.0` (tag; ref object sha `3601a90ce232134c590d9641df9b62a7254aee6d`, from `https://api.github.com/repos/foundryvtt/pf2e/git/refs/tags/pf2e-8.5.0`). `master` (head sha at fetch `4cbdaa37d6c33e9519561bae2c59a23e0288cbce`, from `https://api.github.com/repos/foundryvtt/pf2e/git/refs/heads/master`).
- **Quote URL form.** `https://raw.githubusercontent.com/foundryvtt/pf2e/<ref>/<path>` where `<ref>` is `pf2e-8.5.0` or `master`. Every quote below was taken from a file fetched from that raw URL. Local copies are under `/tmp/claude-1000/-home-jtf-orca-simplyPF2e/d7473af0-56ab-435b-a6da-cd6f3a4eed11/scratchpad/consumables-research/upstream/` (`8.5.0/`, `master/`, `raw-packs/8.5.0/`, `raw-packs/master/`).
- **Other URLs fetched.**
  - `https://api.github.com/repos/foundryvtt/pf2e/git/trees/pf2e-8.5.0?recursive=1` and `.../git/trees/master?recursive=1` (path listings only).
  - `https://api.github.com/search/code?q=createConsumableFromSpell+repo:foundryvtt/pf2e` returned 401 (unauthenticated code search is unavailable).
  - `https://codeload.github.com/foundryvtt/pf2e/tar.gz/refs/tags/pf2e-8.5.0` and `.../tar.gz/refs/heads/master`. Used only to grep for usages (for example, "who calls createConsumableFromSpell" and "is it on game.pf2e"). No quote comes from the tarball; each quoted file was re-fetched from raw.
- **Path note.** `static/system.json` does not exist at `pf2e-8.5.0` (`https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/static/system.json` returned 404). The 8.5.0 manifest is the root file `system.pf2e.json`. Master has `static/system.json`.
- **Pack path note.** The published pack ids are `pf2e.equipment-srd` and `pf2e.spells-srd` (from the manifests). The source directories in the repo are `packs/pf2e/equipment/` and `packs/pf2e/spells/` at 8.5.0 and `packs/equipment/` and `packs/spells/` at master. The `_id` in each template file equals the UUID the source code points at, which is how the mapping was checked.
- **Project context.** PLAYBOOK §6 (Live QA discipline) says the live test Foundry runs PF2e 8.5.0 (`PLAYBOOK.md` line 178: "Foundry 14.365 / PF2e 8.5.0"). This report therefore treats 8.5.0 as the target and master as forward-looking.

## 1. Bottom line

1. **The native function is not reachable from a module.** `createConsumableFromSpell` is an internal ES export of `spell-consumables.ts`. It is not on `game.pf2e`, not in the system bundle's entry exports, and not in the `game.pf2e` typings. The only runtime seams are UI flows (an actor-sheet drop that opens a dialog). On 8.5.0, `CONFIG.PF2E.spellcastingItems` is readable data that holds the template UUIDs and name templates. Master has no such config.
2. **Price and level are not computed from the spell.** They come from the rank-specific blank template item that the function clones. The template table was verified from raw files on both refs. One value differs: the 5th-rank wand template costs 1400 gp at 8.5.0 and 1500 gp on master.
3. **The native embedded spell** gets a fresh `_id`, `location.value: null`, and `location.heightenedLevel = rank`. Its traits are the union of template and spell traits, its rarity is the spell's rarity, and its name comes from a localized template.
4. **The module's `buildScrollItem`** (builder.mjs lines 734-749) already clones the same kind of template and embeds the spell. Price, level, usage, uses, and category match the native result because they come from the same template. It diverges in: template lookup (by name, across the GM's configured packs, not pinned), rarity (kept at common), traits (only traditions are added), `_id` (deleted from the embedded spell), description (no spell reference), identification (no mystified state), name (hard-coded English), and wands (not supported at all).

## 2. Q1 Native path

### 2.1 pf2e-8.5.0: the function and its helpers

Source: `https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/module/item/consumable/spell-consumables.ts` lines 1-82 (imports trimmed to the used names; quote is the full function). Lines 11-20 (helpers) and 106-111 (exports) follow.

```ts
type SpellConsumableItemType = keyof ConfigPF2E["PF2E"]["spellcastingItems"];            // line 11

function isSpellConsumableUUID(itemId: string): boolean {                                   // lines 13-15
    return Object.values(CONFIG.PF2E.spellcastingItems).some((c) => Object.values(c.compendiumUuids).includes(itemId));
}

/** Spell consumable categories available for this kind of spell in the current system. */  // lines 17-20
function spellConsumableCategoriesFor(spell: { isCantrip: boolean }): Partial<typeof CONFIG.PF2E.spellcastingItems> {
    return R.pickBy(CONFIG.PF2E.spellcastingItems, (c) => !!c?.cantripsOnly === spell.isCantrip);
}

async function createConsumableFromSpell(                                                   // lines 22-33
    spell: SpellPF2e,
    {
        type,
        rank = spell.baseRank,
        mystified = false,
    }: {
        type: SpellConsumableItemType;
        rank?: OneToTen;
        mystified?: boolean;
    },
): Promise<ConsumableSource> {
    const data = objectHasKey(CONFIG.PF2E.spellcastingItems, type) ? CONFIG.PF2E.spellcastingItems[type] : null;   // 34
    const uuid = data?.compendiumUuids[rank] ?? null;                                                               // 35
    const consumable = uuid ? await fromUuid<ItemPF2e>(uuid) : null;                                                // 36
    if (!consumable?.isOfType("consumable")) {                                                                       // 37
        throw ErrorPF2e("Failed to retrieve consumable item");                                                       // 38
    }

    const consumableSource = { ...consumable.toObject(), _id: null }; // Clear _id                                  // 41

    const traits = consumableSource.system.traits;                                                                   // 43
    traits.value = R.unique([...traits.value, ...spell.system.traits.value]);                                        // 44
    traits.rarity = spell.rarity;                                                                                    // 45
    if (traits.value.includes("magical") && traits.value.some((t) => setHasElement(MAGIC_TRADITIONS, t))) {          // 46
        traits.value.splice(traits.value.indexOf("magical"), 1);                                                     // 47
    }
    traits.value.sort();                                                                                             // 49

    consumableSource.name = data?.nameTemplate                                                                       // 51
        ? _loc(data.nameTemplate, { name: spell.name, level: rank })
        : `${type} of ${spell.name} (Rank ${rank})`;                                                                 // 53
    const description = consumableSource.system.description.value;                                                  // 54

    consumableSource.system.description.value = (() => {                                                             // 56
        const paragraphElement = document.createElement("p");
        paragraphElement.append(spell.sourceId ? `@UUID[${spell.sourceId}]{${spell.name}}` : spell.description);
        const containerElement = document.createElement("div");
        const hrElement = document.createElement("hr");
        containerElement.append(paragraphElement, hrElement);
        hrElement.insertAdjacentHTML("afterend", description);
        return containerElement.innerHTML;
    })();                                                                                                            // 66

    // Cantrip-only categories (e.g. cantrip deck) aren't single-spell consumables — skip embedding.                 // 68
    if (!data?.cantripsOnly) {                                                                                       // 69
        consumableSource.system.spell = fu.mergeObject(                                                              // 70
            spell._source,
            { _id: fu.randomID(), system: { location: { value: null, heightenedLevel: rank } } },                    // 72
            { inplace: false },
        );
    }                                                                                                                // 75

    if (mystified) {                                                                                                 // 77
        consumableSource.system.identification.status = "unidentified";                                            // 78
    }

    return consumableSource;                                                                                         // 81
}

export {                                                                                                             // 106-111
    calculateTrickMagicItemCheckDC,
    createConsumableFromSpell,
    isSpellConsumableUUID,
    spellConsumableCategoriesFor,
};
```

Notes on this function:
- It takes a spell **document** (`SpellPF2e`), not an id. It returns a `ConsumableSource` (plain data). It does **not** create or write any document.
- `rank` defaults to `spell.baseRank`. There is no range or base-rank check inside the function (see Q2).
- No Rule Element is created or copied. Mechanics come only from the template and the embedded spell.

### 2.2 pf2e-8.5.0: the template table the function reads

Source: `https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/scripts/config/spell-consumables.ts` lines 13-16, 31-80 (trimmed to the pf2e block).

```ts
type Pf2eSpellConsumables = {                       // lines 13-17
    scroll: SpellConsumableCategory;
    wand: SpellConsumableCategory;
    cantripDeck5: SpellConsumableCategory;
};
...
    pf2e: {                                         // line 31
        scroll: {                                   // lines 32-47
            name: "PF2E.Item.Consumable.Category.scroll",
            nameTemplate: "PF2E.Item.Physical.FromSpell.Scroll",
            compendiumUuids: {
                1: "Compendium.pf2e.equipment-srd.Item.RjuupS9xyXDLgyIr",
                2: "Compendium.pf2e.equipment-srd.Item.Y7UD64foDbDMV9sx",
                ... (3-9 as listed in the file)
                10: "Compendium.pf2e.equipment-srd.Item.o1XIHJ4MJyroAHfF",
            },
        },
        wand: {                                     // lines 48-63
            name: "PF2E.Item.Consumable.Category.wand",
            nameTemplate: "PF2E.Item.Physical.FromSpell.Wand",
            compendiumUuids: {
                1: "Compendium.pf2e.equipment-srd.Item.UJWiN0K3jqVjxvKk",
                ... (2-9 as listed in the file)
                10: null,                           // line 61
            },
        },
        cantripDeck5: {                             // lines 64-80
            name: "PF2E.SpellcastingItemCreator.CantripDeck5",
            nameTemplate: "PF2E.Item.Physical.FromSpell.CantripDeck5",
            compendiumUuids: {
                1: "Compendium.pf2e.equipment-srd.Item.tLa4bewBhyqzi6Ow",
                2: null, ... 10: null,
            },
            cantripsOnly: true,                     // line 79
        },
    },
```

Wiring into the live config: `https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/scripts/config/index.ts` line 836: `spellcastingItems: SPELL_CONSUMABLES_BY_SYSTEM[SYSTEM_ID],`. And `https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/scripts/hooks/init.ts` line 33: `CONFIG.PF2E = PF2ECONFIG;`. So at runtime `CONFIG.PF2E.spellcastingItems` is a plain object a module can read.

### 2.3 master: the function and its helpers (for comparison)

Source: `https://raw.githubusercontent.com/foundryvtt/pf2e/master/src/module/item/consumable/spell-consumables.ts`. The config table is gone. IDs are hard-coded in this file.

```ts
const CANTRIP_DECK_ID = "tLa4bewBhyqzi6Ow";                       // line 10
const scrollCompendiumIds: Record<number, string | undefined> = {  // lines 12-23
    1: "RjuupS9xyXDLgyIr", 2: "Y7UD64foDbDMV9sx", 3: "ZmefGBXGJF3CFDbn", 4: "QSQZJ5BC3DeHv153",
    5: "tjLvRWklAylFhBHQ", 6: "4sGIy77COooxhQuC", 7: "fomEZZ4MxVVK3uVu", 8: "iPki3yuoucnj7bIt",
    9: "cFHomF3tty8Wi1e5", 10: "o1XIHJ4MJyroAHfF",
};
type SpellConsumableItemType = "cantripDeck5" | "scroll" | "wand";  // line 25
const SPELL_CONSUMABLE_NAME_TEMPLATES = {                          // lines 26-30
    cantripDeck5: "PF2E.Item.Physical.FromSpell.CantripDeck5",
    scroll: "PF2E.Item.Physical.FromSpell.Scroll",
    wand: "PF2E.Item.Physical.FromSpell.Wand",
};
const wandCompendiumIds: Record<number, string | undefined> = {    // lines 32-42 (keys 1-9 only; no 10)
    1: "UJWiN0K3jqVjxvKk", 2: "vJZ49cgi8szuQXAD", 3: "wrDmWkGxmwzYtfiA", 4: "Sn7v9SsbEDMUIwrO",
    5: "5BF7zMnrPYzyigCs", 6: "kiXh4SUWKr166ZeM", 7: "nmXPj9zuMRQBNT60", 8: "Qs8RgNH6thRPv2jt",
    9: "Fgv722039TVM5JTc",
};

function getIdForSpellConsumable(type: SpellConsumableItemType, heightenedLevel: number): string | null {  // lines 44-53
    switch (type) {
        case "cantripDeck5":
            return CANTRIP_DECK_ID;
        case "scroll":
            return scrollCompendiumIds[heightenedLevel] ?? null;
        default:
            return wandCompendiumIds[heightenedLevel] ?? null;
    }
}

function getNameForSpellConsumable(type: SpellConsumableItemType, spellName: string, heightenedLevel: number): string {  // lines 55-58
    const templateId = SPELL_CONSUMABLE_NAME_TEMPLATES[type] || `${type} of {name} (Level {level})`;
    return game.i18n.format(templateId, { name: spellName, level: heightenedLevel });
}

function isSpellConsumable(itemId: string): boolean {              // lines 60-66
    return (
        itemId === CANTRIP_DECK_ID ||
        Object.values(scrollCompendiumIds).includes(itemId) ||
        Object.values(wandCompendiumIds).includes(itemId)
    );
}

async function createConsumableFromSpell(                          // lines 68-82 (signature)
    spell: SpellPF2e,
    {
        type,
        heightenedLevel = spell.baseRank,
        mystified = false,
    }: {
        type: SpellConsumableItemType;
        heightenedLevel?: number;
        mystified?: boolean;
    },
): Promise<ConsumableSource> {
    const pack = game.packs.find((p) => p.collection === "pf2e.equipment-srd");          // line 80
    const itemId = getIdForSpellConsumable(type, heightenedLevel);                        // line 81
    const consumable = await pack?.getDocument(itemId ?? "");                             // line 82
    if (!(consumable instanceof ConsumablePF2e)) {                                        // line 83
        throw ErrorPF2e("Failed to retrieve consumable item");
    }
    const consumableSource = { ...consumable.toObject(), _id: null }; // Clear _id
    const traits = consumableSource.system.traits;
    traits.value = R.unique([...traits.value, ...spell.system.traits.value]);
    traits.rarity = spell.rarity;                                                         // line 91
    if (traits.value.includes("magical") && traits.value.some((t) => setHasElement(MAGIC_TRADITIONS, t))) {
        traits.value.splice(traits.value.indexOf("magical"), 1);
    }
    traits.value.sort();
    consumableSource.name = getNameForSpellConsumable(type, spell.name, heightenedLevel); // line 97
    /* description IIFE: same shape as 8.5.0 lines 56-66 */
    // Cantrip deck casts at level 1                                                     // line 112
    if (type !== "cantripDeck5") {                                                        // line 113
        consumableSource.system.spell = fu.mergeObject(                                   // line 114
            spell._source,
            { _id: fu.randomID(), system: { location: { value: null, heightenedLevel } } }, // line 116
            { inplace: false },
        );
    }
    if (mystified) {
        consumableSource.system.identification.status = "unidentified";
    }
    return consumableSource;
}
export { calculateTrickMagicItemCheckDC, createConsumableFromSpell, isSpellConsumable };  // line 150
```

Differences that matter, master vs 8.5.0:
- Parameter renamed `rank` to `heightenedLevel`.
- The pack is fixed by collection name (`pf2e.equipment-srd`), and template IDs are hard-coded. 8.5.0 resolves a UUID from config.
- `getIdForSpellConsumable`'s `default` branch returns **the wand table** for any type it does not recognise. Only the TypeScript union stops a bad string. At runtime a stray type silently yields a wand template (or null).
- `spell-gem` no longer exists in the category set (see Q3).

### 2.4 Accepted `type` values

- pf2e-8.5.0: the config keys are `scroll`, `wand`, `cantripDeck5` (`src/scripts/config/spell-consumables.ts` lines 13-17 and 31-80). `spell-gem` exists only under the `sf2e` key (lines 18-20 and 82-98), so it is not accepted by the pf2e build. Unknown keys fail at `objectHasKey` (line 34) and then at line 38 (`Failed to retrieve consumable item`).
- master: `"cantripDeck5" | "scroll" | "wand"` (`master/.../spell-consumables.ts` line 25). No `spell-gem`.
- Note: the function does **not** check that `type` matches the spell (cantrip vs non-cantrip). That gate is in the UI only (see Q2).

### 2.5 Where the native function is called (pf2e-8.5.0; master equivalents in brackets)

- `src/module/item/base/document.ts` line 396: refreshes an existing spell consumable from its spell source (`createConsumableFromSpell(refreshedSpell, { type: currentSource.system.category, rank: ... heightenedLevel })`). [master line 395 same.]
- `src/module/actor/sheet/base.ts` lines 1203-1209: drop of a spell on an actor sheet: `if (item.isRitual) ...`, `if (Object.keys(spellConsumableCategoriesFor(item)).length === 0) return [];`, `new SpellcastingItemCreator({ actor, spell: item, mystified }).render({ force: true });`. [master lines 1139-1147 use `CastingItemCreateDialog`, and its callback calls `createConsumableFromSpell` and then `this._onDropItemCreate(createdItem)`.]
- `src/module/actor/character/crafting/helpers.ts` line 147 (8.5.0) and line 145 (master): crafting a spell consumable from a spell the actor knows.
- `src/module/item/consumable/apps/spellcasting-item-creator/app.ts` lines 73-78 (8.5.0 only): `const item = await createConsumableFromSpell(this.#spell, { type, rank, mystified: ... }); this.#actor.inventory.add(item, { stack: true });`. This writes into an **actor**, not into the world Items directory.

## 3. Reachability verdict

**Verdict: not reachable through any supported module API on either ref.**

Evidence:
1. Not on `game.pf2e` (8.5.0). The `initSafe` object in `https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/scripts/set-game-pf2e.ts` lines 77-108 lists `Check`, `CheckModifier`, `Coins`, `ConditionManager`, `Dice`, `ElementalBlast`, `Modifier`, `Predicate`, `RuleElement`, `StatusEffects`, `TextEditor`, `actions`, `effectPanel`, `effectTracker`, `gm`, `rollActionMacro`, `rollItemMacro`, `system`, `variantRules`. None of them is a consumable helper. Line 109: `game.pf2e = fu.mergeObject(game.pf2e ?? {}, initSafe);`. The `game.pf2e` typing in `https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/global.ts` (around lines 162-175) has no consumable or spell-consumable member.
2. Not on `game.pf2e` (master). `https://raw.githubusercontent.com/foundryvtt/pf2e/master/src/scripts/set-game-pf2e.ts` lines 73-106 have the same shape. No consumable entry.
3. Not in the bundle's exports. `https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/pf2e.ts` lines 1-8 export only `AutomaticBonusProgression`, `ElementalBlast`, and `RuleElement`. `https://raw.githubusercontent.com/foundryvtt/pf2e/master/src/pf2e.ts` exports nothing. The system manifest loads `pf2e.mjs` as its ES module (`system.pf2e.json` `"esmodules": ["vendor.mjs","pf2e.mjs"]`). A module therefore cannot import the function by name. Reaching bundle-internal code is unsupported (UNVERIFIED that any such hack works).
4. Searched `src/scripts/` and `src/module/apps/` at 8.5.0 for the function and for `spellConsumableCategoriesFor`/`SPELL_CONSUMABLES_BY_SYSTEM`. The only hits are the config file (`src/scripts/config/spell-consumables.ts`), `src/scripts/config/index.ts` line 836, and the sheet, creator, and document callers listed in §2.5. No `src/module/apps/` file references it. The tarball grep confirms there is no other export path.
5. The only UI path is the actor-sheet drop. 8.5.0: `SpellcastingItemCreator` (`app.ts` lines 61-79) writes to an actor inventory (`this.#actor.inventory.add(item, { stack: true })`, line 78). Master: `CastingItemCreateDialog` (`master/src/module/actor/sheet/popups/casting-item-create-dialog.ts`, a `FormApplication`), constructed in `master/src/module/actor/sheet/base.ts` lines 1139-1147. A module could in principle trigger a synthetic drop, but that opens a user dialog and writes to an actor. It is not a programmatic API (UNVERIFIED that a synthetic drop works).

**What a module would have to replicate instead** (this is what the native function does, in data form):
- The template item IDs: 10 scroll IDs (`RjuupS9xyXDLgyIr` ... `o1XIHJ4MJyroAHfF`), 9 wand IDs (`UJWiN0K3jqVjxvKk` ... `Fgv722039TVM5JTc`), and the cantrip deck ID `tLa4bewBhyqzi6Ow`. These are identical on both refs (8.5.0 config lines 35-76; master lines 10-42). The pack is `pf2e.equipment-srd`.
- The name template strings (from `static/lang/en.json`, §4 below), the trait merge rule (8.5.0 lines 43-49), the description merge (8.5.0 lines 56-66), the embedded-spell shape (8.5.0 lines 69-75), and the identification rule (8.5.0 lines 77-79).
- The price and level are **not** replicated. They live on the template item and move with it (see Q2).

**Invariant check.** PLAYBOOK §3 invariant 2 (`PLAYBOOK.md` line 54): "Clone a real Rule Element from a published item; never hand-author one." PLAYBOOK §1 (line 38): "The module never invents content." Cloning whole published consumable documents and a real spell document creates no hand-written Rule Element. The template `system.rules` is `[]` on both refs (quote in Q5). A module-side copy of the name and trait rules is data shaping, not content invention, but it is module code that must be kept in sync with the system (PLAYBOOK §3 invariant 3).

## 4. Q2 Rank rules, price arrays, level derivation

### 4.1 Validation of rank (8.5.0)

- **Default and lookup.** `rank = spell.baseRank` (spell-consumables.ts line 26). `uuid = data?.compendiumUuids[rank] ?? null` (line 35). A missing key (rank 0, rank 11, or a null entry) makes `consumable` null, and line 38 throws `Failed to retrieve consumable item`.
- **Rank 10 wands.** `config/spell-consumables.ts` line 61: `10: null,` in the wand table. So rank 10 wand is refused by the function.
- **Base-rank floor.** Not in the function. The UI enforces it: `src/module/item/consumable/apps/spellcasting-item-creator/app.svelte` lines 20-25: `const ranks = $derived(Object.keys(compendiumUuids ?? {}).map((k) => Number(k)).filter((r) => r >= minimumRank && !!compendiumUuids?.[r]),);` (the `minimumRank` is `spell.baseRank` from `app.ts` line 55). A programmatic caller can pass a lower rank and the function will accept it (UNVERIFIED for runtime, but the code shows no check).
- **Cantrips.** Not in the function. The UI gate: `src/module/actor/sheet/base.ts` line 1208 `if (Object.keys(spellConsumableCategoriesFor(item)).length === 0) return [];` and `spellConsumableCategoriesFor` (spell-consumables.ts lines 18-20) returns only `cantripsOnly` categories for cantrips and non-cantrip categories otherwise. The embed is also skipped for `cantripsOnly` (spell-consumables.ts line 69). A programmatic caller can pass a cantrip with type `scroll`, and the function will embed it (UNVERIFIED at runtime; the code shows no check).
- **Rituals.** Not in the function. The sheet routes rituals elsewhere: `src/module/actor/sheet/base.ts` lines 1203-1204 `if (item.isOfType("spell") && itemSource.type === "spell") { if (item.isRitual) { return this._onDropItemCreate(item.clone().toObject());`.
- **Heightening.** Only `location.heightenedLevel = rank` is written (spell-consumables.ts line 72). No check against the spell's own heightening data.
- **Master.** The dialog offers ranks `minimumRank` to 10 (`master/.../casting-item-create-dialog.ts` lines 66-71: `const minimumRank = this.spell.baseRank; const ranks = Array.from(Array(11 - minimumRank).keys()).map((index) => minimumRank + index);`). For a cantrip the dialog offers only `cantripDeck5` (line 72). Wand rank 10 is refused by the dialog submit (line 86: `if (this.formDataCache.itemType === "wand" && this.formDataCache.level === 10) { ui.notifications.warn(...)`). The function itself has no wand 10 entry, so `getIdForSpellConsumable` returns null and the function throws (spell-consumables.ts lines 50-51 and 81-83).

### 4.2 Price arrays (per rank, from raw template files)

Each row is one raw template file. The `system.price.value` of each is quoted in full below the table.

| Rank | Scroll template (8.5.0 = master) | Scroll level | Wand template (8.5.0 / master) | Wand level |
| --- | --- | --- | --- | --- |
| 1 | 4 gp | 1 | 60 gp | 3 |
| 2 | 12 gp | 3 | 160 gp | 5 |
| 3 | 30 gp | 5 | 360 gp | 7 |
| 4 | 70 gp | 7 | 700 gp | 9 |
| 5 | 150 gp | 9 | **1400 gp (8.5.0) / 1500 gp (master)** | 11 |
| 6 | 300 gp | 11 | 3000 gp | 13 |
| 7 | 600 gp | 13 | 6500 gp | 15 |
| 8 | 1300 gp | 15 | 15000 gp | 17 |
| 9 | 3000 gp | 17 | 40000 gp | 19 |
| 10 | 8000 gp | 19 | none (null in config) | n/a |

Cantrip deck (5-pack) template: 5 gp, level 1, `system.category` `other` (not `cantripDeck5`), `uses` `{"autoDestroy":true,"max":5,"value":5}`, identical on both refs.

Quotes (URL = raw file path under each ref):
- 8.5.0: `https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/equipment/scroll-of-1st-rank-spell.json`: `"level": {"value": 1}` and `"price": {"value": {"gp": 4}}` (file lines have these exact keys; the rest of the scroll template is quoted in Q5).
- 8.5.0 wand 5th: `https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/equipment/magic-wand-5th-rank-spell.json` line 30-31 region: `"gp": 1400`.
- master wand 5th: `https://raw.githubusercontent.com/foundryvtt/pf2e/master/packs/equipment/magic-wand-5th-rank-spell.json` line 30: `"gp": 1500`.
- All other rows: the same raw path pattern for `scroll-of-Nth-rank-spell.json` and `magic-wand-Nth-rank-spell.json`, identical values on both refs (verified by jq over the raw copies in `raw-packs/`).

The template `_id` values are quoted in §2.2 and §2.3. The 8.5.0 names are `Scroll of 1st-rank Spell` ... `Scroll of 10th-rank Spell`, `Magic Wand (1st-Rank Spell)` ... `Magic Wand (9th-Rank Spell)`, and `Cantrip Deck (5-pack)`.

### 4.3 Level derivation

- The function itself does not set level or price. Both come from the cloned template (`consumable.toObject()` on line 41).
- At data preparation, PF2e recomputes level, rarity, and price for every physical item. 8.5.0 `https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/module/item/physical/document.ts` lines 352-358:
  ```ts
  if (this.isMagical || this.system.traits.value.includes("tech")) {
      this.system.price.sizeSensitive = false;
  }
  const { level, rarity, price } = computeLevelRarityPrice(this);
  this.system.level.value = level;
  this.system.traits.rarity = rarity;
  this.system.price.value = price;
  ```
- `computeLevelRarityPrice` (8.5.0 `src/module/item/physical/helpers.ts` lines 51-75). For a consumable with no runes, material, or grade, `level` is `item.level` (line 61 includes `item.level` in the max) and `price` is `computePrice(item)`, which returns `item.price.value` when there are no material or rune values (line 38: `const basePrice = materialValue > 0 || runeValue > 0 ? new Coins() : item.price.value;`). Rarity is the base rarity (`const baseRarity = item.rarity;`, line 68), so the spell rarity written at line 45 of the native function survives. Master (`master/src/module/item/physical/helpers.ts` lines 49-76) has the same shape but without the grade term.
- `isMagical` (8.5.0 `physical/document.ts` lines 145-147): `this.system.traits.value.some((t) => t === "magical" || setHasElement(MAGIC_TRADITIONS, t))`. Level does not depend on it for consumables, because the non-magical branch returns `item.level` as well.
- Result: a scroll or wand's level and price are whatever its template says. The spell's own level is never read for them. The heightened rank changes only which template is cloned.

## 5. Q3 Consumable schema

### 5.1 `system` data type (8.5.0 and master)

8.5.0 `https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/module/item/consumable/data.ts` lines 13-27:
```ts
interface ConsumableTraits extends PhysicalItemTraits<ConsumableTrait> {       // 13-15
    otherTags: OtherConsumableTag[];
}
interface ConsumableSystemSource extends PhysicalSystemSource {                // 17
    apex?: never;
    traits: ConsumableTraits;                                                   // 19
    category: ConsumableCategory;                                               // 20
    uses: ConsumableUses;                                                       // 21
    /** A formula for a healing or damage roll */
    damage: ConsumableDamageHealing | null;                                     // 23
    spell: SpellSource | null;                                                  // 24
    usage: { value: string };                                                   // 25
    subitems?: never;                                                           // 26
}
```
8.5.0 lines 29-34: `type ConsumableUses = { value: number; max: number; /** Whether to delete the consumable upon use if it has no remaining uses and a quantity of 1 */ autoDestroy: boolean; };`

Master `https://raw.githubusercontent.com/foundryvtt/pf2e/master/src/module/item/consumable/data.ts` lines 17-28 are the same plus line 26: `stackGroup: AmmoStackGroup | null;` and line 47: `stackGroup: AmmoStackGroup | null;` in `ConsumableSystemData`. 8.5.0 has no `stackGroup`.

Physical base (`https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/module/item/physical/data.ts` lines 19-27): `level: { value: number };` (line 20), `traits: PhysicalItemTraits<PhysicalItemTrait>;` (21), `quantity: number;` (22), `price: PartialPrice;` (27). Master has the same at lines 19-29.

### 5.2 `category` values

8.5.0 `https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/module/item/consumable/values.ts` lines 1-18:
```ts
const CONSUMABLE_CATEGORIES = new Set([
    "catalyst", "drug", "elixir", "fulu", "gadget", "mutagen", "oil", "other",
    "poison", "potion", "scroll", "spell-gem", "snare", "talisman", "toolkit", "wand",
] as const);
```
Master `.../master/src/module/item/consumable/values.ts` lines 1-18: `"ammo"` is added and `"spell-gem"` is **removed**. Master also adds `AMMO_STACK_GROUPS` (lines 32-41). `types.ts` (both refs) defines `ConsumableCategory = SetElement<typeof CONSUMABLE_CATEGORIES>` and `ConsumableTrait = keyof typeof CONFIG.PF2E.consumableTraits`. Master adds `AmmoStackGroup`.

### 5.3 `system.uses`

- `ConsumablePF2e.prepareBaseData` (8.5.0 `src/module/item/consumable/document.ts` lines 67-71): `this._embeddedSpell = undefined; this.system.uses.max ||= 1;`.
- Template defaults (8.5.0 `static/template.json` via `https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/static/template.json`, `Item.consumable`): `{"templates":["common","physical"],"category":"other","uses":{"value":1,"max":1,"autoDestroy":true},"damage":null,"usage":{"value":"held-in-one-hand"},"spell":null,"traits":{"value":["consumable"]}}`. Master's copy of the same block adds `"stackGroup": null` (`https://raw.githubusercontent.com/foundryvtt/pf2e/master/static/template.json`).
- Consume behaviour (8.5.0 `consumable/document.ts` lines 134-145): for a scroll, wand, or spell-gem with `system.spell`, `consume()` calls `castEmbeddedSpell()` when the actor can cast it. The uses block (lines 170-184) still runs afterwards: `if (this.system.uses.autoDestroy && uses.value <= thisMany)` deletes the item or drops its quantity; otherwise `uses.value` is reduced.

### 5.4 `system.spell`

`spell: SpellSource | null` (8.5.0 `consumable/data.ts` line 24). The embedded spell is a full spell source. `ConsumablePF2e.embeddedSpell` (8.5.0 `consumable/document.ts` lines 39-65) merges `system.spell` with `"system.location.value": null` and builds an `ItemProxyPF2e` from it.

### 5.5 `system.traits`, `system.level`, `system.price`

- `system.traits`: `ConsumableTraits` (line 13-15) = `PhysicalItemTraits<ConsumableTrait>` plus `otherTags`. Template default `traits.value` is `["consumable"]` (template.json above). Per-category traits come from the template (`["consumable","magical","scroll"]` for scrolls, `["magical","wand"]` for wands).
- `system.level.value`: from the template, then recomputed at prep (§4.3).
- `system.price.value`: `{gp: N}` from the template, then recomputed at prep (§4.3). `PhysicalSystemSource.price` is `PartialPrice` (physical/data.ts line 27).

### 5.6 8.5.0 vs master differences in the consumable schema

- Master adds `stackGroup` to the consumable data and template (ammo feature).
- Master adds `"ammo"` to categories and removes `"spell-gem"` (sf2e-only category in 8.5.0).
- Master `computeLevelRarityPrice` has no grade term (§4.3).

## 6. Q4 Spell index fields

### 6.1 System manifest entries (no index configuration)

- 8.5.0 `https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/system.pf2e.json`, `packs` entry:
  `{"name":"spells-srd","label":"Spells","path":"packs/spells","type":"Item","system":"pf2e","ownership":{"PLAYER":"OBSERVER","ASSISTANT":"OWNER"},"flags":{}}`
- Master `https://raw.githubusercontent.com/foundryvtt/pf2e/master/static/system.json`, same entry with `"banner":"systems/pf2e/assets/compendium-banner/blue.webp"` (8.5.0 banner is green).
- The equipment entry: `{"name":"equipment-srd","label":"Equipment","path":"packs/equipment","type":"Item", ... "flags":{}}` on both refs.
- Neither manifest has an index-fields or filter configuration. `flags` is `{}`. Index fields are therefore chosen by whoever calls `pack.getIndex({ fields })`.

### 6.2 What pf2e itself indexes for spells

8.5.0 `https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/module/apps/compendium-browser/tabs/spell.ts` lines 31-39:
```ts
const indexFields = [
    "img",
    "system.level.value",
    "system.time",
    "system.traits",
    "system.publication",
    "system.ritual",
    "system.source",
];
```
Master `https://raw.githubusercontent.com/foundryvtt/pf2e/master/src/module/apps/compendium-browser/tabs/spell.ts` lines 43-51: the same list. `system.traits` covers `value` (traits), `traditions`, and `rarity`, because the spell's traits object is `SpellTraits` (below). pf2e's browser also reads `system.traits.value` for "cantrip" and "focus" (lines 62-65).

### 6.3 Spell data fields used for filtering

8.5.0 `https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/module/item/spell/data.ts`:
- `traits: SpellTraits;` (line 11) and `level: { value: OneToTen };` (line 12).
- `interface SpellTraits extends ItemTraits<SpellTrait> { traditions: MagicTradition[]; }` (lines 50-52).
- `location` with `heightenedLevel?: OneToTen;` (line 40).

8.5.0 `.../spell/document.ts`:
- `get baseRank(): OneToTen { return this.system.level.value; }` (lines 96-98).
- `get rarity(): Rarity { return this.system.traits.rarity; }` (lines 134-136).
- `get isCantrip(): boolean { return this.system.traits.value.includes("cantrip"); }` (lines 176-178).
- `get isRitual(): boolean { return !!this.system.ritual; }` (lines 185-187).
Master has the same getters at `.../master/src/module/item/spell/document.ts` lines 93, 131, 173, 182.

### 6.4 What this module indexes (`scripts/compendium.mjs`)

`getIndex(packId)`, lines 165-177 (used for spells and for most candidate lists):
```js
const index = await pack.getIndex({
  fields: [
    "name", "type", "system.slug", "system.level.value",
    "system.traits.value", "system.traits.traditions", "system.ritual",
    "system.category", "system.stackGroup", "system.spell", "system.traits.rarity", "system.traits.otherTags", "system.prerequisites.value"
  ]
});
```
- Rank: `system.level.value` (line 171).
- Traits: `system.traits.value` (line 172).
- Traditions: `system.traits.traditions` (line 172).
- Rarity: `system.traits.rarity` (line 173).
- Rituals: `system.ritual` (line 172).

`getEquipmentIndex(packId)`, lines 188-196 (used for prices and usage): `fields: ["name", "type", "system.level.value", "system.price.value", "system.usage.value", "system.traits.value", "system.category", "system.specific"]`. This is the index that exposes a consumable's `category` and price for filtering.

Module filters that already exist for spells: `getScrollSpellCandidates` (compendium.mjs ~lines 558-575) requires `entry.type === "spell"`, `!entry.system?.ritual`, and no `cantrip` trait, then sorts by rank. `getSpellCandidates` (compendium.mjs ~lines 528-545) requires `traditions.includes(tradition)` for the caster's tradition. Scroll candidates do not filter by tradition (correctly, per the comment at compendium.mjs line 554-556).

### 6.5 Index coverage for this feature

The module's `getIndex` already requests `system.level.value` (line 171), `system.traits.value` and `system.traits.traditions` (line 172), and `system.traits.rarity` (line 173). Rank, traits, traditions, and rarity are therefore filterable with no new index fields. It does not request `system.time`, `system.source`, or `system.publication`, which pf2e's own browser requests (§6.2); this feature does not need them. `getIndex` also requests `system.category` and `system.spell` for equipment entries (line 173), which is why `getEquipmentCandidates` can skip blank scroll templates (compendium.mjs lines 639-643).

## 7. Q5 Sample consumables (raw)

### 7.1 Scroll template (blank rank template, 8.5.0; identical on master)

Source: `https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/equipment/scroll-of-1st-rank-spell.json` (`_id` `RjuupS9xyXDLgyIr`). Master: `https://raw.githubusercontent.com/foundryvtt/pf2e/master/packs/equipment/scroll-of-1st-rank-spell.json` (same `_id`; same `system` block).

```json
{
  "_id": "RjuupS9xyXDLgyIr",
  "img": "icons/sundries/scrolls/scroll-symbol-eye-brown.webp",
  "name": "Scroll of 1st-rank Spell",
  "system": {
    "baseItem": null,
    "bulk": { "value": 0.1 },
    "category": "scroll",
    "containerId": null,
    "damage": null,
    "description": { "value": "<p>Casting a Spell from a scroll requires ... </p> ... <p><em>Note: To create a scroll or wand of a specific spell, drag the spell from the compendium ...</em></p>" },
    "hardness": 0,
    "level": { "value": 1 },
    "material": { "grade": null, "type": null },
    "price": { "value": { "gp": 4 } },
    "publication": { "license": "ORC", "remaster": true, "title": "Pathfinder GM Core" },
    "quantity": 1,
    "rules": [],
    "size": "med",
    "traits": { "rarity": "common", "value": ["consumable", "magical", "scroll"] },
    "usage": { "value": "held-in-one-hand" },
    "uses": { "autoDestroy": true, "max": 1, "value": 1 }
  },
  "type": "consumable"
}
```
Note `"spell"` is absent from this template (the key is not present at all in the file). Both refs have zero published scrolls with an embedded spell (counted over `packs/pf2e/equipment` and `packs/equipment`).

### 7.2 Wand template (blank rank template)

Source: `https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/equipment/magic-wand-1st-rank-spell.json` (`_id` `UJWiN0K3jqVjxvKk`). Master: `https://raw.githubusercontent.com/foundryvtt/pf2e/master/packs/equipment/magic-wand-1st-rank-spell.json`.

```json
{
  "_id": "UJWiN0K3jqVjxvKk",
  "img": "systems/pf2e/icons/equipment/wands/magic-wands/magic-wand.webp",
  "name": "Magic Wand (1st-Rank Spell)",
  "system": {
    "category": "wand",
    "level": { "value": 3 },
    "price": { "value": { "gp": 60 } },
    "publication": { "license": "ORC", "remaster": true, "title": "Pathfinder GM Core" },
    "quantity": 1,
    "rules": [],
    "traits": { "rarity": "common", "value": ["magical", "wand"] },
    "usage": { "value": "held-in-one-hand" },
    "uses": { "autoDestroy": false, "max": 1, "value": 1 }
  },
  "type": "consumable"
}
```
(Other keys trimmed; `description` text says "Activate Cast a Spell; Frequency once per day, plus overcharge; Craft Requirements: Supply a casting of the spell at the listed rank".)

### 7.3 A published wand with an embedded spell (8.5.0)

Source: `https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/equipment/wand-of-the-spider-4th-rank-spell.json` (6464 bytes). Trimmed quote of the fields requested:

```json
"name": "Wand of the Spider (4th-Rank Spell)",
"system": {
  "category": "wand",
  "level": { "value": 11 },
  "price": { "value": { "cp": 0, "gp": 1400, "pp": 0, "sp": 0 } },
  "traits": { "rarity": "common", "value": ["magical", "poison", "wand"] },
  "usage": { "value": "held-in-one-hand" },
  "uses": { "autoDestroy": false, "max": 1, "value": 1 },
  "spell": {
    "_id": "szQb3PZpYfwcjXYR",
    "folder": null,
    "name": "Web",
    "type": "spell",
    "_stats": { "compendiumSource": "Compendium.pf2e.spells-srd.Item.9s5tqqXNzcoKamWx" },
    "system": {
      "level": { "value": 2 },
      "location": { "heightenedLevel": 4, "value": null },
      "traits": { "rarity": "common", "traditions": ["arcane", "primal"], "value": ["concentrate", "manipulate"] }
    }
  }
}
```
Points to note: this published wand's `price` (1400 gp) and `level` (11) are not the template values for rank 4 (700 gp, level 9). Published items carry their own numbers. The embedded spell carries `_id`, `folder`, and `_stats.compendiumSource`, which is the shape the native function produces (`spell._source` plus a fresh `_id`, and `location` written with `value: null`).

Master equivalents (for example `wand-of-splintered-sorrows-rank-2.json`, `arboreal-wand-rank-2.json`) also embed spells. The counts are in §3 of the bottom line and in the field map.

## 8. Q6 Module `buildScrollItem` vs the native path

### 8.1 Module code (repo, `scripts/builder.mjs`)

Local file: `/home/jtf/orca/simplyPF2e/scripts/builder.mjs`.

```js
// lines 525-530
/** Recognize scroll loot like "Scroll of Fireball" or "Scroll of Fireball (Rank 3)". */
export function parseScroll(name) {
  const match = /^\s*scroll of\s+(.+?)\s*(?:\(\s*rank\s*(\d+)\s*\))?\s*$/i.exec(String(name ?? ""));
  if (!match) return null;
  return { spellName: match[1], rank: match[2] ? Number(match[2]) : null };
}

// lines 717-725
const RANK_ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];

/** Find the blank "Scroll of Nth-rank Spell" template item for a rank. */
async function findScrollTemplate(rank) {
  const ordinal = RANK_ORDINALS[rank - 1] ?? "1st";
  // Remaster naming first, pre-remaster "level" naming as fallback
  return (await findEntry(getPacksFor("equipment"), `Scroll of ${ordinal}-rank Spell`, (e) => e.type === "consumable"))
    ?? (await findEntry(getPacksFor("equipment"), `Scroll of ${ordinal}-level Spell`, (e) => e.type === "consumable"));
}

// lines 727-749 (the full function; comment block at 727-733)
/**
 * Assemble a scroll consumable the way the PF2e system does on spell drag:
 * clone the "Scroll of Nth-rank Spell" template and embed the real spell.
 * @param {object} spellEntry  index entry of the spell (from resolveLoot)
 * @param {number} rank        rank the scroll casts the spell at
 * @returns {Promise<object|null>} item data, or null when spell/template is missing
 */
async function buildScrollItem(spellEntry, rank) {
  const spellDoc = await getDocument(spellEntry);
  if (!spellDoc) return null;
  const template = await findScrollTemplate(rank);
  const templateDoc = await getDocument(template);
  if (!templateDoc) return null;
  const data = toItemData(templateDoc);
  const spell = spellDoc.toObject();
  delete spell._id;
  spell.system.location = { ...(spell.system.location ?? {}), heightenedLevel: rank };
  data.name = `Scroll of ${spellDoc.name} (Rank ${rank})`;
  data.system.spell = spell;
  const traditions = spellDoc.system?.traits?.traditions ?? [];
  data.system.traits ??= { value: [] };
  data.system.traits.value = [...new Set([...(data.system.traits.value ?? []), ...traditions])];
  return data;
}
```

`toItemData` (compendium.mjs lines 916-924) does `doc.toObject()`, deletes `_id`, `folder`, and `ownership`, and sets `_stats.compendiumSource = doc.uuid` (the template's UUID).

Price source for scrolls in the module: `resolveLoot` lines 580-586 compute `templateGp = priceToGp(templateDoc?.system?.price?.value)` from the same template, and `buildLootItems` lines 1176-1181 build the item through `buildScrollItem`. So the module reads the same price the native path reads, from the same kind of template.

Scroll loot parsing and rank clamp (builder.mjs `resolveLoot` lines 565-589): the spell must be a non-cantrip, non-ritual spell (lines 569-572 and 576-578); `rank = Math.min(Math.max(scroll.rank ?? baseRank, baseRank), 10)` (line 580). The clamp keeps rank at or above base and at or below 10. That is stricter than the native function, which has no clamp.

Name in the module: `` `Scroll of ${spellDoc.name} (Rank ${rank})` `` (builder.mjs line 744). The native name for English is the same string (`static/lang/en.json` `PF2E.Item.Physical.FromSpell.Scroll` = `"Scroll of {name} (Rank {level})"`; the same key is `"Wand": "Wand of {name} (Rank {level})"` and `"CantripDeck5": "Cantrip Deck of {name} (5-pack)"`). Sources: `https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/static/lang/en.json` and `https://raw.githubusercontent.com/foundryvtt/pf2e/master/static/lang/en.json`.

### 8.2 Comparison (8.5.0 native vs module `buildScrollItem`)

| Area | Native 8.5.0 | Module `buildScrollItem` | Verdict |
| --- | --- | --- | --- |
| Template identity | Fixed UUID from config (`pf2e.equipment-srd`, §2.2) | Found by **name** across the GM's configured equipment packs, fuzzy `findEntry` (builder.mjs 720-724; compendium.mjs 254-270 and scoreMatch) | **Differs** (not pinned) |
| Template price | Template `price.value` | Template `price.value` (via `templateDoc`, data cloned) | Match |
| Template level | Template `level.value` | Template `level.value` | Match |
| Template category / usage / uses | Template | Template | Match |
| `type` | `consumable` (template) | `consumable` (template) | Match |
| `img` | Template | Template | Match |
| `system.rules` | `[]` (template) | `[]` (template) | Match |
| `system.publication` | Template ("Pathfinder GM Core") | Template | Match (both cite GM Core, not the spell's book) |
| Name | Localized `nameTemplate` | Hard-coded English | **Differs** (not localized) |
| `system.traits.value` | Union of template and all spell traits, `magical` removed when a tradition is present, sorted | Union of template and spell **traditions** only; `magical` kept | **Differs** |
| `system.traits.rarity` | Spell rarity | Template rarity (`common`) | **Differs** (uncommon/rare spells come out common) |
| `system.description.value` | Spell reference (`@UUID` link or spell text) + `<hr>` + template text | Template text only | **Differs** |
| `system.spell` (source) | `spell._source` (merged) | `spellDoc.toObject()` | Equivalent in intent (UNVERIFIED that `_source` and `toObject()` differ in Foundry core) |
| `system.spell._id` | Fresh random `_id` | **Deleted** (absent) | **Differs** (UNVERIFIED impact; published items do carry `_id`) |
| `system.spell.system.location` | `{ value: null, heightenedLevel: rank }` | Spell's own `location` with `heightenedLevel` set (value usually null; UNVERIFIED for every spell) | Minor difference |
| Rank bounds | None in function (UI floor at base rank; no clamp) | Clamped to [base, 10] | Module stricter (good) |
| Cantrip / ritual exclusion | None in function (UI and sheet gates) | Excluded in `resolveLoot` and candidate filters | Module stricter (good) |
| Wands | Supported (`wand` type, 9 ranks) | **Not supported** (`parseScroll` only; no wand path) | **Gap** |
| Cantrip deck | Supported (`cantripDeck5`) | Not supported | Gap (not needed if out of scope) |
| Identification / mystified | `status = "unidentified"` when requested | Not supported | Gap (out of scope for loot) |
| `_stats.compendiumSource` | Template's `_stats` (native sets `_id: null` on the copy) | Template UUID (set by `toItemData`) | Minor; both point to the template |
| Quantity | Template 1 | Set from loot quantity (`setQuantity`, line 1179) | Module-only; intended |

### 8.3 Summary of Q6

The module's `buildScrollItem` already matches the native **shape** of a scroll: a clone of the blank template with the real spell embedded at the chosen rank, and a price, level, and uses that come from the template. It differs in template resolution, rarity, traits, the embedded spell's `_id`, description, name localization, and in having no wand path. Those differences are the list the new feature has to decide on: align them with the native result, or keep them and document why.

## 9. Field map (created scroll and wand, native 8.5.0 path)

For a **scroll** of a spell `S` at rank `N`, the native function (`createConsumableFromSpell(S, { type: "scroll", rank: N })`) produces this data. Source key: N = native function (8.5.0 spell-consumables.ts); T = cloned template (raw file); M = module constant (none here, except where noted); L = LLM enum (none in the native path); P = prep-time recompute (physical/document.ts 355-358).

| `system` / top-level field | Value for a scroll | Source | Quote reference |
| --- | --- | --- | --- |
| `type` | `consumable` | T | scroll-of-1st-rank-spell.json (§7.1) |
| `name` | `Scroll of {S.name} (Rank {N})` | N (localized template) | spell-consumables.ts 51-53; en.json `PF2E.Item.Physical.FromSpell.Scroll` |
| `img` | template icon `icons/sundries/scrolls/scroll-symbol-eye-brown.webp` (rank 1; others per template) | T | §7.1 |
| `system.category` | `scroll` | T | §7.1; values.ts (`scroll` in set) |
| `system.level.value` | template level (1,3,5,...,19 for ranks 1..10) | T, then P | §4.2; physical/document.ts 355-358 |
| `system.price.value` | template gp (4,12,30,70,150,300,600,1300,3000,8000) | T, then P | §4.2 |
| `system.traits.rarity` | spell's rarity (`S.rarity`) | N (line 45) then P (baseRarity) | spell-consumables.ts 45; physical helpers 68 |
| `system.traits.value` | template traits ∪ spell traits, sorted, `magical` removed if a tradition trait is present | N | spell-consumables.ts 43-49 |
| `system.traits.otherTags` | template (`[]`) | T | template.json `Item.templates.common` |
| `system.usage.value` | `held-in-one-hand` | T | §7.1 |
| `system.uses` | `{ value: 1, max: 1, autoDestroy: true }` | T | §7.1; consumable/document.ts 70 (`max ||= 1`) |
| `system.quantity` | 1 | T (native does not change it) | §7.1 |
| `system.bulk.value` | 0.1 | T | §7.1 |
| `system.damage` | `null` | T | §7.1 |
| `system.rules` | `[]` (no Rule Elements) | T | §7.1 |
| `system.description.value` | `<p>@UUID[S.sourceId]{S.name}</p><hr>` + template text (or spell text if no sourceId) | N | spell-consumables.ts 56-66 |
| `system.spell` | `S._source` with `_id` = new random, `system.location` = `{ value: null, heightenedLevel: N }` | N | spell-consumables.ts 69-75 |
| `system.identification.status` | `unidentified` only when `mystified` | N | spell-consumables.ts 77-79 |
| `system.publication` | `{ license: "ORC", remaster: true, title: "Pathfinder GM Core" }` | T | §7.1 |
| `system.size`, `system.material`, `system.hp`, `system.hardness`, `system.containerId`, `system.baseItem` | template | T | §7.1 |

For a **wand** of spell `S` at rank `N` (`type: "wand"`, template `magic-wand-Nth-rank-spell.json`):
- Same rows, except: `name` uses `PF2E.Item.Physical.FromSpell.Wand` (`Wand of {name} (Rank {level})`); `system.category` is `wand`; `system.uses` is `{ value: 1, max: 1, autoDestroy: false }`; template `img` is `systems/pf2e/icons/equipment/wands/magic-wands/magic-wand.webp`; template `system.traits.value` is `["magical","wand"]`; `system.level.value` and `system.price.value` follow the wand table in §4.2 (level 3, 5, ..., 19; price 60, 160, ..., 40000); rank 10 is refused.
- Cantrip deck (`cantripDeck5`) has no `system.spell` (native lines 69-75 skip it); its name is `Cantrip Deck of {name} (5-pack)`; its category is `other`.

For the **module** (`buildScrollItem`, scroll only), the same table applies except: `name` is hard-coded English (builder.mjs 744); `system.traits.rarity` stays `common`; `system.traits.value` is template ∪ traditions only; `system.description.value` is template text only; `system.spell._id` is absent; `system.identification` is template default; `_stats.compendiumSource` is the template UUID; `system.quantity` is set from the loot quantity.

## 10. Gaps and risks

1. **No supported call path.** The native function cannot be called from a module. A module must clone the templates itself by UUID or ID (the same IDs as §2.2). This is a clone of real documents and does not break PLAYBOOK §3 invariant 2 (no hand-authored Rule Element). It does mean the module owns the name, trait, description, and embed logic, which must be kept in step with pf2e (PLAYBOOK §3 invariant 3).
2. **Native validation lives in the UI.** The function accepts any rank that has a template, any cantrip (with type `scroll`), and rituals. The UI blocks cantrips from scrolls, rituals from creation, and ranks below base. A module that calls its own logic must enforce those rules itself. The module already does this in `resolveLoot` (builder.mjs 565-580) and in `getScrollSpellCandidates` (compendium.mjs 558-575). A new path must keep that.
3. **Price must come from the template, not the existing forge benchmark.** The forge's `priceForLevel()` (item-builder.mjs 140-155) is an empirical median. Its sample set includes every equipment-type item except treasure (item-builder.mjs 96-98 `PRICED_TYPES`, and 103-116 `getPriceSamples`). Blank scroll and wand templates are of type `consumable`, so they are already in the median (UNVERIFIED how much they move it; the code shows they are included). Scrolls and wands must not use `priceForLevel`. Quote for the principle: PLAYBOOK §3 line 67 ("Not writing `system.price`/`system.level` on a runed item is correct (`physical/document.ts` recomputes both via `computeLevelRarityPrice()` every prep)").
4. **8.5.0 vs master price drift.** The 5th-rank wand template is 1400 gp on 8.5.0 and 1500 gp on master (§4.2). The live test world is 8.5.0 (PLAYBOOK §6, line 178), so 8.5.0 is authoritative. Any future pf2e bump changes the table, so the module should not hard-code prices (it does not, today).
5. **Master drift in structure.** On master the config table is gone (no `CONFIG.PF2E.spellcastingItems` hits in `master/src`), the dialog is `CastingItemCreateDialog`, and `getIdForSpellConsumable` silently routes unknown types to the wand table (spell-consumables.ts line 50). A module that reads `CONFIG.PF2E.spellcastingItems` (possible only on 8.5.0) would break on master. A module that hard-codes IDs works on both.
6. **Template lookup by name is fuzzy and not pinned.** `findScrollTemplate` uses `findEntry` across `getPacksFor("equipment")` (builder.mjs 723). `findEntry` returns the best `scoreMatch` above zero (compendium.mjs ~254-270): exact match 3, prefix 2, token overlap 1. A GM with another equipment pack that has a similarly named "Scroll of 1st-rank Spell" could get a different template (UNVERIFIED likelihood; the code allows it). Pinning the UUID (as the native path does) removes the risk. The module already has `DEFAULT_PACKS.equipment = ["pf2e.equipment-srd"]` (compendium.mjs line 27), but `getPacksFor` lets the GM change it.
7. **Embedded spell `_id`.** The module deletes it (builder.mjs 742). The native path and every published embedded spell carry one (§7.3). The impact is UNVERIFIED (depends on whether `ItemProxyPF2e` or Foundry needs `system.spell._id`).
8. **`_source` vs `toObject()`.** The native path merges `spell._source`; the module uses `spellDoc.toObject()`. In Foundry core these may differ in what they include (for example, `folder`, `_stats`, `ownership`). Neither the pf2e repo nor the raw files settle it (UNVERIFIED).
9. **Rarity.** The module creates a common scroll for an uncommon or rare spell. The native path sets `traits.rarity` to the spell's rarity (spell-consumables.ts line 45), and the rarity survives prep (physical helpers line 68). Price and level do not change with rarity in the non-runed branch (§4.3), so this is a display and filtering risk, not a price risk.
10. **Traits.** The module adds only traditions. The native path adds all spell traits (for example `concentrate`, `manipulate`, `fire`) and removes `magical` when a tradition trait is present (spell-consumables.ts 43-49). `isMagical` is still true through the tradition trait in 8.5.0 (physical/document.ts 145-147), so this is a filtering and display risk.
11. **Name localization.** The module hard-codes English. The native path uses `PF2E.Item.Physical.FromSpell.*` (en.json). Non-English clients get English names from the module.
12. **Description.** The native path prepends a spell link (`@UUID[...]`). The module leaves only the template's generic text. Cosmetic, but the native result is what the GM sees on a drag.
13. **Rank floor and ceiling.** Native: no clamp in code, only UI. Module: clamp to [base, 10] (builder.mjs 580). Keep the clamp in any new path. Wand 10 must be refused (no template on 8.5.0 config line 61; master IDs stop at 9).
14. **Heightening.** Neither path checks that the rank is a legal heightening for the spell beyond the rank bounds (the native path writes `heightenedLevel` with no check; the module clamps only). UNVERIFIED whether pf2e 8.5.0 validates heightening elsewhere.
15. **Publication.** Created scrolls and wands cite "Pathfinder GM Core" (the template's publication), not the spell's book. Both paths do this. Matters only if the forge wants to show a source.
16. **Naming collision.** `/forge` (`scripts/forge-command.mjs`) is the **Monster** lifecycle command (PLAYBOOK §4 line 93, "`forge-command.mjs` parses `/forge` and feeds the Monster lifecycle"; forge-command.mjs `FORGE_LEVEL_RANGE` = -1 to 24). The Item Forge is a separate surface (`itemforge-app.mjs`). A scroll/wand feature in the Item Forge should not be confused with `/forge`.
17. **Item Forge has no scroll or wand kind.** `itemforge-app.mjs` lines 100-104 offer `wondrous`, `weapon`, `armor` only. The forge's AI schema (`scripts/ai.mjs` lines 1110-1125, `generateMagicItemConcept`) has no spell field. The task profiles (`scripts/ai-task-profiles.mjs` lines 46-47) have `MAGIC_ITEM_CONCEPT` (maxTokens 4000) and `RUNED_ITEM_CONCEPT` (2000) only. A spell-pick task would need its own profile.
18. **Item type.** The wondrous builder creates `type: "equipment"` (item-builder.mjs lines 707-712). Scrolls and wands are `type: "consumable"`. The forge's `Item.create(data)` call (itemforge-app.mjs ~line 392) is type-agnostic, but `buildMagicItemData` is not reusable as-is for consumables (UNVERIFIED that Foundry accepts any type there; the code is type-agnostic).
19. **Reusable pattern already in repo.** `selectLoot` (ai.mjs 758-806) already has the model choose a spell by ID and rank, and the module resolves it through `candidateForPick` and `getScrollSpellCandidates` with `scrollCandidate` refs. The rank rule in the loot prompt is `rank <= ceil((level+2)/2)` (ai.mjs line 112, a module policy, not pf2e). A forge would need its own rank policy.
20. **Master manifest version field.** `master/static/system.json` shows `"version": "6.12.4"`. This is not a pf2e release number and was not used.

## 10a. UNVERIFIED list

- Foundry core behaviour for `spell._source` vs `spellDoc.toObject()` (§8.2, gap 8).
- Whether a missing `system.spell._id` breaks `ItemProxyPF2e` or chat (gap 7).
- Runtime behaviour of the native function when given a cantrip with type `scroll`, a lower-than-base rank, or a ritual (§4.1; the code shows no check).
- Whether a synthetic actor-sheet drop can drive `SpellcastingItemCreator` or `CastingItemCreateDialog` programmatically (§3, item 5).
- Whether the system bundle's internals are reachable by any means other than the three named exports (§3, item 3).
- Size of the effect of blank templates on the forge's `priceForLevel` median (gap 3).
- Whether `findEntry`'s fuzzy scoring would pick a wrong template in a real GM pack configuration (gap 6).

## 11. Verification

- Every quote above was taken from a file fetched from `raw.githubusercontent.com` at `pf2e-8.5.0` or `master`, except where marked as a module (repo) quote or as coming from the tarball grep (only used to find callers; the cited files were re-fetched from raw).
- Price table: verified by `jq` over the raw files under `upstream/raw-packs/8.5.0` and `upstream/raw-packs/master`.
- Local repo quotes are from `/home/jtf/orca/simplyPF2e` at the checked-out state at the time of reading.

## Appendix: URLs fetched

Refs: `pf2e-8.5.0` (shown as 8.5.0) and `master` (shown as M). Each path is `https://raw.githubusercontent.com/foundryvtt/pf2e/<ref>/<path>` unless stated.

- 8.5.0: `static/template.json`; `static/system.json` (404); `system.pf2e.json`; `static/lang/en.json`; `src/pf2e.ts`; `src/scripts/set-game-pf2e.ts`; `src/scripts/hooks/init.ts`; `src/scripts/config/index.ts`; `src/scripts/config/spell-consumables.ts`; `src/module/item/consumable/spell-consumables.ts`; `.../consumable/data.ts`; `.../consumable/document.ts`; `.../consumable/index.ts`; `.../consumable/values.ts`; `.../consumable/types.ts`; `.../consumable/sheet.ts`; `.../consumable/apps/spellcasting-item-creator/app.ts`; `.../consumable/apps/spellcasting-item-creator/app.svelte`; `src/module/actor/sheet/base.ts`; `src/module/actor/character/crafting/helpers.ts`; `src/module/item/base/document.ts`; `src/module/item/physical/document.ts`; `src/module/item/physical/helpers.ts`; `src/module/item/physical/data.ts`; `src/module/item/spell/data.ts`; `src/module/item/spell/document.ts`; `src/module/apps/compendium-browser/tabs/spell.ts`; `packs/pf2e/equipment/scroll-of-1st-rank-spell.json` through `scroll-of-10th-rank-spell.json`; `packs/pf2e/equipment/magic-wand-1st-rank-spell.json` through `magic-wand-9th-rank-spell.json`; `packs/pf2e/equipment/cantrip-deck-5-pack.json`; `packs/pf2e/equipment/wand-of-the-spider-4th-rank-spell.json`.
- M (master): `static/template.json`; `static/system.json`; `static/lang/en.json`; `src/pf2e.ts`; `src/scripts/set-game-pf2e.ts`; `src/module/item/consumable/spell-consumables.ts`; `.../consumable/data.ts`; `.../consumable/document.ts`; `.../consumable/index.ts`; `.../consumable/values.ts`; `.../consumable/types.ts`; `.../consumable/sheet.ts`; `src/module/actor/sheet/base.ts`; `src/module/actor/character/crafting/helpers.ts`; `src/module/item/base/document.ts`; `src/module/item/physical/document.ts`; `src/module/item/physical/helpers.ts`; `src/module/item/physical/data.ts`; `src/module/item/spell/data.ts`; `src/module/item/spell/document.ts`; `src/module/apps/compendium-browser/tabs/spell.ts`; `src/module/actor/sheet/popups/casting-item-create-dialog.ts`; `packs/equipment/scroll-of-1st-rank-spell.json` through `scroll-of-10th-rank-spell.json`; `packs/equipment/magic-wand-1st-rank-spell.json` through `magic-wand-9th-rank-spell.json`; `packs/equipment/cantrip-deck-5-pack.json`.
- GitHub API (not raw): `https://api.github.com/repos/foundryvtt/pf2e/git/trees/pf2e-8.5.0?recursive=1`; `https://api.github.com/repos/foundryvtt/pf2e/git/trees/master?recursive=1`; `https://api.github.com/repos/foundryvtt/pf2e/git/refs/tags/pf2e-8.5.0`; `https://api.github.com/repos/foundryvtt/pf2e/git/refs/heads/master`; `https://api.github.com/search/code?q=createConsumableFromSpell+repo:foundryvtt/pf2e` (401).
- Archives (grep for callers only): `https://codeload.github.com/foundryvtt/pf2e/tar.gz/refs/tags/pf2e-8.5.0`; `https://codeload.github.com/foundryvtt/pf2e/tar.gz/refs/heads/master`.
