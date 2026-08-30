import { getClassFeatureCandidates, getPacksFor, toItemData } from "./compendium.mjs";
import { choiceSetOptions, normalizeChoiceFlag, preselectChoiceSets } from "./choice-set.mjs";

/**
 * Stage the small, mandatory level-one class-path bridge that PF2e normally
 * re-fetches from `Class.system.items` (Rogue's Racket, Methodology, and
 * similar features). The class remains native and keeps every other grant;
 * only the selected bridge is embedded directly, linked to that class, so its
 * exact enabled-source selection can be resolved before any world write.
 *
 * This is intentionally conservative. A path is eligible only when the
 * bridge's filter is a single `item:tag:<tag>` query, every selected feature
 * choice is static, and no descendant grant contains another choice. Anything
 * wider remains an unsupported class path rather than opening a PF2e dialog
 * after a one-click build has started.
 */

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStaticChoice(rule, config) {
  return isObject(rule) && rule.key === "ChoiceSet"
    && rule.selection == null && !rule.allowNoSelection && !rule.allowedDrops
    && !rule.ignored && !rule.predicate && Boolean(choiceSetOptions(rule.choices, config));
}

function simpleGrantUuid(rule) {
  if (!isObject(rule) || rule.key !== "GrantItem" || rule.ignored || rule.predicate) return null;
  const uuid = rule.uuid;
  return typeof uuid === "string" && uuid && !uuid.includes("{") ? uuid : null;
}

function singlePathTag(source) {
  const rules = source?.system?.rules;
  if (!Array.isArray(rules)) return null;
  const selectors = rules.map((rule, index) => ({ rule, index })).filter(({ rule }) => {
    const filter = rule?.key === "ChoiceSet" ? rule.choices?.filter : null;
    return Array.isArray(filter) && filter.length === 1 && typeof filter[0] === "string"
      && filter[0].startsWith("item:tag:") && !rule.predicate && !rule.allowNoSelection && !rule.allowedDrops && !rule.ignored;
  });
  if (selectors.length !== 1) return null;
  const tag = selectors[0].rule.choices.filter[0].slice("item:tag:".length);
  return tag ? { tag, ruleIndex: selectors[0].index } : null;
}

async function documentFromUuid(uuid) {
  try { return await fromUuid(uuid); }
  catch { return null; }
}

async function sourceFromUuid(uuid) {
  const document = await documentFromUuid(uuid);
  return document?.toObject?.() ?? null;
}

function isEnabledClassFeature(document) {
  // Foundry Item documents expose `pack` as the collection-id string; retain
  // the object forms for test doubles and compatible document wrappers.
  const packId = typeof document?.pack === "string" ? document.pack
    : document?.pack?.collection ?? document?.compendium?.collection ?? null;
  return typeof packId === "string" && getPacksFor("classFeatures").includes(packId);
}

/** No native descendants may need a choice: preselectChoices reaches exactly
 * the selected path feature, not a grant of that feature. */
async function descendantsHaveNoChoices(source, seen = new Set()) {
  const rules = source?.system?.rules;
  if (!Array.isArray(rules)) return true;
  for (const rule of rules) {
    if (rule?.key === "GrantItem" && !simpleGrantUuid(rule)) return false;
    const uuid = simpleGrantUuid(rule);
    if (!uuid) continue;
    if (seen.has(uuid)) return false;
    seen.add(uuid);
    const child = await documentFromUuid(uuid);
    const childSource = child?.toObject?.();
    if (!childSource) return false;
    if (Array.isArray(childSource.system?.rules) && childSource.system.rules.some((entry) => entry?.key === "ChoiceSet")) return false;
    if (!await descendantsHaveNoChoices(childSource, seen)) return false;
  }
  return true;
}

