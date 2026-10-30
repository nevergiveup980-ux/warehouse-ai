const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../tools/cross-tab-recovery-gate-draft.js'),'utf8');
function gate(request){
 const window={navigator:{locks:{request}}};
 vm.runInNewContext(source,{window});
 return window.RUNLURecoveryGate;
}
test('recovery refuses when another tab holds the lock',async()=>{
 const g=gate(async(name,options,callback)=>callback(null));
 await assert.rejects(g.withRecoveryLock(()=>true),/Another warehouse tab/);
});
test('sync skips when recovery holds exclusive lock',async()=>{
 const g=gate(async(name,options,callback)=>callback(null));
 const result=await g.withSyncLock(()=>{throw Error('must not run');});
 assert.equal(result.status,'blocked-by-another-tab');
});
test('exclusive recovery invokes task once',async()=>{
 let calls=0;
 const g=gate(async(name,options,callback)=>{
  assert.equal(options.mode,'exclusive');
  assert.equal(options.ifAvailable,true);
  return callback({name});
 });
 assert.equal(await g.withRecoveryLock(async()=>++calls),1);
 assert.equal(calls,1);
});
test('exclusive sync invokes task once',async()=>{
 let calls=0;
 const g=gate(async(name,options,callback)=>{
  assert.equal(options.mode,'exclusive');
  return callback({name});
 });
 assert.equal(await g.withSyncLock(async()=>++calls),1);
});
test('unsupported Web Locks fail closed',async()=>{
 const window={navigator:{}};
 vm.runInNewContext(source,{window});
 await assert.rejects(window.RUNLURecoveryGate.withRecoveryLock(()=>true),/unsupported/);
});

test('sync callbacks cannot overlap recovery using a simulated lock',async()=>{
 let held=false, release;
 const g=gate(async(name,options,callback)=>{
  assert.equal(options.mode,'exclusive');
  if(held)return callback(null);
  held=true;
  try{return await callback({name});}
  finally{held=false;}
 });
 const recovery=g.withRecoveryLock(async()=>new Promise(resolve=>{release=resolve;}));
 await Promise.resolve();
 const skipped=await g.withSyncLock(()=>{throw Error('sync must not run during recovery');});
 assert.equal(skipped.status,'blocked-by-another-tab');
 release('done');
 assert.equal(await recovery,'done');
 assert.equal(await g.withSyncLock(()=> 'synchronized'),'synchronized');
});

test('two simultaneous sync attempts never execute the second writer',async()=>{
 let held=false,releaseFirst,firstWrites=0,secondWrites=0;
 const g=gate(async(name,options,callback)=>{
  assert.equal(options.mode,'exclusive');
  assert.equal(options.ifAvailable,true);
  if(held)return callback(null);
  held=true;
  try{return await callback({name});}
  finally{held=false;}
 });
 const first=g.withSyncLock(async()=>{
  firstWrites++;
  return new Promise(resolve=>{releaseFirst=resolve;});
 });
 await Promise.resolve();
 const second=await g.withSyncLock(async()=>{secondWrites++;return 'unsafe';});
 assert.equal(second.status,'blocked-by-another-tab');
 assert.equal(firstWrites,1);
 assert.equal(secondWrites,0);
 releaseFirst('first-completed');
 assert.equal(await first,'first-completed');
 assert.equal(await g.withSyncLock(async()=>{secondWrites++;return 'later';}),'later');
 assert.equal(secondWrites,1);
});
test('lock is released when a sync task throws',async()=>{
 let held=false;
 const g=gate(async(name,options,callback)=>{
  if(held)return callback(null);
  held=true;
  try{return await callback({name});}
  finally{held=false;}
 });
 await assert.rejects(g.withSyncLock(async()=>{throw Error('simulated network failure');}),/simulated network failure/);
 assert.equal(await g.withSyncLock(async()=> 'retry-ok'),'retry-ok');
});
