/**
 * Activated magic-item macros (item forge Phase 2).
 *
 * SAFETY PRINCIPLE (the Phase 1 principle, applied to macros instead of Rule
 * Elements): the AI never writes code. Each of the four templates below is a
 * PRE-WRITTEN, tested script body; the AI supplies only numbers and enum
 * slugs, which are validated/clamped in item-builder.normalizeActivation and
 * then embedded as JSON.stringify-serialized CONSTANTS at the top of the
 * chosen body. There is no code-injection surface — a parameter can only ever
 * be a number, a whitelisted string, or a validated dice formula.
 *
 * Every non-trivial PF2e API call in the bodies (save rolls, damage/heal
 * chat cards, condition application, effect creation) is wrapped in try/catch
 * with a plain-chat-message fallback, so a macro NEVER throws an unhandled
 * error or leaves the player stuck: a degraded-but-functional macro (roll +
 * "apply this manually") always beats a broken one. See CLAUDE.md for which
 * API calls have strong real precedent vs. which are best-effort-with-fallback.
 */

import { MODULE_ID } from "./settings.mjs";
import { cloneRulesForEffects } from "./item-builder.mjs";

/* Folder the companion macros are filed under (created on first use). */
const MACRO_FOLDER_NAME = "SimplyPF2e Item Forge";

/* -------------------- shared script fragments -------------------- */

/*
 * Foundry executes a script macro's `command` as the BODY of an async
 * function with `game`, `canvas`, `ui`, `ChatMessage`, `Roll`, `CONFIG`,
 * `foundry`, etc. available as globals, so top-level `await` and `return`
 * are valid here. We deliberately resolve the acting actor from
 * `game.user.character` / the controlled token only (never the injected
 * `actor` scope var) so the body has no dependency on Foundry's macro-scope
 * parameter names and can't shadow-redeclare them.
 */

/** Resolve the acting actor + this actor's specific forged item (by forgeId). */
const RESOLVE_ACTOR_AND_ITEM = `
const acting = game.user?.character ?? canvas?.tokens?.controlled?.[0]?.actor ?? null;
if (!acting) { ui.notifications.warn(META.itemName + ": assign a character to your user, or select your token, then activate again."); return; }
const forgeItem = acting.items?.find((i) => i.getFlag(MODULE_ID, "forge")?.forgeId === META.forgeId) ?? null;
if (!forgeItem) { ui.notifications.warn(META.itemName + ": the acting character isn't carrying this item."); return; }
`;

/** Block when out of daily charges (does NOT consume). */
const CHARGE_CHECK = `
const forgeFlag = forgeItem.getFlag(MODULE_ID, "forge") ?? {};
const forgeUses = forgeFlag.uses ?? null;
if (forgeUses && typeof forgeUses.value === "number" && forgeUses.value <= 0) {
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: acting }), content: "<strong>" + META.itemName + "</strong> has no activations remaining. It recharges during daily preparations." });
  return;
}
`;

/**
 * Consume one charge BEFORE running the effect. Decrementing first is the
 * standard single-click double-fire mitigation: a second click re-reads the
 * flag and (usually) sees 0. It is not a hard mutex against a genuine
 * same-tick double dispatch, which is acceptable for click-driven use.
 */
const CHARGE_CONSUME = `
if (forgeUses && typeof forgeUses.value === "number") {
  try { await forgeItem.setFlag(MODULE_ID, "forge", foundry.utils.mergeObject(forgeFlag, { uses: { value: forgeUses.value - 1 } }, { inplace: false })); }
  catch (e) { console.error(MODULE_ID + " | itemforge: failed to decrement charges", e); }
}
`;

/** Require at least one target; abort (without consuming) when none. */
const REQUIRE_TARGETS = `
const targets = Array.from(game.user?.targets ?? []).filter((t) => t?.actor);
if (!targets.length) { ui.notifications.warn(META.itemName + ": target one or more tokens first, then activate again."); return; }
`;

