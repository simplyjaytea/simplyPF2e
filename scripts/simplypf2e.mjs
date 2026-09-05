import { MODULE_ID, registerSettings } from "./settings.mjs";
import { GeneratorApp } from "./generator-app.mjs";
import { ItemForgeApp } from "./itemforge-app.mjs";
import { SourcesConfigApp } from "./sources-app.mjs";
import { ProviderSetupApp } from "./provider-setup-app.mjs";

let app = null;
let itemForgeApp = null;

function canOpenApps() {
  if (game.system?.id !== "pf2e") {
    if (game.user?.isGM) ui.notifications.error(game.i18n.localize("SIMPLYPF2E.Errors.WrongSystem"));
    return false;
  }
  if (!game.user?.isGM) {
    ui.notifications.warn(game.i18n.localize("SIMPLYPF2E.Errors.GMOnly"));
    return false;
  }
  return true;
}

function openGenerator() {
  if (!canOpenApps()) return null;
  app ??= new GeneratorApp();
  app.render(true);
  return app;
}

function openItemForge() {
  if (!canOpenApps()) return null;
  itemForgeApp ??= new ItemForgeApp();
  itemForgeApp.render(true);
  return itemForgeApp;
}

function addDirectoryButton(html, { markerClass, icon, label, onClick, placement = "header" }) {
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root || root.querySelector(`.${markerClass}`)) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = `spf-directory-button ${markerClass}`;
  button.innerHTML = `<i class="fa-solid ${icon}"></i> ${game.i18n.localize(label)}`;
  button.addEventListener("click", onClick);

  if (placement === "below-header-actions") {
    const header = root.querySelector(".directory-header");
    const row = document.createElement("div");
    row.className = "spf-directory-row";
    row.appendChild(button);
    if (header?.parentElement) {
      header.parentElement.insertBefore(row, header.nextSibling);
    } else {
      root.appendChild(row);
    }
    return;
  }

  const target = root.querySelector(".directory-header .header-actions")
    ?? root.querySelector(".directory-header")
    ?? root;
  target.appendChild(button);
}

Hooks.once("init", () => {
  registerSettings(SourcesConfigApp, ProviderSetupApp);
  if (!Handlebars.helpers.eq) {
    Handlebars.registerHelper("eq", (a, b) => a === b);
  }
  // Shared progress-bar markup between the generator and item forge windows —
  // registered once here so both HandlebarsApplicationMixin apps can
  // {{> simplypf2e-progress}} instead of duplicating the block.
  foundry.applications.handlebars.loadTemplates({
    "simplypf2e-progress": `modules/${MODULE_ID}/templates/_progress.hbs`
  });
});

Hooks.once("ready", () => {
  if (game.system.id !== "pf2e") {
    if (game.user.isGM) {
      ui.notifications.error(game.i18n.localize("SIMPLYPF2E.Errors.WrongSystem"), { permanent: true });
    }
    return;
  }
  // Macro/console API: game.modules.get("simplypf2e").api.open()
  // and .openItemForge() for the magic item forge.
  const module = game.modules.get(MODULE_ID);
  module.api = { open: openGenerator, openItemForge };
});

/* Add a "SimplyPF2e" button to the Actors directory header (GM only). */
Hooks.on("renderActorDirectory", (_directory, html) => {
  if (!game.user.isGM || game.system.id !== "pf2e") return;
  addDirectoryButton(html, {
    markerClass: "spf-generator-directory-button",
    icon: "fa-dragon",
    label: "SIMPLYPF2E.Generator.OpenButton",
    onClick: openGenerator
  });
});

/* Add an "Item Forge" button to the Items directory header (GM only). */
Hooks.on("renderItemDirectory", (_directory, html) => {
  if (!game.user.isGM || game.system.id !== "pf2e") return;
  addDirectoryButton(html, {
    markerClass: "spf-itemforge-directory-button",
    icon: "fa-hammer",
    label: "SIMPLYPF2E.ItemForge.OpenButton",
    onClick: openItemForge,
    placement: "below-header-actions"
  });
});

/*
 * World items and their actor/token copies share a companion macro. Delete
 * it only after the last world reference disappears, and only when its own
 * forge identity agrees. The initiating client alone handles cleanup.
 */
Hooks.on("deleteItem", async (item, _options, userId) => {
  if (userId !== game.user.id) return;
  const uuid = item?.getFlag?.(MODULE_ID, "activationMacroUuid");
  const forgeId = item?.getFlag?.(MODULE_ID, "forge")?.forgeId;
  if (!uuid || !forgeId) return;
  try {
    const referencesMacro = (candidate) => candidate !== item && candidate?.uuid !== item.uuid
      && candidate?.getFlag?.(MODULE_ID, "activationMacroUuid") === uuid;
    if (Array.from(game.items ?? []).some(referencesMacro)) return;
    if (Array.from(game.actors ?? []).some((actor) => Array.from(actor.items ?? []).some(referencesMacro))) return;
    for (const scene of game.scenes ?? []) {
      if (Array.from(scene.tokens ?? []).some((token) => Array.from(token.actor?.items ?? []).some(referencesMacro))) return;
    }
    const macro = await fromUuid(uuid);
    if (macro?.documentName === "Macro" && macro.getFlag?.(MODULE_ID, "forgeId") === forgeId) await macro.delete();
  } catch (err) {
    console.warn(`${MODULE_ID} | failed to clean up activation macro ${uuid}`, err);
  }
});

/*
 * PF2e calls this hook locally on the client performing Rest for the Night
 * (src/scripts/macros/rest-for-the-night.ts), including player clients. The
 * initiating owner resets only their actor's forged daily counters.
 */
Hooks.on("pf2e.restForTheNight", async (actor) => {
  if (!actor?.isOwner || !actor.items) return;
  const updates = [];
  for (const item of actor.items) {
    const forge = item.getFlag?.(MODULE_ID, "forge");
    if (forge?.uses?.per === "day" && Number.isInteger(forge.uses.max) && forge.uses.max > 0 && forge.uses.value !== forge.uses.max) {
      updates.push({ _id: item.id, [`flags.${MODULE_ID}.forge.uses.value`]: forge.uses.max });
    }
  }
  if (updates.length) {
    try { await actor.updateEmbeddedDocuments("Item", updates); }
    catch (err) { console.warn(`${MODULE_ID} | failed to recharge forged items on rest`, err); }
  }
});
