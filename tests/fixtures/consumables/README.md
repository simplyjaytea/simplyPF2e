# Consumable fixtures

Fetched on 2026-10-26 from the official PF2e repository, ref `pf2e-8.5.0` (tag). Unchanged except for the files named below.

- [scroll-of-1st-rank-spell.json](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/equipment/scroll-of-1st-rank-spell.json): blank scroll template, rank 1 (`_id` `RjuupS9xyXDLgyIr`). Same `_id` on master.
- [magic-wand-4th-rank-spell.json](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/equipment/magic-wand-4th-rank-spell.json): blank wand template, rank 4 (`_id` `Sn7v9SsbEDMUIwrO`, 700 gp, level 9 on 8.5.0).
- [wand-of-the-spider-4th-rank-spell.json](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/equipment/wand-of-the-spider-4th-rank-spell.json): published 8.5.0 wand with an embedded spell (Web, `_id` `szQb3PZpYfwcjXYR`). It is a bespoke item with its own price, level and description, so only its category, usage, uses, traits, rarity and embedded spell are compared. No published scroll with an embedded spell exists on 8.5.0 or master (research record section 7.1).
- [heal.json](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/spells/spells/rank-1/heal.json): real spell, rank 1 (`_id` `rfZpqmj0AIIdkVIs`). Its UUID is `Compendium.pf2e.spells-srd.Item.rfZpqmj0AIIdkVIs`.

The three equipment files are byte-identical to the research downloads of the same raw URLs. heal.json is byte-identical to the same path in the pf2e-8.5.0 tag archive (codeload.github.com, tarball fetched 2026-10-26).

The tests set `_stats.compendiumSource` on the templates to the pinned UUID, which is what `toItemData` records in the builder. The fixture files themselves carry no `_stats`.

- [cantrip-deck-5-pack.json](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/equipment/cantrip-deck-5-pack.json): unchanged template (`_id` `tLa4bewBhyqzi6Ow`).
- [light.json](https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/spells/spells/cantrip/light.json): unchanged spell (`_id` `WBmvzNDfpwka3qT4`).
