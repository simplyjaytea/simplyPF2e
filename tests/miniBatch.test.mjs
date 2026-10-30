import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEDICATION_EXTRA_TRAINING } from '../scripts/pc-skills.mjs';
import { limitForgeBaseCandidates } from '../scripts/compendium.mjs';
const dedication = JSON.parse(readFileSync(new URL('./fixtures/pc-caster/investigator-dedication.json', import.meta.url), 'utf8'));
assert.deepEqual(DEDICATION_EXTRA_TRAINING, {'investigator-dedication': 1});
assert.ok(dedication.system.description.value.includes('You become trained in Society and another skill of your choice.'));
assert.equal(DEDICATION_EXTRA_TRAINING['bard-dedication'] ?? 0, 0);
for (const kind of ['weapon', 'armor']) {
  const entries = Array.from({length: 90}, (_, i) => ({name:`Base ${String(i).padStart(3,'0')}`,kind}));
  const result = limitForgeBaseCandidates(entries, 'I want base 089 with a magical storm');
  assert.equal(result.length, 40, `${kind} cap`);
  assert.ok(result.some(x => x.name === 'Base 089'), `${kind} exact named item survives`);
  assert.deepEqual(result, limitForgeBaseCandidates(entries, 'I want base 089 with a magical storm'));
  assert.equal(limitForgeBaseCandidates(entries, '').length, 40);
  const allNamed = entries.slice(40).map(x => x.name).join(', ');
  assert.equal(limitForgeBaseCandidates(entries, allNamed).length, 50, 'all exact names survive above the cap');
}
// A trait match must outrank unrelated alphabetically earlier bases even when
// the request does not mention the item's name.
const traitPool = Array.from({length: 60}, (_, i) => ({name: `Base ${String(i).padStart(3, '0')}`, traits: []}));
traitPool.push({name: 'Moon Glaive', traits: ['reach']});
const reachBases = limitForgeBaseCandidates(traitPool, 'a reach weapon');
assert.equal(reachBases[0].name, 'Moon Glaive', 'trait relevance must rank the matching item first');
assert.ok(reachBases.some(item => item.name === 'Moon Glaive'), 'trait relevance must retain the item in the shortlist');
console.log('miniBatch: fixture, cap and exact-name retention passed');
