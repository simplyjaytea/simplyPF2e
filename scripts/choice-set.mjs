import { slugify } from "./text.mjs";

/**
 * Pre-resolve PF2e `ChoiceSet` rule elements on the item sources we are about
 * to embed, so PC creation never stops on a blocking `PickAThingPrompt`.
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
 * string | number | boolean | object; every case we handle here is a string.
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
 * FAIL OPEN — this module deliberately INVERTS project invariant #5 ("fail
 * closed: an unresolved pick is dropped, never guessed"). A ChoiceSet whose
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

/**
 * Port of pf2e `processChoicesFromData` (src/module/rules/helpers.ts) for the
 * two static shapes it supports, minus anything predicated:
 *   array  -> entries already carrying `{value, label}`
 *   object -> `{[key]: label}` / `{[key]: {label}}`, value is the KEY
 * @returns {{value: string|number, label: string}[]}
 */
function choicesFromData(data) {
  if (Array.isArray(data)) {
    return data
      .filter((c) => isPlainObject(c) && (typeof c.value === "string" || typeof c.value === "number") && !hasPredicate(c))
      .map((c) => ({ value: c.value, label: String(c.label ?? c.value) }));
  }
  if (!isPlainObject(data)) return [];
  const entries = Object.entries(data);
  if (!entries.every(([, c]) => typeof (isPlainObject(c) ? c.label : c) === "string")) return [];
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
 *   2. concept match — an option the AI concept already named (a clan weapon it
 *      gave the PC, a skill in its feat list, …);
 *   3. deterministic first option, reported so a GM can change it on the sheet.
 * @param {{value: string|number, label: string}[]} options
 * @param {{keyAbility?: string, names?: string[]}} [context]
 * @returns {{value: string|number, label: string, reason: "key-attribute"|"concept"|"first"}|null}
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
    for (const option of options) {
      const slugs = optionSlugs(option);
      if (names.some((n) => namesMatch(n, slugs))) return { ...option, reason: "concept" };
    }
  }

  return { ...options[0], reason: "first" };
}

/** Is this rule source a ChoiceSet we may safely pre-answer? */
function isResolvableChoiceSet(rule) {
  if (!isPlainObject(rule) || rule.key !== "ChoiceSet") return false;
  // Already answered (by the pack, or by us on an earlier pass).
  if (rule.selection !== undefined && rule.selection !== null) return false;
  // A rule-level predicate decides whether the choice applies at all; it is
  // tested against live actor roll options in preCreate. Pre-answering one we
  // cannot evaluate could apply a choice that should never have been offered.
  if (hasPredicate(rule)) return false;
  return true;
}

/**
 * Pre-answer every statically resolvable ChoiceSet on one item source,
 * MUTATING `itemData.system.rules[i].selection` in place.
 * @param {object} itemData an item source about to be embedded
 * @param {{keyAbility?: string, names?: string[]}} [context]
 * @param {object} [config] CONFIG.PF2E
 * @returns {{item: string, flag: string|null, value: string|number, label: string, reason: string}[]}
 */
export function applyChoiceSelections(itemData, context = {}, config = {}) {
  const rules = itemData?.system?.rules;
  if (!Array.isArray(rules)) return [];
  const applied = [];
  for (const rule of rules) {
    if (!isResolvableChoiceSet(rule)) continue;
    const options = choiceSetOptions(rule.choices, config);
    if (!options) continue; // fail open — the prompt still appears
    const pick = pickChoiceSelection(options, context);
    if (!pick) continue;
    rule.selection = pick.value;
    applied.push({
      item: String(itemData.name ?? "?"),
      flag: normalizeChoiceFlag(rule.flag),
      value: pick.value,
      label: pick.label,
      reason: pick.reason
    });
  }
  return applied;
}

/**
 * Pre-answer the ChoiceSets of items granted by this item's GrantItem rules,
 * via the granting rule's own `preselectChoices` record (see the module header
 * for the verified pf2e source). One level deep only, by construction.
 *
 * Only grantee ChoiceSets that declare an explicit `flag` are handled: the
 * implicit default is `sluggify(slug ?? item.slug ?? item.name, {camel: "dromedary"})`,
 * and re-deriving pf2e's sluggify here would be exactly the kind of recalled-
 * instead-of-verified guess that keeps biting this repo. No flag -> fail open.
 * `preselectChoices` also only accepts string|number values (its
 * `isValidPreselect` guard), so object selections are skipped.
 *
 * @param {object} itemData item source about to be embedded (mutated)
 * @param {(uuid: string) => Promise<object|null>} loadItemSource resolves a
 *   compendium UUID to a plain item source (null when unavailable)
 * @param {{keyAbility?: string, names?: string[]}} [context]
 * @param {object} [config] CONFIG.PF2E
 * @returns {Promise<object[]>} the same report shape as applyChoiceSelections
 */
export async function applyGrantPreselections(itemData, loadItemSource, context = {}, config = {}) {
  const rules = itemData?.system?.rules;
  if (!Array.isArray(rules)) return [];
  const applied = [];
  for (const rule of rules) {
    if (!isPlainObject(rule) || rule.key !== "GrantItem") continue;
    if (typeof rule.uuid !== "string" || !rule.uuid || rule.uuid.includes("{")) continue;
    if (isPlainObject(rule.preselectChoices) && Object.keys(rule.preselectChoices).length) continue;
    if (hasPredicate(rule)) continue; // grant may not even happen; don't guess for it

    let granted = null;
    try { granted = await loadItemSource(rule.uuid); }
    catch { granted = null; }
    const grantedRules = granted?.system?.rules;
    if (!Array.isArray(grantedRules)) continue;

    const preselect = {};
    for (const grantedRule of grantedRules) {
      if (!isResolvableChoiceSet(grantedRule)) continue;
      const flag = normalizeChoiceFlag(grantedRule.flag);
      if (!flag) continue;
      const options = choiceSetOptions(grantedRule.choices, config);
      if (!options) continue;
      const pick = pickChoiceSelection(options, context);
      if (!pick || (typeof pick.value !== "string" && typeof pick.value !== "number")) continue;
      preselect[flag] = pick.value;
      applied.push({
        item: `${itemData.name ?? "?"} → ${granted.name ?? "?"}`,
        flag,
        value: pick.value,
        label: pick.label,
        reason: pick.reason
      });
    }
    if (Object.keys(preselect).length) rule.preselectChoices = preselect;
  }
  return applied;
}
