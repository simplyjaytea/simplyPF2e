/**
 * Exact PC editing contract (C05). Pure over plan objects: every edit returns a
 * new plan and never mutates its input, never writes an actor, and completion
 * is validated in memory. Each choice must be an offered, issued candidate.
 * Anything an edit invalidates is reported in `invalidated` and recorded in
 * `pending`, which blocks completion until the user re-picks. Spell editing is
 * deferred: spell-affecting edits are refused and no spell edit exists.
 *
 * Plan: { concept, resolved, pending: [{ field, reason }] }
 *   `concept` is the generator's normalized concept (with requiredIdentity);
 *   `resolved` carries ancestryDoc, heritageDoc, backgroundDoc, backgroundLore,
 *   classDoc, featSlots, feats (index-aligned with featSlots), equipment
 *   (index-aligned with concept.equipment), loot, spells, focusSpells.
 *
 * Edits:
 *   { field: "ancestry" | "background" | "class", key }   key = "packId:_id" of an offered candidate
 *   { field: "heritage", key: string | null }             null = no heritage
 *   { field: "classPath", key: string | null }            null clears the path
 *   { field: "keyAbility", value }                        must be a key ability of the class
 *   { field: "backgroundLore", value }                    must be an option of the background
 *   { field: "feat", slot, key }                          slot = zero-based index into featSlots
 *   { field: "equipment", index, key }                    index into concept.equipment
 *
 * Services (injectable for tests): load(ref), classPaths(classDoc),
 * recompute(concept), resolveEquipmentLine(concept), equipmentValue(equipment).
 */
import { getDocument, isIssuedCandidate, toItemData } from "./compendium.mjs";
import { resolvePCConcept, heritageMatchesAncestry } from "./pc-builder.mjs";
import { resolveEquipment, equipmentValueGp } from "./builder.mjs";
import { getBackgroundLoreOptions, resolveBackgroundLore } from "./pc-background-lore.mjs";
import { assertPCIdentity, pcIdentityKey } from "./pc-identity.mjs";
import { getClassPathCandidates } from "./class-paths.mjs";
import { completionManifest } from "./completion.mjs";
import { supportedClassCandidates } from "./pc-support.mjs";
import { slugify } from "./text.mjs";

export const PC_EDIT_CODES = Object.freeze({
  INVALID: "PC_EDIT_INVALID",
  UNSUPPORTED: "PC_EDIT_UNSUPPORTED",
  DEFERRED: "PC_EDIT_DEFERRED",
  PENDING: "PC_EDIT_PENDING",
  UNRESOLVED: "PC_EDIT_UNRESOLVED",
  DUPLICATE: "PC_EDIT_DUPLICATE"
});

export const PC_EDIT_FIELDS = Object.freeze([
  "ancestry", "heritage", "background", "class", "classPath",
  "keyAbility", "backgroundLore", "feat", "equipment"
]);

const DOC_TYPE = Object.freeze({ ancestry: "ancestry", heritage: "heritage", background: "background", class: "class" });
const NULLABLE = new Set(["heritage", "classPath"]);
const ABILITIES = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);
const SPELL_FIELDS = Object.freeze(["spells", "focusSpells", "spellcasting"]);

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const refKey = (ref) => pcIdentityKey({ ref });
const candidateKey = (candidate) => pcIdentityKey(candidate);

function fail(code, field, detail) {
  const error = new Error(`PC edit (${field}): ${detail}`);
  error.code = code;
  error.field = field;
  throw error;
}

const DEFAULT_SERVICES = Object.freeze({
  load: (ref) => getDocument(ref),
  classPaths: (classDoc) => getClassPathCandidates(toItemData(classDoc)),
  recompute: async (concept) => {
    const resolved = await resolvePCConcept(concept, { exactContent: true });
    return {
      ancestryDoc: resolved.ancestryDoc,
      heritageDoc: resolved.heritageDoc,
      backgroundDoc: resolved.backgroundDoc,
      backgroundLore: resolved.backgroundLore,
      classDoc: resolved.classDoc,
      featSlots: resolved.featSlots
    };
  },
  resolveEquipmentLine: (concept) => resolveEquipment(concept, { exactContent: true }),
  equipmentValue: (equipment) => equipmentValueGp(equipment)
});

