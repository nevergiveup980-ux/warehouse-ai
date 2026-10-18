const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('function save(k,v){');
const end=html.indexOf('\nconst CLOUD_URL=',start);
assert(start>=0&&end>start,'save function must be found');
const source=html.slice(start,end);
function runCase(failureMode){
 const original=JSON.stringify([{id:'one',quantity:3}]);
 const queue=JSON.stringify([{operation_id:'old',record_id:'one'}]);
 const data=new Map([['inventory',original],['runlu_record_sync_outbox_v1',queue]]);
 const alerts=[];
 let failed=false;
 const storage={
  getItem:k=>data.has(k)?data.get(k):null,
  setItem(k,v){
   if(failureMode==='queue'&&k==='runlu_record_sync_outbox_v1'&&!failed){failed=true;throw new Error('Injected outbox write failure')}
   if(failureMode==='inventory'&&k==='inventory'&&!failed){failed=true;throw new Error('Injected inventory write failure')}
   data.set(k,String(v));
  },
  removeItem:k=>data.delete(k)
 };
 const context={
  localStorage:storage,JSON,console:{error(){}},alert:s=>alerts.push(s),
  load:k=>JSON.parse(storage.getItem(k)||'[]'),
  isQuotaError:()=>false,
  queueRecordDeltaSave:()=>storage.setItem('runlu_record_sync_outbox_v1',JSON.stringify([{operation_id:'new'}])),
 };
 vm.createContext(context);
 vm.runInContext(source,context);
 const result=vm.runInContext('save("inventory",[{id:"one",quantity:4}])',context);
 assert.equal(result,false,'save must not report success on injected failure');
 assert.equal(data.get('inventory'),original,'inventory must roll back');
 assert.equal(data.get('runlu_record_sync_outbox_v1'),queue,'existing outbox must remain intact');
 assert(alerts.length>0,'user must see save failure');
}
runCase('queue');
runCase('inventory');
console.log('PASS: inventory and outbox failures restore both values without false success');

function runQuotaRetryFailure(){
 const original=JSON.stringify([{id:'one',quantity:3}]);
 const queue=JSON.stringify([{operation_id:'old'}]);
 const data=new Map([['inventory',original],['runlu_record_sync_outbox_v1',queue]]);
 let attempts=0,cleanups=0;const alerts=[];
 const storage={
  getItem:k=>data.has(k)?data.get(k):null,
  setItem(k,v){if(k==='inventory'&&String(v).includes('"quantity":4')){attempts++;const e=new Error('quota');e.name='QuotaExceededError';throw e}data.set(k,String(v))},
  removeItem:k=>data.delete(k)
 };
 const context={
  localStorage:storage,JSON,console:{error(){}},alert:s=>alerts.push(s),
  load:k=>JSON.parse(storage.getItem(k)||'[]'),
  isQuotaError:e=>e.name==='QuotaExceededError',
  queueRecordDeltaSave:()=>storage.setItem('runlu_record_sync_outbox_v1','[]'),
  pruneLocalApplicationCache:()=>{cleanups++;return {reclaimedBytes:0}},
  aggressiveSafeStorageCleanup:()=>{cleanups++;return {reclaimedBytes:0}},
  renderBackupStatus:()=>{throw Error('must not show success')}
 };
 vm.createContext(context);vm.runInContext(source,context);
 assert.equal(vm.runInContext('save("inventory",[{id:"one",quantity:4}])',context),false);
 assert.equal(attempts,2,'quota should be retried only once');
 assert.equal(cleanups,2,'cleanup helpers should run');
 assert.equal(data.get('inventory'),original);
 assert.equal(data.get('runlu_record_sync_outbox_v1'),queue);
 assert(alerts.some(s=>s.includes('Local-only operations may NOT be in the cloud')));
}
function runRollbackFailure(){
 const original=JSON.stringify([{id:'one',quantity:3}]);
 const queue=JSON.stringify([{operation_id:'old'}]);
 const data=new Map([['inventory',original],['runlu_record_sync_outbox_v1',queue]]);
 const alerts=[];
 const storage={
  getItem:k=>data.has(k)?data.get(k):null,
  setItem(k,v){if(k==='runlu_record_sync_outbox_v1')throw Error('outbox unavailable');data.set(k,String(v))},
  removeItem:k=>data.delete(k)
 };
 const context={
  localStorage:storage,JSON,console:{error(){}},alert:s=>alerts.push(s),
  load:k=>JSON.parse(storage.getItem(k)||'[]'),isQuotaError:()=>false,
  queueRecordDeltaSave:()=>storage.setItem('runlu_record_sync_outbox_v1','[]')
 };
 vm.createContext(context);vm.runInContext(source,context);
 assert.equal(vm.runInContext('save("inventory",[{id:"one",quantity:4}])',context),false);
 assert(alerts.some(s=>s.includes('rollback incomplete')),'must warn user to stop editing');
 assert.equal(data.get('runlu_record_sync_outbox_v1'),queue,'original queue remains present');
 // Inventory may remain changed because storage itself is refusing rollback.
}
runQuotaRetryFailure();
runRollbackFailure();
console.log('PASS: quota retry failure and rollback failure are explicitly detected');
