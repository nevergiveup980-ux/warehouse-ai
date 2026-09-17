import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../build145-inventory-replay-guard.js',import.meta.url),'utf8');
const context={window:{},console};vm.runInNewContext(source,context);
const g=context.window.RUNLUInventoryReplayGuardBuild145;
const INV='runlu_inventory_records_v21';
const row=(id,masterId,quantity,extra={})=>({inventoryId:id,masterId,po:'181276',location:'Receiving / Put-away Pending',unit:'Roll',quantity,...extra});
const remote=[
 {dataset_key:INV,record_id:'CANON',payload:row('CANON','PRD-0010',20),deleted_at:null},
 {dataset_key:INV,record_id:'OLD-DUP',payload:row('OLD-DUP','PRD-0010',20),deleted_at:'2026-09-17T00:00:00Z'}
];
assert.equal(g.allowBootstrapInventoryAdoption(row('OLD-DUP','PRD-0010',20),remote).allow,false,'tombstoned ID must never resurrect');
assert.equal(g.allowBootstrapInventoryAdoption(row('OTHER-OLD-ID','PRD-0010',20),remote).allow,false,'same business entity under another old ID must not resurrect');
assert.equal(g.allowBootstrapInventoryAdoption(row('UNKNOWN-OLD','PRD-0099',7),remote).allow,false,'unproven local-only bootstrap inventory must not become cloud authority');
const fresh=row('INV-NEW-RECEIVING','PRD-0099',7,{po:'181999'});
assert.equal(g.allowLiveSaveMutation(INV,'upsert',fresh).allow,true,'fresh receiving inventory mutation must pass');
assert.equal(g.allowLiveSaveMutation('runlu_operations_log_v52','upsert',{id:'OP-NEW'}).allow,true,'non-inventory business writes must pass');
assert.equal(g.allowLiveSaveMutation(INV,'delete',fresh).allow,true,'legitimate live inventory delete must pass');
console.log('Build145 inventory replay guard: PASS');
