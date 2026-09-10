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
let remoteRows=[{dataset_key:'runlu_carpet_inventory_v52',record_id:'RC2348',payload:{roll:'RC2348',collection:'ELEGANT 40',colour:'LIGHT GREY',location:'6B',status:'Active'},version:1,deleted_at:null,updated_at:'2026-08-14T21:00:11Z'}];
const context={
  console,Date,JSON,encodeURIComponent,Promise,
  setTimeout(){return 1},clearTimeout(){},setInterval(){return 1},
  alert(v){alerts.push(String(v))},
  MutationObserver:class{observe(){} disconnect(){}},
  document:{readyState:'complete',body:{},getElementById(id){return fields[id]||null},addEventListener(){},createElement(){return {id:'',className:'',style:{},textContent:''}}},
  localStorage:{getItem(k){return store.has(k)?store.get(k):null},setItem(k,v){store.set(k,String(v))},removeItem(k){store.delete(k)}},
  carpetRecords(){return []},
  operationItemFromForm(){return {type:'Carpet Receiving',roll:fields.operationRoll.value,manufacturerRoll:''}},
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

let result=await guard.lookupRoll('rc2348',{force:true});
assert.equal(result.status,'duplicate','cloud-only existing roll must be detected even when device cache is stale');
assert.equal(result.record.collection,'ELEGANT 40');

result=await guard.validateReceivingBeforeMutation();
assert.equal(result.ok,false,'completed receiving must be blocked for an existing cloud roll');
assert.equal(result.reason,'cloud-duplicate');
assert.match(alerts.at(-1),/RC2348 already exists/);

fields.operationRoll.value='RC9999';
result=await guard.validateReceivingBeforeMutation();
assert.equal(result.ok,true,'a truly unique roll should be allowed');

context.carpetRecords=()=>[{roll:'RC7777',collection:'LOCAL ONLY',location:'2A',status:'Active'}];
fields.operationRoll.value='RC7777';
result=await guard.validateReceivingBeforeMutation();
assert.equal(result.ok,false,'device-cache duplicate must be blocked immediately');
assert.equal(result.reason,'local-duplicate');
context.carpetRecords=()=>[];

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

assert.match(loader,/const RELEASE='120'/);
assert.match(loader,/build120-carpet-receiving-cloud-identity\.js/);
assert.equal(version.build,'120');
assert.equal(version.version,'6.12.25');

console.log('Build120 carpet receiving cloud identity + conflict reconciliation: PASS');
