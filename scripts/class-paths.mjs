import { getClassFeatureCandidates, getPacksFor, toItemData } from "./compendium.mjs";
import { choiceSetOptions, normalizeChoiceFlag, preselectChoiceSets } from "./choice-set.mjs";

/**
 * Stage the small, mandatory level-one class-path bridges that PF2e normally
 * re-fetches from `Class.system.items` (Rogue's Racket, Investigator's
 * Methodology, Wizard's Arcane School and Arcane Thesis, and similar
 * features). The class remains native and keeps every other grant; only each
 * selected bridge is embedded directly, linked to that class, so its exact
 * enabled-source selection can be resolved before any world write.
 *
 * This is intentionally conservative. A path is eligible only when the
 * bridge's filter is a single `item:tag:<tag>` query, every selected feature
 * choice is static, and no descendant grant contains another choice. Anything
 * wider remains an unsupported class path rather than opening a PF2e dialog
 * after a one-click build has started.
 *
 * Per-bridge contract. A class can have several bridges (Wizard has two).
 * Every candidate returned by `getClassPathCandidates` carries `bridge`, the
 * name of the bridge feature that offers it (for example "Arcane School").
 * `stageClassPaths` accepts the required paths in two equivalent forms:
 *   - `requiredPaths`: an object keyed by bridge name, one required candidate
 *     per bridge. Each bridge is validated only against its own entry, so a
 *     path required for bridge A is never matched against bridge B, and a
 *     key that names no bridge of the class is refused.
 *   - `requiredPath`: the single-bridge alias (Rogue, Investigator). When the
 *     candidate carries `bridge` it is treated as `requiredPaths[bridge]`;
 *     when it does not (a bare reference) it applies to every bridge staged.
 * Bridges without a required path are chosen through the bounded chooser, as
 * before. Wizard data is verified against PF2e 8.5.0
 * (docs/plans/wizard-research-2026-10-26.md); the fixtures under
 * tests/fixtures/pc-wizard hold the real files.
 *
 * Fail-closed guard. A level-one class entry that is not staged as a bridge
 * but whose own rules contain a `ChoiceSet` would still open a native dialog
 * after a one-click build starts, which this module forbids. Such a class
 * throws a named error before any chooser call or write. This is what makes
 * a PF2e shape the module cannot stage (master's two-entry Arcane School
 * filter, verified in the research record) refuse instead of prompting.
 */

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStaticChoice(rule, config) {
  return isObject(rule) && rule.key === "ChoiceSet"
    && rule.selection == null && !rule.allowNoSelection && !rule.allowedDrops
    && !rule.ignored && !rule.predicate && Boolean(choiceSetOptions(rule.choices, config));
}

