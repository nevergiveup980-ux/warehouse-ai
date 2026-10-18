import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function source(name,next){
 const start=html.indexOf('async function '+name+'(');
 const end=html.indexOf('\nasync function '+next+'(',start);
 assert.ok(start>=0&&end>start,name+' found');
 return html.slice(start,end);
}
const bootstrap=source('recordSyncBootstrap','recordSyncPull');
const pull=source('recordSyncPull','recordSyncNow');
for(const [name,fn] of [['bootstrap',bootstrap],['pull',pull]]){
 test(name+' rejects pending outbox before cloud session/network calls',async()=>{
  let sessions=0;
  const context={recordSyncOutbox:()=>[{operation_id:'pending'}],cloudEnsureSession:async()=>{sessions++;throw new Error('should not be reached')},Error};
  vm.createContext(context);
  vm.runInContext(fn,context);
  await assert.rejects(vm.runInContext(name==='bootstrap'?'recordSyncBootstrap()':'recordSyncPull()',context),/Pending offline operations/);
  assert.equal(sessions,0);
 });
 test(name+' rejects malformed outbox without cloud access',async()=>{
  let sessions=0;
  const context={recordSyncOutbox:()=>{throw new Error('Offline record queue is unreadable')},cloudEnsureSession:async()=>{sessions++},Error};
  vm.createContext(context);
  vm.runInContext(fn,context);
  await assert.rejects(vm.runInContext(name==='bootstrap'?'recordSyncBootstrap()':'recordSyncPull()',context),/unreadable/);
  assert.equal(sessions,0);
 });
}