/** Serialize the header constants shared by every template. */
function header({ forgeId, itemName, itemLevel }, params, extra = {}) {
  const lines = [
    `const MODULE_ID = ${JSON.stringify(MODULE_ID)};`,
    `const META = ${JSON.stringify({ forgeId, itemName, itemLevel })};`,
    `const P = ${JSON.stringify(params ?? {})};`
  ];
  for (const [name, value] of Object.entries(extra)) {
    lines.push(`const ${name} = ${JSON.stringify(value)};`);
  }
  return lines.join("\n");
}

/* -------------------- template bodies -------------------- */

/**
 * damage: roll a PF2e damage card (so the built-in Apply Damage / Apply Half /
 * Apply Double buttons appear) at every user target, optionally preceded by a
 * saving-throw card per target. We deliberately do NOT auto-branch damage on
 * the save result — the save card shows pass/fail and the player clicks the
 * appropriate Apply button, which is exactly how published save-for-damage
 * effects play and leans entirely on battle-tested system UI.
 */
const DAMAGE_BODY = `
${REQUIRE_TARGETS}
${CHARGE_CHECK}
${CHARGE_CONSUME}
if (P.saveType && P.dc) {
  for (const t of targets) {
    try {
      const save = t.actor.saves?.[P.saveType];
      if (save && typeof save.roll === "function") {
        await save.roll({ dc: { value: P.dc }, item: forgeItem, extraRollOptions: ["item:activation:" + META.forgeId] });
      } else { throw new Error("no '" + P.saveType + "' save statistic on actor"); }
    } catch (e) {
      console.error(MODULE_ID + " | itemforge: save roll failed", e);
      ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: t.actor }), content: t.actor.name + " must attempt a DC " + P.dc + " " + P.saveType + " save." });
    }
  }
}
const saveNote = P.saveType ? (" — DC " + P.dc + " " + (P.basicSave ? "basic " : "") + P.saveType + " save") : "";
try {
  const DamageRoll = game.pf2e?.DamageRoll ?? CONFIG.Dice?.rolls?.find((r) => r.name === "DamageRoll");
  if (!DamageRoll) throw new Error("DamageRoll class unavailable");
  const roll = await new DamageRoll("(" + P.damageDice + ")[" + P.damageType + "]").evaluate();
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: acting }),
    flavor: "<strong>" + META.itemName + "</strong>" + saveNote,
    flags: { pf2e: { context: { type: "damage-roll" } } }
  });
} catch (e) {
  console.error(MODULE_ID + " | itemforge: damage card failed, falling back to a plain roll", e);
  try {
    const roll = await new Roll(P.damageDice).evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: acting }), flavor: META.itemName + ": " + P.damageDice + " " + P.damageType + " damage" + saveNote + " (apply manually)." });
  } catch (e2) {
    console.error(MODULE_ID + " | itemforge: plain damage roll failed", e2);
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: acting }), content: META.itemName + ": deal " + P.damageDice + " " + P.damageType + " damage" + saveNote + " (apply manually)." });
  }
}
`;

/**
 * heal: a healing chat card to the first user target, or the acting actor when
 * nothing is targeted (self-heal fallback). Same card-first / plain-fallback
 * shape as damage.
 */
const HEAL_BODY = `
${CHARGE_CHECK}
${CHARGE_CONSUME}
const targets = Array.from(game.user?.targets ?? []).filter((t) => t?.actor);
const healActor = targets[0]?.actor ?? acting;
try {
  const DamageRoll = game.pf2e?.DamageRoll ?? CONFIG.Dice?.rolls?.find((r) => r.name === "DamageRoll");
  if (!DamageRoll) throw new Error("DamageRoll class unavailable");
  const roll = await new DamageRoll("(" + P.healDice + ")[healing]").evaluate();
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: healActor }),
    flavor: "<strong>" + META.itemName + "</strong> — healing " + healActor.name,
    flags: { pf2e: { context: { type: "damage-roll" } } }
  });
} catch (e) {
  console.error(MODULE_ID + " | itemforge: heal card failed, falling back to a plain roll", e);
  try {
    const roll = await new Roll(P.healDice).evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: healActor }), flavor: META.itemName + ": heal " + healActor.name + " for the rolled amount." });
  } catch (e2) {
    console.error(MODULE_ID + " | itemforge: plain heal roll failed", e2);
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: healActor }), content: META.itemName + ": heal " + healActor.name + " for " + P.healDice + "." });
  }
}
`;

