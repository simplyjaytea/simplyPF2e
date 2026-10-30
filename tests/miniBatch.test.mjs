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
console.log('miniBatch: fixture, cap and exact-name retention passed');
