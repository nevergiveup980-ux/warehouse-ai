import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../build128-carpet-cloud-identity-authority.js',import.meta.url),'utf8');
const CARPET='runlu_carpet_inventory_v52',QUEUE='runlu_cloud_master_offline_queue_v680',VERSIONS='runlu_cloud_master_record_versions_v680';
const store=new Map();
const local=[{id:1721450000186,roll:'RC2279',manufacturerRoll:'3736',location:'',length:143.5,status:'Active'}];
store.set(CARPET,JSON.stringify(local));
store.set(VERSIONS,JSON.stringify({[`${CARPET}::RC2279`]:3}));
let genericCalls=0,syncCalls=0;
function genericSave(k,v){genericCalls++;store.set(k,JSON.stringify(v));return true}
const context={
  console,Date,JSON,Math,Promise,
  localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))},
  document:{documentElement:{setAttribute(){}},readyState:'complete'},
  addEventListener(){},
  setTimeout(fn){fn();return 1},setInterval(){return 1},clearInterval(){},
  alert(){},
  save:genericSave,
  runluCloudMasterSync(){syncCalls++;return Promise.resolve(true)}
};
context.window=context;
vm.runInNewContext(source,context,{filename:'build128-carpet-cloud-identity-authority.js'});
assert.equal(context.RUNLUCarpetCloudIdentityBuild128.version,'128');
assert.equal(context.RUNLUCarpetCloudIdentityBuild128.identity(local[0]),'RC2279');

// Editing only rack/location must update RC2279, never create cloud record 1721450000186.
const edited=[{...local[0],location:'3C',updatedAt:'2026-09-14T17:13:15.930Z'}];
assert.equal(context.save(CARPET,edited),true);
assert.equal(genericCalls,0,'generic numeric-id cloud save must be bypassed for carpet');
const q=JSON.parse(store.get(QUEUE));
assert.equal(q.length,1);
assert.equal(q[0].datasetKey,CARPET);
assert.equal(q[0].recordId,'RC2279');
assert.equal(q[0].payload.location,'3C');
assert.equal(q[0].baseVersion,3);
assert.equal(syncCalls,1);

// A stale generic numeric queue entry is scrubbed rather than sent to cloud.
q.push({id:'bad',datasetKey:CARPET,recordId:'1721450000186',op:'upsert',payload:edited[0],baseVersion:0,blocked:false});
store.set(QUEUE,JSON.stringify(q));
assert.equal(context.RUNLUCarpetCloudIdentityBuild128.scrubNumericCarpetQueue(),1);
assert.equal(JSON.parse(store.get(QUEUE)).some(x=>x.recordId==='1721450000186'),false);

// Shared CHC rolls keep their explicit physical cloud identity.
assert.equal(context.RUNLUCarpetCloudIdentityBuild128.identity({roll:'CHC022',cloudRecordId:'CHC022-9692',physicalRollId:'LEGACY-CHC022-9692'}),'CHC022-9692');

console.log('Build128 carpet cloud identity authority: PASS');
