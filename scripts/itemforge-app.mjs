import { MODULE_ID, SETTINGS, getSetting } from "./settings.mjs";
import { generateMagicItemConcept } from "./ai.mjs";
import { availableEffectKinds, EFFECT_KINDS } from "./rule-templates.mjs";
import {
  normalizeMagicItemConcept, buildMagicItemData, priceForLevel, getUsageOptions, describeEffect,
  MIN_ITEM_LEVEL, MAX_ITEM_LEVEL
} from "./item-builder.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The item forge: describe a wondrous magic item → AI concept constrained to
 * effect kinds this world has real rule exemplars for → preview → create a
 * real Item document whose Rule Elements are clones of published rules
 * (see rule-templates.mjs for the grounding principle).
 */
export class ItemForgeApp extends HandlebarsApplicationMixin(ApplicationV2) {
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

  /** Form values, kept across re-renders. */
  #input = { prompt: "", level: 4, rarity: "common" };
  #busy = false;
  #error = null;
  #concept = null;
  /** Benchmark price for the current concept (computed at preview time). */
  #price = 0;
  /** Effect kinds with no real exemplar in this world (set after first scan). */
  #unavailableKinds = null;
  #progress = null;
  /** Exact token usage per AI call of the last generation: [{label, usage}]. */
  #tokenUsage = [];

