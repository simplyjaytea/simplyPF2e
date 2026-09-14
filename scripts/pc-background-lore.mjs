const GUARD_PACK = "pf2e.backgrounds";
const GUARD_ID = "6UmhTxOQeqFnppxx";
const OPTIONS = Object.freeze([
  Object.freeze({ value: "legal", label: "Legal Lore" }),
  Object.freeze({ value: "warfare", label: "Warfare Lore" })
]);

function refOf(value) {
  return value?.ref ?? value;
}

function nativeIdentity(value) {
  const uuid = typeof value?.uuid === "string" && value.uuid ? value.uuid : "";
  const pack = typeof value?.pack === "string" ? value.pack : value?.pack?.collection;
  const id = value?.id ?? value?._id;
  const packed = pack && id ? `Compendium.${pack}.Item.${id}` : "";
  if (uuid && packed && uuid !== packed) return null;
  return uuid || packed;
}

function isGuard(value) {
  const ref = refOf(value);
  const candidateUuid = ref?.uuid;
  const candidate = ref?.packId && ref?._id ? `Compendium.${ref.packId}.Item.${ref._id}` : candidateUuid ?? "";
  const native = nativeIdentity(value);
  if (native === null) return false;
  if (native) return native === `Compendium.${GUARD_PACK}.Item.${GUARD_ID}`
    && (!candidate || candidate === native);
  return candidate === `Compendium.${GUARD_PACK}.Item.${GUARD_ID}`;
}

function guardSourceIsVerified(document) {
  if (!isGuard(document) || document?.type !== "background" || document?.name !== "Guard") return false;
  const system = document.system;
  const trained = system?.trainedSkills;
  const lore = trained?.lore;
  const description = String(system?.description?.value ?? "");
  return Array.isArray(trained?.value) && trained.value.length === 1 && trained.value[0] === "intimidation"
    && Array.isArray(lore) && (lore.length === 0 || (lore.length === 1 && lore[0] === "<Legal or Warfare> Lore"))
    && Array.isArray(system?.rules) && system.rules.length === 0
    && /trained in the Intimidation skill and the Legal Lore or Warfare Lore skill/i.test(description);
}

/** Return the bounded Lore choices for an exact, published background source. */
export function getBackgroundLoreOptions(candidateOrDocument) {
  return isGuard(candidateOrDocument) ? OPTIONS.map((option) => ({ ...option })) : [];
}

/** Resolve only the verified Guard choice to a concrete Lore name. */
// Source evidence: https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/packs/pf2e/backgrounds/guard.json
// stores trainedSkills.lore as []; current master stores ["<Legal or Warfare> Lore"]:
// https://raw.githubusercontent.com/foundryvtt/pf2e/master/packs/backgrounds/guard.json.
// The 8.5.0 Lore item shape is documented at:
// https://raw.githubusercontent.com/foundryvtt/pf2e/pf2e-8.5.0/src/module/item/lore.ts
export function resolveBackgroundLore(document, selection) {
  if (!document || document.type !== "background") throw new Error("simplypf2e | background Lore source is missing or invalid");
  if (nativeIdentity(document) === null) throw new Error("simplypf2e | background Lore source identity is conflicting");
  const guard = isGuard(document);
  if (!guard && selection !== undefined) {
    throw new Error("simplypf2e | background Lore selection requires the exact published Guard background");
  }
  if (guard && !guardSourceIsVerified(document)) {
    throw new Error("simplypf2e | Guard background Lore source is missing or changed");
  }
  if (!Array.isArray(document?.system?.trainedSkills?.lore)) {
    return [];
  }
  const lore = document.system.trainedSkills.lore;
  if (!guard) {
    if (lore.some((name) => typeof name !== "string" || !name.trim() || /[<>]/.test(name))) {
      throw new Error("simplypf2e | background Lore contains an unresolved placeholder");
    }
    return lore.filter((name) => name.trim());
  }
  // 8.5.0 stores Guard's selectable Lore as []; current master stores a
  // descriptive placeholder. Neither is a concrete Lore name.
  if (selection !== "legal" && selection !== "warfare") {
    throw new Error("simplypf2e | Guard requires an explicit Background Lore choice: Legal Lore or Warfare Lore");
  }
  return [selection === "legal" ? "Legal Lore" : "Warfare Lore"];
}

export const GUARD_BACKGROUND_REF = Object.freeze({ packId: GUARD_PACK, _id: GUARD_ID });
