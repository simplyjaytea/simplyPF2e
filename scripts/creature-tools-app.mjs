import { MODULE_ID } from "./settings.mjs";
import { AI_TASK, taskMaxTokens } from "./ai-task-profiles.mjs";
import { SpfApp } from "./app-base.mjs";
import { experimentalToolRefusal } from "./experimental-tools.mjs";
import { RESKIN_CODES } from "./reskin.mjs";
import { SUPPORTED_SHIFTS } from "./level-shift-policy.mjs";
import { MIN_LEVEL, MAX_LEVEL } from "./tables.mjs";
import {
  CREATURE_ADJUSTMENTS, applyCreatureAdjustment, createCreatureReskin, listCreatureReskinSources,
  prepareCreatureReskin, previewCreatureAdjustment, prepareCreatureLevelShift, createCreatureLevelShift
} from "./creature-tools.mjs";

/** Plan-invalidating codes: the reviewed plan cannot be created again as shown. */
const SPENT_PLAN_CODES = new Set([
  RESKIN_CODES.STALE_SOURCE, RESKIN_CODES.INVALID_PLAN, RESKIN_CODES.INVALID_OUTPUT, RESKIN_CODES.VERIFICATION_FAILED
]);

/** The NPC's native base level. Elite and weak adjustments do not change the source level. */
function shiftBaseLevel(actor) {
  return Number(actor?.baseLevel ?? actor?._source?.system?.details?.level?.value ?? actor?.system?.details?.level?.value);
}

/** Supported target levels for a world NPC, limited to the range the level-shift policy accepts. */
function shiftTargetLevelsFor(actor) {
  const sourceLevel = shiftBaseLevel(actor);
  if (!Number.isInteger(sourceLevel)) return [];
  return SUPPORTED_SHIFTS
    .map((delta) => sourceLevel + delta)
    .filter((level) => level >= MIN_LEVEL && level <= MAX_LEVEL);
}