  async _prepareContext() {
    return {
      input: this.#input,
      busy: this.#busy,
      error: this.#error,
      progress: this.#progress,
      hasApiKey: Boolean(getSetting(SETTINGS.apiKey)),
      model: getSetting(SETTINGS.model),
      minLevel: MIN_ITEM_LEVEL,
      maxLevel: MAX_ITEM_LEVEL,
      rarities: [
        { value: "common", label: "SIMPLYPF2E.Rarity.Common" },
        { value: "uncommon", label: "SIMPLYPF2E.Rarity.Uncommon" },
        { value: "rare", label: "SIMPLYPF2E.Rarity.Rare" },
        { value: "unique", label: "SIMPLYPF2E.Rarity.Unique" }
      ],
      unavailableNote: this.#unavailableKinds?.length
        ? game.i18n.format("SIMPLYPF2E.ItemForge.KindsUnavailable", { kinds: this.#unavailableKinds.join(", ") })
        : null,
      preview: this.#buildPreviewContext(),
      tokenReport: this.#buildTokenReport()
    };
  }

  /** Record one AI call's token usage under a step label. */
  #recordTokens(label, usage) {
    if (usage) this.#tokenUsage.push({ label, usage });
  }

  /** Per-step token usage lines plus a total, ready for the template. */
  #buildTokenReport() {
    if (!this.#tokenUsage.length) return null;
    const total = this.#tokenUsage.reduce((sum, e) => sum + (e.usage.total || 0), 0);
    const anyEstimated = this.#tokenUsage.some((e) => e.usage.estimated);
    return {
      steps: this.#tokenUsage.map(({ label, usage }) => ({
        label,
        text: usage.estimated
          ? game.i18n.format("SIMPLYPF2E.Tokens.StepEstimated", { total: usage.total.toLocaleString() })
          : game.i18n.format("SIMPLYPF2E.Tokens.Step", {
              prompt: usage.prompt.toLocaleString(),
              completion: usage.completion.toLocaleString(),
              total: usage.total.toLocaleString()
            })
      })),
      totalText: game.i18n.format(
        anyEstimated ? "SIMPLYPF2E.Tokens.TotalEstimated" : "SIMPLYPF2E.Tokens.Total",
        { total: total.toLocaleString() }
      )
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
      hasEffects: concept.effects.length > 0
    };
  }

  /** Read the current form inputs into #input. */
  #readForm() {
    const form = this.element;
    const prompt = form.querySelector('[name="prompt"]')?.value ?? this.#input.prompt;
    const level = Math.min(MAX_ITEM_LEVEL, Math.max(MIN_ITEM_LEVEL,
      Number(form.querySelector('[name="level"]')?.value ?? this.#input.level)));
    const rarity = form.querySelector('[name="rarity"]')?.value ?? "common";
    this.#input = { prompt, level, rarity };
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

  /** Initialize the step list shown while generating. */
  #beginProgress(defs) {
    this.#progress = {
      steps: defs.map(([key, label]) => ({ key, label, state: "pending" })),
      detail: "",
      percent: 0
    };
  }

  /** Mark `key` active, everything before it done, and re-render. */
  async #setStep(key) {
    const progress = this.#progress;
    if (!progress) return;
    let reached = false;
    for (const step of progress.steps) {
      if (step.key === key) {
        step.state = "active";
        reached = true;
      } else {
        step.state = reached ? "pending" : "done";
      }
    }
    const done = progress.steps.filter((s) => s.state === "done").length;
    progress.percent = Math.round(((done + 0.5) / progress.steps.length) * 100);
    progress.detail = "";
    await this.render();
  }

  /**
   * Streaming callback: updates the detail line directly in the DOM so the
   * counter ticks live without re-rendering the whole application.
   */
  #onAIProgress({ phase, tokens }) {
    const progress = this.#progress;
    if (!progress) return;
    progress.detail = game.i18n.format(
      phase === "thinking" ? "SIMPLYPF2E.Progress.Thinking" : "SIMPLYPF2E.Progress.Writing",
      { tokens: tokens.toLocaleString() }
    );
    const el = this.element?.querySelector(".spf-progress-detail");
    if (el) el.textContent = progress.detail;
  }

  static async #onGenerate() {
    this.#readForm();
    if (!this.#input.prompt.trim()) {
      ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.ItemForge.NoPrompt"));
      return;
    }
    this.#busy = true;
    this.#error = null;
    this.#tokenUsage = [];
    this.#beginProgress([
      ["templates", game.i18n.localize("SIMPLYPF2E.ItemForge.ProgressTemplates")],
      ["concept", game.i18n.localize("SIMPLYPF2E.ItemForge.ProgressConcept")],
      ["assemble", game.i18n.localize("SIMPLYPF2E.ItemForge.ProgressAssemble")]
    ]);
    try {
      // 1. Ground truth first: which effect kinds have real rule exemplars
      // in this world's compendiums? Only those are offered to the AI.
      await this.#setStep("templates");
      const availableKinds = await availableEffectKinds();
      this.#unavailableKinds = EFFECT_KINDS.filter((k) => !availableKinds.includes(k));
      if (!availableKinds.length) {
        throw new Error(game.i18n.localize("SIMPLYPF2E.ItemForge.NoExemplars"));
      }
      const usageOptions = await getUsageOptions();

      // 2. One AI call, constrained to the available kinds and real usages.
      await this.#setStep("concept");
      const { concept: raw, usage } = await generateMagicItemConcept({
        prompt: this.#input.prompt,
        level: this.#input.level,
        rarity: this.#input.rarity,
        availableKinds,
        usageOptions,
        onProgress: (p) => this.#onAIProgress(p)
      });
      this.#recordTokens(game.i18n.localize("SIMPLYPF2E.ItemForge.ProgressConcept"), usage);

      // 3. Normalize defensively and price from the empirical benchmark.
      await this.#setStep("assemble");
      this.#concept = normalizeMagicItemConcept(raw, {
        level: this.#input.level,
        rarity: this.#input.rarity,
        availableKinds,
        usageOptions
      });
      this.#price = await priceForLevel(this.#concept.level, this.#concept.rarity);
      console.log(`${MODULE_ID} | token usage`, this.#tokenUsage);
    } catch (err) {
      console.error(`${MODULE_ID} | item generation failed`, err);
      this.#error = err.message;
      this.#concept = null;
    } finally {
      this.#busy = false;
      this.#progress = null;
      await this.render();
    }
  }

  static async #onCreateItem() {
    if (this.#busy || !this.#concept) return;
    this.#busy = true;
    await this.render();
    try {
      const data = await buildMagicItemData(this.#concept);
      const item = await Item.create(data);
      ui.notifications.info(game.i18n.format("SIMPLYPF2E.ItemForge.Created", { name: item.name }));
      item.sheet.render(true);
      this.#concept = null;
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
    this.#error = null;
    this.#tokenUsage = [];
    await this.render();
  }
}
