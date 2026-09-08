import { MODULE_ID, SETTINGS, getSetting } from "./settings.mjs";
import { CATEGORIES, DEFAULT_PACKS, detectAvailablePacks } from "./compendium.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const CATEGORY_LABELS = {
  abilities: "SIMPLYPF2E.Sources.Abilities",
  spells: "SIMPLYPF2E.Sources.Spells",
  feats: "SIMPLYPF2E.Sources.Feats",
  equipment: "SIMPLYPF2E.Sources.Equipment",
  ancestries: "SIMPLYPF2E.Sources.Ancestries",
  backgrounds: "SIMPLYPF2E.Sources.Backgrounds",
  classes: "SIMPLYPF2E.Sources.Classes",
  classFeatures: "SIMPLYPF2E.Sources.ClassFeatures",
  heritages: "SIMPLYPF2E.Sources.Heritages",
  bestiaryActors: "SIMPLYPF2E.Sources.BestiaryActors"
};

/**
 * Settings menu: scan the world's Item compendiums and let the GM choose
 * which packs each category (abilities, spells, feats, equipment) may draw
 * from. Empty selection for a category falls back to the system defaults.
 */
export class SourcesConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
  #onSave;
  #feedback = null;

  static DEFAULT_OPTIONS = {
    id: "simplypf2e-sources",
    tag: "form",
    classes: ["simplypf2e"],
    window: {
      title: "SIMPLYPF2E.Sources.Title",
      icon: "fa-solid fa-book-atlas",
      resizable: true
    },
    position: { width: 560, height: 640 },
    form: {
      handler: SourcesConfigApp.#onSubmit,
      submitOnChange: false,
      // Keep the panel open so save/reset results and a callback failure are
      // visible in the same surface instead of disappearing into a toast.
      closeOnSubmit: false
    },
    actions: {
      reset: SourcesConfigApp.#onReset
    }
  };

  constructor(options = {}, onSave = null) {
    if (typeof options === "function") {
      onSave = options;
      options = {};
    }
    super(options);
    this.#onSave = typeof onSave === "function" ? onSave : null;
  }

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/sources.hbs` }
  };

  async _prepareContext() {
    const detected = await detectAvailablePacks();
    const stored = getSetting(SETTINGS.sourcePacks) ?? {};
    const categories = CATEGORIES.map((key) => {
      const selected = new Set(
        Array.isArray(stored[key]) && stored[key].length ? stored[key] : DEFAULT_PACKS[key]
      );
      return {
        key,
        label: CATEGORY_LABELS[key],
        packs: detected[key].map((pack) => ({
          ...pack,
          checked: selected.has(pack.id),
          isDefault: DEFAULT_PACKS[key].includes(pack.id)
        }))
      };
    });
    return { categories, feedback: this.#feedback };
  }

  static async #onSubmit() {
    try {
      const selection = {};
      for (const category of CATEGORIES) {
        selection[category] = [
          ...this.element.querySelectorAll(`input[data-category="${category}"]:checked`)
        ].map((el) => el.dataset.pack);
      }
      await game.settings.set(MODULE_ID, SETTINGS.sourcePacks, selection);
      await this.#onSave?.();
      this.#feedback = {
        kind: "success",
        role: "status",
        icon: "fa-circle-check",
        text: game.i18n.localize("SIMPLYPF2E.Sources.Saved")
      };
      ui.notifications.info(this.#feedback.text);
    } catch (err) {
      console.error("simplypf2e | compendium sources save failed", err);
      this.#feedback = {
        kind: "error",
        role: "alert",
        icon: "fa-circle-exclamation",
        text: game.i18n.format("SIMPLYPF2E.Sources.SaveFailed", {
          message: err?.message ?? String(err)
        })
      };
      ui.notifications.error(this.#feedback.text);
    }
    await this.render();
  }

  static async #onReset() {
    try {
      await game.settings.set(MODULE_ID, SETTINGS.sourcePacks, {});
      await this.#onSave?.();
      this.#feedback = {
        kind: "success",
        role: "status",
        icon: "fa-rotate-left",
        text: game.i18n.localize("SIMPLYPF2E.Sources.ResetDone")
      };
      ui.notifications.info(this.#feedback.text);
    } catch (err) {
      console.error("simplypf2e | compendium sources reset failed", err);
      this.#feedback = {
        kind: "error",
        role: "alert",
        icon: "fa-circle-exclamation",
        text: game.i18n.format("SIMPLYPF2E.Sources.SaveFailed", {
          message: err?.message ?? String(err)
        })
      };
      ui.notifications.error(this.#feedback.text);
    }
    await this.render();
  }
}
