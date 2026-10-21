import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const a=html.indexOf('async function recordSyncBootstrap('),b=html.indexOf('\nasync function recordSyncNow(',a);
assert.ok(a>=0&&b>a);
const source=html.slice(a,b);
function setup({snapshot={records:[],cursor:5},delta=[],hydrate=async p=>p,request=async path=>path.includes('snapshot')?snapshot:delta}={}){
 const data=new Map([['inventory',JSON.stringify([{id:'LOCAL',value:'original'}])],['cursor','0'],['bootstrap','1']]);
 let queue=[],writes=[];
 const ctx={recordSyncOutbox:()=>queue.slice(),cloudEnsureSession:async()=>({access_token:'fake'}),cloudRequest:request,cloudHeaders:()=>({}),cloudHydratePayload:hydrate,cloudApplying:false,DATA_KEYS:['inventory'],localStorage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>{writes.push(k);data.set(k,v)}},RECORD_SYNC_CURSOR_KEY:'cursor',RECORD_SYNC_BOOTSTRAP_KEY:'bootstrap',recordSyncPrepareGeneration:()=>false,load:k=>JSON.parse(data.get(k)||'[]'),recordSyncId:x=>String(x.id)};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 return {ctx,queue,data,writes};
}
const row={dataset_key:'inventory',record_id:'LOCAL',payload:{id:'LOCAL',value:'CLOUD'},version:2,change_seq:5};
test('bootstrap does not overwrite device after operation queued during snapshot request',async()=>{
 let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
 const h=setup({request:async()=>{entered();await gate;return {records:[row],cursor:5}}});
 const p=h.ctx.recordSyncBootstrap();await started;h.queue.push({operation_id:'new'});release();
 await assert.rejects(p,/Pending offline operations appeared during cloud bootstrap/);
 assert.equal(JSON.parse(h.data.get('inventory'))[0].value,'original');
 assert.equal(h.data.get('cursor'),'0');
});
test('pull does not overwrite device after operation queued during delta request',async()=>{
 let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
 const h=setup({request:async()=>{entered();await gate;return [row]}});
 const p=h.ctx.recordSyncPull();await started;h.queue.push({operation_id:'new'});release();
 await assert.rejects(p,/Pending offline operations appeared during cloud pull/);
 assert.equal(JSON.parse(h.data.get('inventory'))[0].value,'original');
 assert.equal(h.data.get('cursor'),'0');
});
test('pull does not overwrite device after operation queued during payload hydration',async()=>{
 let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
 const h=setup({delta:[row],hydrate:async p=>{entered();await gate;return p}});
 const p=h.ctx.recordSyncPull();await started;h.queue.push({operation_id:'new'});release();
 await assert.rejects(p,/Pending offline operations appeared during cloud hydration/);
 assert.equal(JSON.parse(h.data.get('inventory'))[0].value,'original');
 assert.equal(h.data.get('cursor'),'0');
});
test('pull applies a cloud delta normally when no local operation appears',async()=>{
 const h=setup({delta:[row]});
 assert.equal(await h.ctx.recordSyncPull(),1);
 assert.equal(JSON.parse(h.data.get('inventory'))[0].value,'CLOUD');
 assert.equal(h.data.get('cursor'),'5');
});
