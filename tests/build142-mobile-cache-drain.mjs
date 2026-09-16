import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../build142-mobile-cache-drain.js',import.meta.url),'utf8');
const store=new Map();
const localStorage={
  get length(){return store.size},
  key(i){return [...store.keys()][i]??null},
  getItem(k){return store.has(String(k))?store.get(String(k)):null},
  setItem(k,v){store.set(String(k),String(v))},
  removeItem(k){store.delete(String(k))}
};
const document={readyState:'loading',addEventListener(){},getElementById(){return null},documentElement:{setAttribute(){}}};
let baseSaveCalls=0;
const window={document,localStorage,save:function(k,v){baseSaveCalls++;localStorage.setItem(k,JSON.stringify(v));return true;}};
window.save.__build072=true;
window.RUNLUCloudStorageRecoveryBuild141={ensureHeadroom(){},reclaimDisposable(){}};
window.window=window;
const context={window,document,localStorage,console,setTimeout,clearTimeout,setInterval,clearInterval};
vm.runInNewContext(source,context,{filename:'build142-mobile-cache-drain.js'});
const api=window.RUNLUMobileCacheDrainBuild142;
assert(api,'Build142 API should install');

const Q='runlu_cloud_master_offline_queue_v680';
const C='runlu_cloud_master_record_conflicts_v680';
const devicePayload={id:'OP-1',collection:'unifloor',color:'Onyx',po:'181499',quantity:2,unit:'Box',notes:'DEVICE-NOTES',status:'Completed',huge:'x'.repeat(15000)};
const cloudPayload={id:'OP-1',collection:'unifloor',color:'Onyx',po:'181499',quantity:2,unit:'Box',notes:'CLOUD-NOTES',status:'Completed',huge:'y'.repeat(15000)};
const q=[{id:'Q1',datasetKey:'runlu_operations_log_v52',recordId:'OP-1',op:'upsert',payload:devicePayload,baseVersion:3,blocked:true,serverRecord:{version:4,origin:'phone',updated_at:'2026-09-16',payload:cloudPayload}}];
const c=[{queueId:'Q1',datasetKey:'runlu_operations_log_v52',recordId:'OP-1',op:'upsert',devicePayload,serverRecord:{version:4,origin:'phone',updated_at:'2026-09-16',payload:cloudPayload},reason:'version_mismatch'}];
localStorage.setItem(Q,JSON.stringify(q));
localStorage.setItem(C,JSON.stringify(c));
localStorage.setItem('runlu_operations_log_v52',JSON.stringify([{id:'OP-1',po:'181499',quantity:2}]));
const before=api.bytes();
const r=api.compactBlockedMetadata();
const after=api.bytes();
assert(after<before,'redundant conflict copies should shrink local storage');
assert.equal(r.compactedQueue,1);
assert.equal(r.compactedConflicts,1);
const qAfter=JSON.parse(localStorage.getItem(Q));
const cAfter=JSON.parse(localStorage.getItem(C));
assert.equal(qAfter[0].payload.notes,'DEVICE-NOTES','authoritative pending device payload must be preserved in full');
assert.equal(qAfter[0].serverRecord.version,4,'server version required for Apply Device must be preserved');
assert.equal(qAfter[0].serverRecord.payload.collection,'unifloor','visible cloud summary fields remain available');
assert.equal(qAfter[0].serverRecord.payload.huge,undefined,'duplicated full cloud payload should not remain in blocked queue metadata');
assert.equal(cAfter[0].devicePayload.collection,'unifloor');
assert.equal(cAfter[0].devicePayload.quantity,2);
assert.equal(cAfter[0].devicePayload.notes,undefined,'conflict copy is summary-only; full device payload stays in queue');
assert.equal(JSON.parse(localStorage.getItem('runlu_operations_log_v52'))[0].po,'181499','business dataset must not be modified');

assert(api.installPinnedSaveGuard(),'save guard should install');
assert.equal(window.save.__build072,true,'pinned guard must carry Build072 marker so the old installer cannot wrap outside it again');
assert.equal(window.save.__build141StorageHeadroom,true,'Build141 installer must also leave the pinned guard alone');
assert.equal(window.save.__build142PinnedSaveGuard,true);
window.save('runlu_operations_log_v52',[{id:'OP-2',po:'181500'}]);
assert.equal(baseSaveCalls,1,'pinned guard must still delegate one normal save');
assert.equal(JSON.parse(localStorage.getItem('runlu_operations_log_v52'))[0].po,'181500');

console.log(JSON.stringify({ok:true,build:api.build,beforeBytes:before,afterBytes:after,reclaimed:before-after},null,2));
