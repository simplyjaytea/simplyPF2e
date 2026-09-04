import { testProviderConnection } from "./ai.mjs";
import { getProviderRequestConfig, selectProviderConnection } from "./settings.mjs";
import { ProviderSetupApp } from "./provider-setup-app.mjs";
import {
  accumulateStreamTokens,
  applyStep,
  createProgress,
  progressPercent,
  resetStreamCounters,
  streamFraction
} from "./progress.mjs";
import { coarsenTokenEstimate } from "./tokens.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Shared base for the generator and item-forge dialogs: token-usage tracking
 * and the generate-progress step machinery, identical across both apps.
 * Subclasses use `_tokenUsage`/`_progress` and the `_`-prefixed helpers.
 */
export class SpfApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** Exact token usage per AI call of the last generation: [{label, usage}]. */
  _tokenUsage = [];
  _progress = null;

  /** Open the focused provider setup and refresh this app after it saves. */
  _openProviderSetup() {
    new ProviderSetupApp(() => this.render()).render(true);
  }

  /** Subclasses that keep unsaved form drafts override this before a provider switch. */
  _preserveForm() {}

  /**
   * Activate a saved connection from the compact header switch. The live
   * request config follows that profile; unknown ids fail closed.
   */
  async _switchActiveConnection(id) {
    const current = getProviderRequestConfig().connectionId;
    if (!id || id === current) return;
    this._preserveForm();
    await selectProviderConnection(id);
    await this.render();
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.element?.querySelector?.("[name='activeConnection']")?.addEventListener("change", (event) =>
      this._switchActiveConnection(event.currentTarget.value)
    );
  }

  /**
   * Verify the exact production request path without re-rendering the form,
   * which would otherwise discard text the GM has typed but not generated.
   */
  async _testProvider(target) {
    if (target.disabled) return;
    const icon = target.querySelector("i");
    const originalClass = icon?.className;
    target.disabled = true;
    if (icon) icon.className = "fa-solid fa-spinner fa-spin";
    try {
      const usage = await testProviderConnection();
      const { provider, model } = getProviderRequestConfig();
      ui.notifications.info(game.i18n.format("SIMPLYPF2E.ProviderSetup.TestSuccess", {
        provider: provider.name,
        model,
        total: usage.total.toLocaleString()
      }));
    } catch (err) {
      console.error("simplypf2e | provider connection test failed", err);
      ui.notifications.error(game.i18n.format("SIMPLYPF2E.ProviderSetup.TestFailed", {
        message: err?.message ?? String(err)
      }));
    } finally {
      target.disabled = false;
      if (icon && originalClass) icon.className = originalClass;
    }
  }

  /** Record one AI call's token usage under a step label. */
  _recordTokens(label, usage) {
    if (usage) this._tokenUsage.push({ label, usage });
  }

  /** Per-step token usage lines plus a total, ready for the template. */
  _buildTokenReport() {
    if (!this._tokenUsage.length) return null;
    const stepTotal = (usage) => usage.estimated
      ? coarsenTokenEstimate(usage.total || 0)
      : (usage.total || 0);
    const total = this._tokenUsage.reduce((sum, e) => sum + stepTotal(e.usage), 0);
    const anyEstimated = this._tokenUsage.some((e) => e.usage.estimated);
    return {
      steps: this._tokenUsage.map(({ label, usage }) => {
        const showSplit = !usage.estimated && ((usage.prompt || 0) > 0 || (usage.completion || 0) > 0);
        const text = usage.estimated
          ? game.i18n.format("SIMPLYPF2E.Tokens.StepEstimated", {
              total: coarsenTokenEstimate(usage.total || 0).toLocaleString()
            })
          : showSplit
            ? game.i18n.format("SIMPLYPF2E.Tokens.Step", {
                prompt: usage.prompt.toLocaleString(),
                completion: usage.completion.toLocaleString(),
                total: usage.total.toLocaleString()
              })
            : game.i18n.format("SIMPLYPF2E.Tokens.StepTotal", {
                total: (usage.total || 0).toLocaleString()
              });
        return { label, text };
      }),
      totalText: game.i18n.format(
        anyEstimated ? "SIMPLYPF2E.Tokens.TotalEstimated" : "SIMPLYPF2E.Tokens.Total",
        { total: total.toLocaleString() }
      )
    };
  }

  /** Initialize the step list shown while generating. */
  _beginProgress(defs) {
    this._progress = createProgress(defs);
  }

  /** Mark `key` active, everything before it done, and paint without remounting the bar. */
  async _setStep(key) {
    const progress = this._progress;
    if (!progress) return;
    if (!applyStep(progress.steps, key)) return;
    resetStreamCounters(progress);
    progress.detail = "";
    progress.percent = progressPercent({
      steps: progress.steps,
      activeKey: key,
      streamFrac: 0.02,
      floor: progress.percent
    });
    if (this._paintStepList()) {
      this._paintProgress();
      return;
    }
    await this.render();
  }

  /**
   * Streaming callback: maps tokens into the active step's bar share and
   * patches the DOM so CSS width transitions run on the same fill element.
   */
  _onAIProgress({ phase, tokens = 0, exact = false }) {
    const progress = this._progress;
    if (!progress) return;
    const step = progress.steps.find((s) => s.state === "active");
    const peak = accumulateStreamTokens(progress, tokens, { exact });
    progress.streamFrac = streamFraction({
      phase,
      tokens: peak,
      expectedTokens: step?.weight,
      prior: progress.streamFrac
    });
    progress.percent = progressPercent({
      steps: progress.steps,
      activeKey: step?.key,
      streamFrac: progress.streamFrac,
      floor: progress.percent
    });
    const shownTokens = exact ? Math.max(0, Number(tokens) || 0) : peak;
    progress.detail = game.i18n.format(
      phase === "thinking"
        ? (exact ? "SIMPLYPF2E.Progress.ThinkingExact" : "SIMPLYPF2E.Progress.Thinking")
        : (exact ? "SIMPLYPF2E.Progress.WritingExact" : "SIMPLYPF2E.Progress.Writing"),
      { step: step?.label ?? "", tokens: shownTokens.toLocaleString() }
    );
    this._paintProgress();
  }

  /** Patch step icons/classes in place so the fill element is not remounted. */
  _paintStepList() {
    const items = this.element?.querySelectorAll(".spf-progress-steps li");
    const steps = this._progress?.steps;
    if (!items || !steps || items.length !== steps.length) return false;
    steps.forEach((step, i) => {
      const li = items[i];
      li.className = `spf-step-${step.state}`;
      const icon = li.querySelector("i");
      if (!icon) return;
      icon.className = step.state === "done"
        ? "fa-solid fa-circle-check"
        : step.state === "active"
          ? "fa-solid fa-spinner fa-spin"
          : "fa-regular fa-circle";
    });
    return true;
  }

  _paintProgress() {
    const progress = this._progress;
    const root = this.element;
    if (!progress || !root) return;
    const fill = root.querySelector(".spf-progress-fill");
    const bar = root.querySelector(".spf-progress-bar");
    const pct = root.querySelector(".spf-progress-percent");
    const detail = root.querySelector(".spf-progress-detail");
    if (fill) fill.style.width = `${progress.percent}%`;
    if (bar) bar.setAttribute("aria-valuenow", String(progress.percent));
    if (pct) pct.textContent = `${progress.percent}%`;
    if (detail) detail.textContent = progress.detail;
  }
}
