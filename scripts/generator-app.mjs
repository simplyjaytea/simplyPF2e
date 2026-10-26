import {
  MODULE_ID, SETTINGS, getProviderAuthWarningKey, getProviderRequestConfig,
  authorizeApiKeyForCurrentBaseUrl
} from "./settings.mjs";
import {
  generateConcept, generateLoot, selectSpells, chooseSpellFocus, selectEquipment, selectLoot, designEncounter,
  generatePCConcept, generatePCLoot, selectAncestryBackgroundClass, selectFeats, selectCreatureFeats, selectCreatureAbilities, selectCharacterChoices,
  generateHazardConcept
} from "./ai.mjs";
import { AI_TASK, taskMaxTokens } from "./ai-task-profiles.mjs";
import {
  getSpellCandidates, getEquipmentCandidates, getLootCandidates, getScrollSpellCandidates,
  getDocument, getAncestryCandidates, getBackgroundCandidates, getClassCandidates, getHeritageCandidates, getFocusSpellCandidates, getFeatCandidates, getCreatureFeatCandidates, normalizeCreatureFeatName, getAbilityCandidates, sourceReadiness
} from "./compendium.mjs";
import {
  normalizeConcept, normalizeLoot, resolveConcept, resolveLoot, computeStats, createActor,
  applyTreasureBudget, equipmentValueGp, lootValueGp, parseCoins, parseScroll, slugify,
  dedupeLootAgainstEquipment, enforceNamedLootBudget
} from "./builder.mjs";
import {
  normalizePCConcept, resolvePCConcept, resolveFeatPicks, createCharacterActor, pcStartingWealthGp, validatePCIdentityRequirements
} from "./pc-builder.mjs";
import { pcSpellcastingProfile, pcSpellPlan } from "./pc-tables.mjs";
import { reviewUnresolvedChoices } from "./choice-set.mjs";
import { normalizeSkillPriorities, skillPriorityOrder } from "./pc-skills.mjs";
import { treasureBudget, TREASURE_AMOUNT_MULTIPLIER } from "./tables.mjs";
import { getCustomPresets, findPreset, examplePrompt, randomBrief, presetPickerGroups } from "./presets.mjs";
import { ManagePresetsApp } from "./manage-presets-app.mjs";
import { SourcesConfigApp } from "./sources-app.mjs";
import { composeEncounter, THREATS } from "./encounter.mjs";
import { findBestiaryScaffold } from "./art.mjs";
import { assertComplete, completionManifest, completionSummary } from "./completion.mjs";
import { verifyCreatedActor, persistedExpectedItems } from "./post-create.mjs";
import { supportedClassCandidates } from "./pc-support.mjs";
import { SpfApp } from "./app-base.mjs";
import { filterNpcAbilityCandidates, resolveNpcAbilityPackages } from "./npc-ability-packages.mjs";

import { classPathBridges, pcIdentityKey, resolvePCIdentity, applyPCIdentity, assertPCIdentity } from "./pc-identity.mjs";
import { getClassPathCandidates } from "./class-paths.mjs";
import { getBackgroundLoreOptions } from "./pc-background-lore.mjs";
import { assertExperimentalToolAccess, experimentalToolRefusal } from "./experimental-tools.mjs";
import { HAZARD_DISABLE_SKILLS, HazardConceptError, normalizeHazardConcept, buildHazardSource, describeHazard } from "./hazard-builder.mjs";
import { HAZARD_MIN_LEVEL, HAZARD_MAX_LEVEL, hazardSaveDC } from "./hazard-tables.mjs";
import { HAZARD_LABEL_KEYS } from "./hazard-labels.mjs";
import { esc } from "./text.mjs";
import { validateForgeRequest } from "./forge-command.mjs";
import { heritageMatchesAncestry } from "./pc-builder.mjs";
import { applyPCEdit, validatePCEditCompletion } from "./pc-edit.mjs";
import { pcEditFromControl, pcEditorInvalidatedControls, pcEditorSelections } from "./pc-editor.mjs";

const PC_IDENTITY_FIELDS = ["name", "class", "ancestry", "heritage", "background", "backgroundLore", "keyAbility", "classPath"];

/* ---- Hazard mode (experimental, WP5 H3b). It exists only while the experimentalTools gate is open. ---- */

/** Hazard previews this module issued. Create accepts only these objects. */
const issuedHazards = new WeakSet();

/** Hazard items are module-built from the GM Core tables, so there is nothing to resolve in a compendium. */
const HAZARD_MANIFEST = Object.freeze({ complete: true });

const HAZARD_RANK_KEYS = Object.freeze({
  untrained: "SIMPLYPF2E.Skills.Rank0", trained: "SIMPLYPF2E.Skills.Rank1", expert: "SIMPLYPF2E.Skills.Rank2",
  master: "SIMPLYPF2E.Skills.Rank3", legendary: "SIMPLYPF2E.Skills.Rank4"
});
const HAZARD_RARITY_KEYS = Object.freeze({
  common: "SIMPLYPF2E.Rarity.Common", uncommon: "SIMPLYPF2E.Rarity.Uncommon",
  rare: "SIMPLYPF2E.Rarity.Rare", unique: "SIMPLYPF2E.Rarity.Unique"
});
const HAZARD_SAVE_KEYS = Object.freeze({
  fortitude: "SIMPLYPF2E.Preview.Fort", reflex: "SIMPLYPF2E.Preview.Ref", will: "SIMPLYPF2E.Preview.Will"
});
/** Builder codes for AI text the module refused: a number, enricher syntax or markup in prose. */
const HAZARD_PROSE_CODES = new Set(["ENRICHER_IN_TEXT", "NUMBER_IN_TEXT", "BAD_TEXT", "BAD_NAME"]);
const HAZARD_ROUTINE_CODES = new Set(["ROUTINE_REQUIRED", "BAD_ROUTINE_ACTIONS"]);
const HAZARD_FIELD_BY_CODE = Object.freeze({ NO_DISABLE: "disable", MISSING_REACTION: "reaction", BAD_LEVEL: "level" });

/** True only while the experimental gate is open. Any failure to read the gate stays closed. */
function hazardGateOpen() {
  try { return experimentalToolRefusal() === null; } catch { return false; }
}

/** The level range of a mode. Hazards use the table range; creatures go -1 to 24 and PCs 1 to 20. */
function levelRangeFor(mode) {
  if (mode === "hazard") return [HAZARD_MIN_LEVEL, HAZARD_MAX_LEVEL];
  return ["monster", "npc"].includes(mode) ? [-1, 24] : [1, 20];
}

/** Trait and damage type slugs the running pf2e system offers, or null when either list is empty. */
function hazardCatalogs() {
  const config = globalThis.CONFIG?.PF2E;
  const traitsCatalog = Object.keys(config?.hazardTraits ?? {});
  const damageTypes = Object.keys(config?.damageTypes ?? {});
  return traitsCatalog.length && damageTypes.length ? { traitsCatalog, damageTypes } : null;
}

/** Register a reviewed hazard as issued by this module, and freeze it. */
function issueHazard(draft) {
  const issued = Object.freeze({ ...draft });
  issuedHazards.add(issued);
  return issued;
}

/** The message for a failed hazard run. A refused concept maps to the Hazard error keys; other errors speak for themselves. */
function hazardErrorText(err) {
  if (err instanceof HazardConceptError) {
    if (HAZARD_ROUTINE_CODES.has(err.code)) return game.i18n.localize("SIMPLYPF2E.Hazard.Errors.Routine");
    const field = HAZARD_FIELD_BY_CODE[err.code] ?? /^[\w.]+/.exec(String(err.message))?.[0] ?? "concept";
    const key = HAZARD_PROSE_CODES.has(err.code) ? "SIMPLYPF2E.Hazard.Errors.Prose" : "SIMPLYPF2E.Hazard.Errors.Field";
    return game.i18n.format(key, { field });
  }
  return err?.message ?? String(err);
}

const creatureFeatRefKey = (ref) => `${ref?.packId ?? ""}:${ref?._id ?? ""}`;

/** Bind named requirements to local source names, never provider required/optional labels.
 * Unrecognized prose is not an executable requirement parser. A draft name that
 * occurs verbatim in the original brief still binds when its source is missing.
 */
export function creatureFeatRequirements(prompt, draft, candidates) {
  const text = ` ${normalizeCreatureFeatName(prompt)} `;
  const names = new Map();
  for (const item of [...candidates, ...draft]) {
    const name = typeof item === "string" ? item : item?.name;
    const normalized = normalizeCreatureFeatName(name);
    if (!normalized || !text.includes(` ${normalized} `) || names.has(normalized)) continue;
    const clauses = String(prompt ?? "").split(/[.!?;,\n]/).map((clause) => ` ${normalizeCreatureFeatName(clause)} `);
    const mentions = clauses.filter((clause) => clause.includes(` ${normalized} `));
    const ambiguous = mentions.some((clause) => {
      // A name/title or negative statement is not permission to add mechanics.
      if (/\b(?:no|not|never|without|neither|nor|avoid|exclude|excluded|excluding|except|forbidden|prohibited|unwanted|omit|remove|instead of|rather than|(?:don|doesn|didn|won|wouldn|shouldn|mustn|can|couldn) t|named|called|titled|nickname|title|sign|story|tale|song|known as)\b/.test(clause)) return true;
      const at = clause.indexOf(` ${normalized} `);
      const before = clause.slice(0, at + 1);
      const after = clause.slice(at + normalized.length + 1);
      // Recognize only a small positive mechanical request grammar. Arbitrary
      // prose mentions stay ambiguous, even when the AI proposes the same feat.
      const requested = /\b(?:with|has|have|having|use|uses|using|give|grant|include|requires?)(?: (?:this|the|an?|npc|creature|character|feat|ability|action|power)){0,4} $/.test(before)
        || /\b(?:required )?(?:feat|ability|action|power) $/.test(before)
        || /^ (?:feat|ability|action|power)\b/.test(after);
      return !requested;
    });
    names.set(normalized, { name, normalized, ambiguous });
  }
  return [...names.values()];
}

function creatureFeatError(message, code, diagnostics = {}) {
  return Object.assign(new Error(`NPC ability selection: ${message}`), { code, diagnostics });
}

async function rollbackActor(actor, label) {
  if (!actor) return null;
  try {
    await actor.delete();
    return null;
  } catch (cleanupErr) {
    console.warn(`${MODULE_ID} | failed to roll back ${label} "${actor.name}"`, cleanupErr);
    return `${label} "${actor.name}" still exists. The draft was discarded to prevent a duplicate; remove it manually before trying again.`;
  }
}

/**
 * The prompt → preview → create dialog.
 */