function assertPlan(plan) {
  if (!isObject(plan?.concept) || !isObject(plan?.resolved)) {
    fail(PC_EDIT_CODES.INVALID, "plan", "plan must carry concept and resolved");
  }
  const { feats, featSlots, equipment } = plan.resolved;
  if (!Array.isArray(feats) || !Array.isArray(featSlots) || feats.length !== featSlots.length) {
    fail(PC_EDIT_CODES.INVALID, "plan", "resolved feats must align with resolved featSlots");
  }
  if (!Array.isArray(equipment) || !Array.isArray(plan.concept.equipment)
    || equipment.length !== plan.concept.equipment.length) {
    fail(PC_EDIT_CODES.INVALID, "plan", "resolved equipment must align with concept equipment");
  }
}

function clonePlan(plan) {
  const concept = { ...plan.concept, equipment: plan.concept.equipment.map((line) => ({ ...line })) };
  if (isObject(plan.concept.requiredIdentity)) concept.requiredIdentity = { ...plan.concept.requiredIdentity };
  return {
    concept,
    resolved: {
      ...plan.resolved,
      feats: plan.resolved.feats.map((pick) => ({ ...pick })),
      equipment: plan.resolved.equipment.map((line) => ({ ...line }))
    },
    pending: (plan.pending ?? []).map((item) => ({ ...item }))
  };
}

function offered(list, key, field) {
  const found = (Array.isArray(list) ? list : []).find((candidate) => candidateKey(candidate) === key);
  if (!found || !isIssuedCandidate(found.ref)) {
    fail(PC_EDIT_CODES.INVALID, field, "choice is not an offered exact candidate");
  }
  return found;
}

function assertNoSpellState(next, field) {
  const { concept, resolved } = next;
  const present = Boolean(concept.spellcasting)
    || (concept.focusSpells ?? []).length > 0
    || (resolved.spells ?? []).length > 0
    || (resolved.focusSpells ?? []).length > 0;
  if (present) fail(PC_EDIT_CODES.DEFERRED, field, "character has spells; spell-affecting edits are deferred");
}

const isPending = (next, field) => next.pending.some((item) => item.field === field);

function setPending(next, field, reason) {
  next.pending = next.pending.filter((item) => item.field !== field);
  if (reason) next.pending.push({ field, reason });
}

function deleteRequired(concept, field) {
  if (isObject(concept.requiredIdentity)) delete concept.requiredIdentity[field];
}

function currentKey(concept, field) {
  return refKey(field === "classPath" ? concept.classPathCandidate : concept[`${field}Candidate`]);
}

function writeChoice(concept, field, chosen) {
  if (field === "classPath") {
    if (chosen) {
      concept.classPath = chosen.name;
      concept.classPathCandidate = chosen.ref;
    } else {
      delete concept.classPath;
      delete concept.classPathCandidate;
    }
    return;
  }
  concept[field] = chosen ? chosen.name : null;
  concept[`${field}Candidate`] = chosen ? chosen.ref : null;
}

// Required identity is what the generator and createCharacterActor read back.
// classPath is always declared there (stageClassPaths reads requiredIdentity).
function syncRequired(concept, field, chosen) {
  if (field === "classPath") {
    if (chosen) concept.requiredIdentity = { ...(concept.requiredIdentity ?? {}), classPath: chosen };
    else deleteRequired(concept, "classPath");
    return;
  }
  if (isObject(concept.requiredIdentity) && Object.hasOwn(concept.requiredIdentity, field)) {
    concept.requiredIdentity[field] = chosen;
  }
}

function dropField(next, field, reason, invalidated) {
  const { concept, resolved } = next;
  if (field === "heritage") {
    concept.heritage = null;
    concept.heritageCandidate = null;
    resolved.heritageDoc = null;
  } else if (field === "classPath") {
    delete concept.classPath;
    delete concept.classPathCandidate;
  } else if (field === "backgroundLore") {
    delete concept.backgroundLore;
  }
  deleteRequired(concept, field);
  invalidated.push({ field, reason });
}

async function settleHeritage(next, deps, invalidated) {
  const { concept, resolved } = next;
  if (!concept.heritage) return;
  const heritageDoc = await deps.load(concept.heritageCandidate);
  if (heritageDoc?.type === "heritage" && heritageMatchesAncestry(heritageDoc, resolved.ancestryDoc)) return;
  dropField(next, "heritage", `"${concept.heritage}" does not belong to the new ancestry`, invalidated);
  setPending(next, "heritage", "re-pick a heritage for the new ancestry");
}

