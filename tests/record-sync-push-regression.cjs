// Run: node tests/record-sync-push-regression.cjs
// Isolated harness: extracts the actual production function from index.html.
// No network, browser storage, or production database access.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('async function recordSyncPush()');
const end = html.indexOf('async function recordSyncBootstrap()', start);
assert(start >= 0 && end > start, 'recordSyncPush function must exist');
const source = html.slice(start, end);
async function scenario(name, response, expectedRemaining, expectedSent) {
 const outbox = [{operation_id:'op-1',dataset_key:'runlu_carpet_inventory_v52',record_id:'r-1',payload:{roll:'RC2376'}}];
 const storage = new Map();
 const context = {
  recordSyncReady:()=>true,
  recordSyncOutbox:()=>outbox.slice(),
  setRecordSyncOutbox:(next)=>{outbox.splice(0,outbox.length,...next)},
  cloudEnsureSession:async()=>({access_token:'fake'}),
  cloudRequest:async()=>{if(response instanceof Error)throw response;return response},
  cloudHeaders:()=>({}),
  CLOUD_LAST_ERROR_KEY:'last-error',
  localStorage:{setItem:(k,v)=>storage.set(k,v)},
  console:{warn:()=>{}}
 };
 vm.createContext(context);
 vm.runInContext(source, context);
 const sent = await vm.runInContext('recordSyncPush()',context);
 assert.equal(sent,expectedSent,name+' sent');
 assert.equal(outbox.length,expectedRemaining,name+' outbox');
 if(expectedRemaining)assert.match(storage.get('last-error'),/retained/,name+' error');
}
(async()=>{
 await scenario('real success',{status:'ok'},0,1);
 await scenario('operation replay success',{status:'duplicate',original:{status:'ok'}},0,1);
 await scenario('direct conflict',{status:'conflict',reason:'possible_duplicate_physical_roll'},1,0);
 await scenario('replayed conflict',{status:'duplicate',original:{status:'conflict',reason:'possible_duplicate_physical_roll'}},1,0);
 await scenario('old silent discard',{status:'ok',reason:'duplicate_carpet_record_discarded',discarded:true},1,0);
 await scenario('replayed old discard',{status:'duplicate',original:{status:'ok',reason:'duplicate_carpet_record_discarded',discarded:true}},1,0);
 await scenario('blocked',{status:'blocked',reason:'review_required'},1,0);
 await scenario('missing original',{status:'duplicate'},1,0);
 await scenario('request timeout',new Error('timeout'),1,0);
 await scenario('trigger rejection',new Error('possible_duplicate_physical_roll'),1,0);
 console.log('PASS: ten recordSyncPush regression scenarios');
})().catch(err=>{console.error(err);process.exitCode=1});
