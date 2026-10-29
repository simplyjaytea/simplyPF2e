// The Rule Elements destination for parcel items (feat/re-folder): the pure decisions behind the Forge's world folder,
// and the eligibility gate that the option opens, against the real pf2e 8.5.0 fixture of a rule-bearing item.
// Run: node tests/parcel.reFolder.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DESTINATION, destinationFor, hasRuleElements, splitPermanents, folderItemProblem
} from "../scripts/parcel-folder.mjs";
import { permanentDocumentProblem, permanentSourceProblem } from "../scripts/treasure-permanent.mjs";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/parcel/${name}.json`, import.meta.url), "utf8"));
const CLOAK = fixture("aerial-cloak");
const HEARING = fixture("magical-hearing-aid");
const plain = (value) => JSON.parse(JSON.stringify(value));

/* ---- the destination of one built source ---- */
assert.equal(CLOAK.system.rules.length, 2, "the real Aerial Cloak carries two Rule Elements");
assert.equal(hasRuleElements(CLOAK), true);
assert.equal(hasRuleElements(HEARING), false, "the hearing aid carries none");
assert.equal(hasRuleElements({ system: { rules: null } }), false, "missing rules are not rule-bearing");
assert.equal(destinationFor(CLOAK), DESTINATION.FOLDER, "a rule-bearing item goes to the world folder");
assert.equal(destinationFor(HEARING), DESTINATION.LOOT, "a rule-free item stays on the loot actor");

/* ---- the split of built entries ---- */
const entries = [
  { filled: true, name: "Aerial Cloak", source: plain(CLOAK) },
  { filled: true, name: "Magical Hearing Aid", source: plain(HEARING) },
  { filled: false, name: null, source: null }
];
const split = splitPermanents(entries);
assert.deepEqual(split.folder.map((entry) => entry.name), ["Aerial Cloak"], "only the rule-bearing entry goes to the folder");
assert.deepEqual(split.loot.map((entry) => entry.name), ["Magical Hearing Aid"], "the rest stay on the loot actor");
assert.deepEqual(splitPermanents([{ filled: false }]), { loot: [], folder: [] }, "unfilled slots go nowhere");
assert.deepEqual(splitPermanents(undefined), { loot: [], folder: [] }, "a missing list splits to nothing");

/* ---- Create-time verification of the world items ---- */
const ISSUED = "Compendium.pf2e.equipment-srd.Item.cloak001";
const folderSources = [{ ...plain(CLOAK), _stats: { compendiumSource: ISSUED } }];
const worldItem = (overrides = {}) => ({ id: "w1", name: CLOAK.name, folder: { id: "f1" }, _stats: { compendiumSource: ISSUED }, system: { rules: plain(CLOAK.system.rules) }, ...overrides });
assert.equal(folderItemProblem([worldItem()], folderSources, "f1"), null, "an unchanged clone in the folder passes");
assert.equal(folderItemProblem([], folderSources, "f1"), "count", "a missing item fails the count");
assert.equal(folderItemProblem([worldItem(), worldItem()], folderSources, "f1"), "count", "an extra item fails the count");
assert.equal(folderItemProblem([worldItem({ id: undefined })], folderSources, "f1"), "missing", "an item without an id fails");
assert.equal(folderItemProblem([worldItem({ name: "Other" })], folderSources, "f1"), "name", "a renamed item fails");
assert.equal(folderItemProblem([worldItem({ system: { rules: [] } })], folderSources, "f1"), "rules", "an item whose Rule Elements were stripped fails");
assert.equal(folderItemProblem([worldItem({ folder: { id: "elsewhere" } })], folderSources, "f1"), "folder", "an item outside the new folder fails");
assert.equal(folderItemProblem([worldItem({ folder: "f1" })], folderSources, "f1"), null, "a folder given as a bare id also passes");

/* ---- persisted identity and full rule equality (CR HIGH #2): the same count is not enough ---- */
assert.equal(CLOAK.system.rules[0].value, 1, "the first Rule Element of the cloak is a +1 modifier");
const withRule = (index, change) => { const rules = plain(CLOAK.system.rules); Object.assign(rules[index], change); return rules; };
assert.equal(folderItemProblem([worldItem({ system: { rules: withRule(0, { value: 99 }) } })], folderSources, "f1"), "rules",
  "a same-count clone whose modifier changed from 1 to 99 is refused");
assert.equal(folderItemProblem([worldItem({ system: { rules: withRule(1, { selector: "perception" }) } })], folderSources, "f1"), "rules",
  "a same-count clone whose second rule changed selector is refused");
assert.equal(folderItemProblem([worldItem({ _stats: { compendiumSource: "Compendium.other.Item.x" } })], folderSources, "f1"), "source",
  "a mismatched source identity is refused");
assert.equal(folderItemProblem([worldItem({ _stats: undefined })], folderSources, "f1"), "source",
  "a persisted item with no source identity is refused");
assert.equal(folderItemProblem([worldItem({ _source: { system: { rules: withRule(0, { value: 99 }) } } })], folderSources, "f1"), "rules",
  "the stored _source is the document compared, not the display copy");
assert.equal(folderItemProblem([worldItem({ system: { rules: plain(CLOAK.system.rules).map((r) => Object.fromEntries(Object.entries(r).reverse())) } })], folderSources, "f1"), null,
  "the same rules with keys stored in another order are equal");

/* ---- the eligibility gate: off is the v2 exclusion, on admits rules and nothing else ---- */
assert.equal(permanentDocumentProblem(CLOAK, 3, "common"), "rules", "option off: the rule-bearing document is refused, as before");
assert.equal(permanentDocumentProblem(CLOAK, 3, "common", { allowRules: false }), "rules", "explicitly off is the same");
assert.equal(permanentDocumentProblem(CLOAK, 3, "common", { allowRules: true }), null, "option on: the same document is eligible");
assert.equal(permanentDocumentProblem(CLOAK, 4, "common", { allowRules: true }), "level", "option on keeps the level check");
assert.equal(permanentDocumentProblem(CLOAK, 3, "uncommon", { allowRules: true }), null, "option on keeps the rarity cap");
assert.equal(permanentDocumentProblem(CLOAK, 3, "common", { allowRules: true, allowWand: true }), null, "unrelated options are untouched");
assert.equal(permanentDocumentProblem({ ...plain(CLOAK), system: { ...plain(CLOAK.system), rules: null } }, 3, "common", { allowRules: true }), "rules",
  "option on still requires a rules list");
assert.equal(permanentDocumentProblem(HEARING, 1, "common", { allowRules: true }), null, "a rule-free item is unchanged by the option");

/* ---- the same gate at Create time, against a built source ---- */
assert.equal(permanentSourceProblem(plain(CLOAK), [3], "common"), "rules", "Create refuses a rule-bearing source with the option off");
assert.equal(permanentSourceProblem(plain(CLOAK), [3], "common", { allowRules: true }), null, "Create admits it with the option on");
assert.equal(permanentSourceProblem(plain(CLOAK), [4], "common", { allowRules: true }), "level", "Create still checks the slot level");
assert.equal(permanentSourceProblem(plain(HEARING), [1], "common"), null, "a rule-free source passes either way");

console.log("parcel.reFolder.test.mjs: rule-bearing items go to the world folder only with the option, and the created items must match what was sent");