function hasChoiceSet(source) {
  const rules = source?.system?.rules;
  return Array.isArray(rules) && rules.some((rule) => rule?.key === "ChoiceSet");
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

/** Return the exact closed candidates offered by an enabled level-one bridge. */
async function closedPathCandidates(tag, config) {
  const candidates = await getClassFeatureCandidates(tag);
  const closed = [];
  for (const candidate of candidates) {
    if (await pathCandidateIsClosed(candidate, config)) closed.push(candidate);
  }
  return closed;
}

/**
 * Discover the supported native path choices for a class source. The result
 * is intentionally flat and contains only exact, issued candidates whose
 * descendants can be resolved without a native dialog. Each candidate names
 * the bridge feature that offers it in `bridge`.
 */
export async function getClassPathCandidates(classData, { config = CONFIG?.PF2E ?? {} } = {}) {
  const entries = classData?.system?.items;
  if (!isObject(entries)) return [];
  const paths = [];
  for (const entry of Object.values(entries)) {
    if (Number(entry?.level) !== 1 || typeof entry?.uuid !== "string") continue;
    const document = await documentFromUuid(entry.uuid);
    if (!document) continue;
    const source = toItemData(document);
    const selector = singlePathTag(source);
    if (!selector || !isEnabledClassFeature(document)) continue;
    // Copy each candidate: the index cache shares the issued records, and the
    // bridge label belongs to this class entry, not to the shared record.
    for (const candidate of await closedPathCandidates(selector.tag, config)) {
      paths.push({ ...candidate, bridge: source.name });
    }
  }
  const seen = new Set();
  return paths.filter((candidate) => {
    const key = `${candidate.bridge}\u0000${candidate.ref?.packId}\u0000${candidate.ref?._id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sameCandidate(a, b) {
  return Boolean(a && b && a.ref?.packId === b.ref?.packId && a.ref?._id === b.ref?._id
    && a.uuid === b.uuid);
}

/**
 * Split the required paths into the per-bridge map and the bridge-less alias.
 * A single `requiredPath` that names its bridge is just one more entry of the
 * per-bridge map; two different paths for one bridge are a conflict.
 */
function requiredPathPlan(requiredPath, requiredPaths) {
  if (requiredPaths != null && !isObject(requiredPaths)) {
    throw new Error("simplypf2e | required class paths must be an object keyed by bridge name");
  }
  const byBridge = new Map();
  for (const [bridge, path] of Object.entries(requiredPaths ?? {})) {
    if (!isObject(path)) throw new Error(`simplypf2e | required class path for "${bridge}" is not a candidate`);
    byBridge.set(bridge, path);
  }
  let unkeyed = null;
  if (requiredPath) {
    if (typeof requiredPath.bridge === "string" && requiredPath.bridge) {
      const existing = byBridge.get(requiredPath.bridge);
      if (existing && !sameCandidate(existing, requiredPath)) {
        throw new Error(`simplypf2e | required class path "${requiredPath.name ?? "?"}" conflicts with the required path for "${requiredPath.bridge}"`);
      }
      byBridge.set(requiredPath.bridge, existing ?? requiredPath);
    } else unkeyed = requiredPath;
  }
  return { byBridge, unkeyed };
}

/**
 * Mutate a cloned class source to remove each native bridge entry and return
 * its exact replacement. This must run before Actor.create. It may invoke the
 * existing bounded choice callback; an omitted path is a hard failure, never
 * a later native dialog. `requiredPaths` (keyed by bridge name) and the
 * single-bridge alias `requiredPath` are described in the module header.
 */
export async function stageClassPaths(classData, classId, { context, config = CONFIG?.PF2E ?? {}, selectChoices = null, requiredPath = null, requiredPaths = null } = {}) {
  const { byBridge, unkeyed } = requiredPathPlan(requiredPath, requiredPaths);
  const entries = classData?.system?.items;
  if (!isObject(entries)) {
    const missing = unkeyed ?? byBridge.values().next().value ?? null;
    if (missing) throw new Error(`simplypf2e | required class path "${missing.name ?? "?"}" has no class bridge to stage`);
    return { items: [], expectedPaths: [] };
  }
  // Pass one reads the class and refuses what cannot be staged, before any
  // chooser call (which may spend provider tokens) and before any write.
  const bridges = [];
  const unstaged = [];
  for (const [entryId, entry] of Object.entries(entries)) {
    if (Number(entry?.level) !== 1 || typeof entry?.uuid !== "string") continue;
    const document = await documentFromUuid(entry.uuid);
    if (!document) continue;
    const source = toItemData(document);
    const selector = singlePathTag(source);
    if (!selector) {
      unstaged.push(source);
      continue;
    }
    if (!isEnabledClassFeature(document)) {
      throw new Error(`simplypf2e | required class path source for "${source.name}" is not enabled`);
    }
    if (bridges.some((bridge) => bridge.source.name === source.name)) {
      throw new Error(`simplypf2e | class has more than one level-one bridge named "${source.name}"`);
    }
    bridges.push({ entryId, source, selector });
  }
  // Fail-closed guard (module header): an entry that was not staged as a
  // bridge must not carry a ChoiceSet, or PF2e would prompt after the build.
  for (const source of unstaged) {
    if (hasChoiceSet(source)) {
      throw new Error(`simplypf2e | class path "${source.name}" has an unsupported choice shape; refusing a one-click build`);
    }
  }
  for (const [bridgeName, path] of byBridge) {
    if (!bridges.some((bridge) => bridge.source.name === bridgeName)) {
      throw new Error(`simplypf2e | required class path "${path.name ?? "?"}" names bridge "${bridgeName}", which this class does not have`);
    }
  }
  if (unkeyed && !bridges.length) {
    throw new Error(`simplypf2e | required class path "${unkeyed.name ?? "?"}" has no supported class bridge`);
  }

  const staged = [];
  const expectedPaths = [];
  for (const { entryId, source, selector } of bridges) {
    // A required path is matched only against the bridge it was required for.
    const requiredForBridge = byBridge.get(source.name) ?? unkeyed;

    const closed = await closedPathCandidates(selector.tag, config);
    if (!closed.length) {
      throw new Error(`simplypf2e | no fully resolvable enabled class paths for "${source.name}"`);
    }

    // Replace only the runtime query with the exact candidates we just issued.
    // The real ChoiceSet and GrantItem rules stay cloned from PF2e unchanged.
    source.system.location = classId;
    let offered = closed;
    if (requiredForBridge) {
      const selectedRequired = closed.find((candidate) => sameCandidate(candidate, requiredForBridge));
      if (!selectedRequired) {
        throw new Error(`simplypf2e | required class path "${requiredForBridge.name ?? "?"}" is missing, wrong-class, or unsupported`);
      }
      offered = [selectedRequired];
    }
    source.system.rules[selector.ruleIndex].choices = offered.map((candidate) => ({ value: candidate.uuid, label: candidate.name }));
    await preselectChoiceSets([source], context, config, sourceFromUuid, selectChoices);
    const chosenUuid = source.system.rules[selector.ruleIndex].selection;
    const selected = closed.find((candidate) => candidate.uuid === chosenUuid);
    if (!selected) {
      throw new Error(`simplypf2e | class path "${source.name}" was not selected from the offered catalog`);
    }
    if (requiredForBridge && !sameCandidate(selected, requiredForBridge)) {
      throw new Error(`simplypf2e | required class path "${requiredForBridge.name ?? "?"}" was not selected exactly`);
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