export class GeneratorApp extends SpfApp {
  static DEFAULT_OPTIONS = {
    id: "simplypf2e-generator",
    tag: "form",
    classes: ["simplypf2e"],
    window: {
      title: "SIMPLYPF2E.Generator.Title",
      icon: "fa-solid fa-dragon",
      resizable: true
    },
    position: { width: 720, height: "auto" },
    actions: {
      generate: GeneratorApp.#onGenerate,
      previewPlan: GeneratorApp.#onPreviewPlan,
      generateRandom: GeneratorApp.#onGenerateRandom,
      createActor: GeneratorApp.#onCreateActor,
      applyPCEdit: GeneratorApp.#onApplyPCEdit,
      discard: GeneratorApp.#onDiscard,
      dismissCharacterReview: GeneratorApp.#onDismissCharacterReview,
      openReviewedCharacter: GeneratorApp.#onOpenReviewedCharacter,
      openCreatedActor: GeneratorApp.#onOpenCreatedActor,
      generateAnother: GeneratorApp.#onGenerateAnother,
      managePresets: GeneratorApp.#onManagePresets,
      levelUp: GeneratorApp.#onLevelUp,
      levelDown: GeneratorApp.#onLevelDown,
      partyUp: GeneratorApp.#onPartyUp,
      partyDown: GeneratorApp.#onPartyDown,
      memberUp: GeneratorApp.#onMemberUp,
      memberDown: GeneratorApp.#onMemberDown,
      rerollLoot: GeneratorApp.#onRerollLoot,
      authorizeApiKey: GeneratorApp.#onAuthorizeApiKey,
      configureProvider: GeneratorApp.#onConfigureProvider,
      configureSources: GeneratorApp.#onConfigureSources,
      testProvider: GeneratorApp.#onTestProvider,
      cancelGeneration: GeneratorApp.#onCancelGeneration
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/generator.hbs` }
  };

  /** Form values, kept across re-renders. */
  #input = {
    mode: "monster", prompt: "", level: 1, rarity: "common",
    allowSpellcasting: true, includeEquipment: true, includeLoot: true,
    preset: "", partySize: 4, threat: "moderate", treasureAmount: "standard", rarityCap: "unique", pcIdentity: {}
  };
  #modePrompts = { monster: "", npc: "", encounter: "", character: "" };
  #busy = false;
  #busyMessage = null;
  /** Run identity explicitly handed from one-click orchestration to creation. */
  #creationRunId = null;
  #error = null;
  #concept = null;
  #resolved = null;
  /** Encounter mode result: {name, budget, spent, members: [...]}. */
  #encounter = null;
  /** Character mode result: normalized PC concept + resolved documents. */
  #pcConcept = null;
  #pcResolved = null;
  /** Required controls captured with the preview, including Random’s ignored inputs. */
  #pcIdentityInput = null;
  /** PC editor: choices awaiting a re-pick, unapplied control drafts, and the last edit outcome. UI-only. */
  #pcPending = [];
  #pcEditDrafts = {};
  #pcEditError = null;
  #pcEditNotice = null;
  #pcEditInFlight = false;
  /** Heritages eligible for the current ancestry and catalog; reloaded when either changes. */
  #pcHeritageCache = null;
  /** Snapshot for the last created PC; UI-only, never written to actor flags. */
  #characterReview = null;
  /** Successful one-click result; UI-only and never persisted. */
  #created = null;
  /** Validated plan manifest retained only until it is presented after creation. */
  #manifest = null;
  /** True when the current monster draft came from /forge; creation and reroll re-check the gate. */
  #experimentalDraft = false;
  /** Hazard mode (experimental): the reviewed hazard {concept, level, brief, preview}. Memory only; never persisted. */
  #hazard = null;
  /** Cycles the example placeholder; starts randomly so reopening varies. */
  #exampleTick = Math.floor(Math.random() * 5);

  async _prepareContext() {
    // Hazard mode exists only while the experimental gate is open. A closed gate
    // drops any hazard draft and leaves the mode before anything renders.
    const hazardAvailable = hazardGateOpen();
    if (!hazardAvailable) this.#leaveHazard();
    const authState = getProviderRequestConfig();
    const authWarningKey = getProviderAuthWarningKey(authState);
    const sources = globalThis.game?.packs && this.#input.mode !== "hazard" ? sourceReadiness(this.#input.mode, {
      allowSpellcasting: this.#input.allowSpellcasting
    }) : null;
    const presetGroups = presetPickerGroups(this.#input.preset, getCustomPresets());
    this.#input.preset = presetGroups.selectedId;
    return {
      input: this.#input,
      pcIdentityFields: this.#input.mode === "character" ? await this.#identityFields() : [],
      includeEquipment: this.#input.includeEquipment,
      includeLoot: this.#input.includeLoot,
      busy: this.#busy,
      busyMessage: this.#busyMessage,
      canCancel: this._canCancel,
      providerTested: this._providerTested,
      providerFeedback: this._providerFeedback,
      lastRunCost: this._formatLastRunCost(),
      error: this.#error,
      progress: this._progress,
      apiKeyWarning: authWarningKey ? game.i18n.localize(authWarningKey) : null,
      providerBaseUrl: authState.baseUrl,
      provider: authState.provider,
      connectionName: authState.connectionName,
      connections: authState.connections ?? [],
      canSwitchConnection: (authState.connections?.length ?? 0) > 1,
      providerReady: !authWarningKey,
      sourcesReady: sources?.ready ?? true,
      sourcePackCount: sources?.packCount ?? 0,
      sourceMissing: (sources?.missing ?? []).map((category) => game.i18n.localize(
        `SIMPLYPF2E.Sources.${String(category).charAt(0).toUpperCase()}${String(category).slice(1)}`
      )),
      canAuthorizeApiKey: Boolean(
        authState.baseUrl && authState.hasConfiguredApiKey && !authState.apiKeyIsBound
      ),
      model: authState.model,
      rarities: [
        { value: "common", label: "SIMPLYPF2E.Rarity.Common" },
        { value: "uncommon", label: "SIMPLYPF2E.Rarity.Uncommon" },
        { value: "rare", label: "SIMPLYPF2E.Rarity.Rare" },
        { value: "unique", label: "SIMPLYPF2E.Rarity.Unique" }
      ],
      promptPlaceholder: `${game.i18n.localize("SIMPLYPF2E.Generator.PromptExample")} ${examplePrompt(this.#input.preset, this.#exampleTick)}...`,
      nonePresetSelected: !presetGroups.selectedId,
      standardPresets: presetGroups.standard.map((p) => ({
        id: p.id,
        label: game.i18n.localize(p.nameKey),
        selected: p.selected
      })),
      customPresets: presetGroups.custom.map((p) => ({
        id: p.id,
        label: p.name,
        selected: p.selected
      })),
      encounterMode: this.#input.mode === "encounter",
      characterMode: this.#input.mode === "character",
      monsterMode: this.#input.mode === "monster",
      npcMode: this.#input.mode === "npc",
      hazardMode: this.#input.mode === "hazard",
      hazardAvailable,
      hazardLabels: HAZARD_LABEL_KEYS,
      randomTooltipKey: {
        monster: "SIMPLYPF2E.Generator.RandomTooltip",
        npc: "SIMPLYPF2E.Generator.RandomNpcTooltip",
        encounter: "SIMPLYPF2E.Generator.RandomEncounterTooltip",
        character: "SIMPLYPF2E.Generator.RandomCharacterTooltip"
      }[this.#input.mode] ?? "SIMPLYPF2E.Generator.RandomTooltip",
      levelMin: levelRangeFor(this.#input.mode)[0],
      levelMax: levelRangeFor(this.#input.mode)[1],
      threats: Object.keys(THREATS).map((key) => ({
        value: key,
        label: `SIMPLYPF2E.Threat.${key.charAt(0).toUpperCase()}${key.slice(1)}`,
        selected: this.#input.threat === key
      })),
      treasureAmounts: Object.keys(TREASURE_AMOUNT_MULTIPLIER).map((key) => ({
        value: key,
        label: `SIMPLYPF2E.TreasureAmount.${key.charAt(0).toUpperCase()}${key.slice(1)}`,
        selected: this.#input.treasureAmount === key
      })),
      // Keep each mode's previous result available when the GM switches back,
      // but never render an incompatible preview under the active form.
      preview: ["monster", "npc"].includes(this.#input.mode) ? this.#buildPreviewContext() : null,
      encounterPreview: this.#input.mode === "encounter" ? this.#buildEncounterPreviewContext() : null,
      pcPreview: this.#input.mode === "character" ? this.#buildPCPreviewContext() : null,
      pcEditor: this.#pcConcept && this.#input.mode === "character" ? await this.#buildPCEditorContext() : null,
      hazardPreview: this.#input.mode === "hazard" ? this.#buildHazardPreviewContext() : null,
      characterReview: this.#characterReview,
      created: this.#created,
      hasPreview: Boolean(this.#concept || this.#encounter || this.#pcConcept || this.#hazard),
      tokenReport: this._buildTokenReport(),
      // Presentation only: show the getting-started panel when the active
      // mode has no result (busy/error states render their own blocks).
      showEmptyState: !this.#busy && !this.#error && !this.#characterReview && !this.#created
        && !(["monster", "npc"].includes(this.#input.mode) && this.#concept)
        && !(this.#input.mode === "encounter" && this.#encounter)
        && !(this.#input.mode === "character" && this.#pcConcept)
        && !(this.#input.mode === "hazard" && this.#hazard)
    };
  }

  /** Rebuild source-derived views; compendium owners cache only their source loads. */
  async #identityCatalogs() {
    const [ancestry, heritage, background, classes] = await Promise.all([
      getAncestryCandidates(this.#input.rarityCap, { distinctSources: true }), getHeritageCandidates(this.#input.rarityCap, { distinctSources: true }),
      getBackgroundCandidates(this.#input.rarityCap, { distinctSources: true }), getClassCandidates({ distinctSources: true })
    ]);
    const pathGroups = await Promise.all(supportedClassCandidates(classes).map(async (candidate) => {
      const document = await getDocument(candidate.ref);
      if (!document) return [];
      return (await getClassPathCandidates(document.toObject())).map((path) => ({
        ...path, className: candidate.name, classKey: pcIdentityKey(candidate)
      }));
    }));
    // Different class sources may grant the same path. Issue each path once
    // per bridge, retaining all class relations for the picker rather than
    // duplicating its key.
    const paths = new Map();
    for (const path of pathGroups.flat()) {
      const key = `${path.bridge ?? ""}\u0000${pcIdentityKey(path)}`;
      const existing = paths.get(key);
      if (existing) {
        if (!existing.classKeys.includes(path.classKey)) existing.classKeys.push(path.classKey);
        if (!existing.classNames.includes(path.className)) existing.classNames.push(path.className);
      } else paths.set(key, { ...path, classKeys: [path.classKey], classNames: [path.className] });
    }
    return { ancestry, heritage, background, class: classes, classPath: [...paths.values()] };
  }

  #identityInputSnapshot() {
    return JSON.stringify({ prompt: this.#input.prompt, choices: this.#input.pcIdentity, rarityCap: this.#input.rarityCap });
  }

  async #identityFields() {
    let catalogs = {};
    try { catalogs = await this.#identityCatalogs(); }
    catch (err) { console.warn(`${MODULE_ID} | required-choice catalogs unavailable`, err); }
    const choices = this.#input.pcIdentity;
    const pathOption = (candidate) => ({
      value: pcIdentityKey(candidate),
      label: `${candidate.name}${candidate.classNames ? ` (${candidate.classNames.join(", ")})` : ""} — ${game.packs?.get(candidate.ref.packId)?.title ?? candidate.ref.packId}`
    });
    return PC_IDENTITY_FIELDS.flatMap((field) => {
      const value = choices[field] ?? "";
      let candidates = catalogs[field] ?? [];
      if (field === "class") candidates = supportedClassCandidates(candidates);
      if (field === "classPath" && choices.class) candidates = candidates.filter((candidate) => candidate.classKeys.includes(choices.class));
      // A class with several path bridges (Wizard) gets one control per
      // bridge instead of one mixed list; the requirement is held per bridge.
      const bridges = field === "classPath" && choices.class ? classPathBridges(candidates) : [];
      const bridgeFields = bridges.length > 1 ? bridges.map((bridge) => {
        const bridgeValue = choices.classPaths?.[bridge] ?? "";
        const bridgeOptions = candidates.filter((candidate) => candidate.bridge === bridge).map(pathOption);
        if (bridgeValue && !bridgeOptions.some((option) => option.value === bridgeValue)) {
          bridgeOptions.unshift({ value: bridgeValue, label: game.i18n.localize("SIMPLYPF2E.Identity.Unavailable") });
        }
        const name = `classPaths.${bridge}`;
        return { field: name, fieldId: `spf-identity-${name.replace(/[^A-Za-z0-9_-]+/g, "-")}`, value: bridgeValue, literal: false,
          label: null, labelText: bridge, chooseLabel: "SIMPLYPF2E.Identity.Choose", hint: null,
          options: bridgeOptions.map((option) => ({ ...option, selected: option.value === bridgeValue })) };
      }) : [];
      let options = candidates.map(pathOption);
      if (field === "keyAbility") options = ["str", "dex", "con", "int", "wis", "cha"].map((key) => ({
        value: key, label: game.i18n.localize(`SIMPLYPF2E.Identity.Ability.${key}`)
      }));
      if (field === "backgroundLore") {
        const background = (catalogs.background ?? []).find((candidate) => pcIdentityKey(candidate) === choices.background);
        options = getBackgroundLoreOptions(background);
        if (!options.length && !value) return null;
      }
      if (field === "heritage") options.unshift({ value: "none", label: game.i18n.localize("SIMPLYPF2E.Identity.NoHeritage") });
      // Keep stale selections visible so a source change cannot silently turn a requirement into AI choice.
      if (field !== "name" && value && !options.some((option) => option.value === value)) {
        options.unshift({ value, label: game.i18n.localize("SIMPLYPF2E.Identity.Unavailable") });
      }
      const single = { field, fieldId: `spf-identity-${field}`, value, literal: field === "name", label: `SIMPLYPF2E.Identity.${field}`,
        chooseLabel: field === "backgroundLore" ? "SIMPLYPF2E.Identity.ChooseLore" : "SIMPLYPF2E.Identity.Choose",
        hint: field === "backgroundLore" ? "SIMPLYPF2E.Identity.LoreHint" : null,
        options: options.map((option) => ({ ...option, selected: option.value === value })) };
      // The single alias control stays visible only while it still holds a
      // choice, so a stale selection from before the class change can be cleared.
      if (bridgeFields.length) return value ? [...bridgeFields, single] : bridgeFields;
      return single;
    }).filter(Boolean);
  }

  /** Current PC plan in the shape the edit contract reads. */
  #pcPlan() {
    return { concept: this.#pcConcept, resolved: this.#pcResolved, pending: this.#pcPending };
  }

  /** Clear PC editor drafts and outcomes whenever the PC plan is replaced or discarded. */
  #resetPCEdit() {
    this.#pcPending = [];
    this.#pcEditDrafts = {};
    this.#pcEditError = null;
    this.#pcEditNotice = null;
    this.#pcHeritageCache = null;
  }

  /** Heritages whose documents match the current ancestry; documents load once per ancestry and catalog. */
  async #pcEligibleHeritages(candidates, ancestryDoc) {
    const key = JSON.stringify([
      ancestryDoc?.uuid ?? ancestryDoc?._id ?? ancestryDoc?.name ?? "", candidates.map((candidate) => pcIdentityKey(candidate))
    ]);
    if (this.#pcHeritageCache?.key === key) return this.#pcHeritageCache.candidates;
    const eligible = [];
    for (const candidate of candidates) {
      const doc = await getDocument(candidate.ref);
      if (doc?.type === "heritage" && heritageMatchesAncestry(doc, ancestryDoc)) eligible.push(candidate);
    }
    this.#pcHeritageCache = { key, candidates: eligible };
    return eligible;
  }

  /** Catalogs for PC edits: the identity pickers, with heritage narrowed to the current ancestry. */
  async #pcEditCatalogs(plan) {
    const catalogs = await this.#identityCatalogs();
    return {
      ...catalogs,
      heritage: await this.#pcEligibleHeritages(catalogs.heritage ?? [], plan.resolved.ancestryDoc),
      equipment: (await getEquipmentCandidates(plan.concept.level)) ?? []
    };
  }

  /** Editor view: one control per editable choice with its draft or current selection, plus commit blockers. */
  async #buildPCEditorContext() {
    const plan = this.#pcPlan();
    const validation = validatePCEditCompletion(plan);
    let catalogs = null;
    try { catalogs = await this.#pcEditCatalogs(plan); }
    catch (err) { console.warn(`${MODULE_ID} | PC editor catalogs unavailable`, err); }
    const selections = pcEditorSelections(plan);
    const pending = new Set(plan.pending.map((item) => item.field));
    const label = (key) => game.i18n.localize(`SIMPLYPF2E.Identity.${key}`);
    const option = (candidate) => ({
      value: pcIdentityKey(candidate),
      label: `${candidate.name} — ${game.packs?.get(candidate.ref.packId)?.title ?? candidate.ref.packId}`
    });
    const controls = [];
    const add = (control, title, options, pendingField = control) => {
      const current = Object.hasOwn(this.#pcEditDrafts, control) ? this.#pcEditDrafts[control] : selections[control];
      const list = options.map((item) => ({ ...item, selected: item.value === current }));
      if (!list.some((item) => item.selected)) {
        list.unshift({ value: "", label: game.i18n.localize("SIMPLYPF2E.PCEdit.Choose"), selected: true });
      }
      controls.push({ control, id: `pc-edit-${control.replace(/[^A-Za-z0-9_-]+/g, "-")}`, label: title, options: list, pending: pending.has(pendingField) });
    };
    if (catalogs) {
      add("ancestry", label("ancestry"), catalogs.ancestry.map(option));
      add("heritage", label("heritage"), [
        { value: "", label: game.i18n.localize("SIMPLYPF2E.Identity.NoHeritage") }, ...catalogs.heritage.map(option)
      ]);
      add("background", label("background"), catalogs.background.map(option));
      add("class", label("class"), supportedClassCandidates(catalogs.class).map(option));
      const paths = catalogs.classPath.filter((path) => path.classKeys.includes(selections.class));
      const bridges = classPathBridges(paths);
      if (bridges.length > 1) {
        // One control per path bridge (Wizard: Arcane School, Arcane Thesis).
        for (const bridge of bridges) add(`classPath.${bridge}`, bridge, paths.filter((path) => path.bridge === bridge).map(option));
      } else if (paths.length || pending.has("classPath")) add("classPath", label("classPath"), paths.map(option));
      const legal = plan.resolved.classDoc?.system?.keyAbility?.value;
      add("keyAbility", label("keyAbility"), (Array.isArray(legal) ? legal : ["str", "dex", "con", "int", "wis", "cha"])
        .map((key) => ({ value: key, label: game.i18n.localize(`SIMPLYPF2E.Identity.Ability.${key}`) })));
      const lore = getBackgroundLoreOptions(plan.resolved.backgroundDoc);
      if (lore.length || pending.has("backgroundLore")) add("backgroundLore", label("backgroundLore"), lore);
      plan.resolved.featSlots.forEach((slot, index) => add(
        `feat.${index}`, game.i18n.format("SIMPLYPF2E.PCEdit.FeatSlot", { type: slot.type, level: slot.level }), (slot.candidates ?? []).map(option)
      ));
      const equipment = catalogs.equipment.map(option);
      plan.concept.equipment.forEach((line, index) => add(
        `equipment.${index}`, game.i18n.format("SIMPLYPF2E.PCEdit.EquipmentLine", { index: index + 1, name: line.name }), equipment
      ));
    }
    const blockers = [
      ...validation.pending.map((item) => game.i18n.format("SIMPLYPF2E.PCEdit.PendingChoice", { field: label(item.field), reason: item.reason })),
      ...validation.errors,
      ...validation.unresolved.map((item) => game.i18n.format("SIMPLYPF2E.PCEdit.UnresolvedItem", { category: item.category, name: item.name }))
    ];
    const spellsDeferred = Boolean(plan.concept.spellcasting) || (plan.concept.focusSpells ?? []).length > 0
      || (plan.resolved.spells ?? []).length > 0 || (plan.resolved.focusSpells ?? []).length > 0;
    return {
      controls,
      unavailable: catalogs === null,
      blockers,
      blocked: !validation.complete || this.#pcEditInFlight,
      spellsDeferred,
      busy: this.#pcEditInFlight,
      error: this.#pcEditError,
      notice: this.#pcEditNotice
    };
  }

  /** Apply one PC editor control through the edit contract. A refusal keeps every draft for correction. */
  static async #onApplyPCEdit(_event, target) {
    const control = target?.dataset?.control;
    if (!this.#pcConcept || !control || this.#pcEditInFlight || this.#busy) return;
    this.#readForm();
    this.#pcEditInFlight = true;
    this.#busy = true;
    this.#pcEditError = null;
    this.#pcEditNotice = null;
    try {
      const plan = this.#pcPlan();
      const edit = pcEditFromControl(control, this.#pcEditDrafts[control]);
      const result = await applyPCEdit(plan, edit, { catalogs: await this.#pcEditCatalogs(plan) });
      this.#pcConcept = result.plan.concept;
      this.#pcResolved = result.plan.resolved;
      this.#pcPending = result.plan.pending;
      if (result.changed.some((change) => String(change).startsWith("equipment:"))) {
        const wealthTarget = pcStartingWealthGp(this.#pcConcept.level, this.#input.treasureAmount);
        const lootBudget = Math.max(wealthTarget - (result.equipmentGp ?? 0), 0);
        this.#pcResolved.loot = dedupeLootAgainstEquipment(this.#pcResolved.loot ?? [], this.#pcResolved.equipment ?? []);
        this.#pcResolved.loot = enforceNamedLootBudget(this.#pcResolved.loot, lootBudget);
        this.#pcResolved.loot = await applyTreasureBudget(this.#pcResolved.loot, lootBudget);
      }
      this.#manifest = validatePCEditCompletion(result.plan).manifest;
      for (const key of [control, ...pcEditorInvalidatedControls(result.invalidated)]) delete this.#pcEditDrafts[key];
      const messages = [game.i18n.localize(result.changed.length ? "SIMPLYPF2E.PCEdit.Applied" : "SIMPLYPF2E.PCEdit.Unchanged")];
      for (const item of result.invalidated) messages.push(item.reason);
      this.#pcEditNotice = messages.join(" ");
    } catch (err) {
      const contract = String(err?.code ?? "").startsWith("PC_EDIT_");
      if (!contract) console.warn(`${MODULE_ID} | PC edit failed`, err);
      this.#pcEditError = contract ? err.message : game.i18n.localize("SIMPLYPF2E.PCEdit.Failed");
    } finally {
      this.#pcEditInFlight = false;
      this.#busy = false;
    }
    await this.render();
  }

  #buildPCPreviewContext() {
    if (!this.#pcConcept) return null;
    const concept = this.#pcConcept;
    const resolved = this.#pcResolved;
    const ancestry = { name: resolved.ancestryDoc?.name ?? concept.ancestry, found: Boolean(resolved.ancestryDoc) };
    const heritage = concept.heritage
      ? { name: resolved.heritageDoc?.name ?? concept.heritage, found: Boolean(resolved.heritageDoc) }
      : null;
    const background = { name: resolved.backgroundDoc?.name ?? concept.background, found: Boolean(resolved.backgroundDoc) };
    const pcClass = { name: resolved.classDoc?.name ?? concept.class, found: Boolean(resolved.classDoc) };
    const feats = GeneratorApp.#mapNamed(resolved.feats);
    const spells = GeneratorApp.#mapSpells(resolved.spells);
    const signatureRanks = concept.spellcasting?.signatureRanks ?? [];
    const plannedSignatures = new Set(spells.filter((spell) => spell.found && spell.signature
      && signatureRanks.includes(spell.rank)).map((spell) => spell.rank));
    const equipment = GeneratorApp.#mapGear(resolved.equipment);
    const loot = GeneratorApp.#mapGear(resolved.loot);
    return {
      concept,
      ancestry,
      heritage,
      background,
      backgroundLore: resolved.backgroundLore ?? [],
      class: pcClass,
      skillPriorities: skillPriorityOrder(concept.skillPriorities, concept.keyAbility).order.map((slug) => ({ name: GeneratorApp.#skillName(slug) })),
      automaticSkills: normalizeSkillPriorities(concept.skillPriorities).length === 0,
      spellcastingNotice: concept.spellcastingNoticeKey ? game.i18n.localize(concept.spellcastingNoticeKey) : null,
      signatureSummary: signatureRanks.length ? game.i18n.format("SIMPLYPF2E.Preview.PCSignaturePlan", {
        selected: plannedSignatures.size, total: signatureRanks.length
      }) : null,
      feats,
      spells,
      equipment,
      loot,
      matchSummary: this.#matchSummary([ancestry], heritage ? [heritage] : [], [background], [pcClass], feats, spells, equipment, loot)
    };
  }

  static #skillName(slug) {
    return game.i18n.localize(globalThis.CONFIG?.PF2E?.skills?.[slug]?.label ?? slug);
  }

  static #skillReportContext(report) {
    if (!report) return null;
    const warningKeys = {
      "native-data": "NativeData", "training-data": "TrainingData", "schedule": "Schedule",
      "grant-timing": "GrantTiming", "native-rank-rule": "NativeRule",
      "intelligence-timing": "IntelligenceTiming",
      "unspent-training": "UnspentTraining", "unspent-increases": "UnspentIncreases"
    };
    return {
      rows: report.rows.map((row) => ({ name: row.name ?? this.#skillName(row.slug),
        rank: game.i18n.localize(`SIMPLYPF2E.Skills.Rank${row.rank}`) })),
      automatic: report.automatic,
      budget: report.trainingBudget !== null && report.unspentTraining !== null
        ? game.i18n.format("SIMPLYPF2E.Skills.Budget", {
          spent: report.trainingBudget - report.unspentTraining, total: report.trainingBudget
        }) : null,
      warnings: report.warnings.map((code) => game.i18n.format(`SIMPLYPF2E.Skills.${warningKeys[code] ?? "NativeData"}`, {
        count: code === "unspent-training" ? report.unspentTraining : report.unspentIncreases
      })),
      loadoutWarnings: (report.loadoutWarnings ?? []).map((code) =>
        game.i18n.localize(`SIMPLYPF2E.Loadout.${{
          "loadout-native-data": "NativeData", "loadout-untrained-armor": "UntrainedArmor",
          "loadout-armor-conflict": "ArmorConflict", "loadout-untrained-weapon": "UntrainedWeapon",
          "loadout-hand-conflict": "HandConflict", "loadout-manual-ammo": "ManualAmmo",
          "loadout-missing-ammo": "MissingAmmo"
        }[code] ?? "NativeData"}`))
    };
  }

  /** Localized, count-only view of a validated completion manifest. */
  static #completionContext(manifests) {
    const summary = completionSummary(manifests);
    const rows = [
      ["compendium", "SIMPLYPF2E.Generator.CompletionCompendium"],
      ["native", "SIMPLYPF2E.Generator.CompletionNative"],
      ["moduleBuilt", "SIMPLYPF2E.Generator.CompletionModuleBuilt"],
      ["customNarrative", "SIMPLYPF2E.Generator.CompletionCustomNarrative"]
    ].filter(([key]) => summary[key] > 0).map(([key, label]) => ({
      text: game.i18n.format(label, { count: summary[key] })
    }));
    return { total: summary.total, rows };
  }

  /* The three preview shapes below are identical for creatures and characters,
     so both #buildPreviewContext and #buildPCPreviewContext share them. Each
     returns rows carrying `found`, which drives both the per-row checkmark and
     #matchSummary's aggregate. */

  /** Rows for a plain {name, entry} list (feats). */
  static #mapNamed(list) {
    return (list ?? []).map(({ name, entry }) => ({ name: entry?.name ?? name, found: Boolean(entry) }));
  }

  /** Rows for resolved spells, which carry their cast rank. */
  static #mapSpells(list) {
    return (list ?? []).map(({ spell, entry }) => ({
      name: entry?.name ?? spell.name,
      rank: spell.rank,
      signature: spell.signature === true,
      found: Boolean(entry)
    }));
  }

  /**
   * Rows for equipment or loot. A runed name is shown as the AI wrote it (the
   * entry is only the base item), a scroll as the item it will be built into,
   * and a stack gets its ×N suffix.
   */
  static #mapGear(list) {
    return (list ?? []).map(({ name, quantity, runes, entry, scroll }) => ({
      name: (scroll && entry?.name
        ? `Scroll of ${entry.name} (Rank ${scroll.rank})`
        : (runes?.potency ? name : entry?.name ?? name)) + (quantity > 1 ? ` ×${quantity}` : ""),
      found: Boolean(entry)
    }));
  }

  #buildEncounterPreviewContext() {
    if (!this.#encounter) return null;
    return {
      name: this.#encounter.name,
      budget: this.#encounter.budget,
      spent: this.#encounter.spent,
      overBudget: this.#encounter.spent > this.#encounter.budget,
      treasureBudget: Math.round(this.#encounter.treasureBudget ?? 0),
      treasureSpent: Math.round(this.#encounter.treasureSpent ?? 0),
      members: this.#encounter.members.map((member, index) => {
        const stats = computeStats(member.concept);
        const strike = stats.strikes[0];
        return {
          index,
          count: member.count,
          skipped: member.count === 0,
          role: `SIMPLYPF2E.Role.${member.role.charAt(0).toUpperCase()}${member.role.slice(1)}`,
          name: member.concept.name,
          level: member.concept.level,
          blurb: member.concept.blurb,
          statline: `AC ${stats.ac}, ${game.i18n.localize("SIMPLYPF2E.Preview.Fort")} +${stats.saves.fortitude}, ${game.i18n.localize("SIMPLYPF2E.Preview.Ref")} +${stats.saves.reflex}, ${game.i18n.localize("SIMPLYPF2E.Preview.Will")} +${stats.saves.will}, HP ${stats.hp}, Per +${stats.perception}`
            + (strike ? `, ${strike.name} +${strike.bonus} (${strike.damage})` : "")
            + (stats.spellDC ? `, ${game.i18n.localize("SIMPLYPF2E.Preview.Spells")} DC ${stats.spellDC}` : "")
        };
      })
    };
  }

  #buildPreviewContext() {
    if (!this.#concept) return null;
    const concept = this.#concept;
    const stats = computeStats(concept);
    const abilities = (this.#resolved?.abilities ?? []).map(({ ability, entry }) => ({
      name: ability.name,
      fromGlossary: Boolean(entry),
      glossaryName: entry?.name ?? null,
      narrative: Boolean(ability.narrative),
      description: ability.description
    }));
    const spells = GeneratorApp.#mapSpells(this.#resolved?.spells);
    const feats = GeneratorApp.#mapNamed(this.#resolved?.feats);
    const equipment = GeneratorApp.#mapGear(this.#resolved?.equipment);
    const loot = GeneratorApp.#mapGear(this.#resolved?.loot);
    return {
      concept,
      stats,
      traits: [concept.rarity !== "common" ? concept.rarity : null, concept.size, ...concept.traits].filter(Boolean),
      speeds: concept.speeds.map((s) => `${s.type} ${s.value} ft.`).join(", "),
      senses: concept.senses.map((s) => [s.type, s.acuity, s.range ? `${s.range} ft.` : null].filter(Boolean).join(" ")).join(", "),
      languages: concept.languages.join(", "),
      abilities,
      spells,
      feats,
      equipment,
      loot,
      matchSummary: this.#matchSummary(
        abilities.map((a) => ({ found: a.fromGlossary, narrative: a.narrative })), spells, feats, equipment, loot
      ),
      iwr: {
        immunities: concept.immunities.join(", "),
        resistances: concept.resistances.map((r) => `${r} ${stats.resistanceValue}`).join(", "),
        weaknesses: concept.weaknesses.map((w) => `${w} ${stats.resistanceValue}`).join(", ")
      }
    };
  }

  /**
   * Aggregate "found vs. total" across every generated category — issue #52:
   * the GM had no summary of how much of a generation actually grounded
   * against the real compendium vs. fell back to AI-estimated custom items,
   * only a per-item warning icon buried in each list. Each argument is an
   * array of objects carrying a `found` boolean (a single ABC/heritage pick
   * is wrapped in a 1-element array by the caller so it can be flattened the
   * same way as the list categories).
   * @returns {{matched: number, total: number, text: string}|null}
   */
  #matchSummary(...groups) {
    const items = groups.flat().filter((item) => item && !item.narrative);
    const total = items.length;
    if (!total) return null;
    const matched = items.filter((i) => i.found).length;
    return { matched, total, text: game.i18n.format("SIMPLYPF2E.Preview.MatchSummary", { matched, total }) };
  }

  /** Read the current form inputs into #input. */
  #readForm() {
    const form = this.element;
    const previousMode = this.#input.mode;
    // Preserve each mode's draft independently. Creature descriptions,
    // encounter themes, and character briefs are not interchangeable, but a
    // GM switching back should not lose unfinished text.
    const promptEl = form.querySelector('[name="prompt"]');
    const renderedPrompt = promptEl ? promptEl.value : this.#input.prompt;
    if (promptEl) this.#modePrompts[previousMode] = renderedPrompt;
    const mode = form.querySelector('[name="mode"]:checked')?.value ?? this.#input.mode;
    const prompt = mode === previousMode ? renderedPrompt : (this.#modePrompts[mode] ?? "");
    this.#modePrompts[mode] = prompt;
    // Clamp to the mode's own range, the same way partySize is clamped below:
    // only Single mode's creature level goes -1..24, and a level left over
    // from a previous mode would otherwise be sent verbatim to the AI prompt
    // (the concept is clamped later; the prompt text was not).
    const [levelMin, levelMax] = levelRangeFor(mode);
    const rawLevel = Number(form.querySelector('[name="level"]')?.value ?? 1);
    const level = Math.min(levelMax, Math.max(levelMin, Number.isNaN(rawLevel) ? 1 : Math.round(rawLevel)));
    const rarity = form.querySelector('[name="rarity"]')?.value ?? this.#input.rarity;
    const allowSpellcasting = form.querySelector('[name="allowSpellcasting"]')?.checked ?? true;
    const includeEquipment = form.querySelector('[name="includeEquipment"]')?.checked ?? this.#input.includeEquipment;
    const includeLoot = form.querySelector('[name="includeLoot"]')?.checked ?? this.#input.includeLoot;
    const preset = form.querySelector('[name="preset"]')?.value ?? this.#input.preset;
    // partySize is only rendered in Encounter mode ({{#if encounterMode}} in
    // generator.hbs) — outside that mode the selector is null, so fall back
    // to the prior #input value like every other optional field here, not a
    // literal default that would silently discard the GM's saved party size.
    const partySizeEl = form.querySelector('[name="partySize"]');
    const rawPartySize = partySizeEl ? Number(partySizeEl.value) : NaN;
    const partySize = partySizeEl
      ? Math.min(8, Math.max(1, Number.isNaN(rawPartySize) ? this.#input.partySize : Math.round(rawPartySize)))
      : this.#input.partySize;
    const threat = form.querySelector('[name="threat"]')?.value ?? this.#input.threat;
    const treasureAmount = form.querySelector('[name="treasureAmount"]')?.value ?? this.#input.treasureAmount;
    const rarityCap = form.querySelector('[name="rarityCap"]')?.value ?? this.#input.rarityCap;
    const pcIdentity = { ...this.#input.pcIdentity };
    for (const field of PC_IDENTITY_FIELDS) {
      const control = form.querySelector(`[name="pcIdentity.${field}"]`);
      if (control) pcIdentity[field] = control.value;
    }
    // Per-bridge class paths belong to the class they were chosen for: read
    // them only while the identity section is on screen, and drop them when
    // the class changes (the other class has different bridges).
    if (form.querySelector('[name="pcIdentity.class"]')) {
      const prefix = "pcIdentity.classPaths.";
      const classChanged = (pcIdentity.class ?? "") !== (this.#input.pcIdentity.class ?? "");
      const entries = classChanged ? [] : [...form.querySelectorAll(`[name^="${prefix}"]`)]
        .map((control) => [control.name.slice(prefix.length), control.value]);
      if (entries.length) pcIdentity.classPaths = Object.fromEntries(entries);
      else delete pcIdentity.classPaths;
    }
    for (const control of form.querySelectorAll('[name^="pcEdit."]')) {
      this.#pcEditDrafts[control.name.slice("pcEdit.".length)] = control.value;
    }
    this.#input = { mode, prompt, level, rarity, allowSpellcasting, includeEquipment, includeLoot,
      preset, partySize, threat, treasureAmount, rarityCap, pcIdentity };
  }

  _preserveForm() {
    this.#readForm();
  }

  /**
   * Re-render when the preset or mode changes so the delete button, the
   * Random/Encounter forms, and the cycling example placeholder track them.
   */
  _onRender(context, options) {
    super._onRender?.(context, options);
    this.element.querySelector('select[name="preset"]')?.addEventListener("change", () => {
      this.#readForm();
      // Restore the preset's saved generator defaults into the live form —
      // only the fields the preset actually defines (built-ins and older
      // customs carry none, so the GM's current values stay put).
      const preset = findPreset(this.#input.preset);
      if (preset) {
        if (preset.rarity) this.#input.rarity = preset.rarity;
        if (typeof preset.allowSpellcasting === "boolean") this.#input.allowSpellcasting = preset.allowSpellcasting;
        if (preset.treasureAmount) this.#input.treasureAmount = preset.treasureAmount;
      }
      this.#exampleTick++;
      this.render();
    });
    for (const selector of ['[name="pcIdentity.class"]', '[name="pcIdentity.background"]', '[name="rarityCap"]']) {
      this.element.querySelector(selector)?.addEventListener("change", () => {
        this.#readForm();
        this.render();
      });
    }
    // A changed level or brief spends the reviewed hazard: the GM must generate it again.
    for (const field of ["level", "prompt"]) {
      this.element.elements?.namedItem?.(field)?.addEventListener("change", () => this.#dropStaleHazard());
    }
    for (const radio of this.element.querySelectorAll('input[name="mode"]')) {
      radio.addEventListener("change", async () => {
        this.#readForm();
        const selectedMode = this.#input.mode;
        await this.render();
        // Foundry focuses the first hidden radio after an application render.
        // Restore focus to the mode the GM actually selected so Monster does
        // not receive a second, misleading focus highlight.
        if (this.#input.mode === selectedMode) {
          this.element.querySelector('[name="mode"]:checked')?.focus({ preventScroll: true });
        }
      });
    }
  }

  static #onLevelUp() {
    this.#stepLevel(1);
  }

  static async #onAuthorizeApiKey(_event, target) {
    // Authorization refreshes the provider strip. Preserve any concept or
    // controls the GM changed before the re-render, just like Configure does.
    this.#readForm();
    const authorized = await authorizeApiKeyForCurrentBaseUrl(target.dataset.baseUrl);
    if (authorized) {
      ui.notifications.info(game.i18n.localize("SIMPLYPF2E.Generator.ApiKeyAuthorized"));
    } else {
      ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Generator.ApiKeyAuthorizationFailed"));
    }
    await this.render();
  }

  static #onConfigureProvider() {
    this.#readForm();
    this._openProviderSetup();
  }

  /** Open the shared Compendium Sources settings app (same as the forge's gear). */
  static #onConfigureSources() {
    this.#readForm();
    new SourcesConfigApp(() => this._refreshPreservingForm()).render(true);
  }

  static async #onTestProvider(_event, target) {
    await this._testProvider(target);
  }

  static #onLevelDown() {
    this.#stepLevel(-1);
  }

  static async #onMemberUp(_event, target) {
    await this.#stepMemberCount(Number(target.dataset.index), 1);
  }

  static async #onMemberDown(_event, target) {
    await this.#stepMemberCount(Number(target.dataset.index), -1);
  }

  /** Adjust an encounter member's count (0 = skip it) and refresh XP + treasure math. */
  async #stepMemberCount(index, delta) {
    const member = this.#encounter?.members?.[index];
    if (!member) return;
    member.count = Math.min(8, Math.max(0, member.count + delta));
    this.#encounter.spent = this.#encounter.members.reduce((sum, m) => sum + m.count * m.xpEach, 0);
    // The group's treasure share (treasureGroupBudget) stays constant; only
    // the per-copy split changes, so re-nudge the shared loot toward the new
    // split (applyTreasureBudget re-targets from whatever the loot currently
    // holds, so calling it again is safe) and refresh that member's actuals.
    if (member.treasureGroupBudget != null) {
      member.treasureBudgetEach = member.treasureGroupBudget / Math.max(member.count, 1);
      member.resolved.loot = await applyTreasureBudget(member.resolved.loot, member.treasureBudgetEach);
      member.treasureEach = lootValueGp(member.resolved.loot);
    }
    // Both treasure totals are per-creature × count, which now nets back to
    // each group's constant share regardless of how the stepper is set.
    this.#encounter.treasureBudget = this.#encounter.members.reduce((sum, m) => sum + m.count * (m.treasureBudgetEach ?? 0), 0);
    this.#encounter.treasureSpent = this.#encounter.members.reduce((sum, m) => sum + m.count * (m.treasureEach ?? 0), 0);
    await this.render();
  }

  #stepLevel(delta) {
    const input = this.element.querySelector('input[name="level"]');
    if (!input) return;
    const current = Number.parseInt(input.value, 10);
    // Party Level (encounter mode) and Character level are both PC levels,
    // 1-20; only Single mode's creature Level goes -1..24.
    const [min, max] = levelRangeFor(this.#input.mode);
    input.value = Math.min(max, Math.max(min, (Number.isNaN(current) ? 1 : current) + delta));
    if (this.#hazard) {
      this.#dropStaleHazard().catch((err) => console.warn(MODULE_ID + " | hazard preview check failed", err));
    }
  }

  static #onPartyUp() {
    this.#stepParty(1);
  }

  static #onPartyDown() {
    this.#stepParty(-1);
  }

  #stepParty(delta) {
    const input = this.element.querySelector('input[name="partySize"]');
    if (!input) return;
    const current = Number.parseInt(input.value, 10);
    input.value = Math.min(8, Math.max(1, (Number.isNaN(current) ? 4 : current) + delta));
  }

  static async #onCancelGeneration() {
    this._cancelGeneration();
  }

  /** Mark the stage that actually owns a tolerated fallback. Encounter work
   * runs inside memberN rather than the single-creature spells/loot keys. */
  #warnToleratedStage(fallbackKey) {
    const activeKey = this._progress?.steps.find((step) => step.state === "active")?.key;
    this._warnStep(activeKey ?? fallbackKey);
  }

  #noteGenerationFailure(err, label) {
    if (err?.cancelled) {
      console.warn(`${MODULE_ID} | ${label} cancelled`);
      // Cancellation is a neutral stop: retain no red error copy and never
      // report a completed bar for work the GM explicitly interrupted.
      this.#error = null;
      return;
    }
    console.error(`${MODULE_ID} | ${label} failed`, err);
    this.#error = err?.message ?? String(err);
  }

