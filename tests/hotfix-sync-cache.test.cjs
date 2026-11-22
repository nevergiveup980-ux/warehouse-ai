const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('index.html','utf8');
function functionBody(name,next){
 const start=source.indexOf('function '+name+'(');
 assert.ok(start>=0,'missing '+name);
 const end=source.indexOf(next,start);
 assert.ok(end>start,'missing boundary '+next);
 return source.slice(start,end);
}
function storage(seed={}){
 const m=new Map(Object.entries(seed));
 return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};
}
test('stale generation discards device cache and requires fresh cloud bootstrap',()=>{
 const store=storage({inventory:'[{"id":12}]',bootstrap:'1',cursor:'27',generation:'old'});
 const code=functionBody('recordSyncPrepareGeneration','function recordSyncId(');
 const context={localStorage:store,RECORD_SYNC_GENERATION_KEY:'generation',RECORD_SYNC_GENERATION:'current',RECORD_SYNC_OUTBOX_KEY:'outbox',RECORD_SYNC_BOOTSTRAP_KEY:'bootstrap',RECORD_SYNC_CURSOR_KEY:'cursor',DATA_KEYS:['inventory'],cloudApplying:false};
 vm.createContext(context);vm.runInContext(code,context);
 assert.equal(context.recordSyncPrepareGeneration(),true);
 assert.equal(store.getItem('inventory'),null);
 assert.equal(store.getItem('cursor'),null);
 assert.equal(store.getItem('bootstrap'),null);
 assert.equal(store.getItem('generation'),'current');
 assert.equal(context.cloudApplying,false);
});
test('stale offline operations cannot override cloud after migration',()=>{
 const store=storage({inventory:'[{"id":12}]',bootstrap:'1',cursor:'27',generation:'old',outbox:'[{"operation_id":"p"}]'});
 const context={localStorage:store,RECORD_SYNC_GENERATION_KEY:'generation',RECORD_SYNC_GENERATION:'current',RECORD_SYNC_OUTBOX_KEY:'outbox',RECORD_SYNC_BOOTSTRAP_KEY:'bootstrap',RECORD_SYNC_CURSOR_KEY:'cursor',DATA_KEYS:['inventory'],cloudApplying:false};
 vm.createContext(context);vm.runInContext(functionBody('recordSyncPrepareGeneration','function recordSyncId('),context);
 assert.equal(context.recordSyncPrepareGeneration(),true);
 assert.equal(store.getItem('inventory'),null);
 assert.equal(store.getItem('outbox'),null);
});
test('bulk device upload is disabled',async()=>{
 const code=source.slice(source.indexOf('async function cloudUploadAll(){'),source.indexOf('async function cloudPutDatasetInitial('));
 const alerts=[];
 const context={alert:x=>alerts.push(x)};
 vm.createContext(context);vm.runInContext(code,context);
 assert.equal(await context.cloudUploadAll(),false);
 assert.match(alerts[0],/Bulk upload.*disabled/);
});
test('duplicate identities cannot be queued to cloud',()=>{
 const store=storage();
 const code=functionBody('queueRecordDeltaSave','async function recordSyncPush(');
 const context={localStorage:store,CLOUD_LAST_ERROR_KEY:'error',cloudApplying:false,recordSyncReady:()=>true,DATA_KEYS:['inventory'],recordSyncId:(x)=>String(x.id),recordSyncOutbox:()=>[],cloudDeviceId:()=> 'device',crypto:{randomUUID:()=> 'uuid'},recordSyncPayload:x=>x,recordSyncSameAsLatestPending:()=>false,setRecordSyncOutbox:()=>{throw Error('must not queue')}};
 vm.createContext(context);vm.runInContext(code,context);
 assert.throws(()=>context.queueRecordDeltaSave('inventory',[],[{id:1},{id:1}]),/Duplicate record identity/);
 assert.match(store.getItem('error'),/Duplicate record identity/);
});

test('cloud identity wins over colliding legacy local identity',()=>{
 const start=source.indexOf('function recordSyncId('),end=source.indexOf('function recordSyncOutbox(',start);
 assert.ok(start>=0&&end>start);
 const context={};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 const rows=[{id:'shared',_cloudRecordId:'other'},{id:'legacy',_cloudRecordId:'shared'}];
 assert.equal(context.recordSyncFindExistingIndex(rows,'shared'),1);
 assert.equal(context.recordSyncFindExistingIndex([{id:42}],'42'),0);
 assert.equal(context.recordSyncFindExistingIndex([{id:42}],'absent'),-1);
});

test('cloud success timestamp requires completed pull after empty outbox',()=>{
 const start=source.indexOf('async function recordSyncNow(');
 const end=source.indexOf('async function cloudUploadAll(',start);
 assert.ok(start>=0&&end>start);
 const sync=source.slice(start,end);
 assert.match(sync,/const canPull=!remainingOutbox&&!protectedInputActive\(\)/);
 assert.match(sync,/if\(canPull\)await recordSyncPull\(\)/);
 assert.match(sync,/if\(canPull\)\{localStorage\.removeItem\(CLOUD_LAST_ERROR_KEY\);localStorage\.setItem\(CLOUD_LAST_OK_KEY/);
});

test('legacy whole-dataset cloud upload cannot overwrite record-sync cloud master',async()=>{
 const start=source.indexOf('async function cloudPutDataset('),end=source.indexOf('function queueCloudSave(',start);
 assert.ok(start>=0&&end>start);
 const code=source.slice(start,end);
 const context={cloudApplying:false,localStorage:storage({enabled:'1'}),CLOUD_ENABLED_KEY:'enabled',DATA_KEYS:['inventory'],recordSyncReady:()=>true,cloudEnsureSession:()=>{throw Error('legacy cloud request must never execute')}};
 vm.createContext(context);vm.runInContext(code,context);
 await assert.rejects(context.cloudPutDataset('inventory',[{id:'stale'}]),/Legacy whole-dataset upload is disabled/);
});

test('quantity correction never reports cloud success before sync acknowledgement',()=>{
 const start=source.indexOf('async function editInventoryQuantity(');
 const end=source.indexOf('\nfunction esc(',start);
 assert.ok(start>=0&&end>start);
 const code=source.slice(start,end);
 assert.match(code,/await recordSyncNow\(true\)/);
 assert.match(code,/recordSyncOutbox\(\)\.some\(op=>op\.dataset_key===INVDB/);
 assert.match(code,/if\(pending\|\|cloudError\)/);
 assert.match(code,/cloud save is NOT confirmed/);
 assert.ok(code.indexOf('await recordSyncNow(true)')<code.indexOf('Quantity correction acknowledged by cloud sync'));
});

test('inventory deletion requires cloud readiness and acknowledged tombstone',()=>{
 const start=source.indexOf('async function removeInventory('),end=source.indexOf('\nfunction adjust(',start);
 assert.ok(start>=0&&end>start);
 const fn=source.slice(start,end);
 assert.match(fn,/if\(!cloudSession\(\)\|\|!recordSyncReady\(\)\)/);
 assert.match(fn,/await recordSyncNow\(true\)/);
 assert.match(fn,/recordSyncOutbox\(\)\.some\(op=>op\.dataset_key===INVDB/);
 assert.match(fn,/if\(pending\|\|cloudError\)/);
 assert.ok(fn.indexOf('await recordSyncNow(true)')<fn.indexOf('Inventory deletion acknowledged by cloud sync'));
});
