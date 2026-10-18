import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('function exportEmergencyOfflineQueue(){');
const end=html.indexOf('\nfunction exportBackup(',start);
assert.ok(start>=0&&end>start,'emergency export function exists');
const fn=html.slice(start,end);
function run(raw){
 const downloads=[],alerts=[],writes=[];
 const ctx={RECORD_SYNC_OUTBOX_KEY:'runlu_record_sync_outbox_v1',localStorage:{getItem:k=>raw,setItem:(...a)=>writes.push(a),removeItem:(...a)=>writes.push(a)},downloadJSON:(...a)=>downloads.push(a),alert:m=>alerts.push(m),location:{origin:'https://warehouse.runlu.ca',pathname:'/'},Date,JSON,String};
 vm.createContext(ctx);vm.runInContext(fn,ctx);
 const result=vm.runInContext('exportEmergencyOfflineQueue()',ctx);
 return {downloads,alerts,writes,result};
}
test('exports raw queue without mutating storage',()=>{
 const raw='[{"operation_id":"abc"},{"operation_id":"def"}]';
 const r=run(raw);
 assert.equal(r.result,true);assert.equal(r.writes.length,0);assert.equal(r.downloads.length,1);
 assert.equal(r.downloads[0][0].rawOutbox,raw);assert.equal(r.downloads[0][0].operationCount,2);
 assert.match(r.downloads[0][1],/^RUNLU_OFFLINE_QUEUE_EMERGENCY_/);
});
test('exports malformed queue bytes for forensic recovery',()=>{
 const raw='[{"operation_id":"abc"';
 const r=run(raw);assert.equal(r.result,true);assert.equal(r.downloads[0][0].rawOutbox,raw);assert.ok(r.downloads[0][0].parseError);assert.equal(r.writes.length,0);
});
test('missing queue does not fabricate an export',()=>{
 const r=run(null);assert.equal(r.result,false);assert.equal(r.downloads.length,0);
});
test('emergency button is present',()=>assert.match(html,/onclick="exportEmergencyOfflineQueue\(\)"/));
