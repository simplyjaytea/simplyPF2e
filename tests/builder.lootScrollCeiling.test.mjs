import assert from 'node:assert/strict';
const spells = [1, 2, 3].map(rank => ({_id:`s${rank}`, name:`Spell ${rank}`, type:'spell', system:{level:{value:rank}, traits:{value:[],rarity:'common'}}}));
const spellPack = {getIndex:async()=>spells, getDocument:async(id)=>spells.find(s=>s._id===id)};
const equipPack = {getDocument:async()=>({system:{price:{value:{gp:10}}}})};
globalThis.game = {settings:{get:()=>({spells:['test.spells'],equipment:['pf2e.equipment-srd']})},packs:new Map([['test.spells',spellPack],['pf2e.equipment-srd',equipPack]])};
const {getScrollSpellCandidates} = await import('../scripts/compendium.mjs');
const {resolveLoot} = await import('../scripts/builder.mjs');
const candidates = await getScrollSpellCandidates(3, []);
const ref = (rank)=>candidates.find(x=>x.rank===rank).ref;
const skipped=[];
const items = await resolveLoot({level:1,loot:[
 {name:'Scroll of Spell 1 (Rank 10)',quantity:1,scrollCandidate:ref(1)},
 {name:'Scroll of Spell 3 (Rank 1)',quantity:1,scrollCandidate:ref(3)},
 {name:'Scroll of Spell 2 (Rank 1)',quantity:1,scrollCandidate:ref(2)}
]}, {exactContent:true,skipped});
assert.equal(items.length,1);
assert.equal(items[0].scroll.rank,2,'issued document base rank remains minimum');
assert.equal(skipped.length,2,'over-level requested and base ranks are dropped');
