import { slugify } from "./text.mjs";

/**
 * Pre-resolve PF2e `ChoiceSet` rule elements on the item sources we are about
 * to embed, reducing only the prompts whose choices are statically knowable.
 *
 * MECHANISM (verified against real foundryvtt/pf2e master source, invariant #2):
 *
 * `src/module/rules/rule-element/choice-set/rule-element.ts` — the constructor
 * reads the selection straight off the rule SOURCE:
 *
 *     this.selection =
 *         typeof data.selection === "string" || typeof data.selection === "number" || R.isPlainObject(data.selection)
 *             ? data.selection
 *             : null;
 *
 * and `preCreate()` only opens the dialog when no preselection matches:
 *
 *     const selection =
 *         this.#getPreselection(this.choices) ??
 *         (await new ChoiceSetPrompt({ ... }).resolveSelection());
 *
 *     /** If this rule element's parent item was granted with a pre-selected choice, the prompt is to be skipped *\/
 *     #getPreselection(inflatedChoices: PickableThing[]): PickableThing | null {
 *         if (this.selection === null) return null;
 *         const choice = inflatedChoices.find((c) => R.isDeepEqual(this.selection, c.value));
 *         return choice ?? null;
 *     }
 *
 * So: writing `selection` into `system.rules[i]` of the item source we hand to
 * `createEmbeddedDocuments` suppresses that item's prompt — PROVIDED the value
 * deep-equals one of the inflated choice values. The schema accepts
 * string | number | boolean | object; this helper handles only string and
 * number values whose exact source value remains local.
 *
 * `src/module/rules/rule-element/grant-item/rule-element.ts` answers the
 * grants-of-grants question for GrantItem grants:
 *
 *     /** Apply preselected choices to the granted item's choices sets. *\/
 *     #applyChoicePreselections(grantedItem: ItemPF2e<ActorPF2e>): void {
 *         const source = grantedItem._source;
 *         for (const [flag, selection] of Object.entries(this.preselectChoices ?? {})) {
 *             const rule = grantedItem.rules.find(
 *                 (rule): rule is ChoiceSetRuleElement => rule instanceof ChoiceSetRuleElement && rule.flag === flag,
 *             );
 *             ...
 *             rule.selection = ruleSource.selection = resolvedSelection;
 *
 * i.e. the GRANTING item's `preselectChoices` record (keyed by the grantee's
 * ChoiceSet `flag`) pre-answers a grantee's ChoiceSet. That record is on the
 * granting item's own rule source, so we can write it. It reaches exactly one
 * level: the grantee's own GrantItem rules are re-fetched untouched from the
 * compendium, so a grant of a grant is out of reach.
 *
 * NOT reachable at all: ABC `system.items` grants (a class's features, a
 * dwarf's Clan Dagger ancestry feature). `src/module/item/abc/document.ts`
 * `createGrantedItems()` re-fetches each entry live —
 * `UUIDUtils.fromUUIDs(entries.map((e) => e.uuid))` then `.clone()` — and
 * `src/module/item/base/document.ts` `createDocuments()` expands them
 * recursively through `getSimpleGrants()`. There is no source-level hook on
 * that path, and blanking `system.items` to pre-expand them ourselves would
 * break level-up grants. Those prompts remain; see the module README notes in
 * pc-builder.mjs.
 *
 * FAIL OPEN — a ChoiceSet whose
 * options cannot be enumerated statically (compendium `filter` queries, owned-
 * item / attack queries, predicated options, homebrew shapes) is LEFT ALONE so
 * the normal prompt appears. Guessing there would write an invalid `selection`
 * that deep-equals no inflated choice — which does not skip the prompt but DOES
 * skip choice validation (`inflateChoices` sets `validate = R.isNullish(this.selection)`),
 * producing a silently broken item. A dialog the GM clicks is strictly better
 * than a corrupt character, so absence of certainty means "do nothing here".
 */

const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"];

/** Minimum slug length before substring (rather than exact) matching is allowed. */
const FUZZY_MIN = 4;
const MAX_BATCH_GROUPS = 24;
const MAX_BATCH_OPTIONS = 512;
const MAX_GROUP_OPTIONS = 32;

/**
 * Mirror of ChoiceSetRuleElement#setDefaultFlag's sanitising of an explicit
 * flag: `source.flag.replace(/[^-a-z0-9]/gi, "")`. A `preselectChoices` key
 * must match the flag the rule element ends up with, not the raw pack value.
 * @param {unknown} flag
 * @returns {string|null}
 */
export function normalizeChoiceFlag(flag) {
  if (typeof flag !== "string" || !flag.length) return null;
  const cleaned = flag.replace(/[^-a-z0-9]/gi, "");
  return cleaned.length ? cleaned : null;
}

