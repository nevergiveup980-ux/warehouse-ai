import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../build141-cloud-storage-recovery.js',import.meta.url),'utf8');
const store=new Map();
const localStorage={
  get length(){return store.size},
  key(i){return [...store.keys()][i]??null},
  getItem(k){return store.has(String(k))?store.get(String(k)):null},
  setItem(k,v){store.set(String(k),String(v))},
  removeItem(k){store.delete(String(k))}
};
const document={
  readyState:'loading',
  addEventListener(){},
  getElementById(){return null},
  documentElement:{setAttribute(){}}
};
const window={document,localStorage};
const context={window,document,localStorage,console,setTimeout,clearTimeout,setInterval,clearInterval};
window.window=window;
vm.runInNewContext(source,context,{filename:'build141-cloud-storage-recovery.js'});
const api=window.RUNLUCloudStorageRecoveryBuild141;
assert(api,'Build141 API should be installed');

const Q='runlu_cloud_master_offline_queue_v680';
const C='runlu_cloud_master_record_conflicts_v680';
const V='runlu_cloud_master_record_versions_v680';
const E='runlu_cloud_master_last_error_v680';

const q1={id:'Q1',datasetKey:'runlu_product_master_v21',recordId:'PRD-0017',op:'upsert',payload:{id:'PRD-0017',name:'Copacabana',color:'Copacabana',updatedAt:'2026-09-16T18:00:00Z'},baseVersion:1,blocked:true};
const q2={id:'Q2',datasetKey:'runlu_product_master_v21',recordId:'PRD-0018',op:'upsert',payload:{id:'PRD-0018',name:'Palm Bay',color:'Palm Bay',sku:'DEVICE-SKU',updatedAt:'2026-09-16T18:01:00Z'},baseVersion:1,blocked:true};
const q3={id:'Q3',datasetKey:'runlu_inventory_records_v21',recordId:'INV-9',op:'delete',payload:{id:'INV-9'},baseVersion:3,blocked:true};
localStorage.setItem(Q,JSON.stringify([q1,q2,q3]));
localStorage.setItem(C,JSON.stringify([
  {queueId:'Q1',datasetKey:q1.datasetKey,recordId:q1.recordId,devicePayload:q1.payload,serverRecord:{version:7,payload:{id:'PRD-0017',name:'Copacabana',color:'Copacabana',updatedAt:'2026-09-16T18:02:00Z'}}},
  {queueId:'Q2',datasetKey:q2.datasetKey,recordId:q2.recordId,devicePayload:q2.payload,serverRecord:{version:5,payload:{id:'PRD-0018',name:'Palm Bay',color:'Palm Bay',sku:'CLOUD-SKU',updatedAt:'2026-09-16T18:02:00Z'}}},
  {queueId:'Q3',datasetKey:q3.datasetKey,recordId:q3.recordId,devicePayload:q3.payload,serverRecord:{version:4,deleted_at:'2026-09-16T18:02:00Z',payload:{id:'INV-9'}}},
  {queueId:'STALE',datasetKey:'runlu_product_master_v21',recordId:'PRD-X',devicePayload:{id:'PRD-X'},serverRecord:{version:1,payload:{id:'PRD-X'}}}
]));
localStorage.setItem(V,JSON.stringify({}));
localStorage.setItem(E,'The quota has been exceeded.');

const r=api.compactCloudState();
assert.equal(r.equivalentResolved,2,'equivalent upsert and already-deleted mutation should auto-resolve');
assert.equal(r.staleConflictRemoved,1,'orphan conflict metadata should be removed');
const qAfter=JSON.parse(localStorage.getItem(Q));
const cAfter=JSON.parse(localStorage.getItem(C));
assert.deepEqual(qAfter.map(x=>x.id),['Q2'],'genuine differing record must remain queued');
assert.deepEqual(cAfter.map(x=>x.queueId),['Q2'],'genuine differing conflict must remain reviewable');
const versions=JSON.parse(localStorage.getItem(V));
assert.equal(versions['runlu_product_master_v21::PRD-0017'],7);
assert.equal(versions['runlu_inventory_records_v21::INV-9'],4);
assert(api.equivalentPayload({name:'A',updatedAt:'x'},{name:'A',updatedAt:'y'}),'timestamps alone must not create a review conflict');
assert(!api.equivalentPayload({name:'A',sku:'1'},{name:'A',sku:'2'}),'business-field differences must stay conflicts');

// Under real storage pressure only disposable snapshots are reclaimed. Warehouse datasets
// and the remaining genuine conflict must survive.
localStorage.setItem('runlu_local_snapshots_v515',JSON.stringify([{blob:'x'.repeat(1_700_000)}]));
localStorage.setItem('runlu_operations_log_v52',JSON.stringify([{id:1,po:'KEEP-ME'}]));
const pressure=api.ensureHeadroom();
assert.equal(localStorage.getItem('runlu_local_snapshots_v515'),null,'disposable snapshots should be reclaimed under pressure');
assert.equal(JSON.parse(localStorage.getItem('runlu_operations_log_v52'))[0].po,'KEEP-ME','business data must never be removed');
assert.equal(JSON.parse(localStorage.getItem(C))[0].queueId,'Q2','real conflict must survive pressure cleanup');
assert(pressure.storageBytes<3.15*1024*1024,'cleanup should restore browser headroom');

console.log(JSON.stringify({ok:true,build:api.build,compact:r,afterPressureBytes:pressure.storageBytes},null,2));
