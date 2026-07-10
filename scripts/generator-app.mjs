import { MODULE_ID, SETTINGS, getSetting } from "./settings.mjs";
import { generateConcept, selectSpells } from "./ai.mjs";
import { getSpellCandidates } from "./compendium.mjs";
import { normalizeConcept, resolveConcept, computeStats, createActor } from "./builder.mjs";
import {
  BUILT_IN_PRESETS, getCustomPresets, findPreset, addCustomPreset, deleteCustomPreset,
  examplePrompt, randomBrief, RANDOM_PRESET_ID
} from "./presets.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

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
      discard: GeneratorApp.#onDiscard,
      savePreset: GeneratorApp.#onSavePreset,
      deletePreset: GeneratorApp.#onDeletePreset,
      levelUp: GeneratorApp.#onLevelUp,
      levelDown: GeneratorApp.#onLevelDown
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/generator.hbs` }
  };

  /** Form values, kept across re-renders. */
  #input = { prompt: "", level: 1, rarity: "common", allowSpellcasting: true, preset: "" };
  #busy = false;
  #error = null;
  #concept = null;
  #resolved = null;
  #progress = null;
  /** Cycles the example placeholder; starts randomly so reopening varies. */
  #exampleTick = Math.floor(Math.random() * 5);

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
      promptPlaceholder: `${game.i18n.localize("SIMPLYPF2E.Generator.PromptExample")} ${examplePrompt(this.#input.preset, this.#exampleTick)}...`,
      randomSelected: this.#input.preset === RANDOM_PRESET_ID,
      presets: [
        { id: "", label: game.i18n.localize("SIMPLYPF2E.Presets.None"), selected: !this.#input.preset },
        { id: RANDOM_PRESET_ID, label: game.i18n.localize("SIMPLYPF2E.Presets.Random"), selected: this.#input.preset === RANDOM_PRESET_ID },
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
    // The textarea is hidden in Random mode; keep the last typed prompt then.
    const promptEl = form.querySelector('[name="prompt"]');
    const prompt = promptEl ? promptEl.value : this.#input.prompt;
    const level = Number(form.querySelector('[name="level"]')?.value ?? 1);
    const rarity = form.querySelector('[name="rarity"]')?.value ?? "common";
    const allowSpellcasting = form.querySelector('[name="allowSpellcasting"]')?.checked ?? true;
    const preset = form.querySelector('[name="preset"]')?.value ?? "";
    this.#input = { prompt, level, rarity, allowSpellcasting, preset };
  }

  /**
   * Re-render when the preset selection changes so the delete button, the
   * Random-mode form, and the cycling example placeholder all track it.
   */
  _onRender(context, options) {
    super._onRender?.(context, options);
    this.element.querySelector('select[name="preset"]')?.addEventListener("change", () => {
      this.#readForm();
      this.#exampleTick++;
      this.render();
    });
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
    input.value = Math.min(24, Math.max(-1, (Number.isNaN(current) ? 1 : current) + delta));
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
    const isRandom = this.#input.preset === RANDOM_PRESET_ID;
    if (!isRandom && !this.#input.prompt.trim()) {
      ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Errors.NoPrompt"));
      return;
    }
    this.#busy = true;
    this.#error = null;
    this.#beginProgress(this.#input.allowSpellcasting);
    try {
      await this.#setStep("concept");
      const raw = await generateConcept({
        // Random mode rolls a fresh local brief each generation, so
        // Regenerate gives a genuinely different creature every time.
        prompt: isRandom ? randomBrief() : this.#input.prompt,
        level: this.#input.level,
        rarity: this.#input.rarity,
        allowSpellcasting: this.#input.allowSpellcasting,
        preset: isRandom ? null : findPreset(this.#input.preset)?.prompt ?? null,
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

  /** Dialog to save a new custom preset (name + guidance text). */
  static async #onSavePreset() {
    this.#readForm();
    const content = `
      <div class="form-group">
        <label>${game.i18n.localize("SIMPLYPF2E.Presets.DialogName")}</label>
        <input type="text" name="presetName" required placeholder="${game.i18n.localize("SIMPLYPF2E.Presets.DialogNamePlaceholder")}">
      </div>
      <div class="form-group stacked">
        <label>${game.i18n.localize("SIMPLYPF2E.Presets.DialogGuidance")}</label>
        <textarea name="presetPrompt" rows="6" placeholder="${game.i18n.localize("SIMPLYPF2E.Presets.DialogGuidancePlaceholder")}"></textarea>
      </div>`;
    const result = await DialogV2.prompt({
      window: { title: "SIMPLYPF2E.Presets.DialogTitle", icon: "fa-solid fa-bookmark" },
      position: { width: 480 },
      content,
      ok: {
        label: "SIMPLYPF2E.Presets.DialogSave",
        icon: "fa-solid fa-floppy-disk",
        callback: (_event, button) => ({
          name: button.form.elements.presetName.value.trim(),
          prompt: button.form.elements.presetPrompt.value.trim()
        })
      },
      rejectClose: false
    });
    if (!result?.name || !result?.prompt) return;
    const preset = await addCustomPreset(result.name, result.prompt);
    this.#input.preset = preset.id;
    ui.notifications.info(game.i18n.format("SIMPLYPF2E.Presets.Saved", { name: preset.name }));
    await this.render();
  }

  /** Delete the currently selected custom preset (after confirmation). */
  static async #onDeletePreset() {
    this.#readForm();
    const preset = findPreset(this.#input.preset);
    if (!preset?.custom) return;
    const confirmed = await DialogV2.confirm({
      window: { title: "SIMPLYPF2E.Presets.DeleteTitle" },
      content: `<p>${game.i18n.format("SIMPLYPF2E.Presets.DeleteConfirm", { name: preset.name })}</p>`,
      rejectClose: false
    });
    if (!confirmed) return;
    await deleteCustomPreset(preset.id);
    this.#input.preset = "";
    ui.notifications.info(game.i18n.format("SIMPLYPF2E.Presets.Deleted", { name: preset.name }));
    await this.render();
  }
}
