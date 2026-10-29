/**
 * PC editor form contract. Pure: maps preview control names to pc-edit.mjs
 * edits and derives the current selection of each control from a plan. The
 * app loads catalogs, labels options, and renders; this module never touches
 * documents or actors.
 *
 * Control names: ancestry | heritage | background | class | classPath |
 * classPath.<bridge> | keyAbility | backgroundLore | feat.<slot> |
 * equipment.<index>.
 * An empty heritage or classPath value means "none" (cleared); any other empty
 * value is refused, so a placeholder option can never be applied.
 *
 * A class with one path bridge (Rogue, Investigator) uses the single
 * `classPath` control. A class with several (Wizard) uses one
 * `classPath.<bridge>` control per bridge, where <bridge> is the bridge
 * feature's name exactly ("classPath.Arcane School"); it maps to the edit
 * { field: "classPath", bridge, key } of pc-edit.mjs. The current selection of
 * a bridge comes from concept.classPathCandidates[bridge].
 */
import { PC_EDIT_CODES, classCastsSpells } from "./pc-edit.mjs";
import { pcIdentityKey } from "./pc-identity.mjs";

const NULLABLE = new Set(["heritage", "classPath"]);
const KEY_FIELDS = new Set(["ancestry", "background", "class"]);
const VALUE_FIELDS = new Set(["keyAbility", "backgroundLore", "archetypeChoice"]);
const FEAT_CONTROL = /^feat\.(\d+)$/;
const EQUIPMENT_CONTROL = /^equipment\.(\d+)$/;
const CLASS_PATH_CONTROL = /^classPath\.(.+)$/s;

function editError(control, detail) {
  const error = new Error(`PC edit (${control}): ${detail}`);
  error.code = PC_EDIT_CODES.INVALID;
  error.field = control;
  return error;
}

function requireText(control, value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw editError(control, "choose a value first");
  return text;
}

/**
 * Translate one submitted control value into a pc-edit.mjs edit.
 * Throws a PC_EDIT_INVALID error for an unknown control or a missing value.
 */
export function pcEditFromControl(control, value) {
  if (typeof control !== "string") throw editError(String(control), "unknown editor control");
  const feat = FEAT_CONTROL.exec(control);
  if (feat) return { field: "feat", slot: Number(feat[1]), key: requireText(control, value) };
  const equipment = EQUIPMENT_CONTROL.exec(control);
  if (equipment) return { field: "equipment", index: Number(equipment[1]), key: requireText(control, value) };
  const classPath = CLASS_PATH_CONTROL.exec(control);
  if (classPath) {
    const text = typeof value === "string" ? value.trim() : "";
    return { field: "classPath", bridge: classPath[1], key: text || null };
  }
  if (NULLABLE.has(control)) {
    const text = typeof value === "string" ? value.trim() : "";
    return { field: control, key: text || null };
  }
  if (KEY_FIELDS.has(control)) return { field: control, key: requireText(control, value) };
  if (VALUE_FIELDS.has(control)) return { field: control, value: requireText(control, value) };
  throw editError(control, "unknown editor control");
}

const keyOf = (ref) => pcIdentityKey({ ref });

/**
 * Current selection of every identity and catalog control, keyed by control
 * name. A field that is pending a new choice reports "" so the UI shows a
 * placeholder rather than a stale value.
 */
export function pcEditorSelections(plan) {
  const { concept, resolved } = plan;
  const pending = new Set((plan.pending ?? []).map((item) => item.field));
  const pick = (field, value) => (pending.has(field) ? "" : value);
  const selections = {
    ancestry: keyOf(concept.ancestryCandidate),
    heritage: keyOf(concept.heritageCandidate),
    background: keyOf(concept.backgroundCandidate),
    class: keyOf(concept.classCandidate),
    classPath: pick("classPath", keyOf(concept.classPathCandidate)),
    keyAbility: pick("keyAbility", concept.keyAbility ?? ""),
    backgroundLore: pick("backgroundLore", concept.backgroundLore ?? "")
  };
  if (concept.archetypeSpellcasting?.choice) selections.archetypeChoice = concept.archetypeSpellcasting.choice.value ?? "";
  for (const [bridge, ref] of Object.entries(concept.classPathCandidates ?? {})) {
    selections[`classPath.${bridge}`] = pick(`classPath.${bridge}`, keyOf(ref));
  }
  (resolved.feats ?? []).forEach((slot, index) => {
    selections[`feat.${index}`] = keyOf(slot?.entry);
  });
  (resolved.equipment ?? []).forEach((line, index) => {
    selections[`equipment.${index}`] = keyOf(line?.entry);
  });
  return selections;
}

/**
 * Class candidates the editor's class control offers: a candidate whose class
 * document is loaded (`classDocsByKey`, a Map keyed by pcIdentityKey) and does
 * not cast spells. The current class is kept whatever it is, so a chosen
 * caster stays visible. pc-edit.mjs refuses a caster edit as well.
 */
export function editableClassCandidates(candidates, classDocsByKey, currentKey) {
  return (Array.isArray(candidates) ? candidates : []).filter((candidate) => {
    const key = pcIdentityKey(candidate);
    if (key === currentKey) return true;
    const doc = classDocsByKey?.get(key);
    return Boolean(doc) && !classCastsSpells(doc);
  });
}

/** Editor control names whose drafts are stale after these invalidations. */
export function pcEditorInvalidatedControls(invalidated = []) {
  return invalidated.map((item) => {
    if (item.field === "feat") return `feat.${item.slot}`;
    return item.field === "classPath" && typeof item.bridge === "string" ? `classPath.${item.bridge}` : item.field;
  });
}
