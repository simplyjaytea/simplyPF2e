import { MODULE_ID, SETTINGS, getSetting } from "./settings.mjs";
import { generateConcept, selectSpells } from "./ai.mjs";
import { getSpellCandidates } from "./compendium.mjs";
import { normalizeConcept, resolveConcept, computeStats, createActor } from "./builder.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The prompt → preview → create dialog.
 */
export class GeneratorApp extends HandlebarsApplicationMixin(ApplicationV2) {
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
      createActor: GeneratorApp.#onCreateActor,
      discard: GeneratorApp.#onDiscard
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/generator.hbs` }
  };

  /** Form values, kept across re-renders. */
  #input = { prompt: "", level: 1, rarity: "common", allowSpellcasting: true };
  #busy = false;
  #error = null;
  #concept = null;
  #resolved = null;
  #progress = null;

  async _prepareContext() {
    return {
      input: this.#input,
      busy: this.#busy,
      error: this.#error,
      progress: this.#progress,
      hasApiKey: Boolean(getSetting(SETTINGS.apiKey)),
      model: getSetting(SETTINGS.model),
      rarities: [
        { value: "common", label: "SIMPLYPF2E.Rarity.Common" },
        { value: "uncommon", label: "SIMPLYPF2E.Rarity.Uncommon" },
        { value: "rare", label: "SIMPLYPF2E.Rarity.Rare" },
        { value: "unique", label: "SIMPLYPF2E.Rarity.Unique" }
      ],
      preview: this.#buildPreviewContext()
    };
  }

  #buildPreviewContext() {
    if (!this.#concept) return null;
    const concept = this.#concept;
    const stats = computeStats(concept);
    const missingSpells = (this.#resolved?.spells ?? []).filter((s) => !s.entry).map((s) => s.spell.name);
    const missingEquipment = (this.#resolved?.equipment ?? []).filter((e) => !e.entry).map((e) => e.name);
    return {
      concept,
      stats,
      traits: [concept.rarity !== "common" ? concept.rarity : null, concept.size, ...concept.traits].filter(Boolean),
      speeds: concept.speeds.map((s) => `${s.type} ${s.value} ft.`).join(", "),
      senses: concept.senses.map((s) => [s.type, s.acuity, s.range ? `${s.range} ft.` : null].filter(Boolean).join(" ")).join(", "),
      languages: concept.languages.join(", "),
      abilities: (this.#resolved?.abilities ?? []).map(({ ability, entry }) => ({
        name: ability.name,
        fromGlossary: Boolean(entry),
        glossaryName: entry?.name ?? null,
        description: ability.description
      })),
      spells: (this.#resolved?.spells ?? []).map(({ spell, entry }) => ({
        name: entry?.name ?? spell.name,
        rank: spell.rank,
        found: Boolean(entry)
      })),
      feats: (this.#resolved?.feats ?? []).map(({ name, entry }) => ({
        name: entry?.name ?? name,
        found: Boolean(entry)
      })),
      equipment: (this.#resolved?.equipment ?? []).map(({ name, entry }) => ({
        name: entry?.name ?? name,
        found: Boolean(entry)
      })),
      missingSpells,
      missingEquipment,
      iwr: {
        immunities: concept.immunities.join(", "),
        resistances: concept.resistances.map((r) => `${r} ${stats.resistanceValue}`).join(", "),
        weaknesses: concept.weaknesses.map((w) => `${w} ${stats.resistanceValue}`).join(", ")
      }
    };
  }

  /** Read the current form inputs into #input. */
  #readForm() {
    const form = this.element;
    const prompt = form.querySelector('[name="prompt"]')?.value ?? "";
    const level = Number(form.querySelector('[name="level"]')?.value ?? 1);
    const rarity = form.querySelector('[name="rarity"]')?.value ?? "common";
    const allowSpellcasting = form.querySelector('[name="allowSpellcasting"]')?.checked ?? true;
    this.#input = { prompt, level, rarity, allowSpellcasting };
  }

  /** Initialize the step list shown while generating. */
  #beginProgress(includeSpells) {
    const defs = [
      ["concept", "SIMPLYPF2E.Progress.Concept"],
      ...(includeSpells ? [["spells", "SIMPLYPF2E.Progress.Spells"]] : []),
      ["match", "SIMPLYPF2E.Progress.Match"]
    ];
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
  #onAIProgress({ phase, chars }) {
    const progress = this.#progress;
    if (!progress) return;
    progress.detail = game.i18n.format(
      phase === "thinking" ? "SIMPLYPF2E.Progress.Thinking" : "SIMPLYPF2E.Progress.Writing",
      { chars: chars.toLocaleString() }
    );
    const el = this.element?.querySelector(".spf-progress-detail");
    if (el) el.textContent = progress.detail;
  }

  static async #onGenerate() {
    this.#readForm();
    if (!this.#input.prompt.trim()) {
      ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Errors.NoPrompt"));
      return;
    }
    this.#busy = true;
    this.#error = null;
    this.#beginProgress(this.#input.allowSpellcasting);
    try {
      await this.#setStep("concept");
      const raw = await generateConcept({
        prompt: this.#input.prompt,
        level: this.#input.level,
        rarity: this.#input.rarity,
        allowSpellcasting: this.#input.allowSpellcasting,
        onProgress: (p) => this.#onAIProgress(p)
      });
      this.#concept = normalizeConcept(raw, { level: this.#input.level, rarity: this.#input.rarity });
      if (this.#concept.spellcasting) await this.#setStep("spells");
      await this.#refineSpells();
      await this.#setStep("match");
      this.#resolved = await resolveConcept(this.#concept);
    } catch (err) {
      console.error(`${MODULE_ID} | generation failed`, err);
      this.#error = err.message;
      this.#concept = null;
      this.#resolved = null;
    } finally {
      this.#busy = false;
      this.#progress = null;
      await this.render();
    }
  }

  /**
   * Grounded spell selection: fetch the real spell list for the chosen
   * tradition from the compendium and let the AI pick from it. Falls back to
   * the first-draft spell names (still fuzzy-matched) if the pass fails.
   */
  async #refineSpells() {
    const spellcasting = this.#concept?.spellcasting;
    if (!spellcasting) return;
    try {
      const candidates = await getSpellCandidates(spellcasting.tradition, spellcasting.maxRank);
      if (candidates.length) {
        const spells = await selectSpells({
          concept: this.#concept,
          candidates,
          maxRank: spellcasting.maxRank,
          onProgress: (p) => this.#onAIProgress(p)
        });
        if (spells.length) spellcasting.spells = spells;
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | grounded spell selection failed, using first-draft spells`, err);
    }
    if (!spellcasting.spells.length) this.#concept.spellcasting = null;
  }

  static async #onCreateActor() {
    if (!this.#concept || this.#busy) return;
    this.#busy = true;
    await this.render();
    try {
      const actor = await createActor(this.#concept, this.#resolved);
      ui.notifications.info(game.i18n.format("SIMPLYPF2E.Generator.Created", { name: actor.name }));
      actor.sheet.render(true);
      this.#concept = null;
      this.#resolved = null;
    } catch (err) {
      console.error(`${MODULE_ID} | actor creation failed`, err);
      this.#error = err.message;
    } finally {
      this.#busy = false;
      await this.render();
    }
  }

  static async #onDiscard() {
    this.#readForm();
    this.#concept = null;
    this.#resolved = null;
    this.#error = null;
    await this.render();
  }
}
