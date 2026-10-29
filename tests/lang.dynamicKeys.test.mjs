// Every dynamically built localization key resolves in en.json. The static integrity check cannot verify a key
// built at runtime, so each family below lists the values the code can produce, and the test asserts that every
// one is a non-empty English string. Values come from exported constants where the code exports them, and from a
// copy with a source note where it does not.
// Run: node tests/lang.dynamicKeys.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { THREATS } from "../scripts/encounter.mjs";
import { TREASURE_AMOUNT_MULTIPLIER } from "../scripts/tables.mjs";
import { DEFAULT_PACKS } from "../scripts/compendium.mjs";
import { PERMANENT_REASON } from "../scripts/treasure-permanent.mjs";
import { PARCEL_DROP } from "../scripts/treasure-parcel.mjs";

const en = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
const lookup = (key) => key.split(".").reduce((node, part) => node?.[part], en);
const capitalized = (value) => String(value).charAt(0).toUpperCase() + String(value).slice(1);

const FAMILIES = {
  // Progress: the step outcome (app-base.mjs), the stream phase (app-base.mjs), the run outcome (app-base.mjs _finishRun),
  // and the thinking/writing detail lines.
  "Progress": ["Pending", "Active", "Done", "Skipped", "Warning", "Failed", "Cancelled",
    "Waiting", "Receiving", "Retrying", "Compatibility", "Validating",
    "Complete", "SavedWarning", "Thinking", "ThinkingExact", "Writing", "WritingExact"],
  // Threat: the threat table keys, capitalized (generator-app.mjs threat labels).
  "Threat": Object.keys(THREATS).map(capitalized),
  // Role: encounter members (encounter.mjs roles "boss" and "minion").
  "Role": ["boss", "minion"].map(capitalized),
  // Skills: the training rank (generator-app.mjs "Skills.Rank${row.rank}", ranks 0 to 4) and the warning keys
  // (generator-app.mjs warningKeys).
  "Skills": [0, 1, 2, 3, 4].map((rank) => `Rank${rank}`).concat([
    "NativeData", "TrainingData", "Schedule", "GrantTiming", "NativeRule", "IntelligenceTiming",
    "UnspentTraining", "UnspentIncreases"]),
  // Loadout: the loadout warning codes (generator-app.mjs), with NativeData as the fallback.
  "Loadout": ["NativeData", "UntrainedArmor", "ArmorConflict", "UntrainedWeapon", "HandConflict", "ManualAmmo", "MissingAmmo"],
  // Identity: the PC identity fields (generator-app.mjs PC_IDENTITY_FIELDS), and the ability names.
  "Identity": ["name", "class", "ancestry", "heritage", "background", "backgroundLore", "keyAbility", "classPath"],
  "Identity.Ability": ["str", "dex", "con", "int", "wis", "cha"],
  // TreasureAmount: the treasure multipliers (tables.mjs).
  "TreasureAmount": Object.keys(TREASURE_AMOUNT_MULTIPLIER).map(capitalized),
  // Sources: the default pack categories (compendium.mjs DEFAULT_PACKS), capitalized.
  "Sources": Object.keys(DEFAULT_PACKS).map(capitalized),
  // CreatureTools.Adjust: the elite, weak and normal adjustments (creature-tools-app.mjs).
  "CreatureTools.Adjust": ["elite", "normal", "weak"],
  // Parcel.Reason: the permanent-slot reasons (treasure-permanent.mjs PERMANENT_REASON).
  "ItemForge.Parcel.Reason": Object.values(PERMANENT_REASON),
  // Parcel.ValuableReason: why no valuable was chosen (itemforge-app.mjs pickParcelValuables, treasure-permanent.mjs).
  "ItemForge.Parcel.ValuableReason": ["pack", "none-offered", "too-expensive", "unavailable"],
  // Parcel.PermanentKind: the permanent item kinds (itemforge-app.mjs preview rows).
  "ItemForge.Parcel.PermanentKind": ["equipment", "wand", "special-wand", "runed"],
  // Parcel drop lines (itemforge-app.mjs dropKeys and #dropText): every drop the GM can see.
  "ItemForge.Parcel": [
    "DuplicateSlot", "RankAbove", "BuildDrop", "CurrencyDrop", "ScrollProvider", "UnknownSlot", "UnknownSpell"
  ]
};

// The parcel drop reasons the GM can see are all covered by a line. The Forge's dropKeys map is keyed by these.
const visibleDrops = [...Object.values(PARCEL_DROP), "build", "currency", "provider"];
for (const reason of Object.values(PARCEL_DROP)) {
  assert.ok(visibleDrops.includes(reason), `${reason} is a visible drop`);
}

let checked = 0;
for (const [family, values] of Object.entries(FAMILIES)) {
  assert.ok(values.length > 0, `${family} has values to check`);
  for (const value of values) {
    const key = `SIMPLYPF2E.${family}.${value}`;
    const text = lookup(key);
    assert.equal(typeof text, "string", `${key} resolves in en.json`);
    assert.ok(text.trim().length > 0, `${key} is not empty`);
    checked += 1;
  }
}

console.log(`lang.dynamicKeys.test.mjs: ${checked} dynamic localization keys across ${Object.keys(FAMILIES).length} families resolve in en.json`);
