import {
  MODULE_ID, SETTINGS, getProviderAuthWarningKey, getProviderRequestConfig,
  authorizeApiKeyForCurrentBaseUrl
} from "./settings.mjs";
import {
  generateConcept, generateLoot, selectSpells, chooseSpellFocus, selectEquipment, selectLoot, designEncounter,
  generatePCConcept, generatePCLoot, selectAncestryBackgroundClass, selectFeats, selectCreatureFeats, selectCreatureAbilities, selectCharacterChoices
} from "./ai.mjs";
import { AI_TASK, taskMaxTokens } from "./ai-task-profiles.mjs";
import {
  getSpellCandidates, getEquipmentCandidates, getLootCandidates, getScrollSpellCandidates,
  getAncestryCandidates, getBackgroundCandidates, getClassCandidates, getHeritageCandidates, getFocusSpellCandidates, getFeatCandidates, getCreatureFeatCandidates, normalizeCreatureFeatName, getAbilityCandidates, sourceReadiness
} from "./compendium.mjs";
import {
  normalizeConcept, normalizeLoot, resolveConcept, resolveLoot, computeStats, createActor,
  applyTreasureBudget, equipmentValueGp, lootValueGp, parseCoins, parseScroll, slugify,
  dedupeLootAgainstEquipment, enforceNamedLootBudget
} from "./builder.mjs";
import {
  normalizePCConcept, resolvePCConcept, resolveFeatPicks, createCharacterActor, pcStartingWealthGp
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
import { verifyCreatedActor } from "./post-create.mjs";
import { freeArchetypeNeedsPrerequisiteValidation, supportedClassCandidates } from "./pc-support.mjs";
import { SpfApp } from "./app-base.mjs";
import { filterNpcAbilityCandidates, resolveNpcAbilityPackages } from "./npc-ability-packages.mjs";

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
    preset: "", partySize: 4, threat: "moderate", treasureAmount: "standard", rarityCap: "unique"
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
  /** Snapshot for the last created PC; UI-only, never written to actor flags. */
  #characterReview = null;
  /** Successful one-click result; UI-only and never persisted. */
  #created = null;
  /** Validated plan manifest retained only until it is presented after creation. */
  #manifest = null;
  /** Cycles the example placeholder; starts randomly so reopening varies. */
  #exampleTick = Math.floor(Math.random() * 5);

  async _prepareContext() {
    const authState = getProviderRequestConfig();
    const authWarningKey = getProviderAuthWarningKey(authState);
    const sources = globalThis.game?.packs ? sourceReadiness(this.#input.mode, {
      allowSpellcasting: this.#input.allowSpellcasting
    }) : null;
    const presetGroups = presetPickerGroups(this.#input.preset, getCustomPresets());
    this.#input.preset = presetGroups.selectedId;
    return {
      input: this.#input,
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
      randomTooltipKey: {
        monster: "SIMPLYPF2E.Generator.RandomTooltip",
        npc: "SIMPLYPF2E.Generator.RandomNpcTooltip",
        encounter: "SIMPLYPF2E.Generator.RandomEncounterTooltip",
        character: "SIMPLYPF2E.Generator.RandomCharacterTooltip"
      }[this.#input.mode] ?? "SIMPLYPF2E.Generator.RandomTooltip",
      levelMin: ["monster", "npc"].includes(this.#input.mode) ? -1 : 1,
      levelMax: ["monster", "npc"].includes(this.#input.mode) ? 24 : 20,
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
      characterReview: this.#characterReview,
      created: this.#created,
      hasPreview: Boolean(this.#concept || this.#encounter || this.#pcConcept),
      tokenReport: this._buildTokenReport(),
      // Presentation only: show the getting-started panel when the active
      // mode has no result (busy/error states render their own blocks).
      showEmptyState: !this.#busy && !this.#error && !this.#characterReview && !this.#created
        && !(["monster", "npc"].includes(this.#input.mode) && this.#concept)
        && !(this.#input.mode === "encounter" && this.#encounter)
        && !(this.#input.mode === "character" && this.#pcConcept)
    };
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
    const [levelMin, levelMax] = ["monster", "npc"].includes(mode) ? [-1, 24] : [1, 20];
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
    this.#input = { mode, prompt, level, rarity, allowSpellcasting, includeEquipment, includeLoot,
      preset, partySize, threat, treasureAmount, rarityCap };
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
    const [min, max] = ["monster", "npc"].includes(this.#input.mode) ? [-1, 24] : [1, 20];
    input.value = Math.min(max, Math.max(min, (Number.isNaN(current) ? 1 : current) + delta));
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

  async #assertGenerationReady() {
    const warning = getProviderAuthWarningKey(getProviderRequestConfig());
    if (warning) {
      ui.notifications.warn(game.i18n.localize(warning));
      return false;
    }
    // This runs before the first concept request: a Free Archetype slot starts
    // at level 2, but PF2e's published feat prerequisites are display text,
    // not a generic staged-actor eligibility API. Do not bill for a plan we
    // cannot validate as a complete unattended character.
    const freeArchetype = globalThis.game?.settings?.get?.(MODULE_ID, SETTINGS.freeArchetype) === true;
    if (this.#input.mode === "character" && freeArchetypeNeedsPrerequisiteValidation(this.#input.level, freeArchetype)) {
      ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Generator.FreeArchetypeUnsupported"));
      return false;
    }
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

  async #runGeneration(isRandom, { create = false } = {}) {
    if (this.#busy) return;
    // Reserve synchronously before async readiness/catalog work so a second
    // click cannot start a competing run while the first awaits I/O.
    this.#busy = true;
    try {
      this.#readForm();
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
    if (!isRandom && !this.#input.prompt.trim()) {
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
      const gmPrompt = isRandom ? randomBrief(this.#input.mode) : this.#input.prompt;
      const { concept: raw, usage } = await generateConcept({
        // Random mode rolls a fresh local brief each generation, so
        // Regenerate gives a genuinely different creature every time.
        prompt: gmPrompt,
        level: this.#input.level,
        rarity: this.#input.rarity,
        allowSpellcasting: this.#input.allowSpellcasting,
        includeEquipment: this.#input.includeEquipment,
        includeLoot: this.#input.includeLoot,
        preset: isRandom ? null : findPreset(this.#input.preset)?.prompt ?? null,
        amount: this.#input.treasureAmount,
        intent: this.#input.mode,
        onProgress: this._progressCallback(), signal
      });
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Concept"), usage);
      this.#concept = this.#enforceCreatureCategoryOptions(
        { ...normalizeConcept(raw, { level: this.#input.level, rarity: this.#input.rarity }), gmPrompt }
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
    await this._setStep("concept");
      const { concept: raw, usage } = await generatePCConcept({
        prompt: isRandom ? randomBrief(this.#input.mode) : this.#input.prompt,
        level: this.#input.level,
        allowSpellcasting: this.#input.allowSpellcasting,
        // Stable preset slot, PC flavor: the guidance steers class/style
        // choice only (generatePCConcept tells the model to ignore any
        // numeric scale wording — a PC's numbers come from the system).
        preset: isRandom ? null : findPreset(this.#input.preset)?.prompt ?? null,
        onProgress: this._progressCallback(), signal
      });
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.PCConcept"), usage);
      const concept = normalizePCConcept(raw, { level: this.#input.level });

      await this._setStep("abc");
      // Rarity cap: excludes ancestries/backgrounds/heritages rarer than the
      // GM's chosen max from the candidate lists the AI even sees, so e.g.
      // capping at Uncommon means a Rare pick like Fetchling can never be
      // offered — not just discouraged by prompt wording.
      const { rarityCap } = this.#input;
      const [ancestryCandidates, backgroundCandidates, allClassCandidates, heritageCandidates] = await Promise.all([
        getAncestryCandidates(rarityCap), getBackgroundCandidates(rarityCap), getClassCandidates(), getHeritageCandidates(rarityCap)
      ]);
      const classCandidates = supportedClassCandidates(allClassCandidates);
      if (!classCandidates.length) throw new Error(game.i18n.localize("SIMPLYPF2E.Generator.NoSupportedClasses"));
      const abc = await selectAncestryBackgroundClass({
        concept, ancestryCandidates, backgroundCandidates, classCandidates, heritageCandidates,
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
        resolved.feats = await resolveFeatPicks(resolved.featSlots, picks, { exactContent: true });
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
      const manifest = completionManifest({ mode: "character", concept, resolved });
      this._throwIfCancelled();
      assertComplete(manifest);
      this.#manifest = manifest;

      this.#pcConcept = concept;
      this.#pcResolved = resolved;
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

  static async #onDiscard() {
    if (this.#busy) return;
    this.#readForm();
    this.#concept = null;
    this.#resolved = null;
    this.#encounter = null;
    this.#pcConcept = null;
    this.#pcResolved = null;
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
