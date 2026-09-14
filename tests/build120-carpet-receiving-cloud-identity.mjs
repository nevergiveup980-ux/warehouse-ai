import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../build120-carpet-receiving-cloud-identity.js',import.meta.url),'utf8');
const loader=fs.readFileSync(new URL('../release-loader.js',import.meta.url),'utf8');
const version=JSON.parse(fs.readFileSync(new URL('../version.json',import.meta.url),'utf8'));

const store=new Map();
const fields={
  operationType:{value:'Carpet Receiving'},
  operationLineType:{value:'Carpet Receiving'},
  operationRoll:{value:'RC2348',dataset:{},style:{},addEventListener(){},insertAdjacentElement(){}},
  operationManufacturerRoll:{value:''},
  operationStatus:{value:'Completed'}
};
const alerts=[];
let localRows=[];
let currentItem={type:'Carpet Receiving',roll:'RC2348',manufacturerRoll:''};
let remoteRows=[{dataset_key:'runlu_carpet_inventory_v52',record_id:'RC2348',payload:{roll:'RC2348',collection:'ELEGANT 40',colour:'LIGHT GREY',location:'6B',status:'Active'},version:1,deleted_at:null,updated_at:'2026-08-14T21:00:11Z'}];
const context={
  console,Date,JSON,encodeURIComponent,Promise,
  setTimeout(){return 1},clearTimeout(){},setInterval(){return 1},
  alert(v){alerts.push(String(v))},
  MutationObserver:class{observe(){} disconnect(){}},
  document:{readyState:'complete',body:{},getElementById(id){return fields[id]||null},addEventListener(){},createElement(){return {id:'',className:'',style:{},textContent:''}}},
  localStorage:{getItem(k){return store.has(k)?store.get(k):null},setItem(k,v){store.set(k,String(v))},removeItem(k){store.delete(k)}},
  carpetRecords(){return localRows},
  operationItemsDraft:[],
  operationItemFromForm(){return currentItem},
  async cloudEnsureSession(){return {access_token:'test',user:{id:'user-1'}}},
  cloudHeaders(){return {}},
  async cloudRequest(path){
    if(path.includes('dataset_key=eq.runlu_carpet_inventory_v52'))return remoteRows.filter(r=>r.dataset_key==='runlu_carpet_inventory_v52');
    return remoteRows;
  },
  saveOperation(){context.saved=(context.saved||0)+1;return true},
  addOperationItem(){context.added=(context.added||0)+1;return true},
  renderCloudStatus(){},
  navigator:{onLine:true},
  addEventListener(){}
};
context.window=context;
vm.runInNewContext(source,context,{filename:'build120-carpet-receiving-cloud-identity.js'});

const guard=context.RUNLUCarpetReceivingGuardBuild120;
assert.ok(guard,'Build120 API should install');
assert.equal(guard.version,'120');
assert.equal(guard.revision,'124');
assert.equal(guard.isSharedRoll('chc022'),true);
assert.equal(guard.isSharedRoll('CHC023'),true);

let result=await guard.lookupRoll('rc2348',{force:true});
assert.equal(result.status,'duplicate','cloud-only existing ordinary roll must still be detected');
assert.equal(result.record.collection,'ELEGANT 40');

result=await guard.validateReceivingBeforeMutation();
assert.equal(result.ok,false,'completed ordinary receiving must remain blocked for an existing cloud roll');
assert.equal(result.reason,'cloud-duplicate');
assert.match(alerts.at(-1),/RC2348 already exists/);

fields.operationRoll.value='RC9999';currentItem={type:'Carpet Receiving',roll:'RC9999',manufacturerRoll:'M9999'};
result=await guard.validateReceivingBeforeMutation();
assert.equal(result.ok,true,'a truly unique ordinary roll should be allowed');

localRows=[{roll:'RC7777',collection:'LOCAL ONLY',location:'2A',status:'Active'}];
fields.operationRoll.value='RC7777';currentItem={type:'Carpet Receiving',roll:'RC7777',manufacturerRoll:''};
result=await guard.validateReceivingBeforeMutation();
assert.equal(result.ok,false,'device-cache duplicate ordinary roll must be blocked immediately');
assert.equal(result.reason,'local-duplicate');
localRows=[];

