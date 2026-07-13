import { MODULE_ID, SETTINGS, getSetting } from "./settings.mjs";
import { generateMagicItemConcept, generateRunedItemConcept } from "./ai.mjs";
import { availableEffectKinds, EFFECT_KINDS } from "./rule-templates.mjs";
import {
  normalizeMagicItemConcept, buildMagicItemData, priceForLevel, getUsageOptions, describeEffect,
  describeActivation, MIN_ITEM_LEVEL, MAX_ITEM_LEVEL,
  getBaseItemCandidates, getPropertyRuneCandidates, getFundamentalRuneTiers,
  normalizeRunedItemConcept, buildRunedItemData, SECONDARY_ADJECTIVE, RUNED_ITEM_KINDS
} from "./item-builder.mjs";
import { createActivationMacro } from "./macro-templates.mjs";
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
      icon: "fa-solid fa-ring",
      resizable: true
    },
    position: { width: 620, height: "auto" },
    actions: {
      generate: ItemForgeApp.#onGenerate,
      createItem: ItemForgeApp.#onCreateItem,
      discard: ItemForgeApp.#onDiscard,
      levelUp: ItemForgeApp.#onLevelUp,
      levelDown: ItemForgeApp.#onLevelDown
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
  /** Effect kinds with no real exemplar in this world (set after first scan). */
  #unavailableKinds = null;

  async _prepareContext() {
    return {
      input: this.#input,
      busy: this.#busy,
      error: this.#error,
      progress: this._progress,
      hasApiKey: Boolean(getSetting(SETTINGS.apiKey)),
      model: getSetting(SETTINGS.model),
      minLevel: MIN_ITEM_LEVEL,
      maxLevel: MAX_ITEM_LEVEL,
      kinds: [
        { value: "wondrous", label: "SIMPLYPF2E.ItemForge.KindWondrous" },
        { value: "weapon", label: "SIMPLYPF2E.ItemForge.KindWeapon" },
        { value: "armor", label: "SIMPLYPF2E.ItemForge.KindArmor" }
      ],
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
      tokenReport: this._buildTokenReport()
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
    const level = Math.min(MAX_ITEM_LEVEL, Math.max(MIN_ITEM_LEVEL,
      Number(form.querySelector('[name="level"]')?.value ?? this.#input.level)));
    const rarity = form.querySelector('[name="rarity"]')?.value ?? "common";
    const rawKind = form.querySelector('[name="kind"]')?.value ?? this.#input.kind;
    const kind = rawKind === "wondrous" || RUNED_ITEM_KINDS.has(rawKind) ? rawKind : "wondrous";
    this.#input = { prompt, level, rarity, kind };
  }

  /** Preview context for a runed weapon/armor concept (built from #itemData). */
  #buildRunedPreviewContext() {
    if (!this.#itemData) return null;
    const data = this.#itemData;
    const runes = data.system.runes ?? {};
    const secondaryField = this.#kind === "weapon" ? "striking" : "resilient";
    const secondaryTier = runes[secondaryField] ?? 0;
    return {
      concept: { name: data.name, level: data.system.level.value, description: this.#concept?.description ?? "" },
      traits: [data.system.traits.rarity !== "common" ? data.system.traits.rarity : null, ...data.system.traits.value].filter(Boolean),
      price: `${(data.system.price.value.gp ?? 0).toLocaleString()} gp`,
      runed: true,
      potency: runes.potency ?? 0,
      secondary: secondaryTier ? SECONDARY_ADJECTIVE[this.#kind][secondaryTier] : null,
      propertyRunes: this.#concept?.propertyRunes ?? []
    };
  }

  static #onLevelUp() {
    this.#stepLevel(1);
  }

  static #onLevelDown() {
    this.#stepLevel(-1);
  }

  #stepLevel(delta) {
    const input = this.element.querySelector('input[name="level"]');
    if (!input) return;
    const current = Number.parseInt(input.value, 10);
    input.value = Math.min(MAX_ITEM_LEVEL, Math.max(MIN_ITEM_LEVEL, (Number.isNaN(current) ? 4 : current) + delta));
  }

  static async #onGenerate() {
    this.#readForm();
    if (!this.#input.prompt.trim()) {
      ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.ItemForge.NoPrompt"));
      return;
    }
    this.#busy = true;
    this.#error = null;
    this._tokenUsage = [];
    this.#kind = this.#input.kind;
    if (this.#kind === "wondrous") await this.#generateWondrous();
    else await this.#generateRuned(this.#kind);
  }

  async #generateWondrous() {
    this._beginProgress([
      ["templates", game.i18n.localize("SIMPLYPF2E.ItemForge.ProgressTemplates")],
      ["concept", game.i18n.localize("SIMPLYPF2E.ItemForge.ProgressConcept")],
      ["assemble", game.i18n.localize("SIMPLYPF2E.ItemForge.ProgressAssemble")]
    ]);
    try {
      // 1. Ground truth first: which effect kinds have real rule exemplars
      // in this world's compendiums? Only those are offered to the AI.
      await this._setStep("templates");
      const availableKinds = await availableEffectKinds();
      this.#unavailableKinds = EFFECT_KINDS.filter((k) => !availableKinds.includes(k));
      if (!availableKinds.length) {
        throw new Error(game.i18n.localize("SIMPLYPF2E.ItemForge.NoExemplars"));
      }
      const usageOptions = await getUsageOptions();

      // 2. One AI call, constrained to the available kinds and real usages.
      await this._setStep("concept");
      const { concept: raw, usage } = await generateMagicItemConcept({
        prompt: this.#input.prompt,
        level: this.#input.level,
        rarity: this.#input.rarity,
        availableKinds,
        usageOptions,
        onProgress: (p) => this._onAIProgress(p)
      });
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.ItemForge.ProgressConcept"), usage);

      // 3. Normalize defensively and price from the empirical benchmark.
      await this._setStep("assemble");
      this.#itemData = null;
      this.#concept = normalizeMagicItemConcept(raw, {
        level: this.#input.level,
        rarity: this.#input.rarity,
        availableKinds,
        usageOptions
      });
      this.#price = await priceForLevel(this.#concept.level, this.#concept.rarity);
      console.log(`${MODULE_ID} | token usage`, this._tokenUsage);
    } catch (err) {
      console.error(`${MODULE_ID} | item generation failed`, err);
      this.#error = err.message;
      this.#concept = null;
    } finally {
      this.#busy = false;
      this._progress = null;
      await this.render();
    }
  }

  /**
   * Generate a runed weapon/armor (item forge Phase 3). Every choice the AI
   * makes is picked from real compendium candidates harvested up front, and
   * the final name/price/level are all resolved from those real component
   * documents at generation time — see item-builder.mjs's buildRunedItemData.
   */
  async #generateRuned(kind) {
    this._beginProgress([
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
        onProgress: (p) => this._onAIProgress(p)
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
      this.#itemData = await buildRunedItemData(this.#concept);
      console.log(`${MODULE_ID} | token usage`, this._tokenUsage);
    } catch (err) {
      console.error(`${MODULE_ID} | runed item generation failed`, err);
      this.#error = err.message;
      this.#concept = null;
      this.#itemData = null;
    } finally {
      this.#busy = false;
      this._progress = null;
      await this.render();
    }
  }

  static async #onCreateItem() {
    if (this.#busy) return;
    if (this.#kind === "wondrous" ? !this.#concept : !this.#itemData) return;
    this.#busy = true;
    await this.render();
    try {
      if (this.#kind === "wondrous") {
        const data = await buildMagicItemData(this.#concept);
        const item = await Item.create(data);
        // Activated items get a companion click-to-run macro filed in a
        // dedicated folder; a macro failure must not lose the created item.
        if (this.#concept.activation) {
          try {
            await createActivationMacro({ item, concept: this.#concept });
          } catch (err) {
            console.error(`${MODULE_ID} | activation macro creation failed`, err);
            ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.ItemForge.MacroFailed"));
          }
        }
        ui.notifications.info(game.i18n.format("SIMPLYPF2E.ItemForge.Created", { name: item.name }));
        item.sheet.render(true);
      } else {
        // Runed weapons/armor have no activation step — #itemData was fully
        // resolved (name/price/level/runes) back at generation time.
        const item = await Item.create(this.#itemData);
        ui.notifications.info(game.i18n.format("SIMPLYPF2E.ItemForge.Created", { name: item.name }));
        item.sheet.render(true);
      }
      this.#concept = null;
      this.#itemData = null;
    } catch (err) {
      console.error(`${MODULE_ID} | item creation failed`, err);
      this.#error = err.message;
    } finally {
      this.#busy = false;
      await this.render();
    }
  }

  static async #onDiscard() {
    this.#readForm();
    this.#concept = null;
    this.#itemData = null;
    this.#error = null;
    this._tokenUsage = [];
    await this.render();
  }
}
