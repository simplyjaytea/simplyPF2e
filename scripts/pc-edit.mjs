/**
 * Exact PC editing contract (C05). Pure over plan objects: every edit returns a
 * new plan and never mutates its input, never writes an actor, and completion
 * is validated in memory. Each choice must be an offered, issued candidate.
 * Anything an edit invalidates is reported in `invalidated` and recorded in
 * `pending`, which blocks completion until the user re-picks. Spell editing is
 * deferred: spell-affecting edits are refused and no spell edit exists, so a
 * class edit into a spellcasting class is refused too (a caster would have no
 * spells while the plan still read as complete).
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
 *   { field: "classPath", bridge, key: string | null }    one path of a multi-bridge class
 *   { field: "keyAbility", value }                        must be a key ability of the class
 *   { field: "backgroundLore", value }                    must be an option of the background
 *   { field: "feat", slot, key }                          slot = zero-based index into featSlots
 *   { field: "equipment", index, key }                    index into concept.equipment
 *
 * Class paths. A class with one level-one bridge (Rogue, Investigator) edits
 * `classPath` as before: concept.classPath / classPathCandidate and
 * requiredIdentity.classPath. A class with several bridges (Wizard) edits one
 * bridge at a time with `bridge` = the bridge feature's name; the choice is
 * offered only from that bridge's candidates (`candidate.bridge`, see
 * class-paths.mjs) and lands in concept.classPaths / classPathCandidates and
 * requiredIdentity.classPaths, each keyed by bridge name. A bridge-less edit of
 * a multi-bridge class is refused rather than guessed; a bridge-less clear
 * (key null) is not a guess and removes every path choice, alias and bridges,
 * from the concept and from the required identity alike. Changing the class
 * drops every path choice.
 *
 * Services (injectable for tests): load(ref), classPaths(classDoc),
 * recompute(concept, { maxRarity }), resolveEquipmentLine(concept), equipmentValue(equipment).
 */
import { getDocument, isIssuedCandidate, toItemData } from "./compendium.mjs";
import { resolvePCConcept, heritageMatchesAncestry } from "./pc-builder.mjs";
import { resolveEquipment, equipmentValueGp } from "./builder.mjs";
import { getBackgroundLoreOptions, resolveBackgroundLore } from "./pc-background-lore.mjs";
import { multiclassAbilityBlocker, multiclassBlockers } from "./pc-multiclass.mjs";
import { casterArchetypeFeat, casterArchetypePlans } from "./pc-caster-archetype.mjs";
import { assertPCIdentity, classPathBridges, pcIdentityKey } from "./pc-identity.mjs";
import { getClassPathCandidates } from "./class-paths.mjs";
import { completionManifest } from "./completion.mjs";
import { supportedClassCandidates } from "./pc-support.mjs";
import { pcSpellcastingProfile } from "./pc-tables.mjs";
import { slugify } from "./text.mjs";

export const PC_EDIT_CODES = Object.freeze({
  MULTICLASS: "PC_EDIT_MULTICLASS",
  INVALID: "PC_EDIT_INVALID",
  UNSUPPORTED: "PC_EDIT_UNSUPPORTED",
  DEFERRED: "PC_EDIT_DEFERRED",
  PENDING: "PC_EDIT_PENDING",
  UNRESOLVED: "PC_EDIT_UNRESOLVED",
  DUPLICATE: "PC_EDIT_DUPLICATE"
});

const PC_EDIT_FIELDS = Object.freeze([
  "ancestry", "heritage", "background", "class", "classPath",
  "keyAbility", "backgroundLore", "feat", "equipment"
]);

const DOC_TYPE = Object.freeze({ ancestry: "ancestry", heritage: "heritage", background: "background", class: "class" });
const NULLABLE = new Set(["heritage", "classPath"]);
const ABILITIES = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);
const SPELL_FIELDS = Object.freeze(["spells", "focusSpells", "spellcasting"]);

/** Whether a class document casts spells: a modeled casting profile, or any spell proficiency in the class data. */
export function classCastsSpells(classDoc) {
  return Boolean(pcSpellcastingProfile(classDoc)) || Number(classDoc?.system?.spellcasting) > 0;
}

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
  recompute: async (concept, { maxRarity = null } = {}) => {
    const resolved = await resolvePCConcept(concept, { exactContent: true, maxRarity });
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
  if (isObject(plan.concept.requiredIdentity)) {
    concept.requiredIdentity = { ...plan.concept.requiredIdentity };
    if (isObject(concept.requiredIdentity.classPaths)) concept.requiredIdentity.classPaths = { ...concept.requiredIdentity.classPaths };
  }
  for (const field of ["classPaths", "classPathCandidates"]) {
    if (isObject(concept[field])) concept[field] = { ...concept[field] };
  }
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
  const present = Boolean(concept.spellcasting) || Boolean(concept.archetypeSpellcasting)
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
  if (!isObject(concept.requiredIdentity)) return;
  delete concept.requiredIdentity[field];
  if (field === "classPath") delete concept.requiredIdentity.classPaths;
}

