import { MODULE_ID } from "./settings.mjs";
import { TREASURE_AMOUNT_MULTIPLIER } from "./tables.mjs";
import {
  PRESET_RARITIES, getCustomPresets, findPreset, addCustomPreset, updateCustomPreset,
  deleteCustomPreset, exportPresets, importPresets
} from "./presets.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const esc = (s) => Handlebars.escapeExpression(String(s ?? ""));

/**
 * The shared save/edit preset dialog: name + AI guidance text plus the
 * preset's generator defaults (rarity, treasure amount, spellcasting),
 * pre-filled from `initial`. Resolves to the entered values, or null if
 * cancelled or name/prompt were left empty.
 */
export async function promptPresetDialog({
  title = "SIMPLYPF2E.Presets.DialogTitle",
  name = "",
  prompt = "",
  rarity = "common",
  allowSpellcasting = true,
  treasureAmount = "standard"
} = {}) {
  const options = (values, prefix, current) => values.map((v) =>
    `<option value="${v}" ${v === current ? "selected" : ""}>${game.i18n.localize(`SIMPLYPF2E.${prefix}.${capitalize(v)}`)}</option>`
  ).join("");
  const content = `
    <div class="form-group">
      <label>${game.i18n.localize("SIMPLYPF2E.Presets.DialogName")}</label>
      <input type="text" name="presetName" required value="${esc(name)}" placeholder="${game.i18n.localize("SIMPLYPF2E.Presets.DialogNamePlaceholder")}">
    </div>
    <div class="form-group stacked">
      <label>${game.i18n.localize("SIMPLYPF2E.Presets.DialogGuidance")}</label>
      <textarea name="presetPrompt" rows="6" placeholder="${game.i18n.localize("SIMPLYPF2E.Presets.DialogGuidancePlaceholder")}">${esc(prompt)}</textarea>
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("SIMPLYPF2E.Generator.Rarity")}</label>
      <select name="presetRarity">${options(PRESET_RARITIES, "Rarity", rarity)}</select>
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("SIMPLYPF2E.Generator.TreasureAmount")}</label>
      <select name="presetTreasure">${options(Object.keys(TREASURE_AMOUNT_MULTIPLIER), "TreasureAmount", treasureAmount)}</select>
    </div>
    <div class="form-group">
      <label>
        <input type="checkbox" name="presetSpellcasting" ${allowSpellcasting ? "checked" : ""}>
        ${game.i18n.localize("SIMPLYPF2E.Generator.AllowSpellcasting")}
      </label>
    </div>`;
  const result = await DialogV2.prompt({
    window: { title, icon: "fa-solid fa-bookmark" },
    position: { width: 480 },
    content,
    ok: {
      label: "SIMPLYPF2E.Presets.DialogSave",
      icon: "fa-solid fa-floppy-disk",
      callback: (_event, button) => ({
        name: button.form.elements.presetName.value.trim(),
        prompt: button.form.elements.presetPrompt.value.trim(),
        rarity: button.form.elements.presetRarity.value,
        treasureAmount: button.form.elements.presetTreasure.value,
        allowSpellcasting: button.form.elements.presetSpellcasting.checked
      })
    },
    rejectClose: false
  });
  return result?.name && result?.prompt ? result : null;
}

/** Confirm-then-delete for a custom preset. Returns true if deleted. */
export async function confirmDeletePreset(preset) {
  const confirmed = await DialogV2.confirm({
    window: { title: "SIMPLYPF2E.Presets.DeleteTitle" },
    content: `<p>${game.i18n.format("SIMPLYPF2E.Presets.DeleteConfirm", { name: preset.name })}</p>`,
    rejectClose: false
  });
  if (!confirmed) return false;
  await deleteCustomPreset(preset.id);
  ui.notifications.info(game.i18n.format("SIMPLYPF2E.Presets.Deleted", { name: preset.name }));
  return true;
}

/**
 * Manage Custom Presets dialog: lists the world's custom presets with
 * edit / duplicate / export / delete per row, plus export-all and
 * paste-JSON import. Built-ins aren't listed — they can't be changed.
 */
