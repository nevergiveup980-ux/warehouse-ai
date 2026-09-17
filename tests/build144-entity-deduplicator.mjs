import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const store=new Map();globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))};
globalThis.window=globalThis;globalThis.document={readyState:'loading',addEventListener(){},documentElement:{setAttribute(){}}};
const rows=[
{id:'A',masterId:'PRD-1',po:'181700',location:'2A',quantity:10,unit:'Box',created:'old'},
{id:'B',masterId:'PRD-1',po:'181700',location:'2A',quantity:10,unit:'Box',created:'new'},
{id:'C',masterId:'PRD-1',po:'181701',location:'2A',quantity:10,unit:'Box'},
{id:'D',masterId:'PRD-1',po:'181700',location:'2B',quantity:10,unit:'Box'},
{id:'E',masterId:'PRD-1',po:'181700',location:'2A',quantity:11,unit:'Box'},
{id:'F',masterId:'PRD-2',po:'181700',location:'2A',quantity:10,unit:'Box'},
{id:'RC1',masterId:'PRD-C',po:'181702',location:'3D',quantity:8.5833,unit:'Foot',rollNumber:'RC2253',category:'Carpet'},
{id:'RC2',masterId:'PRD-C',po:'181702',location:'3D',quantity:8.5833,unit:'Foot',rollNumber:'RC2253',category:'Carpet'}];
store.set('runlu_inventory_records_v21',JSON.stringify(rows));
vm.runInThisContext(fs.readFileSync('build144-safe-data-hygiene.js','utf8'));
const p=RUNLUEntityDeduplicatorBuild144.planInventory();assert.equal(p.length,1,'only exact stable inventory identity may group');assert.equal(p[0].remove.length,1);assert.equal(p[0].key,'prd-1|181700|2a|box|10');
assert.equal(RUNLUEntityDeduplicatorBuild144.isProtected(rows[6]),true,'carpet roll protected');
assert.notEqual(RUNLUEntityDeduplicatorBuild144.inventoryKey(rows[0]),RUNLUEntityDeduplicatorBuild144.inventoryKey(rows[2]),'different PO must not merge');
assert.notEqual(RUNLUEntityDeduplicatorBuild144.inventoryKey(rows[0]),RUNLUEntityDeduplicatorBuild144.inventoryKey(rows[3]),'different location must not merge');
assert.notEqual(RUNLUEntityDeduplicatorBuild144.inventoryKey(rows[0]),RUNLUEntityDeduplicatorBuild144.inventoryKey(rows[4]),'different quantity must not merge');
assert.notEqual(RUNLUEntityDeduplicatorBuild144.inventoryKey(rows[0]),RUNLUEntityDeduplicatorBuild144.inventoryKey(rows[5]),'different product must not merge');
assert.equal(rows.length,8,'planner must not mutate source');assert.equal(JSON.parse(store.get('runlu_inventory_records_v21')).length,8,'planner must not write inventory');
console.log('Build144 entity dedupe safety regression PASS');