/** A copy of a bridge-keyed map with one bridge set (or removed); undefined when it ends up empty. */
function withBridge(map, bridge, value) {
  const entries = Object.entries(isObject(map) ? map : {}).filter(([name]) => name !== bridge);
  if (value !== undefined) entries.push([bridge, value]);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function setOrDelete(target, field, value) {
  if (value === undefined) delete target[field];
  else target[field] = value;
}

const bridgeOf = (map, bridge) => (isObject(map) && Object.hasOwn(map, bridge) ? map[bridge] : undefined);

/** Whether any per-bridge path choice is held, in the concept or in the required identity. */
function hasBridgePaths(concept) {
  return [concept.classPaths, concept.requiredIdentity?.classPaths].some((map) => isObject(map) && Object.keys(map).length > 0);
}

function currentKey(concept, field, bridge) {
  if (field === "classPath" && bridge !== undefined) return refKey(bridgeOf(concept.classPathCandidates, bridge));
  return refKey(field === "classPath" ? concept.classPathCandidate : concept[`${field}Candidate`]);
}

function writeChoice(concept, field, chosen, bridge) {
  if (field === "classPath" && bridge !== undefined) {
    setOrDelete(concept, "classPaths", withBridge(concept.classPaths, bridge, chosen?.name));
    setOrDelete(concept, "classPathCandidates", withBridge(concept.classPathCandidates, bridge, chosen?.ref));
    return;
  }
  if (field === "classPath") {
    if (chosen) {
      concept.classPath = chosen.name;
      concept.classPathCandidate = chosen.ref;
    } else {
      delete concept.classPath;
      delete concept.classPathCandidate;
      // A bridge-less clear drops every path choice, the same scope as the
      // required identity (deleteRequired), so the two cannot disagree.
      delete concept.classPaths;
      delete concept.classPathCandidates;
    }
    return;
  }
  concept[field] = chosen ? chosen.name : null;
  concept[`${field}Candidate`] = chosen ? chosen.ref : null;
}

// Required identity is what the generator and createCharacterActor read back.
// classPath is always declared there (stageClassPaths reads requiredIdentity).
function syncRequired(concept, field, chosen, bridge) {
  if (field === "classPath" && bridge !== undefined) {
    if (!chosen && !isObject(concept.requiredIdentity)) return;
    const required = isObject(concept.requiredIdentity) ? concept.requiredIdentity : {};
    concept.requiredIdentity = { ...required };
    setOrDelete(concept.requiredIdentity, "classPaths", withBridge(required.classPaths, bridge, chosen ?? undefined));
    // The per-bridge entry supersedes a single-path alias for the same bridge.
    if (required.classPath?.bridge === bridge) {
      delete concept.requiredIdentity.classPath;
      delete concept.classPath;
      delete concept.classPathCandidate;
    }
    return;
  }
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
    // Every path choice belongs to the previous class: the single alias and
    // each bridge. One invalidation per cleared choice, so the editor can
    // discard exactly those drafts.
    const bridges = Object.keys(isObject(concept.classPaths) ? concept.classPaths : {});
    const hadAlias = Boolean(concept.classPath);
    delete concept.classPath;
    delete concept.classPathCandidate;
    delete concept.classPaths;
    delete concept.classPathCandidates;
    deleteRequired(concept, field);
    if (hadAlias || !bridges.length) invalidated.push({ field, reason });
    for (const bridge of bridges) invalidated.push({ field, bridge, reason: `${reason} (${bridge})` });
    return;
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
  if (concept.classPath || Object.keys(isObject(concept.classPaths) ? concept.classPaths : {}).length) {
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
  const { field, key, bridge } = edit;
  const { concept, resolved } = next;
  if (key !== null && typeof key !== "string") fail(PC_EDIT_CODES.INVALID, field, "key must be a candidate key or null");
  if (key === null && !NULLABLE.has(field)) fail(PC_EDIT_CODES.INVALID, field, "this field cannot be cleared");
  if (bridge !== undefined && (field !== "classPath" || typeof bridge !== "string" || !bridge)) {
    fail(PC_EDIT_CODES.INVALID, field, "a bridge applies only to a class path and must be a bridge name");
  }
  const pendingField = bridge === undefined ? field : `${field}.${bridge}`;
  // A bridge-less clear removes every path choice (alias and each bridge), so it
  // still applies when only per-bridge choices remain.
  const clearsEveryPath = field === "classPath" && bridge === undefined && key === null;
  if ((key ?? "") === currentKey(concept, field, bridge) && !isPending(next, pendingField)
    && !(clearsEveryPath && hasBridgePaths(concept))) return;
  assertNoSpellState(next, field);

  let chosen = null;
  let doc = null;
  if (key !== null) {
    let list;
    if (field === "classPath") {
      const all = await deps.classPaths(resolved.classDoc);
      const bridges = classPathBridges(all);
      if (bridge === undefined) {
        if (bridges.length > 1) {
          fail(PC_EDIT_CODES.INVALID, field, `this class has several path bridges (${bridges.join(", ")}); name the bridge`);
        }
        list = all;
      } else {
        if (!bridges.includes(bridge)) fail(PC_EDIT_CODES.INVALID, field, `"${bridge}" is not a path bridge of this class`);
        list = all.filter((candidate) => candidate?.bridge === bridge);
      }
    } else {
      list = catalogs[field];
    }
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
      // Spell editing does not exist yet, so a class that casts would leave a
      // caster with no spells and a plan that still reads as complete.
      if (field === "class" && classCastsSpells(doc)) {
        fail(PC_EDIT_CODES.DEFERRED, field, `"${chosen.name}" casts spells; spell editing is deferred, so the class cannot change to a spellcasting class`);
      }
    }
  }

  writeChoice(concept, field, chosen, bridge);
  syncRequired(concept, field, chosen, bridge);
  if (field !== "classPath") resolved[`${field}Doc`] = doc;
  setPending(next, pendingField, null);
  changed.push(pendingField);

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
  // A spellcasting archetype feat owns an entry and a spellbook (W3). Spell editing is deferred, so neither
  // adding nor removing one can keep the plan consistent; regenerate instead.
  const casterFeat = [candidate.name, current?.entry ? current.name : null].find((name) => casterArchetypeFeat(name));
  if (casterFeat) {
    fail(PC_EDIT_CODES.DEFERRED, "feat", `"${casterFeat}" is a spellcasting archetype feat; its spells cannot be edited, so it cannot be added or replaced`);
  }
  const nameKey = slugify(candidate.name);
  if (resolved.feats.some((pick, other) => other !== index && pick?.entry && slugify(pick.name) === nameKey)) {
    fail(PC_EDIT_CODES.DUPLICATE, "feat", `"${candidate.name}" is already picked`);
  }
  // Ordinary multiclass lock (C08): validate the whole resulting order, so a
  // replacement dedication cannot strand feats already held from another package.
  const ordered = resolved.feats.map((pick, other) => (other === index ? candidate.name : (pick?.entry ? pick.name : null)));
  const [blocked] = multiclassBlockers(ordered, resolved.classDoc?.name ?? "");
  if (blocked) fail(PC_EDIT_CODES.MULTICLASS, "feat", blocked.reason);
  // Dedication ability prerequisites (C09): the slot's derived modifiers must meet them.
  const abilityBlock = multiclassAbilityBlocker(candidate.name, slot.abilities);
  if (abilityBlock) fail(PC_EDIT_CODES.INVALID, "feat", abilityBlock);
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
function remapFeats(previous, slots, invalidated, className = null) {
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
    const abilityBlock = multiclassAbilityBlocker(match.name, slot.abilities);
    if (abilityBlock) return invalidate(abilityBlock);
    const nameKey = slugify(match.name);
    if (taken.has(nameKey)) return invalidate(`"${old.name}" duplicates an earlier pick`);
    taken.add(nameKey);
    return { type: slot.type, level: slot.level, archetype: Boolean(slot.archetype), name: match.name, entry: match.ref };
  });
  previous.slice(slots.length).forEach((old, offset) => {
    if (old?.entry) invalidated.push({ field: "feat", slot: slots.length + offset, reason: "slot no longer exists" });
  });
  if (className) {
    for (const hit of multiclassBlockers(feats.map((feat) => (feat.entry ? feat.name : null)), className)) {
      invalidated.push({ field: "feat", slot: hit.index, reason: hit.reason });
      feats[hit.index] = { type: slots[hit.index].type, level: slots[hit.index].level, archetype: Boolean(slots[hit.index].archetype), name: `${slots[hit.index].type} feat`, entry: null };
    }
  }
  return feats;
}

