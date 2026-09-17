import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('../build145-inventory-replay-guard.js',import.meta.url),'utf8');
const c={window:{},console};vm.runInNewContext(src,c);const g=c.window.RUNLUInventoryReplayGuardBuild145;
const INV=g.INV;
const inv=(id,n,extra={})=>({inventoryId:id,masterId:`PRD-${String((n%40)+1).padStart(4,'0')}`,po:String(181000+(n%30)),location:`LOC-${n%20}`,unit:'Carton',quantity:(n%90)+1,...extra});
// Clean authoritative Cloud: 118 live entities.
const cloud=Array.from({length:118},(_,i)=>({dataset_key:INV,record_id:`C${i}`,payload:inv(`C${i}`,i),deleted_at:null}));
// Stale device: same 118 plus 132 reconstructed rows using different IDs but same business tuple.
const stale=cloud.map(x=>structuredClone(x.payload));
for(let i=0;i<132;i++){const base=cloud[i%118].payload;stale.push({...structuredClone(base),inventoryId:`STALE-${i}`});}
assert.equal(stale.length,250);
let adopted=0;for(const r of stale){if(g.allowBootstrapInventoryAdoption(r,cloud).allow)adopted++}
assert.equal(adopted,0,'250-row stale snapshot must not adopt Inventory into clean Cloud');
// Dirty queue contains old Inventory replays plus a real Sep16 operation and a fresh Receiving-created inventory.
const q=[];for(let i=0;i<31;i++){const base=cloud[i].payload;q.push({id:`QOLD-${i}`,datasetKey:INV,recordId:`QOLD-${i}`,op:'upsert',payload:{...structuredClone(base),inventoryId:`QOLD-${i}`}})}
q.push({id:'Q-OP',datasetKey:'runlu_operations_log_v52',recordId:'OP-SEP16',op:'upsert',payload:{id:'OP-SEP16',po:'181643'}});
q.push({id:'Q-NEW',datasetKey:INV,recordId:'INV-NEW',op:'upsert',source:'live-save',payload:inv('INV-NEW',999,{po:'181999',quantity:7})});
const pass=q.filter(m=>g.queueVerdict(m,cloud).allow);
const held=q.filter(m=>!g.queueVerdict(m,cloud).allow);
assert.equal(held.length,31,'all stale Inventory queue replays must be held');
assert.equal(pass.length,2,'real operation and fresh Receiving inventory must pass');
assert.equal(q.length,33,'quarantine must preserve original queue evidence');
assert(pass.some(x=>x.id==='Q-OP'));assert(pass.some(x=>x.id==='Q-NEW'));
assert.equal(cloud.length,118,'simulation must not mutate authoritative Cloud fixture');
console.log('Build145 Cloud118 + stale250 + dirty queue + fresh Receiving simulation: PASS');
