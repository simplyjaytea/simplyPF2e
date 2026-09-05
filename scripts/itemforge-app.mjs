import {
  MODULE_ID, getProviderAuthWarningKey, getProviderRequestConfig,
  authorizeApiKeyForCurrentBaseUrl
} from "./settings.mjs";
import { generateMagicItemConcept, generateRunedItemConcept } from "./ai.mjs";
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
      selectKind: ItemForgeApp.#onSelectKind
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/itemforge.hbs` }
  };

  /** Form values, kept across re-renders. "kind": "wondrous"|"weapon"|"armor". */
  #input = { prompt: "", level: 4, rarity: "common", kind: "wondrous" };
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
  /** Effect kinds with no real exemplar in this world (set after first scan). */
  #unavailableKinds = null;

  async _prepareContext() {
    const authState = getProviderRequestConfig();
    const authWarningKey = getProviderAuthWarningKey(authState);
    return {
      input: this.#input,
      busy: this.#busy,
      canCancel: this._canCancel,
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
      minLevel: MIN_ITEM_LEVEL,
      maxLevel: MAX_ITEM_LEVEL,
      kinds: [
        { value: "wondrous", label: "SIMPLYPF2E.ItemForge.KindWondrous", hint: "SIMPLYPF2E.ItemForge.KindWondrousHint", icon: "fa-ring" },
        { value: "weapon", label: "SIMPLYPF2E.ItemForge.KindWeapon", hint: "SIMPLYPF2E.ItemForge.KindWeaponHint", icon: "fa-sword" },
        { value: "armor", label: "SIMPLYPF2E.ItemForge.KindArmor", hint: "SIMPLYPF2E.ItemForge.KindArmorHint", icon: "fa-shield-halved" }
      ].map((kind) => ({ ...kind, selected: kind.value === this.#input.kind })),
      rarities: [
        { value: "common", label: "SIMPLYPF2E.Rarity.Common" },
        { value: "uncommon", label: "SIMPLYPF2E.Rarity.Uncommon" },
        { value: "rare", label: "SIMPLYPF2E.Rarity.Rare" },
        { value: "unique", label: "SIMPLYPF2E.Rarity.Unique" }
      ],
      unavailableNote: this.#unavailableKinds?.length
        ? game.i18n.format("SIMPLYPF2E.ItemForge.KindsUnavailable", { kinds: this.#unavailableKinds.join(", ") })
        : null,
      preview: this.#kind === "wondrous" ? this.#buildPreviewContext() : this.#buildRunedPreviewContext(),
      tokenReport: this._buildTokenReport(),
      // Presentation only: getting-started panel when there is no result yet.
      showEmptyState: !this.#busy && !this.#error
        && !(this.#kind === "wondrous" ? this.#concept : this.#itemData)
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
    const level = Number.isFinite(rawLevel)
      ? Math.min(MAX_ITEM_LEVEL, Math.max(MIN_ITEM_LEVEL, Math.round(rawLevel)))
      : this.#input.level;
    const rarity = form.querySelector('[name="rarity"]')?.value ?? "common";
    // The kind tiles are buttons, so preserve the authoritative selected kind
    // when no form control for it exists in the current render.
    const rawKind = form.querySelector('[name="kind"]:checked')?.value ?? this.#input.kind;
    const kind = rawKind === "wondrous" || RUNED_ITEM_KINDS.has(rawKind) ? rawKind : "wondrous";
    this.#input = { prompt, level, rarity, kind };
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
      traits: [data.system.traits.rarity !== "common" ? data.system.traits.rarity : null, ...data.system.traits.value].filter(Boolean),
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
    new SourcesConfigApp().render(true);
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
    if (kind !== "wondrous" && !RUNED_ITEM_KINDS.has(kind)) return;
    this.#readForm();
    this.#input = { ...this.#input, kind };
    await this.render();
  }

  #stepLevel(delta) {
    const input = this.element.querySelector('input[name="level"]');
    if (!input) return;
    const current = Number.parseInt(input.value, 10);
    input.value = Math.min(MAX_ITEM_LEVEL, Math.max(MIN_ITEM_LEVEL, (Number.isNaN(current) ? 4 : current) + delta));
  }

  static async #onGenerate() {
    if (this.#busy) return;
    this.#readForm();
    if (!this.#input.prompt.trim()) {
      ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.ItemForge.NoPrompt"));
      return;
    }
    this.#busy = true;
    this.#error = null;
    this._tokenUsage = [];
    this.#kind = this.#input.kind;
    this.#clearPreview();
    this.#unavailableKinds = null;
    if (this.#kind === "wondrous") await this.#generateWondrous();
    else await this.#generateRuned(this.#kind);
  }

  async #generateWondrous() {
    const signal = this._beginProgress([
      ["templates", game.i18n.localize("SIMPLYPF2E.ItemForge.ProgressTemplates")],
      ["concept", game.i18n.localize("SIMPLYPF2E.ItemForge.ProgressConcept")],
      ["assemble", game.i18n.localize("SIMPLYPF2E.ItemForge.ProgressAssemble")]
    ]);
    try {
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
        onProgress: (p) => this._onAIProgress(p), signal
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
      console.log(`${MODULE_ID} | token usage`, this._tokenUsage);
    } catch (err) {
      if (err?.cancelled) console.warn(`${MODULE_ID} | item generation cancelled`);
      else console.error(`${MODULE_ID} | item generation failed`, err);
      this.#error = err.message;
      this.#concept = null;
    } finally {
      this.#busy = false;
      this._finishRun();
      await this.render();
    }
  }

  /**
   * Generate a runed weapon/armor (item forge Phase 3). Every choice the AI
   * makes is picked from real compendium candidates harvested up front, and
   * the final name/price/level are all resolved from those real component
   * documents at generation time — see item-builder.mjs's buildRunedItem.
   */
  async #generateRuned(kind) {
    const signal = this._beginProgress([
      ["templates", game.i18n.localize("SIMPLYPF2E.ItemForge.ProgressCandidates")],
      ["concept", game.i18n.localize("SIMPLYPF2E.ItemForge.ProgressConcept")],
      ["assemble", game.i18n.localize("SIMPLYPF2E.ItemForge.ProgressAssemble")]
    ]);
    try {
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
        potencyTiers: tiers.potencyTiers,
        secondaryTiers: tiers.secondaryTiers,
        onProgress: (p) => this._onAIProgress(p), signal
      });
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.ItemForge.ProgressConcept"), usage);

      // 3. Normalize against the same candidate lists, then resolve the real
      // documents to compute the final name/price/level right away — a runed
      // item's preview IS its final data, there is no separate build step.
      await this._setStep("assemble");
      this.#concept = normalizeRunedItemConcept(raw, {
        kind, rarity: this.#input.rarity, baseCandidates, runeCandidates,
        potencyTiers: tiers.potencyTiers, secondaryTiers: tiers.secondaryTiers
      });
      const built = await buildRunedItem(this.#concept);
      this._throwIfCancelled();
      this.#itemData = built.itemData;
      this.#runedPreview = built.preview;
      console.log(`${MODULE_ID} | token usage`, this._tokenUsage);
    } catch (err) {
      if (err?.cancelled) console.warn(`${MODULE_ID} | runed item generation cancelled`);
      else console.error(`${MODULE_ID} | runed item generation failed`, err);
      this.#error = err.message;
      this.#concept = null;
      this.#itemData = null;
      this.#runedPreview = null;
    } finally {
      this.#busy = false;
      this._finishRun();
      await this.render();
    }
  }

  static async #onCreateItem() {
    if (this.#busy) return;
    if (this.#kind === "wondrous" ? !this.#concept : !this.#itemData) return;
    this.#busy = true;
    this.#error = null;
    try {
      await this.render();
      const concept = this.#concept;
      const data = this.#kind === "wondrous"
        ? await buildMagicItemData(concept)
        : this.#itemData;
      const item = await Item.create(data);
      if (!item?.id) throw new Error(game.i18n.localize("SIMPLYPF2E.ItemForge.CreateFailed"));

      // The item is committed. Consume the draft before any companion or
      // presentation work so a display failure cannot enable duplicate writes.
      this.#clearPreview();
      try {
        if (this.#kind === "wondrous" && concept.activation) {
          try {
            await createActivationMacro({ item, concept });
          } catch (err) {
            console.error(`${MODULE_ID} | activation macro creation failed`, err);
            ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.ItemForge.MacroFailed"));
          }
        }
        ui.notifications.info(game.i18n.format("SIMPLYPF2E.ItemForge.Created", { name: item.name }));
        await item.sheet.render(true);
      } catch (err) {
        console.error(`${MODULE_ID} | created item presentation failed`, err);
        ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.ItemForge.CreatedPresentationFailed"));
      }
    } catch (err) {
      console.error(`${MODULE_ID} | item creation failed`, err);
      this.#error = err.message;
    } finally {
      this.#busy = false;
      await this.render();
    }
  }

  static async #onDiscard() {
    if (this.#busy) return;
    this.#readForm();
    this.#clearPreview();
    this.#error = null;
    this._tokenUsage = [];
    await this.render();
  }

  #clearPreview() {
    this.#concept = null;
    this.#itemData = null;
    this.#runedPreview = null;
  }
}
