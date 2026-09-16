import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../build143-pending-overlay-recovery.js',import.meta.url),'utf8');
const store=new Map();
const localStorage={
  get length(){return store.size},
  key(i){return [...store.keys()][i]??null},
  getItem(k){return store.has(String(k))?store.get(String(k)):null},
  setItem(k,v){store.set(String(k),String(v))},
  removeItem(k){store.delete(String(k))}
};
const listeners={};
const document={
  readyState:'loading',visibilityState:'visible',
  addEventListener(name,fn){listeners['d:'+name]=fn},
  getElementById(){return null},
  documentElement:{setAttribute(){}}
};
let renderOperations=0;
const window={document,localStorage,addEventListener(name,fn){listeners['w:'+name]=fn},renderOperations(){renderOperations++},renderDashboard(){},renderInventory(){}};
window.window=window;
const context={window,document,localStorage,console,setTimeout,clearTimeout,setInterval,clearInterval};
vm.runInNewContext(source,context,{filename:'build143-pending-overlay-recovery.js'});
const api=window.RUNLUPendingOverlayRecoveryBuild143;
assert(api,'Build143 API should be installed');

const Q='runlu_cloud_master_offline_queue_v680';
const OPS='runlu_operations_log_v52';
const ORD='runlu_orders_v20';
const CONFLICTS='runlu_cloud_master_record_conflicts_v680';

// Cloud pull currently shows only the newest operation. Two earlier work records are still
// fully preserved in the Cloud Master queue; one cloud row has a stale copy of a pending edit.
localStorage.setItem(OPS,JSON.stringify([
  {id:'NEW',date:'2026-09-16',po:'181643',collection:'Stability',quantity:64,unit:'Box'},
  {id:'EDIT',date:'2026-09-16',po:'181600',collection:'Old cloud wording',quantity:10,unit:'Box'}
]));
localStorage.setItem(ORD,JSON.stringify([{id:'ORDER-CLOUD',date:'2026-09-16',customer:'Cloud'}]));
const queue=[
  {id:'Q1',datasetKey:OPS,recordId:'MISSING-1',op:'upsert',payload:{id:'MISSING-1',date:'2026-09-16',po:'181641',collection:'Earlier work A',quantity:12,unit:'Box'},queuedAt:'2026-09-16T18:10:00Z',blocked:true},
  {id:'Q2',datasetKey:OPS,recordId:'MISSING-2',op:'upsert',payload:{id:'MISSING-2',date:'2026-09-16',po:'181642',collection:'Earlier work B',quantity:7,unit:'Box'},queuedAt:'2026-09-16T18:20:00Z'},
  {id:'Q3',datasetKey:OPS,recordId:'EDIT',op:'upsert',payload:{id:'EDIT',date:'2026-09-16',po:'181600',collection:'Pending device wording',quantity:11,unit:'Box'},queuedAt:'2026-09-16T18:30:00Z',blocked:true},
  {id:'Q4',datasetKey:OPS,recordId:'DELETE-ME',op:'delete',payload:{id:'DELETE-ME',date:'2026-09-16',po:'181500'},queuedAt:'2026-09-16T18:40:00Z'},
  {id:'Q5',datasetKey:ORD,recordId:'ORDER-LOCAL',op:'upsert',payload:{id:'ORDER-LOCAL',date:'2026-09-16',customer:'Pending local order',quantity:2,unit:'Box'},queuedAt:'2026-09-16T18:50:00Z'}
];
localStorage.setItem(Q,JSON.stringify(queue));
localStorage.setItem(CONFLICTS,JSON.stringify([{queueId:'Q1',recordId:'MISSING-1'},{queueId:'Q3',recordId:'EDIT'}]));

let r=api.overlayPendingWork({render:true});
assert.equal(r.restored,3,'two missing operations and one pending order should be restored');
assert.equal(r.updated,1,'pending device edit should overlay stale cloud copy');
assert.equal(r.removed,0,'absent pending delete has nothing to remove');
let ops=JSON.parse(localStorage.getItem(OPS));
assert.equal(ops.length,4,'cloud operation plus two recovered rows plus edited row');
assert(ops.some(x=>x.id==='MISSING-1'&&x.po==='181641'));
assert(ops.some(x=>x.id==='MISSING-2'&&x.po==='181642'));
assert.equal(ops.find(x=>x.id==='EDIT').collection,'Pending device wording');
assert.equal(ops.find(x=>x.id==='EDIT').quantity,11);
assert.equal(JSON.parse(localStorage.getItem(ORD)).some(x=>x.id==='ORDER-LOCAL'),true);
assert.deepEqual(JSON.parse(localStorage.getItem(Q)),queue,'recovery must never alter the Cloud Master queue');
assert.equal(JSON.parse(localStorage.getItem(CONFLICTS)).length,2,'recovery must never resolve conflicts');
assert(renderOperations>0,'recovery should refresh Operations when rows return');

// Idempotent: rerunning does not duplicate records.
r=api.overlayPendingWork({render:false});
assert.equal(r.restored,0);
assert.equal(r.updated,0);
assert.equal(JSON.parse(localStorage.getItem(OPS)).length,4);

// A pending delete must stay deleted even if a cloud pull reintroduces it locally.
ops=JSON.parse(localStorage.getItem(OPS));ops.push({id:'DELETE-ME',date:'2026-09-16',po:'181500'});localStorage.setItem(OPS,JSON.stringify(ops));
r=api.overlayPendingWork({render:false});
assert.equal(r.removed,1);
assert.equal(JSON.parse(localStorage.getItem(OPS)).some(x=>x.id==='DELETE-ME'),false);

// Simulate a Cloud Master pull dropping pending rows again. The Build143 sync wrapper must
// restore them after the pull without turning the failed/paused sync into success.
window.runluCloudMasterSync=async()=>{
  localStorage.setItem(OPS,JSON.stringify([{id:'NEW',date:'2026-09-16',po:'181643',collection:'Stability',quantity:64,unit:'Box'}]));
  return false;
};
assert(api.installSyncOverlay());
const syncResult=await window.runluCloudMasterSync({silent:true});
assert.equal(syncResult,false,'Build143 must preserve underlying sync result');
ops=JSON.parse(localStorage.getItem(OPS));
assert(ops.some(x=>x.id==='MISSING-1'),'queued work must return after paused cloud pull');
assert(ops.some(x=>x.id==='MISSING-2'),'all queued work must return after paused cloud pull');
assert(ops.some(x=>x.id==='EDIT'&&x.collection==='Pending device wording'),'pending edit must return after cloud pull');

console.log(JSON.stringify({ok:true,build:api.build,recovered:ops.map(x=>x.id)},null,2));
