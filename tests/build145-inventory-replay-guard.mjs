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
assert.equal(g.allowBootstrapInventoryAdoption(row('OLD-DUP','PRD-0010',20),remote).allow,false);
assert.equal(g.allowBootstrapInventoryAdoption(row('OTHER-OLD-ID','PRD-0010',20),remote).allow,false);
assert.equal(g.allowBootstrapInventoryAdoption(row('UNKNOWN-OLD','PRD-0099',7),remote).allow,false);
const dirtyQueue=[
 {id:'Q1',datasetKey:INV,recordId:'OLD-DUP',op:'upsert',payload:row('OLD-DUP','PRD-0010',20)},
 {id:'Q2',datasetKey:INV,recordId:'OTHER-OLD-ID',op:'upsert',payload:row('OTHER-OLD-ID','PRD-0010',20)},
 {id:'Q3',datasetKey:'runlu_operations_log_v52',recordId:'OP-SEP16',op:'upsert',payload:{id:'OP-SEP16'}},
 {id:'Q4',datasetKey:INV,recordId:'INV-NEW-RECEIVING',op:'upsert',source:'live-save',payload:row('INV-NEW-RECEIVING','PRD-0099',7,{po:'181999'})}
];
const verdicts=dirtyQueue.map(m=>g.queueVerdict(m,remote));
assert.equal(verdicts[0].allow,false,'tombstoned queued inventory must be quarantined');
assert.equal(verdicts[1].allow,false,'duplicate queued inventory must be quarantined');
assert.equal(verdicts[2].allow,true,'Sep16 non-inventory recovery evidence must remain flushable');
assert.equal(verdicts[3].allow,true,'fresh tagged receiving inventory must remain flushable');
assert.equal(dirtyQueue.length,4,'guard must not delete queue evidence');
const fresh=dirtyQueue[3].payload;
assert.equal(g.allowLiveSaveMutation(INV,'upsert',fresh).allow,true);
assert.equal(g.allowLiveSaveMutation('runlu_operations_log_v52','upsert',{id:'OP-NEW'}).allow,true);
assert.equal(g.allowLiveSaveMutation(INV,'delete',fresh).allow,true);
console.log('Build145 dual replay guard: PASS');