/** Read a dot path out of a plain object (CONFIG.PF2E), without Foundry helpers. */
function getPath(root, path) {
  let node = root;
  for (const key of String(path).split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = node[key];
  }
  return node;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A choice entry carrying its own predicate is only legal under some actor
 * roll options we cannot evaluate here — drop it rather than risk picking it. */
function hasPredicate(entry) {
  return isPlainObject(entry) && "predicate" in entry
    && !(Array.isArray(entry.predicate) && entry.predicate.length === 0);
}

function isItemUuid(value) {
  return typeof value === "string" && /^(?:Compendium|Item)\./.test(value);
}

/**
 * Port of pf2e `processChoicesFromData` (src/module/rules/helpers.ts) for the
 * two static shapes it supports, minus anything predicated:
 *   array  -> entries already carrying `{value, label}`
 *   object -> `{[key]: label}` / `{[key]: {label}}`, value is the KEY
 * @returns {{value: string|number, label: string}[]}
 */
function choicesFromData(data) {
  if (Array.isArray(data)) {
    // PF2e evaluates predicates while inflating choices. We cannot do that
    // before an actor exists, so one predicated entry makes the whole set
    // native: dropping it could force a selection from an incomplete catalog.
    if (data.some((c) => hasPredicate(c))) return null;
    if (!data.every((c) => isPlainObject(c)
      && (typeof c.value === "string" || (typeof c.value === "number" && Number.isFinite(c.value))))) return null;
    if (data.some((c) => isPlainObject(c) && isItemUuid(c.value)
      && (typeof c.label !== "string" || !c.label || c.label === c.value || c.label === "???"))) return null;
    return data.map((c) => ({ value: c.value, label: String(c.label ?? c.value) }));
  }
  if (!isPlainObject(data)) return [];
  const entries = Object.entries(data);
  if (entries.some(([, c]) => hasPredicate(c))) return null;
  if (!entries.every(([, c]) => typeof (isPlainObject(c) ? c.label : c) === "string")) return [];
  if (entries.some(([key, c]) => {
    const label = isPlainObject(c) ? c.label : c;
    return isItemUuid(key) && (!label || label === key || label === "???");
  })) return null;
  return entries
    .filter(([, c]) => !hasPredicate(c))
    .map(([key, c]) => ({ value: key, label: String(isPlainObject(c) ? c.label : c) }));
}

/**
 * Enumerate a ChoiceSet's options WITHOUT actor context, or return null when
 * that is impossible (the fail-open signal).
 *
 * Handled: a literal array of pickable things; a CONFIG.PF2E dot path (string);
 * `{config: "<path>"}`. Everything else — `filter` compendium queries,
 * `ownedItems`, `attacks`/`unarmedAttacks`, the removed `query` form — needs a
 * live actor/compendium sweep and is left to the prompt.
 * @param {unknown} choices the rule's `choices` field
 * @param {object} [config] CONFIG.PF2E (or a stub in tests)
 * @returns {{value: string|number, label: string}[]|null}
 */
export function choiceSetOptions(choices, config = {}) {
  let options = null;
  if (Array.isArray(choices)) {
    options = choicesFromData(choices);
  } else if (typeof choices === "string") {
    options = choicesFromData(getPath(config, choices));
  } else if (isPlainObject(choices)) {
    // A `config` object form may carry a top-level predicate applied to every
    // option (#choicesFromPath) — unevaluable here, so fail open.
    if (typeof choices.config !== "string" || hasPredicate(choices)) return null;
    options = choicesFromData(getPath(config, choices.config));
  }
  return options && options.length ? options : null;
}

/** Slug forms an option can plausibly be named by in AI-authored concept text. */
function optionSlugs(option) {
  const slugs = new Set();
  const value = String(option.value ?? "");
  if (value) slugs.add(slugify(value));
  const label = String(option.label ?? "");
  if (label) {
    slugs.add(slugify(label));
    // Labels are usually i18n keys ("PF2E.Weapon.Base.clan-dagger"); the tail
    // segment is the only human-meaningful part.
    const tail = label.split(".").pop();
    if (tail) slugs.add(slugify(tail));
  }
  slugs.delete("");
  return [...slugs];
}

function namesMatch(nameSlug, optSlugs) {
  if (!nameSlug) return false;
  for (const slug of optSlugs) {
    if (slug === nameSlug) return true;
    if (slug.length >= FUZZY_MIN && nameSlug.length >= FUZZY_MIN
      && (slug.includes(nameSlug) || nameSlug.includes(slug))) return true;
  }
  return false;
}

/**
 * Selection policy, in priority order (per the feature brief):
 *   1. class key attribute — an all-attribute option set resolves to the
 *      character's already-decided key ability;
 *   2. an unambiguous concept match — an option the AI concept already named
 *      (a clan weapon it gave the PC, a skill in its feat list, …);
 *   3. the sole legal option.
 * @param {{value: string|number, label: string}[]} options
 * @param {{keyAbility?: string, names?: string[]}} [context]
 * @returns {{value: string|number, label: string, reason: "key-attribute"|"concept"|"only"}|null}
 */
export function pickChoiceSelection(options, context = {}) {
  if (!Array.isArray(options) || !options.length) return null;

  const keyAbility = context.keyAbility;
  if (ABILITY_KEYS.includes(keyAbility)
    && options.every((o) => ABILITY_KEYS.includes(String(o.value)))) {
    const match = options.find((o) => String(o.value) === keyAbility);
    if (match) return { ...match, reason: "key-attribute" };
  }

  const names = (Array.isArray(context.names) ? context.names : [])
    .map((n) => slugify(String(n ?? "")))
    .filter(Boolean);
  if (names.length) {
    const matches = options.filter((option) => names.some((n) => namesMatch(n, optionSlugs(option))));
    if (matches.length === 1) return { ...matches[0], reason: "concept" };
  }

  return options.length === 1 ? { ...options[0], reason: "only" } : null;
}

/** Is this rule source a ChoiceSet we may safely pre-answer? */
function isResolvableChoiceSet(rule) {
  if (!isPlainObject(rule) || rule.key !== "ChoiceSet") return false;
  // Already answered (by the pack, or by us on an earlier pass).
  if (rule.selection !== undefined && rule.selection !== null) return false;
  // These modes intentionally permit no selection, support dropped items, or
  // have already been disabled by PF2e; leave all three to the native flow.
  if (rule.allowNoSelection || rule.allowedDrops || rule.ignored) return false;
  // A rule-level predicate decides whether the choice applies at all; it is
  // tested against live actor roll options in preCreate. Pre-answering one we
  // cannot evaluate could apply a choice that should never have been offered.
  if (hasPredicate(rule)) return false;
  return true;
}

/**
 * Validate opaque AI callback picks against groups that were actually offered.
 * Original source values never leave this module: ids map back locally only
 * after exact string and membership checks.
 * @param {{id:string, options:{id:string}[]}[]} groups
 * @param {unknown} picks
 * @returns {{choice:string, option:string}[]}
 */
export function validateChoicePicks(groups, picks) {
  if (!Array.isArray(groups) || !Array.isArray(picks)) return [];
  const groupById = new Map(groups.filter((g) => typeof g?.id === "string").map((g) => [g.id, g]));
  const counts = new Map();
  for (const pick of picks) {
    if (!isPlainObject(pick) || typeof pick.choice !== "string") continue;
    counts.set(pick.choice, (counts.get(pick.choice) ?? 0) + 1);
  }
  const accepted = [];
  for (const pick of picks) {
    if (!isPlainObject(pick) || typeof pick.choice !== "string" || typeof pick.option !== "string") continue;
    if (counts.get(pick.choice) !== 1) continue;
    const group = groupById.get(pick.choice);
    if (!group || !group.options.some((option) => option.id === pick.option)) continue;
    accepted.push({ choice: pick.choice, option: pick.option });
  }
  return accepted;
}

/**
 * Preselect every safe static ChoiceSet in one bounded batch. Deterministic
 * choices are applied locally; ambiguous choices are exposed to `selectChoices`
 * with opaque ids and only exact validated replies are written back. Anything
 * dynamic, predicated, oversized, or unanswered stays native.
 * @param {object[]} itemSources final item sources about to be embedded
 * @param {{keyAbility?: string, names?: string[]}} context
 * @param {object} config CONFIG.PF2E
 * @param {(uuid:string) => Promise<object|null>} loadItemSource
 * @param {((groups:{id:string,item:string,flag:string|null,prompt:string,options:{id:string,label:string}[]}[]) => Promise<unknown>)|null} selectChoices
 * @returns {Promise<{item:string,flag:string|null,value:string|number,label:string,reason:string}[]>}
 */
export async function preselectChoiceSets(itemSources, context = {}, config = {}, loadItemSource, selectChoices = null) {
  const applied = [];
  const pending = [];
  let optionCount = 0;

  const consider = ({ item, rule, set, target }) => {
    if (!isResolvableChoiceSet(rule)) return;
    const options = choiceSetOptions(rule.choices, config);
    if (!options) return;
    const pick = pickChoiceSelection(options, context);
    if (pick) {
      set(pick.value);
      applied.push({ item, flag: normalizeChoiceFlag(rule.flag), value: pick.value, label: pick.label, reason: pick.reason });
      return;
    }
    if (options.length > MAX_GROUP_OPTIONS) {
      console.warn(`simplypf2e | left ChoiceSet on "${item}" native: ${options.length} options exceed the ${MAX_GROUP_OPTIONS}-option batch limit`);
      return;
    }
    if (pending.length >= MAX_BATCH_GROUPS || optionCount + options.length > MAX_BATCH_OPTIONS) {
      // Never truncate one legal catalog or silently discard a group: native
      // PF2e prompting remains the safe fallback past the fixed request bound.
      console.warn(`simplypf2e | left ChoiceSet on "${item}" native: choice batch limit reached`);
      return;
    }
    const id = `choice-${pending.length + 1}`;
    const group = {
      id,
      item,
      flag: normalizeChoiceFlag(rule.flag),
      prompt: String(rule.prompt ?? rule.label ?? "Choose an option"),
      options: options.map((option, index) => ({ id: `${id}-option-${index + 1}`, label: option.label }))
    };
    pending.push({ group, options, set, target });
    optionCount += options.length;
  };

  for (let itemIndex = 0; itemIndex < (itemSources?.length ?? 0); itemIndex++) {
    const itemData = itemSources[itemIndex];
    const rules = itemData?.system?.rules;
    if (!Array.isArray(rules)) continue;
    for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex++) {
      const rule = rules[ruleIndex];
      consider({
        item: String(itemData.name ?? "?"), rule,
        set: (value) => { rule.selection = value; },
        target: `item-${itemIndex}-rule-${ruleIndex}`
      });

      if (!isPlainObject(rule) || rule.key !== "GrantItem") continue;
      if (typeof rule.uuid !== "string" || !rule.uuid || rule.uuid.includes("{") || hasPredicate(rule) || rule.ignored) continue;
      // Existing author/pack preselects are authoritative; never merge or
      // overwrite them, including an intentionally empty record.
      if (Object.prototype.hasOwnProperty.call(rule, "preselectChoices")) continue;
      let granted = null;
      try { granted = await loadItemSource?.(rule.uuid); }
      catch { granted = null; }
      const grantedRules = granted?.system?.rules;
      if (!Array.isArray(grantedRules)) continue;
      const flagCounts = new Map();
      for (const grantedRule of grantedRules) {
        const flag = normalizeChoiceFlag(grantedRule?.flag);
        if (flag) flagCounts.set(flag, (flagCounts.get(flag) ?? 0) + 1);
      }
      for (const grantedRule of grantedRules) {
        const flag = normalizeChoiceFlag(grantedRule?.flag);
        // GrantItem's native lookup takes the first matching flag only. Do not
        // invent a precedence rule for malformed duplicate flag sources: all
        // colliding flags remain native.
        if (!flag || flagCounts.get(flag) !== 1) continue;
        consider({
          item: `${itemData.name ?? "?"} → ${granted.name ?? "?"}`,
          rule: grantedRule,
          set: (value) => { rule.preselectChoices = { ...(rule.preselectChoices ?? {}), [flag]: value }; },
          target: `grant-${itemIndex}-rule-${ruleIndex}-flag-${flag}`
        });
      }
    }
  }

  if (!pending.length) return applied;
  if (typeof selectChoices !== "function") {
    console.warn(`simplypf2e | ${pending.length} static ChoiceSet choice(s) remain native: no choice-selection callback was provided`);
    return applied;
  }

  let result;
  try { result = await selectChoices(pending.map((entry) => entry.group)); }
  catch (error) {
    console.warn("simplypf2e | choice-selection callback failed; leaving static ChoiceSets native", error);
    return applied;
  }
  const picks = validateChoicePicks(pending.map((entry) => entry.group), result?.picks ?? result);
  const byGroup = new Map(pending.map((entry) => [entry.group.id, entry]));
  const usedTargets = new Set();
  for (const pick of picks) {
    const entry = byGroup.get(pick.choice);
    if (!entry || usedTargets.has(entry.target)) continue;
    const optionIndex = entry.group.options.findIndex((option) => option.id === pick.option);
    if (optionIndex < 0) continue;
    const option = entry.options[optionIndex];
    entry.set(option.value);
    usedTargets.add(entry.target);
    applied.push({ item: entry.group.item, flag: entry.group.flag, value: option.value, label: option.label, reason: "callback" });
  }
  if (picks.length < pending.length) {
    console.warn(`simplypf2e | ${pending.length - picks.length} static ChoiceSet choice(s) remain native after callback`);
  }
  return applied;
}
