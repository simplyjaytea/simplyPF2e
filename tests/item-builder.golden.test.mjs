// Golden regression for the Forge runed-item concept. tests/fixtures/forge-runes/normalize-cases.json holds the
// input and the output that main@74acb07 (before the dropped-rune work) produced for each rune combination.
// Replaying each case through the current normalizeRunedItemConcept must reproduce that output exactly. The only
// difference allowed is the new propertyDrops field, which is checked separately. A valid item therefore builds as
// before; a changed kept set, base, potency, secondary tier or rarity fails here.
// Run: node tests/item-builder.golden.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { issueCandidate } from "../scripts/compendium.mjs";
import { normalizeRunedItemConcept } from "../scripts/item-builder.mjs";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/forge-runes/normalize-cases.json", import.meta.url), "utf8"));
const issue = (c) => issueCandidate({ packId: "test.runes", _id: c.id }, { name: c.name, ...c.fields });

const realWarn = console.warn;
console.warn = () => {};
try {
  for (const c of fixture.cases) {
    const lists = { bases: c.bases.map(issue), runes: c.runes.map(issue), potency: c.potency.map(issue), secondary: c.secondary.map(issue) };
    // The fixture names candidates by label; the normalizer matches the issued ids, so the labels are translated here.
    const issuedId = new Map();
    for (const group of ["bases", "runes", "potency", "secondary"]) {
      c[group].forEach((spec, index) => issuedId.set(spec.id, lists[group][index].id));
    }
    const translate = (label) => (label === "none" ? label : issuedId.get(label));
    const input = {
      ...c.input, baseItemId: translate(c.input.baseItemId), potencyRuneId: translate(c.input.potencyRuneId),
      secondaryRuneId: translate(c.input.secondaryRuneId), propertyRuneIds: c.input.propertyRuneIds.map(translate)
    };
    const built = JSON.parse(JSON.stringify(normalizeRunedItemConcept(input, {
      kind: c.kind, rarity: c.rarity, maxLevel: c.maxLevel,
      baseCandidates: lists.bases, runeCandidates: lists.runes, potencyCandidates: lists.potency, secondaryCandidates: lists.secondary
    })));
    const { propertyDrops, ...rest } = built;
    assert.deepEqual(rest, c.expected, `${c.name}: the built concept matches main@74acb07`);
    assert.ok(Array.isArray(propertyDrops), `${c.name}: the drops are returned as data`);
  }
} finally {
  console.warn = realWarn;
}

// The drops the golden cases produce are the ones the preview explains.
const byName = Object.fromEntries(fixture.cases.map((c) => [c.name, c]));
assert.equal(byName["valid two runes at potency +2"].expected.propertyRunes.length, 2);

console.log(`item-builder.golden.test.mjs: ${fixture.cases.length} rune combinations reproduce main@74acb07's built concept`);
