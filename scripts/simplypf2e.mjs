import { MODULE_ID, registerSettings } from "./settings.mjs";
import { GeneratorApp } from "./generator-app.mjs";
import { SourcesConfigApp } from "./sources-app.mjs";

let app = null;

function openGenerator() {
  app ??= new GeneratorApp();
  app.render(true);
  return app;
}

Hooks.once("init", () => {
  registerSettings(SourcesConfigApp);
  if (!Handlebars.helpers.eq) {
    Handlebars.registerHelper("eq", (a, b) => a === b);
  }
});

Hooks.once("ready", () => {
  if (game.system.id !== "pf2e") {
    if (game.user.isGM) {
      ui.notifications.error(game.i18n.localize("SIMPLYPF2E.Errors.WrongSystem"), { permanent: true });
    }
    return;
  }
  // Macro/console API: game.modules.get("simplypf2e").api.open()
  const module = game.modules.get(MODULE_ID);
  module.api = { open: openGenerator };
});

/* Add a "SimplyPF2e" button to the Actors directory header (GM only). */
Hooks.on("renderActorDirectory", (_directory, html) => {
  if (!game.user.isGM || game.system.id !== "pf2e") return;
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root || root.querySelector(".spf-directory-button")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "spf-directory-button";
  button.innerHTML = `<i class="fa-solid fa-dragon"></i> ${game.i18n.localize("SIMPLYPF2E.Generator.OpenButton")}`;
  button.addEventListener("click", openGenerator);

  const target = root.querySelector(".directory-header .header-actions")
    ?? root.querySelector(".directory-header")
    ?? root;
  target.appendChild(button);
});
