import { MODULE_ID, SETTINGS, getSetting } from "./settings.mjs";
import { generateConcept, generateLoot, selectSpells, designEncounter } from "./ai.mjs";
import { getSpellCandidates } from "./compendium.mjs";
import { normalizeConcept, normalizeLoot, resolveConcept, resolveLoot, computeStats, createActor } from "./builder.mjs";
import {
  BUILT_IN_PRESETS, getCustomPresets, findPreset, addCustomPreset, deleteCustomPreset,
  examplePrompt, randomBrief
} from "./presets.mjs";
import { composeEncounter, THREATS } from "./encounter.mjs";
import { resolveArt } from "./art.mjs";

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
      generateRandom: GeneratorApp.#onGenerateRandom,
      createActor: GeneratorApp.#onCreateActor,
      discard: GeneratorApp.#onDiscard,
      savePreset: GeneratorApp.#onSavePreset,
      deletePreset: GeneratorApp.#onDeletePreset,
      levelUp: GeneratorApp.#onLevelUp,
      levelDown: GeneratorApp.#onLevelDown,
      memberUp: GeneratorApp.#onMemberUp,
      memberDown: GeneratorApp.#onMemberDown,
      rerollLoot: GeneratorApp.#onRerollLoot
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/generator.hbs` }
  };

  /** Form values, kept across re-renders. */
  #input = {
    mode: "single", prompt: "", level: 1, rarity: "common",
    allowSpellcasting: true, preset: "", partySize: 4, threat: "moderate"
  };
  #busy = false;
  #error = null;
  #concept = null;
  #resolved = null;
  /** Encounter mode result: {name, budget, spent, members: [...]}. */
  #encounter = null;
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
      encounterMode: this.#input.mode === "encounter",
      threats: Object.keys(THREATS).map((key) => ({
        value: key,
        label: `SIMPLYPF2E.Threat.${key.charAt(0).toUpperCase()}${key.slice(1)}`,
        selected: this.#input.threat === key
      })),
      preview: this.#buildPreviewContext(),
      encounterPreview: this.#buildEncounterPreviewContext()
    };
  }

  #buildEncounterPreviewContext() {
    if (!this.#encounter) return null;
    return {
      name: this.#encounter.name,
      budget: this.#encounter.budget,
      spent: this.#encounter.spent,
      overBudget: this.#encounter.spent > this.#encounter.budget,
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
          statline: `AC ${stats.ac}, HP ${stats.hp}, Per +${stats.perception}`
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
      equipment: (this.#resolved?.equipment ?? []).map(({ name, quantity, runes, entry }) => ({
        name: (runes?.potency ? name : entry?.name ?? name) + (quantity > 1 ? ` ×${quantity}` : ""),
        found: Boolean(entry)
      })),
      loot: (this.#resolved?.loot ?? []).map(({ name, quantity, runes, entry, scroll }) => ({
        name: (scroll && entry
          ? `Scroll of ${entry.name} (Rank ${scroll.rank})`
          : (runes?.potency ? name : entry?.name ?? name)) + (quantity > 1 ? ` ×${quantity}` : ""),
        found: Boolean(entry)
      })),
      missingSpells,
      missingEquipment,
      missingLoot: (this.#resolved?.loot ?? []).filter((l) => !l.entry).map((l) => l.name),
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
    const mode = form.querySelector('[name="mode"]:checked')?.value ?? this.#input.mode;
    const partySize = Math.min(8, Math.max(1, Number(form.querySelector('[name="partySize"]')?.value ?? 4)));
    const threat = form.querySelector('[name="threat"]')?.value ?? this.#input.threat;
    this.#input = { mode, prompt, level, rarity, allowSpellcasting, preset, partySize, threat };
  }

  /**
   * Re-render when the preset or mode changes so the delete button, the
   * Random/Encounter forms, and the cycling example placeholder track them.
   */
  _onRender(context, options) {
    super._onRender?.(context, options);
    this.element.querySelector('select[name="preset"]')?.addEventListener("change", () => {
      this.#readForm();
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

  static #onLevelDown() {
    this.#stepLevel(-1);
  }

  static async #onMemberUp(_event, target) {
    await this.#stepMemberCount(Number(target.dataset.index), 1);
  }

  static async #onMemberDown(_event, target) {
    await this.#stepMemberCount(Number(target.dataset.index), -1);
  }

  /** Adjust an encounter member's count (0 = skip it) and refresh XP math. */
  async #stepMemberCount(index, delta) {
    const member = this.#encounter?.members?.[index];
    if (!member) return;
    member.count = Math.min(8, Math.max(0, member.count + delta));
    this.#encounter.spent = this.#encounter.members.reduce((sum, m) => sum + m.count * m.xpEach, 0);
    await this.render();
  }

  #stepLevel(delta) {
    const input = this.element.querySelector('input[name="level"]');
    if (!input) return;
    const current = Number.parseInt(input.value, 10);
    input.value = Math.min(24, Math.max(-1, (Number.isNaN(current) ? 1 : current) + delta));
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
    return this.#runGeneration(false);
  }

  /** The dice button: same pipeline, module-rolled surprise brief as prompt. */
  static async #onGenerateRandom() {
    return this.#runGeneration(true);
  }

  async #runGeneration(isRandom) {
    this.#readForm();
    if (this.#input.mode === "encounter") return this.#generateEncounter();
    if (!isRandom && !this.#input.prompt.trim()) {
      ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Errors.NoPrompt"));
      return;
    }
    this.#busy = true;
    this.#error = null;
    this.#encounter = null;
    this.#beginProgress([
      ["concept", game.i18n.localize("SIMPLYPF2E.Progress.Concept")],
      ...(this.#input.allowSpellcasting ? [["spells", game.i18n.localize("SIMPLYPF2E.Progress.Spells")]] : []),
      ["match", game.i18n.localize("SIMPLYPF2E.Progress.Match")]
    ]);
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
      await this.#refineSpells(this.#concept);
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
   * Encounter mode: the module fixes the composition to the XP budget, the
   * AI names the encounter and briefs each slot, then every member runs
   * through the normal single-creature pipeline.
   */
  async #generateEncounter() {
    this.#busy = true;
    this.#error = null;
    this.#concept = null;
    this.#resolved = null;
    const { level: partyLevel, partySize, threat } = this.#input;
    const composition = composeEncounter(threat, partySize, partyLevel);
    const memberLabel = (i) => game.i18n.format("SIMPLYPF2E.Progress.Member", {
      index: i + 1, total: composition.members.length
    });
    this.#beginProgress([
      ["design", game.i18n.localize("SIMPLYPF2E.Progress.Design")],
      ...composition.members.map((_, i) => [`member${i}`, memberLabel(i)]),
      ["match", game.i18n.localize("SIMPLYPF2E.Progress.Match")]
    ]);
    try {
      await this.#setStep("design");
      const theme = this.#input.prompt.trim() || randomBrief();
      const design = await designEncounter({
        theme,
        partyLevel,
        slots: composition.members,
        onProgress: (p) => this.#onAIProgress(p)
      });

      const members = [];
      for (let i = 0; i < composition.members.length; i++) {
        const slot = composition.members[i];
        await this.#setStep(`member${i}`);
        const raw = await generateConcept({
          prompt: `${design.briefs[i]} (Part of the encounter "${design.name}": ${theme})`,
          level: slot.level,
          rarity: "common",
          allowSpellcasting: this.#input.allowSpellcasting,
          preset: null,
          onProgress: (p) => this.#onAIProgress(p)
        });
        const concept = normalizeConcept(raw, { level: slot.level, rarity: "common" });
        await this.#refineSpells(concept);
        members.push({ ...slot, concept });
      }

      await this.#setStep("match");
      for (const member of members) {
        member.resolved = await resolveConcept(member.concept);
      }
      this.#encounter = {
        name: design.name,
        budget: composition.budget,
        spent: composition.spent,
        members
      };
    } catch (err) {
      console.error(`${MODULE_ID} | encounter generation failed`, err);
      this.#error = err.message;
      this.#encounter = null;
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
  async #refineSpells(concept) {
    const spellcasting = concept?.spellcasting;
    if (!spellcasting) return;
    try {
      const candidates = await getSpellCandidates(spellcasting.tradition, spellcasting.maxRank);
      if (candidates.length) {
        const spells = await selectSpells({
          concept,
          candidates,
          maxRank: spellcasting.maxRank,
          onProgress: (p) => this.#onAIProgress(p)
        });
        if (spells.length) spellcasting.spells = spells;
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | grounded spell selection failed, using first-draft spells`, err);
    }
    if (!spellcasting.spells.length) concept.spellcasting = null;
  }

  static async #onCreateActor() {
    if (this.#busy) return;
    if (this.#input.mode === "encounter" || this.#encounter) return this.#createEncounterActors();
    if (!this.#concept) return;
    this.#busy = true;
    await this.render();
    try {
      // Portrait: AI-generated when an image model is configured, otherwise
      // borrowed from the closest bestiary creature.
      const img = await resolveArt(this.#concept);
      const actor = await createActor(this.#concept, this.#resolved, { img });
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

  /** Create every encounter member (bestiary art only — no per-member image calls). */
  async #createEncounterActors() {
    if (!this.#encounter) return;
    this.#busy = true;
    await this.render();
    try {
      const folder = await Folder.create({ name: this.#encounter.name, type: "Actor" });
      let created = 0;
      for (const member of this.#encounter.members) {
        if (member.count < 1) continue;
        const img = await resolveArt(member.concept, { allowGeneration: false });
        const actor = await createActor(member.concept, member.resolved, { img });
        await actor.update({ folder: folder.id });
        created++;
      }
      ui.notifications.info(game.i18n.format("SIMPLYPF2E.Generator.CreatedAll", {
        count: created, name: this.#encounter.name
      }));
      this.#encounter = null;
    } catch (err) {
      console.error(`${MODULE_ID} | encounter creation failed`, err);
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
    await this.render();
    try {
      const lootResult = await generateLoot({
        concept: this.#concept,
        onProgress: (p) => this.#onAIProgress(p)
      });
      this.#concept.loot = normalizeLoot(lootResult.loot);
      this.#resolved.loot = await resolveLoot(this.#concept);
    } catch (err) {
      console.error(`${MODULE_ID} | loot reroll failed`, err);
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
    this.#encounter = null;
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
