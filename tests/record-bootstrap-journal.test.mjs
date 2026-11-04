import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('async function recordSyncBootstrap(){'),end=html.indexOf('\nasync function recordSyncPull(){',start);
assert.ok(start>=0&&end>start);
const source=html.slice(start,end);
function run({journal=null,pending=[],failAt=null}={}){
 const values=new Map(journal===null?[]:[['journal',journal]]),writes=[];
 const localStorage={getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>{writes.push(k);if(k===failAt)throw Error('storage failure');values.set(k,v)},removeItem:k=>values.delete(k)};
 const ctx={localStorage,RECORD_SYNC_BOOTSTRAP_JOURNAL_KEY:'journal',RECORD_SYNC_CURSOR_KEY:'cursor',RECORD_SYNC_BOOTSTRAP_KEY:'bootstrapped',recordSyncOutbox:()=>pending,DATA_KEYS:['inventory'],cloudEnsureSession:async()=>({access_token:'x'}),cloudRequest:async()=>({records:[{dataset_key:'inventory',payload:{id:'1'},version:1,change_seq:3,record_id:'1'}],totalCount:1,completenessVerified:true,totalCountSource:'server',cursor:3}),cloudHeaders:()=>({}),cloudHydratePayload:async p=>p,cloudApplying:false,Number,JSON,Date,Map,Error,String};
 vm.createContext(ctx);vm.runInContext(source,ctx);return {run:()=>vm.runInContext('recordSyncBootstrap()',ctx),values,writes};
}
test('successful bootstrap clears write-ahead journal after committing',async()=>{const x=run();assert.equal(await x.run(),1);assert.equal(x.values.get('bootstrapped'),'1');assert.equal(x.values.has('journal'),false)});
test('interrupted bootstrap refuses retry without touching local records',async()=>{const x=run({journal:'{\"phase\":\"writing\"}'});await assert.rejects(x.run(),/interrupted local write/);assert.equal(x.writes.length,0)});
test('storage failure leaves journal for recovery and no committed flag',async()=>{const x=run({failAt:'inventory'});await assert.rejects(x.run(),/storage failure/);assert.equal(x.values.has('journal'),true);assert.equal(x.values.has('bootstrapped'),false)});
test('pending outbox prevents bootstrap even with journal',async()=>{const x=run({pending:[{}],journal:'{}'});await assert.rejects(x.run(),/Pending offline operations/);assert.equal(x.writes.length,0)});

function extractFunction(name,next){const start=html.indexOf('function '+name+'('),end=html.indexOf('\nfunction '+next+'(',start);assert.ok(start>=0&&end>start);return html.slice(start,end)}
test('sync ready refuses interrupted journal even if bootstrap flag is set',()=>{
 const source=html.slice(html.indexOf('function recordSyncReady(){'),html.indexOf('\nfunction recordSyncPrepareGeneration(){'));
 const ctx={localStorage:{getItem:k=>k==='journal'?'pending':k==='generation'?'current':'1'},RECORD_SYNC_BOOTSTRAP_JOURNAL_KEY:'journal',RECORD_SYNC_GENERATION_KEY:'generation',RECORD_SYNC_BOOTSTRAP_KEY:'bootstrapped',RECORD_SYNC_GENERATION:'current'};
 vm.createContext(ctx);assert.equal(vm.runInContext(source+';recordSyncReady()',ctx),false);
});
test('generation reset refuses interrupted journal without touching records',()=>{
 const start=html.indexOf('function recordSyncPrepareGeneration(){'),end=html.indexOf('\nfunction ',start+9);
 assert.ok(start>=0&&end>start);
 const ctx={localStorage:{getItem:k=>k==='journal'?'pending':null},RECORD_SYNC_BOOTSTRAP_JOURNAL_KEY:'journal',Error};
 vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);
 assert.throws(()=>vm.runInContext('recordSyncPrepareGeneration()',ctx),/interrupted bootstrap/);
});

test('journal records uncertain dataset before a failed inventory write',async()=>{const x=run({failAt:'inventory'});await assert.rejects(x.run(),/storage failure/);const j=JSON.parse(x.values.get('journal'));assert.equal(j.nextDatasetKey,'inventory');assert.equal(j.nextDatasetIndex,0);assert.equal(j.phase,'writing')});
test('failed journal write never writes inventory or bootstrap flag',async()=>{const x=run({failAt:'journal'});await assert.rejects(x.run(),/storage failure/);assert.equal(x.values.has('inventory'),false);assert.equal(x.values.has('bootstrapped'),false)});
test('restart after failed inventory write blocks retry and preserves journal',async()=>{const x=run({failAt:'inventory'});await assert.rejects(x.run(),/storage failure/);const original=x.values.get('journal');await assert.rejects(x.run(),/interrupted local write/);assert.equal(x.values.get('journal'),original)});