function settleBackgroundLore(next, invalidated) {
  const { concept, resolved } = next;
  if (concept.backgroundLore !== undefined && concept.backgroundLore !== null) {
    dropField(next, "backgroundLore", "background changed; the lore choice must be re-made", invalidated);
  }
  const needsLore = getBackgroundLoreOptions(resolved.backgroundDoc).length > 0;
  setPending(next, "backgroundLore", needsLore ? "background requires a lore choice" : null);
}

function settleClass(next, invalidated) {
  const { concept, resolved } = next;
  if (concept.classPath) {
    dropField(next, "classPath", "class changed; the path belongs to the previous class", invalidated);
  }
  const legal = resolved.classDoc?.system?.keyAbility?.value ?? [];
  if (legal.includes(concept.keyAbility)) {
    setPending(next, "keyAbility", null);
    return;
  }
  dropField(next, "keyAbility", `"${concept.keyAbility}" is not a key ability of ${resolved.classDoc?.name}`, invalidated);
  setPending(next, "keyAbility", `re-pick a key ability for ${resolved.classDoc?.name}`);
}

async function applyCatalogEdit(next, edit, catalogs, deps, changed, invalidated) {
  const { field, key } = edit;
  const { concept, resolved } = next;
  if (key !== null && typeof key !== "string") fail(PC_EDIT_CODES.INVALID, field, "key must be a candidate key or null");
  if (key === null && !NULLABLE.has(field)) fail(PC_EDIT_CODES.INVALID, field, "this field cannot be cleared");
  if ((key ?? "") === currentKey(concept, field) && !isPending(next, field)) return;
  assertNoSpellState(next, field);

  let chosen = null;
  let doc = null;
  if (key !== null) {
    const list = field === "classPath" ? await deps.classPaths(resolved.classDoc) : catalogs[field];
    chosen = offered(list, key, field);
    if (field !== "classPath") {
      doc = await deps.load(chosen.ref);
      if (doc?.type !== DOC_TYPE[field]) {
        fail(PC_EDIT_CODES.UNRESOLVED, field, `"${chosen.name}" did not load as a ${DOC_TYPE[field]}`);
      }
      if (field === "heritage" && !heritageMatchesAncestry(doc, resolved.ancestryDoc)) {
        fail(PC_EDIT_CODES.INVALID, field, `"${chosen.name}" does not belong to the current ancestry`);
      }
      if (field === "class" && supportedClassCandidates([chosen]).length === 0) {
        fail(PC_EDIT_CODES.INVALID, field, `"${chosen.name}" is not a supported PC class`);
      }
    }
  }

  writeChoice(concept, field, chosen);
  syncRequired(concept, field, chosen);
  if (field !== "classPath") resolved[`${field}Doc`] = doc;
  setPending(next, field, null);
  changed.push(field);

  if (field === "ancestry") await settleHeritage(next, deps, invalidated);
  if (field === "background") settleBackgroundLore(next, invalidated);
  if (field === "class") settleClass(next, invalidated);
}

function applyKeyAbility(next, value, changed) {
  const { concept, resolved } = next;
  if (!ABILITIES.includes(value)) fail(PC_EDIT_CODES.INVALID, "keyAbility", "unknown ability");
  const legal = resolved.classDoc?.system?.keyAbility?.value ?? [];
  if (!legal.includes(value)) {
    fail(PC_EDIT_CODES.INVALID, "keyAbility", `${value} is not a key ability of ${resolved.classDoc?.name}`);
  }
  if (concept.keyAbility === value && !isPending(next, "keyAbility")) return;
  assertNoSpellState(next, "keyAbility");
  concept.keyAbility = value;
  if (isObject(concept.requiredIdentity) && Object.hasOwn(concept.requiredIdentity, "keyAbility")) {
    concept.requiredIdentity.keyAbility = value;
  }
  setPending(next, "keyAbility", null);
  changed.push("keyAbility");
}

function applyBackgroundLore(next, value, changed) {
  const { concept, resolved } = next;
  const options = getBackgroundLoreOptions(resolved.backgroundDoc).map((option) => option.value);
  if (!options.includes(value)) fail(PC_EDIT_CODES.INVALID, "backgroundLore", "not an option of the current background");
  try {
    resolveBackgroundLore(resolved.backgroundDoc, value);
  } catch (error) {
    fail(PC_EDIT_CODES.INVALID, "backgroundLore", error.message.replace(/^simplypf2e \| /, ""));
  }
  if (concept.backgroundLore === value && !isPending(next, "backgroundLore")) return;
  assertNoSpellState(next, "backgroundLore");
  concept.backgroundLore = value;
  concept.requiredIdentity = { ...(concept.requiredIdentity ?? {}), backgroundLore: value };
  setPending(next, "backgroundLore", null);
  changed.push("backgroundLore");
}

