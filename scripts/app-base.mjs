import { testProviderConnection } from "./ai.mjs";
import { getProviderRequestConfig, selectProviderConnection } from "./settings.mjs";
import { ProviderSetupApp } from "./provider-setup-app.mjs";
import {
  PHASE_FILL,
  applyStep,
  createProgress,
  elapsedTime,
  finishProgress,
  settleStep,
  progressPercent,
  progressPhaseClass,
  resetStreamPhase,
  streamFraction
} from "./progress.mjs";
import { coarsenTokenEstimate, lastRunTokenTotal } from "./tokens.mjs";

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
  /** Compact last finished run: {total, estimated} or null. */
  _lastRunCost = null;
  _generationAbort = null;
  _canCancel = false;
  _runId = 0;
  _runStartedAt = 0;
  _runEndedAt = null;
  _clock = null;
  // A new run replaces context-owned state (busy, previews, completion
  // panels) as well as its progress rows. The first stage must therefore
  // render the whole shell once, even if its row count happens to match the
  // previous run and incremental progress painting is otherwise possible.
  _progressShellPending = false;
  _runHidden = false;
  _uiState = null;
  _recordedUsage = new WeakSet();
  _providerTestConfig = null;
  _providerFeedback = null;

  _providerConfigMatches(tested) {
    const config = getProviderRequestConfig();
    return !!tested && ["connectionId", "baseUrl", "model", "apiKey"].every(
      (key) => tested[key] === config[key]
    );
  }

  get _providerTested() { return this._providerConfigMatches(this._providerTestConfig); }

  get _runActive() { return this._progress?.status === "running"; }

  render(options = {}, legacyOptions = {}) {
    const force = options === true || options?.force === true;
    if (this._runHidden && !force) return this;
    this._runHidden = false;
    if (this._runActive) this._progress.elapsed = elapsedTime(this._runStartedAt, Date.now());
    this._captureUiState();
    return super.render(options, legacyOptions);
  }

  async close(options = {}) {
    this._captureUiState();
    this._runHidden = true;
    this._stopClock();
    return super.close(options);
  }

  _scrollElement() {
    // Both generator and forge put scrolling on the body inside window-content.
    return this.element?.querySelector?.(".simplypf2e-generator")
      ?? this.element?.querySelector?.(".window-content") ?? this.element;
  }

  _captureUiState() {
    const root = this.element;
    if (!root?.querySelectorAll) return;
    const focus = globalThis.document?.activeElement;
    this._uiState = {
      details: [...root.querySelectorAll("details")].map((el, index) => ({
        key: el.id || el.dataset?.stateKey || `${el.className}:${index}`, open: el.open
      })),
      scroll: this._scrollElement()?.scrollTop ?? 0,
      focusId: root.contains?.(focus) ? focus?.id : null,
      selection: typeof focus?.selectionStart === "number" ? [focus.selectionStart, focus.selectionEnd] : null
    };
  }

  _restoreUiState() {
    const root = this.element;
    const state = this._uiState;
    if (!root?.querySelectorAll || !state) return;
    [...root.querySelectorAll("details")].forEach((el, index) => {
      const key = el.id || el.dataset?.stateKey || `${el.className}:${index}`;
      const saved = state.details.find((entry) => entry.key === key);
      if (saved) el.open = saved.open;
    });
    const scroller = this._scrollElement();
    scroller.scrollTop = state.scroll;
    const active = globalThis.document?.activeElement;
    if (state.focusId && (!active || active === globalThis.document?.body || root.contains?.(active))) {
      const control = [...root.querySelectorAll("[id]")].find((el) => el.id === state.focusId);
      control?.focus?.({ preventScroll: true });
      if (state.selection && control?.setSelectionRange) {
        try { control.setSelectionRange(...state.selection); } catch { /* Non-text controls do not have a selection. */ }
      }
    }
  }

  _stopClock() {
    if (this._clock !== null) clearInterval(this._clock);
    this._clock = null;
  }

  _startClock() {
    this._stopClock();
    if (!this._runActive || this._runHidden) return;
    const runId = this._runId;
    this._clock = setInterval(() => {
      if (runId !== this._runId || !this._runActive || this._runHidden) return;
      this._progress.elapsed = elapsedTime(this._runStartedAt, Date.now());
      this._paintProgress();
    }, 1000);
    this._clock.unref?.();
  }


  /** Open the focused provider setup and refresh this app after it saves. */
  _openProviderSetup() {
    new ProviderSetupApp(() => {
      this._providerFeedback = null;
      return this._refreshPreservingForm();
    }).render(true);
  }

  /** Subclasses that keep unsaved form drafts override this before a provider switch. */
  _preserveForm() {}

  _refreshPreservingForm() {
    if (this.element) this._preserveForm();
    return this.render();
  }

  /**
   * Activate a saved connection from the compact header switch. The live
   * request config follows that profile; unknown ids fail closed.
   */
  async _switchActiveConnection(id) {
    const current = getProviderRequestConfig().connectionId;
    if (!id || id === current) return;
    this._preserveForm();
    await selectProviderConnection(id);
    this._providerFeedback = null;
    await this._refreshPreservingForm();
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this._restoreUiState();
    this._startClock();
    this.element?.querySelector?.("[name='activeConnection']")?.addEventListener("change", (event) =>
      this._switchActiveConnection(event.currentTarget.value)
    );
  }

  /**
   * Verify the production request path and retain drafts typed while the
   * independent connection probe is waiting.
   */
  async _testProvider(target) {
    if (target.disabled) return;
    this._preserveForm();
    const testedConfig = getProviderRequestConfig();
    const icon = target.querySelector("i");
    const originalClass = icon?.className;
    target.disabled = true;
    if (icon) icon.className = "fa-solid fa-spinner fa-spin";
    try {
      const usage = await testProviderConnection();
      if (!this._providerConfigMatches(testedConfig)) return;
      this._providerTestConfig = testedConfig;
      const { provider, model } = testedConfig;
      const message = game.i18n.format("SIMPLYPF2E.ProviderSetup.TestSuccess", {
        provider: provider.name,
        model,
        total: usage.total.toLocaleString()
      });
      this._providerFeedback = { kind: "success", text: message };
      ui.notifications.info(message);
    } catch (err) {
      console.error("simplypf2e | provider connection test failed", err);
      if (!this._providerConfigMatches(testedConfig)) return;
      this._providerTestConfig = null;
      const message = game.i18n.format("SIMPLYPF2E.ProviderSetup.TestFailed", {
        message: err?.message ?? String(err)
      });
      this._providerFeedback = { kind: "error", text: message };
      ui.notifications.error(message);
    } finally {
      target.disabled = false;
      if (icon && originalClass) icon.className = originalClass;
      await this._refreshPreservingForm();
    }
  }

  /** Record one AI call's token usage under a step label. */
  _recordTokens(label, usage, runId = this._runId) {
    if (!usage || !this._runActive || runId !== this._runId || this._recordedUsage.has(usage)) return;
    this._recordedUsage.add(usage);
    this._tokenUsage.push({ label, usage });
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

  /** Compact last-run copy for the provider strip. Null when no finished run. */
  _formatLastRunCost() {
    const cost = this._lastRunCost;
    if (!cost) return null;
    return game.i18n.format(
      cost.estimated ? "SIMPLYPF2E.Tokens.LastRunEstimated" : "SIMPLYPF2E.Tokens.LastRun",
      { total: cost.total.toLocaleString() }
    );
  }

  _armCancel() {
    this._generationAbort ??= new AbortController();
    this._canCancel = true;
    return this._generationAbort.signal;
  }

  _disarmCancel() {
    this._canCancel = false;
    this._generationAbort = null;
  }

  /** Cross the native-write boundary only after a final cancellation check. */
  _lockCreation() {
    this._throwIfCancelled();
    this._canCancel = false;
    this._paintProgress();
  }

  _cancelGeneration() {
    const abort = this._generationAbort;
    if (!this._canCancel || !abort || abort.signal.aborted) return;
    this._canCancel = false;
    abort.abort();
    if (this._progress) {
      this._progress.phase = "cancelling";
      this._progress.detail = game.i18n.localize("SIMPLYPF2E.Progress.Cancelling");
      this._paintProgress();
    }
  }

  _throwIfCancelled() {
    if (!this._generationAbort?.signal.aborted) return;
    const err = new Error(game.i18n.localize("SIMPLYPF2E.Errors.Cancelled"));
    err.cancelled = true;
    throw err;
  }

  /** Settle once; a committed warning is a successful write, never a retryable draft. */
  _finishRun(outcome = "success", runId = this._runId) {
    if (runId !== this._runId || !finishProgress(this._progress, outcome)) return;
    this._runEndedAt = Date.now();
    this._progress.elapsed = elapsedTime(this._runStartedAt, this._runEndedAt);
    const key = { success: "Complete", warning: "SavedWarning", cancelled: "Cancelled", error: "Failed" }[outcome];
    this._progress.activeLabel = game.i18n.localize(`SIMPLYPF2E.Progress.${key}`);
    this._progress.detail = "";
    const cost = lastRunTokenTotal(this._tokenUsage);
    if (cost) this._lastRunCost = cost;
    this._stopClock();
    this._disarmCancel();
    this._paintStepList();
    this._paintProgress();
  }

  /** Start only at a user-action boundary. Nested stages must use _setStep. */
  _beginProgress(defs, { cancellable = true } = {}) {
    this._stopClock();
    this._generationAbort?.abort();
    this._disarmCancel();
    this._runId++;
    this._runStartedAt = Date.now();
    this._runEndedAt = null;
    this._progress = createProgress(defs);
    this._progressShellPending = true;
    this._recordedUsage = new WeakSet();
    this._startClock();
    return cancellable ? this._armCancel() : null;
  }

  _clearProgress() {
    if (this._runActive) return;
    this._stopClock();
    this._progress = null;
  }

  _skipStep(key) {
    if (!this._runActive) return;
    settleStep(this._progress.steps, key, "skipped");
    this._paintStepList();
  }

  _warnStep(key) {
    if (!this._runActive) return;
    settleStep(this._progress.steps, key, "warning");
    this._paintStepList();
  }

  async _setStep(key, detail = "") {
    this._throwIfCancelled();
    const progress = this._progress;
    if (!this._runActive) return;
    const sameStep = progress.steps.some((step) => step.key === key && step.state === "active");
    if (!applyStep(progress.steps, key)) return;
    if (!sameStep) resetStreamPhase(progress);
    progress.phase = "local";
    progress.detail = detail;
    progress.activeLabel = progress.steps.find((step) => step.key === key).label;
    progress.percent = progressPercent({ steps: progress.steps, activeKey: key,
      streamFrac: progress.streamFrac, floor: progress.percent });
    if (this._progressShellPending) {
      this._progressShellPending = false;
      await this.render();
    } else if (this._paintStepList()) this._paintProgress();
    else await this.render();
  }

  /** Capture run + stage identity before dispatching an asynchronous request. */
  _progressCallback(call) {
    const runId = this._runId;
    const stepKey = this._progress?.steps.find((step) => step.state === "active")?.key;
    return (event) => this._onAIProgress({ ...event, call: call || event.call }, runId, stepKey);
  }

  _onAIProgress({ phase, tokens = 0, exact = false, call }, runId = this._runId, stepKey = null) {
    const progress = this._progress;
    if (!this._runActive || runId !== this._runId || this._generationAbort?.signal.aborted) return;
    const step = progress.steps.find((s) => s.state === "active");
    if (stepKey && stepKey !== step?.key) return;
    progress.phase = progressPhaseClass(phase);
    progress.streamFrac = streamFraction({ phase, prior: progress.streamFrac });
    progress.percent = progressPercent({ steps: progress.steps, activeKey: step?.key,
      streamFrac: progress.streamFrac, floor: progress.percent });
    const stepLabel = call && step?.label ? `${step.label} — ${call}` : (call || step?.label || "");
    const phaseKey = { waiting: "Waiting", receiving: "Receiving", retrying: "Retrying",
      compatibility: "Compatibility", validating: "Validating" }[phase];
    if (phaseKey) {
      progress.detail = game.i18n.localize(`SIMPLYPF2E.Progress.${phaseKey}`);
    } else if (phase === "thinking" || phase === "writing") {
      const shownTokens = exact ? Math.max(0, Number(tokens) || 0) : coarsenTokenEstimate(tokens);
      progress.detail = game.i18n.format(phase === "thinking"
        ? (exact ? "SIMPLYPF2E.Progress.ThinkingExact" : "SIMPLYPF2E.Progress.Thinking")
        : (exact ? "SIMPLYPF2E.Progress.WritingExact" : "SIMPLYPF2E.Progress.Writing"),
      { step: stepLabel, tokens: shownTokens.toLocaleString() });
    }
    this._paintProgress();
  }

  _paintStepList() {
    const items = this.element?.querySelectorAll?.(".spf-progress-steps li");
    const steps = this._progress?.steps;
    if (this._runHidden || !items || !steps || items.length !== steps.length) return false;
    steps.forEach((step, i) => {
      const li = items[i];
      li.className = `spf-step-${step.state}`;
      li.setAttribute?.("aria-current", step.state === "active" ? "step" : "false");
      const icon = li.querySelector("i");
      if (icon) icon.className = { done: "fa-solid fa-circle-check", active: "fa-solid fa-circle-dot",
        skipped: "fa-solid fa-minus", warning: "fa-solid fa-triangle-exclamation",
        error: "fa-solid fa-circle-exclamation", cancelled: "fa-solid fa-ban" }[step.state] || "fa-regular fa-circle";
      const outcome = li.querySelector(".spf-step-outcome");
      if (outcome) {
        const key = { pending: "Pending", active: "Active", done: "Done", skipped: "Skipped", warning: "Warning", error: "Failed", cancelled: "Cancelled" }[step.state];
        outcome.textContent = game.i18n.localize(`SIMPLYPF2E.Progress.${key}`);
        outcome.classList.toggle("spf-sr-only", !["skipped", "warning"].includes(step.state));
      }
    });
    return true;
  }

  _paintProgress() {
    const progress = this._progress;
    const root = this.element;
    if (!progress || !root || this._runHidden) return;
    const phase = progressPhaseClass(progress.phase);
    const card = root.querySelector(".spf-progress");
    if (card) {
      for (const name of [...card.classList]) if (name.startsWith("spf-progress-") && name !== "spf-progress-card") card.classList.remove(name);
      card.classList.add(`spf-progress-${phase}`);
      card.dataset.phase = phase;
      card.dataset.status = progress.status;
    }
    const write = (selector, value) => {
      const el = root.querySelector(selector);
      if (el && el.textContent !== value) el.textContent = value;
    };
    const fill = root.querySelector(".spf-progress-fill");
    const bar = root.querySelector(".spf-progress-bar");
    if (fill) fill.style.width = `${progress.percent}%`;
    if (bar) {
      bar.setAttribute("aria-valuenow", String(progress.percent));
      bar.setAttribute("aria-valuetext", `${progress.activeLabel}: ${progress.percent}%`);
    }
    write(".spf-progress-percent", `${progress.percent}%`);
    write(".spf-progress-heading", progress.activeLabel || game.i18n.localize("SIMPLYPF2E.Progress.Working"));
    write(".spf-progress-detail", progress.detail);
    write(".spf-progress-elapsed", game.i18n.format("SIMPLYPF2E.Progress.Elapsed", { time: progress.elapsed }));
    write(".spf-progress-announcement", progress.activeLabel || game.i18n.localize("SIMPLYPF2E.Progress.Working"));
    const cancel = root.querySelector('[data-action="cancelGeneration"]');
    if (cancel) { cancel.hidden = !this._canCancel; cancel.disabled = !this._canCancel; }
  }
}