/**
 * condition: apply a named condition to each user target. When a save is
 * defined we roll it and only apply on a DETECTED failure (degree of success
 * < 2); if the degree can't be read we apply and note it, and if the save API
 * itself fails we post a plain "must attempt a save; on a failure apply X"
 * message and leave application to the GM. Duration is shown as text only —
 * increaseCondition doesn't take a duration, so we don't fake enforcing one.
 */
const CONDITION_BODY = `
${REQUIRE_TARGETS}
${CHARGE_CHECK}
${CHARGE_CONSUME}
const valueText = P.value ? (" " + P.value) : "";
const durationText = P.duration ? (" for " + P.duration) : "";
for (const t of targets) {
  const tActor = t.actor;
  let applies = true;
  if (P.saveType && P.dc) {
    try {
      const save = tActor.saves?.[P.saveType];
      if (save && typeof save.roll === "function") {
        const outcome = await save.roll({ dc: { value: P.dc }, item: forgeItem, extraRollOptions: ["item:activation:" + META.forgeId] });
        const dos = outcome?.degreeOfSuccess ?? outcome?.options?.degreeOfSuccess;
        if (typeof dos === "number") {
          if (dos >= 2) applies = false;
        } else {
          // The roll happened but its result shape wasn't what we expected —
          // do NOT default to "applies" here, that would silently turn a
          // save-negates effect into an always-hit one. Degrade the same way
          // as a failed API call: tell the table to adjudicate it themselves.
          console.warn(MODULE_ID + " | itemforge: could not read the save's degree of success; skipping auto-apply so the table can adjudicate manually");
          ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: tActor }), content: tActor.name + " attempted a DC " + P.dc + " " + P.saveType + " save (result unclear to the macro) — apply " + P.conditionSlug + valueText + durationText + " manually if it failed." });
          applies = false;
        }
      } else { throw new Error("no '" + P.saveType + "' save statistic on actor"); }
    } catch (e) {
      console.error(MODULE_ID + " | itemforge: condition save roll failed", e);
      ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: tActor }), content: tActor.name + " must attempt a DC " + P.dc + " " + P.saveType + " save; on a failure, apply " + P.conditionSlug + valueText + durationText + "." });
      applies = false;
    }
  }
  if (!applies) continue;
  try {
    if (typeof tActor.increaseCondition === "function") {
      await tActor.increaseCondition(P.conditionSlug, P.value ? { value: P.value } : {});
    } else if (typeof tActor.toggleCondition === "function") {
      await tActor.toggleCondition(P.conditionSlug);
    } else { throw new Error("no condition API on actor"); }
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: acting }), content: "<strong>" + META.itemName + "</strong>: applied " + P.conditionSlug + valueText + durationText + " to " + tActor.name + "." });
  } catch (e) {
    console.error(MODULE_ID + " | itemforge: condition application failed", e);
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: acting }), content: "<strong>" + META.itemName + "</strong>: apply " + P.conditionSlug + valueText + durationText + " to " + tActor.name + " manually." });
  }
}
`;

/**
 * selfBuff: create a transient PF2e Effect item on the acting actor carrying
 * the CLONED (never hand-authored) Rule Elements — RULES is baked in at build
 * time by cloneRulesForEffects, exactly as passive items are assembled. Both
 * durations null => an "until removed" effect (unlimited), rather than
 * guessing an auto-expiry mechanism we can't verify.
 */
const SELF_BUFF_BODY = `
${CHARGE_CHECK}
${CHARGE_CONSUME}
const effectData = {
  name: P.effectName,
  type: "effect",
  img: "icons/svg/upgrade.svg",
  system: {
    description: { value: P.description ? ("<p>" + P.description + "</p>") : "" },
    rules: RULES,
    level: { value: META.itemLevel },
    duration: DURATION,
    start: { value: 0, initiative: null },
    tokenIcon: { show: true },
    badge: null
  }
};
try {
  await acting.createEmbeddedDocuments("Item", [effectData]);
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: acting }), content: "<strong>" + acting.name + "</strong> activates <strong>" + META.itemName + "</strong>: " + P.effectName + "." });
} catch (e) {
  console.error(MODULE_ID + " | itemforge: selfBuff effect creation failed", e);
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: acting }), content: "<strong>" + META.itemName + "</strong>: apply <em>" + P.effectName + "</em> to " + acting.name + " manually. " + (P.description || "") });
}
`;

