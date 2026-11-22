import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('async function verifySavedBootstrapRecoveryFile(input){');
const end=html.indexOf('\nfunction exportEmergencyOfflineQueue(){',start);
assert.ok(start>=0&&end>start);
const source=html.slice(start,end);
const keys=['inventory','journal','outbox','cursor','boot','generation'];
function run({omit=null,change=null,format='RUNLU Bootstrap Recovery Diagnostics',invalid=false}={}){
 const original=Object.fromEntries(keys.map(k=>[k,'raw-'+k]));
 const entries={...original};if(omit)delete entries[omit];
 const backup={format,schema:1,entries};
 const file={text:async()=>invalid?'not-json':JSON.stringify(backup)};
 const input={files:[file],value:'chosen'};
 const alerts=[],writes=[];
 const ctx={DATA_KEYS:['inventory'],RECORD_SYNC_BOOTSTRAP_JOURNAL_KEY:'journal',RECORD_SYNC_OUTBOX_KEY:'outbox',RECORD_SYNC_CURSOR_KEY:'cursor',RECORD_SYNC_BOOTSTRAP_KEY:'boot',RECORD_SYNC_GENERATION_KEY:'generation',localStorage:{getItem:k=>change===k?'different':original[k],setItem:()=>writes.push('set'),removeItem:()=>writes.push('remove')},alert:x=>alerts.push(x),JSON,Object,Array,String,Error,input};
 vm.createContext(ctx);vm.runInContext(source,ctx);return {run:()=>vm.runInContext('verifySavedBootstrapRecoveryFile(input)',ctx),input,alerts,writes};
}
test('matching saved file verifies without any storage changes',async()=>{const x=run();assert.equal(await x.run(),true);assert.equal(x.writes.length,0);assert.equal(x.input.value,'')});
test('missing dataset is rejected',async()=>{const x=run({omit:'inventory'});assert.equal(await x.run(),false);assert.equal(x.writes.length,0)});
test('changed queue is rejected',async()=>{const x=run({change:'outbox'});assert.equal(await x.run(),false);assert.equal(x.writes.length,0)});
test('wrong file format is rejected',async()=>{const x=run({format:'unrelated'});assert.equal(await x.run(),false)});
test('invalid JSON is rejected',async()=>{const x=run({invalid:true});assert.equal(await x.run(),false)});
