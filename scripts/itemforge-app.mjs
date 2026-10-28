import {
  MODULE_ID, getProviderAuthWarningKey, getProviderRequestConfig,
  authorizeApiKeyForCurrentBaseUrl
} from "./settings.mjs";
import { generateMagicItemConcept, generateRunedItemConcept, selectSpellConsumables, selectParcelSpells } from "./ai.mjs";
import { AI_TASK, taskMaxTokens } from "./ai-task-profiles.mjs";
import { getForgeEffectCatalog, EFFECT_KINDS } from "./rule-templates.mjs";
import {
  normalizeMagicItemConcept, buildMagicItemData, priceForLevel, getUsageOptions, describeEffect,
  describeActivation, MIN_ITEM_LEVEL, MAX_ITEM_LEVEL,
  getBaseItemCandidates, getPropertyRuneCandidates, getFundamentalRuneTiers,
  normalizeRunedItemConcept, buildRunedItem, SECONDARY_ADJECTIVE, RUNED_ITEM_KINDS
} from "./item-builder.mjs";
import { createActivationMacro } from "./macro-templates.mjs";
import { SourcesConfigApp } from "./sources-app.mjs";
import { SpfApp } from "./app-base.mjs";
import { getScrollSpellCandidates, getCantripCandidates, getCandidateDocument, priceToGp, toItemData } from "./compendium.mjs";
import {
  spellConsumableTemplateUuid, spellConsumableRankProblem, buildSpellConsumable, spellConsumableName
} from "./spell-consumables.mjs";

import { experimentalToolsEnabled, assertExperimentalToolAccess } from "./experimental-tools.mjs";
import { partyTreasureForSize, TREASURE_MIN_PARTY_LEVEL, TREASURE_MAX_PARTY_LEVEL } from "./treasure-tables.mjs";
import { planParcelSlots, assignParcelPicks, stackParcelAssignments, parcelValueGp, PARCEL_DROP } from "./treasure-parcel.mjs";
import { LOOT_NAME_MAX, LOOT_MANIFEST, COIN_UUIDS, coinItemSource, buildLootActorSource } from "./loot-actor.mjs";
import { persistedExpectedItems, verifyCreatedActor, rollbackCreatedActor } from "./post-create.mjs";
import { esc } from "./text.mjs";

/** Item Forge kinds that build real spells into scrolls or wands (spell-consumables.mjs). */
const CONSUMABLE_KINDS = new Set(["scroll", "wand", "cantripDeck"]);
/** Most spell consumables one plan may hold. */
const CONSUMABLE_PICK_LIMIT = 6;

/**
 * Highest spell rank a scroll or wand may hold at this item level. The pinned rank
 * templates sit at level 2r-1 for scrolls and 2r+1 for wands, so the level caps the
 * rank at (level+1)/2 or (level-1)/2 rounded down, and the native ceilings (10 for
 * scrolls, 9 for wands) still apply. Returns 0 when no rank fits.
 */
function consumableMaxRank(kind, level) {
  if (kind === "cantripDeck") return 1;
  const byLevel = kind === "wand" ? Math.floor((level - 1) / 2) : Math.floor((level + 1) / 2);
  return Math.max(0, Math.min(kind === "wand" ? 9 : 10, byLevel));
}

/** Words from the GM's brief that rank spell candidates by name and trait. */
function briefKeywords(brief) {
  return [...new Set(String(brief ?? "").toLowerCase().split(/[^a-z]+/).filter((word) => word.length >= 4))];
}

/**
 * The item forge: describe a wondrous magic item → AI concept constrained to
 * effect kinds this world has real rule exemplars for → preview → create a
 * real Item document whose Rule Elements are clones of published rules
 * (see rule-templates.mjs for the grounding principle).
 */
