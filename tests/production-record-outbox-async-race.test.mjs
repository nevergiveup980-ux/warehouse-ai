import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('async function recordSyncPush(');
const end=html.indexOf('\nasync function recordSyncBootstrap(',start);
assert.ok(start>=0&&end>start,'recordSyncPush source must exist');
const pushSource=html.slice(start,end);

function harness(initial,respond){
 let queue=structuredClone(initial);
 const sent=[];
 const errors=new Map();
 let calls=0;
 const context={
  recordSyncReady:()=>true,
  recordSyncOutbox:()=>structuredClone(queue),
  setRecordSyncOutbox:q=>{queue=structuredClone(q)},
  cloudEnsureSession:async()=>({access_token:'test'}),
  cloudHeaders:()=>({}),
  cloudRequest:async(_path,opts)=>{const op=JSON.parse(opts.body);sent.push(op.p_operation_id);return respond(++calls,op)},
  localStorage:{setItem:(k,v)=>errors.set(k,v)},
  CLOUD_LAST_ERROR_KEY:'sync_error',
  load:()=>[],
  recordSyncId:()=>'',console
 };
 vm.createContext(context);
 vm.runInContext(pushSource,context);
 return {context,read:()=>structuredClone(queue),sent,errors,append:op=>{queue.push(structuredClone(op))},replace:q=>{queue=structuredClone(q)}};
}
const op=id=>({operation_id:id,dataset_key:'test',record_id:id,payload:{id},base_version:null,delete:false,device_id:'device'});

test('new local save while RPC awaits is not overwritten and is sent in FIFO order',async()=>{
 let release,entered;
 const gate=new Promise(resolve=>{release=resolve});
 const pending=new Promise(resolve=>{entered=resolve});
 const h=harness([op('A')],async(n)=>{if(n===1){entered();await gate}return {status:'ok'}});
 const pushing=h.context.recordSyncPush();
 await pending;
 h.append(op('B'));
 release();
 assert.equal(await pushing,2);
 assert.deepEqual(h.sent,['A','B']);
 assert.deepEqual(h.read(),[]);
});

test('queue head mutation during RPC fails closed and preserves newer operations',async()=>{
 let release,entered;
 const gate=new Promise(resolve=>{release=resolve});
 const pending=new Promise(resolve=>{entered=resolve});
 const h=harness([op('A')],async()=>{entered();await gate;return {status:'ok'}});
 const pushing=h.context.recordSyncPush();
 await pending;
 h.replace([op('B')]);
 release();
 await assert.rejects(pushing,/queue changed during sync/);
 assert.deepEqual(h.read(),[op('B')]);
});

test('non-acknowledged RPC keeps the original operation in queue',async()=>{
 const h=harness([op('A')],async()=>({status:'conflict',reason:'stale version'}));
 assert.equal(await h.context.recordSyncPush(),0);
 assert.deepEqual(h.read(),[op('A')]);
 assert.match(h.errors.get('sync_error'),/operation\(s\) retained/);
});
