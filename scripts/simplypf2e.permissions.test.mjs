// The visible Actors- and Items-directory entries are GM-only; the public
// module API must enforce the same boundary from the browser console.
// Run: node scripts/simplypf2e.permissions.test.mjs
import assert from "node:assert/strict";

let renders = 0;
class FakeApplicationV2 {
  render() { renders += 1; }
}

globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: FakeApplicationV2,
      HandlebarsApplicationMixin: (Base) => class extends Base {}
    },
    handlebars: { loadTemplates: () => {} }
  }
};
class FakeHTMLElement {
  constructor(className = "") {
    this.className = className;
    this.children = [];
    this.parentElement = null;
    this.nextSibling = null;
  }

  querySelector(selector) {
    if (selector === ".directory-header .header-actions") return this.headerActions ?? null;
    if (selector === ".directory-header") return this.directoryHeader ?? null;
    if (selector.startsWith(".")) {
      const className = selector.slice(1);
      const find = (node) => {
        if (node.className?.split(" ").includes(className)) return node;
        for (const child of node.children ?? []) {
          const found = find(child);
          if (found) return found;
        }
        return null;
      };
      return find(this);
    }
    return null;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  insertBefore(child, reference) {
    child.parentElement = this;
    const index = this.children.indexOf(reference);
    if (index < 0) this.children.push(child);
    else this.children.splice(index, 0, child);
    return child;
  }
}

function makeDirectory() {
  const root = new FakeHTMLElement();
  const header = new FakeHTMLElement("directory-header");
  header.parentElement = root;
  header.nextSibling = null;
  const actions = new FakeHTMLElement("header-actions");
  header.headerActions = actions;
  header.appendChild(actions);
  const list = new FakeHTMLElement("directory-list");
  root.directoryHeader = header;
  root.headerActions = actions;
  root.appendChild(header);
  root.appendChild(list);
  header.nextSibling = list;
  return root;
}

class FakeButton {
  constructor() {
    this.listeners = new Map();
    this.children = [];
    this.className = "";
    this.innerHTML = "";
    this.type = "";
    this.parentElement = null;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  addEventListener(name, callback) {
    this.listeners.set(name, callback);
  }

  click() {
    this.listeners.get("click")?.();
  }
}

globalThis.HTMLElement = FakeHTMLElement;
globalThis.document = { createElement: () => new FakeButton() };
globalThis.Handlebars = { helpers: {}, registerHelper: () => {} };

const onceHooks = new Map();
const onHooks = new Map();
globalThis.Hooks = {
  once: (name, callback) => onceHooks.set(name, callback),
  on: (name, callback) => onHooks.set(name, callback)
};

const moduleRecord = {};
const notices = { warn: [], error: [] };
globalThis.game = {
  system: { id: "pf2e" },
  user: { id: "player", isGM: false },
  modules: new Map([["simplypf2e", moduleRecord]]),
  i18n: { localize: (key) => key }
};
globalThis.ui = { notifications: {
  warn: (message) => notices.warn.push(message),
  error: (message) => notices.error.push(message)
} };

await import("./simplypf2e.mjs");
await onceHooks.get("ready")();

const actorDirectory = makeDirectory();
const itemDirectory = makeDirectory();
onHooks.get("renderActorDirectory")(null, actorDirectory);
onHooks.get("renderItemDirectory")(null, itemDirectory);
assert.equal(actorDirectory.headerActions.children.length, 0, "a player does not get the generator directory button");
assert.equal(itemDirectory.children.filter((child) => child.className === "spf-directory-row").length, 0,
  "a player does not get the item-forge directory row");

assert.equal(moduleRecord.api.open(), null, "a player cannot open the generator through the public API");
assert.equal(moduleRecord.api.openItemForge(), null, "a player cannot open the item forge through the public API");
assert.equal(renders, 0, "denied API calls must not instantiate or render an app");
assert.equal(notices.warn.length, 2);
assert.ok(notices.warn.every((message) => message === "SIMPLYPF2E.Errors.GMOnly"));

game.user = { id: "gm", isGM: true };
onHooks.get("renderActorDirectory")(null, actorDirectory);
onHooks.get("renderItemDirectory")(null, itemDirectory);
assert.equal(actorDirectory.headerActions.children.length, 1, "a GM gets one generator directory button");
assert.equal(itemDirectory.children.filter((child) => child.className === "spf-directory-row").length, 1,
  "a GM gets one item-forge row below the directory header");
assert.deepEqual(itemDirectory.children.map((child) => child.className),
  ["directory-header", "spf-directory-row", "directory-list"],
  "the item-forge row sits directly below native controls and above directory content");
assert.match(actorDirectory.headerActions.children[0].innerHTML, /SIMPLYPF2E\.Generator\.OpenButton/);
assert.match(itemDirectory.children[1].children[0].innerHTML, /SIMPLYPF2E\.ItemForge\.OpenButton/);

onHooks.get("renderActorDirectory")(null, actorDirectory);
onHooks.get("renderItemDirectory")(null, itemDirectory);
assert.equal(actorDirectory.headerActions.children.length, 1, "rerendering does not duplicate the generator button");
assert.equal(itemDirectory.children.filter((child) => child.className === "spf-directory-row").length, 1,
  "rerendering does not duplicate the item-forge row");

actorDirectory.headerActions.children[0].click();
itemDirectory.children[1].children[0].click();
assert.equal(renders, 2, "directory-button clicks render their respective apps");

assert.ok(moduleRecord.api.open(), "a GM can open the generator through the public API");
assert.ok(moduleRecord.api.openItemForge(), "a GM retains the documented item-forge console access");
assert.equal(renders, 4);

game.system.id = "dnd5e";
const wrongSystemItems = makeDirectory();
onHooks.get("renderItemDirectory")(null, wrongSystemItems);
assert.equal(wrongSystemItems.children.filter((child) => child.className === "spf-directory-row").length, 0,
  "the item-forge button stays hidden outside PF2e");
assert.equal(moduleRecord.api.open(), null, "the API also fails closed outside PF2e");
assert.equal(renders, 4);
assert.deepEqual(notices.error, ["SIMPLYPF2E.Errors.WrongSystem"]);

console.log("simplypf2e.permissions.test.mjs: public API permission assertions passed");
