# Hazard generator — upstream research record (2026-10-26)

Read-only research by a Haiku 5.5 worker. Sources: foundryvtt/pf2e at `pf2e-8.5.0` (primary), `v14-dev` (current head) and `master` (stale, 2025-05-31), plus Archives of Nethys for the GM Core Building Hazards tables, which are not in the pf2e repo. Nothing was executed in Foundry; the repo was not modified during the run.

# Hazard generator research: pf2e hazard schema, GM Core Building Hazards, XP, index, disable skills

Date: 2026-10-26. Read-only research for simplyPF2e. The repository was not modified. Scratch material is under `/tmp/claude-1000/-home-jtf-orca-simplyPF2e/d7473af0-56ab-435b-a6da-cd6f3a4eed11/scratchpad/hazard-research/` (`upstream/` holds downloads, `tools/` holds the scan scripts).

## 0. Refs, deviations, and every URL fetched

Refs used:

- **pf2e-8.5.0**: tag commit `3601a90ce232134c590d9641df9b62a7254aee6d` (2026-09-03). Primary ref.
- **v14-dev**: commit `be4ab21be8ffed44385c0038c05d41b61dceb68b` (2026-10-24). This is the repository's default branch. Its `system.pf2e.json` reports version 8.6.1. Used as the current-head comparison.
- **master**: commit `4cbdaa37d6c33e9519561bae2c59a23e0288cbce` (2025-05-31). Stale: it predates the 8.5.0 tag by about 15 months. Compared only where the brief asked.
- **Archives of Nethys (AoN)**: third-party. Remaster GM Core "Building Hazards" pages. Not a pf2e source.

Deviations from the brief (all verified):

1. `static/system.json` does not exist at pf2e-8.5.0 (raw 404). The 8.5.0 manifest is the root `system.pf2e.json`, version `8.5.0`, compatibility minimum `14.361`. On master, `static/system.json` exists but reports version `6.12.4` and compatibility `12`, so it is stale.
2. `master` is stale (see above). Where the brief asked for master, the master result is shown. v14-dev is the live comparison.
3. The brief asked for a complex sample at level 1 to 6. Spinning Blade Pillar (level 4, complex, routine) is used. Poisoned Dart Gallery (complex, routine) is level 8 and is shown only as an extra.
4. `scripts/encounter.mjs` changed on disk during this run. At the start, `XP_BY_RELATIVE_LEVEL` was `export const`. The current file has `const` with no export. Its values are unchanged. The repo HEAD also moved from `203aa84` to `09ca23a` during the run. No action was taken on either.
5. The pf2e repo does not contain the Building Hazards tables. They come from AoN (section 3).
6. The Write tool was blocked by a plugin hook in this worktree, so this file was written with Bash.

URLs fetched:

GitHub raw, `https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/...`:
- `static/template.json`, `system.pf2e.json`, `package.json`, `vite.config.ts`, `build/build-packs.ts`
- `src/module/actor/hazard/data.ts`, `src/module/actor/hazard/document.ts`
- `src/module/system/statistic/statistic.ts`, `src/module/system/statistic/armor-class.ts`, `src/module/actor/values.ts`
- `src/module/model.ts`, `src/scripts/config/traits.ts`, `src/scripts/hooks/load.ts`
- `packs/pf2e/hazards/{spear-launcher,hidden-pit,spinning-blade-pillar,poisoned-dart-gallery,drowning-pit}.json`
- `packs/pf2e/journals/gm-screen.json`
- `src/scripts/macros/xp/index.ts`, `src/scripts/macros/xp/dialog.ts`, `src/module/encounter/document.ts`
- `src/module/apps/compendium-browser/tabs/hazard.ts`, `src/module/apps/compendium-browser/loader.ts`

Raw, master (`https://raw.githubusercontent.com/foundryvtt/pf2e/master/...`):
- `src/module/actor/hazard/{data,document}.ts`, `static/template.json`, `static/system.json`
- `src/module/system/statistic/{statistic,armor-class}.ts`, `src/module/actor/values.ts`
- `src/scripts/hooks/load.ts`, `src/scripts/macros/xp/index.ts`, `src/module/apps/compendium-browser/tabs/hazard.ts`
- `packs/hazards/{spear-launcher,hidden-pit,spinning-blade-pillar,poisoned-dart-gallery,drowning-pit}.json`

Raw, v14-dev (`https://raw.githubusercontent.com/foundryvtt/pf2e/v14-dev/...`):
- `src/module/actor/hazard/{data,document}.ts`, `src/module/system/statistic/{statistic,armor-class}.ts`
- `src/scripts/macros/xp/index.ts`, `src/module/apps/compendium-browser/tabs/hazard.ts`, `src/scripts/hooks/load.ts`
- `system.pf2e.json`, `static/template.json`, `packs/pf2e/hazards/{the same five}.json`

GitHub API and git:
- `https://api.github.com/repos/foundryvtt/pf2e/git/trees/{pf2e-8.5.0,master,v14-dev}?recursive=1`
- `https://api.github.com/repos/foundryvtt/pf2e/commits/{master,pf2e-8.5.0,v14-dev}`
- `git ls-remote https://github.com/foundryvtt/pf2e` (heads and tags)
- A partial clone at tag `pf2e-8.5.0` (`--filter=blob:none`, sparse `src static packs/pf2e/hazards packs/pf2e/journals packs/pf2e/pathfinder-dark-archive/hazards`) was used for grep and scans only. Every quoted line was re-fetched from the raw URL above.

