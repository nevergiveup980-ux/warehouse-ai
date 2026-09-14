import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../build125-pending-carpet-placeholder-adoption.js',import.meta.url),'utf8');

const CARPETDB='runlu_carpet_inventory_v52',EVENTDB='runlu_event_history_v52';
const clone=v=>JSON.parse(JSON.stringify(v));
const data=new Map([
  [CARPETDB,[
    {id:5,roll:'CHC022-9692',sourceRoll:'CHC022',manufacturerRoll:'9692',collection:'Classic Update',colour:'935 - Frosted Slate',length:0,originalLength:0,width:'12',location:'',status:'Pending',sourceStatus:'CHECK',measure:'TM',migrationSource:'legacy.xlsx'},
    {id:6,roll:'CHC022-2222',sourceRoll:'CHC022',manufacturerRoll:'2222',collection:'CLASSIC CUT',colour:'Frosted Slate',length:140,originalLength:140,width:'12',location:'12C',status:'Active',sourceStatus:'OK',measure:'FULL'}
  ]],
  [EVENTDB,[]]
]);
const alerts=[];
let originalSaveCalls=0,blockedBuild120Calls=0,fallbackImpactCalls=0;
const fields={
  operationType:{value:'Carpet Receiving'},
  operationLineType:{value:'Carpet Receiving'},
  operationStatus:{value:'Completed'},
  operationRoll:{value:'CHC022',dataset:{},style:{},addEventListener(){},insertAdjacentElement(){}},
  operationManufacturerRoll:{value:'9692',dataset:{},addEventListener(){}},
  build120RollIdentityHint:{textContent:'',style:{}}
};
const originalSaveOperation=function(){originalSaveCalls++;return true};
const build120SaveOperation=async function(){blockedBuild120Calls++;return false};
build120SaveOperation.__build120=true;build120SaveOperation.__original=originalSaveOperation;
const originalSetStatus=function(){return true};
const build120SetStatus=async function(){return false};
build120SetStatus.__build120=true;build120SetStatus.__original=originalSetStatus;
const originalAdd=function(){return true};
const build120Add=async function(){return false};
build120Add.__build120=true;build120Add.__original=originalAdd;

const remoteRows=[
  {record_id:'CHC022-9692',payload:clone(data.get(CARPETDB)[0]),version:1,deleted_at:null},
  {record_id:'CHC022-2222',payload:clone(data.get(CARPETDB)[1]),version:1,deleted_at:null}
];
const context={
  console,Date,JSON,Math,Promise,encodeURIComponent,
  CARPETDB,EVENTDB,
  localStorage:{getItem(){return null},setItem(){}},
  navigator:{onLine:true},
  document:{
    readyState:'complete',body:{},documentElement:{setAttribute(){}},
    getElementById(id){return fields[id]||null},addEventListener(){}
  },
  addEventListener(){},
  MutationObserver:class{observe(){} disconnect(){}},
  setTimeout(fn){fn();return 1},clearTimeout(){},setInterval(fn){fn();return 1},clearInterval(){},
  alert(v){alerts.push(String(v))},
  load(k){return clone(data.get(k)||[])},
  save(k,v){data.set(k,clone(v));return true},
  carpetRecords(){return clone(data.get(CARPETDB)||[])},
  operationRecords(){return []},
  operationItemsDraft:[],
  operationItemFromForm(){return {type:'Carpet Receiving',inventoryMode:'Stock',roll:fields.operationRoll.value,manufacturerRoll:fields.operationManufacturerRoll.value,quantity:146+1/12,collection:'CLASSIC CUT',colour:'FROSTED SLATE (GREY) 935',lot:'P54596',width:'12',location:'14D'}},
  async cloudEnsureSession(){return {access_token:'test',user:{id:'u1'}}},
  cloudHeaders(){return {}},
  async cloudRequest(){return remoteRows},
  validateOperationForImpact(){return ''},
  cleanManufacturerRoll(v){return String(v||'').trim()},
  applySingleOperationImpact(){fallbackImpactCalls++;return true},
  saveOperation:build120SaveOperation,
  addOperationItem:build120Add,
  setOperationStatus:build120SetStatus,
  manifestIssues(){return [{blocking:true,text:'This manufacturer roll already exists in Carpet Inventory.'}]}
};
context.window=context;
vm.runInNewContext(source,context,{filename:'build125-pending-carpet-placeholder-adoption.js'});

const api=context.RUNLUPendingCarpetAdoptionBuild125;
assert.ok(api);
assert.equal(api.version,'125');
assert.equal(api.isSharedRoll('chc022'),true);
assert.equal(api.isPendingPlaceholder({roll:'CHC022',manufacturerRoll:'9692'},data.get(CARPETDB)[0]),true);
assert.equal(api.isPendingPlaceholder({roll:'CHC022',manufacturerRoll:'2222'},data.get(CARPETDB)[1]),false,'active carpet must remain a true duplicate');

let v=await api.validateItems([{type:'Carpet Receiving',roll:'CHC022',manufacturerRoll:'9692'}],{requireCloud:true,announce:false});
assert.equal(v.ok,true,'matching legacy Pending placeholder must be accepted locally and in cloud');
v=await api.validateItems([{type:'Carpet Receiving',roll:'CHC022',manufacturerRoll:'2222'}],{requireCloud:true,announce:false});
assert.equal(v.ok,false,'active manufacturer roll must remain protected');

// The replacement save guard must bypass Build120's old duplicate rejection only after Build125 validation succeeds.
const saved=await context.saveOperation();
assert.equal(saved,true);
assert.equal(originalSaveCalls,1,'Build125 should call the pre-Build120 save path after safe validation');
assert.equal(blockedBuild120Calls,0,'old Build120 shared-placeholder rejection must be bypassed');

const receiving={id:200,type:'Carpet Receiving',status:'Completed',inventoryMode:'Stock',roll:'CHC022',manufacturerRoll:'9692',collection:'CLASSIC CUT',colour:'FROSTED SLATE (GREY) 935',lot:'P54596',quantity:146+1/12,width:'12',location:'14D',po:'P54596',supplier:'TEST'};
assert.equal(context.applySingleOperationImpact(receiving),true,'pending placeholder should be adopted in place');
assert.equal(fallbackImpactCalls,0,'placeholder adoption must happen before Build124/new-roll creation');
const carpets=data.get(CARPETDB);
assert.equal(carpets.length,2,'adoption must not create a second 9692 physical record');
const adopted=carpets.find(r=>String(r.id)==='5');
assert.equal(adopted.roll,'CHC022');
assert.equal(adopted.cloudRecordId,'CHC022-9692','legacy cloud record identity must remain stable');
assert.match(adopted.physicalRollId,/^LEGACY-CHC022-9692$/);
assert.equal(adopted.manufacturerRoll,'9692');
assert.equal(adopted.status,'Active');
assert.equal(adopted.measure,'FULL');
assert.equal(adopted.location,'14D');
assert.equal(adopted.lot,'P54596');
assert.equal(adopted.sourceOperationId,200);
assert.ok(adopted.length>146&&adopted.length<147);

// Manifest validation may reuse the same pending placeholder, but only for the matching shared family.
const issues=context.manifestIssues({roll:'CHC022',manufacturerRoll:'9692'},0);
assert.equal(issues.length,0);

console.log('Build125 pending shared-carpet placeholder adoption: PASS');
