# HANDOFF.md — live session baton

Read this first, then CLAUDE.md. Historical audit and QA evidence is preserved in HISTORY.md.

## Current session — 2026-09-04

- Public source is `origin/main` `7573885` (PR #94) / **v0.3.5.54**. This session did not merge or release.
- Active branch: `cursor/presets-remaster-04a6`. Do not merge to `main`.
- Shipped on this branch:
  1. Stock presets are the 23 Remaster PF2e classes (Alchemist through Wizard), verified against PF2e 8.4.1 `packs/pf2e/classes/*.json` (`publication.remaster === true`). Preset `id`s are module-local flavor keys, not pack UUIDs and not bound to `COMPLETE_PC_CLASS_SLUGS`.
  2. Picker: "— No preset —" first, then Standard optgroup, then Custom optgroup only when world-saved presets exist.
  3. Dropped thematic stock: cultivator, fire-mage, assassin, healer, tank, skill-monkey (prompts, examples, lang keys).
  4. Trust line under the picker: Standard Magus/Witch/etc. are flavor guides; complete-only Character remains Fighter / Rogue / Investigator.
  5. Fresh default stays None (injecting Alchemist into every monster would be bad UX). A vanished last-used id (retired thematic or deleted custom) falls back to first Standard (`alchemist`).
  6. Manage Presets remains custom-only. README Presets section no longer claims 18 built-ins / six themes.
- 8.4.1 class pack also contains Animist, Exemplar, Commander, Guardian, Necromancer, Runesmith (`remaster: true`, later books). Standard follows JT's locked 23, not every JSON in that folder.
- Local verification: `node --check` on touched `.mjs`; all `scripts/*.test.mjs` (new `presets.catalog.test.mjs`).
- No VPS mutation. Live Foundry picker QA is still required. Item forge remains unverified.

## Next step

Independent review (Forge: verify class catalog citation and that ids are not pack-bound; Lexicon only if someone later binds slugs/schema; Prism: README/picker optgroup + trust line; Sentinel: fail-closed complete-only claim). Do not merge to `main` from this agent. After publication, live-check the Advanced preset picker (None / Standard / empty-Custom omitted / Custom when saved) and that a Magus preset still cannot complete-only a PC. Parked: Free Archetype graph, Wizard spellbook/curriculum, widening COMPLETE_PC.