  static async #onGenerate() {
    return this.#runGeneration(false, { create: true });
  }

  /** Generate and validate without writing to the world. */
  static async #onPreviewPlan() {
    return this.#runGeneration(false, { create: false });
  }

  /** The dice button in every mode: same preview pipeline, module-rolled
   * surprise brief as the prompt. Ignores whatever the GM typed. */
  static async #onGenerateRandom() {
    return this.#runGeneration(true, { create: false });
  }

  /**
   * Public entry for the experimental `/forge` command and console callers.
   * It takes a plain request, not form state. Unsaved text and the selected mode
   * are captured first and the Monster view is shown, but only this run uses the
   * request's brief and level, so the GM's drafts are never overwritten. Resolves
   * true once a run has started and settled; false when the request was refused,
   * invalid, busy, or stopped by readiness before any run began.
   */
  async startExperimentalMonsterRequest(request) {
    try {
      assertExperimentalToolAccess();
    } catch (err) {
      ui.notifications.warn(err.message);
      return false;
    }
    const checked = validateForgeRequest(request);
    if (!checked.ok) {
      ui.notifications.warn(game.i18n.localize(checked.key));
      return false;
    }
    if (this.#busy) {
      ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Chat.ForgeBusy"));
      return false;
    }
    // A Character or Encounter preview is kept until created or discarded. A Monster
    // preview is replaced, as Generate replaces it.
    if (this.#pcConcept || this.#encounter) {
      ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Chat.ForgeResultPending"));
      return false;
    }
    if (this.element) this.#readForm();
    this.#input.mode = "monster";
    this.#input.prompt = this.#modePrompts.monster;
    this.render(true);
    // beginProgress advances the run counter only after readiness passes.
    const runId = this._runId;
    await this.#runGeneration(false, {
      create: checked.request.intent === "generate",
      request: checked.request
    });
    return this._runId !== runId;
  }

  async #assertGenerationReady() {
    const warning = getProviderAuthWarningKey(getProviderRequestConfig());
    if (warning) {
      ui.notifications.warn(game.i18n.localize(warning));
      return false;
    }
    // Hazards use no compendium content; the provider check above is the only readiness they need.
    if (this.#input.mode === "hazard") return true;
    // Isolated production-path tests intentionally do not construct Foundry's
    // pack collection; a live world always has it and receives this preflight.
    if (!globalThis.game?.packs) return true;
    const sources = sourceReadiness(this.#input.mode, { allowSpellcasting: this.#input.allowSpellcasting });
    if (!sources.ready) {
      ui.notifications.warn(game.i18n.format("SIMPLYPF2E.Generator.SourcesMissing", {
        categories: sources.missing.join(", ")
      }));
      return false;
    }
    // Stop before the expensive PC concept request when no installed class can
    // satisfy the complete-only contract. The later ABC pass still obtains the
    // full candidate catalog for its grounded selection.
    if (this.#input.mode === "character") {
      const classes = await getClassCandidates();
      if (!supportedClassCandidates(classes).length) {
        ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Generator.NoSupportedClasses"));
        return false;
      }
    }
    return true;
  }

  /** Module-owned creature category controls: never let an AI draft, selector,
   * or treasure budget reintroduce a category the GM disabled. */
  #enforceCreatureCategoryOptions(concept, mode = this.#input.mode) {
    if (!concept || !["monster", "npc", "encounter"].includes(mode)) return concept;
    if (!this.#input.includeEquipment) concept.equipment = [];
    if (!this.#input.includeLoot) concept.loot = [];
    return concept;
  }

  #resetGenerationState() {
    this.#busy = true;
    this.#error = null;
    this.#created = null;
    this.#manifest = null;
    this.#concept = null;
    this.#resolved = null;
    this.#encounter = null;
    this.#pcConcept = null;
    this.#pcResolved = null;
    this.#hazard = null;
    this.#resetPCEdit();
    this.#experimentalDraft = false;
    this._tokenUsage = [];
  }

  #pcGenerationSteps(create) {
    return [
      ["concept", game.i18n.localize("SIMPLYPF2E.Progress.PCConcept"), taskMaxTokens(AI_TASK.PC_CONCEPT)],
      ["abc", game.i18n.localize("SIMPLYPF2E.Progress.ABC"), taskMaxTokens(AI_TASK.ABC_SELECTION)],
      ["feats", game.i18n.localize("SIMPLYPF2E.Progress.Feats"), taskMaxTokens(AI_TASK.FEAT_SELECTION)],
      ...(this.#input.allowSpellcasting ? [["spells", game.i18n.localize("SIMPLYPF2E.Progress.Spells"), taskMaxTokens(AI_TASK.PC_SPELL_SELECTION)]] : []),
      ["equipment", game.i18n.localize("SIMPLYPF2E.Progress.Equipment"), taskMaxTokens(AI_TASK.EQUIPMENT_SELECTION)],
      ["loot", game.i18n.localize("SIMPLYPF2E.Progress.Loot"), taskMaxTokens(AI_TASK.LOOT_DRAFT) + taskMaxTokens(AI_TASK.LOOT_SELECTION)],
      ["match", game.i18n.localize("SIMPLYPF2E.Progress.Match"), 1800],
      ...(create ? [["apply", game.i18n.localize("SIMPLYPF2E.Progress.Apply"), 2400]] : [])
    ];
  }

  #encounterGenerationSteps(composition, create) {
    const memberLabel = (i) => game.i18n.format("SIMPLYPF2E.Progress.Member", {
      index: i + 1, total: composition.members.length
    });
    return [
      ["design", game.i18n.localize("SIMPLYPF2E.Progress.Design"), taskMaxTokens(AI_TASK.ENCOUNTER_DESIGN)],
      ...composition.members.map((_, i) => [`member${i}`, memberLabel(i), taskMaxTokens(AI_TASK.CREATURE_CONCEPT) + taskMaxTokens(AI_TASK.SPELL_SELECTION) + taskMaxTokens(AI_TASK.ABILITY_SELECTION) + taskMaxTokens(AI_TASK.CREATURE_FEAT_SELECTION) + taskMaxTokens(AI_TASK.EQUIPMENT_SELECTION) + taskMaxTokens(AI_TASK.LOOT_SELECTION)]),
      ["match", game.i18n.localize("SIMPLYPF2E.Progress.Match"), 1600],
      ...(create ? [["apply", game.i18n.localize("SIMPLYPF2E.Progress.Apply"), 2400]] : [])
    ];
  }

  async #runPCGeneration(isRandom, { create }) {
    this.#resetGenerationState();
    const signal = this._beginProgress(this.#pcGenerationSteps(create));
    const runId = this._runId;
    let outcome = "success";
    try {
      await this.#generatePC(isRandom, { signal });
      if (create && this.#pcConcept) outcome = await this.#createCharacterActor({ reuseRunId: runId });
    } catch (err) {
      this._recordTokens(
        this._progress?.steps.find((step) => step.state === "active")?.label
          ?? game.i18n.localize("SIMPLYPF2E.Progress.PCConcept"), err?.usage
      );
      this.#noteGenerationFailure(err, "character generation");
      this.#pcConcept = null;
      this.#pcResolved = null;
      this.#resetPCEdit();
      this.#manifest = null;
      outcome = err?.cancelled ? "cancelled" : "error";
    } finally {
      this.#busy = false;
      this._finishRun(outcome, runId);
      await this.render();
    }
  }

  async #runEncounterGeneration(isRandom, { create }) {
    let composition;
    try {
      composition = composeEncounter(this.#input.threat, this.#input.partySize, this.#input.level);
    } catch (err) {
      this.#noteGenerationFailure(err, "encounter generation");
      this.#busy = false;
      await this.render();
      return "error";
    }
    this.#resetGenerationState();
    const signal = this._beginProgress(this.#encounterGenerationSteps(composition, create));
    const runId = this._runId;
    let outcome = "success";
    try {
      await this.#generateEncounter(isRandom, { signal, composition });
      if (create && this.#encounter) outcome = await this.#createEncounterActors({ reuseRunId: runId });
    } catch (err) {
      this._recordTokens(
        this._progress?.steps.find((step) => step.state === "active")?.label
          ?? game.i18n.localize("SIMPLYPF2E.Progress.Design"), err?.usage
      );
      this.#noteGenerationFailure(err, "encounter generation");
      this.#encounter = null;
      outcome = err?.cancelled ? "cancelled" : "error";
    } finally {
      this.#busy = false;
      this._finishRun(outcome, runId);
      await this.render();
    }
  }

  async #runGeneration(isRandom, { create = false, request = null } = {}) {
    if (this.#busy) return;
    // Reserve synchronously before async readiness/catalog work so a second
    // click cannot start a competing run while the first awaits I/O.
    this.#busy = true;
    try {
      // A /forge request already captured the drafts and chose the Monster
      // view. Re-reading the form here would revert that selection.
      if (!request) this.#readForm();
      // Hazard mode: the gate is checked before readiness or any provider work.
      if (this.#input.mode === "hazard" && this.#refusedHazardNow()) {
        this.#busy = false;
        await this.render();
        return;
      }
      if (!await this.#assertGenerationReady()) {
        this.#busy = false;
        await this.render();
        return;
      }
    } catch (err) {
      this.#noteGenerationFailure(err, "generation readiness");
      this.#busy = false;
      await this.render();
      return;
    }
    if (this.#input.mode === "character") {
      if (!isRandom && !this.#input.prompt.trim()) {
        ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Errors.NoPrompt"));
        this.#busy = false;
        await this.render();
        return;
      }
      return this.#runPCGeneration(isRandom, { create });
    }
    if (this.#input.mode === "encounter") return this.#runEncounterGeneration(isRandom, { create });
    // Hazards are always a reviewed preview: Create is a separate, explicit action.
    if (this.#input.mode === "hazard") return this.#runHazardGeneration(isRandom);
    // A /forge request supplies its own brief and level for this run only.
    const brief = request ? request.prompt : this.#input.prompt;
    const level = request ? request.level : this.#input.level;
    if (!isRandom && !brief.trim()) {
      ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Errors.NoPrompt"));
      this.#busy = false;
      await this.render();
      return;
    }
    this.#busy = true;
    this.#error = null;
    this.#created = null;
    this.#manifest = null;
    this.#encounter = null;
    this.#pcConcept = null;
    this.#pcResolved = null;
    this.#hazard = null;
    this.#resetPCEdit();
    this.#experimentalDraft = request !== null;
    this._tokenUsage = [];
    const signal = this._beginProgress([
      ["concept", game.i18n.localize("SIMPLYPF2E.Progress.Concept"), taskMaxTokens(AI_TASK.CREATURE_CONCEPT)],
      ...(this.#input.allowSpellcasting ? [["spells", game.i18n.localize("SIMPLYPF2E.Progress.Spells"), taskMaxTokens(AI_TASK.SPELL_FOCUS) + taskMaxTokens(AI_TASK.SPELL_SELECTION)]] : []),
      ["abilities", game.i18n.localize("SIMPLYPF2E.Progress.Abilities"), taskMaxTokens(AI_TASK.ABILITY_SELECTION)],
      ["feats", game.i18n.localize("SIMPLYPF2E.Progress.Feats"), taskMaxTokens(AI_TASK.CREATURE_FEAT_SELECTION)],
      ["equipment", game.i18n.localize("SIMPLYPF2E.Progress.Equipment"), taskMaxTokens(AI_TASK.EQUIPMENT_SELECTION)],
      ["loot", game.i18n.localize("SIMPLYPF2E.Progress.Loot"), taskMaxTokens(AI_TASK.LOOT_SELECTION)],
      ["match", game.i18n.localize("SIMPLYPF2E.Progress.Match"), 1200],
      ...(create ? [["apply", game.i18n.localize("SIMPLYPF2E.Progress.Apply"), 2400]] : [])
    ]);
    const runId = this._runId;
    let outcome = "success";
    try {
      await this._setStep("concept");
      const gmPrompt = isRandom ? randomBrief(this.#input.mode) : brief;
      const { concept: raw, usage } = await generateConcept({
        // Random mode rolls a fresh local brief each generation, so
        // Regenerate gives a genuinely different creature every time.
        prompt: gmPrompt,
        level,
        rarity: this.#input.rarity,
        allowSpellcasting: this.#input.allowSpellcasting,
        includeEquipment: this.#input.includeEquipment,
        includeLoot: this.#input.includeLoot,
        // A /forge brief is explicit, so the preset's suggestions do not apply.
        preset: isRandom || request ? null : findPreset(this.#input.preset)?.prompt ?? null,
        amount: this.#input.treasureAmount,
        intent: this.#input.mode,
        onProgress: this._progressCallback(), signal
      });
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Concept"), usage);
      this.#concept = this.#enforceCreatureCategoryOptions(
        { ...normalizeConcept(raw, { level, rarity: this.#input.rarity }), gmPrompt }
      );
      // Defensive filter: allowSpellcasting is only enforced in the AI prompt,
      // so a non-compliant model output can still return a valid tradition.
      // Strip it here (focus spells ride on it — normalizeConcept already
      // ties focusSpells to spellcasting, and every downstream resolve/build
      // step re-checks concept.spellcasting, so nulling it here is enough).
      if (!this.#input.allowSpellcasting) {
        this.#concept.spellcasting = null;
        this.#concept.focusSpells = [];
      }
      // Gate on the SAME condition the step list above was built from — the
      // "spells" step key only exists when allowSpellcasting was true.
      // applyStep no-ops on a missing key, but we still skip the call so the
      // UI does not leave a phantom spells step active.
      if (this.#input.allowSpellcasting && this.#concept.spellcasting) await this._setStep("spells");
      else this._skipStep("spells");
      await this.#refineSpells(this.#concept, signal);
      if (this.#concept.specialAbilities.length) await this._setStep("abilities");
      else this._skipStep("abilities");
      await this.#refineCreatureAbilities(this.#concept, signal);
      // Named requirements in the original brief may be missing from the AI draft.
      await this._setStep("feats");
      await this.#refineCreatureFeats(this.#concept, signal);
      if (this.#concept.equipment.length) await this._setStep("equipment");
      else this._skipStep("equipment");
      await this.#refineEquipment(this.#concept, signal);
      if (this.#concept.loot.length) await this._setStep("loot");
      else this._skipStep("loot");
      await this.#refineLoot(this.#concept, signal);
      await this._setStep("match");
      this.#resolved = await resolveConcept(this.#concept, { exactContent: true });
      // Treasure budget: the module owns the numbers (level + rarity from the
      // tables, scaled by the Treasure amount control); only coins flex.
      this.#resolved.loot = await applyTreasureBudget(
        this.#resolved.loot,
        this.#concept.loot.length ? treasureBudget(this.#concept.level, this.#concept.rarity, this.#input.treasureAmount) : 0
      );
      const manifest = completionManifest({ mode: this.#input.mode, concept: this.#concept, resolved: this.#resolved });
      this._throwIfCancelled();
      assertComplete(manifest);
      this.#manifest = manifest;
      const eq = this.#resolved.equipment;
      if (eq.length) {
        const misses = eq.filter((e) => !e.entry).map((e) => e.name);
        console.log(`${MODULE_ID} | equipment matches: ${eq.length - misses.length}/${eq.length}`,
          misses.length ? { missing: misses } : "");
      }
      console.log(`${MODULE_ID} | token usage`, this._tokenUsage);
      if (create && this.#concept && !this.#error) outcome = await GeneratorApp.#onCreateActor.call(this, { reuseRunId: runId });
    } catch (err) {
      this._recordTokens(
        this._progress?.steps.find((step) => step.state === "active")?.label
          ?? game.i18n.localize("SIMPLYPF2E.Progress.Concept"), err?.usage
      );
      this.#noteGenerationFailure(err, "generation");
      this.#concept = null;
      this.#resolved = null;
      this.#manifest = null;
      outcome = err?.cancelled ? "cancelled" : "error";
    } finally {
      this.#busy = false;
      this._finishRun(outcome, runId);
      await this.render();
    }
  }

  /**
   * Encounter mode: the module fixes the composition to the XP budget, the
   * AI names the encounter and briefs each slot, then every member runs
   * through the normal single-creature pipeline.
   */
  async #generateEncounter(isRandom = false, { signal = null, composition = null } = {}) {
    const { level: partyLevel, rarity } = this.#input;
    composition ??= composeEncounter(this.#input.threat, this.#input.partySize, partyLevel);
    const memberLabel = (i) => game.i18n.format("SIMPLYPF2E.Progress.Member", {
      index: i + 1, total: composition.members.length
    });
    await this._setStep("design");
      // Random mode always rolls a fresh theme, even over a typed prompt —
      // same contract as the other modes' dice button (#onGenerateRandom).
      const theme = isRandom ? randomBrief(this.#input.mode) : (this.#input.prompt.trim() || randomBrief(this.#input.mode));
      // The theme describes a group. An AI-authored brief cannot prove which
      // member owns an explicit power, so stop before provider spend rather
      // than assigning every mentioned feat to every creature.
      const requirementCatalog = await getCreatureFeatCandidates({ level: 24, limit: null, prompt: theme });
      this._throwIfCancelled();
      const named = creatureFeatRequirements(theme, [], requirementCatalog);
      if (named.length) throw creatureFeatError(
        `the encounter names "${String(named[0].name).slice(0, 100)}", but its member assignment cannot be verified automatically. Generate the creature with that ability separately.`,
        "NPC_ABILITY_ENCOUNTER_REQUIREMENT_AMBIGUOUS"
      );
      const design = await designEncounter({
        theme,
        partyLevel,
        slots: composition.members,
        onProgress: this._progressCallback(), signal
      });
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Design"), design.usage);

      const members = [];
      for (let i = 0; i < composition.members.length; i++) {
        const slot = composition.members[i];
        await this._setStep(`member${i}`);
        const { concept: raw, usage } = await generateConcept({
          prompt: `${design.briefs[i]} (Part of the encounter "${design.name}": ${theme})`,
          level: slot.level,
          rarity,
          allowSpellcasting: this.#input.allowSpellcasting,
          includeEquipment: this.#input.includeEquipment,
          includeLoot: this.#input.includeLoot,
          // The preset row is now a stable slot in every mode: a selected
          // preset shapes each member the same way it shapes a single
          // creature (and, matching the Single dice button, Random ignores it).
          preset: isRandom ? null : findPreset(this.#input.preset)?.prompt ?? null,
          amount: this.#input.treasureAmount,
          intent: "monster",
          onProgress: this._progressCallback(), signal
        });
        this._recordTokens(memberLabel(i), usage);
        const concept = this.#enforceCreatureCategoryOptions(
          { ...normalizeConcept(raw, { level: slot.level, rarity }), gmPrompt: theme }, "encounter"
        );
        // Same defensive filter as the single-creature pipeline: the prompt
        // asks for no spellcasting, but a non-compliant model can still
        // return a valid tradition.
        if (!this.#input.allowSpellcasting) {
          concept.spellcasting = null;
          concept.focusSpells = [];
        }
        await this.#refineSpells(concept, signal);
        await this.#refineCreatureAbilities(concept, signal);
        await this.#refineCreatureFeats(concept, signal, { encounter: true });
        await this.#refineEquipment(concept, signal);
        await this.#refineLoot(concept, signal);
        members.push({ ...slot, concept });
      }

      await this._setStep("match");
      for (const member of members) {
        member.resolved = await resolveConcept(member.concept, { exactContent: true });
        // Treasure is calibrated to the PARTY level and the WHOLE encounter:
        // treasureBudget() returns one encounter's total, split evenly across
        // groups. A group keeps its constant share (treasureGroupBudget)
        // regardless of copy count — only the per-copy split changes
        // (#stepMemberCount recomputes it the same way).
        member.treasureGroupBudget =
          member.concept.loot.length ? treasureBudget(partyLevel, member.concept.rarity, this.#input.treasureAmount) / members.length : 0;
        member.treasureBudgetEach = member.treasureGroupBudget / Math.max(member.count, 1);
        member.resolved.loot = await applyTreasureBudget(member.resolved.loot, member.treasureBudgetEach);
        member.manifest = completionManifest({ mode: "monster", concept: member.concept, resolved: member.resolved });
        assertComplete(member.manifest);
        member.treasureEach = lootValueGp(member.resolved.loot);
      }
      const allEq = members.flatMap((m) => m.resolved.equipment);
      if (allEq.length) {
        const misses = allEq.filter((e) => !e.entry).map((e) => e.name);
        console.log(`${MODULE_ID} | equipment matches: ${allEq.length - misses.length}/${allEq.length}`,
          misses.length ? { missing: misses } : "");
      }
      this._throwIfCancelled();
      this.#encounter = {
        name: design.name,
        budget: composition.budget,
        spent: composition.spent,
        treasureBudget: members.reduce((sum, m) => sum + m.count * (m.treasureBudgetEach ?? 0), 0),
        treasureSpent: members.reduce((sum, m) => sum + m.count * (m.treasureEach ?? 0), 0),
        members
      };
    console.log(`${MODULE_ID} | token usage`, this._tokenUsage);
  }

  /**
   * Player Character mode: ground a first-draft AI concept into a real
   * ancestry/heritage/background/class, a batch of level-appropriate feats,
   * spells (if the class casts) and equipment — mirrors #runGeneration's
   * single-creature shape, with an extra "abc"/"feats" step. Unlike NPCs, no
   * stats are computed here: the PF2e system derives AC/HP/saves/
   * proficiencies/spell slots itself from the real items this assembles.
   */
  async #generatePC(isRandom, { signal = null } = {}) {
    const catalogs = await this.#identityCatalogs();
    this._throwIfCancelled();
    const requiredIdentity = resolvePCIdentity({
      prompt: this.#input.prompt, choices: this.#input.pcIdentity, catalogs, isRandom
    });
    if (requiredIdentity.class && !supportedClassCandidates([requiredIdentity.class]).length) {
      throw new Error(game.i18n.localize("SIMPLYPF2E.Generator.NoSupportedClasses"));
    }
    await validatePCIdentityRequirements(requiredIdentity);
    this._throwIfCancelled();
    await this._setStep("concept");
      const { concept: raw, usage } = await generatePCConcept({
        prompt: isRandom ? randomBrief(this.#input.mode) : this.#input.prompt,
        level: this.#input.level,
        allowSpellcasting: this.#input.allowSpellcasting,
        // Stable preset slot, PC flavor: the guidance steers class/style
        // choice only (generatePCConcept tells the model to ignore any
        // numeric scale wording — a PC's numbers come from the system).
        preset: isRandom ? null : findPreset(this.#input.preset)?.prompt ?? null,
        requiredIdentity,
        onProgress: this._progressCallback(), signal
      });
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.PCConcept"), usage);
      const concept = normalizePCConcept(raw, { level: this.#input.level });
      concept.gmPrompt = isRandom ? "" : this.#input.prompt;
      concept.requiredIdentity = requiredIdentity;
      applyPCIdentity(concept, requiredIdentity);

      await this._setStep("abc");
      // Rarity cap: excludes ancestries/backgrounds/heritages rarer than the
      // GM's chosen max from the candidate lists the AI even sees, so e.g.
      // capping at Uncommon means a Rare pick like Fetchling can never be
      // offered — not just discouraged by prompt wording.
      const { ancestry: ancestryCandidates, background: backgroundCandidates,
        class: allClassCandidates, heritage: heritageCandidates } = catalogs;
      const classCandidates = supportedClassCandidates(allClassCandidates);
      if (!classCandidates.length) throw new Error(game.i18n.localize("SIMPLYPF2E.Generator.NoSupportedClasses"));
      const abc = await selectAncestryBackgroundClass({
        concept, ancestryCandidates,
        // A known background requiring an explicit local choice cannot finish
        // an unconstrained/Random run. Keep it available in Required choices,
        // but don't spend selecting it before the GM has supplied its Lore.
        backgroundCandidates: backgroundCandidates.filter((candidate) =>
          !getBackgroundLoreOptions(candidate).length || requiredIdentity.backgroundLore !== undefined),
        classCandidates, heritageCandidates,
        onProgress: this._progressCallback(), signal
      });
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.ABC"), abc.usage);
      concept.ancestry = abc.ancestry;
      concept.ancestryCandidate = abc.ancestryCandidate;
      concept.heritage = abc.heritage;
      concept.heritageCandidate = abc.heritageCandidate;
      concept.background = abc.background;
      concept.backgroundCandidate = abc.backgroundCandidate;
      concept.class = abc.class;
      concept.classCandidate = abc.classCandidate;
      concept.keyAbility = abc.keyAbility;
      assertPCIdentity(concept, requiredIdentity);

      // Resolve ABC + grants + feat-slot candidates now (index lookups are
      // cheap/cached) so the reused equipment/spell refine helpers below have
      // real ancestry/class trait slugs for thematic context.
      let resolved = await resolvePCConcept(concept);
      concept.traits = [slugify(resolved.ancestryDoc.name), slugify(resolved.classDoc.name)];

      // The real class document owns the casting mode and base slot plan.
      // Variable traditions still need the selected bloodline/patron checked.
      const castingProfile = pcSpellcastingProfile(resolved.classDoc);
      if (!this.#input.allowSpellcasting) concept.spellcasting = null;
      if (this.#input.allowSpellcasting && castingProfile) {
        if (!concept.spellcasting && castingProfile.tradition) {
          concept.spellcasting = { tradition: castingProfile.tradition, spells: [] };
        }
        concept.spellcastingNoticeKey = castingProfile.tradition
          ? "SIMPLYPF2E.Preview.PCBaseSpellPlan"
          : "SIMPLYPF2E.Preview.PCVariableSpellPlan";
        if (concept.spellcasting) {
          if (castingProfile.tradition) concept.spellcasting.tradition = castingProfile.tradition;
          const plan = pcSpellPlan(concept.level, castingProfile);
          concept.spellcasting.plannedPicks = plan.picks;
          concept.spellcasting.signatureRanks = plan.signatureRanks;
          concept.spellcasting.preparationMode = castingProfile.mode;
          concept.spellcasting.maxRank = Math.max(...Object.entries(plan.slots)
            .filter(([, count]) => count > 0).map(([rank]) => Number(rank)));
        }
      } else if (concept.spellcasting) {
        concept.spellcastingNoticeKey = "SIMPLYPF2E.Preview.PCApproximateSpellPlan";
      }

      await this._setStep("feats");
      if (resolved.featSlots.length) {
        const { picks, usage: featUsage } = await selectFeats({
          concept, slots: resolved.featSlots, onProgress: this._progressCallback(), signal
        });
        this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Feats"), featUsage);
        resolved.feats = await resolveFeatPicks(resolved.featSlots, picks, { exactContent: true, className: resolved.classDoc?.name ?? null });
      } else {
        resolved.feats = [];
      }

      // Same defensive filter as the NPC pipeline: allowSpellcasting is only
      // enforced in the AI prompt, so a non-compliant model output can still
      // return a valid tradition.
      if (!this.#input.allowSpellcasting) concept.spellcasting = null;

      // Both refine helpers reuse the NPC pipeline; the PC spell pass also
      // receives a class-qualified plan where supported. The
      // PC concept carries the same fields they read (blurb/description/
      // traits/strikes/equipment/loot/level/name/rarity).
      // Gate on the SAME condition the step list above was built from, same
      // as the NPC pipeline: only call _setStep("spells") when that key exists.
      if (this.#input.allowSpellcasting && concept.spellcasting) await this._setStep("spells");
      else this._skipStep("spells");
      await this.#refineSpells(concept, signal);

      await this._setStep("equipment");
      await this.#refineEquipment(concept, signal);

      await this._setStep("loot");
      await this.#refinePCLoot(concept, signal);

      await this._setStep("match");
      // #refineSpells/#refineEquipment/#refinePCLoot replaced the concept's
      // first-draft spell/equipment/loot picks with grounded ones —
      // re-resolve those parts (the ABC/grants/feat-slot lookups above are
      // cheap and index-cached, so redoing them here is harmless; keep the
      // feat picks already made).
      const final = await resolvePCConcept(concept, { exactContent: true });
      resolved = { ...final, feats: resolved.feats };
      // Cross-bucket dedup BEFORE any budget math sees the loot list: the AI
      // sometimes lists the same named item as both starting equipment and
      // loot (issue found in live QA — a "+1 Striking Dwarven War Axe" and a
      // "Sturdy Shield (Minor)" both shipped twice). buildEquipmentItems's own
      // dedup only catches repeats WITHIN equipment, so this drops any loot
      // entry whose name already appears in equipment. Must happen before the
      // budget below, or the budget counts gp for an item that then gets
      // dropped and the PC ends up under-provisioned.
      resolved.loot = dedupeLootAgainstEquipment(resolved.loot, resolved.equipment);
      // Starting wealth: GM Core Table 10-10 Character Wealth's lump sum for
      // a character created at this level (pcStartingWealthGp), NOT
      // treasureBudget() (an NPC per-encounter share of a PARTY total). PC
      // equipment embeds at its real gp value (unlike NPC gear, which is
      // free by design), so that value is paid for out of starting wealth
      // FIRST — only the remainder is left as a loot budget for
      // applyTreasureBudget to fill with items/coin. Without this, equipment
      // and loot both drew on the full wealth target and a PC's total assets
      // exceeded it by the gear's full value (worse at higher level, where
      // runes scale). applyTreasureBudget itself is reused completely
      // unchanged — it only ever flexes COIN entries, so the magic items
      // #refinePCLoot just grounded are left alone and only the coin
      // remainder is padded/trimmed to hit the (reduced) target.
      const wealthTarget = pcStartingWealthGp(concept.level, this.#input.treasureAmount);
      const equipmentGp = await equipmentValueGp(resolved.equipment);
      if (equipmentGp > wealthTarget) {
        console.warn(`${MODULE_ID} | PC equipment (${equipmentGp} gp) alone exceeds the starting wealth target (${wealthTarget} gp) — keeping the gear and flooring the loot budget at 0`);
      }
      const lootBudget = Math.max(wealthTarget - equipmentGp, 0);
      // PC-only: applyTreasureBudget() never trims NAMED items (by design,
      // for NPC treasure), so AI-named loot (e.g. three separate +1 armors)
      // could ship far over the starting-wealth budget. Trim named loot to
      // the budget FIRST — ascending price order naturally keeps cheap
      // consumables and drops the priciest overflow — then let
      // applyTreasureBudget do its usual coin-only pad/trim against whatever
      // value remains.
      resolved.loot = enforceNamedLootBudget(resolved.loot, lootBudget);
      resolved.loot = await applyTreasureBudget(resolved.loot, lootBudget);

      // If most of the (equipment-adjusted) loot budget still sits as coin
      // after the first purchase pass, make ONE more pass to convert it into
      // real items (issue #64 item 6: PCs were leaving too much unspent
      // gold). Bounded to a single retry.
      const coinGp = lootValueGp(resolved.loot.filter((l) => parseCoins(l.name)));
      if (lootBudget > 0 && coinGp > lootBudget * 0.25) {
        try {
          const { loot: draft, usage: extraUsage } = await generatePCLoot({
            concept, amount: this.#input.treasureAmount, onProgress: this._progressCallback(), signal
          });
          this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Loot"), extraUsage);
          // Keep the already-grounded items, add the new draft, re-ground and re-budget.
          concept.loot = [...concept.loot.filter((l) => !parseCoins(l.name)), ...normalizeLoot(draft)];
          await this.#refineLoot(concept, signal);
          const topUp = await resolvePCConcept(concept, { exactContent: true });
          resolved = { ...topUp, feats: resolved.feats };
          resolved.loot = dedupeLootAgainstEquipment(resolved.loot, resolved.equipment);
          resolved.loot = enforceNamedLootBudget(resolved.loot, lootBudget);
          resolved.loot = await applyTreasureBudget(resolved.loot, lootBudget);
        } catch (err) {
          if (err?.cancelled) throw err;
          this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Loot"), err?.usage);
          console.warn(`${MODULE_ID} | extra PC purchase pass failed, leaving remaining wealth as coin`, err);
          this.#warnToleratedStage("loot");
        }
      }
      assertPCIdentity(concept, requiredIdentity);
      const manifest = completionManifest({ mode: "character", concept, resolved });
      this._throwIfCancelled();
      assertComplete(manifest);
      this.#manifest = manifest;

      this.#pcConcept = concept;
      this.#pcResolved = resolved;
      this.#resetPCEdit();
      this.#pcIdentityInput = this.#identityInputSnapshot();
    console.log(`${MODULE_ID} | token usage`, this._tokenUsage);
  }

  /**
   * Grounded spell selection: first ask the AI for a thematic focus (so the
   * compendium query below can be narrowed instead of dumping every spell in
   * the tradition), then fetch that narrowed, level-capped list and let the
   * AI pick the actual spells from it. The first-draft spells from
   * generateConcept() are UNCONSTRAINED (the AI free-invents plausible names
   * as "inspiration" only) — if this grounded pass doesn't produce a real,
   * compendium-backed list, spells are dropped rather than left as unvetted
   * draft names, same fail-closed behavior as feats elsewhere in the pipeline.
   */
  async #refineSpells(concept, signal) {
    const spellcasting = concept?.spellcasting;
    if (!spellcasting) return;
    try {
      // Two AI calls share the "Spell selection" step. Sub-labels distinguish
      // them in the detail line; the bar stays on phase fill, not extra steps.
      let keywords = [];
      try {
        const focusLabel = game.i18n.localize("SIMPLYPF2E.Progress.SpellFocus");
        const focus = await chooseSpellFocus({
          concept,
          tradition: spellcasting.tradition,
          onProgress: this._progressCallback(focusLabel), signal
        });
        keywords = focus.keywords;
        this._recordTokens(focusLabel, focus.usage);
      } catch (err) {
        if (err?.cancelled) throw err;
        this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.SpellFocus"), err?.usage);
        console.warn(`${MODULE_ID} | spell focus selection failed, using first-draft spell names only`, err);
        this.#warnToleratedStage("spells");
      }
      const candidates = await getSpellCandidates(
        spellcasting.tradition,
        spellcasting.maxRank,
        [...spellcasting.spells.map((spell) => spell.name), ...keywords],
        spellcasting.plannedPicks
      );
      const focusCandidates = await getFocusSpellCandidates(
        spellcasting.maxRank,
        [...concept.focusSpells.map((spell) => spell.name), ...keywords]
      );
      if (!candidates.length) {
        console.warn(`${MODULE_ID} | no spell candidates found, dropping spellcasting (unconstrained first-draft spells discarded)`);
        spellcasting.spells = [];
      } else {
        const { spells, focusSpells, usage } = await selectSpells({
          concept,
          candidates,
          focusCandidates,
          maxRank: spellcasting.maxRank,
          plannedPicks: spellcasting.plannedPicks,
          preparationMode: spellcasting.preparationMode,
          signatureRanks: spellcasting.signatureRanks,
          onProgress: this._progressCallback(game.i18n.localize("SIMPLYPF2E.Progress.Spells")), signal
        });
        this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Spells"), usage);
        spellcasting.spells = spells;
        concept.focusSpells = focusSpells;
      }
    } catch (err) {
      if (err?.cancelled) throw err;
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Spells"), err?.usage);
      console.warn(`${MODULE_ID} | grounded spell selection failed, dropping spellcasting (unconstrained first-draft spells discarded)`, err);
      this.#warnToleratedStage("spells");
      spellcasting.spells = [];
      concept.focusSpells = [];
    }
    if (spellcasting.spells.length) return;
    // A known class spell plan stays visible as empty: completionManifest()
    // records every missing module-owned pick and blocks actor creation.
    if (spellcasting.plannedPicks) return;
    concept.spellcasting = null;
  }

  /** Resolve published abilities by opaque ID; unlisted concept flavor stays narrative-only. */
  async #refineCreatureAbilities(concept, signal) {
    if (!concept?.specialAbilities?.length) return;
    const draft = concept.specialAbilities;
    const narratives = draft.filter((ability) => !ability.glossary).map((ability) => ({ ...ability, narrative: true }));
    try {
      const keywords = draft.flatMap((ability) => [ability.glossary, ability.name])
        .map((name) => String(name ?? "").toLowerCase()).filter(Boolean);
      const candidates = await getAbilityCandidates(keywords);
      if (!candidates.length) {
        concept.specialAbilities = [...draft.filter((ability) => ability.glossary), ...narratives].slice(0, 6);
        return;
      }
      const { abilities, usage } = await selectCreatureAbilities({
        concept, candidates, onProgress: this._progressCallback(), signal
      });
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Abilities"), usage);
      concept.specialAbilities = [...abilities, ...narratives].slice(0, 6);
    } catch (err) {
      if (err?.cancelled) throw err;
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Abilities"), err?.usage);
      console.warn(`${MODULE_ID} | grounded creature ability selection failed; unresolved glossary abilities will block creation`, err);
      concept.specialAbilities = [...draft.filter((ability) => ability.glossary), ...narratives].slice(0, 6);
    }
  }

  /** Select only complete source-backed packages. Unsupported AI suggestions
   * are replaced in the existing single grounded request, with no repair loop.
   */
  async #refineCreatureFeats(concept, signal, { encounter = false } = {}) {
    if (!concept) return;
    const draft = concept.feats ?? [];
    try {
      const catalog = await getCreatureFeatCandidates({
        level: 24, limit: null,
        preferredNames: draft.map((feat) => typeof feat === "string" ? feat : feat.name),
        prompt: concept.gmPrompt ?? ""
      });
      this._throwIfCancelled();
      const required = creatureFeatRequirements(concept.gmPrompt, draft, catalog);
      if (!draft.length && !required.length) {
        this._skipStep("feats");
        return;
      }
      if (encounter && required.length) throw creatureFeatError(
        `the encounter names "${String(required[0].name).slice(0, 100)}", but its member assignment cannot be verified automatically. Generate the creature with that ability separately.`,
        "NPC_ABILITY_ENCOUNTER_REQUIREMENT_AMBIGUOUS"
      );
      const ambiguous = required.find((item) => item.ambiguous);
      if (ambiguous) throw creatureFeatError(
        `the request mentions "${String(ambiguous.name).slice(0, 100)}" without an unambiguous positive mechanical requirement. Please state the desired feat or ability explicitly.`,
        "NPC_ABILITY_REQUIREMENT_AMBIGUOUS"
      );
      if (!catalog.length) throw creatureFeatError(
        "no enabled class-feat sources are available for this level.", "NPC_FEAT_CATALOG_UNAVAILABLE",
        { candidateCount: 0 }
      );
      // Reserve requested names ahead of the bounded offer. Duplicate names
      // retain distinct source identities, and only verified packages survive.
      const requiredNames = new Set(required.map((item) => item.normalized));
      const eligible = catalog.filter((item) => Number.isFinite(item.level) && item.level <= concept.level);
      const ordered = [
        ...eligible.filter((item) => requiredNames.has(normalizeCreatureFeatName(item.name))),
        ...eligible.filter((item) => !requiredNames.has(normalizeCreatureFeatName(item.name)))
      ];
      const { candidates, unavailable } = await filterNpcAbilityCandidates(ordered, { concept, limit: 16, signal });
      this._throwIfCancelled();
      for (const requirement of required) {
        if (candidates.some((item) => normalizeCreatureFeatName(item.name) === requirement.normalized)) continue;
        const rejected = unavailable.find(({ candidate }) => normalizeCreatureFeatName(candidate.name) === requirement.normalized);
        const aboveLevel = catalog.some((item) => normalizeCreatureFeatName(item.name) === requirement.normalized && item.level > concept.level);
        throw creatureFeatError(
          `required ability "${String(requirement.name).slice(0, 100)}" cannot be completed automatically: ${rejected?.reason ?? (aboveLevel ? "its source level exceeds the creature level" : "no eligible exact source was available")}.`,
          "NPC_ABILITY_REQUIRED_UNSUPPORTED", { candidateCount: catalog.length, supportedCount: candidates.length }
        );
      }
      if (!candidates.length) throw creatureFeatError(
        "none of the available signature abilities can be completed automatically with the enabled sources.",
        "NPC_ABILITY_CATALOG_UNAVAILABLE", { candidateCount: catalog.length, supportedCount: 0 }
      );
      const requestConcept = { ...concept, feats: [
        ...required.map(({ name }) => ({ name })),
        ...draft.filter((feat) => !requiredNames.has(normalizeCreatureFeatName(typeof feat === "string" ? feat : feat.name)))
      ] };
      const { feats, omitted, status, usage } = await selectCreatureFeats({
        concept: requestConcept, candidates, onProgress: this._progressCallback(), signal
      });
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Feats"), usage);
      this._throwIfCancelled();
      if (!Array.isArray(feats) || (!feats.length && omitted !== true && status !== "empty")) {
        throw creatureFeatError("the provider did not return a valid ability selection.", "NPC_FEAT_SELECTION_INVALID");
      }
      // Requirements come from the GM's original text. Even a valid empty
      // provider response cannot authorize removing a specifically named power.
      const selected = [...feats];
      const protectedKeys = new Set();
      for (const requirement of required) {
        const offered = candidates.filter((item) => normalizeCreatureFeatName(item.name) === requirement.normalized);
        const choice = offered.find((item) => selected.some((feat) => creatureFeatRefKey(feat.candidate) === creatureFeatRefKey(item.ref))) ?? offered[0];
        const key = creatureFeatRefKey(choice.ref);
        protectedKeys.add(key);
        if (!selected.some((feat) => creatureFeatRefKey(feat.candidate) === key)) {
          selected.push({ name: choice.name, candidate: choice.ref });
        }
      }
      // Charge supporting powers to the same package budget. Drop optional
      // suggestions only; an over-budget required set fails before any writes.
      while (true) {
        try {
          await resolveNpcAbilityPackages(selected, { concept, signal });
          break;
        } catch (err) {
          if (err?.code !== "NPC_ABILITY_BUDGET_EXCEEDED") throw err;
          const removable = selected.findLastIndex((feat) => !protectedKeys.has(creatureFeatRefKey(feat.candidate)));
          if (removable < 0) throw err;
          selected.splice(removable, 1);
        }
      }
      this._throwIfCancelled();
      concept.feats = selected;
    } catch (err) {
      if (err?.cancelled) throw err;
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Feats"), err?.usage);
      console.warn(`${MODULE_ID} | NPC ability selection stopped before creation`, {
        code: err?.code ?? "NPC_ABILITY_SELECTION_FAILED", ...err?.diagnostics
      });
      throw err;
    }
  }

  /**
   * Grounded equipment selection: fetch real, level-capped items from the
   * equipment compendium (narrowed by keywords drawn from the first-draft
   * gear names and strikes — no separate AI focus pass needed, unlike spells)
   * and let the AI pick the creature's carried gear from that list. The
   * final creation resolver accepts only retained candidate references.
   * Creatures designed to carry nothing (beasts, mindless) are skipped.
   */
  async #refineEquipment(concept, signal) {
    if (!concept?.equipment?.length) return;
    try {
      const draftNames = [...concept.equipment.map((e) => e.name), ...concept.strikes.map((s) => s.name)]
        .map((name) => String(name).toLowerCase()).filter(Boolean);
      const keywords = [...new Set([
        ...draftNames,
        ...draftNames.flatMap((name) => name.split(/[^a-z0-9]+/)).filter((token) => token.length > 2)
      ])];
      const candidates = await getEquipmentCandidates(concept.level, keywords);
      if (!candidates.length) return;
      const { equipment, omitted, usage } = await selectEquipment({
        concept,
        candidates,
        onProgress: this._progressCallback(), signal
      });
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Equipment"), usage);
      if (equipment.length || omitted === true) concept.equipment = equipment;
    } catch (err) {
      if (err?.cancelled) throw err;
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Equipment"), err?.usage);
      console.warn(`${MODULE_ID} | grounded equipment selection failed; unresolved draft equipment will block creation`, err);
    }
  }

  /**
   * Grounded loot selection: fetch real compendium items (treasure included)
   * and have the AI re-pick the first-draft haul from that list — the loot
   * counterpart of #refineEquipment(). Without it, a pre-Remaster name the
   * model recalls ("Bag of Holding") never fuzzy-matches its Remaster item
   * ("Spacious Pouch") and silently becomes a wrong-named custom treasure
   * item. Coins stay module-built, while scrolls now select from a bounded
   * exact spell slice in the same AI request. A haul of only coins skips the
   * request. The final creation resolver accepts only retained candidate
   * references for all non-coin loot.
   */
  async #refineLoot(concept, signal) {
    if (!concept?.loot?.length) return;
    if (concept.loot.every((l) => parseCoins(l.name))) return;
    try {
      const draftNames = concept.loot.map((loot) => String(loot.name).toLowerCase()).filter(Boolean);
      const keywords = [...new Set([
        ...draftNames,
        ...draftNames.flatMap((name) => name.split(/[^a-z0-9]+/)).filter((token) => token.length > 2)
      ])];
      const scrollKeywords = concept.loot
        .map((loot) => parseScroll(loot.name)?.spellName)
        .filter(Boolean);
      const [candidates, scrollCandidates] = await Promise.all([
        getLootCandidates(concept.level, keywords),
        scrollKeywords.length ? getScrollSpellCandidates(10, scrollKeywords) : []
      ]);
      if (!candidates.length && !scrollCandidates.length) return;
      const { loot, omitted, usage } = await selectLoot({
        concept,
        candidates,
        scrollCandidates,
        onProgress: this._progressCallback(), signal
      });
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Loot"), usage);
      if (loot.length || omitted === true) {
        const coins = concept.loot.filter((item) => parseCoins(item.name));
        // Coins are preserved from the first draft and resolved as sheet
        // currency. The catalog excludes them, but filter defensively here so
        // a malformed/stale selector result cannot duplicate a denomination.
        concept.loot = normalizeLoot([...coins, ...loot.filter((item) => !parseCoins(item?.name))]);
      }
    } catch (err) {
      if (err?.cancelled) throw err;
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Loot"), err?.usage);
      console.warn(`${MODULE_ID} | grounded loot selection failed; unresolved draft loot will block creation`, err);
    }
  }

  /**
   * PC counterpart of the NPC pipeline's built-in first-draft loot: NPCs get
   * one from their main generateConcept() call, but PCs never had any, so
   * 100% of starting wealth became raw coin with nothing actually purchased
   * (feature request: wealth should buy magic items). Drafts a small
   * wishlist via generatePCLoot() (mirrors generateLoot's shape/reuse of
   * lootGuide, framed as purchases rather than drops), then runs it through
   * the EXISTING shared #refineLoot() grounding step unchanged. If either
   * step fails, concept.loot just stays empty — applyTreasureBudget() (still
   * called afterward by the caller) then pads with coin only, same as before
   * this feature — never a hard failure.
   */
  async #refinePCLoot(concept, signal) {
    try {
      const { loot: draft, usage } = await generatePCLoot({
        concept, amount: this.#input.treasureAmount, onProgress: this._progressCallback(), signal
      });
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Loot"), usage);
      concept.loot = normalizeLoot(draft);
      await this.#refineLoot(concept, signal);
    } catch (err) {
      if (err?.cancelled) throw err;
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Loot"), err?.usage);
      console.warn(`${MODULE_ID} | PC starting-wealth item drafting failed, wealth will be all coin`, err);
      this.#warnToleratedStage("loot");
    }
  }

  /**
   * Create whatever is currently previewed. Routing is driven by which preview
   * actually EXISTS, not by the mode radio: switching modes leaves the old
   * preview on screen (its Create button included), and keying off the radio
   * sent that click to a null concept and silently did nothing.
   */
  static async #onCreateActor({ reuseRunId = null } = {}) {
    const reuseRun = reuseRunId === this._runId && this._runActive;
    if (this.#busy && !reuseRun) return "error";
    if (this.#hazard) return this.#createHazardActor();
    if (this.#encounter) return this.#createEncounterActors({ reuseRunId });
    if (this.#pcConcept) return this.#createCharacterActor({ reuseRunId });
    if (!this.#concept) return "error";
    const applyLabel = game.i18n.localize("SIMPLYPF2E.Progress.Apply");
    if (!reuseRun) {
      this.#busy = true;
      this.#error = null;
      this._beginProgress([["apply", applyLabel, 2400]], { cancellable: false });
    }
    const runId = this._runId;
    let actor = null;
    let committed = false;
    let outcome = "success";
    try {
      await this._setStep("apply");
      assertComplete(this.#manifest);
      // Art lookup has no world writes, so it remains before the irreversible
      // boundary and can still fail without locking a cancellation request.
      const scaffold = await findBestiaryScaffold(this.#concept);
      if (!scaffold) throw new Error(game.i18n.localize("SIMPLYPF2E.Errors.NoBestiaryScaffold"));
      const img = scaffold.img ?? null;
      // An experimental draft is authorized again here, after generation and any
      // reroll, so disabling the setting mid-run still blocks the native write.
      if (this.#experimentalDraft) assertExperimentalToolAccess();
      this._lockCreation();
      const created = await createActor(this.#concept, this.#resolved, { img, scaffold });
      actor = created.actor;
      verifyCreatedActor(actor, this.#manifest, created.expectedItems);
      const grounding = GeneratorApp.#completionContext(this.#manifest);
      this.#concept = null;
      this.#resolved = null;
      this.#manifest = null;
      this.#created = { name: actor.name, actorId: actor.id, count: 1, grounding };
      committed = true;
      try {
        ui.notifications.info(game.i18n.format("SIMPLYPF2E.Generator.Created", { name: actor.name }));
        await actor.sheet.render(true);
      } catch (err) {
        outcome = "warning";
        console.warn(`${MODULE_ID} | actor created, but its sheet could not be displayed`, err);
        try { ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Generator.CreatedPresentationFailed")); }
        catch (notificationErr) { console.warn(`${MODULE_ID} | could not show creation presentation warning`, notificationErr); }
      }
    } catch (err) {
      outcome = err?.cancelled ? "cancelled" : "error";
      if (!committed) {
        // createActor owns the native package transaction. If its cleanup of
        // a stranded actor failed, it marks that actor on the original error;
        // it has already attempted deletion, so never delete it a second time.
        let survivor = null;
        if (err?.simplyPF2eRollbackActor) {
          const stranded = err.simplyPF2eRollbackActor;
          survivor = `incomplete actor "${stranded.name}" still exists. The draft was discarded to prevent a duplicate; remove it manually before trying again.`;
        } else {
          survivor = await rollbackActor(actor, "unverified actor");
        }
        if (survivor) {
          this.#concept = null;
          this.#resolved = null;
          this.#manifest = null;
        }
        console.error(`${MODULE_ID} | actor creation failed`, err);
        this.#error = survivor ? `${err.message} ${survivor}` : err.message;
      } else {
        outcome = "warning";
        console.warn(`${MODULE_ID} | actor committed, but completion presentation failed`, err);
      }
    } finally {
      if (!reuseRun) {
        this.#busy = false;
        this._finishRun(outcome, runId);
        await this.render();
      }
    }
    return outcome;
  }

  /** Create the previewed PC actor. No bestiary art lookup (that's
   * creature-specific) — the character gets the default portrait. */
  async #createCharacterActor({ reuseRunId = null } = {}) {
    if (!this.#pcConcept) return "error";
    const reuseRun = reuseRunId === this._runId && this._runActive;
    if (this.#busy && !reuseRun) return "error";
    if (!reuseRun) {
      this.#busy = true;
      this.#error = null;
    }
    const applyingMessage = game.i18n.localize("SIMPLYPF2E.Progress.ApplyingCharacter");
    const applyLabel = game.i18n.localize("SIMPLYPF2E.Progress.Apply");
    this.#busyMessage = applyingMessage;
    if (!reuseRun) this._beginProgress([["apply", applyLabel, 2400]], { cancellable: false });
    const runId = this._runId;
    let outcome = "success";
    let created = false;
    let committed = false;
    let actor = null;
    try {
      // Fail closed: a PC with a pending choice, an unresolved item, or an edit in flight is never written.
      if (this.#pcEditInFlight || !validatePCEditCompletion(this.#pcPlan()).complete) {
        throw new Error(game.i18n.localize("SIMPLYPF2E.PCEdit.CreateBlocked"));
      }
      if (!reuseRun) {
        this.#readForm();
        if (this.#pcIdentityInput !== this.#identityInputSnapshot()) {
          throw new Error(game.i18n.localize("SIMPLYPF2E.Identity.PreviewChanged"));
        }
      }
      await this._setStep("apply");
      if (this._progress) this._progress.detail = applyingMessage;
      await this.render();
      this._lockCreation();
      const result = await createCharacterActor(this.#pcConcept, this.#pcResolved, {
        selectChoices: async (groups) => {
          const label = game.i18n.localize("SIMPLYPF2E.Progress.CharacterChoices");
          this.#busyMessage = null;
          try {
            // Choice selection is a substatus inside the same committed-write
            // lifetime. Starting a second run here used to replace the outer
            // identity and erase its token/progress history.
            await this._setStep("apply", label);
            const { picks, usage } = await selectCharacterChoices({
              concept: this.#pcConcept, groups,
              onProgress: this._progressCallback(label), signal: null
            });
            this._recordTokens(label, usage);
            if (picks.length < groups.length) {
              ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Generator.ChoicesNeedInput"));
            }
            return picks;
          } catch (err) {
            this._recordTokens(label, err.usage);
            ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Generator.ChoicesNeedInput"));
            throw err; // The builder leaves unanswered choices to PF2e.
          } finally {
            this.#busyMessage = applyingMessage;
            await this._setStep("apply", applyingMessage);
            await this.render();
          }
        }
      });
      actor = result.actor;
      const { skillReport } = result;
      verifyCreatedActor(actor, this.#manifest, result.expectedItems);
      // Commit all creation state before any presentation. Rendering and
      // notifications are intentionally unable to roll back valid work.
      const grounding = GeneratorApp.#completionContext(this.#manifest);
      this.#pcConcept = null;
      this.#pcResolved = null;
      this.#resetPCEdit();
      this.#characterReview = null;
      this.#manifest = null;
      this.#created = { name: actor.name, actorId: actor.id, count: 1, grounding };
      created = true;
      committed = true;
      try {
        let review;
        try {
          review = reviewUnresolvedChoices(actor.items.contents);
        } catch {
          review = { choices: [], incomplete: true };
        }
        if (skillReport || review.choices.length || review.incomplete) {
          this.#characterReview = { ...review, actorId: actor.id, actorName: actor.name,
            skills: GeneratorApp.#skillReportContext(skillReport) };
        }
        if (review.choices.length || review.incomplete || skillReport?.warnings.length || skillReport?.loadoutWarnings?.length) {
          ui.notifications.warn(game.i18n.format("SIMPLYPF2E.Generator.ReviewCreated", { name: actor.name }));
        } else {
          ui.notifications.info(game.i18n.format("SIMPLYPF2E.Generator.Created", { name: actor.name }));
        }
        await actor.sheet.render(true);
      } catch (err) {
        outcome = "warning";
        console.warn(`${MODULE_ID} | character created, but presentation failed`, err);
        ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Generator.CreatedPresentationFailed"));
      }
    } catch (err) {
      outcome = err?.cancelled ? "cancelled" : "error";
      let survivor = null;
      if (actor && !committed) {
        survivor = await rollbackActor(actor, "unverified character");
      } else if (err?.simplyPF2eRollbackActor) {
        const stranded = err.simplyPF2eRollbackActor;
        survivor = `incomplete character "${stranded.name}" still exists. The draft was discarded to prevent a duplicate; remove it manually before trying again.`;
      }
      if (survivor) {
        this.#pcConcept = null;
        this.#pcResolved = null;
        this.#resetPCEdit();
        this.#characterReview = null;
        this.#manifest = null;
      }
      if (!committed) {
        console.error(`${MODULE_ID} | character actor creation failed`, err);
        this.#error = survivor ? `${err.message} ${survivor}` : err.message;
      } else {
        outcome = "warning";
        this.#error = null;
        console.warn(`${MODULE_ID} | character committed, but completion presentation failed`, err);
      }
    } finally {
      this.#busyMessage = null;
      if (!reuseRun) {
        this.#busy = false;
        this._finishRun(outcome, runId);
        try {
          await this.render();
        } catch (err) {
          if (!created) throw err;
          outcome = "warning";
          console.warn(`${MODULE_ID} | character created, but review rendering failed`, err);
          ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Generator.CreatedPresentationFailed"));
        }
      }
    }
    return outcome;
  }

  static async #onDismissCharacterReview() {
    this.#characterReview = null;
    await this.render();
  }

  static async #onOpenReviewedCharacter() {
    const actor = game.actors.get(this.#characterReview?.actorId);
    if (!actor) {
      ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Generator.ReviewUnavailable"));
      return;
    }
    await actor.sheet.render(true);
  }

  static async #onOpenCreatedActor() {
    const actor = game.actors.get(this.#created?.actorId);
    if (!actor) {
      ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Generator.ReviewUnavailable"));
      return;
    }
    await actor.sheet.render(true);
  }

  static async #onGenerateAnother() {
    this.#created = null;
    this.#characterReview = null;
    await this.render();
  }

  /** Create every encounter member, each with closest-match bestiary art. */
  async #createEncounterActors({ reuseRunId = null } = {}) {
    if (!this.#encounter) return "error";
    const reuseRun = reuseRunId === this._runId && this._runActive;
    if (this.#busy && !reuseRun) return "error";
    const applyLabel = game.i18n.localize("SIMPLYPF2E.Progress.Apply");
    if (!reuseRun) {
      this.#busy = true;
      this.#error = null;
      this._beginProgress([["apply", applyLabel, 2400]], { cancellable: false });
    }
    const runId = this._runId;
    let folder = null;
    const actors = [];
    let committed = false;
    let outcome = "success";
    try {
      await this._setStep("apply");
      this._lockCreation();
      folder = await Folder.create({ name: this.#encounter.name, type: "Actor" });
      let created = 0;
      for (const member of this.#encounter.members) {
        if (member.count < 1) continue;
        // Identical minions share one art lookup — same creature, same portrait.
        const scaffold = await findBestiaryScaffold(member.concept);
        if (!scaffold) throw new Error(game.i18n.localize("SIMPLYPF2E.Errors.NoBestiaryScaffold"));
        const img = scaffold.img ?? null;
        for (let i = 0; i < member.count; i++) {
          const createdActor = await createActor(member.concept, member.resolved, { img, scaffold });
          const actor = createdActor.actor;
          actors.push(actor);
          const update = { folder: folder.id };
          if (member.count > 1) update.name = `${actor.name} ${i + 1}`;
          await actor.update(update);
          verifyCreatedActor(actor, member.manifest, createdActor.expectedItems);
          created++;
        }
      }
      // Commit before presentation: all writes succeeded, so this plan cannot
      // safely be retried even if the next render fails.
      const grounding = GeneratorApp.#completionContext(this.#encounter.members.flatMap((member) =>
        Array.from({ length: member.count }, () => member.manifest)
      ));
      this.#encounter = null;
      this.#created = { name: folder.name, actorId: actors[0]?.id ?? null, count: created, grounding };
      committed = true;
      try {
        ui.notifications.info(game.i18n.format("SIMPLYPF2E.Generator.CreatedAll", {
          count: created, name: folder.name
        }));
      } catch (err) {
        outcome = "warning";
        console.warn(`${MODULE_ID} | encounter created, but completion presentation failed`, err);
        try { ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Generator.CreatedPresentationFailed")); }
        catch (notificationErr) { console.warn(`${MODULE_ID} | could not show creation presentation warning`, notificationErr); }
      }
    } catch (err) {
      if (committed) {
        outcome = "warning";
        console.warn(`${MODULE_ID} | encounter committed, but completion presentation failed`, err);
      } else {
        outcome = err?.cancelled ? "cancelled" : "error";
        console.error(`${MODULE_ID} | encounter creation failed`, err);
        // An encounter is all-or-nothing. Best-effort cleanup preserves the
        // original error while ensuring a retry cannot duplicate a partial roster.
        const survivors = [];
        const stranded = err?.simplyPF2eRollbackActor ?? null;
        if (stranded) {
          survivors.push(`incomplete actor "${stranded.name}" still exists. The draft was discarded to prevent a duplicate; remove it manually before trying again.`);
        }
        for (const actor of actors.reverse()) {
          // The package builder already attempted this actor's deletion and
          // identified it on the error. It never reaches the actors list in
          // the normal path, but identity checking keeps this catch robust.
          if (stranded && (actor === stranded || (actor.id && actor.id === stranded.id))) continue;
          const survivor = await rollbackActor(actor, "encounter actor");
          if (survivor) survivors.push(survivor);
        }
        if (folder) {
          try { await folder.delete(); } catch (cleanupErr) {
            console.warn(`${MODULE_ID} | failed to roll back encounter folder "${folder.name}"`, cleanupErr);
            survivors.push(`encounter folder "${folder.name}" still exists`);
          }
        }
        if (survivors.length) {
          this.#encounter = null;
          this.#manifest = null;
          this.#error = `${err.message} ${survivors.join(" ")} The plan was discarded to prevent a duplicate.`;
        } else this.#error = err.message;
      }
    } finally {
      if (!reuseRun) {
        this.#busy = false;
        this._finishRun(outcome, runId);
        await this.render();
      }
    }
    return outcome;
  }

  static async #onRerollLoot() {
    if (this.#busy || !this.#concept) return;
    if (this.#experimentalDraft) {
      try {
        assertExperimentalToolAccess();
      } catch (err) {
        ui.notifications.warn(err.message);
        return;
      }
    }
    if (this.element?.querySelector) this.#readForm();
    const planMode = this.#manifest?.mode ?? this.#input.mode;
    if (this.#input.includeLoot === false && ["monster", "npc", "encounter"].includes(planMode)) {
      // Reroll must not ask the provider or coin-pad a category disabled by
      // the module-owned controls; preserve only categories still enabled.
      this.#concept = this.#enforceCreatureCategoryOptions(this.#concept, planMode);
      this.#resolved = {
        ...this.#resolved,
        equipment: this.#input.includeEquipment ? this.#resolved?.equipment ?? [] : [],
        loot: []
      };
      this.#manifest = completionManifest({ mode: planMode,
        concept: this.#concept, resolved: this.#resolved });
      this.#error = null;
      await this.render();
      return;
    }
    this.#busy = true;
    this.#error = null;
    const signal = this._beginProgress([["loot", game.i18n.localize("SIMPLYPF2E.Progress.LootReroll")]]);
    const runId = this._runId;
    let outcome = "success";
    try {
      await this._setStep("loot");
      const { loot, usage } = await generateLoot({
        concept: this.#concept,
        amount: this.#input.treasureAmount,
        onProgress: this._progressCallback(), signal
      });
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.LootReroll"), usage);
      // Keep the accepted preview usable if this replacement fails or is
      // cancelled. A shallow stage also preserves issued-reference identity.
      const concept = { ...this.#concept, loot: normalizeLoot(loot) };
      // Ground the fresh draft too — same Remaster-name protection as the
      // main pipeline (a reroll is a new ungrounded draft).
      await this.#refineLoot(concept, signal);
      const resolved = { ...this.#resolved, loot: await applyTreasureBudget(
        await resolveLoot(concept, { exactContent: true }),
        concept.loot.length ? treasureBudget(concept.level, concept.rarity, this.#input.treasureAmount) : 0
      ) };
      const manifest = completionManifest({ mode: this.#manifest?.mode ?? "monster", concept, resolved });
      this._throwIfCancelled();
      assertComplete(manifest);
      this.#concept = concept;
      this.#resolved = resolved;
      this.#manifest = manifest;
    } catch (err) {
      this._recordTokens(
        this._progress?.steps.find((step) => step.state === "active")?.label
          ?? game.i18n.localize("SIMPLYPF2E.Progress.LootReroll"), err?.usage
      );
      this.#noteGenerationFailure(err, "loot reroll");
      outcome = err?.cancelled ? "cancelled" : "error";
    } finally {
      this.#busy = false;
      this._finishRun(outcome, runId);
      await this.render();
    }
  }

  /** Leave Hazard mode: drop the draft and restore the Monster view with its own brief. */
  #leaveHazard() {
    this.#hazard = null;
    if (this.#input.mode !== "hazard") return;
    this.#input.mode = "monster";
    this.#input.prompt = this.#modePrompts.monster ?? "";
  }

  /**
   * True when the experimental gate is closed. The GM is told why, the hazard
   * draft is dropped and the Monster view returns, so a closed gate leaves
   * nothing hazard-related behind.
   */
  #refusedHazardNow() {
    let refusal;
    try { refusal = experimentalToolRefusal(); } catch { refusal = undefined; }
    if (refusal === null) return false;
    ui.notifications.warn(game.i18n.localize(refusal?.localizeKey ?? "SIMPLYPF2E.Experimental.Disabled"));
    this.#leaveHazard();
    return true;
  }

  /** True while the reviewed hazard still matches the level and brief currently in the form. */
  #hazardMatchesForm(hazard) {
    return hazard.level === this.#input.level && hazard.brief === String(this.#input.prompt).trim();
  }

  /** A changed level or brief spends the reviewed hazard: it must be generated again. */
  async #dropStaleHazard() {
    if (!this.#hazard || this.#busy) return;
    this.#readForm();
    if (this.#hazardMatchesForm(this.#hazard)) return;
    this.#hazard = null;
    await this.render();
  }

  #noteHazardFailure(err) {
    if (err?.cancelled) {
      console.warn(MODULE_ID + " | hazard generation cancelled");
      this.#error = null;
      return;
    }
    console.error(MODULE_ID + " | hazard generation failed", err);
    this.#error = hazardErrorText(err);
  }

  /**
   * Hazard mode: one provider call for the concept, then local normalization
   * and the table-built preview. Nothing is written to the world. The gate is
   * checked at entry and again before the preview is kept, because the GM can
   * switch the setting off while the provider call is waiting.
   */
  async #runHazardGeneration(isRandom) {
    const brief = this.#input.prompt.trim();
    const catalogs = hazardCatalogs();
    let stopped = isRandom;
    // There is no random hazard brief, so the dice button has nothing to roll.
    if (!stopped && !brief) {
      ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Hazard.NoBrief"));
      stopped = true;
    }
    if (!stopped && !catalogs) {
      this.#error = game.i18n.localize("SIMPLYPF2E.Hazard.Errors.Catalog");
      stopped = true;
    }
    if (stopped) {
      this.#busy = false;
      await this.render();
      return;
    }
    const level = this.#input.level;
    this.#resetGenerationState();
    const conceptLabel = game.i18n.localize("SIMPLYPF2E.Hazard.Progress.Concept");
    const signal = this._beginProgress([
      ["concept", conceptLabel, taskMaxTokens(AI_TASK.HAZARD_CONCEPT)],
      ["match", game.i18n.localize("SIMPLYPF2E.Hazard.Progress.Tables"), 400]
    ]);
    const runId = this._runId;
    let outcome = "success";
    try {
      await this._setStep("concept");
      const { concept: raw, usage } = await generateHazardConcept(brief, {
        level, ...catalogs, disableSkills: HAZARD_DISABLE_SKILLS, signal, onProgress: this._progressCallback(conceptLabel)
      });
      this._recordTokens(conceptLabel, usage);
      this._throwIfCancelled();
      await this._setStep("match");
      const concept = normalizeHazardConcept(raw, { level, ...catalogs });
      const preview = await describeHazard(concept, level);
      this._throwIfCancelled();
      assertExperimentalToolAccess();
      this.#hazard = issueHazard({ concept, level, brief, preview });
    } catch (err) {
      this._recordTokens(
        this._progress?.steps.find((step) => step.state === "active")?.label ?? conceptLabel, err?.usage
      );
      this.#hazard = null;
      this.#noteHazardFailure(err);
      outcome = err?.cancelled ? "cancelled" : "error";
    } finally {
      this.#busy = false;
      this._finishRun(outcome, runId);
      await this.render();
    }
  }

  /**
   * Create the reviewed hazard. Only a preview this module issued, for the
   * level and brief still in the form, can be created, and only while the
   * experimental gate is open: it is checked on entry and once more right
   * before the native write. The source is built from the reviewed concept and
   * checked with the same post-create survival check the NPC path uses.
   */
  async #createHazardActor() {
    const hazard = this.#hazard;
    if (!hazard || this.#busy) return "error";
    if (this.#refusedHazardNow()) {
      await this.render();
      return "error";
    }
    this.#readForm();
    if (!issuedHazards.has(hazard) || !this.#hazardMatchesForm(hazard)) {
      this.#hazard = null;
      ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Hazard.PreviewChanged"));
      await this.render();
      return "error";
    }
    this.#busy = true;
    this.#error = null;
    this._beginProgress([["apply", game.i18n.localize("SIMPLYPF2E.Progress.Apply"), 2400]], { cancellable: false });
    const runId = this._runId;
    let actor = null;
    let committed = false;
    let outcome = "success";
    try {
      await this._setStep("apply");
      const source = await buildHazardSource(hazard.concept, { level: hazard.level });
      const expectedItems = await persistedExpectedItems(source.items);
      assertExperimentalToolAccess();
      this._lockCreation();
      actor = await Actor.create({ ...source.actor, items: source.items });
      verifyCreatedActor(actor, HAZARD_MANIFEST, expectedItems);
      this.#hazard = null;
      this.#created = { name: actor.name, actorId: actor.id, count: 1, grounding: { total: 0, rows: [] } };
      committed = true;
      try {
        ui.notifications.info(game.i18n.format("SIMPLYPF2E.Generator.Created", { name: esc(actor.name) }));
        await actor.sheet.render(true);
      } catch (err) {
        outcome = "warning";
        console.warn(MODULE_ID + " | hazard created, but its sheet could not be displayed", err);
        try { ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Generator.CreatedPresentationFailed")); }
        catch (notificationErr) { console.warn(MODULE_ID + " | could not show creation presentation warning", notificationErr); }
      }
    } catch (err) {
      outcome = err?.cancelled ? "cancelled" : "error";
      if (!committed) {
        const survivor = await rollbackActor(actor, "unverified hazard");
        // A survivor means the retry would duplicate it: the draft is discarded.
        if (survivor) this.#hazard = null;
        console.error(MODULE_ID + " | hazard creation failed", err);
        this.#error = survivor ? err.message + " " + survivor : hazardErrorText(err);
      } else {
        outcome = "warning";
        console.warn(MODULE_ID + " | hazard committed, but completion presentation failed", err);
      }
    } finally {
      this.#busy = false;
      this._finishRun(outcome, runId);
      await this.render();
    }
    return outcome;
  }

  /**
   * The reviewed hazard as display rows. Every number comes from describeHazard
   * (the GM Core tables); the AI contributes words only. The template escapes
   * each value, so nothing here is raw HTML.
   */
  #buildHazardPreviewContext() {
    const hazard = this.#hazard;
    if (!hazard) return null;
    const { concept, preview } = hazard;
    const i18n = game.i18n;
    const config = globalThis.CONFIG?.PF2E;
    const named = (entry, slug) => i18n.localize(typeof entry === "string" ? entry : entry?.label ?? slug);
    const rankName = (rank) => (HAZARD_RANK_KEYS[rank] ? i18n.localize(HAZARD_RANK_KEYS[rank]) : String(rank));
    const dcLine = ({ dc, rank }) => i18n.format("SIMPLYPF2E.Hazard.Preview.DCLine", { dc, rank: rankName(rank) });
    const signed = (value) => (value >= 0 ? "+" + value : String(value));
    const strike = preview.strike;
    const save = concept.reaction.save;
    return {
      name: preview.name,
      level: preview.level,
      complexity: preview.complex ? HAZARD_LABEL_KEYS.complexityComplex : HAZARD_LABEL_KEYS.complexitySimple,
      rarity: HAZARD_RARITY_KEYS[preview.rarity] ?? HAZARD_RARITY_KEYS.common,
      traits: preview.traits.map((slug) => named(config?.hazardTraits?.[slug], slug)),
      description: concept.description,
      stealth: preview.stealth ? dcLine(preview.stealth) : null,
      disable: preview.disable.map((entry) => ({
        skill: named(config?.skills?.[entry.skill], entry.skill), text: dcLine(entry)
      })),
      dispel: preview.dispel ? i18n.format("SIMPLYPF2E.Hazard.Preview.DispelLine", preview.dispel) : null,
      ac: preview.ac.value,
      acAssumed: preview.ac.assumed === true,
      saves: Object.entries(HAZARD_SAVE_KEYS).filter(([type]) => preview.saves[type] !== null)
        .map(([type, key]) => ({ label: i18n.localize(key), value: signed(preview.saves[type]) })),
      hp: preview.hp,
      hardness: preview.hardness,
      strike: strike ? {
        name: strike.name, bonus: signed(strike.bonus), formula: strike.formula, average: strike.average,
        damageType: named(config?.damageTypes?.[strike.damageType], strike.damageType)
      } : null,
      reaction: {
        name: preview.reactionName, trigger: concept.reaction.trigger, effect: concept.reaction.effect,
        save: save ? {
          text: i18n.format("SIMPLYPF2E.Hazard.Preview.SaveLine", {
            save: i18n.localize(HAZARD_SAVE_KEYS[save.type]), dc: hazardSaveDC(hazard.level, save.scale)
          }),
          effect: save.effect
        } : null
      },
      routine: preview.routineActions === null ? null : {
        actions: i18n.format("SIMPLYPF2E.Hazard.Preview.RoutineActions", { count: preview.routineActions }),
        text: concept.routine.text
      },
      reset: concept.reset,
      xp: preview.xp
    };
  }

  static async #onDiscard() {
    if (this.#busy) return;
    this.#readForm();
    this.#concept = null;
    this.#resolved = null;
    this.#encounter = null;
    this.#pcConcept = null;
    this.#pcResolved = null;
    this.#hazard = null;
    this.#resetPCEdit();
    this.#manifest = null;
    this.#error = null;
    this._tokenUsage = [];
    await this.render();
  }

  /** Open the Manage Custom Presets dialog (edit/duplicate/delete/export/import). */
  static #onManagePresets() {
    this.#readForm();
    this.#managePresets ??= new ManagePresetsApp({ generator: this });
    this.#managePresets.render(true);
  }

  /** Singleton Manage Presets dialog for this generator window. */
  #managePresets = null;
}