// Build124: shared display Roll # may repeat across physical rolls.
remoteRows=[
  {dataset_key:'runlu_carpet_inventory_v52',record_id:'CHC022',payload:{roll:'CHC022',manufacturerRoll:'1111',collection:'CLASSIC CUT',location:'12C'},version:3,deleted_at:null},
  {dataset_key:'runlu_carpet_inventory_v52',record_id:'CHC022__OP-OLD-M-2222',payload:{roll:'CHC022',physicalRollId:'OP-OLD-M-2222',manufacturerRoll:'2222',collection:'CLASSIC CUT',location:'13A'},version:1,deleted_at:null}
];
fields.operationRoll.value='CHC022';fields.operationManufacturerRoll.value='9692';currentItem={type:'Carpet Receiving',roll:'CHC022',manufacturerRoll:'9692'};
result=await guard.lookupRoll('CHC022',{force:true});
assert.equal(result.status,'shared','CHC022 lookup must be recognized as shared policy instead of duplicate');
result=await guard.validateReceivingBeforeMutation();
assert.equal(result.ok,true,'a new CHC022 physical roll with a unique manufacturer roll must be allowed');

fields.operationManufacturerRoll.value='2222';currentItem={type:'Carpet Receiving',roll:'CHC022',manufacturerRoll:'2222'};
result=await guard.validateReceivingBeforeMutation();
assert.equal(result.ok,false,'shared display code must not weaken manufacturer-roll uniqueness');
assert.equal(result.reason,'manufacturer-duplicate');
assert.match(alerts.at(-1),/Manufacturer Roll 2222 already belongs/);

// Two CHC022 rows in one receiving batch are legal when their manufacturer rolls differ.
fields.operationManufacturerRoll.value='';currentItem=null;
context.operationItemsDraft=[
  {type:'Carpet Receiving',roll:'CHC022',manufacturerRoll:'3001'},
  {type:'Carpet Receiving',roll:'CHC022',manufacturerRoll:'3002'}
];
result=await guard.validateReceivingBeforeMutation();
assert.equal(result.ok,true,'same shared display Roll # may appear multiple times in a batch');
context.operationItemsDraft=[
  {type:'Carpet Receiving',roll:'CHC022',manufacturerRoll:'3001'},
  {type:'Carpet Receiving',roll:'CHC023',manufacturerRoll:'3001'}
];
result=await guard.validateReceivingBeforeMutation();
assert.equal(result.ok,false,'manufacturer roll cannot repeat even across shared display codes');
assert.equal(result.reason,'batch-manufacturer-duplicate');
context.operationItemsDraft=[];

assert.equal(guard.sameBusinessPayload({id:1,name:'A',updatedAt:'old'},{id:1,name:'A',updatedAt:'new'}),true,'timestamp-only differences are safe no-op conflicts');
assert.equal(guard.sameBusinessPayload({id:1,name:'A'},{id:1,name:'B'}),false,'real business differences must not be auto-resolved');

const Q='runlu_cloud_master_offline_queue_v680',C='runlu_cloud_master_record_conflicts_v680',V='runlu_cloud_master_record_versions_v680';
store.set(Q,JSON.stringify([
  {id:'Q1',datasetKey:'runlu_product_master_v21',recordId:'PRD-1',op:'upsert',payload:{id:'PRD-1',name:'Same',updatedAt:'device'}},
  {id:'Q2',datasetKey:'runlu_product_master_v21',recordId:'PRD-2',op:'upsert',payload:{id:'PRD-2',name:'Device Different'}}
]));
store.set(C,JSON.stringify([
  {queueId:'Q1',datasetKey:'runlu_product_master_v21',recordId:'PRD-1'},
  {queueId:'Q2',datasetKey:'runlu_product_master_v21',recordId:'PRD-2'}
]));
remoteRows=[
  {dataset_key:'runlu_product_master_v21',record_id:'PRD-1',payload:{id:'PRD-1',name:'Same',updatedAt:'cloud'},version:7,deleted_at:null},
  {dataset_key:'runlu_product_master_v21',record_id:'PRD-2',payload:{id:'PRD-2',name:'Cloud Different'},version:4,deleted_at:null}
];
result=await guard.reconcileNoopConflicts('test');
assert.equal(result.removed,1,'only an already-matching no-op conflict may auto-clear');
assert.equal(result.remaining,1,'divergent conflict must remain for human review');
assert.equal(JSON.parse(store.get(C)).length,1);
assert.equal(JSON.parse(store.get(Q)).length,1);
assert.equal(JSON.parse(store.get(V))['runlu_product_master_v21::PRD-1'],7);

const release=(loader.match(/const RELEASE='(\d+)'/)||[])[1];
assert.equal(release,version.build,'release loader token must match version manifest build');
assert.match(loader,/build120-carpet-receiving-cloud-identity\.js/);
assert.match(loader,/build124-shared-carpet-physical-identity\.js/);

console.log('Build120 + Build124 carpet receiving shared identity policy: PASS');