function applyFeatEdit(next, edit, changed) {
  if (next.pending.length) fail(PC_EDIT_CODES.PENDING, "feat", "resolve pending identity choices before editing feats");
  const { resolved } = next;
  const index = edit.slot;
  if (!Number.isInteger(index) || index < 0 || index >= resolved.featSlots.length) {
    fail(PC_EDIT_CODES.INVALID, "feat", "slot is out of range");
  }
  const slot = resolved.featSlots[index];
  const candidate = offered(slot.candidates, edit.key, "feat");
  const current = resolved.feats[index];
  if (current?.entry && refKey(current.entry) === refKey(candidate.ref)) return;
  const nameKey = slugify(candidate.name);
  if (resolved.feats.some((pick, other) => other !== index && pick?.entry && slugify(pick.name) === nameKey)) {
    fail(PC_EDIT_CODES.DUPLICATE, "feat", `"${candidate.name}" is already picked`);
  }
  resolved.feats[index] = {
    type: slot.type,
    level: slot.level,
    archetype: Boolean(slot.archetype),
    name: candidate.name,
    entry: candidate.ref
  };
  changed.push(`feat:${index}`);
}

async function applyEquipmentEdit(next, edit, catalogs, deps, changed) {
  if (next.pending.length) fail(PC_EDIT_CODES.PENDING, "equipment", "resolve pending identity choices before editing equipment");
  const { concept, resolved } = next;
  const index = edit.index;
  if (!Number.isInteger(index) || !concept.equipment[index]) fail(PC_EDIT_CODES.INVALID, "equipment", "index is out of range");
  const item = offered(catalogs.equipment, edit.key, "equipment");
  if (refKey(resolved.equipment[index].entry) === refKey(item.ref)) return;
  const nameKey = slugify(item.name);
  if (concept.equipment.some((line, other) => other !== index && slugify(line.name) === nameKey)) {
    fail(PC_EDIT_CODES.DUPLICATE, "equipment", `"${item.name}" is already listed`);
  }
  const line = { name: item.name, quantity: concept.equipment[index].quantity, value: 0, candidate: item.ref };
  const [resolvedLine] = await deps.resolveEquipmentLine({ ...concept, equipment: [line] });
  if (!resolvedLine || refKey(resolvedLine.entry) !== refKey(item.ref)) {
    fail(PC_EDIT_CODES.UNRESOLVED, "equipment", `"${item.name}" did not resolve to its exact catalog entry`);
  }
  concept.equipment[index] = line;
  resolved.equipment[index] = resolvedLine;
  changed.push(`equipment:${index}`);
}

/**
 * Re-resolve ABC documents and feat slots after an identity change, then remap
 * feat picks onto the new slots. A pick survives only if its exact candidate is
 * still offered and its name is not already taken; otherwise it becomes an
 * unresolved entry and is reported.
 */
function remapFeats(previous, slots, invalidated) {
  const taken = new Set();
  const feats = slots.map((slot, index) => {
    const unresolved = { type: slot.type, level: slot.level, archetype: Boolean(slot.archetype), name: `${slot.type} feat`, entry: null };
    const old = previous[index];
    if (!old?.entry) return unresolved;
    const invalidate = (reason) => {
      invalidated.push({ field: "feat", slot: index, reason });
      return unresolved;
    };
    if (old.type !== slot.type || old.level !== slot.level || Boolean(old.archetype) !== Boolean(slot.archetype)) {
      return invalidate("slot changed");
    }
    const match = slot.candidates.find((candidate) => candidateKey(candidate) === refKey(old.entry));
    if (!match) return invalidate(`"${old.name}" is no longer offered`);
    const nameKey = slugify(match.name);
    if (taken.has(nameKey)) return invalidate(`"${old.name}" duplicates an earlier pick`);
    taken.add(nameKey);
    return { type: slot.type, level: slot.level, archetype: Boolean(slot.archetype), name: match.name, entry: match.ref };
  });
  previous.slice(slots.length).forEach((old, offset) => {
    if (old?.entry) invalidated.push({ field: "feat", slot: slots.length + offset, reason: "slot no longer exists" });
  });
  return feats;
}

