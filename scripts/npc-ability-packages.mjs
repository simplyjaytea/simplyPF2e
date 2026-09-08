import { getPacksFor, getDocument, isIssuedCandidate } from "./compendium.mjs";
import * as T from "./tables.mjs";

/**
 * NPC ability packages are source graphs, never mini PC builds. The native
 * sources checked for this boundary are PF2e 8.5.0 and master (2026-09-09):
 * - actor/npc/document.ts: NPC allowedItemTypes excludes feat; classDC is a
 *   native level-based value; synthetic weapons become native melee attacks.
 * - item/feat/document.ts: prepareActorData throws on non-character actors.
 * - rules/rule-element/grant-item/rule-element.ts: the original granted type
 *   prepares before creation; ChoiceSet can open a prompt; allowDuplicate
 *   defaults TRUE. Only explicitly nonduplicating, unconditional grants pass.
 * - rules/rule-element/strike.ts: replaceAll only runs for characters. Such
 *   stances cannot be called complete simply because a strike appears.
 * - static/lang/re-en.json: StunningFist.Note uses against:monk, which resolves
 *   to DC 0 on NPCs. text-editor.ts getCheckDC accepts dc:resolve(...), and
 *   actor/base.ts getRollData returns {actor:this}; attributes is a getter.
 *
 * Every output rule is cloned from the installed source. The sole DC bridge
 * edits the native, localized Stunning Blows Note; no rule is constructed.
 * Ordinary strike, save, condition and effect controls remain PF2e controls.
 */
const INFRASTRUCTURE_PACKS = new Set(["pf2e.actionspf2e", "pf2e.feat-effects", "pf2e.conditionitems"]);
const FLURRY_FEATURE = "Compendium.pf2e.classfeatures.Item.NLHHHiAcdnZ5ohc2";
const FLURRY_ACTION = "Compendium.pf2e.actionspf2e.Item.nbfNETdpee8CVM17";
const STUNNING = "Compendium.pf2e.feats-srd.Item.8bMmGBO6gsMfWZk3";
const SUDDEN_CHARGE = "Compendium.pf2e.feats-srd.Item.qQt3CMrhLkUV1wCv";
const STUNNED = "Compendium.pf2e.conditionitems.Item.dfCMdR4wnpbYNTix";
const STUNNING_NOTE = "PF2E.SpecificRule.Monk.StunningFist.Note";
const DC_BRIDGE = "dc:resolve(@actor.attributes.classDC.value)";
// Reviewed prose-only behavior is source-bound. A changed description is an
// unsupported source revision, even when the old identifying words remain.
const FLURRY_DESCRIPTION = "<p>Make two unarmed Strikes. If both hit the same creature, combine their damage for the purpose of resistances and weaknesses. Apply your multiple attack penalty to the Strikes normally. As it has the flourish trait, you can use Flurry of Blows only once per turn.</p>";
const FLURRY_FEATURE_DESCRIPTION = "<p>Make two unarmed Strikes. If both hit the same creature, combine their damage for the purpose of resistances and weaknesses. Apply your multiple attack penalty to the Strikes normally. As a flourish ability, you can use Flurry of Blows only once per turn.</p>";
const CHARGE_DESCRIPTION = "<p>With a quick sprint, you dash up to your foe and swing. Stride twice. If you end your movement within melee reach of at least one enemy, you can make a melee Strike against that enemy. You can use Sudden Charge while Burrowing, Climbing, Flying, or Swimming instead of Striding if you have the corresponding movement type.</p>";
export const NPC_ABILITY_BUDGET = 3;
const MAX_NODES = 24;
const MAX_DEPTH = 8;
const MAX_EXAMINED = 128;
const requestStores = new WeakMap();
const candidatePackages = new WeakMap();
const issuedPlans = new WeakSet();
const expectations = new WeakMap();
const SIMPLE_SELECTORS = new Set([
  "all", "ac", "perception", "fortitude", "reflex", "will", "saving-throw",
  "attack", "attack-roll", "strike-attack-roll", "damage", "strike-damage", "speed",
  "acrobatics", "arcana", "athletics", "crafting", "deception", "diplomacy", "intimidation",
  "medicine", "nature", "occultism", "performance", "religion", "society", "stealth", "survival", "thievery"
]);
const RULE_FIELDS = {
  RollOption: new Set(["key", "domain", "option", "toggleable", "value", "label", "predicate", "priority"]),
  FlatModifier: new Set(["key", "selector", "type", "value", "label", "slug", "predicate", "priority", "hideIfDisabled", "force"]),
  Note: new Set(["key", "selector", "text", "title", "predicate", "outcome", "visibility", "priority"]),
  GrantItem: new Set(["key", "uuid", "allowDuplicate", "flag", "onDeleteActions", "priority"])
};

