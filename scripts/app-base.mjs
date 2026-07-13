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

  /** Record one AI call's token usage under a step label. */
  _recordTokens(label, usage) {
    if (usage) this._tokenUsage.push({ label, usage });
  }

  /** Per-step token usage lines plus a total, ready for the template. */
  _buildTokenReport() {
    if (!this._tokenUsage.length) return null;
    const total = this._tokenUsage.reduce((sum, e) => sum + (e.usage.total || 0), 0);
    const anyEstimated = this._tokenUsage.some((e) => e.usage.estimated);
    return {
      steps: this._tokenUsage.map(({ label, usage }) => ({
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

  /** Initialize the step list shown while generating. */
  _beginProgress(defs) {
    this._progress = {
      steps: defs.map(([key, label]) => ({ key, label, state: "pending" })),
      detail: "",
      percent: 0
    };
  }

  /** Mark `key` active, everything before it done, and re-render. */
  async _setStep(key) {
    const progress = this._progress;
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
  _onAIProgress({ phase, tokens }) {
    const progress = this._progress;
    if (!progress) return;
    progress.detail = game.i18n.format(
      phase === "thinking" ? "SIMPLYPF2E.Progress.Thinking" : "SIMPLYPF2E.Progress.Writing",
      { tokens: tokens.toLocaleString() }
    );
    const el = this.element?.querySelector(".spf-progress-detail");
    if (el) el.textContent = progress.detail;
  }
}
