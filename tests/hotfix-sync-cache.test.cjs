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
test('stale generation marker retains bootstrapped local records and cursor',()=>{
 const store=storage({inventory:'[{"id":12}]',bootstrap:'1',cursor:'27',generation:'old'});
 const code=functionBody('recordSyncPrepareGeneration','function recordSyncId(');
 const context={localStorage:store,RECORD_SYNC_GENERATION_KEY:'generation',RECORD_SYNC_GENERATION:'current',RECORD_SYNC_OUTBOX_KEY:'outbox',RECORD_SYNC_BOOTSTRAP_KEY:'bootstrap',RECORD_SYNC_CURSOR_KEY:'cursor',DATA_KEYS:['inventory'],cloudApplying:false};
 vm.createContext(context);vm.runInContext(code,context);
 assert.equal(context.recordSyncPrepareGeneration(),false);
 assert.equal(store.getItem('inventory'),'[{"id":12}]');
 assert.equal(store.getItem('cursor'),'27');
 assert.equal(store.getItem('generation'),'current');
});
test('pending offline changes are never cleared by generation recovery',()=>{
 const store=storage({inventory:'[{"id":12}]',bootstrap:'1',cursor:'27',generation:'old',outbox:'[{"operation_id":"p"}]'});
 const context={localStorage:store,RECORD_SYNC_GENERATION_KEY:'generation',RECORD_SYNC_GENERATION:'current',RECORD_SYNC_OUTBOX_KEY:'outbox',RECORD_SYNC_BOOTSTRAP_KEY:'bootstrap',RECORD_SYNC_CURSOR_KEY:'cursor',DATA_KEYS:['inventory'],cloudApplying:false};
 vm.createContext(context);vm.runInContext(functionBody('recordSyncPrepareGeneration','function recordSyncId('),context);
 assert.throws(()=>context.recordSyncPrepareGeneration(),/Pending offline operations/);
 assert.equal(store.getItem('inventory'),'[{"id":12}]');
 assert.equal(store.getItem('outbox'),'[{"operation_id":"p"}]');
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