export class ManagePresetsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "simplypf2e-manage-presets",
    classes: ["simplypf2e"],
    window: {
      title: "SIMPLYPF2E.Presets.ManageTitle",
      icon: "fa-solid fa-bookmark",
      resizable: true
    },
    position: { width: 420, height: "auto" },
    actions: {
      editPreset: ManagePresetsApp.#onEdit,
      duplicatePreset: ManagePresetsApp.#onDuplicate,
      deletePreset: ManagePresetsApp.#onDelete,
      exportPreset: ManagePresetsApp.#onExport,
      exportAll: ManagePresetsApp.#onExportAll,
      importPresets: ManagePresetsApp.#onImport
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/manage-presets.hbs` }
  };

  /** The generator app that opened this dialog, re-rendered after changes so
   * its preset <select> stays in sync. */
  #generator;

  constructor(options = {}) {
    super(options);
    this.#generator = options.generator ?? null;
  }

  async _prepareContext() {
    return { presets: getCustomPresets() };
  }

  async #refresh() {
    await this.render();
    this.#generator?.render();
  }

  static async #onEdit(_event, target) {
    const preset = findPreset(target.dataset.id);
    if (!preset?.custom) return;
    const result = await promptPresetDialog({
      title: "SIMPLYPF2E.Presets.DialogEditTitle",
      ...preset
    });
    if (!result) return;
    const updated = await updateCustomPreset(preset.id, result);
    if (!updated) return;
    ui.notifications.info(game.i18n.format("SIMPLYPF2E.Presets.Saved", { name: updated.name }));
    await this.#refresh();
  }

  static async #onDuplicate(_event, target) {
    const preset = findPreset(target.dataset.id);
    if (!preset?.custom) return;
    const result = await promptPresetDialog({
      ...preset,
      title: "SIMPLYPF2E.Presets.DialogTitle",
      name: game.i18n.format("SIMPLYPF2E.Presets.CopyName", { name: preset.name })
    });
    if (!result) return;
    const created = await addCustomPreset(result.name, result.prompt, result);
    ui.notifications.info(game.i18n.format("SIMPLYPF2E.Presets.Saved", { name: created.name }));
    await this.#refresh();
  }

  static async #onDelete(_event, target) {
    const preset = findPreset(target.dataset.id);
    if (!preset?.custom) return;
    if (await confirmDeletePreset(preset)) await this.#refresh();
  }

  static #onExport(_event, target) {
    const preset = findPreset(target.dataset.id);
    if (!preset?.custom) return;
    const save = foundry.utils.saveDataToFile ?? globalThis.saveDataToFile;
    save(exportPresets([preset.id]), "text/json", `simplypf2e-preset-${preset.id}.json`);
  }

  static #onExportAll() {
    if (!getCustomPresets().length) return;
    const save = foundry.utils.saveDataToFile ?? globalThis.saveDataToFile;
    save(exportPresets(), "text/json", "simplypf2e-presets.json");
  }

  static async #onImport() {
    const json = await DialogV2.prompt({
      window: { title: "SIMPLYPF2E.Presets.ImportTitle", icon: "fa-solid fa-file-import" },
      position: { width: 480 },
      content: `
        <div class="form-group stacked">
          <label>${game.i18n.localize("SIMPLYPF2E.Presets.ImportHint")}</label>
          <textarea name="presetJson" rows="10" placeholder='[{ "name": "...", "prompt": "..." }]'></textarea>
        </div>`,
      ok: {
        label: "SIMPLYPF2E.Presets.Import",
        icon: "fa-solid fa-file-import",
        callback: (_event, button) => button.form.elements.presetJson.value.trim()
      },
      rejectClose: false
    });
    if (!json) return;
    const { added, skipped } = await importPresets(json);
    ui.notifications.info(game.i18n.format("SIMPLYPF2E.Presets.ImportDone", { added, skipped }));
    await this.#refresh();
  }
}
