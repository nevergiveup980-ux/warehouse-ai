import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('function exportBootstrapRecoveryDiagnostics(){');
const end=html.indexOf('\nfunction exportEmergencyOfflineQueue(){',start);
assert.ok(start>=0&&end>start);
const source=html.slice(start,end);
function run({failKey=null,downloadFails=false}={}){
 const keys=['inventory','journal','outbox','cursor','boot','generation'];
 const original=new Map(keys.map(k=>[k,'raw-'+k]));
 const reads=[],writes=[],downloads=[],alerts=[];
 const ctx={DATA_KEYS:['inventory'],RECORD_SYNC_BOOTSTRAP_JOURNAL_KEY:'journal',RECORD_SYNC_OUTBOX_KEY:'outbox',RECORD_SYNC_CURSOR_KEY:'cursor',RECORD_SYNC_BOOTSTRAP_KEY:'boot',RECORD_SYNC_GENERATION_KEY:'generation',localStorage:{getItem:k=>{reads.push(k);if(k===failKey)throw Error('read failed');return original.get(k)??null},setItem:()=>writes.push('set'),removeItem:()=>writes.push('remove')},downloadJSON:(...args)=>{if(downloadFails)throw Error('download failed');downloads.push(args)},alert:x=>alerts.push(x),location:{origin:'https://warehouse.runlu.ca',pathname:'/'},Date,JSON,Error};
 vm.createContext(ctx);return {result:vm.runInContext(source+';exportBootstrapRecoveryDiagnostics()',ctx),original,reads,writes,downloads,alerts};
}
test('diagnostic export preserves every raw key without storage writes',()=>{const x=run();assert.equal(x.result,true);assert.equal(x.downloads.length,1);const payload=x.downloads[0][0];assert.equal(payload.format,'RUNLU Bootstrap Recovery Diagnostics');for(const [k,v] of x.original)assert.equal(payload.entries[k],v);assert.equal(x.writes.length,0)});
test('storage read failure prevents download and preserves storage',()=>{const x=run({failKey:'outbox'});assert.equal(x.result,false);assert.equal(x.downloads.length,0);assert.equal(x.writes.length,0);assert.equal(x.alerts.length,1)});
test('download failure is reported without mutating warehouse state',()=>{const x=run({downloadFails:true});assert.equal(x.result,false);assert.equal(x.writes.length,0);assert.equal(x.alerts.length,1)});