/** Build the PF2e Effect `duration` object from the normalized selfBuff params. */
function effectDuration(params) {
  if (params.durationRounds) return { value: params.durationRounds, unit: "rounds", sustained: false, expiry: "turn-end" };
  if (params.durationMinutes) return { value: params.durationMinutes, unit: "minutes", sustained: false, expiry: "turn-end" };
  return { value: -1, unit: "unlimited", sustained: false, expiry: null };
}

/* -------------------- command assembly -------------------- */

/**
 * Build the full macro `command` string for a normalized activation. Async
 * because the selfBuff template clones real Rule Elements at build time.
 * @param {object} activation  normalized activation ({template, actionCost, params})
 * @param {object} meta        {forgeId, itemName, itemLevel}
 * @returns {Promise<string>}  the macro command (a JS script body)
 */
export async function buildActivationCommand(activation, meta) {
  const { template, params } = activation;
  switch (template) {
    case "damage":
      return `${header(meta, params)}\n${RESOLVE_ACTOR_AND_ITEM}\n${DAMAGE_BODY}`;
    case "heal":
      return `${header(meta, params)}\n${RESOLVE_ACTOR_AND_ITEM}\n${HEAL_BODY}`;
    case "condition":
      return `${header(meta, params)}\n${RESOLVE_ACTOR_AND_ITEM}\n${CONDITION_BODY}`;
    case "selfBuff": {
      // Clone the real Rule Elements now and embed them as a constant — the
      // macro never re-derives them at runtime.
      const { rules } = await cloneRulesForEffects(params.ruleEffectKinds);
      const extra = { RULES: rules, DURATION: effectDuration(params) };
      return `${header(meta, params, extra)}\n${RESOLVE_ACTOR_AND_ITEM}\n${SELF_BUFF_BODY}`;
    }
    default:
      throw new Error(`unknown activation template "${template}"`);
  }
}

/* -------------------- macro document creation -------------------- */

/** Find (or create) the dedicated macro folder for forged-item companions. */
export async function ensureForgeMacroFolder() {
  const existing = game.folders?.find((f) => f.type === "Macro" && f.name === MACRO_FOLDER_NAME);
  if (existing) return existing;
  try {
    return await Folder.create({ name: MACRO_FOLDER_NAME, type: "Macro" });
  } catch (err) {
    console.warn(`${MODULE_ID} | itemforge: could not create macro folder`, err);
    return null;
  }
}

/**
 * Create the companion World Macro for a freshly-created activated item, then
 * store its UUID back on the item and append a clickable @UUID[Macro.…]{Activate}
 * link to the item description. Returns the created Macro (or null on failure —
 * the item still exists, just without its one-click macro).
 * @param {object} args
 * @param {Item} args.item      the created forged item (carries the forge flag)
 * @param {object} args.concept normalized concept (carries .activation, .level, .name)
 */
export async function createActivationMacro({ item, concept }) {
  const forge = item.getFlag(MODULE_ID, "forge");
  if (!forge?.forgeId || !concept.activation) return null;

  const meta = { forgeId: forge.forgeId, itemName: item.name, itemLevel: concept.level };
  const command = await buildActivationCommand(concept.activation, meta);

  const folder = await ensureForgeMacroFolder();
  const macro = await Macro.create({
    name: `Activate: ${item.name}`,
    type: "script",
    img: item.img ?? "icons/svg/dice-target.svg",
    command,
    folder: folder?.id ?? null,
    flags: { simplypf2e: { forgeId: forge.forgeId } }
  });
  if (!macro) return null;

  // Record the macro UUID for the delete-cleanup hook, and add the clickable
  // Activate link to the description's mechanical summary.
  const link = `<p>@UUID[${macro.uuid}]{${game.i18n.localize("SIMPLYPF2E.ItemForge.Activate")}}</p>`;
  const description = (item.system?.description?.value ?? "") + "\n" + link;
  await item.update({
    "flags.simplypf2e.activationMacroUuid": macro.uuid,
    "system.description.value": description
  });
  return macro;
}
