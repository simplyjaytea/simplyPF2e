/**
 * Localization keys for the hazard generator, by field name. The preview and
 * the gate notice read these keys, so each string literal is visible to the
 * integrity gate. Pure data: no Foundry globals.
 */
const keys = {};
keys.mode = "SIMPLYPF2E.Hazard.Mode";
keys.level = "SIMPLYPF2E.Hazard.Level";
keys.complexitySimple = "SIMPLYPF2E.Hazard.Complexity.Simple";
keys.complexityComplex = "SIMPLYPF2E.Hazard.Complexity.Complex";
keys.stealth = "SIMPLYPF2E.Hazard.Preview.Stealth";
keys.disable = "SIMPLYPF2E.Hazard.Preview.Disable";
keys.defenses = "SIMPLYPF2E.Hazard.Preview.Defenses";
keys.reaction = "SIMPLYPF2E.Hazard.Preview.Reaction";
keys.routine = "SIMPLYPF2E.Hazard.Preview.Routine";
keys.reset = "SIMPLYPF2E.Hazard.Preview.Reset";
keys.xp = "SIMPLYPF2E.Hazard.Preview.XP";
keys.gated = "SIMPLYPF2E.Hazard.Gated";

/** Field name to localization key for the hazard preview and gate notice. */
export const HAZARD_LABEL_KEYS = Object.freeze(keys);
