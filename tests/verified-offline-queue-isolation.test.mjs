import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('function isolateVerifiedOfflineQueue(){');
const end=html.indexOf('function exportEmergencyOfflineQueue(){',start);
assert.ok(start>=0&&end>start);
const fn=html.slice(start,end);
function setup({verified=true,confirmResult=true,failArchive=false,failClear=false,refreshThrows=false}={}){
 const raw='[{"operation_id":"old"}]',map=new Map([['outbox',raw]]),alerts=[];
 const storage={getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>{if(failArchive&&k.startsWith('runlu_isolated_'))throw Error('quota');if(failClear&&k==='outbox'&&v==='[]')throw Error('quota');map.set(k,v)}};
 const context={localStorage:storage,RECORD_SYNC_OUTBOX_KEY:'outbox',cloudSyncBusy:false,verifiedOfflineQueueEvidence:verified?{raw,verifiedAt:Date.now(),count:1}:null,Date,Error,alert:x=>alerts.push(x),confirm:()=>confirmResult,updateHeaderCloudPill:()=>{if(refreshThrows)throw Error('UI')},console};
 vm.createContext(context);vm.runInContext(fn,context);return {context,map,alerts,run:()=>vm.runInContext('isolateVerifiedOfflineQueue()',context)};
}
test('isolation requires verified saved evidence',()=>{const x=setup({verified:false});assert.equal(x.run(),false);assert.equal(x.map.get('outbox'),'[{"operation_id":"old"}]')});
test('cancel leaves queue unchanged',()=>{const x=setup({confirmResult:false});assert.equal(x.run(),false);assert.equal(x.map.get('outbox'),'[{"operation_id":"old"}]')});
test('archive storage failure leaves queue unchanged',()=>{const x=setup({failArchive:true});assert.equal(x.run(),false);assert.equal(x.map.get('outbox'),'[{"operation_id":"old"}]')});
test('queue clear failure retains queue and archive',()=>{const x=setup({failClear:true});assert.equal(x.run(),false);assert.equal(x.map.get('outbox'),'[{"operation_id":"old"}]');assert.ok([...x.map.keys()].some(k=>k.startsWith('runlu_isolated_')))});
test('successful isolation keeps exact local archive',()=>{const x=setup();assert.equal(x.run(),true);assert.equal(x.map.get('outbox'),'[]');assert.ok([...x.map].some(([k,v])=>k.startsWith('runlu_isolated_')&&v==='[{"operation_id":"old"}]'))});
test('UI refresh error does not misreport successful isolation',()=>{const x=setup({refreshThrows:true});assert.equal(x.run(),true);assert.equal(x.map.get('outbox'),'[]')});