function failure(code, message) {
  const error = new Error(`NPC ability package: ${message}`);
  error.code = code;
  return error;
}
function unsupported(message) { return failure("NPC_ABILITY_UNSUPPORTED", message); }
function clone(value) { return structuredClone(value); }
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}
function checkAbort(signal) {
  if (signal?.aborted) {
    const error = signal.reason instanceof Error ? signal.reason : new Error("NPC ability selection cancelled");
    error.cancelled = true;
    throw error;
  }
}
function uuidParts(uuid) {
  const match = /^Compendium\.([^.]+\.[^.]+)\.Item\.(.+)$/.exec(String(uuid));
  return match ? { packId: match[1], id: match[2] } : null;
}
function sourceUuid(ref) { return `Compendium.${ref.packId}.Item.${ref._id}`; }
function fingerprint(data) {
  return JSON.stringify({ name: data.name, type: data.type, system: data.system, flags: data.flags ?? {} });
}
function meaningful(value) {
  if (value == null || value === false || value === "" || value === 0) return false;
  return typeof value === "object" ? Object.values(value).some(meaningful) : true;
}
function selectors(value) { return Array.isArray(value) ? value : [value]; }
function nativeUnarmed(concept) {
  return (concept.strikes ?? []).some((strike) => strike.type !== "ranged" && strike.traits?.includes("unarmed"));
}

class SourceStore {
  constructor(concept, signal) {
    this.concept = concept;
    this.signal = signal;
    this.docs = new Map();
    this.indexes = new Map();
    this.enabled = new Set([...getPacksFor("feats"), ...getPacksFor("classFeatures"), ...getPacksFor("abilities")]);
    this.prerequisitePacks = [...new Set([...getPacksFor("feats"), ...getPacksFor("classFeatures")])];
  }
  async index(packId) {
    checkAbort(this.signal);
    if (!this.indexes.has(packId)) {
      const pack = globalThis.game?.packs?.get(packId);
      if (!pack?.getIndex) throw unsupported(`source pack ${packId} is unavailable`);
      this.indexes.set(packId, Promise.resolve(pack.getIndex({ fields: ["type", "system.level.value"] })));
    }
    const index = await this.indexes.get(packId);
    checkAbort(this.signal);
    return Array.isArray(index) ? index : [...index.values()];
  }
  async load(uuid, { linked = false } = {}) {
    checkAbort(this.signal);
    const parsed = uuidParts(uuid);
    if (!parsed || (!this.enabled.has(parsed.packId) && !(linked && INFRASTRUCTURE_PACKS.has(parsed.packId)))) {
      throw unsupported(`dependency source is not enabled: ${uuid}`);
    }
    let id = parsed.id;
    if (!/^[a-zA-Z0-9]{16}$/.test(id)) {
      // Pack sources contain name UUIDs before compilation. Resolve a literal
      // link by one exact index hit, never by fuzzy matching or class guessing.
      const hits = (await this.index(parsed.packId)).filter((entry) => entry._id === id || entry.name === id);
      if (hits.length !== 1) throw unsupported(`dependency reference is missing or ambiguous: ${uuid}`);
      id = hits[0]._id;
    }
    const canonical = `Compendium.${parsed.packId}.Item.${id}`;
    if (!this.docs.has(canonical)) {
      this.docs.set(canonical, (async () => {
        const doc = await getDocument({ packId: parsed.packId, _id: id });
        checkAbort(this.signal);
        if (!doc || doc.uuid !== canonical || typeof doc.toObject !== "function") {
          throw unsupported(`exact source could not be loaded: ${canonical}`);
        }
        return { uuid: canonical, doc, data: doc.toObject() };
      })());
    }
    return this.docs.get(canonical);
  }
  async namedPrerequisite(name) {
    const hits = [];
    for (const packId of this.prerequisitePacks) {
      for (const entry of await this.index(packId)) {
        if (entry.type === "feat" && entry.name?.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase()) {
          hits.push(`Compendium.${packId}.Item.${entry._id}`);
        }
      }
    }
    const exact = [...new Set(hits)];
    if (exact.length !== 1) throw unsupported(`prerequisite "${name}" has no unique enabled exact source`);
    return exact[0];
  }
}

