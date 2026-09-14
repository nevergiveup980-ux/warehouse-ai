import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../build120-carpet-receiving-completion-guard.js',import.meta.url),'utf8');
const loader=fs.readFileSync(new URL('../release-loader.js',import.meta.url),'utf8');

const alerts=[];
let local=[];
let cloud=[{record_id:'RC2348',payload:{roll:'RC2348',collection:'ELEGANT 40',colour:'LIGHT GREY',location:'6B',status:'Active'},version:1,deleted_at:null}];
let ops=[{id:101,type:'Carpet Receiving',status:'Waiting',roll:'RC2348',manufacturerRoll:'',collection:'NEW CARPET',colour:'TEST'}];
let completionCalls=0;
const context={
  console,Date,JSON,Promise,encodeURIComponent,
  setTimeout(fn){fn();return 1},clearTimeout(){},setInterval(){return 1},
  alert(v){alerts.push(String(v))},
  MutationObserver:class{observe(){} disconnect(){}},
  document:{readyState:'complete',body:{},addEventListener(){}},
  carpetRecords(){return local},
  operationRecords(){return ops},
  async cloudEnsureSession(){return {access_token:'test',user:{id:'u1'}}},
  cloudHeaders(){return {}},
  async cloudRequest(){return cloud},
  setOperationStatus(){completionCalls++;return true}
};
context.window=context;
vm.runInNewContext(source,context,{filename:'build120-carpet-receiving-completion-guard.js'});

const guard=context.RUNLUCarpetReceivingCompletionGuardBuild120;
assert.ok(guard);
assert.equal(guard.revision,'124');
let r=await guard.validateRecord(ops[0]);
assert.equal(r.ok,false);
assert.equal(r.reason,'cloud-duplicate');
assert.match(r.message,/RC2348/);

await context.setOperationStatus(101,'Completed');
assert.equal(completionCalls,0,'saved ordinary receiving must not complete when live cloud already owns the Roll #');
assert.match(alerts.at(-1),/already exists/);

ops=[{id:102,type:'Carpet Receiving',status:'Waiting',roll:'RC9999',manufacturerRoll:'M9999'}];
cloud=[];
r=await guard.validateRecord(ops[0]);
assert.equal(r.ok,true);
await context.setOperationStatus(102,'Completed');
assert.equal(completionCalls,1,'unique ordinary saved receiving may complete');

// Shared CHC display codes may coexist as separate physical rolls.
ops=[{id:104,type:'Carpet Receiving',status:'Waiting',roll:'CHC022',manufacturerRoll:'9692'}];
cloud=[
  {record_id:'CHC022',payload:{roll:'CHC022',manufacturerRoll:'1111',collection:'CLASSIC CUT',location:'12C'},version:2,deleted_at:null},
  {record_id:'CHC022__OP-OLD',payload:{roll:'CHC022',physicalRollId:'OP-OLD',manufacturerRoll:'2222',collection:'CLASSIC CUT',location:'13A'},version:1,deleted_at:null}
];
r=await guard.validateRecord(ops[0]);
assert.equal(r.ok,true,'saved CHC022 receiving may complete when manufacturer roll is unique');
await context.setOperationStatus(104,'Completed');
assert.equal(completionCalls,2);

ops=[{id:105,type:'Carpet Receiving',status:'Waiting',roll:'CHC023',manufacturerRoll:'2222'}];
r=await guard.validateRecord(ops[0]);
assert.equal(r.ok,false,'shared display code still enforces manufacturer-roll uniqueness');
assert.equal(r.reason,'manufacturer-duplicate');
await context.setOperationStatus(105,'Completed');
assert.equal(completionCalls,2,'duplicate manufacturer roll must block completion');

ops=[{id:106,type:'Carpet Receiving',status:'Waiting',items:[
  {type:'Carpet Receiving',roll:'CHC022',manufacturerRoll:'3001'},
  {type:'Carpet Receiving',roll:'CHC022',manufacturerRoll:'3002'}
]}];
cloud=[];
r=await guard.validateRecord(ops[0]);
assert.equal(r.ok,true,'multiple physical CHC022 lines in one saved receiving are valid');

ops=[{id:107,type:'Carpet Receiving',status:'Waiting',items:[
  {type:'Carpet Receiving',roll:'CHC022',manufacturerRoll:'3001'},
  {type:'Carpet Receiving',roll:'CHC023',manufacturerRoll:'3001'}
]}];
r=await guard.validateRecord(ops[0]);
assert.equal(r.ok,false);
assert.equal(r.reason,'batch-manufacturer-duplicate');

ops=[{id:103,type:'Shipping',status:'Waiting',roll:'RC2348'}];
cloud=[{record_id:'RC2348',payload:{roll:'RC2348'}}];
await context.setOperationStatus(103,'Completed');
assert.equal(completionCalls,3,'non-receiving completion must remain unchanged');

assert.match(loader,/build120-carpet-receiving-completion-guard\.js/);
assert.match(loader,/build124-shared-carpet-physical-identity\.js/);
console.log('Build120 saved Carpet Receiving completion guard + shared CHC policy: PASS');
