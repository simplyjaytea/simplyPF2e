import assert from 'node:assert/strict';
import { SETTINGS } from '../scripts/settings.mjs';
import { selectorSummary, chooseSpellFocus } from '../scripts/ai.mjs';
import { limitEquipmentCandidates, EQUIPMENT_CANDIDATE_LIMIT } from '../scripts/compendium.mjs';
const concept = { name:'Ariadne', level:8, ancestry:'Human', class:'Bard', blurb:'A wandering singer.', description:'A long story about the sea. '.repeat(60), traits:[], gmPrompt:'Original instruction '.repeat(250) };
const summary = selectorSummary(concept);
assert.ok(summary.length <= 360);
assert.ok(summary.includes('Ariadne') && summary.includes('Bard'));
assert.equal(summary, selectorSummary(concept));
assert.ok(!/\w$/.test(summary) || concept.description.includes(summary.split(' ').at(-1)));
const list = Array.from({length:100}, (_, i) => ({name:`Item ${i}`,type:'weapon',level:1}));
assert.equal(EQUIPMENT_CANDIDATE_LIMIT, 60);
assert.ok(limitEquipmentCandidates(list, ['item 99']).some(x => x.name === 'Item 99'));
const drafts = list.slice(0, 65).map(x => x.name);
assert.equal(limitEquipmentCandidates(list, drafts).length, 65, 'every exact draft survives even over the nominal cap');
const vals = new Map([[SETTINGS.apiBaseUrl,'http://localhost:11434/v1'],[SETTINGS.apiKey,''],[SETTINGS.model,'test'],[SETTINGS.temperature,0.8],[SETTINGS.maxTokens,8000],[SETTINGS.requestTimeout,90]]);
globalThis.game={settings:{get:(_,key)=>vals.get(key)},i18n:{localize:x=>x,format:(x,v)=>`${x}:${JSON.stringify(v)}`}};
const original=globalThis.fetch;
async function trial(first, prompt) {
 const bodies=[]; let n=0;
 globalThis.fetch=async (_url,opts)=>{ bodies.push(JSON.parse(opts.body)); n++; const content=n===1?first:'{"keywords":["fire"]}'; return new Response(JSON.stringify({choices:[{message:{content},finish_reason:'stop'}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}),{headers:{'content-type':'application/json'}}); };
 const result=await chooseSpellFocus({concept:{...concept,gmPrompt:prompt},tradition:'arcane'});
 assert.equal(n,2); assert.equal(result.usage.total,10);
 return bodies.map(b=>b.messages.find(m=>m.role==='user').content);
}
try {
 const long=await trial('{}',concept.gmPrompt);
 assert.ok(long[0].includes(concept.gmPrompt)); assert.ok(long[1].length < long[0].length); assert.ok(long[1].includes('{}') && long[1].includes('Validation error:'));
 const bad=await trial('{',concept.gmPrompt); assert.ok(bad[1].includes(concept.gmPrompt));
 let calls=0; globalThis.fetch=async()=>{ calls++; return new Response(JSON.stringify({choices:[{message:{content:'{}'},finish_reason:'stop'}]}),{headers:{'content-type':'application/json'}}); };
 await assert.rejects(chooseSpellFocus({concept,tradition:'arcane'})); assert.equal(calls,2);
 const small=await trial('{}','short request'); assert.ok(small[1].includes('short request'));
} finally {globalThis.fetch=original;}