function storeFor(concept, signal, fresh = false) {
  if (!concept || typeof concept !== "object") throw unsupported("a normalized NPC concept is required");
  if (fresh || !requestStores.has(concept)) requestStores.set(concept, new SourceStore(concept, signal));
  const store = requestStores.get(concept);
  store.signal = signal;
  return store;
}

/** Only exact names, explicit UUIDs and simple alternatives are discoverable.
 * Skill ranks and other PC prerequisite prose have no NPC eligibility model. */
export function npcPrerequisiteAlternatives(value) {
  if (typeof value !== "string" || !value.trim()) throw unsupported("unreadable prerequisite");
  const text = value.trim();
  const uuid = /^@UUID\[([^\]]+)\](?:\{[^}]*\})?$/.exec(text);
  if (uuid) return [{ uuid: uuid[1] }];
  if (/\b(trained|expert|master|legendary|proficiency|level|class feature|spellcasting|spell slots?|focus pool|ability modifier)\b|[;<>\d]/i.test(text)) {
    throw unsupported(`prerequisite cannot be proven for an NPC: ${text}`);
  }
  const alternatives = text.split(/\s+or\s+/i);
  if (alternatives.length > 4 || alternatives.some((part) => !/^[\p{L}][\p{L}\p{M}'’ -]*$/u.test(part.trim()))) {
    throw unsupported(`prerequisite cannot be resolved automatically: ${text}`);
  }
  return alternatives.map((name) => ({ name: name.trim() }));
}

function localizedNote(rule) {
  if (typeof rule.text !== "string" || !rule.text.trim()) throw unsupported("a native Note is unreadable");
  if (!rule.text.startsWith("PF2E.")) return rule.text;
  const text = globalThis.game?.i18n?.localize?.(rule.text);
  if (typeof text !== "string" || !text || text === rule.text) throw unsupported(`native rule localization is unavailable: ${rule.text}`);
  return text;
}

/** Preserve the installed Note including its save trait and condition links. */
export function npcStunningNote(rule) {
  if (rule.key !== "Note" || rule.text !== STUNNING_NOTE || rule.selector !== "strike-damage"
    || JSON.stringify(rule.predicate) !== '["stunning-blows"]') throw unsupported("Stunning Blows source rules changed");
  const text = localizedNote(rule);
  if (!text.includes("@Check[fortitude|against:monk|") || !text.includes("traits:incapacitation")
    || !text.includes(STUNNED)) throw unsupported("Stunning Blows native save/condition source changed");
  const data = clone(rule);
  data.text = text.replace("|against:monk|", `|${DC_BRIDGE}|`);
  return data;
}

function checkPredicate(value, options) {
  if (value == null) return;
  if (Array.isArray(value)) { value.forEach((child) => checkPredicate(child, options)); return; }
  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length !== 1 || !["and", "or", "not", "nor", "nand"].includes(keys[0])) {
      throw unsupported("predicate needs unavailable NPC ranks, resources or equipment state");
    }
    return checkPredicate(value[keys[0]], options);
  }
  if (typeof value !== "string" || (!options.has(value)
    && !/^(?:self:condition:|target:condition:|origin:condition:|item:(?:trait:|slug:|damage:|melee$|ranged$)|action:)/.test(value))) {
    throw unsupported(`predicate has no verified NPC provider: ${String(value)}`);
  }
}

