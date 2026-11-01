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
