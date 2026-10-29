Real pf2e 8.5.0 documents, copied unchanged from `packs/pf2e/equipment/` at tag `pf2e-8.5.0`
(fetched 2026-10-29). Fixtures for tests/parcel-runed.test.mjs and the parcel v3 special-wand tests.

Runed bases (ordinary, non-specific, no runes, no material, no grade, no Rule Elements):
- longsword: weapon, level 0, 1 gp, versatile-p, usage held-in-one-hand
- breastplate: armor, level 0, 8 gp, no usage field (absent in the document)

Fundamental rune tiers (level, price and rarity match src/module/item/physical/runes.ts):
- weapon potency: weapon-potency-1 (level 2, 35 gp), weapon-potency-2 (10, 935 gp), weapon-potency-3 (16, 8935 gp)
- weapon striking: striking (4, 65 gp), striking-greater (12, 1065 gp), striking-major (19, 31065 gp)
- armor potency: armor-potency-1 (5, 160 gp), armor-potency-2 (11, 1060 gp), armor-potency-3 (18, 20560 gp)
- armor resilient: resilient (8, 340 gp), resilient-greater (14, 3440 gp), resilient-major (20, 49440 gp)

Special wands (equipment with the wand trait):
- wand-of-continuation-1st-rank-spell: level 5, common, no rules (eligible at level 5)
- wand-of-widening-1st-rank-spell: level 4, three Rule Elements (rejected)
- cyrusian-wand-1st-rank-spell: level 4, rare, mythic trait (rejected by the safety set)
- wand-of-mercy-1st-rank: level 4, common, no rules (eligible at level 4, never level 3)