function checkRule(rule, options) {
  if (!rule || !RULE_FIELDS[rule.key]) throw unsupported(`native rule ${rule?.key ?? "unknown"} has no complete NPC bridge`);
  if (Object.keys(rule).some((field) => !RULE_FIELDS[rule.key].has(field))) throw unsupported(`native ${rule.key} rule has unsupported fields`);
  checkPredicate(rule.predicate, options);
  if (rule.key === "GrantItem") {
    if (rule.allowDuplicate !== false || typeof rule.uuid !== "string" || !uuidParts(rule.uuid)) {
      throw unsupported("GrantItem must have an exact unconditional, nonduplicating NPC-valid source");
    }
    return;
  }
  if (rule.key === "RollOption") {
    if (typeof rule.option !== "string" || !/^[a-z][a-z0-9-]*$/.test(rule.option)
      || !SIMPLE_SELECTORS.has(rule.domain ?? "all")
      || (rule.toggleable != null && typeof rule.toggleable !== "boolean")
      || (rule.value != null && typeof rule.value !== "boolean")) throw unsupported("RollOption needs unsupported native data");
    return;
  }
  if (!selectors(rule.selector).every((selector) => SIMPLE_SELECTORS.has(selector))) throw unsupported(`selector is unavailable on NPCs: ${rule.selector}`);
  if (rule.key === "FlatModifier" && (!Number.isFinite(rule.value)
    || !["circumstance", "status", "item", "untyped"].includes(rule.type))) throw unsupported("modifier depends on unsupported PC values");
  if (rule.key === "Note") {
    const text = localizedNote(rule);
    if (/against:|@actor\.(?!attributes\.classDC\.value)|\{actor\||\{item\|(?!name\})/.test(text)) {
      throw unsupported("native Note refers to an unavailable statistic");
    }
  }
}

/** Shape conversion only. Execution authority comes from the graph gate. */
export function featToAction(feat, compendiumSource = null) {
  const system = feat.system ?? {};
  const actionType = system.actionType?.value ?? "passive";
  const icon = { action: "OneAction", reaction: "Reaction", free: "FreeAction", passive: "Passive" }[actionType] ?? "Passive";
  const data = {
    name: feat.name, type: "action", img: feat.img ?? `systems/pf2e/icons/actions/${icon}.webp`,
    system: {
      actionType: { value: actionType },
      actions: { value: actionType === "action" ? (system.actions?.value ?? 1) : null },
      category: "offensive", description: clone(system.description ?? { value: "" }),
      traits: clone(system.traits ?? { value: [] }), rules: clone(system.rules ?? []),
      slug: system.slug ?? null, selfEffect: clone(system.selfEffect ?? null),
      ...(system.frequency ? { frequency: clone(system.frequency) } : {})
    }
  };
  if (compendiumSource) data._stats = { compendiumSource };
  return data;
}

function convertedAction(source) {
  const data = source.data.type === "feat" ? featToAction(source.data, source.uuid) : clone(source.data);
  delete data._id;
  delete data.folder;
  delete data.ownership;
  data._stats ??= {};
  data._stats.compendiumSource = source.uuid;
  return data;
}

function ordinaryAction(source) {
  const { uuid, data } = source;
  if (uuid === FLURRY_ACTION) {
    if (data.type !== "action" || data.system.actionType?.value !== "action" || data.system.actions?.value !== 1
      || !data.system.traits?.value?.includes("flourish")
      || data.system.description?.value !== FLURRY_DESCRIPTION
      || meaningful(data.system.frequency) || meaningful(data.system.selfEffect)) throw unsupported("Flurry of Blows source behavior changed");
    return true;
  }
  if (uuid === SUDDEN_CHARGE) {
    if (data.system.actionType?.value !== "action" || data.system.actions?.value !== 2
      || data.system.description?.value !== CHARGE_DESCRIPTION
      || meaningful(data.system.frequency) || meaningful(data.system.selfEffect)) throw unsupported("Sudden Charge source behavior changed");
    return true;
  }
  return false;
}

function checkSource(source) {
  const { data } = source;
  if (!["feat", "action", "effect", "condition"].includes(data.type)) throw unsupported(`item type ${data.type} cannot execute as an NPC ability`);
  const system = data.system ?? {};
  if (meaningful(system.subfeatures) || meaningful(system.items) || meaningful(system.location)) {
    throw unsupported(`${data.name} depends on PC feature preparation`);
  }
  if ((system.traits?.value ?? []).some((trait) => ["rage", "bravado", "finisher", "hex", "composition", "spellshape", "summon"].includes(trait))) {
    throw unsupported(`${data.name} needs a class runtime that NPCs do not provide`);
  }
  const text = system.description?.value ?? "";
  if (/against:|defense:|@actor\.|\{actor\|/.test(text)
    || (source.uuid !== STUNNING && /\bclass DC\b/i.test(text))) {
    throw unsupported(`${data.name} description needs an unavailable statistic or actor field`);
  }
  if (/\b(?:focus points?|spell slots?|spell repertoire|spellbook|panache|rage|kinetic aura|infused reagents?|versatile vials?|implement|spellcasting archetype)\b/i.test(text)) {
    throw unsupported(`${data.name} depends on an unsupported resource or class capability`);
  }
  if (!Array.isArray(system.rules ?? [])) throw unsupported(`${data.name} rules are unreadable`);
}

async function buildGraph(roots, store) {
  const nodes = new Map();
  const visiting = new Set();
  const rootUuids = [];
  let needsUnarmed = false;
  let needsMelee = false;
  function promote(uuid, role) {
    const node = nodes.get(uuid);
    if (!node) return;
    if (!node.roles.includes(role)) node.roles.push(role);
    if (node.role === "equivalent-source") return;
    node.role = ["root", "support", "grant", "asset"].find((candidate) => node.roles.includes(candidate));
    // A previously dormant source can later be needed as an active grant or
    // prerequisite. Its own GrantItem children then become active as well.
    if (node.role !== "asset") for (const grant of node.grants) promote(grant, "grant");
  }
  async function visit(uuid, role = "support", depth = 0, linked = false) {
    if (depth > MAX_DEPTH || nodes.size >= MAX_NODES) throw unsupported("dependency expansion exceeds the supported limit");
    let source = await store.load(uuid, { linked });
    if (visiting.has(source.uuid)) throw unsupported(`cyclic prerequisite: ${source.data.name}`);
    if (role === "asset" && (source.data.system?.prerequisites?.value?.length
      || source.data.system?.rules?.some((rule) => rule.key === "GrantItem"))) {
      throw unsupported(`${source.data.name} activates an unsupported dependency package`);
    }
    if (nodes.has(source.uuid)) {
      const existing = nodes.get(source.uuid);
      promote(source.uuid, role);
      if (existing.equivalent) return visit(existing.equivalent, role, depth + 1, true);
      return source.uuid;
    }
    visiting.add(source.uuid);
    checkSource(source);
    const level = source.data.system?.level?.value ?? 0;
    if (!Number.isInteger(level) || level > Math.max(1, store.concept.level)) throw unsupported(`${source.data.name} exceeds NPC level ${store.concept.level}`);
    const sourceNode = { uuid: source.uuid, name: source.data.name, type: source.data.type, role, roles: [role],
      fingerprint: fingerprint(source.data), item: null, grants: [], assets: [] };
    nodes.set(source.uuid, sourceNode);
    if (source.uuid === FLURRY_FEATURE) {
      if (source.data.type !== "feat" || source.data.name !== "Flurry of Blows"
        || source.data.system?.rules?.length || source.data.system.prerequisites?.value?.length
        || source.data.system.actionType?.value !== "action" || source.data.system.actions?.value !== 1
        || source.data.system.description?.value !== FLURRY_FEATURE_DESCRIPTION
        || JSON.stringify(source.data.system.traits?.value?.slice().sort()) !== '["flourish","monk"]'
        || meaningful(source.data.system.frequency) || meaningful(source.data.system.selfEffect)) throw unsupported("Flurry class-feature source changed");
      sourceNode.role = "equivalent-source";
      const equivalent = await visit(FLURRY_ACTION, role === "root" ? "root" : "support", depth + 1, true);
      sourceNode.equivalent = equivalent;
      visiting.delete(source.uuid);
      return equivalent;
    }
    const prerequisites = source.data.system?.prerequisites?.value ?? [];
    if (!Array.isArray(prerequisites)) throw unsupported(`${source.data.name} prerequisites are unreadable`);
    for (const prerequisite of prerequisites) {
      const alternatives = npcPrerequisiteAlternatives(prerequisite?.value);
      let accepted = false;
      let lastError;
      for (const alternative of alternatives) {
        // An unbuildable branch must leave no partial nodes or granted power.
        const snapshot = new Map([...nodes].map(([key, value]) => [key, clone(value)]));
        const oldNeedsUnarmed = needsUnarmed;
        const oldNeedsMelee = needsMelee;
        const oldVisiting = new Set(visiting);
        try {
          // Stunning Blows' verified source relationship outranks ambiguous
          // same-name content in other enabled packs. The feature still has to
          // be enabled and match its reviewed native equivalent contract.
          const prerequisiteUuid = source.uuid === STUNNING && alternative.name === "Flurry of Blows"
            ? FLURRY_FEATURE : alternative.uuid ?? await store.namedPrerequisite(alternative.name);
          await visit(prerequisiteUuid, "support", depth + 1);
          accepted = true;
          break;
        } catch (error) {
          if (store.signal?.aborted) throw error;
          nodes.clear(); snapshot.forEach((value, key) => nodes.set(key, value));
          visiting.clear(); oldVisiting.forEach((key) => visiting.add(key));
          needsUnarmed = oldNeedsUnarmed;
          needsMelee = oldNeedsMelee;
          lastError = error;
        }
      }
      if (!accepted) throw lastError ?? unsupported(`${source.data.name} has no supported prerequisite alternative`);
    }
    const data = convertedAction(source);
    const rules = data.system.rules ?? [];
    if (source.uuid === STUNNING) {
      if (rules.length !== 2 || rules[0].key !== "RollOption" || rules[0].domain !== "damage"
        || rules[0].option !== "stunning-blows" || rules[0].toggleable !== true) throw unsupported("Stunning Blows source rules changed");
      rules[1] = npcStunningNote(rules[1]);
      data.system.description.value += `<p>${rules[1].text}</p>`;
      await visit(STUNNED, "asset", depth + 1, true);
    }
    const options = new Set(rules.filter((rule) => rule.key === "RollOption").map((rule) => rule.option));
    for (const rule of rules) {
      checkRule(rule, options);
      if (rule.key === "GrantItem") {
        const granted = await store.load(rule.uuid, { linked: true });
        if (!["action", "effect"].includes(granted.data.type)) throw unsupported(`GrantItem would prepare NPC-invalid ${granted.data.type}: ${granted.data.name}`);
        const grantedUuid = await visit(granted.uuid, role === "asset" ? "asset" : "grant", depth + 1, true);
        rule.uuid = grantedUuid;
        nodes.get(source.uuid).grants.push(grantedUuid);
      }
    }
    if (data.system.selfEffect) {
      const selfEffect = await store.load(data.system.selfEffect.uuid, { linked: true });
      if (selfEffect.data.type !== "effect") throw unsupported(`${data.name} selfEffect is not a native effect`);
      const asset = await visit(selfEffect.uuid, "asset", depth + 1, true);
      data.system.selfEffect.uuid = asset;
      nodes.get(source.uuid).assets.push(asset);
    }
    if (source.data.type !== "condition" && !rules.length && !data.system.selfEffect && !ordinaryAction(source)) {
      throw unsupported(`${data.name} has unsupported prose-only execution`);
    }
    if (source.uuid === FLURRY_ACTION) needsUnarmed = true;
    if (source.uuid === SUDDEN_CHARGE) needsMelee = true;
    nodes.get(source.uuid).item = data;
    visiting.delete(source.uuid);
    return source.uuid;
  }
  for (const root of roots) rootUuids.push(await visit(root, "root"));
  // Assets (self effects and conditions) are verified but remain inactive.
  // Native GrantItem owns actual granted documents; do not embed a second copy.
  const all = [...nodes.values()];
  for (const node of all) {
    if (node.roles.includes("grant") && node.roles.some((role) => ["root", "support"].includes(role))) {
      throw unsupported(`${node.name} is both a direct prerequisite and a native grant`);
    }
  }
  // PF2e's GrantItem duplicate check sees persisted actor.items, not pending
  // documents in the same createEmbeddedDocuments batch. Separate roots are
  // staged sequentially by builder; repeated targets inside one native grant
  // tree cannot be promised to deduplicate and are rejected before any write.
  for (const node of all.filter((entry) => ["root", "support"].includes(entry.role))) {
    const seen = new Set();
    function inspectGrants(parent) {
      for (const uuid of parent.grants) {
        if (seen.has(uuid)) throw unsupported(`${node.name} repeats a grant within one native creation batch`);
        seen.add(uuid);
        inspectGrants(nodes.get(uuid));
      }
    }
    inspectGrants(node);
  }
  const embedded = all.filter((node) => ["root", "support"].includes(node.role) && node.item);
  const granted = all.filter((node) => node.role === "grant");
  const addUnarmed = (needsUnarmed && !nativeUnarmed(store.concept))
    || (needsMelee && !(store.concept.strikes ?? []).some((strike) => strike.type !== "ranged"));
  const cost = embedded.length + granted.length + Number(addUnarmed);
  if (cost > NPC_ABILITY_BUDGET) throw failure("NPC_ABILITY_BUDGET_EXCEEDED", `complete abilities cost ${cost}; maximum is ${NPC_ABILITY_BUDGET}`);
  const plan = {
    roots: [...new Set(rootUuids)],
    sources: all.map(({ uuid, name, type, role, fingerprint }) => ({ uuid, name, type, role, fingerprint })),
    items: embedded.map((node) => node.item),
    expectedItems: granted.map((node) => node.item),
    needsUnarmed: addUnarmed, cost, signatureCount: new Set(rootUuids).size,
    supportingCount: embedded.filter((node) => node.role === "support").length + granted.length + Number(addUnarmed)
  };
  issuedPlans.add(plan);
  return freeze(plan);
}

export function getNpcAbilityCandidatePackage(candidate) { return candidatePackages.get(candidate) ?? null; }

export async function filterNpcAbilityCandidates(candidates, { concept, limit = 16, signal } = {}) {
  const store = storeFor(concept, signal, true);
  const supported = [];
  const unavailable = [];
  const cap = Math.min(16, Math.max(1, Number(limit) || 16));
  let examined = 0;
  for (const candidate of candidates ?? []) {
    if (supported.length >= cap || examined >= MAX_EXAMINED) break;
    checkAbort(signal);
    examined++;
    try {
      if (!isIssuedCandidate(candidate.ref, getPacksFor("feats"))) throw unsupported("candidate was not issued from enabled feat sources");
      const plan = await buildGraph([sourceUuid(candidate.ref)], store);
      candidatePackages.set(candidate, freeze({ cost: plan.cost, sources: plan.sources, names: plan.sources.map((source) => source.name) }));
      supported.push(candidate);
    } catch (error) {
      if (signal?.aborted) throw error;
      unavailable.push({ candidate, reason: error.message, code: error.code ?? "NPC_ABILITY_UNSUPPORTED" });
    }
  }
  return { candidates: supported, unavailable, examined, truncated: examined < (candidates?.length ?? 0) && supported.length < cap };
}

export async function resolveNpcAbilityPackages(selected, { concept, signal, fresh = false } = {}) {
  const refs = (selected ?? []).map((selection) => selection.entry ?? selection.candidate);
  if (refs.some((ref) => !isIssuedCandidate(ref, getPacksFor("feats")))) throw unsupported("selected feat lacks an issued enabled source reference");
  return buildGraph([...new Set(refs.map(sourceUuid))], storeFor(concept, signal, fresh));
}

/** Resolve the complete graph again just before Actor.create. A successful
 * preview is not authority to execute changed or newly-disabled sources. */
export async function revalidateNpcAbilityPackages(plan, selected, { concept, signal } = {}) {
  if (!issuedPlans.has(plan)) throw unsupported("the ability package plan was not issued by this generation");
  const current = await resolveNpcAbilityPackages(selected, { concept, signal, fresh: true });
  if (JSON.stringify(current) !== JSON.stringify(plan)) throw unsupported("ability sources or NPC prerequisites changed after selection");
  return current;
}

/** Use the same GM Core strike tables as builder.mjs. Supplying an unarmed
 * strike is setup; the GM still chooses targets, MAP, saves and conditions. */
export function npcPackageUnarmedStrike(concept) {
  return {
    name: "Unarmed Strike", type: "melee", img: "systems/pf2e/icons/default-icons/melee.svg",
    system: {
      bonus: { value: T.lookup(T.STRIKE_ATTACK, concept.level, "moderate") },
      damageRolls: { unarmed: { damage: T.lookup(T.STRIKE_DAMAGE, concept.level, "moderate"), damageType: "bludgeoning", category: null } },
      traits: { value: ["agile", "nonlethal", "unarmed"] }, attackEffects: { value: [] }, range: null
    }
  };
}

/** Expectations remain transient; no module flags or hidden source rules. */
export function registerNpcAbilityExpectations(items, plan) {
  const sources = new Set(plan.sources.filter((source) => source.role !== "asset" && source.role !== "equivalent-source").map((source) => source.uuid));
  for (const item of items) {
    if (sources.has(item._stats?.compendiumSource)) expectations.set(item, { rules: clone(item.system?.rules ?? []), selfEffect: clone(item.system?.selfEffect ?? null) });
    else if (plan.needsUnarmed && item.name === "Unarmed Strike" && item.type === "melee") expectations.set(item, { unarmed: true });
  }
}

export function verifyNpcAbilityMechanics(actor, matched) {
  for (const { expected, actual } of matched) {
    const contract = expectations.get(expected);
    if (!contract) continue;
    const system = actual._source?.system ?? actual.system;
    if (contract.unarmed) {
      if (!system?.traits?.value?.includes("unarmed") || !Number.isFinite(system?.bonus?.value)) throw unsupported("native unarmed strike did not persist");
      continue;
    }
    const rules = system?.rules ?? [];
    for (const rule of contract.rules) {
      if (!rules.some((actualRule) => Object.entries(rule).every(([key, value]) => JSON.stringify(actualRule[key]) === JSON.stringify(value)))) {
        throw unsupported(`native rules did not persist for ${actual.name}`);
      }
    }
    if (contract.selfEffect && system?.selfEffect?.uuid !== contract.selfEffect.uuid) throw unsupported(`self-effect link did not persist for ${actual.name}`);
    if (contract.rules.some((rule) => rule.key === "Note" && rule.text.includes(DC_BRIDGE))
      && (!Number.isFinite(actor.system?.attributes?.classDC?.value) || actor.system.attributes.classDC.value <= 0)) {
      throw unsupported("native NPC class DC is unavailable for Stunning Blows");
    }
  }
}
