import { MODULE_ID, SETTINGS, getSetting } from "./settings.mjs";
import { generateConcept, generateLoot, selectSpells, chooseSpellFocus, selectEquipment, selectLoot, designEncounter } from "./ai.mjs";
import { getSpellCandidates, getEquipmentCandidates, getLootCandidates } from "./compendium.mjs";
import {
  normalizeConcept, normalizeLoot, resolveConcept, resolveLoot, computeStats, createActor,
  applyTreasureBudget, lootValueGp, parseCoins, parseScroll
} from "./builder.mjs";
import { treasureBudget, TREASURE_AMOUNT_MULTIPLIER } from "./tables.mjs";
import {
  BUILT_IN_PRESETS, getCustomPresets, findPreset, addCustomPreset, updateCustomPreset,
  examplePrompt, randomBrief
} from "./presets.mjs";
import { ManagePresetsApp, promptPresetDialog, confirmDeletePreset } from "./manage-presets-app.mjs";
import { composeEncounter, THREATS } from "./encounter.mjs";
import { findBestiaryArt } from "./art.mjs";
import { SpfApp } from "./app-base.mjs";

/**
 * The prompt → preview → create dialog.
 */
export class GeneratorApp extends SpfApp {
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
      duplicatePreset: GeneratorApp.#onDuplicatePreset,
      deletePreset: GeneratorApp.#onDeletePreset,
      managePresets: GeneratorApp.#onManagePresets,
      levelUp: GeneratorApp.#onLevelUp,
      levelDown: GeneratorApp.#onLevelDown,
      partyUp: GeneratorApp.#onPartyUp,
      partyDown: GeneratorApp.#onPartyDown,
      memberUp: GeneratorApp.#onMemberUp,
      memberDown: GeneratorApp.#onMemberDown,
      rerollLoot: GeneratorApp.#onRerollLoot,
      openItemForge: GeneratorApp.#onOpenItemForge
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/generator.hbs` }
  };

  /** Form values, kept across re-renders. */
  #input = {
    mode: "single", prompt: "", level: 1, rarity: "common",
    allowSpellcasting: true, preset: "", partySize: 4, threat: "moderate",
    treasureAmount: "standard"
  };
  #busy = false;
  #error = null;
  #concept = null;
  #resolved = null;
  /** Encounter mode result: {name, budget, spent, members: [...]}. */
  #encounter = null;
  /** Cycles the example placeholder; starts randomly so reopening varies. */
  #exampleTick = Math.floor(Math.random() * 5);

  async _prepareContext() {
    return {
      input: this.#input,
      busy: this.#busy,
      error: this.#error,
      progress: this._progress,
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
      presetSelected: Boolean(findPreset(this.#input.preset)),
      encounterMode: this.#input.mode === "encounter",
      threats: Object.keys(THREATS).map((key) => ({
        value: key,
        label: `SIMPLYPF2E.Threat.${key.charAt(0).toUpperCase()}${key.slice(1)}`,
        selected: this.#input.threat === key
      })),
      treasureAmounts: Object.keys(TREASURE_AMOUNT_MULTIPLIER).map((key) => ({
        value: key,
        label: `SIMPLYPF2E.TreasureAmount.${key.charAt(0).toUpperCase()}${key.slice(1)}`,
        selected: this.#input.treasureAmount === key
      })),
      preview: this.#buildPreviewContext(),
      encounterPreview: this.#buildEncounterPreviewContext(),
      tokenReport: this._buildTokenReport()
    };
  }

  #buildEncounterPreviewContext() {
    if (!this.#encounter) return null;
    return {
      name: this.#encounter.name,
      budget: this.#encounter.budget,
      spent: this.#encounter.spent,
      overBudget: this.#encounter.spent > this.#encounter.budget,
      treasureBudget: Math.round(this.#encounter.treasureBudget ?? 0),
      treasureSpent: Math.round(this.#encounter.treasureSpent ?? 0),
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
          statline: `AC ${stats.ac}, ${game.i18n.localize("SIMPLYPF2E.Preview.Fort")} +${stats.saves.fortitude}, ${game.i18n.localize("SIMPLYPF2E.Preview.Ref")} +${stats.saves.reflex}, ${game.i18n.localize("SIMPLYPF2E.Preview.Will")} +${stats.saves.will}, HP ${stats.hp}, Per +${stats.perception}`
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
    const treasureAmount = form.querySelector('[name="treasureAmount"]')?.value ?? this.#input.treasureAmount;
    this.#input = { mode, prompt, level, rarity, allowSpellcasting, preset, partySize, threat, treasureAmount };
  }

  /**
   * Re-render when the preset or mode changes so the delete button, the
   * Random/Encounter forms, and the cycling example placeholder track them.
   */
  _onRender(context, options) {
    super._onRender?.(context, options);
    this.element.querySelector('select[name="preset"]')?.addEventListener("change", () => {
      this.#readForm();
      // Restore the preset's saved generator defaults into the live form —
      // only the fields the preset actually defines (built-ins and older
      // customs carry none, so the GM's current values stay put).
      const preset = findPreset(this.#input.preset);
      if (preset) {
        if (preset.rarity) this.#input.rarity = preset.rarity;
        if (typeof preset.allowSpellcasting === "boolean") this.#input.allowSpellcasting = preset.allowSpellcasting;
        if (preset.treasureAmount) this.#input.treasureAmount = preset.treasureAmount;
      }
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

  /** Open the item forge (a separate app) — not a mode of this app, so it
   * doesn't touch #input.mode. Lives next to the Single/Encounter toggle so
   * the item forge is discoverable from the same window GMs already have
   * open, in addition to its Items-directory sidebar button. */
  static #onOpenItemForge() {
    game.modules.get(MODULE_ID).api.openItemForge();
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

  /** Adjust an encounter member's count (0 = skip it) and refresh XP + treasure math. */
  async #stepMemberCount(index, delta) {
    const member = this.#encounter?.members?.[index];
    if (!member) return;
    member.count = Math.min(8, Math.max(0, member.count + delta));
    this.#encounter.spent = this.#encounter.members.reduce((sum, m) => sum + m.count * m.xpEach, 0);
    // The group's treasure share (treasureGroupBudget) stays constant; only
    // the per-copy split changes, so re-nudge the shared loot toward the new
    // split (applyTreasureBudget re-targets from whatever the loot currently
    // holds, so calling it again is safe) and refresh that member's actuals.
    if (member.treasureGroupBudget != null) {
      member.treasureBudgetEach = member.treasureGroupBudget / Math.max(member.count, 1);
      member.resolved.loot = await applyTreasureBudget(member.resolved.loot, member.treasureBudgetEach);
      member.treasureEach = lootValueGp(member.resolved.loot);
    }
    // Both treasure totals are per-creature × count, which now nets back to
    // each group's constant share regardless of how the stepper is set.
    this.#encounter.treasureBudget = this.#encounter.members.reduce((sum, m) => sum + m.count * (m.treasureBudgetEach ?? 0), 0);
    this.#encounter.treasureSpent = this.#encounter.members.reduce((sum, m) => sum + m.count * (m.treasureEach ?? 0), 0);
    await this.render();
  }

  #stepLevel(delta) {
    const input = this.element.querySelector('input[name="level"]');
    if (!input) return;
    const current = Number.parseInt(input.value, 10);
    // Party Level (encounter mode) is a PC level, 1-20; creature Level goes -1..24.
    const [min, max] = this.#input.mode === "encounter" ? [1, 20] : [-1, 24];
    input.value = Math.min(max, Math.max(min, (Number.isNaN(current) ? 1 : current) + delta));
  }

  static #onPartyUp() {
    this.#stepParty(1);
  }

  static #onPartyDown() {
    this.#stepParty(-1);
  }

  #stepParty(delta) {
    const input = this.element.querySelector('input[name="partySize"]');
    if (!input) return;
    const current = Number.parseInt(input.value, 10);
    input.value = Math.min(8, Math.max(1, (Number.isNaN(current) ? 4 : current) + delta));
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
    this._tokenUsage = [];
    this._beginProgress([
      ["concept", game.i18n.localize("SIMPLYPF2E.Progress.Concept")],
      ...(this.#input.allowSpellcasting ? [["spells", game.i18n.localize("SIMPLYPF2E.Progress.Spells")]] : []),
      ["equipment", game.i18n.localize("SIMPLYPF2E.Progress.Equipment")],
      ["loot", game.i18n.localize("SIMPLYPF2E.Progress.Loot")],
      ["match", game.i18n.localize("SIMPLYPF2E.Progress.Match")]
    ]);
    try {
      await this._setStep("concept");
      const { concept: raw, usage } = await generateConcept({
        // Random mode rolls a fresh local brief each generation, so
        // Regenerate gives a genuinely different creature every time.
        prompt: isRandom ? randomBrief() : this.#input.prompt,
        level: this.#input.level,
        rarity: this.#input.rarity,
        allowSpellcasting: this.#input.allowSpellcasting,
        preset: isRandom ? null : findPreset(this.#input.preset)?.prompt ?? null,
        amount: this.#input.treasureAmount,
        onProgress: (p) => this._onAIProgress(p)
      });
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Concept"), usage);
      this.#concept = normalizeConcept(raw, { level: this.#input.level, rarity: this.#input.rarity });
      if (this.#concept.spellcasting) await this._setStep("spells");
      await this.#refineSpells(this.#concept);
      if (this.#concept.equipment.length) await this._setStep("equipment");
      await this.#refineEquipment(this.#concept);
      if (this.#concept.loot.length) await this._setStep("loot");
      await this.#refineLoot(this.#concept);
      await this._setStep("match");
      this.#resolved = await resolveConcept(this.#concept);
      // Treasure budget: the module owns the numbers (level + rarity from the
      // tables, scaled by the Treasure amount control); only coins flex.
      this.#resolved.loot = await applyTreasureBudget(
        this.#resolved.loot,
        treasureBudget(this.#concept.level, this.#concept.rarity, this.#input.treasureAmount)
      );
      const eq = this.#resolved.equipment;
      if (eq.length) {
        const misses = eq.filter((e) => !e.entry).map((e) => e.name);
        console.log(`${MODULE_ID} | equipment matches: ${eq.length - misses.length}/${eq.length}`,
          misses.length ? { missing: misses } : "");
      }
      console.log(`${MODULE_ID} | token usage`, this._tokenUsage);
    } catch (err) {
      console.error(`${MODULE_ID} | generation failed`, err);
      this.#error = err.message;
      this.#concept = null;
      this.#resolved = null;
    } finally {
      this.#busy = false;
      this._progress = null;
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
    this._tokenUsage = [];
    const { level: partyLevel, partySize, threat, rarity } = this.#input;
    const composition = composeEncounter(threat, partySize, partyLevel);
    const memberLabel = (i) => game.i18n.format("SIMPLYPF2E.Progress.Member", {
      index: i + 1, total: composition.members.length
    });
    this._beginProgress([
      ["design", game.i18n.localize("SIMPLYPF2E.Progress.Design")],
      ...composition.members.map((_, i) => [`member${i}`, memberLabel(i)]),
      ["match", game.i18n.localize("SIMPLYPF2E.Progress.Match")]
    ]);
    try {
      await this._setStep("design");
      const theme = this.#input.prompt.trim() || randomBrief();
      const design = await designEncounter({
        theme,
        partyLevel,
        slots: composition.members,
        onProgress: (p) => this._onAIProgress(p)
      });
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Design"), design.usage);

      const members = [];
      for (let i = 0; i < composition.members.length; i++) {
        const slot = composition.members[i];
        await this._setStep(`member${i}`);
        const { concept: raw, usage } = await generateConcept({
          prompt: `${design.briefs[i]} (Part of the encounter "${design.name}": ${theme})`,
          level: slot.level,
          rarity,
          allowSpellcasting: this.#input.allowSpellcasting,
          preset: null,
          amount: this.#input.treasureAmount,
          onProgress: (p) => this._onAIProgress(p)
        });
        this._recordTokens(memberLabel(i), usage);
        const concept = normalizeConcept(raw, { level: slot.level, rarity });
        await this.#refineSpells(concept);
        await this.#refineEquipment(concept);
        await this.#refineLoot(concept);
        members.push({ ...slot, concept });
      }

      await this._setStep("match");
      for (const member of members) {
        member.resolved = await resolveConcept(member.concept);
        // Treasure is calibrated to the PARTY level (it is awarded to players
        // of that level), not the member's own creature level, and to the
        // WHOLE ENCOUNTER, not each group — treasureBudget() returns one
        // encounter's total, so it's divided evenly across every group
        // (members.length) before being treated as that group's share.
        // (Rarity still weights a group's OWN cut relative to the others —
        // a rare/unique group's per-group treasureBudget() call comes out
        // higher before the /members.length split — but the SUM across
        // groups is bounded to roughly one encounter's worth instead of one
        // full share PER group.) The GROUP as a whole gets ONE share of
        // treasure regardless of how many copies it has — treasureGroupBudget
        // is that constant share; treasureBudgetEach is the group's share
        // divided across its current copies, so the group's total stays flat
        // as the count stepper changes (see #stepMemberCount, which
        // recomputes the per-copy split the same way).
        member.treasureGroupBudget =
          treasureBudget(partyLevel, member.concept.rarity, this.#input.treasureAmount) / members.length;
        member.treasureBudgetEach = member.treasureGroupBudget / Math.max(member.count, 1);
        member.resolved.loot = await applyTreasureBudget(member.resolved.loot, member.treasureBudgetEach);
        member.treasureEach = lootValueGp(member.resolved.loot);
      }
      const allEq = members.flatMap((m) => m.resolved.equipment);
      if (allEq.length) {
        const misses = allEq.filter((e) => !e.entry).map((e) => e.name);
        console.log(`${MODULE_ID} | equipment matches: ${allEq.length - misses.length}/${allEq.length}`,
          misses.length ? { missing: misses } : "");
      }
      this.#encounter = {
        name: design.name,
        budget: composition.budget,
        spent: composition.spent,
        treasureBudget: members.reduce((sum, m) => sum + m.count * (m.treasureBudgetEach ?? 0), 0),
        treasureSpent: members.reduce((sum, m) => sum + m.count * (m.treasureEach ?? 0), 0),
        members
      };
      console.log(`${MODULE_ID} | token usage`, this._tokenUsage);
    } catch (err) {
      console.error(`${MODULE_ID} | encounter generation failed`, err);
      this.#error = err.message;
      this.#encounter = null;
    } finally {
      this.#busy = false;
      this._progress = null;
      await this.render();
    }
  }

  /**
   * Grounded spell selection: first ask the AI for a thematic focus (so the
   * compendium query below can be narrowed instead of dumping every spell in
   * the tradition), then fetch that narrowed, level-capped list and let the
   * AI pick the actual spells from it. The first-draft spells from
   * generateConcept() are UNCONSTRAINED (the AI free-invents plausible names
   * as "inspiration" only) — if this grounded pass doesn't produce a real,
   * compendium-backed list, spells are dropped rather than left as unvetted
   * draft names, same fail-closed behavior as feats elsewhere in the pipeline.
   */
  async #refineSpells(concept) {
    const spellcasting = concept?.spellcasting;
    if (!spellcasting) return;
    try {
      // Both AI calls below run under the single "Spell selection" step, so
      // keep a running token total across them — otherwise the live counter
      // visibly resets to zero when the second call starts.
      let stepTokens = 0;
      let lastTokens = 0;
      const onProgress = (p) => {
        lastTokens = p.tokens;
        this._onAIProgress({ ...p, tokens: stepTokens + p.tokens });
      };
      let keywords = [];
      try {
        const focus = await chooseSpellFocus({
          concept,
          tradition: spellcasting.tradition,
          onProgress
        });
        keywords = focus.keywords;
        this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.SpellFocus"), focus.usage);
      } catch (err) {
        console.warn(`${MODULE_ID} | spell focus selection failed, using unfiltered spell list`, err);
      }
      stepTokens += lastTokens;
      const candidates = await getSpellCandidates(spellcasting.tradition, spellcasting.maxRank, keywords);
      if (!candidates.length) {
        console.warn(`${MODULE_ID} | no spell candidates found, dropping spellcasting (unconstrained first-draft spells discarded)`);
        spellcasting.spells = [];
      } else {
        const { spells, usage } = await selectSpells({
          concept,
          candidates,
          maxRank: spellcasting.maxRank,
          onProgress
        });
        this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Spells"), usage);
        spellcasting.spells = spells;
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | grounded spell selection failed, dropping spellcasting (unconstrained first-draft spells discarded)`, err);
      spellcasting.spells = [];
    }
    if (!spellcasting.spells.length) concept.spellcasting = null;
  }

  /**
   * Grounded equipment selection: fetch real, level-capped items from the
   * equipment compendium (narrowed by keywords drawn from the first-draft
   * gear names and strikes — no separate AI focus pass needed, unlike spells)
   * and let the AI pick the creature's carried gear from that list. Falls
   * back to the first-draft names (still fuzzy-matched) if anything fails.
   * Creatures designed to carry nothing (beasts, mindless) are skipped.
   */
  async #refineEquipment(concept) {
    if (!concept?.equipment?.length) return;
    try {
      const keywords = [...new Set(
        [...concept.equipment.map((e) => e.name), ...concept.strikes.map((s) => s.name)]
          .flatMap((name) => String(name).toLowerCase().split(/[^a-z0-9]+/))
          .filter((token) => token.length > 2)
      )];
      const candidates = await getEquipmentCandidates(concept.level, keywords);
      if (!candidates.length) return;
      const { equipment, usage } = await selectEquipment({
        concept,
        candidates,
        onProgress: (p) => this._onAIProgress(p)
      });
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Equipment"), usage);
      if (equipment.length) concept.equipment = equipment;
    } catch (err) {
      console.warn(`${MODULE_ID} | grounded equipment selection failed, using first-draft equipment`, err);
    }
  }

  /**
   * Grounded loot selection: fetch real compendium items (treasure included)
   * and have the AI re-pick the first-draft haul from that list — the loot
   * counterpart of #refineEquipment(). Without it, a pre-Remaster name the
   * model recalls ("Bag of Holding") never fuzzy-matches its Remaster item
   * ("Spacious Pouch") and silently becomes a wrong-named custom treasure
   * item. Coins and scrolls pass through free-form (parseCoins/parseScroll
   * build them specially); a haul of ONLY coins/scrolls skips the AI call.
   * Falls back to the first-draft names (still fuzzy-matched) if anything
   * fails.
   */
  async #refineLoot(concept) {
    if (!concept?.loot?.length) return;
    if (concept.loot.every((l) => parseCoins(l.name) || parseScroll(l.name))) return;
    try {
      const keywords = [...new Set(
        concept.loot.map((l) => l.name)
          .flatMap((name) => String(name).toLowerCase().split(/[^a-z0-9]+/))
          .filter((token) => token.length > 2)
      )];
      const candidates = await getLootCandidates(concept.level, keywords);
      if (!candidates.length) return;
      const { loot, usage } = await selectLoot({
        concept,
        candidates,
        onProgress: (p) => this._onAIProgress(p)
      });
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.Loot"), usage);
      if (loot.length) concept.loot = normalizeLoot(loot);
    } catch (err) {
      console.warn(`${MODULE_ID} | grounded loot selection failed, using first-draft loot`, err);
    }
  }

  static async #onCreateActor() {
    if (this.#busy) return;
    if (this.#input.mode === "encounter" || this.#encounter) return this.#createEncounterActors();
    if (!this.#concept) return;
    this.#busy = true;
    await this.render();
    try {
      // Art: borrowed from the closest-matching bestiary creature.
      const img = await findBestiaryArt(this.#concept);
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

  /** Create every encounter member, each with closest-match bestiary art. */
  async #createEncounterActors() {
    if (!this.#encounter) return;
    this.#busy = true;
    await this.render();
    try {
      const folder = await Folder.create({ name: this.#encounter.name, type: "Actor" });
      let created = 0;
      for (const member of this.#encounter.members) {
        if (member.count < 1) continue;
        // Identical minions share one art lookup — same creature, same portrait.
        const img = await findBestiaryArt(member.concept);
        for (let i = 0; i < member.count; i++) {
          const actor = await createActor(member.concept, member.resolved, { img });
          const update = { folder: folder.id };
          if (member.count > 1) update.name = `${actor.name} ${i + 1}`;
          await actor.update(update);
          created++;
        }
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
    this._beginProgress([["loot", game.i18n.localize("SIMPLYPF2E.Progress.LootReroll")]]);
    try {
      await this._setStep("loot");
      const { loot, usage } = await generateLoot({
        concept: this.#concept,
        amount: this.#input.treasureAmount,
        onProgress: (p) => this._onAIProgress(p)
      });
      this._recordTokens(game.i18n.localize("SIMPLYPF2E.Progress.LootReroll"), usage);
      this.#concept.loot = normalizeLoot(loot);
      // Ground the fresh draft too — same Remaster-name protection as the
      // main pipeline (a reroll is a new ungrounded draft).
      await this.#refineLoot(this.#concept);
      this.#resolved.loot = await applyTreasureBudget(
        await resolveLoot(this.#concept),
        treasureBudget(this.#concept.level, this.#concept.rarity, this.#input.treasureAmount)
      );
    } catch (err) {
      console.error(`${MODULE_ID} | loot reroll failed`, err);
      this.#error = err.message;
    } finally {
      this.#busy = false;
      this._progress = null;
      await this.render();
    }
  }

  static async #onDiscard() {
    this.#readForm();
    this.#concept = null;
    this.#resolved = null;
    this.#encounter = null;
    this.#error = null;
    this._tokenUsage = [];
    await this.render();
  }

  /**
   * Save a preset: if a CUSTOM preset is currently selected the dialog edits
   * it in place (same id); otherwise it creates a new custom preset. The
   * generator-default fields (rarity, treasure, spellcasting) are pre-filled
   * from the live form so a preset captures the GM's current setup.
   */
  static async #onSavePreset() {
    this.#readForm();
    const current = findPreset(this.#input.preset);
    const editing = current?.custom ? current : null;
    const result = await promptPresetDialog({
      title: editing ? "SIMPLYPF2E.Presets.DialogEditTitle" : "SIMPLYPF2E.Presets.DialogTitle",
      name: editing?.name ?? "",
      prompt: editing?.prompt ?? "",
      rarity: this.#input.rarity,
      allowSpellcasting: this.#input.allowSpellcasting,
      treasureAmount: this.#input.treasureAmount
    });
    if (!result) return;
    const preset = editing
      ? await updateCustomPreset(editing.id, result)
      : await addCustomPreset(result.name, result.prompt, result);
    if (!preset) return;
    this.#input.preset = preset.id;
    ui.notifications.info(game.i18n.format("SIMPLYPF2E.Presets.Saved", { name: preset.name }));
    await this.render();
  }

  /**
   * Duplicate the currently selected preset (built-in or custom) into a NEW
   * custom preset — the dialog opens pre-filled from the source so a GM can
   * start from e.g. "Fighter" and tweak it. Never touches the source.
   */
  static async #onDuplicatePreset() {
    this.#readForm();
    const source = findPreset(this.#input.preset);
    if (!source) return;
    // Built-in names are i18n keys; custom names are plain text.
    const sourceName = source.custom ? source.name : game.i18n.localize(source.name);
    const result = await promptPresetDialog({
      title: "SIMPLYPF2E.Presets.DialogTitle",
      name: game.i18n.format("SIMPLYPF2E.Presets.CopyName", { name: sourceName }),
      prompt: source.prompt,
      rarity: source.rarity ?? this.#input.rarity,
      allowSpellcasting: source.allowSpellcasting ?? this.#input.allowSpellcasting,
      treasureAmount: source.treasureAmount ?? this.#input.treasureAmount
    });
    if (!result) return;
    const preset = await addCustomPreset(result.name, result.prompt, result);
    this.#input.preset = preset.id;
    ui.notifications.info(game.i18n.format("SIMPLYPF2E.Presets.Saved", { name: preset.name }));
    await this.render();
  }

  /** Delete the currently selected custom preset (after confirmation). */
  static async #onDeletePreset() {
    this.#readForm();
    const preset = findPreset(this.#input.preset);
    if (!preset?.custom) return;
    if (!(await confirmDeletePreset(preset))) return;
    this.#input.preset = "";
    await this.render();
  }

  /** Open the Manage Custom Presets dialog (edit/duplicate/delete/export/import). */
  static #onManagePresets() {
    this.#managePresets ??= new ManagePresetsApp({ generator: this });
    this.#managePresets.render(true);
  }

  /** Singleton Manage Presets dialog for this generator window. */
  #managePresets = null;
}
