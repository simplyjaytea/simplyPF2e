# Parcel: Rule Element items go to a world folder (2026-10-30)

Workstream W1 of the 2026-10-30 feature wave. Branch `feat/re-folder`, base `integrate/2026-10-30@baeb0a3`. Everything below is behind `experimentalTools` (the Forge parcel kind already is). Nothing here has been run in Foundry or against a provider.

## 1. What changed and why

Parcel permanent slots skipped every published item whose `system.rules` was non-empty. That excluded 621 of 1,252 eligible items (see [parcel-v2](parcel-v2-2026-10-29.md)), because a loot actor cannot host Rule Elements. The GM can now opt in with **"Items with rules go to a world folder"** (default off).

With the option off, every check is what it was. With it on:

- **Eligibility.** A rule-bearing published equipment item becomes a permanent-slot candidate. Level, rarity, the magical trait, the safety trait set, attachments and price all still apply. Wands and runed bases keep their own rules-free checks.
- **Create.** The loot actor gets everything that has no Rule Elements, as before. Each rule-bearing permanent is written as an unchanged world `Item` (a clone of the compendium document, `_stats.compendiumSource` kept) in a new folder named after the parcel. The folder is created before the actor, so a failure can remove it.
- **Verification.** Foundry's returned world items must match what was sent: the same count and order, the same names, the same number of Rule Elements, and each inside the new folder. A mismatch blocks the create.
- **Revalidation.** Every built permanent source is checked again at Create. A rule-bearing source passes only while the option that admitted it is still on (the flag is recorded with the preview).
- **Rollback.** If the world items, the folder or the loot actor fail, the world items are deleted first, then the folder, then (for the actor) the existing `rollbackCreatedActor`. A survivor is named in the error.
- **Preview.** Each permanent row shows its destination (loot actor or world folder). A section lists the world items with their prices and a totals line: loot actor, world folder, and the built total. The loot actor and world folder amounts are computed independently and must add to the built total. A localized line tells the GM to drag the folder items onto the PCs.
- **Merchant.** The Merchant sheet is unchanged. The folder is created in the same write, next to it.

## 2. Foundry and pf2e 8.5.0 sources

All quotes are from `foundryvtt/pf2e` at tag `pf2e-8.5.0`, fetched with `raw.githubusercontent.com` in this session.

1. **Loot actors never host Rule Elements.** `src/module/actor/loot/document.ts` lines 33–37:
   > `/** Loot actors can never benefit from rule elements */`
   > `override get canHostRuleElements(): boolean { return false; }`
2. **Loot actors discard them.** The same file, lines 86–89:
   > `/** Never process rules elements on loot actors */`
   > `override prepareDerivedData(): void { this.rules = []; super.prepareDerivedData(); }`
3. **Items only prepare Rule Elements when an actor can host them.** `src/module/item/base/document.ts` lines 304–307:
   > `prepareRuleElements(options) { if (!this.actor) throw ErrorPF2e("Rule elements may only be prepared from embedded items"); return (this.rules = this.actor.canHostRuleElements ? RuleElements.fromOwnedItem(...) : []); }`
   A world item is therefore stored with its `system.rules` as data and is not prepared until it is embedded in an actor that can host rules. That is why an unchanged clone in the folder keeps its Rule Elements (invariant 2), and why the loot actor cannot.
4. **Folder type and the item's folder field.** `types/foundry/common/documents/folder.d.mts` lines 48–49:
   > `/** The document type which this Folder contains, from CONST.FOLDER_DOCUMENT_TYPES */`
   > `type: fields.StringField<FolderDocumentType, ...>`
   and `types/foundry/common/documents/item.d.mts` lines 81–82:
   > `/** The _id of a Folder which contains this Item */`
   > `folder: fields.ForeignDocumentField<BaseFolder>;`
   The folder is created with `Folder.create({ name, type: "Item" })`. The Item's `folder` is set to the folder's id in the source. The existing generator already creates an Actor folder with the same call shape (`generator-app.mjs`, encounter create).

Limit of these quotes: Foundry v14's runtime `Folder.create`/`Item.create` source is not public. Pf2e's bundled declarations are the closest published evidence, and the runtime behaviour is unverified. See the native rows.

## 3. Records and tests

