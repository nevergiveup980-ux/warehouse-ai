const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('async function recordSyncBootstrap(){');
const end=html.indexOf('async function recordSyncPull(){',start);
assert(start>=0&&end>start,'bootstrap code not found');
const source=html.slice(start,end);
async function testFailure(failKey,rollbackFailure=false){
 const data=new Map([['inventory','[]'],['orders','[]'],['cursor','17']]);
 const before=new Map(data),writes=[];
 let injected=false;
 const storage={
  getItem:k=>data.has(k)?data.get(k):null,
  setItem(k,v){
   writes.push(k);
   if(k===failKey&&!injected){injected=true;throw Error('Injected write failure')}
   if(rollbackFailure&&injected&&k==='inventory')throw Error('Injected rollback failure');
   data.set(k,String(v));
  },
  removeItem:k=>{if(rollbackFailure&&injected&&k==='inventory')throw Error('Injected rollback failure');data.delete(k)}
 };
 const ctx={
  localStorage:storage,console:{error(){}},DATA_KEYS:['inventory','orders'],
  RECORD_SYNC_CURSOR_KEY:'cursor',RECORD_SYNC_BOOTSTRAP_KEY:'boot',
  recordSyncOutbox:()=>[],recordSyncAssertBootstrapSafe:()=>{},
  cloudEnsureSession:async()=>({access_token:'test'}),
  cloudRequest:async()=>({records:[{dataset_key:'inventory',record_id:'new',payload:{id:'new'},version:1,change_seq:2}],cursor:42}),
  cloudHeaders:()=>({}),cloudHydratePayload:async x=>x,
  cloudApplying:false,Map,JSON,Number,String,Error
 };
 vm.createContext(ctx);vm.runInContext(source,ctx);
 let error;try{await vm.runInContext('recordSyncBootstrap()',ctx)}catch(e){error=e}
 assert(error,'bootstrap must reject partial write');
 assert.equal(ctx.cloudApplying,false,'cloud applying flag must reset');
 assert.equal(data.get('boot'),undefined,'completion marker must not be set');
 if(rollbackFailure){assert.match(error.message,/rollback was incomplete/)}
 else{
  assert.deepEqual([...data],[...before],'all local keys restored after partial write');
  assert(writes.includes('inventory'),'inventory write must have been attempted');
 }
}
(async()=>{
 await testFailure('orders');
 await testFailure('cursor');
 await testFailure('boot');
 await testFailure('orders',true);
 console.log('PASS: bootstrap partial-write, cursor, marker and rollback-failure scenarios');
})().catch(e=>{console.error(e);process.exitCode=1});
