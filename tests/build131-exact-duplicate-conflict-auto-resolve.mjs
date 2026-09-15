import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../build131-exact-duplicate-conflict-auto-resolve.js',import.meta.url),'utf8');
assert.match(source,/runluCloudMasterResolve\(conflict\.queueId,'cloud'\)/,'exact duplicates must keep the Cloud master copy');
assert.doesNotMatch(source,/runluCloudMasterResolve\(conflict\.queueId,'delete'\)/,'auto resolver must never tombstone/delete a record');

const store=new Map();
const localStorage={
  getItem(k){return store.has(k)?store.get(k):null},
  setItem(k,v){store.set(k,String(v))},
  removeItem(k){store.delete(k)}
};
const attrs=new Map();
const document={
  visibilityState:'visible',
  documentElement:{setAttribute(k,v){attrs.set(k,v)}},
  addEventListener(){}
};
const actions=[];
const context={
  console,
  localStorage,
  navigator:{onLine:true},
  document,
  setTimeout(){return 1},
  setInterval(){return 1},
  clearTimeout(){},
  clearInterval(){},
  window:{addEventListener(){}}
};
context.window.window=context.window;
context.window.document=document;
context.window.localStorage=localStorage;
context.window.navigator=context.navigator;
context.window.setTimeout=context.setTimeout;
context.window.setInterval=context.setInterval;
context.window.runluCloudMasterResolve=async(queueId,action)=>{
  actions.push({queueId,action});
  const conflicts=JSON.parse(localStorage.getItem('runlu_cloud_master_record_conflicts_v680')||'[]').filter(c=>c.queueId!==queueId);
  const queue=JSON.parse(localStorage.getItem('runlu_cloud_master_offline_queue_v680')||'[]').filter(q=>q.id!==queueId);
  localStorage.setItem('runlu_cloud_master_record_conflicts_v680',JSON.stringify(conflicts));
  localStorage.setItem('runlu_cloud_master_offline_queue_v680',JSON.stringify(queue));
};
vm.createContext(context);
vm.runInContext(source,context,{filename:'build131-exact-duplicate-conflict-auto-resolve.js'});

const api=context.window.RUNLUExactDuplicateConflictAutoResolverBuild131;
assert.ok(api,'Build131 API must be exported');

const exact={
  queueId:'Q1',datasetKey:'runlu_operations_log_v52',recordId:'1789502278258',op:'upsert',
  devicePayload:{id:1789502278258,po:'181599',product:'Evolved',quantity:27,unit:'Box',status:'Completed',updatedAt:'2026-09-15T10:00:00Z'},
  serverRecord:{version:4,payload:{status:'Completed',unit:'Box',quantity:27,product:'Evolved',po:'181599',id:1789502278258,updatedAt:'2026-09-15T10:05:00Z'}}
};
const changed={
  queueId:'Q2',datasetKey:'runlu_operations_log_v52',recordId:'17895081060414',op:'upsert',
  devicePayload:{id:17895081060414,po:'181495',quantity:108,unit:'Box',status:'Completed'},
  serverRecord:{version:8,payload:{id:17895081060414,po:'181495',quantity:107,unit:'Box',status:'Completed'}}
};
const deletion={
  queueId:'Q3',datasetKey:'runlu_operations_log_v52',recordId:'1789494346520',op:'delete',
  devicePayload:{id:1789494346520,po:'181236',quantity:30,unit:'Box'},
  serverRecord:{version:3,payload:{id:1789494346520,po:'181236',quantity:30,unit:'Box'}}
};

assert.equal(api.businessEquivalent(exact),true,'same business payload with only update timestamp/order differences must be auto-resolvable');
assert.equal(api.businessEquivalent(changed),false,'quantity change must require manual review');
assert.equal(api.businessEquivalent(deletion),false,'delete conflicts must never auto-resolve');

localStorage.setItem('runlu_cloud_master_record_conflicts_v680',JSON.stringify([exact,changed,deletion]));
localStorage.setItem('runlu_cloud_master_offline_queue_v680',JSON.stringify([
  {id:'Q1',datasetKey:exact.datasetKey,recordId:exact.recordId,op:'upsert'},
  {id:'Q2',datasetKey:changed.datasetKey,recordId:changed.recordId,op:'upsert'},
  {id:'Q3',datasetKey:deletion.datasetKey,recordId:deletion.recordId,op:'delete'}
]));

const result=await api.sweep('test');
assert.equal(result.resolved,1,'only exact duplicate should auto-resolve');
assert.equal(result.remaining,2,'materially different/delete conflicts must remain');
assert.deepEqual(actions,[{queueId:'Q1',action:'cloud'}],'auto cleanup must use Cloud copy, never delete');
assert.equal(api.total,1,'resolved counter should increment');
assert.equal(attrs.get('data-runlu-exact-duplicate-auto-resolver'),'resolved');

console.log('Build131 exact duplicate conflict auto-resolver: PASS');