export class ItemForgeApp extends SpfApp {
  static DEFAULT_OPTIONS = {
    id: "simplypf2e-itemforge",
    tag: "form",
    classes: ["simplypf2e"],
    window: {
      title: "SIMPLYPF2E.ItemForge.Title",
      icon: "fa-solid fa-hammer",
      resizable: true
    },
    position: { width: 720, height: "auto" },
    actions: {
      generate: ItemForgeApp.#onGenerate,
      createItem: ItemForgeApp.#onCreateItem,
      discard: ItemForgeApp.#onDiscard,
      authorizeApiKey: ItemForgeApp.#onAuthorizeApiKey,
      configureProvider: ItemForgeApp.#onConfigureProvider,
      configureSources: ItemForgeApp.#onConfigureSources,
      testProvider: ItemForgeApp.#onTestProvider,
      cancelGeneration: ItemForgeApp.#onCancelGeneration,
      levelUp: ItemForgeApp.#onLevelUp,
      levelDown: ItemForgeApp.#onLevelDown,
      selectKind: ItemForgeApp.#onSelectKind,
      openCreatedItem: ItemForgeApp.#onOpenCreatedItem,
      openCreatedActor: ItemForgeApp.#onOpenCreatedActor,
      forgeAnother: ItemForgeApp.#onForgeAnother
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/itemforge.hbs` }
  };

  /** Form values, kept across re-renders. "kind": "wondrous"|"weapon"|"armor". */
  #input = { prompt: "", level: 4, rarity: "common", kind: "wondrous", destination: "items", partySize: 4, containerName: "" };
  #busy = false;
  #error = null;
  #concept = null;
  /** Which pipeline the current #concept/#itemData came from — set at generation time. */
  #kind = "wondrous";
  /** Benchmark price for the current WONDROUS concept (computed at preview time). */
  #price = 0;
  /** Final, already-resolved item data for a RUNED (weapon/armor) concept — built at generation
   * time since its name/price/level all depend on real component documents. */
  #itemData = null;
  /** PF2e-derived runed values for preview only; never persisted to source. */
  #runedPreview = null;
  /** Successful creation result, retained for the post-create actions. */
  #created = null;
  /** Effect kinds with no real exemplar in this world (set after first scan). */
  #unavailableKinds = null;
  /** Planned scroll/wand items: { items: [{ source, name, rank, level, priceGp }], warnings: string[] }. */
  #consumables = null;
  #parcel = null;

  async _prepareContext() {
    const authState = getProviderRequestConfig();
    const authWarningKey = getProviderAuthWarningKey(authState);
    return {
      input: this.#input,
      showDestination: experimentalToolsEnabled() && CONSUMABLE_KINDS.has(this.#input.kind),
      showContainer: experimentalToolsEnabled() && (this.#input.kind === "parcel" || (CONSUMABLE_KINDS.has(this.#input.kind) && this.#input.destination === "loot")),
      isCantripDeck: this.#input.kind === "cantripDeck",
      isParcel: experimentalToolsEnabled() && this.#input.kind === "parcel",
      levelLabel: this.#input.kind === "parcel" ? "SIMPLYPF2E.ItemForge.Parcel.PartyLevel" : "SIMPLYPF2E.ItemForge.Level",
      busy: this.#busy,
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
      canAuthorizeApiKey: Boolean(
        authState.baseUrl && authState.hasConfiguredApiKey && !authState.apiKeyIsBound
      ),
      model: authState.model,
      minLevel: this.#input.kind === "parcel" ? TREASURE_MIN_PARTY_LEVEL : MIN_ITEM_LEVEL,
      maxLevel: this.#input.kind === "parcel" ? TREASURE_MAX_PARTY_LEVEL : MAX_ITEM_LEVEL,
      kinds: [
        { value: "wondrous", label: "SIMPLYPF2E.ItemForge.KindWondrous", hint: "SIMPLYPF2E.ItemForge.KindWondrousHint", icon: "fa-ring" },
        { value: "weapon", label: "SIMPLYPF2E.ItemForge.KindWeapon", hint: "SIMPLYPF2E.ItemForge.KindWeaponHint", icon: "fa-sword" },
        { value: "armor", label: "SIMPLYPF2E.ItemForge.KindArmor", hint: "SIMPLYPF2E.ItemForge.KindArmorHint", icon: "fa-shield-halved" }
      ].map((kind) => ({ ...kind, selected: kind.value === this.#input.kind })),
      consumableKinds: [
        { value: "scroll", label: "SIMPLYPF2E.ItemForge.Consumables.KindScroll", hint: "SIMPLYPF2E.ItemForge.Consumables.KindScrollHint", icon: "fa-scroll" },
        { value: "cantripDeck", label: "SIMPLYPF2E.ItemForge.Consumables.KindCantripDeck", hint: "SIMPLYPF2E.ItemForge.Consumables.KindCantripDeckHint", icon: "fa-layer-group" },
        { value: "wand", label: "SIMPLYPF2E.ItemForge.Consumables.KindWand", hint: "SIMPLYPF2E.ItemForge.Consumables.KindWandHint", icon: "fa-wand-sparkles" },
        ...(experimentalToolsEnabled() ? [{ value: "parcel", label: "SIMPLYPF2E.ItemForge.Parcel.Kind", hint: "SIMPLYPF2E.ItemForge.Parcel.Hint", icon: "fa-sack-dollar" }] : [])
      ].map((kind) => ({ ...kind, selected: kind.value === this.#input.kind })),
      promptLabel: (CONSUMABLE_KINDS.has(this.#input.kind) || this.#input.kind === "parcel")
        ? "SIMPLYPF2E.ItemForge.Consumables.PromptLabel" : "SIMPLYPF2E.ItemForge.Prompt",
      promptPlaceholder: (CONSUMABLE_KINDS.has(this.#input.kind) || this.#input.kind === "parcel")
        ? "SIMPLYPF2E.ItemForge.Consumables.PromptPlaceholder" : "SIMPLYPF2E.ItemForge.PromptPlaceholder",
      rarities: [
        { value: "common", label: "SIMPLYPF2E.Rarity.Common" },
        { value: "uncommon", label: "SIMPLYPF2E.Rarity.Uncommon" },
        { value: "rare", label: "SIMPLYPF2E.Rarity.Rare" },
        { value: "unique", label: "SIMPLYPF2E.Rarity.Unique" }
      ],
      unavailableNote: this.#unavailableKinds?.length
        ? game.i18n.format("SIMPLYPF2E.ItemForge.KindsUnavailable", { kinds: this.#unavailableKinds.join(", ") })
        : null,
      preview: this.#buildActivePreview(),
      hasPreview: Boolean(this.#hasDraft()),
      created: this.#created,
      tokenReport: this._buildTokenReport(),
      // Presentation only: getting-started panel when there is no result yet.
      showEmptyState: !this.#busy && !this.#error && !this.#created && !this.#hasDraft()
    };
  }

  #buildPreviewContext() {
    if (!this.#concept) return null;
    const concept = this.#concept;
    return {
      concept,
      traits: [concept.rarity !== "common" ? concept.rarity : null, ...concept.traits].filter(Boolean),
      usage: concept.usage,
      bulk: concept.bulk === 0.1 ? "L" : concept.bulk === 0 ? "—" : String(concept.bulk),
      price: `${this.#price.toLocaleString()} gp`,
      invested: concept.invested,
      effects: concept.effects.map((e) => describeEffect(e)),
      hasEffects: concept.effects.length > 0,
      activation: concept.activation ? describeActivation(concept.activation) : null
    };
  }

  /** Read the current form inputs into #input. */
  #readForm() {
    const form = this.element;
    const prompt = form.querySelector('[name="prompt"]')?.value ?? this.#input.prompt;
    const rawLevel = Number(form.querySelector('[name="level"]')?.value ?? this.#input.level);
    const min = this.#input.kind === "parcel" ? TREASURE_MIN_PARTY_LEVEL : MIN_ITEM_LEVEL;
    const max = this.#input.kind === "parcel" ? TREASURE_MAX_PARTY_LEVEL : MAX_ITEM_LEVEL;
    const level = Number.isFinite(rawLevel)
      ? Math.min(max, Math.max(min, Math.round(rawLevel)))
      : this.#input.level;
    const rarity = form.querySelector('[name="rarity"]')?.value ?? "common";
    // The kind tiles are buttons, so preserve the authoritative selected kind
    // when no form control for it exists in the current render.
    const rawKind = form.querySelector('[name="kind"]:checked')?.value ?? this.#input.kind;
    const kind = rawKind === "wondrous" || RUNED_ITEM_KINDS.has(rawKind) || CONSUMABLE_KINDS.has(rawKind) || (rawKind === "parcel" && experimentalToolsEnabled())
      ? rawKind : "wondrous";
    const destination = (form.querySelector('[name="destination"]')?.value ?? this.#input.destination) === "loot" ? "loot" : "items";
    const sizeText = String(form.querySelector('[name="partySize"]')?.value ?? this.#input.partySize).trim();
    const rawSize = Number(sizeText);
    const partySize = sizeText && Number.isFinite(rawSize) ? Math.max(1, Math.min(8, Math.round(rawSize))) : this.#input.partySize;
    const containerName = String(form.querySelector('[name="containerName"]')?.value ?? this.#input.containerName).trim().slice(0, LOOT_NAME_MAX);
    this.#input = { prompt, level, rarity, kind, destination, partySize, containerName };
  }

  _preserveForm() {
    this.#readForm();
  }

  /** Preview context for a runed weapon/armor concept from the same resolution pass. */
  #buildRunedPreviewContext() {
    if (!this.#itemData || !this.#runedPreview) return null;
    const data = this.#itemData;
    const runes = data.system.runes ?? {};
    const secondaryField = this.#kind === "weapon" ? "striking" : "resilient";
    const secondaryTier = runes[secondaryField] ?? 0;
    return {
      concept: { name: data.name, level: this.#runedPreview.level, description: this.#concept?.description ?? "" },
      traits: [this.#runedPreview.rarity !== "common" ? this.#runedPreview.rarity : null, ...data.system.traits.value].filter(Boolean),
      price: `${this.#runedPreview.priceGp.toLocaleString()} gp`,
      runed: true,
      potency: runes.potency ?? 0,
      secondary: secondaryTier ? SECONDARY_ADJECTIVE[this.#kind][secondaryTier] : null,
      propertyRunes: this.#concept?.propertyRunes ?? []
    };
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

  /** Open the shared Compendium Sources settings app (same as the generator's gear). */
  static #onConfigureSources() {
    this.#readForm();
    new SourcesConfigApp(() => this._refreshPreservingForm()).render(true);
  }

  static async #onTestProvider(_event, target) {
    await this._testProvider(target);
  }

  static #onCancelGeneration() {
    this._cancelGeneration();
  }

  static #onLevelDown() {
    this.#stepLevel(-1);
  }

  static async #onSelectKind(_event, target) {
    if (this.#busy) return;
    const kind = target?.dataset?.kind;
    if (kind !== "wondrous" && !RUNED_ITEM_KINDS.has(kind) && !CONSUMABLE_KINDS.has(kind) && !(kind === "parcel" && experimentalToolsEnabled())) return;
    this.#readForm();
    this.#input = { ...this.#input, kind };
    await this.render();
  }

  #stepLevel(delta) {
    const input = this.element.querySelector('input[name="level"]');
    if (!input) return;
    const current = Number.parseInt(input.value, 10);
    const min = this.#input.kind === "parcel" ? TREASURE_MIN_PARTY_LEVEL : MIN_ITEM_LEVEL;
    const max = this.#input.kind === "parcel" ? TREASURE_MAX_PARTY_LEVEL : MAX_ITEM_LEVEL;
    input.value = Math.min(max, Math.max(min, (Number.isNaN(current) ? 4 : current) + delta));
  }

  static async #onGenerate() {
    if (this.#busy) return;
    const wasParcel = this.#input.kind === "parcel";
    const rawLevel = Number(this.element.querySelector('[name="level"]')?.value ?? this.#input.level);
    this.#readForm();
    if (wasParcel && !experimentalToolsEnabled()) {
      try { assertExperimentalToolAccess(); } catch (err) { this.#input.kind = "parcel"; this.#error = err.message; await this.render(); return; }
    }
    if (!experimentalToolsEnabled()) this.#input.destination = "items";
    if (wasParcel && Number.isFinite(rawLevel) && (rawLevel < TREASURE_MIN_PARTY_LEVEL || rawLevel > TREASURE_MAX_PARTY_LEVEL)) {
      this.#error = game.i18n.localize("SIMPLYPF2E.ItemForge.Parcel.LevelRange");
      await this.render();
      return;
    }
    const providerWarning = getProviderAuthWarningKey(getProviderRequestConfig());
    if (providerWarning) {
      ui.notifications.warn(game.i18n.localize(providerWarning));
      return;
    }
    if (!this.#input.prompt.trim()) {
      ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.ItemForge.NoPrompt"));
      return;
    }
    this.#busy = true;
    this.#error = null;
    this.#created = null;
    this._tokenUsage = [];
    this.#kind = this.#input.kind;
    this.#clearPreview();
    this.#unavailableKinds = null;
    const signal = this._beginProgress([
      ["templates", game.i18n.localize(this.#kind === "wondrous"
        ? "SIMPLYPF2E.ItemForge.ProgressTemplates" : "SIMPLYPF2E.ItemForge.ProgressCandidates"), 900],
      ["concept", game.i18n.localize("SIMPLYPF2E.ItemForge.ProgressConcept"), taskMaxTokens(
        this.#conceptTask()
      )],
      ["assemble", game.i18n.localize("SIMPLYPF2E.ItemForge.ProgressAssemble"), 900]
    ]);
    let outcome = "success";
    try {
      if (this.#kind === "wondrous") await this.#generateWondrous(signal);
      else if (this.#kind === "parcel") await this.#generateParcel(signal);
      else if (CONSUMABLE_KINDS.has(this.#kind)) await this.#generateConsumables(this.#kind, signal);
      else await this.#generateRuned(this.#kind, signal);
      console.log(`${MODULE_ID} | token usage`, this._tokenUsage);
    } catch (err) {
      // Failed requests and rejected aliases can still consume tokens. Keep
      // their reported usage in this Forge run.
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.ItemForge.ProgressConcept"), err?.usage);
      outcome = err?.cancelled ? "cancelled" : "error";
      if (err?.cancelled) console.warn(`${MODULE_ID} | item generation cancelled`);
      else console.error(`${MODULE_ID} | item generation failed`, err);
      this.#error = err?.cancelled ? null : err.message;
      this.#clearPreview();
    } finally {
      this.#busy = false;
      this._finishRun(outcome);
      await this.render();
    }
  }

  async #generateWondrous(signal) {
      // 1. Ground truth first: which effect kinds have real rule exemplars
      // in this world's compendiums? Only those are offered to the AI.
      await this._setStep("templates");
      const effectCatalog = await getForgeEffectCatalog(this.#input.level, this.#input.rarity);
      const availableKinds = [...new Set(effectCatalog.map((effect) => effect.kind))];
      this.#unavailableKinds = EFFECT_KINDS.filter((k) => !availableKinds.includes(k));
      const usageOptions = await getUsageOptions();

      // 2. One AI call, constrained to the available kinds and real usages.
      await this._setStep("concept");
      const { concept: raw, usage } = await generateMagicItemConcept({
        prompt: this.#input.prompt,
        level: this.#input.level,
        rarity: this.#input.rarity,
        availableKinds,
        effectCatalog,
        usageOptions,
        onProgress: this._progressCallback(game.i18n.localize("SIMPLYPF2E.ItemForge.ProgressConcept")), signal
      });
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.ItemForge.ProgressConcept"), usage);

      // 3. Normalize defensively and price from the empirical benchmark.
      await this._setStep("assemble");
      this.#itemData = null;
      this.#runedPreview = null;
      this.#concept = normalizeMagicItemConcept(raw, {
        level: this.#input.level,
        rarity: this.#input.rarity,
        availableKinds,
        effectCatalog,
        usageOptions
      });
      this.#price = await priceForLevel(this.#concept.level, this.#concept.rarity);
      this._throwIfCancelled();
  }

  /**
   * Generate a runed weapon/armor (item forge Phase 3). Every choice the AI
   * makes is picked from real compendium candidates harvested up front, and
   * the final name/price/level are all resolved from those real component
   * documents at generation time — see item-builder.mjs's buildRunedItem.
   */
  async #generateRuned(kind, signal) {
      // 1. Ground truth first: real base items, real property runes, and
      // which fundamental rune tiers actually fit under the target level.
      await this._setStep("templates");
      const maxLevel = this.#input.level;
      const [baseCandidates, runeCandidates, tiers] = await Promise.all([
        getBaseItemCandidates(kind, maxLevel),
        getPropertyRuneCandidates(kind, maxLevel),
        getFundamentalRuneTiers(kind, maxLevel)
      ]);
      if (!baseCandidates.length) {
        throw new Error(game.i18n.format("SIMPLYPF2E.ItemForge.NoBaseItems", { kind }));
      }
      if (!tiers.potencyTiers.length) {
        throw new Error(game.i18n.format("SIMPLYPF2E.ItemForge.NoPotencyAvailable", {
          kind, level: maxLevel, minLevel: tiers.minPotencyLevel
        }));
      }

      // 2. One AI call, constrained to those real candidates.
      await this._setStep("concept");
      const { concept: raw, usage } = await generateRunedItemConcept({
        prompt: this.#input.prompt,
        level: this.#input.level,
        rarity: this.#input.rarity,
        kind,
        baseCandidates,
        runeCandidates,
        potencyCandidates: tiers.potencyCandidates,
        secondaryCandidates: tiers.secondaryCandidates,
        onProgress: this._progressCallback(game.i18n.localize("SIMPLYPF2E.ItemForge.ProgressConcept")), signal
      });
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.ItemForge.ProgressConcept"), usage);

      // 3. Normalize against the same candidate lists, then resolve the real
      // documents to compute the final name/price/level right away — a runed
      // item's preview IS its final data, there is no separate build step.
      await this._setStep("assemble");
      this.#concept = normalizeRunedItemConcept(raw, {
        kind, rarity: this.#input.rarity, maxLevel: this.#input.level, baseCandidates, runeCandidates,
        potencyCandidates: tiers.potencyCandidates, secondaryCandidates: tiers.secondaryCandidates
      });
      const built = await buildRunedItem(this.#concept);
      this._throwIfCancelled();
      this.#itemData = built.itemData;
      this.#runedPreview = built.preview;
      console.log(`${MODULE_ID} | token usage`, this._tokenUsage);
  }

  /** AI task profile for the concept call of the current kind. */
  #conceptTask() {
    if (this.#kind === "parcel") return AI_TASK.TREASURE_PARCEL_SPELLS;
    if (this.#kind === "wondrous") return AI_TASK.MAGIC_ITEM_CONCEPT;
    return CONSUMABLE_KINDS.has(this.#kind) ? AI_TASK.SPELL_CONSUMABLE_CONCEPT : AI_TASK.RUNED_ITEM_CONCEPT;
  }

  /** Preview context for the draft of the current kind. */
  #buildActivePreview() {
    if (this.#kind === "parcel") return this.#buildParcelPreview();
    if (this.#kind === "wondrous") return this.#buildPreviewContext();
    return CONSUMABLE_KINDS.has(this.#kind) ? this.#buildConsumablePreviewContext() : this.#buildRunedPreviewContext();
  }

  /** Whether a generated draft of the current kind is waiting for Create. */
  #hasDraft() {
    if (this.#kind === "parcel") return Boolean(this.#parcel);
    if (this.#kind === "wondrous") return Boolean(this.#concept);
    return CONSUMABLE_KINDS.has(this.#kind) ? Boolean(this.#consumables) : Boolean(this.#itemData);
  }

  #buildConsumablePreviewContext() {
    if (!this.#consumables) return null;
    return {
      consumable: true,
      isCantripDeck: this.#kind === "cantripDeck",
      destination: this.#input.destination === "loot" && (experimentalToolsEnabled() || this.#consumables) ? game.i18n.localize("SIMPLYPF2E.ItemForge.Loot.DestinationLine") : null,
      heading: game.i18n.localize("SIMPLYPF2E.ItemForge.Consumables.PreviewHeading"),
      items: this.#consumables.items.map((item) => ({
        name: item.name,
        rank: item.rank,
        level: item.level,
        price: `${item.priceGp.toLocaleString()} gp`
      })),
      warnings: this.#consumables.warnings
    };
  }

  /**
   * Scroll or wand plan. Real spells come only from the configured spell packs and the
   * AI chooses only from them. The Forge level caps the rank, and the chosen rarity
   * filters the candidates before the bounded cut. Every template, price and level comes
   * from the pinned pf2e consumable template. Nothing is written here: Create writes the
   * planned items in one call.
   */
  async #generateConsumables(kind, signal) {
    // 1. Ground truth first: eligible spells from the configured packs.
    await this._setStep("templates");
    const maxRank = consumableMaxRank(kind, this.#input.level);
    if (maxRank < 1) {
      throw new Error(game.i18n.format("SIMPLYPF2E.ItemForge.Consumables.LevelTooLow", { kind, minLevel: kind === "wand" ? 3 : 1 }));
    }
    const offered = kind === "cantripDeck" ? await getCantripCandidates(briefKeywords(this.#input.prompt)) : await getScrollSpellCandidates(maxRank, briefKeywords(this.#input.prompt), { maxRarity: this.#input.rarity });
    if (!offered.length) {
      throw new Error(kind === "cantripDeck" ? game.i18n.localize("SIMPLYPF2E.ItemForge.Consumables.NoCantripCandidates") : game.i18n.format("SIMPLYPF2E.ItemForge.Consumables.NoCandidates", { kind }));
    }

    // 2. One AI call, constrained to those real spells.
    await this._setStep("concept");
    const { picks, usage } = await selectSpellConsumables(this.#input.prompt, {
      level: this.#input.level,
      kind,
      maxRank,
      candidates: offered,
      count: CONSUMABLE_PICK_LIMIT,
      onProgress: this._progressCallback(game.i18n.localize("SIMPLYPF2E.ItemForge.ProgressConcept")),
      signal
    });
    this._recordTokens(game.i18n.localize("SIMPLYPF2E.ItemForge.ProgressConcept"), usage);

    // 3. Resolve each pick to its real spell and pinned template. A pick that
    // cannot be built is dropped and reported, never approximated.
    await this._setStep("assemble");
    const items = [];
    const warnings = [];
    const planned = new Set();
    for (const pick of picks) {
      this._throwIfCancelled();
      const label = spellConsumableName(kind, pick.name, pick.rank);
      const dropped = (reason) => warnings.push(game.i18n.format("SIMPLYPF2E.ItemForge.Consumables.DroppedPick", { name: label, reason }));
      // The same spell at the same rank and kind is one planned item.
      const key = JSON.stringify([pick.spellId, pick.rank, kind]);
      if (planned.has(key)) continue;
      planned.add(key);
      if (pick.rank > maxRank) {
        dropped(game.i18n.format("SIMPLYPF2E.ItemForge.Consumables.RankAboveLevel", { rank: pick.rank, max: maxRank }));
        continue;
      }
      const result = await this.#buildSpellConsumable(kind, pick.candidate, pick.rank);
      if (kind === "cantripDeck" && !result.source) console.warn(`${MODULE_ID} | dropped cantrip deck pick`, label, result.missing ?? result.reason);
      if (result.missing === "spell") warnings.push(game.i18n.format("SIMPLYPF2E.ItemForge.Consumables.SpellMissing", { name: label }));
      else if (result.missing === "template") warnings.push(game.i18n.format("SIMPLYPF2E.ItemForge.Consumables.TemplateMissing", { name: label }));
      else if (!result.source) dropped(result.reason || "build failed");
      else items.push(result);

    }
    if (!items.length) {
      throw new Error([game.i18n.format("SIMPLYPF2E.ItemForge.Consumables.NoPicks", { kind }), ...warnings].join(" "));
    }
    this.#consumables = { items, warnings, level: this.#input.level };
    this._throwIfCancelled();
  }

  async #buildSpellConsumable(kind, candidate, rank) {
    const spellDoc = await getCandidateDocument(candidate);
    if (!spellDoc) return { missing: "spell" };
    const spellData = spellDoc.toObject();
    spellData._stats = { ...(spellData._stats ?? {}), compendiumSource: spellDoc.uuid };
    const problem = spellConsumableRankProblem(spellData, kind, rank);
    if (problem) return { reason: problem };
    try {
      const uuid = spellConsumableTemplateUuid(kind, rank);
      const templateDoc = uuid ? await fromUuid(uuid) : null;
      if (!templateDoc) return { missing: "template" };
      const templateData = toItemData(templateDoc);
      const source = buildSpellConsumable({ kind, rank, templateData, spellData });
      return { source, name: source.name, rank, level: templateData.system?.level?.value ?? 0,
        priceGp: priceToGp(templateData.system?.price?.value) };
    } catch (err) { return { reason: err?.message ?? String(err) }; }
  }

  async #generateParcel(signal) {
    assertExperimentalToolAccess();
    if (this.#input.level < TREASURE_MIN_PARTY_LEVEL || this.#input.level > TREASURE_MAX_PARTY_LEVEL) {
      throw new Error(game.i18n.localize("SIMPLYPF2E.ItemForge.Parcel.LevelRange"));
    }
    await this._setStep("templates");
    const row = partyTreasureForSize(this.#input.level, this.#input.partySize);
    const plan = planParcelSlots(row);
    const candidates = await getScrollSpellCandidates(Math.max(...plan.slots.map((s) => s.rank)), briefKeywords(this.#input.prompt), { maxRarity: this.#input.rarity });
    await this._setStep("concept");
    const { picks, usage } = await selectParcelSpells(this.#input.prompt, { partyLevel: row.level, slots: plan.slots, candidates, signal,
      onProgress: this._progressCallback(game.i18n.localize("SIMPLYPF2E.ItemForge.ProgressConcept")) });
    this._recordTokens(game.i18n.localize("SIMPLYPF2E.ItemForge.ProgressConcept"), usage);
    await this._setStep("assemble");
    const assigned = assignParcelPicks(plan.slots, picks, candidates);
    const items = [];
    const dropped = [...assigned.dropped];
    for (const drop of dropped) console.warn(`${MODULE_ID} | dropped parcel pick`, drop);
    const unfilled = [...assigned.unfilled];
    for (const stack of stackParcelAssignments(assigned.assignments)) {
      this._throwIfCancelled();
      const built = await this.#buildSpellConsumable("scroll", stack.candidate, stack.rank);
      if (!built.source) {
        console.warn(`${MODULE_ID} | dropped parcel scroll`, built);
        dropped.push({ reason: "build", detail: built.reason ?? built.missing });
        unfilled.push(...plan.slots.filter((slot) => stack.slotIds.includes(slot.id)));
        continue;
      }
      built.source.system.quantity = stack.quantity;
      items.push({ ...built, quantity: stack.quantity, slotIds: stack.slotIds, itemLevels: plan.slots.filter((slot) => stack.slotIds.includes(slot.id)).map((slot) => slot.itemLevel) });
    }
    let currency = null;
    try {
      const coin = await fromUuid(COIN_UUIDS.gp);
      currency = coinItemSource(coin ? toItemData(coin) : null, "gp", plan.currencyGp);
    } catch (err) { console.warn(`${MODULE_ID} | dropped parcel currency`, err); dropped.push({ reason: "currency" }); }
    if (!items.length && !currency) throw new Error(game.i18n.format("SIMPLYPF2E.ItemForge.Consumables.NoPicks", { kind: "scroll" }));
    this.#parcel = { items, currency, unfilled, dropped, permanent: plan.permanent, permanentExtra: plan.permanentExtra,
      row, partySize: row.partySize, valueGp: parcelValueGp({ items, currencyGp: currency ? plan.currencyGp : 0 }) };
    this._throwIfCancelled();
  }

  #permanentList(parcel) {
    const entries = parcel.permanent.map((e) => game.i18n.format("SIMPLYPF2E.ItemForge.Parcel.PermanentEntry", { level: e.level, count: e.count }));
    if (parcel.permanentExtra.count) entries.push(game.i18n.format("SIMPLYPF2E.ItemForge.Parcel.PermanentExtra", { count: parcel.permanentExtra.count, levels: parcel.permanentExtra.levels.join(" / ") }));
    return entries.join(", ");
  }

  #buildParcelPreview() {
    const p = this.#parcel;
    if (!p) return null;
    const dropKeys = { [PARCEL_DROP.UNKNOWN_SLOT]: "UnknownSlot", [PARCEL_DROP.DUPLICATE_SLOT]: "DuplicateSlot", [PARCEL_DROP.UNKNOWN_SPELL]: "UnknownSpell", [PARCEL_DROP.RANK_ABOVE_SLOT]: "RankAbove", build: "BuildDrop", currency: "CurrencyDrop" };
    return { parcel: true, items: p.items.map((i) => ({ ...i, itemLevels: i.itemLevels.join(", "), price: `${i.priceGp.toLocaleString()} gp` })),
      unfilled: p.unfilled, warnings: p.dropped.map((d) => game.i18n.localize(`SIMPLYPF2E.ItemForge.Parcel.${dropKeys[d.reason]}`)),
      extraPcs: p.row.extraPcs, currency: p.currency ? p.row.currencyGp : 0, permanent: this.#permanentList(p), valueGp: p.valueGp, totalGp: p.row.totalGp };
  }

  async #createLootActor({ items, name, level, descriptionLines }) {
    let actor = null;
    let committed = false;
    try {
      assertExperimentalToolAccess();
      const built = buildLootActorSource({ items, name, level, descriptionLines });
      const expected = await persistedExpectedItems(built.items);
      assertExperimentalToolAccess();
      this._lockCreation();
      actor = await Actor.create({ ...built.actor, items: built.items });
      verifyCreatedActor(actor, LOOT_MANIFEST, expected);
      this.#clearPreview();
      committed = true;
      this.#created = { name: actor.name, actorId: actor.id, warning: false };
      ui.notifications.info(game.i18n.format("SIMPLYPF2E.ItemForge.Created", { name: esc(actor.name) }));
      await actor.sheet.render(true);
      return false;
    } catch (err) {
      if (committed) {
        console.warn(`${MODULE_ID} | loot actor committed, presentation failed`, err);
        this.#created.warning = true;
        ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.ItemForge.CreatedPresentationFailed"));
        return true;
      }
      const survivor = await rollbackCreatedActor(actor, "loot actor");
      if (survivor) { this.#clearPreview(); throw new Error(`${err.message} ${survivor}`); }
      throw err;
    }
  }

  async #createLootDraft() {
    this.#busy = true;
    this.#error = null;
    this._beginProgress([["apply", game.i18n.localize("SIMPLYPF2E.Progress.Apply"), 1800]], { cancellable: true });
    let outcome = "success";
    try {
      assertExperimentalToolAccess();
      await this._setStep("apply");
      await this.render();
      const p = this.#parcel;
      const descriptionLines = p ? [
        game.i18n.format("SIMPLYPF2E.ItemForge.Parcel.Header", { level: p.row.level, size: p.partySize }),
        game.i18n.format("SIMPLYPF2E.ItemForge.Parcel.PermanentLine", { list: this.#permanentList(p) }),
        game.i18n.localize("SIMPLYPF2E.ItemForge.Parcel.EvenNote"),
        ...(p.row.belowBase ? [game.i18n.localize("SIMPLYPF2E.ItemForge.Parcel.BelowNote")] : [])
      ] : [game.i18n.localize("SIMPLYPF2E.ItemForge.Loot.Description")];
      const items = p ? [...p.items.map((i) => i.source), ...(p.currency ? [p.currency] : [])] : this.#consumables.items.map((i) => i.source);
      const presentationWarning = await this.#createLootActor({ items, name: this.#input.containerName || game.i18n.localize("SIMPLYPF2E.ItemForge.Loot.DefaultName"), level: p ? p.row.level : this.#consumables.level, descriptionLines });
      if (presentationWarning) outcome = "warning";
    } catch (err) { outcome = err?.cancelled ? "cancelled" : "error"; this.#error = err?.cancelled ? null : err.message; }
    finally { this.#busy = false; this._finishRun(outcome); await this.render(); }
  }

  /**
   * Create the planned scrolls or wands as world Items in one write. Nothing
   * is written before this point.
   */
  async #createConsumables() {
    this.#busy = true;
    this.#error = null;
    const applyLabel = game.i18n.localize("SIMPLYPF2E.Progress.Apply");
    this._beginProgress([["apply", applyLabel, 1800]], { cancellable: true });
    let outcome = "success";
    let committed = false;
    try {
      await this._setStep("apply");
      await this.render();
      const sources = this.#consumables.items.map((item) => item.source);
      this._lockCreation();
      const written = await Item.create(sources);
      const created = (Array.isArray(written) ? written : [written]).filter((item) => item?.id);
      if (!created.length) throw new Error(game.i18n.localize("SIMPLYPF2E.ItemForge.CreateFailed"));
      // The items are committed. Consume the draft before any presentation work.
      this.#clearPreview();
      committed = true;
      const names = created.map((item) => item.name);
      const partial = created.length < sources.length;
      this.#created = {
        name: names.join(", "),
        names,
        itemId: created.length === 1 ? created[0].id : null,
        warning: partial,
        macroId: null
      };
      ui.notifications.info(game.i18n.format("SIMPLYPF2E.ItemForge.Created", { name: this.#created.name }));
      if (partial) {
        ui.notifications.warn(game.i18n.format("SIMPLYPF2E.ItemForge.Consumables.PartialCreate", {
          created: created.length, total: sources.length
        }));
      }
      outcome = partial ? "warning" : "success";
    } catch (err) {
      if (committed) {
        outcome = "warning";
        this.#error = null;
        console.warn(`${MODULE_ID} | consumables committed, but completion presentation failed`, err);
      } else {
        outcome = err?.cancelled ? "cancelled" : "error";
        if (err?.cancelled) console.warn(`${MODULE_ID} | item creation cancelled`);
        else console.error(`${MODULE_ID} | item creation failed`, err);
        this.#error = err?.cancelled ? null : err.message;
      }
    } finally {
      this.#busy = false;
      this._finishRun(outcome);
      await this.render();
    }
  }

  static async #onCreateItem() {
    if (this.#busy) return;
    if (!this.#hasDraft()) return;
    const selectedParcel = this.#input.kind === "parcel";
    this.#readForm();
    if (selectedParcel && !experimentalToolsEnabled()) this.#input.kind = "parcel";
    if (this.#kind === "parcel" || (CONSUMABLE_KINDS.has(this.#kind) && this.#input.destination === "loot")) return this.#createLootDraft();
    if (CONSUMABLE_KINDS.has(this.#kind)) return this.#createConsumables();
    this.#busy = true;
    this.#error = null;
    const applyLabel = game.i18n.localize("SIMPLYPF2E.Progress.Apply");
    this._beginProgress([["apply", applyLabel, 1800]], { cancellable: true });
    let outcome = "success";
    let committed = false;
    try {
      await this._setStep("apply");
      await this.render();
      const concept = this.#concept;
      const built = this.#kind === "wondrous" ? null : await buildRunedItem(concept);
      const data = this.#kind === "wondrous"
        ? await buildMagicItemData(concept)
        : built.itemData;
      this._lockCreation();
      const item = await Item.create(data);
      if (!item?.id) throw new Error(game.i18n.localize("SIMPLYPF2E.ItemForge.CreateFailed"));

      // The item is committed. Consume the draft before any companion or
      // presentation work so a display failure cannot enable duplicate writes.
      this.#clearPreview();
      committed = true;
      // Preserve the committed result before any notification or sheet work:
      // presentation failures must leave the item reachable, never look like
      // a retryable failed write.
      this.#created = { name: item.name, itemId: item.id, warning: false, macroId: null };
      let warning = false;
      let macroId = null;
      try {
        if (this.#kind === "wondrous" && concept.activation) {
          try {
            macroId = (await createActivationMacro({ item, concept }))?.id ?? null;
          } catch (err) {
            console.error(`${MODULE_ID} | activation macro creation failed`, err);
            ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.ItemForge.MacroFailed"));
            warning = true;
          }
        }
        ui.notifications.info(game.i18n.format("SIMPLYPF2E.ItemForge.Created", { name: item.name }));
        await item.sheet.render(true);
      } catch (err) {
        console.error(`${MODULE_ID} | created item presentation failed`, err);
        ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.ItemForge.CreatedPresentationFailed"));
        warning = true;
      }
      this.#created = { name: item.name, itemId: item.id, warning, macroId };
      outcome = warning ? "warning" : "success";
    } catch (err) {
      if (committed) {
        outcome = "warning";
        this.#error = null;
        console.warn(`${MODULE_ID} | item committed, but completion presentation failed`, err);
      } else {
        outcome = err?.cancelled ? "cancelled" : "error";
        if (err?.cancelled) console.warn(`${MODULE_ID} | item creation cancelled`);
        else console.error(`${MODULE_ID} | item creation failed`, err);
        this.#error = err?.cancelled ? null : err.message;
      }
    } finally {
      this.#busy = false;
      this._finishRun(outcome);
      await this.render();
    }
  }

  static async #onOpenCreatedItem() {
    const item = game.items.get(this.#created?.itemId);
    if (!item) {
      ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.ItemForge.CreateFailed"));
      return;
    }
    await item.sheet.render(true);
  }

  static async #onOpenCreatedActor() {
    const actor = game.actors.get(this.#created?.actorId);
    if (!actor) { ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.ItemForge.CreateFailed")); return; }
    await actor.sheet.render(true);
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element?.querySelector('[name="destination"]')?.addEventListener("change", () => { this.#readForm(); this.render(); });
  }

  static async #onForgeAnother() {
    this.#created = null;
    this.#error = null;
    await this.render();
  }

  static async #onDiscard() {
    if (this.#busy) return;
    this.#readForm();
    this.#clearPreview();
    this.#created = null;
    this.#error = null;
    this._tokenUsage = [];
    await this.render();
  }

  #clearPreview() {
    this.#concept = null;
    this.#itemData = null;
    this.#runedPreview = null;
    this.#consumables = null;
    this.#parcel = null;
  }
}
