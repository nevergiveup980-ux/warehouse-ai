import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const code=fs.readFileSync(new URL('../build148-held-conflict-pause-isolation.js',import.meta.url),'utf8');
const INV='runlu_inventory_records_v21',Q='runlu_cloud_master_offline_queue_v680',C='runlu_cloud_master_record_conflicts_v680',S='runlu_cloud_session_v54';
const store=new Map();
const localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
localStorage.setItem(S,JSON.stringify({access_token:'test'}));
const queue=[],conflicts=[];
for(let i=0;i<82;i++){
 const held=i<70;
 const q={id:'q'+i,datasetKey:held?INV:'runlu_operations_log_v52',recordId:'r'+i,op:'upsert',blocked:true};
 if(!held)q.source='live-save'; else q.replayHeld=true;
 queue.push(q);conflicts.push({queueId:q.id,datasetKey:q.datasetKey,recordId:q.recordId});
}
localStorage.setItem(Q,JSON.stringify(queue));localStorage.setItem(C,JSON.stringify(conflicts));
let refreshCalls=0;
const listeners={};
const context={window:{RUNLUHeldInventoryRefreshBuild147:{refresh:async()=>{refreshCalls++;return true}},addEventListener:(n,f)=>listeners[n]=f},document:{documentElement:{setAttribute(){}},addEventListener(){},visibilityState:'visible'},localStorage,navigator:{onLine:true},setTimeout:()=>0,console,Date,JSON,Set,String,Promise};
context.window.window=context.window;context.window.localStorage=localStorage;context.window.navigator=context.navigator;context.window.document=context.document;
vm.createContext(context);vm.runInContext(code,context);
const api=context.window.RUNLUHeldPauseIsolationBuild148;const x=api.classify();
assert.equal(x.conflicts.length,82);assert.equal(x.heldConflicts.length,70);assert.equal(x.realConflicts.length,12);
assert.equal(JSON.parse(localStorage.getItem(Q)).length,82);assert.equal(JSON.parse(localStorage.getItem(C)).length,82);
assert.equal(await api.refresh('test'),true);assert.equal(refreshCalls,1);
assert.equal(JSON.parse(localStorage.getItem(Q)).length,82);assert.equal(JSON.parse(localStorage.getItem(C)).length,82);
assert.doesNotMatch(code,/warehouse_apply_mutation/);assert.doesNotMatch(code,/runluCloudMasterResolve/);
console.log('Build148 mixed 82-conflict pause isolation: PASS');
