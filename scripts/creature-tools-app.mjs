import { MODULE_ID } from "./settings.mjs";
import { AI_TASK, taskMaxTokens } from "./ai-task-profiles.mjs";
import { SpfApp } from "./app-base.mjs";
import { experimentalToolRefusal } from "./experimental-tools.mjs";
import { RESKIN_CODES } from "./reskin.mjs";
import {
  CREATURE_ADJUSTMENTS, applyCreatureAdjustment, createCreatureReskin, listCreatureReskinSources,
  prepareCreatureReskin, previewCreatureAdjustment
} from "./creature-tools.mjs";

/** Plan-invalidating codes: the reviewed plan cannot be created again as shown. */
const SPENT_PLAN_CODES = new Set([
  RESKIN_CODES.STALE_SOURCE, RESKIN_CODES.INVALID_PLAN, RESKIN_CODES.INVALID_OUTPUT, RESKIN_CODES.VERIFICATION_FAILED
]);

/**
 * Creature tools (experimental): reskin an enabled bestiary NPC into a new
 * actor through the reviewed preview, and apply the native elite/weak
 * adjustment to an explicitly selected world NPC. Every action re-checks the
 * experimental gate, and a refusal keeps the GM's draft.
 */
export class CreatureToolsApp extends SpfApp {
  static DEFAULT_OPTIONS = {
    id: "simplypf2e-creature-tools",
    tag: "form",
    classes: ["simplypf2e"],
    window: {
      title: "SIMPLYPF2E.CreatureTools.Title",
      icon: "fa-solid fa-wand-magic-sparkles",
      resizable: true
    },
    position: { width: 720, height: "auto" },
    actions: {
      preview: CreatureToolsApp.#onPreview,
      createReskin: CreatureToolsApp.#onCreateReskin,
      discardReskin: CreatureToolsApp.#onDiscardReskin,
      applyAdjustment: CreatureToolsApp.#onApplyAdjustment,
      cancelGeneration: CreatureToolsApp.#onCancelGeneration
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/creature-tools.hbs` }
  };

  /** Form values kept across re-renders. */
  #input = { sourceUuid: "", prompt: "", npcId: "", adjustment: "elite" };
  /** Enabled bestiary sources, loaded once while the gate is open. */
  #candidates = null;
  #candidatesError = null;
  #busy = false;
  #error = null;
  /** The reviewed reskin: kept in memory only, never persisted. */
  #plan = null;
  #preview = null;
  #created = null;
  #adjustmentNotice = null;

  async _prepareContext() {
    const refusal = experimentalToolRefusal();
    if (!refusal && !this.#candidates && !this.#candidatesError) {
      try {
        this.#candidates = await listCreatureReskinSources();
      } catch (err) {
        this.#candidatesError = err.message;
      }
    }
    const npcs = refusal ? [] : [...(game.actors?.contents ?? [])]
      .filter((actor) => actor.type === "npc" && !actor.isToken)
      .map((actor) => ({ id: actor.id, name: actor.name, selected: actor.id === this.#input.npcId }));
    const selectedNpc = npcs.find((npc) => npc.selected) ? game.actors.get(this.#input.npcId) : null;
    let adjustmentPreview = null;
    if (!refusal && selectedNpc) {
      try {
        const preview = await previewCreatureAdjustment(selectedNpc, this.#input.adjustment);
        adjustmentPreview = {
          name: preview.from.name,
          from: game.i18n.localize(`SIMPLYPF2E.CreatureTools.Adjust.${preview.from.adjustment}`),
          to: game.i18n.localize(`SIMPLYPF2E.CreatureTools.Adjust.${preview.to}`),
          hp: preview.from.hp,
          hpMax: preview.from.hpMax,
          changes: preview.changes
        };
      } catch (err) {
        this.#adjustmentNotice = { kind: "error", text: err.message };
      }
    }
    return {
      refusal: refusal ? game.i18n.localize(refusal.localizeKey) : null,
      input: this.#input,
      busy: this.#busy,
      canCancel: this._canCancel,
      progress: this._progress,
      error: this.#error,
      candidatesError: this.#candidatesError,
      sources: (this.#candidates ?? []).map((candidate) => ({
        ...candidate, selected: candidate.uuid === this.#input.sourceUuid
      })),
      plan: this.#preview,
      created: this.#created,
      adjustments: CREATURE_ADJUSTMENTS.map((value) => ({
        value, label: `SIMPLYPF2E.CreatureTools.Adjust.${value}`, selected: value === this.#input.adjustment
      })),
      npcs,
      adjustmentPreview,
      adjustmentNotice: this.#adjustmentNotice,
      lastRunCost: this._formatLastRunCost(),
      tokenReport: this._buildTokenReport()
    };
  }

  /** Read the current form inputs into #input. */
  #readForm() {
    const root = this.element;
    if (!root) return;
    const input = this.#input;
    this.#input = {
      sourceUuid: root.querySelector('[name="sourceUuid"]')?.value ?? input.sourceUuid,
      prompt: root.querySelector('[name="prompt"]')?.value ?? input.prompt,
      npcId: root.querySelector('[name="npcId"]')?.value ?? input.npcId,
      adjustment: root.querySelector('[name="adjustment"]:checked')?.value ?? input.adjustment
    };
  }

  _preserveForm() {
    this.#readForm();
  }

  #refusedNow() {
    const refusal = experimentalToolRefusal();
    if (!refusal) return false;
    ui.notifications.warn(game.i18n.localize(refusal.localizeKey));
    return true;
  }

  static async #onPreview() {
    if (this.#busy) return;
    this.#readForm();
    if (this.#refusedNow()) return;
    if (!this.#input.sourceUuid) {
      ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.CreatureTools.NoSource"));
      return;
    }
    if (!this.#input.prompt.trim()) {
      ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.CreatureTools.NoTarget"));
      return;
    }
    this.#busy = true;
    this.#error = null;
    this.#plan = null;
    this.#preview = null;
    this.#created = null;
    this._tokenUsage = [];
    const label = game.i18n.localize("SIMPLYPF2E.CreatureTools.ProgressConcept");
    const signal = this._beginProgress([["concept", label, taskMaxTokens(AI_TASK.RESKIN_FLAVOR)]]);
    let outcome = "success";
    try {
      await this._setStep("concept");
      const { plan, preview } = await prepareCreatureReskin({
        sourceUuid: this.#input.sourceUuid,
        prompt: this.#input.prompt,
        signal,
        onProgress: this._progressCallback(label)
      });
      this._recordTokens(label, preview.usage);
      this.#plan = plan;
      this.#preview = preview;
    } catch (err) {
      this._recordTokens(label, err?.usage);
      outcome = err?.cancelled ? "cancelled" : "error";
      if (err?.cancelled) console.warn(`${MODULE_ID} | reskin preparation cancelled`);
      else console.error(`${MODULE_ID} | reskin preparation failed`, err);
      this.#error = err?.cancelled ? null : err.message;
    } finally {
      this.#busy = false;
      this._finishRun(outcome);
      await this.render();
    }
  }

  static async #onCreateReskin() {
    if (this.#busy || !this.#plan) return;
    if (this.#refusedNow()) return;
    this.#busy = true;
    this.#error = null;
    this._beginProgress([["apply", game.i18n.localize("SIMPLYPF2E.CreatureTools.ProgressApply"), 1]], { cancellable: false });
    let outcome = "success";
    try {
      await this._setStep("apply");
      const result = await createCreatureReskin(this.#plan, {
        present: (actor) => actor.sheet?.render(true)
      });
      // The actor is committed. Consume the draft before any presentation warning.
      this.#plan = null;
      this.#preview = null;
      this.#created = { name: result.name, uuid: result.actor.uuid, presentationWarning: Boolean(result.presentationError) };
      ui.notifications.info(game.i18n.format("SIMPLYPF2E.CreatureTools.Created", { name: result.name }));
      if (result.presentationError) {
        ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.CreatureTools.PresentationFailed"));
        outcome = "warning";
      }
    } catch (err) {
      if (err?.simplyPF2eRollbackActor) {
        ui.notifications.error(game.i18n.format("SIMPLYPF2E.CreatureTools.RollbackSurvivor", {
          name: err.simplyPF2eRollbackActor.name
        }));
      }
      if (SPENT_PLAN_CODES.has(err?.code)) {
        this.#plan = null;
        this.#preview = null;
      }
      outcome = "error";
      console.error(`${MODULE_ID} | reskin creation failed`, err);
      this.#error = err.message;
    } finally {
      this.#busy = false;
      this._finishRun(outcome);
      await this.render();
    }
  }

  static async #onDiscardReskin() {
    if (this.#busy) return;
    this.#readForm();
    this.#plan = null;
    this.#preview = null;
    this.#created = null;
    this.#error = null;
    this._tokenUsage = [];
    await this.render();
  }

  static async #onApplyAdjustment() {
    if (this.#busy) return;
    this.#readForm();
    if (this.#refusedNow()) return;
    const actor = game.actors?.get(this.#input.npcId);
    if (!actor) {
      ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.CreatureTools.NoNpc"));
      return;
    }
    this.#busy = true;
    try {
      const result = await applyCreatureAdjustment(actor, this.#input.adjustment);
      this.#adjustmentNotice = result.changed
        ? { kind: "success", text: game.i18n.format("SIMPLYPF2E.CreatureTools.Adjusted", {
          name: actor.name,
          from: game.i18n.localize(`SIMPLYPF2E.CreatureTools.Adjust.${result.before.adjustment}`),
          to: game.i18n.localize(`SIMPLYPF2E.CreatureTools.Adjust.${result.after.adjustment}`)
        }) }
        : { kind: "info", text: game.i18n.localize("SIMPLYPF2E.CreatureTools.AdjustUnchanged") };
    } catch (err) {
      console.error(`${MODULE_ID} | native adjustment failed`, err);
      this.#adjustmentNotice = { kind: "error", text: err.message };
    } finally {
      this.#busy = false;
      await this.render();
    }
  }

  static #onCancelGeneration() {
    this._cancelGeneration();
  }
}