/** The localized error, followed by any problems the backend attached, joined for display. */
function errorText(err) {
  const problems = (err?.problems ?? [])
    .map((problem) => (typeof problem === "string" ? problem : problem?.message ?? problem?.code))
    .filter(Boolean);
  return problems.length ? `${err.message} ${problems.join("; ")}` : err.message;
}

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
      previewShift: CreatureToolsApp.#onPreviewShift,
      createShift: CreatureToolsApp.#onCreateShift,
      discardShift: CreatureToolsApp.#onDiscardShift,
      cancelGeneration: CreatureToolsApp.#onCancelGeneration
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/creature-tools.hbs` }
  };

  /** Form values kept across re-renders. */
  #input = { sourceUuid: "", prompt: "", npcId: "", adjustment: "elite", shiftNpcId: "", shiftTargetLevel: "" };
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
  /** The prepared level shift: kept in memory only, never persisted. */
  #shiftPrepared = null;
  #shiftPreview = null;
  #shiftCreated = null;

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
    const shiftNpcs = refusal ? [] : [...(game.actors?.contents ?? [])]
      .filter((actor) => actor.type === "npc" && !actor.isToken)
      .map((actor) => ({ id: actor.id, name: actor.name, selected: actor.id === this.#input.shiftNpcId }));
    const selectedNpc = npcs.find((npc) => npc.selected) ? game.actors.get(this.#input.npcId) : null;
    const selectedShiftNpc = shiftNpcs.find((npc) => npc.selected) ? game.actors.get(this.#input.shiftNpcId) : null;
    const shiftTargetLevels = refusal ? [] : shiftTargetLevelsFor(selectedShiftNpc)
      .map((level) => ({ value: level, label: level, selected: String(level) === String(this.#input.shiftTargetLevel) }));
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
      shiftNpcs,
      shiftTargetLevels,
      adjustmentPreview,
      adjustmentNotice: this.#adjustmentNotice,
      shiftPreview: this.#shiftPreview,
      shiftCreated: this.#shiftCreated,
      shiftPrepared: this.#shiftPrepared !== null,
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
      adjustment: root.querySelector('[name="adjustment"]:checked')?.value ?? input.adjustment,
      shiftNpcId: root.querySelector('[name="shiftNpcId"]')?.value ?? input.shiftNpcId,
      shiftTargetLevel: root.querySelector('[name="shiftTargetLevel"]')?.value ?? input.shiftTargetLevel
    };
  }

  _preserveForm() {
    this.#readForm();
  }
  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    if (!root) return;
    const refresh = () => {
      this.#readForm();
      this.render();
    };
    root.querySelector('[name="npcId"]')?.addEventListener("change", refresh);
    // A changed NPC or target level invalidates the reviewed shift: the GM must preview it again.
    const refreshShift = () => {
      this.#readForm();
      if (this.#shiftPrepared && !this.#shiftMatchesForm(this.#shiftPrepared)) {
        this.#shiftPrepared = null;
        this.#shiftPreview = null;
      }
      this.render();
    };
    root.querySelector('[name="shiftNpcId"]')?.addEventListener("change", refreshShift);
    root.querySelector('[name="shiftTargetLevel"]')?.addEventListener("change", refreshShift);
    for (const node of root.querySelectorAll('[name="adjustment"]')) {
      node.addEventListener("change", refresh);
    }
  }

  /** True when the reviewed shift still matches the NPC and target level currently in the form. */
  #shiftMatchesForm(prepared) {
    const actor = game.actors?.get(this.#input.shiftNpcId);
    return Boolean(actor) && actor.uuid === prepared.sourceUuid
      && String(this.#input.shiftTargetLevel).trim() === String(prepared.plan.targetLevel);
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

  static async #onPreviewShift() {
    if (this.#busy) return;
    this.#readForm();
    if (this.#refusedNow()) return;
    const actor = game.actors?.get(this.#input.shiftNpcId);
    if (!actor) {
      ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.CreatureTools.NoNpc"));
      return;
    }
    // The target must be one of this NPC's supported levels. An unchosen value is "" and never previews level 0.
    const raw = String(this.#input.shiftTargetLevel ?? "").trim();
    const targetLevel = Number(raw);
    if (!raw || !Number.isInteger(targetLevel) || !shiftTargetLevelsFor(actor).includes(targetLevel)) {
      ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.CreatureTools.Shift.NoTargetLevel"));
      return;
    }
    this.#busy = true;
    this.#error = null;
    this.#shiftPrepared = null;
    this.#shiftPreview = null;
    this.#shiftCreated = null;
    try {
      const { prepared, preview } = await prepareCreatureLevelShift(actor, targetLevel);
      this.#shiftPreview = preview;
      if (prepared?.plan?.ok) this.#shiftPrepared = prepared;
    } catch (err) {
      console.error(`${MODULE_ID} | level shift preparation failed`, err);
      this.#error = errorText(err);
    } finally {
      this.#busy = false;
      await this.render();
    }
  }

  static async #onCreateShift() {
    if (this.#busy || !this.#shiftPrepared) return;
    if (this.#refusedNow()) return;
    this.#readForm();
    if (!this.#shiftMatchesForm(this.#shiftPrepared)) {
      this.#shiftPrepared = null;
      this.#shiftPreview = null;
      ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.CreatureTools.Shift.PreviewChanged"));
      await this.render();
      return;
    }
    this.#busy = true;
    this.#error = null;
    try {
      const result = await createCreatureLevelShift(this.#shiftPrepared);
      this.#shiftPrepared = null;
      this.#shiftPreview = null;
      this.#shiftCreated = { name: result.name };
      ui.notifications.info(game.i18n.format("SIMPLYPF2E.CreatureTools.Created", { name: result.name }));
      result.actor?.sheet?.render(true);
    } catch (err) {
      // Every create error spends the reviewed shift: the GM must preview again before another create.
      this.#shiftPrepared = null;
      this.#shiftPreview = null;
      this.#error = errorText(err);
      if (err?.simplyPF2eRollbackActor) {
        const survivor = game.i18n.format("SIMPLYPF2E.CreatureTools.RollbackSurvivor", {
          name: err.simplyPF2eRollbackActor.name
        });
        ui.notifications.error(survivor);
        this.#error = this.#error + " " + survivor;
      }
      console.error(`${MODULE_ID} | level shift creation failed`, err);
    } finally {
      this.#busy = false;
      await this.render();
    }
  }

  static async #onDiscardShift() {
    if (this.#busy) return;
    this.#readForm();
    this.#shiftPrepared = null;
    this.#shiftPreview = null;
    this.#shiftCreated = null;
    this.#error = null;
    await this.render();
  }

  static #onCancelGeneration() {
    this._cancelGeneration();
  }
}
