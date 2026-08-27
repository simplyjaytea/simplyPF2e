// Character items must go through PF2e's native Item.createDocuments override.
// It recursively creates ABC grants, sets their locations, and processes
// ChoiceSet/GrantItem rules. Raw items inside Actor.create bypass that path.
// Run: node scripts/pc-builder.grants.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./pc-builder.mjs", import.meta.url), "utf8");

assert.match(
  source,
  /items:\s*\[\][\s\S]*?Actor\.create\(actorData\)[\s\S]*?actor\.createEmbeddedDocuments\("Item", safeItems, \{ keepId: true \}\)/,
  "character creation must let PF2e process and recursively link embedded item grants"
);
assert.doesNotMatch(
  source,
  /resolved\.grants/,
  "SimplyPF2e must not duplicate PF2e's native ABC-grant expansion"
);
assert.match(
  source,
  /catch \(err\)[\s\S]*?await actor\.delete\(\)[\s\S]*?throw err/,
  "failed item creation must roll back the incomplete Actor"
);

console.log("pc-builder grants regression check: native PF2e item pipeline asserted");
