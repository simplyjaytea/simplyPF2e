import {
  MODULE_ID, getProviderAuthWarningKey, getProviderRequestConfig,
  authorizeApiKeyForCurrentBaseUrl
} from "./settings.mjs";
import {
  generateConcept, generateLoot, selectSpells, chooseSpellFocus, selectEquipment, selectLoot, designEncounter,
  generatePCConcept, generatePCLoot, selectAncestryBackgroundClass, selectFeats, selectCharacterChoices
} from "./ai.mjs";
import {
  getSpellCandidates, getEquipmentCandidates, getLootCandidates,
  getAncestryCandidates, getBackgroundCandidates, getClassCandidates, getHeritageCandidates, sourceReadiness
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
import {
  BUILT_IN_PRESETS, getCustomPresets, findPreset, addCustomPreset, updateCustomPreset,
  examplePrompt, randomBrief
} from "./presets.mjs";
import { ManagePresetsApp, promptPresetDialog, confirmDeletePreset } from "./manage-presets-app.mjs";
import { SourcesConfigApp } from "./sources-app.mjs";
import { composeEncounter, THREATS } from "./encounter.mjs";
import { findBestiaryArt } from "./art.mjs";
import { assertComplete, completionManifest } from "./completion.mjs";
import { SpfApp } from "./app-base.mjs";

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
      generateRandomEncounter: GeneratorApp.#onGenerateRandomEncounter,
      createActor: GeneratorApp.#onCreateActor,
      discard: GeneratorApp.#onDiscard,
      dismissCharacterReview: GeneratorApp.#onDismissCharacterReview,
      openReviewedCharacter: GeneratorApp.#onOpenReviewedCharacter,
      openCreatedActor: GeneratorApp.#onOpenCreatedActor,
      generateAnother: GeneratorApp.#onGenerateAnother,
      savePreset: GeneratorApp.#onSavePreset,
      duplicatePreset: GeneratorApp.#onDuplicatePreset,
      deletePreset: GeneratorApp.#onDeletePreset,
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
      testProvider: GeneratorApp.#onTestProvider
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/generator.hbs` }
  };

  /** Form values, kept across re-renders. */
  #input = {
    mode: "monster", prompt: "", level: 1, rarity: "common",
    allowSpellcasting: true, preset: "", partySize: 4, threat: "moderate",
    treasureAmount: "standard", rarityCap: "unique"
  };
  #modePrompts = { monster: "", npc: "", encounter: "", character: "" };
  #busy = false;
  #busyMessage = null;
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
  /** Cycles the example placeholder; starts randomly so reopening varies. */
  #exampleTick = Math.floor(Math.random() * 5);

  async _prepareContext() {
    const authState = getProviderRequestConfig();
    const authWarningKey = getProviderAuthWarningKey(authState);
    const sources = globalThis.game?.packs ? sourceReadiness(this.#input.mode, {
      allowSpellcasting: this.#input.allowSpellcasting
    }) : null;
    return {
      input: this.#input,
      busy: this.#busy,
      busyMessage: this.#busyMessage,
      error: this.#error,
      progress: this._progress,
      apiKeyWarning: authWarningKey ? game.i18n.localize(authWarningKey) : null,
      providerBaseUrl: authState.baseUrl,
      provider: authState.provider,
      providerReady: !authWarningKey,
      sourcesReady: sources?.ready ?? true,
      sourcePackCount: sources?.packCount ?? 0,
      sourceMissing: sources?.missing ?? [],
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
      presets: [
        { id: "", label: game.i18n.localize("SIMPLYPF2E.Presets.None"), selected: !this.#input.preset },
        ...BUILT_IN_PRESETS.map((p) => ({
          id: p.id,
          label: game.i18n.localize(p.name),
          selected: this.#input.preset === p.id
        })),
        ...getCustomPresets().map((p) => ({
          id: p.id,
          label: `${p.name} *`,
          selected: this.#input.preset === p.id
        }))
      ],
      selectedPresetIsCustom: Boolean(findPreset(this.#input.preset)?.custom),
      presetSelected: Boolean(findPreset(this.#input.preset)),
      encounterMode: this.#input.mode === "encounter",
      characterMode: this.#input.mode === "character",
      monsterMode: this.#input.mode === "monster",
      npcMode: this.#input.mode === "npc",
      creatureMode: ["monster", "npc"].includes(this.#input.mode),
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
      }))
    };
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
      name: (scroll && entry
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
        abilities.map((a) => ({ found: a.fromGlossary })), spells, feats, equipment, loot
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
    const items = groups.flat().filter(Boolean);
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
    const level = Math.min(levelMax, Math.max(levelMin, Number.isNaN(rawLevel) ? 1 : rawLevel));
    const rarity = form.querySelector('[name="rarity"]')?.value ?? this.#input.rarity;
    const allowSpellcasting = form.querySelector('[name="allowSpellcasting"]')?.checked ?? true;
    const preset = form.querySelector('[name="preset"]')?.value ?? this.#input.preset;
    // partySize is only rendered in Encounter mode ({{#if encounterMode}} in
    // generator.hbs) — outside that mode the selector is null, so fall back
    // to the prior #input value like every other optional field here, not a
    // literal default that would silently discard the GM's saved party size.
    const partySizeEl = form.querySelector('[name="partySize"]');
    const rawPartySize = partySizeEl ? Number(partySizeEl.value) : NaN;
    const partySize = partySizeEl
      ? Math.min(8, Math.max(1, Number.isNaN(rawPartySize) ? this.#input.partySize : rawPartySize))
      : this.#input.partySize;
    const threat = form.querySelector('[name="threat"]')?.value ?? this.#input.threat;
    const treasureAmount = form.querySelector('[name="treasureAmount"]')?.value ?? this.#input.treasureAmount;
    const rarityCap = form.querySelector('[name="rarityCap"]')?.value ?? this.#input.rarityCap;
    this.#input = { mode, prompt, level, rarity, allowSpellcasting, preset, partySize, threat, treasureAmount, rarityCap };
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
      radio.addEventListener("change", () => {
        this.#readForm();
        this.render();
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
    new SourcesConfigApp().render(true);
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

  static async #onGenerate() {
    return this.#runGeneration(false, { create: true });
  }

  /** Generate and validate without writing to the world. */
  static async #onPreviewPlan() {
    return this.#runGeneration(false, { create: false });
  }

  /** The dice button: same pipeline, module-rolled surprise brief as prompt. */
  static async #onGenerateRandom() {
    return this.#runGeneration(true, { create: false });
  }

  /** The encounter mode dice button: forces a fresh random theme even if the
   * GM already typed one, matching #onGenerateRandom's Single-mode behavior. */
  static async #onGenerateRandomEncounter() {
    this.#readForm();
    if (!this.#assertGenerationReady()) return;
    return this.#generateEncounter(true);
  }

  #assertGenerationReady() {
    const warning = getProviderAuthWarningKey(getProviderRequestConfig());
    if (warning) {
      ui.notifications.warn(game.i18n.localize(warning));
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
    return true;
  }

  async #runGeneration(isRandom, { create = false } = {}) {
    this.#readForm();
    if (!this.#assertGenerationReady()) return;
    if (this.#input.mode === "character") {
      await this.#generatePC(isRandom);
      if (create && this.#pcConcept && !this.#error) await this.#createCharacterActor();
      return;
    }
    if (this.#input.mode === "encounter") {
      await this.#generateEncounter(isRandom);
      if (create && this.#encounter && !this.#error) await this.#createEncounterActors();
      return;
    }
    if (!isRandom && !this.#input.prompt.trim()) {
      ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Errors.NoPrompt"));
      return;
    }
    this.#busy = true;
    this.#error = null;
    this.#encounter = null;
    this.#pcConcept = null;
    this.#pcResolved = null;
    this._tokenUsage = [];
    this._beginProgress([
      ["concept", game.i18n.localize("SIMPLYPF2E.Progress.Concept")],
      ...(this.#input.allowSpellcasting ? [["spells", game.i18n.localize("SIMPLYPF2E.Progress.Spells")]] : []),
      ["equipment", game.i18n.localize("SIMPLYPF2E.Progress.Equipment")],
      ["loot", game.i18n.localize("SIMPLYPF2E.Progress.Loot")],
      ["match", game.i18n.localize("SIMPLYPF2E.Progress.Match")]
    ]);
    try {
      await this._setStep("concept");
      const { concept: raw, usage } = await generateConcept({
        // Random mode rolls a fresh local brief each generation, so
        // Regenerate gives a genuinely different creature every time.
        prompt: isRandom ? randomBrief() : this.#input.prompt,
        level: this.#input.level,
        rarity: this.#input.rarity,
        allowSpellcasting: this.#input.allowSpellcasting,
        preset: isRandom ? null : findPreset(this.#input.preset)?.prompt ?? null,
        amount: this.#input.treasureAmount,
        intent: this.#input.mode,
        onProgress: (p) => this._onAIProgress(p)
      });
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Concept"), usage);
      this.#concept = normalizeConcept(raw, { level: this.#input.level, rarity: this.#input.rarity });
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
      // "spells" step key only exists in progress.steps when allowSpellcasting
      // was true. Calling _setStep with a key that isn't in that list left every
      // step "reached: false" and marked them all "done", pushing percent past
      // 100%; this used to be reachable when allowSpellcasting was false but a
      // non-compliant model returned spellcasting anyway.
      if (this.#input.allowSpellcasting && this.#concept.spellcasting) await this._setStep("spells");
      await this.#refineSpells(this.#concept);
      if (this.#concept.equipment.length) await this._setStep("equipment");
      await this.#refineEquipment(this.#concept);
      if (this.#concept.loot.length) await this._setStep("loot");
      await this.#refineLoot(this.#concept);
      await this._setStep("match");
      this.#resolved = await resolveConcept(this.#concept);
      // Treasure budget: the module owns the numbers (level + rarity from the
      // tables, scaled by the Treasure amount control); only coins flex.
      this.#resolved.loot = await applyTreasureBudget(
        this.#resolved.loot,
        treasureBudget(this.#concept.level, this.#concept.rarity, this.#input.treasureAmount)
      );
      assertComplete(completionManifest({ mode: this.#input.mode, concept: this.#concept, resolved: this.#resolved }));
      const eq = this.#resolved.equipment;
      if (eq.length) {
        const misses = eq.filter((e) => !e.entry).map((e) => e.name);
        console.log(`${MODULE_ID} | equipment matches: ${eq.length - misses.length}/${eq.length}`,
          misses.length ? { missing: misses } : "");
      }
      console.log(`${MODULE_ID} | token usage`, this._tokenUsage);
    } catch (err) {
      console.error(`${MODULE_ID} | generation failed`, err);
      this.#error = err.message;
      this.#concept = null;
      this.#resolved = null;
      this.#created = { name: actor.name, actorId: actor.id, count: 1 };
    } finally {
      this.#busy = false;
      this._progress = null;
      await this.render();
    }
    if (create && this.#concept && !this.#error) await GeneratorApp.#onCreateActor.call(this);
  }

  /**
   * Encounter mode: the module fixes the composition to the XP budget, the
   * AI names the encounter and briefs each slot, then every member runs
   * through the normal single-creature pipeline.
   */
  async #generateEncounter(isRandom = false) {
    this.#busy = true;
    this.#error = null;
    this.#concept = null;
    this.#resolved = null;
    this.#pcConcept = null;
    this.#pcResolved = null;
    this._tokenUsage = [];
    const { level: partyLevel, partySize, threat, rarity } = this.#input;
    const composition = composeEncounter(threat, partySize, partyLevel);
    const memberLabel = (i) => game.i18n.format("SIMPLYPF2E.Progress.Member", {
      index: i + 1, total: composition.members.length
    });
    this._beginProgress([
      ["design", game.i18n.localize("SIMPLYPF2E.Progress.Design")],
      ...composition.members.map((_, i) => [`member${i}`, memberLabel(i)]),
      ["match", game.i18n.localize("SIMPLYPF2E.Progress.Match")]
    ]);
    try {
      await this._setStep("design");
      // Random mode always rolls a fresh theme, even over a typed prompt —
      // same contract as the Single-mode dice button (#onGenerateRandom).
      const theme = isRandom ? randomBrief() : (this.#input.prompt.trim() || randomBrief());
      const design = await designEncounter({
        theme,
        partyLevel,
        slots: composition.members,
        onProgress: (p) => this._onAIProgress(p)
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
          // The preset row is now a stable slot in every mode: a selected
          // preset shapes each member the same way it shapes a single
          // creature (and, matching the Single dice button, Random ignores it).
          preset: isRandom ? null : findPreset(this.#input.preset)?.prompt ?? null,
          amount: this.#input.treasureAmount,
          intent: "monster",
          onProgress: (p) => this._onAIProgress(p)
        });
        this._recordTokens(memberLabel(i), usage);
        const concept = normalizeConcept(raw, { level: slot.level, rarity });
        // Same defensive filter as the single-creature pipeline: the prompt
        // asks for no spellcasting, but a non-compliant model can still
        // return a valid tradition.
        if (!this.#input.allowSpellcasting) {
          concept.spellcasting = null;
          concept.focusSpells = [];
        }
        await this.#refineSpells(concept);
        await this.#refineEquipment(concept);
        await this.#refineLoot(concept);
        members.push({ ...slot, concept });
      }

      await this._setStep("match");
      for (const member of members) {
        member.resolved = await resolveConcept(member.concept);
        // Treasure is calibrated to the PARTY level and the WHOLE encounter:
        // treasureBudget() returns one encounter's total, split evenly across
        // groups. A group keeps its constant share (treasureGroupBudget)
        // regardless of copy count — only the per-copy split changes
        // (#stepMemberCount recomputes it the same way).
        member.treasureGroupBudget =
          treasureBudget(partyLevel, member.concept.rarity, this.#input.treasureAmount) / members.length;
        member.treasureBudgetEach = member.treasureGroupBudget / Math.max(member.count, 1);
        member.resolved.loot = await applyTreasureBudget(member.resolved.loot, member.treasureBudgetEach);
        assertComplete(completionManifest({ mode: "monster", concept: member.concept, resolved: member.resolved }));
        member.treasureEach = lootValueGp(member.resolved.loot);
      }
      const allEq = members.flatMap((m) => m.resolved.equipment);
      if (allEq.length) {
        const misses = allEq.filter((e) => !e.entry).map((e) => e.name);
        console.log(`${MODULE_ID} | equipment matches: ${allEq.length - misses.length}/${allEq.length}`,
          misses.length ? { missing: misses } : "");
      }
      this.#encounter = {
        name: design.name,
        budget: composition.budget,
        spent: composition.spent,
        treasureBudget: members.reduce((sum, m) => sum + m.count * (m.treasureBudgetEach ?? 0), 0),
        treasureSpent: members.reduce((sum, m) => sum + m.count * (m.treasureEach ?? 0), 0),
        members
      };
      console.log(`${MODULE_ID} | token usage`, this._tokenUsage);
    } catch (err) {
      console.error(`${MODULE_ID} | encounter generation failed`, err);
      this.#error = err.message;
      this.#encounter = null;
    } finally {
      this.#busy = false;
      this._progress = null;
      await this.render();
    }
  }

  /**
   * Player Character mode: ground a first-draft AI concept into a real
   * ancestry/heritage/background/class, a batch of level-appropriate feats,
   * spells (if the class casts) and equipment — mirrors #runGeneration's
   * single-creature shape, with an extra "abc"/"feats" step. Unlike NPCs, no
   * stats are computed here: the PF2e system derives AC/HP/saves/
   * proficiencies/spell slots itself from the real items this assembles.
   */
  async #generatePC(isRandom) {
    if (!isRandom && !this.#input.prompt.trim()) {
      ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Errors.NoPrompt"));
      return;
    }
    this.#busy = true;
    this.#error = null;
    this.#concept = null;
    this.#resolved = null;
    this.#encounter = null;
    this.#pcConcept = null;
    this.#pcResolved = null;
    this._tokenUsage = [];
    this._beginProgress([
      ["concept", game.i18n.localize("SIMPLYPF2E.Progress.PCConcept")],
      ["abc", game.i18n.localize("SIMPLYPF2E.Progress.ABC")],
      ["feats", game.i18n.localize("SIMPLYPF2E.Progress.Feats")],
      ...(this.#input.allowSpellcasting ? [["spells", game.i18n.localize("SIMPLYPF2E.Progress.Spells")]] : []),
      ["equipment", game.i18n.localize("SIMPLYPF2E.Progress.Equipment")],
      ["loot", game.i18n.localize("SIMPLYPF2E.Progress.Loot")],
      ["match", game.i18n.localize("SIMPLYPF2E.Progress.Match")]
    ]);
    try {
      await this._setStep("concept");
      const { concept: raw, usage } = await generatePCConcept({
        prompt: isRandom ? randomBrief() : this.#input.prompt,
        level: this.#input.level,
        allowSpellcasting: this.#input.allowSpellcasting,
        // Stable preset slot, PC flavor: the guidance steers class/style
        // choice only (generatePCConcept tells the model to ignore any
        // numeric scale wording — a PC's numbers come from the system).
        preset: isRandom ? null : findPreset(this.#input.preset)?.prompt ?? null,
        onProgress: (p) => this._onAIProgress(p)
      });
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.PCConcept"), usage);
      const concept = normalizePCConcept(raw, { level: this.#input.level });

      await this._setStep("abc");
      // Rarity cap: excludes ancestries/backgrounds/heritages rarer than the
      // GM's chosen max from the candidate lists the AI even sees, so e.g.
      // capping at Uncommon means a Rare pick like Fetchling can never be
      // offered — not just discouraged by prompt wording.
      const { rarityCap } = this.#input;
      const [ancestryCandidates, backgroundCandidates, classCandidates, heritageCandidates] = await Promise.all([
        getAncestryCandidates(rarityCap), getBackgroundCandidates(rarityCap), getClassCandidates(), getHeritageCandidates(rarityCap)
      ]);
      const abc = await selectAncestryBackgroundClass({
        concept, ancestryCandidates, backgroundCandidates, classCandidates, heritageCandidates,
        onProgress: (p) => this._onAIProgress(p)
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
          concept, slots: resolved.featSlots, onProgress: (p) => this._onAIProgress(p)
        });
        this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Feats"), featUsage);
        resolved.feats = await resolveFeatPicks(resolved.featSlots, picks);
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
      // reasoning as the NPC pipeline: calling _setStep with a "spells" key
      // that isn't in progress.steps (when allowSpellcasting was false) left
      // every step "reached: false" and marked them all "done", pushing
      // percent past 100%.
      if (this.#input.allowSpellcasting && concept.spellcasting) await this._setStep("spells");
      await this.#refineSpells(concept, { requireSpells: true });

      await this._setStep("equipment");
      await this.#refineEquipment(concept);

      await this._setStep("loot");
      await this.#refinePCLoot(concept);

      await this._setStep("match");
      // #refineSpells/#refineEquipment/#refinePCLoot replaced the concept's
      // first-draft spell/equipment/loot picks with grounded ones —
      // re-resolve those parts (the ABC/grants/feat-slot lookups above are
      // cheap and index-cached, so redoing them here is harmless; keep the
      // feat picks already made).
      const final = await resolvePCConcept(concept);
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
      if (coinGp > lootBudget * 0.25) {
        try {
          const { loot: draft, usage: extraUsage } = await generatePCLoot({
            concept, amount: this.#input.treasureAmount, onProgress: (p) => this._onAIProgress(p)
          });
          this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Loot"), extraUsage);
          // Keep the already-grounded items, add the new draft, re-ground and re-budget.
          concept.loot = [...concept.loot.filter((l) => !parseCoins(l.name)), ...normalizeLoot(draft)];
          await this.#refineLoot(concept);
          const topUp = await resolvePCConcept(concept);
          resolved = { ...topUp, feats: resolved.feats };
          resolved.loot = dedupeLootAgainstEquipment(resolved.loot, resolved.equipment);
          resolved.loot = enforceNamedLootBudget(resolved.loot, lootBudget);
          resolved.loot = await applyTreasureBudget(resolved.loot, lootBudget);
        } catch (err) {
          console.warn(`${MODULE_ID} | extra PC purchase pass failed, leaving remaining wealth as coin`, err);
        }
      }
      assertComplete(completionManifest({ mode: "character", concept, resolved }));

      this.#pcConcept = concept;
      this.#pcResolved = resolved;
      console.log(`${MODULE_ID} | token usage`, this._tokenUsage);
    } catch (err) {
      console.error(`${MODULE_ID} | character generation failed`, err);
      this.#error = err.message;
      this.#pcConcept = null;
      this.#pcResolved = null;
    } finally {
      this.#busy = false;
      this._progress = null;
      await this.render();
    }
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
  async #refineSpells(concept, { requireSpells = false } = {}) {
    const spellcasting = concept?.spellcasting;
    if (!spellcasting) return;
    const draft = spellcasting.spells;
    try {
      // Both AI calls below run under the single "Spell selection" step, so
      // keep a running token total across them — otherwise the live counter
      // visibly resets to zero when the second call starts.
      let stepTokens = 0;
      let lastTokens = 0;
      const onProgress = (p) => {
        lastTokens = p.tokens;
        this._onAIProgress({ ...p, tokens: stepTokens + p.tokens });
      };
      let keywords = [];
      try {
        const focus = await chooseSpellFocus({
          concept,
          tradition: spellcasting.tradition,
          onProgress
        });
        keywords = focus.keywords;
        this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.SpellFocus"), focus.usage);
      } catch (err) {
        console.warn(`${MODULE_ID} | spell focus selection failed, using first-draft spell names only`, err);
      }
      stepTokens += lastTokens;
      const candidates = await getSpellCandidates(
        spellcasting.tradition,
        spellcasting.maxRank,
        [...spellcasting.spells.map((spell) => spell.name), ...keywords],
        spellcasting.plannedPicks
      );
      if (!candidates.length) {
        console.warn(`${MODULE_ID} | no spell candidates found, dropping spellcasting (unconstrained first-draft spells discarded)`);
        spellcasting.spells = [];
      } else {
        const { spells, usage } = await selectSpells({
          concept,
          candidates,
          maxRank: spellcasting.maxRank,
          plannedPicks: spellcasting.plannedPicks,
          preparationMode: spellcasting.preparationMode,
          signatureRanks: spellcasting.signatureRanks,
          onProgress
        });
        this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Spells"), usage);
        spellcasting.spells = spells;
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | grounded spell selection failed, dropping spellcasting (unconstrained first-draft spells discarded)`, err);
      spellcasting.spells = [];
    }
    if (spellcasting.spells.length) return;
    // A grounded daily plan must not silently become an unplanned draft.
    // Preserve the entry/empty slots for manual completion; preview warns.
    if (spellcasting.plannedPicks) return;
    // Fail-closed is right for a CREATURE — a monster is fine with one fewer
    // ability, and unvetted draft names would become nothing on the sheet
    // anyway. It is the wrong trade for a PLAYER CHARACTER: dropping
    // spellcasting there hands the GM a Wizard with no spells at all, which is
    // a broken character rather than a slightly simpler one. So a PC keeps the
    // ungrounded draft and leans on resolvePCConcept's own findEntry pass,
    // which still discards anything that doesn't match a real spell.
    if (requireSpells && draft.length) {
      console.warn(`${MODULE_ID} | grounded spell selection produced nothing for a character — keeping the ungrounded first draft, which is still compendium-matched before anything is embedded`);
      spellcasting.spells = draft;
      return;
    }
    concept.spellcasting = null;
  }

  /**
   * Grounded equipment selection: fetch real, level-capped items from the
   * equipment compendium (narrowed by keywords drawn from the first-draft
   * gear names and strikes — no separate AI focus pass needed, unlike spells)
   * and let the AI pick the creature's carried gear from that list. Falls
   * back to the first-draft names (still fuzzy-matched) if anything fails.
   * Creatures designed to carry nothing (beasts, mindless) are skipped.
   */
  async #refineEquipment(concept) {
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
      const { equipment, usage } = await selectEquipment({
        concept,
        candidates,
        onProgress: (p) => this._onAIProgress(p)
      });
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Equipment"), usage);
      if (equipment.length) concept.equipment = equipment;
    } catch (err) {
      console.warn(`${MODULE_ID} | grounded equipment selection failed, using first-draft equipment`, err);
    }
  }

  /**
   * Grounded loot selection: fetch real compendium items (treasure included)
   * and have the AI re-pick the first-draft haul from that list — the loot
   * counterpart of #refineEquipment(). Without it, a pre-Remaster name the
   * model recalls ("Bag of Holding") never fuzzy-matches its Remaster item
   * ("Spacious Pouch") and silently becomes a wrong-named custom treasure
   * item. Coins and scrolls pass through free-form (parseCoins/parseScroll
   * build them specially); a haul of ONLY coins/scrolls skips the AI call.
   * Falls back to the first-draft names (still fuzzy-matched) if anything
   * fails.
   */
  async #refineLoot(concept) {
    if (!concept?.loot?.length) return;
    if (concept.loot.every((l) => parseCoins(l.name) || parseScroll(l.name))) return;
    try {
      const draftNames = concept.loot.map((loot) => String(loot.name).toLowerCase()).filter(Boolean);
      const keywords = [...new Set([
        ...draftNames,
        ...draftNames.flatMap((name) => name.split(/[^a-z0-9]+/)).filter((token) => token.length > 2)
      ])];
      const candidates = await getLootCandidates(concept.level, keywords);
      if (!candidates.length) return;
      const { loot, usage } = await selectLoot({
        concept,
        candidates,
        onProgress: (p) => this._onAIProgress(p)
      });
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Loot"), usage);
      if (loot.length) concept.loot = normalizeLoot(loot);
    } catch (err) {
      console.warn(`${MODULE_ID} | grounded loot selection failed, using first-draft loot`, err);
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
  async #refinePCLoot(concept) {
    try {
      const { loot: draft, usage } = await generatePCLoot({
        concept, amount: this.#input.treasureAmount, onProgress: (p) => this._onAIProgress(p)
      });
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Loot"), usage);
      concept.loot = normalizeLoot(draft);
      await this.#refineLoot(concept);
    } catch (err) {
      console.warn(`${MODULE_ID} | PC starting-wealth item drafting failed, wealth will be all coin`, err);
    }
  }

  /**
   * Create whatever is currently previewed. Routing is driven by which preview
   * actually EXISTS, not by the mode radio: switching modes leaves the old
   * preview on screen (its Create button included), and keying off the radio
   * sent that click to a null concept and silently did nothing.
   */
  static async #onCreateActor() {
    if (this.#busy) return;
    if (this.#encounter) return this.#createEncounterActors();
    if (this.#pcConcept) return this.#createCharacterActor();
    if (!this.#concept) return;
    this.#busy = true;
    this.#error = null;
    await this.render();
    try {
      // Art: borrowed from the closest-matching bestiary creature.
      const img = await findBestiaryArt(this.#concept);
      const actor = await createActor(this.#concept, this.#resolved, { img });
      // The actor now exists. Clear the retryable plan before any presentation
      // work so a sheet-render failure cannot create a duplicate on retry.
      this.#concept = null;
      this.#resolved = null;
      ui.notifications.info(game.i18n.format("SIMPLYPF2E.Generator.Created", { name: actor.name }));
      try {
        await actor.sheet.render(true);
      } catch (err) {
        console.warn(`${MODULE_ID} | actor created, but its sheet could not be displayed`, err);
        ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Generator.CreatedPresentationFailed"));
      }
    } catch (err) {
      console.error(`${MODULE_ID} | actor creation failed`, err);
      this.#error = err.message;
    } finally {
      this.#busy = false;
      await this.render();
    }
  }

  /** Create the previewed PC actor. No bestiary art lookup (that's
   * creature-specific) — the character gets the default portrait. */
  async #createCharacterActor() {
    if (!this.#pcConcept) return;
    this.#busy = true;
    this.#error = null;
    const applyingMessage = game.i18n.localize("SIMPLYPF2E.Progress.ApplyingCharacter");
    this.#busyMessage = applyingMessage;
    let created = false;
    try {
      await this.render();
      const { actor, skillReport } = await createCharacterActor(this.#pcConcept, this.#pcResolved, {
        selectChoices: async (groups) => {
          const label = game.i18n.localize("SIMPLYPF2E.Progress.CharacterChoices");
          this.#busyMessage = null;
          this._beginProgress([["choices", label]]);
          try {
            await this._setStep("choices");
            const { picks, usage } = await selectCharacterChoices({
              concept: this.#pcConcept, groups, onProgress: (p) => this._onAIProgress(p)
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
            this._progress = null;
            this.#busyMessage = applyingMessage;
            await this.render();
          }
        }
      });
      // Creation has committed. Presentation failures must never leave a
      // retryable draft that creates a second actor.
      created = true;
      this.#pcConcept = null;
      this.#pcResolved = null;
      this.#characterReview = null;
      this.#created = { name: actor.name, actorId: actor.id, count: 1 };
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
        if (review.choices.length || review.incomplete || skillReport?.warnings.length) {
          ui.notifications.warn(game.i18n.format("SIMPLYPF2E.Generator.ReviewCreated", { name: actor.name }));
        } else {
          ui.notifications.info(game.i18n.format("SIMPLYPF2E.Generator.Created", { name: actor.name }));
        }
        await actor.sheet.render(true);
      } catch (err) {
        console.warn(`${MODULE_ID} | character created, but presentation failed`, err);
        ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Generator.CreatedPresentationFailed"));
      }
    } catch (err) {
      console.error(`${MODULE_ID} | character actor creation failed`, err);
      this.#error = err.message;
    } finally {
      this.#busy = false;
      this.#busyMessage = null;
      this._progress = null;
      try {
        await this.render();
      } catch (err) {
        if (!created) throw err;
        console.warn(`${MODULE_ID} | character created, but review rendering failed`, err);
        ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Generator.CreatedPresentationFailed"));
      }
    }
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
  async #createEncounterActors() {
    if (!this.#encounter) return;
    this.#busy = true;
    this.#error = null;
    await this.render();
    let folder = null;
    const actors = [];
    try {
      folder = await Folder.create({ name: this.#encounter.name, type: "Actor" });
      let created = 0;
      for (const member of this.#encounter.members) {
        if (member.count < 1) continue;
        // Identical minions share one art lookup — same creature, same portrait.
        const img = await findBestiaryArt(member.concept);
        for (let i = 0; i < member.count; i++) {
          const actor = await createActor(member.concept, member.resolved, { img });
          actors.push(actor);
          const update = { folder: folder.id };
          if (member.count > 1) update.name = `${actor.name} ${i + 1}`;
          await actor.update(update);
          created++;
        }
      }
      ui.notifications.info(game.i18n.format("SIMPLYPF2E.Generator.CreatedAll", {
        count: created, name: this.#encounter.name
      }));
      // Commit before presentation: all writes succeeded, so this plan cannot
      // safely be retried even if the next render fails.
      this.#encounter = null;
      this.#created = { name: folder.name, actorId: actors[0]?.id ?? null, count: created };
    } catch (err) {
      console.error(`${MODULE_ID} | encounter creation failed`, err);
      // An encounter is all-or-nothing. Best-effort cleanup preserves the
      // original error while ensuring a retry cannot duplicate a partial roster.
      for (const actor of actors.reverse()) {
        try { await actor.delete(); } catch (cleanupErr) {
          console.warn(`${MODULE_ID} | failed to roll back encounter actor "${actor.name}"`, cleanupErr);
        }
      }
      if (folder) {
        try { await folder.delete(); } catch (cleanupErr) {
          console.warn(`${MODULE_ID} | failed to roll back encounter folder "${folder.name}"`, cleanupErr);
        }
      }
      this.#error = err.message;
    } finally {
      this.#busy = false;
      await this.render();
    }
  }

  static async #onRerollLoot() {
    if (this.#busy || !this.#concept) return;
    this.#busy = true;
    this.#error = null;
    this._beginProgress([["loot", game.i18n.localize("SIMPLYPF2E.Progress.LootReroll")]]);
    try {
      await this._setStep("loot");
      const { loot, usage } = await generateLoot({
        concept: this.#concept,
        amount: this.#input.treasureAmount,
        onProgress: (p) => this._onAIProgress(p)
      });
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.LootReroll"), usage);
      this.#concept.loot = normalizeLoot(loot);
      // Ground the fresh draft too — same Remaster-name protection as the
      // main pipeline (a reroll is a new ungrounded draft).
      await this.#refineLoot(this.#concept);
      this.#resolved.loot = await applyTreasureBudget(
        await resolveLoot(this.#concept),
        treasureBudget(this.#concept.level, this.#concept.rarity, this.#input.treasureAmount)
      );
    } catch (err) {
      console.error(`${MODULE_ID} | loot reroll failed`, err);
      this.#error = err.message;
    } finally {
      this.#busy = false;
      this._progress = null;
      await this.render();
    }
  }

  static async #onDiscard() {
    this.#readForm();
    this.#concept = null;
    this.#resolved = null;
    this.#encounter = null;
    this.#pcConcept = null;
    this.#pcResolved = null;
    this.#error = null;
    this._tokenUsage = [];
    await this.render();
  }

  /**
   * Save a preset: if a CUSTOM preset is currently selected the dialog edits
   * it in place (same id); otherwise it creates a new custom preset. The
   * generator-default fields (rarity, treasure, spellcasting) are pre-filled
   * from the live form so a preset captures the GM's current setup.
   */
  static async #onSavePreset() {
    this.#readForm();
    const current = findPreset(this.#input.preset);
    const editing = current?.custom ? current : null;
    const result = await promptPresetDialog({
      title: editing ? "SIMPLYPF2E.Presets.DialogEditTitle" : "SIMPLYPF2E.Presets.DialogTitle",
      name: editing?.name ?? "",
      prompt: editing?.prompt ?? "",
      rarity: this.#input.rarity,
      allowSpellcasting: this.#input.allowSpellcasting,
      treasureAmount: this.#input.treasureAmount
    });
    if (!result) return;
    const preset = editing
      ? await updateCustomPreset(editing.id, result)
      : await addCustomPreset(result.name, result.prompt, result);
    if (!preset) return;
    this.#input.preset = preset.id;
    ui.notifications.info(game.i18n.format("SIMPLYPF2E.Presets.Saved", { name: preset.name }));
    await this.render();
  }

  /**
   * Duplicate the currently selected preset (built-in or custom) into a NEW
   * custom preset — the dialog opens pre-filled from the source so a GM can
   * start from e.g. "Fighter" and tweak it. Never touches the source.
   */
  static async #onDuplicatePreset() {
    this.#readForm();
    const source = findPreset(this.#input.preset);
    if (!source) return;
    // Built-in names are i18n keys; custom names are plain text.
    const sourceName = source.custom ? source.name : game.i18n.localize(source.name);
    const result = await promptPresetDialog({
      title: "SIMPLYPF2E.Presets.DialogTitle",
      name: game.i18n.format("SIMPLYPF2E.Presets.CopyName", { name: sourceName }),
      prompt: source.prompt,
      rarity: source.rarity ?? this.#input.rarity,
      allowSpellcasting: source.allowSpellcasting ?? this.#input.allowSpellcasting,
      treasureAmount: source.treasureAmount ?? this.#input.treasureAmount
    });
    if (!result) return;
    const preset = await addCustomPreset(result.name, result.prompt, result);
    this.#input.preset = preset.id;
    ui.notifications.info(game.i18n.format("SIMPLYPF2E.Presets.Saved", { name: preset.name }));
    await this.render();
  }

  /** Delete the currently selected custom preset (after confirmation). */
  static async #onDeletePreset() {
    this.#readForm();
    const preset = findPreset(this.#input.preset);
    if (!preset?.custom) return;
    if (!(await confirmDeletePreset(preset))) return;
    this.#input.preset = "";
    await this.render();
  }

  /** Open the Manage Custom Presets dialog (edit/duplicate/delete/export/import). */
  static #onManagePresets() {
    this.#managePresets ??= new ManagePresetsApp({ generator: this });
    this.#managePresets.render(true);
  }

  /** Singleton Manage Presets dialog for this generator window. */
  #managePresets = null;
}
