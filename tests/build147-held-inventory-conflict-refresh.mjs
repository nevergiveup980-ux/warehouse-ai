import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../build147-held-inventory-conflict-refresh.js',import.meta.url),'utf8');
assert.ok(source.includes("m?.source==='live-save'"),'fresh live-save provenance must remain trusted');
assert.ok(source.includes("m.replayHeld=true"),'legacy Inventory evidence must be held, not deleted');
assert.ok(source.includes("heldQueueIds.has(c.queueId)"),'matching stale Inventory conflicts must stop pinning the visible cache');
assert.ok(source.includes("cache:'no-store'"),'Cloud refresh must bypass HTTP cache');

const store=new Map();
const localStorage={
  getItem:k=>store.has(k)?store.get(k):null,
  setItem:(k,v)=>store.set(k,String(v)),
  removeItem:k=>store.delete(k)
};
const INV='runlu_inventory_records_v21';
const QUEUE='runlu_cloud_master_offline_queue_v680';
const CONFLICTS='runlu_cloud_master_record_conflicts_v680';
const q=[
  {id:'Q-old',datasetKey:INV,recordId:'INV-old',op:'upsert',payload:{inventoryId:'INV-old'},baseVersion:3,blocked:true,source:''},
  {id:'Q-live',datasetKey:INV,recordId:'INV-live',op:'upsert',payload:{inventoryId:'INV-live'},baseVersion:4,blocked:false,source:'live-save'},
  {id:'Q-op',datasetKey:'runlu_operations_log_v52',recordId:'OP-SEP16',op:'upsert',payload:{id:'OP-SEP16'},baseVersion:0,blocked:false,source:''}
];
const cs=[
  {queueId:'Q-old',datasetKey:INV,recordId:'INV-old'},
  {queueId:'Q-pm',datasetKey:'runlu_product_master_v21',recordId:'PRD-0004'}
];
localStorage.setItem(QUEUE,JSON.stringify(q));
localStorage.setItem(CONFLICTS,JSON.stringify(cs));

const sandbox={
  window:{addEventListener(){}},
  document:{documentElement:{setAttribute(){}},addEventListener(){},visibilityState:'visible'},
  navigator:{onLine:true},localStorage,console,
  setTimeout:()=>0,clearTimeout:()=>{},AbortController:globalThis.AbortController,
  fetch:async()=>{throw new Error('network should not be used in policy test')}
};
vm.createContext(sandbox);
vm.runInContext(source,sandbox,{filename:'build147-held-inventory-conflict-refresh.js'});
const api=sandbox.window.RUNLUHeldInventoryRefreshBuild147;
assert.ok(api,'Build147 API missing');
const classified=api.classifyHeldInventory();
const saved=JSON.parse(localStorage.getItem(QUEUE));
assert.equal(saved.length,3,'Build147 must preserve every queue evidence row');
assert.equal(saved.find(x=>x.id==='Q-old').replayHeld,true,'old blocked Inventory upsert must be held');
assert.equal(saved.find(x=>x.id==='Q-live').replayHeld,undefined,'fresh live-save must not be reclassified');
const protectedSet=api.protectedKeys(classified);
assert.equal(protectedSet.has(INV+'::INV-old'),false,'held stale Inventory conflict must not pin stale UI data');
assert.equal(protectedSet.has(INV+'::INV-live'),true,'fresh live-save must remain protected');
assert.equal(protectedSet.has('runlu_operations_log_v52::OP-SEP16'),true,'non-Inventory recovery evidence must remain protected');
assert.equal(protectedSet.has('runlu_product_master_v21::PRD-0004'),true,'Product Master conflict must remain protected');
console.log('Build147 held Inventory conflict-isolated refresh: PASS');