async function pathCandidateIsClosed(candidate, config) {
  const document = await documentFromUuid(candidate.uuid);
  const source = document?.toObject?.();
  if (!source || !isEnabledClassFeature(document)) return false;
  const rules = source.system?.rules;
  if (!Array.isArray(rules)) return true;
  if (rules.some((rule) => rule?.key === "ChoiceSet" && (!isStaticChoice(rule, config) || !normalizeChoiceFlag(rule.flag)))) return false;
  return descendantsHaveNoChoices(source);
}

/**
 * Mutate a cloned class source to remove its native bridge entry and return
 * its exact replacement. This must run before Actor.create. It may invoke the
 * existing bounded choice callback; an omitted path is a hard failure, never
 * a later native dialog.
 */
export async function stageClassPaths(classData, classId, { context, config = CONFIG?.PF2E ?? {}, selectChoices = null } = {}) {
  const entries = classData?.system?.items;
  if (!isObject(entries)) return { items: [], expectedPaths: [] };
  const staged = [];
  const expectedPaths = [];
  for (const [entryId, entry] of Object.entries(entries)) {
    if (Number(entry?.level) !== 1 || typeof entry?.uuid !== "string") continue;
    const document = await documentFromUuid(entry.uuid);
    if (!document) continue;
    const source = toItemData(document);
    const selector = singlePathTag(source);
    if (!selector) continue;
    if (!isEnabledClassFeature(document)) {
      throw new Error(`simplypf2e | required class path source for "${source.name}" is not enabled`);
    }

    const candidates = await getClassFeatureCandidates(selector.tag);
    const closed = [];
    for (const candidate of candidates) {
      if (await pathCandidateIsClosed(candidate, config)) closed.push(candidate);
    }
    if (!closed.length) {
      throw new Error(`simplypf2e | no fully resolvable enabled class paths for "${source.name}"`);
    }

    // Replace only the runtime query with the exact candidates we just issued.
    // The real ChoiceSet and GrantItem rules stay cloned from PF2e unchanged.
    source.system.location = classId;
    source.system.rules[selector.ruleIndex].choices = closed.map((candidate) => ({ value: candidate.uuid, label: candidate.name }));
    await preselectChoiceSets([source], context, config, sourceFromUuid, selectChoices);
    const chosenUuid = source.system.rules[selector.ruleIndex].selection;
    const selected = closed.find((candidate) => candidate.uuid === chosenUuid);
    if (!selected) {
      throw new Error(`simplypf2e | class path "${source.name}" was not selected from the offered catalog`);
    }

    // GrantItem's native `preselectChoices` reaches ChoiceSets on the path
    // feature itself. Build that record using the same bounded chooser rather
    // than authoring any Rule Element or selection values here.
    const bridge = { name: source.name, system: { rules: [{ key: "GrantItem", uuid: selected.uuid }] } };
    await preselectChoiceSets([bridge], context, config, sourceFromUuid, selectChoices);
    const targetGrant = source.system.rules.find((rule) => rule?.key === "GrantItem" && typeof rule.uuid === "string" && rule.uuid.includes("rulesSelections"));
    const preselect = bridge.system.rules[0].preselectChoices;
    const selectedDocument = await documentFromUuid(selected.uuid);
    const selectedRules = selectedDocument?.toObject?.().system?.rules ?? [];
    const requiredFlags = selectedRules.filter((rule) => rule?.key === "ChoiceSet")
      .map((rule) => normalizeChoiceFlag(rule.flag));
    if (!requiredFlags.every((flag) => flag && Object.prototype.hasOwnProperty.call(preselect ?? {}, flag))) {
      throw new Error(`simplypf2e | class path "${selected.name}" has an unanswered static choice`);
    }
    if (targetGrant && preselect) targetGrant.preselectChoices = preselect;

    delete classData.system.items[entryId];
    staged.push(source);
    // This document is created natively by the bridge's real GrantItem. It
    // was not in the transaction item array, so carry its exact source only
    // for post-create survival verification.
    expectedPaths.push({ name: selected.name, type: selected.type ?? "feat", _stats: { compendiumSource: selected.uuid } });
  }
  return { items: staged, expectedPaths };
}
