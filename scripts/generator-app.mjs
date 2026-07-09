import { MODULE_ID, SETTINGS, getSetting } from "./settings.mjs";
import { generateConcept } from "./ai.mjs";
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

  async _prepareContext() {
    return {
      input: this.#input,
      busy: this.#busy,
      error: this.#error,
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

  static async #onGenerate() {
    this.#readForm();
    if (!this.#input.prompt.trim()) {
      ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Errors.NoPrompt"));
      return;
    }
    this.#busy = true;
    this.#error = null;
    await this.render();
    try {
      const raw = await generateConcept({
        prompt: this.#input.prompt,
        level: this.#input.level,
        rarity: this.#input.rarity,
        allowSpellcasting: this.#input.allowSpellcasting
      });
      this.#concept = normalizeConcept(raw, { level: this.#input.level, rarity: this.#input.rarity });
      this.#resolved = await resolveConcept(this.#concept);
    } catch (err) {
      console.error(`${MODULE_ID} | generation failed`, err);
      this.#error = err.message;
      this.#concept = null;
      this.#resolved = null;
    } finally {
      this.#busy = false;
      await this.render();
    }
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