async function refresh(next, deps, invalidated, maxRarity = null) {
  const { concept } = next;
  const fresh = await deps.recompute(concept, { maxRarity });
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
    feats: remapFeats(next.resolved.feats, fresh.featSlots, invalidated, fresh.classDoc?.name ?? null)
  };
  concept.traits = [slugify(fresh.ancestryDoc.name), slugify(fresh.classDoc.name)];
}

/**
 * Apply one exact edit. Returns `{ plan, changed, invalidated, equipmentGp }`.
 * An unchanged selection returns the same content with `changed: []`.
 */
export async function applyPCEdit(plan, edit, { catalogs = {}, services = {}, maxRarity = null } = {}) {
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
    await refresh(next, deps, invalidated, maxRarity);
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
  // The archetype spell plan must match the spellcasting archetype feats actually held.
  const [heldPlan] = casterArchetypePlans(resolved.feats.map((pick) => (pick?.entry ? pick.name : null)), concept.level);
  const planned = concept.archetypeSpellcasting ?? null;
  if ((heldPlan?.archetype.pkg ?? null) !== (planned?.pkg ?? null)
    || (heldPlan && JSON.stringify(heldPlan.picks) !== JSON.stringify(planned.plannedPicks))) {
    errors.push("the spellcasting archetype feats and the archetype spell plan disagree");
  }
  const manifest = completionManifest({ mode: "character", concept, resolved });
  return {
    complete: pending.length === 0 && errors.length === 0 && manifest.complete,
    pending,
    errors,
    unresolved: manifest.unresolved,
    manifest
  };
}