Archives of Nethys:
- `https://2e.aonprd.com/Rules.aspx?ID=2864` (Building Hazards, GM Core, main page)
- `https://2e.aonprd.com/Rules.aspx?ID=2868` (Stealth and Disable; Table 2-13; Table 2-14)
- `https://2e.aonprd.com/Rules.aspx?ID=2869` (Defenses; Table 2-15)
- `https://2e.aonprd.com/Rules.aspx?ID=2870` (Offense; Table 2-16)
- `https://elasticsearch.aonprd.com/aon/_search` (POST, the site's own search index, used only to locate IDs)
- Reachability only: `https://2e.aonprd.com/Hazards.aspx`, `Rules.aspx?ID=2168`, `Rules.aspx?ID=1371`.
- Not fetched: `Rules.aspx?ID=1043` (legacy Gamemastery Guide "Building Hazards"; seen in the index only).

Quote note: AoN text was produced by stripping HTML (`tools/aon_text.py`). AoN quotes were checked by exact string search in that text.

---

## 1. Hazard actor schema (Q1)

### 1.1 `static/template.json` has no `Actor.hazard` entry

8.5.0, `https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/static/template.json` lines 2-8:

```
"Actor": {
    "types": [
        "character",
        "npc"
    ],
    "templates": {
        "common": {
```

- The top-level `Actor` object has keys `character, htmlFields, npc, templates, types`. There is no `hazard` key.
- The `common` template (`attributes.hp.value/temp`, `initiative.statistic: "perception"`, `details.level.value: 1`) therefore does not apply to hazards.
- master `static/template.json` line 6 lists `"hazard"` in `Actor.types`. It still has no `hazard` block.
- v14-dev `static/template.json` lists only `"character","npc"` in `Actor.types`.

### 1.2 Registration

- 8.5.0 `src/scripts/hooks/load.ts` line 102: `CONFIG.Actor.dataModels.hazard = HazardSystemData;` (v14-dev line 105, master line 96).
- 8.5.0 `system.pf2e.json` lines 52-54, inside `documentTypes.Actor`: `"hazard": { "htmlFields": [ "details.description" ] }`.
- 8.5.0 `src/module/actor/values.ts` line 9: `const ACTOR_TYPES = ["army", "character", "familiar", "hazard", "loot", "npc", "party", "vehicle"] as const;`

### 1.3 Schema, from `src/module/actor/hazard/data.ts` (8.5.0 raw)

The v14-dev file is identical in logic. Its only change is a type alias at line 278 (`ac: { value: number };`). Master differs as noted in 1.6.

| Path | Type / constraint | Schema initial | Lines |
|---|---|---|---|
| `system.traits.value` | array of `CONFIG.PF2E.hazardTraits` keys (LaxArrayField) | per element `undefined`; array default not in repo (UNVERIFIED) | 45-53 |
| `system.traits.rarity` | common / uncommon / rare / unique | `"common"` | 54; `model.ts` 5-8 |
| `system.traits.size.value` | `CONFIG.PF2E.actorSizes` | `"lg"` (all 73 published hazards are `"med"`) | 55-57 |
| `system.attributes.hp.value` | integer, min 0 | `0` | 61 |
| `system.attributes.hp.max` | integer, min 0 | `0` | 62 |
| `system.attributes.hp.temp` | integer, min 0 | `0` | 63 |
| `system.attributes.hp.details` | string, blank allowed | `""` | 64 |
| `system.attributes.ac.value` | number (no integer or min rule) | **none (no initial)** | 66-68 |
| `system.attributes.hardness` | integer, min 0 | `0` | 70 |
| `system.attributes.stealth.value` | number, nullable | `null` | 71-72 |
| `system.attributes.stealth.details` | string, blank allowed | `""` | 73 |
| `system.attributes.immunities[]` | `{type, exceptions[]}` | array default (UNVERIFIED) | 75-92 |
| `system.attributes.weaknesses[]` | `{type, value>=1, exceptions[]}` | array default | 93-111 |
| `system.attributes.resistances[]` | `{type, value>=1, exceptions[], doubleVs[]}` | array default | 112-138 |
| `system.attributes.emitsSound` | `"encounter"` or boolean | `"encounter"` | 139-154 |
| `system.details.description` | HTML field | `""` | 157 |
| `system.details.level.value` | integer, min -1 | `1` | 158-160 |
| `system.details.isComplex` | boolean | `false` | 161 |
| `system.details.disable` | string, blank allowed | `""` | 162 |
| `system.details.routine` | string, blank allowed | `""` | 163 |
| `system.details.reset` | string, blank allowed | `""` | 164 |
| `system.details.publication` | `{title:"", authors:"", license:"OGL"\|"ORC", remaster:false}` | `OGL`, `false`, `""` | 165; `model.ts` 24-45 |
| `system.saves.{fortitude,reflex,will}.value` | integer, nullable | `null` | 38-41, 167-171 |

Other keys present in published packs but not in the 8.5.0 schema: `attributes.hasHealth` (52 of 73 docs), `attributes.hp.tempmax`, `saves.*.saveDetail`, `system.creatureType` (71 docs), `system.statusEffects` (72 docs), `system.customModifiers` (1 doc). Whether Foundry strips them on create is UNVERIFIED (core behavior, not in the repo). Do not write them.

Derived fields (set in code, not by the author):

- `hp.negativeHealing = false` and `hp.brokenThreshold = floor(max/2)` (document.ts 80-81). `hasHealth = hp.max > 0` (82).
- `immunities` gets `object-immunities` unshifted (84-85). Exceptions for bleed, mental, poison and spirit are pushed when a weakness or resistance of that type exists (169-174, in `prepareData`).
- `details.alliance = null` (98).
- `skills.stealth` is built as a `Statistic` (109-124). `attributes.stealth` is replaced by trace data (126-132).
- `attributes.ac` is replaced by trace data (141-150). `saves.*` are replaced by trace data (202).
- `initiative` is set only for complex hazards (88-96, 134-138). `system.actions` is mapped from melee items (153).

### 1.4 Derivation: raw value, level added, or final modifier

8.5.0 `src/module/actor/hazard/document.ts`:

```
81        attributes.hp.brokenThreshold = Math.floor(attributes.hp.max / 2);
82        attributes.hasHealth = attributes.hp.max > 0;
...
90            attributes.stealth.value ??= 0;
...
119                        modifier: system.attributes.stealth.value ?? 0,
...
145                modifier: system.attributes.ac.value - 10,
...
152        this.saves = this.prepareSaves();
...
184            const base = save.value;
185            if (base === null) return saves;
```

8.5.0 `src/module/system/statistic/statistic.ts` (v14-dev has the same logic):

```
71            actor.isOfType("character") && data.attribute
...
79            actor.isOfType("character") && typeof data.rank === "number"
...
733    get value(): number {
734        return (
735            10 +
```

8.5.0 `src/module/system/statistic/armor-class.ts`:

```
20        data.rank ??= 1;
21        const attribute = actor.isOfType("creature") ? (data.attribute ?? "dex") : null;
```

8.5.0 `src/module/actor/values.ts` line 7: `const CREATURE_ACTOR_TYPES = ["character", "npc", "familiar"] as const;`

Conclusions:

- **AC:** the raw value is the final AC. The ArmorStatistic base modifier is `ac.value - 10`. A hazard is not a `character`, so no proficiency or ability modifier is added. Its `attribute` is null because hazard is not in `CREATURE_ACTOR_TYPES`. The DC is `10 + (ac.value - 10) = ac.value`.
- **Saves:** the raw value is the final modifier. It is the only modifier on a Statistic with no rank and no attribute. No level is added.
- **Stealth:** the raw value is the final modifier, not the DC. The DC is `value + 10`. `null` means no Stealth. For complex hazards, a `null` value is set to 0 (line 90).
- **HP:** the raw `max` is final. Only `brokenThreshold` is derived.

### 1.5 What `Actor.create({type:"hazard"})` needs

- pf2e-side: `attributes.ac.value` is the only field with no schema initial (data.ts 66-68). Every other field has an explicit initial or is nullable.
- The core behavior when `ac.value` is missing, or how unknown keys are handled, is in Foundry core, not in this repo. UNVERIFIED. No live test was run (PLAYBOOK invariant 7).
- Value rules that do fail validation in the schema: integer `min` rules on `hp.*`, `hardness`, and `level` (min -1); `weaknesses[].value` and `resistances[].value` (min 1); `traits.rarity` and `size.value` choices; `details.publication.license` choices (OGL/ORC).

### 1.6 Master and v14-dev differences

- **master `data.ts` line 34:** `new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 })` for save values. On 8.5.0 the same field is `nullable: true, initial: null` (8.5.0 line 40). Master therefore cannot store `null`.
- **master `document.ts` line 191:** `if (!base) return saves;`. A save of 0 is treated as absent. On 8.5.0 (line 185) and v14-dev (line 185) only `null` is treated as absent.
- **master `document.ts` lines 145 (AC) and 119 (stealth):** unchanged from 8.5.0.
- **master** `details.description` is a `StringField`, not `HTMLField`.
- **v14-dev:** no behavior change from 8.5.0 in the hazard schema or derivation.

---

## 2. Hazard items (Q2)

The packs contain 73 hazard documents. Scanned: `packs/pf2e/hazards` (53) and `packs/pf2e/pathfinder-dark-archive/hazards` (20). The manifest entries are `{"name":"hazards","label":"Hazards (Rulebooks)","path":"packs/hazards","type":"Actor",...}` and `{"name":"pathfinder-dark-archive",...}`. Mapping from source to manifest: `vite.config.ts` lines 32-34 (8.5.0 raw): `const packDir = systemJSON.packs.find(...)?.path.replace(/^packs/, \`packs/${systemId}\`)`. So manifest `packs/hazards` is source `packs/pf2e/hazards`.

### 2.1 Simple hazard, level 2: Spear Launcher

`https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/hazards/spear-launcher.json`

```
"attributes": { "ac": {"value": 18}, "emitsSound": "encounter", "hardness": 8, "hasHealth": true,
  "hp": {"details": "", "max": 32, "temp": 0, "tempmax": 0, "value": 32},
  "immunities": [{"type": "critical-hits"}, {"type": "precision"}],
  "stealth": {"details": "<p>(trained)</p>", "value": 10} },
"details": {"description": "<p>A wall socket loaded with a spear connects to a floor tile in one 5-foot square.</p>",
  "disable": "<p>@Check[thievery|dc:18|name:Disable Thievery] (trained) on the floor tile or wall socket</p>",
  "isComplex": false, "level": {"value": 2}, "reset": "", "routine": "",
  "publication": {"license": "ORC", "remaster": true, "title": "Pathfinder GM Core"}},
"saves": {"fortitude": {"saveDetail": "", "value": 11}, "reflex": {"saveDetail": "", "value": 3}, "will": {"saveDetail": "", "value": 0}},
"traits": {"rarity": "common", "size": {"value": "med"}, "value": ["mechanical", "trap"]}
```

Embedded items:

- `type: "action"`, name "Spear", `system.actionType.value: "reaction"`, `system.traits.value: ["attack"]`. Description: `<p><strong>Trigger</strong> Pressure is applied to the floor tile.</p> ... <strong>Effect</strong> The trap shoots a spear, making a Strike against the creature or object on the floor tile.</p>`.
- `type: "melee"`, name "Spear", `system.bonus.value: 14`, `system.damageRolls: {"b2sg...": {"damage": "2d6+6", "damageType": "piercing"}}`, `system.attackEffects.value: []`, `system.traits.value: []`, `system.range: null`.

### 2.2 Simple hazard, level 0: Hidden Pit (no melee)

`https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/hazards/hidden-pit.json`

- `attributes`: `ac 10`, `hardness 3`, `hp max 12`, `stealth {"value": 8, "details": "<p>(or 0 if the trapdoor is disabled or broken)</p>"}`.
- `details`: `level 0`, `isComplex false`, `disable: "@Check[thievery|dc:12|name:Remove the Trapdoor] to remove the trapdoor"`, `reset: "<p>Creatures can still fall into the trap, but the trapdoor must be reset manually...</p>"`.
- One item: `action` "Pitfall", `actionType.value: "reaction"`, with `@Damage[10[bludgeoning]|options:fall-damage]` and `@UUID[Compendium.pf2e.actionspf2e.Item.Grab an Edge]` in the description.

### 2.3 Complex hazard with routine, level 4: Spinning Blade Pillar

`https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/hazards/spinning-blade-pillar.json`

- `attributes`: `ac 21`, `hardness 12`, `hp {"details": "Panel Hardness: 5, Panel HP: 20 (BT 10)", "max": 48}`, `stealth {"value": 11, "details": "<p>(trained) or @Check[perception|dc:26|traits:action:seek] (expert) to notice the control panel</p>"}`.
- `details`: `isComplex: true`, `level: {"value": 4}`, `disable: "<p>@Check[thievery|dc:21|name:Disable Pillar|traits:action:disable-a-device] (trained) twice on the pillar, or @Check[thievery|dc:19|name:Disable Trap (Control Panel)|traits:action:disable-a-device] (expert) once on the control panel deactivates the whole trap. ...</p>"`.
- `details.routine: "<p>(3 actions) The trap uses its first action to make a spinning blade Strike against each adjacent creature, its second action to move straight in a random direction (roll [[/gmr 1d4 #Direction]] ...), and its third to make a spinning blade Strike against each adjacent creature. This trap doesn't take a multiple attack penalty.</p>"`.
- `saves`: fortitude 10, reflex 12, will 0.
- Items:
  - `action` "Rising Pillar", `actionType.value: "reaction"`, `traits.value: ["attack"]`, trigger "A creature steps on one of the trapped floor tiles".
  - `action` "Speed", `actionType.value: "passive"`, description `<p>10 feet</p>`. Speed is encoded as a passive action item.
  - `melee` "Spinning Blade", `bonus.value: 12`, `damageRolls` → `"2d10+5"` with `damageType: "slashing"`, `traits.value: []`.

### 2.4 Complex hazard, level 8 (extra, outside the brief's range): Poisoned Dart Gallery

`https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/hazards/poisoned-dart-gallery.json`

- Items include an `action` "Flesset Poison" with `actionType.value: "passive"` and description `<p><strong>Saving Throw</strong> @Check[fortitude|dc:22]</p> ... <strong>Stage 1</strong> @Damage[1d6[poison]] damage and @UUID[Compendium.pf2e.conditionitems.Item.Clumsy]{Clumsy 1} (1 round)</p>`.
- `melee` "Poisoned Dart", `bonus.value: 21`, `damageRolls` `3d4` piercing, `attackEffects.value: ["flesset-poison"]`, `subjectToMAP: false`.
- Saves: fortitude 13, reflex 17, **will `null`** (8.5.0). On master the same pack has `will: 0`.

### 2.5 How the data encodes attacks, reactions, and checks

- **Attacks:** `type: "melee"` items. Attack bonus is `system.bonus.value` (an integer). Damage is `system.damageRolls.<random id>.{damage, damageType}`. `damage` is a dice string such as `"2d10+5"`. Attack effects are `system.attackEffects.value` (slug array). `subjectToMAP` appears in 4 of 14 melee items.
- **Actions and reactions:** `type: "action"` items with `system.actionType.value`. Counts across the 88 action items: `reaction` 72, `passive` 14, `free` 2. No item uses `action`. Trigger text is prose in `description.value`, starting with `<strong>Trigger</strong>`.
- **Stealth:** no DC field. `attributes.stealth.value` is the modifier (DC = value + 10, section 1.4). `attributes.stealth.details` is prose, sometimes with `@Check` enrichers and a proficiency in parentheses.
- **Disable:** prose in `details.disable`, mostly with `@Check[slug|dc:N|name:...|traits:...]` enrichers and a proficiency in parentheses (section 6). Some are plain text with no enricher (Web Lurker Deadfall: "Survival (trained) or Thievery (expert) DC 20 to rearrange the webbing.").
- **Routine:** `details.routine` is prose, present in 23 of 24 complex hazards.
- **Counts (73 docs):** simple 49, complex 24. Publications: Pathfinder GM Core (remaster) 32; Dark Archive (Remastered) 19; Gamemastery Guide 8; Core Rulebook 6; Guns & Gears 3; Bestiary 2; Bestiary 2 1; Blog 1; Dark Archive 1. Every hazard has `size: "med"`. `rarity` is common (68), rare (2), uncommon (2), or unique (1).

### 2.6 Hazard item JSON, master vs 8.5.0

The master spear launcher differs from 8.5.0 in the melee item: `range: null` is removed and `weaponType: {"value": "ranged"}` is added. For the other four sampled docs, saves, AC, HP, and stealth match 8.5.0. Only the dart gallery's `will` differs (null vs 0).

---

## 3. Building Hazards tables (Q3)

### 3.1 Not in the repo

- `packs/pf2e/journals/gm-screen.json` (8.5.0) contains XP Awards, Encounter Budget, DCs by Level, Simple DCs, Specific Skill DCs, Structures and Force Open DCs, and others. It has no hazard Stealth, AC, save, hardness, HP, or attack tables.
- A search of `packs` and `src` for "building hazards", "simple hazard", "complex hazard", and "stealth dc" found only the XP table, a comment in `src/scripts/macros/xp/index.ts`, and changelog text.

### 3.2 Source used: AoN Remaster GM Core

- `https://2e.aonprd.com/Rules.aspx?ID=2864`: "Building Hazards, Source GM Core pg. 109".
- `...ID=2868`: "Stealth and Disable" (Tables 2-13 and 2-14).
- `...ID=2869`: "Defenses" (Table 2-15).
- `...ID=2870`: "Offense" (Table 2-16).
- The legacy Gamemastery Guide version (`ID=1043`) has different content and was not used.

Key quotes (exact text, AoN):

- Scale words: "The statistics for your hazard can have extreme, high, or low values."
- Low end: "If you need something even lower, use a terrible value from Building Creatures (pages 112–125), or just an incredibly low value like the armageddon orb's Stealth (page 100)."
- Complex Stealth: "If you need a Stealth modifier for a complex hazard, just subtract 10 from the listed DC."
- Proficiency: "you can use lower proficiency ranks than the ones listed, and if you use the high rank, consider a secondary, perhaps lessefficient method to disable the hazard..."
- Simple vs complex damage: "Simple hazards deal about twice as much damage as complex hazards and have a very high attack bonus (abbreviated as S. Atk in the table). Complex hazards usually have more moderate attack bonuses (abbreviated as C. Atk in the table)."
- Simple DCs: "Simple hazard DCs aren't as high for their level as their attack bonuses are, since effects with DCs usually have some effect even on a successful saving throw; use the EDC and HDC columns..."
- Broken threshold: "* The Broken Threshold is usually half the hazard's HP."
- Hardness and HP: "...you can skip the Hardness and use the HP values from table 2-7: Hit Points on page 63."
- Concealment: "Most hazards built by intelligent creatures are concealed and have at least a trained rank."

Note on the AoN "Defenses" table headers. AoN prints the AC columns as "EAC | HAC | LAC", and the text says the columns are "preceded by E, H, or L on the table". The column labels are reproduced exactly as AoN shows them. Not checked against the print book.

### 3.3 Table 2-13 Stealth and Disable DCs (AoN `ID=2868`)

Stealth and disable DCs. The table does not carry proficiency ranks. Ranks come from Table 2-14. The "Low" column is a range in AoN.

| Level | Extreme | High | Low |
|---|---|---|---|
| -1 | 18 | 15 | 12 to 11 |
| 0 | 19 | 16 | 13 to 12 |
| 1 | 20 | 17 | 14 to 13 |
| 2 | 21 | 18 | 15 to 14 |
| 3 | 23 | 20 | 17 to 15 |
| 4 | 25 | 22 | 18 to 17 |
| 5 | 26 | 23 | 20 to 18 |
| 6 | 28 | 25 | 21 to 19 |
| 7 | 30 | 27 | 23 to 21 |
| 8 | 31 | 28 | 24 to 22 |
| 9 | 33 | 30 | 26 to 23 |
| 10 | 35 | 32 | 27 to 25 |
| 11 | 36 | 33 | 29 to 26 |
| 12 | 38 | 35 | 30 to 27 |
| 13 | 40 | 37 | 32 to 29 |
| 14 | 41 | 38 | 33 to 30 |
| 15 | 43 | 40 | 35 to 31 |
| 16 | 45 | 42 | 36 to 33 |
| 17 | 46 | 43 | 38 to 34 |
| 18 | 48 | 45 | 39 to 35 |
| 19 | 50 | 47 | 41 to 37 |
| 20 | 51 | 48 | 42 to 38 |
| 21 | 53 | 50 | 44 to 39 |
| 22 | 55 | 52 | 45 to 41 |
| 23 | 56 | 53 | 46 to 42 |
| 24 | 58 | 55 | 48 to 43 |

### 3.4 Table 2-14 Minimum Proficiency (AoN `ID=2868`)

The table gives the minimum proficiency for high and moderate difficulty. Its "Levels" column gives bands by level.

| Levels | High | Moderate |
|---|---|---|
| 0 or lower | Untrained | Untrained |
| 1–4 | Trained (expert for Perception) | Trained |
| 5–8 | Expert | Trained |
| 9–18 | Master | Expert |
| 19 or higher | Legendary | Master |

### 3.5 Table 2-15 Defenses (AoN `ID=2869`)

AC columns are labeled as AoN prints them (see 3.2). The Save columns are the E, H, and L saves. HP is a range. AoN footnote: the Broken Threshold is usually half the HP.

| Level | EAC | HAC | LAC | E Save | H Save | L Save | Hardness | HP |
|---|---|---|---|---|---|---|---|---|
| -1 | 18 | 15 | 12 | +9 | +8 | +2 | 2-4 | 11-13 |
| 0 | 19 | 16 | 13 | +10 | +9 | +3 | 3-5 | 15-17 |
| 1 | 19 | 16 | 13 | +11 | +10 | +4 | 5-7 | 23-25 |
| 2 | 21 | 18 | 15 | +12 | +11 | +5 | 7-9 | 30-34 |
| 3 | 22 | 19 | 16 | +14 | +12 | +6 | 10-12 | 42-46 |
| 4 | 24 | 21 | 18 | +15 | +14 | +8 | 11-13 | 46-50 |
| 5 | 25 | 22 | 19 | +17 | +15 | +9 | 12-14 | 50-54 |
| 6 | 27 | 24 | 21 | +18 | +17 | +11 | 13-15 | 54-58 |
| 7 | 28 | 25 | 22 | +20 | +18 | +12 | 14-16 | 58-62 |
| 8 | 30 | 27 | 24 | +21 | +19 | +13 | 15-17 | 62-66 |
| 9 | 31 | 28 | 25 | +23 | +21 | +15 | 16-18 | 66-70 |
| 10 | 33 | 30 | 27 | +24 | +22 | +16 | 17-19 | 70-74 |
| 11 | 34 | 31 | 28 | +26 | +24 | +18 | 19-21 | 78-82 |
| 12 | 36 | 33 | 30 | +27 | +25 | +19 | 20-22 | 82-86 |
| 13 | 37 | 34 | 31 | +29 | +26 | +20 | 21-23 | 86-90 |
| 14 | 39 | 36 | 33 | +30 | +28 | +22 | 22-24 | 90-94 |
| 15 | 40 | 37 | 34 | +32 | +29 | +23 | 23-25 | 94-98 |
| 16 | 42 | 39 | 36 | +33 | +30 | +25 | 25-27 | 101-107 |
| 17 | 43 | 40 | 37 | +35 | +32 | +26 | 27-29 | 109-115 |
| 18 | 45 | 42 | 39 | +36 | +33 | +27 | 29-31 | 117-123 |
| 19 | 46 | 43 | 40 | +38 | +35 | +29 | 31-33 | 125-131 |
| 20 | 48 | 45 | 42 | +39 | +36 | +30 | 33-35 | 133-139 |
| 21 | 49 | 46 | 43 | +41 | +38 | +32 | 36-38 | 144-152 |
| 22 | 51 | 48 | 45 | +43 | +39 | +33 | 39-41 | 156-164 |
| 23 | 52 | 49 | 46 | +44 | +40 | +34 | 44-46 | 168-176 |
| 24 | 54 | 51 | 48 | +46 | +42 | +36 | 46-50 | 180-188 |

### 3.6 Table 2-16 Offense (AoN `ID=2870`)

S. Atk and C. Atk are attack bonuses. Simple and complex damage are dice expressions with the average in parentheses. EDC and HDC are extreme and high DCs.

| Level | S. Atk | C. Atk | Simple Dmg | Complex Dmg | EDC | HDC |
|---|---|---|---|---|---|---|
| -1 | +10 | +8 | 2d4+1 (6) | 1d4+1 (3) | 19 | 16 |
| 0 | +11 | +8 | 2d6+3 (10) | 1d6+2 (5) | 19 | 16 |
| 1 | +13 | +9 | 2d6+5 (12) | 1d6+3 (6) | 20 | 17 |
| 2 | +14 | +11 | 2d10+7 (18) | 1d10+4 (9) | 22 | 18 |
| 3 | +16 | +12 | 2d10+13 (24) | 1d10+6 (12) | 23 | 20 |
| 4 | +17 | +14 | 4d8+10 (28) | 2d8+5 (14) | 25 | 21 |
| 5 | +19 | +15 | 4d8+14 (32) | 2d8+7 (16) | 26 | 22 |
| 6 | +20 | +17 | 4d8+18 (36) | 2d8+9 (18) | 27 | 24 |
| 7 | +22 | +18 | 4d10+18 (40) | 2d10+9 (20) | 29 | 25 |
| 8 | +23 | +20 | 4d10+22 (44) | 2d10+11 (22) | 30 | 26 |
| 9 | +25 | +21 | 4d10+26 (48) | 2d10+13 (24) | 32 | 28 |
| 10 | +26 | +23 | 4d12+26 (52) | 2d12+13 (26) | 33 | 29 |
| 11 | +28 | +24 | 4d12+30 (56) | 2d12+15 (28) | 34 | 30 |
| 12 | +29 | +26 | 6d10+27 (60) | 3d10+14 (30) | 36 | 32 |
| 13 | +31 | +27 | 6d10+31 (64) | 3d10+16 (32) | 37 | 33 |
| 14 | +32 | +29 | 6d10+35 (68) | 3d10+18 (34) | 39 | 34 |
| 15 | +34 | +30 | 6d12+33 (72) | 3d12+17 (36) | 40 | 36 |
| 16 | +35 | +32 | 6d12+35 (74) | 3d12+18 (37) | 41 | 37 |
| 17 | +37 | +33 | 6d12+37 (76) | 3d12+19 (38) | 43 | 38 |
| 18 | +38 | +35 | 6d12+41 (80) | 3d12+20 (40) | 44 | 40 |
| 19 | +40 | +36 | 8d10+40 (84) | 4d10+20 (42) | 46 | 41 |
| 20 | +41 | +38 | 8d10+44 (88) | 4d10+22 (44) | 47 | 42 |
| 21 | +43 | +39 | 8d10+48 (92) | 4d10+24 (46) | 48 | 44 |
| 22 | +44 | +41 | 8d10+52 (96) | 4d10+26 (48) | 50 | 45 |
| 23 | +46 | +42 | 8d12+48 (100) | 4d12+24 (50) | 51 | 46 |
| 24 | +47 | +44 | 8d12+52 (104) | 4d12+26 (52) | 52 | 48 |

### 3.7 Published hazards against these tables (computed; method below)

Script: `tools/compare_pub.py` over the 73 published docs. Each published value is checked against the table row at its own level. These are counts from my scan, not a validation claim.

| Check | Result |
|---|---|
| AC equals EAC, HAC, or LAC | 31 of 73. All 31 are physical hazards (41 have HP). |
| Fortitude or Reflex equals E, H, or L | 44 of 78 non-zero saves. 68 saves are 0 (no-save placeholders). |
| HP max within the printed range | 13 of 41 hazards with HP. |
| Hardness within the printed range | 18 of 71 (2 have no hardness). |
| Stealth DC (10 + value) equals E or H, or falls in the Low range | 44 of 73. |
| Melee bonus equals S. Atk or C. Atk | 10 of 14 melee items. |

Examples of mismatches:

- Spinning Blade Pillar (level 4, complex): AC 21 matches HAC. HP 48 and hardness 12 fall in range. Fortitude 10 and Reflex 12 are not table values (H +14, L +8). Melee +12 is not C. Atk +14. Stealth DC 21 is not in E 25 / H 22 / Low 18-17.
- Spear Launcher (level 2, simple): AC 18 matches HAC; hardness 8 and HP 32 fall in range; Fortitude 11 matches the H save. Reflex 3 is not a table value (L is +5). Melee +14 matches S. Atk; damage 2d6+6 is not the table's 2d10+7.

Conclusion: the tables are scales to pick from, not a fit to published examples. Many published hazards sit off-table, and most of the off-table cases are no-defense hazards (AC 10, no HP, saves 0).

---

## 4. Hazard XP (Q4)

### 4.1 pf2e 8.5.0 code

`https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/scripts/macros/xp/index.ts` (the file is `src/scripts/macros/xp/index.ts`, not `src/module/system/xp`). There is no simple-hazard divisor. Simple hazards use a separate lookup map.

```
27  const xpCreatureDifferences = new Map([
28      [-4, 10], [-3, 15], [-2, 20], [-1, 30], [0, 40], [1, 60], [2, 80], [3, 120], [4, 160],
37  ]);

39  // for some reason Paizo thought it was a good idea to give
40  // simple hazards entirely different and incredibly small xp values
41  const xpSimpleHazardDifferences = new Map([
42      [-4, 2], [-3, 3], [-2, 4], [-1, 6], [0, 8], [1, 12], [2, 16], [3, 24], [4, 32],
51  ]);

53  function getXPFromMap(partyLevel: number, entityLevel: number, values: Map<number, number>): number {
55      const difference = entityLevel + 1 - (partyLevel + 1);
57      const boundedDifference = Math.clamp(difference, 0 - range, range);

69  function getHazardXp(partyLevel: number, hazard: HazardBrief, dcOptions: DCOptions): number {
70      if (hazard.isComplex) {
71          return calculateCreatureXP(partyLevel, hazard.level, dcOptions);
72      } else {
73          return getXPFromMap(partyLevel, hazard.level, xpSimpleHazardDifferences);
```

`calculateCreatureXP` (61-67) selects the variant creature map (`xpVariantCreatureDifferences`, "level without proficiency") when `dcOptions.pwol` is set, and `xpCreatureDifferences` otherwise. Simple hazards use the simple map regardless of `pwol`.

`calculateXP` (129-155) sums creature XP and hazard XP, then uses `generateEncounterBudgets(partySize)` (85-94). That function is `budget = partySize * 20`, with trivial 0.5, low 0.75, moderate 1, severe 1.5, and extreme 2.

### 4.2 GM Core printed table (verbatim)

`https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/journals/gm-screen.json`, page "XP Awards" (`_id ZcddTU02joqYuuoV`), cited as "Pathfinder GM Core pg. 56":

| Adversary or Hazard | Level XP for Simple Hazard | XP for Creature or Complex Hazard |
|---|---|---|
| Party level - 4 | 2 XP | 10 XP |
| Party level - 3 | 3 XP | 15 XP |
| Party level - 2 | 4 XP | 20 XP |
| Party level - 1 | 6 XP | 30 XP |
| Party level | 8 XP | 40 XP |
| Party level + 1 | 12 XP | 60 XP |
| Party level + 2 | 16 XP | 80 XP |
| Party level + 3 | 24 XP | 120 XP |
| Party level + 4 | 32 XP | 160 XP |

The code values in 4.1 match this table exactly.

### 4.3 Comparison with `scripts/encounter.mjs` (current file)

- `XP_BY_RELATIVE_LEVEL` (current lines 18-20): `"-4": 10, "-3": 15, "-2": 20, "-1": 30, "0": 40, "1": 60, "2": 80, "3": 120, "4": 160`. Identical to pf2e `xpCreatureDifferences` and to the GM Core creature and complex column. It is now not exported (see section 0, item 4).
- `creatureXP` (lines 25-27) clamps the relative level to ±4. The pf2e `getXPFromMap` clamps to ±4 as well (`range = floor(size/2)`).
- The module has no simple-hazard XP map (`2, 3, 4, 6, 8, 12, 16, 24, 32`) and no hazard path. Simple-hazard XP would need its own table.
- `THREATS` (lines 10-16) matches the GM Core "Encounter Budget" table (gm-screen page `WZgFEMDSP9TvYc4u`, pg. 75): trivial 40 (+10 per character), low 60 (+20), moderate 80 (+20), severe 120 (+30), extreme 160 (+40). The module applies these per-character adjustments relative to four players (`encounterBudget`).

GM Core "Encounter Budget" as printed (gm-screen page `WZgFEMDSP9TvYc4u`):

| Difficulty | XP Budget | Character Adjustment |
|---|---|---|
| Trivial | 40 or less | 10 or less |
| Low | 60 | 20 |
| Moderate | 80 | 20 |
| Severe | 120 | 30 |
| Extreme | 160 | 40 |

### 4.4 Budget scaling discrepancy (verified arithmetic)

pf2e's reward macro (`generateEncounterBudgets`, 8.5.0 lines 85-94) scales every tier by `partySize × 20` with multipliers. For the low tier that is `floor(0.75 × 20n)`, which is 15 per character. GM Core's printed "Low" adjustment is 20 per character, and the module uses 20.

| Party size | Module low (60 + (n−4)×20) | pf2e macro low (floor(15n)) |
|---|---|---|
| 3 | 40 | 45 |
| 4 | 60 | 60 |
| 5 | 80 | 75 |
| 6 | 100 | 90 |

The other tiers match. The module follows the printed GM Core table. This is a fact about the two sources, not a claim about which is right.

### 4.5 Hazard XP summary

| Relative level | Simple hazard XP | Complex hazard XP (= creature XP) |
|---|---|---|
| -4 or lower | 2 | 10 |
| -3 | 3 | 15 |
| -2 | 4 | 20 |
| -1 | 6 | 30 |
| 0 | 8 | 40 |
| +1 | 12 | 60 |
| +2 | 16 | 80 |
| +3 | 24 | 120 |
| +4 or higher | 32 | 160 |

The level is `details.level.value`, and the simple/complex split is `details.isComplex`. Under the `pwol` option, complex hazards use the variant creature map (section 4.1) and simple hazards do not change.

---

## 5. Compendium index for hazards (Q5)

Yes. The compendium browser's hazard tab requests these index fields, and filters actors to `type === "hazard"`.

8.5.0 `src/module/apps/compendium-browser/tabs/hazard.ts`:

```
15    protected index = ["img", "system.details.level.value", "system.details.isComplex", "system.traits"];
33        const indexFields = [...this.index, "system.details.publication", "system.details.source"];
44                if (!this.hasAllIndexFields(actorData, this.index)) {
53                    ...system.traits.value.map((t: string) => `trait:${t.replace(/^hb_/, "")}`),
54                    `complexity:${system.details.isComplex ? "complex" : "simple"}`,
55                    `level:${system.details.level.value}`,
56                    `rarity:${system.traits.rarity}`,
...
67                    level: actorData.system.details.level.value,
68                    rarity: actorData.system.traits.rarity,
```

8.5.0 `src/module/apps/compendium-browser/loader.ts`, lines 40-43:

```
40                const index = await pack.getIndex({ fields: indexFields });
41                const firstResult: Partial<CompendiumIndexData> = index.contents.at(0) ?? {};
42                // Every result should have the "system" property otherwise the indexFields were wrong for that pack
43                if (firstResult.system) {
```

The manifest entry (8.5.0 `system.pf2e.json`, `hazards` pack) carries no index fields. The fields are requested at runtime by the browser.

What the index exposes: `system.details.level.value`, `system.details.isComplex`, the whole `system.traits` subtree (`value`, `rarity`, `size`), `system.details.publication`, and `img`. What it does not expose: `attributes`, `saves`, items, `details.disable`, `details.routine`. A candidate list can show level, complexity, traits, rarity, and publication. Stats and disable text need the full document.

master (`src/module/apps/compendium-browser/tabs/hazard.ts` line 16) and v14-dev (line 15) use the same index fields.

---

## 6. Disable skills and actions (Q6)

Scan of all 73 docs, `details.disable` text only. Counts are occurrences of each `@Check` slug:

| Slug | Occurrences |
|---|---|
| thievery | 53 |
| survival | 12 |
| religion | 12 |
| occultism | 7 |
| athletics | 5 |
| arcana | 4 |
| crafting | 4 |
| diplomacy | 3 |
| intimidation | 2 |
| performance | 2 |
| nature | 2 |
| acrobatics | 1 |
| deception | 1 |
| perception | 1 (False Floor, `@Check[perception|dc:21]`) |

Non-enricher forms and actions seen:

- **Dispel Magic:** `@UUID[Compendium.pf2e.spells-srd.Item.Dispel Magic] (Nth rank; counteract DC X)`. Appears in 17 docs, for example Fireball Rune, Polymorph Trap, Electric Latch Rune.
- **Force Open:** Drowning Pit, `@Check[athletics|dc:22] to @UUID[Compendium.pf2e.action-macros.Macro.Force Open: Athletics] the trapdoor`.
- **Interact:** Sportlebore, plain text: "A creature that notices the sportlebore can remove it from the food it is hidden within automatically as an Interact action." No DC.
- **Seek:** `traits:action:seek` on a perception check in `attributes.stealth.details` (3 occurrences), for example `@Check[perception|dc:31|traits:action:seek] (master)`.
- **Demoralize:** Dance of Death, `@Check[intimidation|dc:42|name:Frighten the Orchestra|traits:action:demoralize] (expert)`.
- **Disable a device:** `traits:action:disable-a-device` on 38 enrichers across disable and stealth text.
- **Proficiency in prose:** Web Lurker Deadfall, "Survival (trained) or Thievery (expert) DC 20 to rearrange the webbing." No enricher.
- Proficiency in parentheses after an enricher appears as "(trained)", "(expert)", "(master)", or "(legendary)".
- Lore, Recall Knowledge, Medicine, and Society: not seen in disable text.

---

## Field map for `Actor.create` (hazard)

"Required" means schema required without an initial value, or set explicitly. Foundry core behavior is UNVERIFIED (section 1.5).

| Field | Type | Required? | Source of value | Quote ref |
|---|---|---|---|---|
| `type` | `"hazard"` | yes | constant | `system.pf2e.json` 52-54; `load.ts` 102 |
| `name` | string | yes (core, UNVERIFIED) | LLM text (escaped) | not in repo |
| `system.traits.value` | string[] | no (default `[]`, UNVERIFIED) | LLM enum from `CONFIG.PF2E.hazardTraits` | `data.ts` 45-53; `traits.ts` 1032 |
| `system.traits.rarity` | enum | no (`common`) | LLM enum or constant | `data.ts` 54; `model.ts` 5-8 |
| `system.traits.size.value` | enum | no (`lg`) | constant `med` | `data.ts` 55-57 |
| `system.attributes.ac.value` | number | **yes, no initial** | Table 2-15 EAC/HAC/LAC by level, chosen by LLM scale word (E/H/L) | `data.ts` 66-68; `armor-class.ts` 20-21; `document.ts` 141-150 |
| `system.attributes.hp.max` | integer >= 0 | yes (`0`) | Table 2-15 HP range (module picks a value in range) | `data.ts` 61-62 |
| `system.attributes.hp.value` | integer >= 0 | yes (`0`) | equal to `hp.max` in all 41 published HP hazards | `data.ts` 61 |
| `system.attributes.hp.temp` | integer >= 0 | yes (`0`) | constant `0` | `data.ts` 63 |
| `system.attributes.hp.details` | string | yes (`""`) | LLM plain text (escaped) or `""` | `data.ts` 64 |
| `system.attributes.hardness` | integer >= 0 | yes (`0`) | Table 2-15 hardness range | `data.ts` 70 |
| `system.attributes.stealth.value` | number or null | yes (nullable, `null`) | Table 2-13 DC by scale word, minus 10 (`null` = no Stealth) | `data.ts` 71-72; `document.ts` 119; `statistic.ts` 733-735; AoN 2868 "subtract 10" |
| `system.attributes.stealth.details` | string | yes (`""`) | proficiency from Table 2-14 (High/Moderate); published samples put it in parentheses | `data.ts` 73 |
| `system.attributes.emitsSound` | `"encounter"` or boolean | no (`"encounter"`) | constant | `data.ts` 139-154 |
| `system.attributes.immunities` / `weaknesses` / `resistances` | arrays | no (`[]`) | LLM enum from IWR lists, or `[]` | `data.ts` 75-138 |
| `system.details.description` | HTML string | no (`""`) | LLM text (escaped, HTML) | `data.ts` 157; `system.pf2e.json` 52-54 |
| `system.details.level.value` | integer >= -1 | no (`1`) | GM input / level (table range -1..24) | `data.ts` 158-160 |
| `system.details.isComplex` | boolean | no (`false`) | LLM enum (simple/complex) | `data.ts` 161 |
| `system.details.disable` | string | no (`""`) | LLM prose; DC numbers from Table 2-13 by scale word; skill slugs from an LLM enum | `data.ts` 162; published samples |
| `system.details.routine` | string | no (`""`) | LLM prose (complex only) | `data.ts` 163 |
| `system.details.reset` | string | no (`""`) | LLM prose | `data.ts` 164 |
| `system.details.publication` | object | no (defaults) | constant (custom content: title `""`, license `OGL`, remaster `false`); policy choice | `model.ts` 24-45 |
| `system.saves.fortitude/reflex/will.value` | integer or null | yes (nullable, `null`) | Table 2-15 E/H/L save by scale word; `null` = no save | `data.ts` 38-41, 167-171 |
| `items[]` `action` → `system.actionType.value` | `reaction` / `free` / `passive` | (item) | LLM enum; published uses no `action` value | section 2.5 |
| `items[]` `action` → `description.value` | HTML | (item) | LLM prose; must be enricher-inert (PLAYBOOK invariant 5) | section 2 |
| `items[]` `melee` → `system.bonus.value` | integer | (item) | Table 2-16 S. Atk (simple) or C. Atk (complex) by scale word | Table 2-16; `Spinning Blade` sample |
| `items[]` `melee` → `system.damageRolls.<id>.damage` | dice string | (item) | Table 2-16 Simple or Complex damage (dice part) | Table 2-16; `2d6+6` sample |
| `items[]` `melee` → `system.damageRolls.<id>.damageType` | enum | (item) | LLM enum (e.g. `piercing`, `slashing`) | samples |
| `items[]` `melee` → `system.attackEffects.value` | slug[] | (item) | LLM enum or `[]` | `flesset-poison` sample |
| `items[]` `melee` → `system.traits.value`, `range`, `subjectToMAP` | arrays / null / boolean | (item) | constants (`[]`, `null`) | samples |

Derived, do not write: `hp.brokenThreshold`, `hasHealth`, `hp.negativeHealing`, the `object-immunities` entry, `skills.stealth`, the AC/save/stealth trace data, `initiative` (complex only), `actions`.

---

## Tables section (benchmark tables and their sources)

- **GM Core Building Hazards, Tables 2-13 to 2-16**: AoN Remaster GM Core, sections 3.3 to 3.6 above. All rows -1 to 24 are included.
- **Table 2-14 Minimum Proficiency**: AoN `ID=2868`, section 3.4.
- **GM Core XP Awards (pg. 56)**: pf2e gm-screen journal, section 4.2.
- **GM Core Encounter Budget (pg. 75)**: pf2e gm-screen journal, section 4.3.
- Not used: GM Core "DCs by Level" (gm-screen `pBS3DUjlzVuFgapv`), which covers skill DCs rather than hazard values; Gamemastery Guide Building Hazards (AoN `ID=1043`), a different edition.

---

## Gaps and risks

1. **Foundry core validation is unverified.** Required-field behavior on `Actor.create`, handling of unknown keys (`creatureType`, `statusEffects`, `saveDetail`, `hasHealth`, `tempmax`), and array defaults are Foundry core behavior. Nothing in the repo or the fetched pf2e sources proves them. No live test was run (PLAYBOOK invariant 7).
2. **AoN is not the printed book.** Table values come from a third-party site. The AC column labels "EAC | HAC | LAC" are AoN's transcription; the text uses E/H/L. Not checked against the print book.
3. **Legacy edition not checked.** AoN's Gamemastery Guide "Building Hazards" (`ID=1043`) is a different table set and was not fetched.
4. **master is stale.** Its HEAD (2025-05-31) predates the 8.5.0 tag. Master results are shown only as comparisons. v14-dev (8.6.1 dev) is the current line.
5. **Hazard scan covers two directories.** `packs/pf2e/hazards` and `packs/pf2e/pathfinder-dark-archive/hazards` were scanned. The browser filters `type === "hazard"` across every Actor pack, so other packs may hold hazard documents. UNVERIFIED that none do.
6. **Published values are mostly off-table.** Only about a third of AC, save, and stealth values match a table row (section 3.7). The tables are scales to choose from, not a fidelity target.
7. **Stealth value semantics.** The code proves `value` is a modifier with DC `value + 10` (section 1.4). AoN states the subtract-10 rule for complex hazards only. For simple hazards the same mapping is inferred, UNVERIFIED against the book.
8. **Scale words for hazards are extreme / high / low.** AoN: "The statistics for your hazard can have extreme, high, or low values." "Terrible" is borrowed from Building Creatures for lower values. The module's `moderate` scale does not appear in the hazard tables. This is a design note, not a code proposal.
9. **HP and hardness are ranges.** The module convention for creature HP is the midpoint (`tables.mjs` header). Published HP fits a range in 13 of 41 cases. Midpoint behavior for hazards is a choice, not a source fact.
10. **Disable DCs are not fully on-table.** Table 2-13 covers both Stealth and Disable (AoN text). Published disable DCs are not always table values; this was not counted in section 3.7.
11. **XP budget scaling differs** between pf2e's reward macro and GM Core for the low tier at party sizes other than 4 (section 4.4).
12. **`scripts/encounter.mjs` changed during the run.** `XP_BY_RELATIVE_LEVEL` is no longer exported; values unchanged. The repo HEAD moved too. Read-only; no action taken.
13. **Publication fields for custom content.** The choice of `OGL` and `remaster: false` is a module policy, not a source fact.
14. **Hazard trait list.** `CONFIG.PF2E.hazardTraits` spreads `creatureTraits`, `damageTraits`, and `magicTraditions` (`traits.ts` 1032-1035). The full set was not enumerated.
15. **Pointer for the NPC pipeline (not read in depth).** `scripts/builder.mjs` already renders `@Check[type:...|dc:${dcFor(scale)}]` from scale words (around lines 1080-1141). The hazard path would need the same pattern with E/H/L.
