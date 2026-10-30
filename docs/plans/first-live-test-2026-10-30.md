# First live test after v0.3.5.73–.88 — about one hour

Nothing from v0.3.5.73 onward has been loaded in Foundry. This list puts the riskiest parts first, so a break shows up early. Each step names the ledger row it closes ([acceptance ledger](../acceptance-ledger.md)). Note what you see; screenshots of anything wrong help most.

Setup: Foundry v14 with pf2e **8.5.0** (the declared minimum since v0.3.5.88). Use a test world or a backup. Spend: about 10 generations, roughly 100k tokens at v0.3.5.88 prompt sizes (provider counts may differ).

## 0. Install (5 min) — R01

1. **Foundry → Add-on Modules → Install Module**, paste `https://github.com/simplyjaytea/simplyPF2e/releases/latest/download/module.json`. Check that the installed version is the newest release.
2. Enable the module in the world. In **Game Settings → Configure Settings → SimplyPF2e**, open **AI Provider Setup**, save your connection and click **Save & Test**.
3. Open the browser console (F12) and keep it open. Any red `simplypf2e` error is a finding.

## 1. Bard muse (10 min) — N55, N56. Druid waits on this result.

1. In world settings, turn on **Ordinary multiclass archetypes**.
2. Actors sidebar → **SimplyPF2e** → **Character**. Level 6, spellcasting on. Open **Required choices** and set **Class** to Fighter; choose a concept that can qualify for Bard Dedication (Charisma +2). In the prompt ask for the Bard Dedication and Basic Bard Spellcasting. Verify those feats in the preview and select them in the editor if needed.
3. **Preview Plan**. Expect: a muse (Maestro by default) and a muse control in the editor; a signature-spell control listing the archetype's ranked spells. Change the muse and the signature spell.
4. **Create**. Pass if: **no** "pick a muse" dialog opens; the Bard Dedication on the sheet shows the muse you picked; a separate "Bard Archetype Spells" entry exists with 2 cantrips and ranks 1–2; exactly one spell is marked signature, and it is the one you picked.
5. If Occultism or Performance was already trained, one extra trained skill should appear instead.

## 2. Plain character and NPC (10 min) — R02/R03 shape, token check

1. **Character**: level 1 Fighter. **Generate & Create**. Pass if: ancestry, heritage, background and class are real items; the heritage belongs to the ancestry; feats sit in their slots; starting gear is real items.
2. **NPC**: a level-5 spellcaster. Pass if: strikes, spells and gear are on the sheet with no console error.
3. For both, note the token count the generator reports. Expected input size is about 6–9k for the Fighter and 7–9k for the NPC; anything far above 20k is a finding.

## 3. Encounter with a hazard (10 min) — N15

1. **Encounter**: party level 3, 4 PCs, moderate, theme that suits a trap. Leave **Enable experimental tools** on.
2. Pass if: the encounter creates its creatures and at most one hazard; the hazard sheet opens and shows stats; nothing errors.

## 4. Treasure parcel and looting (15 min) — N19–N28

1. Items directory → Item Forge → **Treasure parcel**, party level 5 (a parcel always goes to a Loot actor). Create it.
2. Pass if: one Loot actor holds coins (platinum for whole 100s of gp), up to three valuables and the permanent items; the preview total matches.
3. Drag the Loot actor onto a scene. Log in as a **player** account (second browser or private window) and open the token. Pass if: the player can see and take items without seeing the actor in the Actors sidebar.
4. Optional (N43–N45): turn on **Items with rules go to a world folder**, make another parcel, and check the world folder named after it.

## 5. Wizard and Forge (10 min) — N50–N53, R15–R18

1. **Character**: level 8; open **Required choices** and set **Class** to Wizard. Pass if: school, thesis and spellbook look right, and **Improved Familiar Attunement** is present when the thesis grants it (it depends on a link form never seen live).
2. Item Forge: one runed weapon at level 8. Pass if: runes and price look right on the sheet.

## Stop and report

Report per section: pass, fail (what you saw), or skipped. A fail in section 1 holds the Druid archetype; a fail in section 4 step 3 means players cannot loot parcels. Rows that pass get recorded as PASS with the version, date and world.