Code:
- `scripts/parcel-folder.mjs` (new): `hasRuleElements`, `destinationFor`, `splitPermanents`, `folderItemProblem`. Pure, no Foundry globals.
- `scripts/treasure-permanent.mjs`: `permanentDocumentProblem` and `permanentSourceProblem` take `{ allowRules }`. Without it, the rules check is the same as before.
- `scripts/compendium.mjs`: `getPermanentEquipmentCandidates` takes `allowRules` (default false).
- `scripts/itemforge-app.mjs`: the option is read from the form (gated), offered to the pool, checked at build and at Create, split into destinations, written folder-first, verified, and rolled back. The preview gains the destination and the folder section.
- `templates/itemforge.hbs`, `lang/en.json`: the checkbox, the preview section, the row destination, and the new `Parcel.RuleFolder` strings.

Tests:
- `tests/parcel.reFolder.test.mjs` (new): destinations, the split, every verification code, the gate on the real Aerial Cloak fixture (two Rule Elements, level 3), and the Create-time check.
- `tests/parcel.permanentPool.test.mjs`: the pool admits the cloak only with `allowRules`, and the default still excludes it.
- `tests/itemforge-app.parcel.test.mjs`: the Forge transaction. Option off: the pool admits nothing rule-bearing, nothing is written. Option on: folder and items created, the actor holds no rule-bearing item, the totals add exactly, the folder comes first. Rollbacks: the item create fails; the actor fails verification; a folder that will not delete is named as a survivor. Revalidation refuses a changed source before any write. Verification refuses a renamed world item. Merchant keeps the folder next to the actor. A closed gate writes nothing.
- `tests/itemforge-app.cantripDeck.test.mjs`: the mock table gains the new helpers (the module is now imported by that harness too).

## 4. Revert checks

Each mutation was applied to the file with a backup, the named test was run, and the file was restored and compared. All 11 failed the test.

| # | Mutation | Test that failed |
|---|---|---|
| R1 | Candidate pool ignores `allowRules` | `parcel.permanentPool` (option on admits the cloak) |
| R2 | Document rules gate removed | `parcel.reFolder` (option off refuses the cloak) |
| R3 | Forge pool not asked for rule-bearing items | Forge harness (option on admits them) |
| R4 | Build-time check ignores the option | Forge harness (cloak fills its slot) |
| R5 | Revalidation ignores the option | Forge harness (option on create succeeds) |
| R6 | Folder not created | Forge harness (folder created once, typed Item) |
| R7 | Created-item verification removed | Forge harness (mismatched item reported) — fails with a TypeError when `ctx.error` is null, which is the same kill |
| R8 | Rollback disabled | Forge harness (folder removed) |
| R9 | Destination always loot | Forge harness (row names its destination) |
| R10 | World items not deleted on rollback | Forge harness (world item removed after actor rollback) |
| R11 | Folder total zero | Forge harness (folder subtotal is the cloak's real price) |

Files were restored after every run (`cmp` check: all four intact).

## 5. Gate and drift

- Gate: `node tools/check.mjs </dev/null` exit 0, 162 test files, 669 localization keys, 0 unused keys (`Integrity passed: 433 imports, 1093 exports, 15 templates, 669 localization keys; 0 unused keys`). The first run failed on the cantrip-deck harness, which lacked the new mock names; fixed and re-run.
- Drift: see the report.

## 6. Gaps and decisions

- **Foundry runtime is unverified.** Folder and world-item creation, folder deletion semantics, and a GM dragging a world item onto a PC are all native rows (N43–N45). Nothing was run in Foundry.
- **A partial batch create (closed, `fix/n44-rollback`).** The world items were created in one `Item.create(array)` call (`itemforge-app.mjs` `#createLootDraft`), so a call that threw after writing some items returned nothing and the rollback, which only knew returned items, left them in the world, where a retry duplicated them. Items are now created one per call, each recorded as it returns, and `#rollbackRuleFolder` also deletes anything still in the new folder's `contents` (an item written by a call that then threw). Tests: `itemforge-app.parcel.test.mjs`, a batch that dies midway and a create that writes then throws, then a retry holding exactly the planned items. Native check: N44 (induce a failure).
- **README.** The Lead asked for PLAYBOOK parcel limits only. The README parcel text (lines 166 and 241) is owned by the W0 release-fixes branch, so this branch does not edit README. The feature line needs adding at merge.
- **The option is not a per-item choice.** It admits all rule-bearing permanent candidates for that parcel. A GM who wants only some of them has to regenerate or edit the preview.
- **Ownership.** The world items are not on the loot actor, so a player cannot loot them from the token; the GM drags them. The preview line says so.
- **Two design choices made here, for review:** the folder is created before the actor (so an actor failure has something to clean up), and the revalidation flag is taken from the preview rather than the live option, so a toggle after Generate does not re-admit or drop items silently.
