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
 assert.equal(result.status,'blocked-by-recovery');
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
test('shared sync invokes task once',async()=>{
 let calls=0;
 const g=gate(async(name,options,callback)=>{
  assert.equal(options.mode,'shared');
  return callback({name});
 });
 assert.equal(await g.withSyncLock(async()=>++calls),1);
});
test('unsupported Web Locks fail closed',async()=>{
 const window={navigator:{}};
 vm.runInNewContext(source,{window});
 await assert.rejects(window.RUNLURecoveryGate.withRecoveryLock(()=>true),/unsupported/);
});