async function refresh(next, deps, invalidated) {
  const { concept } = next;
  const fresh = await deps.recompute(concept);
  for (const field of ["ancestry", "background", "class"]) {
    if (fresh[`${field}Doc`]?.name !== concept[field]) {
      fail(PC_EDIT_CODES.UNRESOLVED, field, `resolved document does not match "${concept[field]}"`);
    }
  }
  if (concept.heritage && fresh.heritageDoc?.name !== concept.heritage) {
    fail(PC_EDIT_CODES.UNRESOLVED, "heritage", `resolved document does not match "${concept.heritage}"`);
  }
  next.resolved = {
    ...next.resolved,
    ancestryDoc: fresh.ancestryDoc,
    heritageDoc: fresh.heritageDoc ?? null,
    backgroundDoc: fresh.backgroundDoc,
    backgroundLore: fresh.backgroundLore,
    classDoc: fresh.classDoc,
    featSlots: fresh.featSlots,
    feats: remapFeats(next.resolved.feats, fresh.featSlots, invalidated)
  };
  concept.traits = [slugify(fresh.ancestryDoc.name), slugify(fresh.classDoc.name)];
}

/**
 * Apply one exact edit. Returns `{ plan, changed, invalidated, equipmentGp }`.
 * An unchanged selection returns the same content with `changed: []`.
 */
export async function applyPCEdit(plan, edit, { catalogs = {}, services = {} } = {}) {
  assertPlan(plan);
  if (!isObject(edit)) fail(PC_EDIT_CODES.INVALID, "edit", "edit must be an object");
  if (SPELL_FIELDS.includes(edit.field)) {
    fail(PC_EDIT_CODES.DEFERRED, edit.field, "spell editing is deferred; no spell edit is supported");
  }
  if (!PC_EDIT_FIELDS.includes(edit.field)) fail(PC_EDIT_CODES.UNSUPPORTED, String(edit.field), "not an editable PC field");

  const deps = { ...DEFAULT_SERVICES, ...services };
  const next = clonePlan(plan);
  const changed = [];
  const invalidated = [];

  if (edit.field === "feat") {
    applyFeatEdit(next, edit, changed);
  } else if (edit.field === "equipment") {
    await applyEquipmentEdit(next, edit, catalogs, deps, changed);
  } else if (edit.field === "keyAbility") {
    applyKeyAbility(next, edit.value, changed);
  } else if (edit.field === "backgroundLore") {
    applyBackgroundLore(next, edit.value, changed);
  } else {
    await applyCatalogEdit(next, edit, catalogs, deps, changed, invalidated);
  }

  if (changed.length && next.pending.length === 0 && !["feat", "equipment"].includes(edit.field)) {
    await refresh(next, deps, invalidated);
  }
  const equipmentGp = await deps.equipmentValue(next.resolved.equipment);
  return { plan: next, changed, invalidated, equipmentGp };
}

/**
 * Validate completion in memory without writing anything. Returns
 * `{ complete, pending, errors, unresolved, manifest }`.
 */
export function validatePCEditCompletion(plan) {
  assertPlan(plan);
  const { concept, resolved } = plan;
  const pending = (plan.pending ?? []).map((item) => ({ ...item }));
  const errors = [];
  try {
    if (isObject(concept.requiredIdentity) && Object.keys(concept.requiredIdentity).length) {
      assertPCIdentity(concept, concept.requiredIdentity);
    }
  } catch (error) {
    errors.push(error.message);
  }
  const seen = new Set();
  resolved.feats.forEach((pick, index) => {
    if (!pick?.entry) return;
    if (!resolved.featSlots[index].candidates.some((candidate) => refKey(candidate.ref) === refKey(pick.entry))) {
      errors.push(`feat slot ${index + 1} pick is not a current candidate`);
    }
    const nameKey = slugify(pick.name);
    if (seen.has(nameKey)) errors.push(`feat "${pick.name}" is picked twice`);
    seen.add(nameKey);
  });
  const manifest = completionManifest({ mode: "character", concept, resolved });
  return {
    complete: pending.length === 0 && errors.length === 0 && manifest.complete,
    pending,
    errors,
    unresolved: manifest.unresolved,
    manifest
  };
}
