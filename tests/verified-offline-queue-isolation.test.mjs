import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('function isolateVerifiedOfflineQueue(){');
const end=html.indexOf('function exportBootstrapRecoveryDiagnostics(){',start);
assert.ok(start>=0&&end>start);
const source=html.slice(start,end);
test('unsafe isolation is fail-closed even with verified evidence',()=>{
 const writes=[],alerts=[],storage=new Map([['outbox','[{"operation_id":"old"}]']]);
 const ctx={localStorage:{getItem:k=>storage.get(k),setItem:(...args)=>writes.push(args),removeItem:k=>writes.push(k)},verifiedOfflineQueueEvidence:{raw:storage.get('outbox'),count:1,verifiedAt:Date.now()},alert:x=>alerts.push(x)};
 vm.createContext(ctx);
 assert.equal(vm.runInContext(source+';isolateVerifiedOfflineQueue()',ctx),false);
 assert.equal(writes.length,0);
 assert.equal(storage.get('outbox'),'[{"operation_id":"old"}]');
 assert.match(alerts[0],/disabled/);
});
test('isolation button cannot be clicked during safety hold',()=>{
 assert.match(html,/button disabled[^>]*>Isolate Verified Queue \(Safety Hold\)<\/button>/);
});
