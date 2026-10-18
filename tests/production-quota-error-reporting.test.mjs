import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('async function recordSyncNow(');
const end=html.indexOf('\nasync function cloudUploadAll(',start);
assert.ok(start>=0&&end>start,'production recordSyncNow exists');
const source=html.slice(start,end);

async function simulate({errorWriteFails=false,statusFails=false}={}){
 const errors=[];
 let busy=false, statusCalls=0, writeCalls=0;
 const context={
  cloudSyncBusy:false, cloudSession:()=>({user:{id:'test'}}),
  recordSyncPrepareGeneration:()=>{throw new Error('simulated sync failure')},
  localStorage:{setItem(){writeCalls++;if(errorWriteFails)throw Object.assign(new Error('quota exceeded'),{name:'QuotaExceededError'})}},
  CLOUD_LAST_ERROR_KEY:'cloud_error', CLOUD_ENABLED_KEY:'cloud_enabled',CLOUD_LAST_OK_KEY:'cloud_last_ok',
  updateHeaderCloudPill(){statusCalls++;if(statusFails)throw new Error('status failure')},
  console:{error:(...args)=>errors.push(args.map(String).join(' '))},
  recordSyncReady:()=>true,recordSyncBootstrap:async()=>{},recordSyncPush:async()=>{},recordSyncPull:async()=>{},
  protectedInputActive:()=>false,renderDashboard:()=>{},renderProducts:()=>{},renderInventory:()=>{},renderCarpetInventory:()=>{},
 };
 vm.createContext(context);
 vm.runInContext(source,context);
 await vm.runInContext('recordSyncNow(true)',context);
 busy=context.cloudSyncBusy;
 return {busy,statusCalls,writeCalls,errors};
}

test('sync failure is reported and busy flag resets',async()=>{
 const r=await simulate();
 assert.equal(r.busy,false);
 assert.equal(r.writeCalls,1);
 assert.equal(r.statusCalls,1);
 assert.ok(r.errors.some(x=>x.includes('simulated sync failure')));
});
test('quota failure while reporting sync error does not escape',async()=>{
 const r=await simulate({errorWriteFails:true});
 assert.equal(r.busy,false);
 assert.equal(r.statusCalls,1);
 assert.ok(r.errors.some(x=>x.includes('could not be persisted')));
});
test('status update failure does not leave sync busy',async()=>{
 const r=await simulate({statusFails:true});
 assert.equal(r.busy,false);
 assert.ok(r.errors.some(x=>x.includes('status update failed')));
});
