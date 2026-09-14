import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../build126-finalize-pending-carpet-arrival.js',import.meta.url),'utf8');
const CARPETDB='runlu_carpet_inventory_v52',EVENTDB='runlu_event_history_v52';
const clone=v=>JSON.parse(JSON.stringify(v));
const data=new Map([
  [CARPETDB,[
    {id:1,roll:'CHC022-9692',sourceRoll:'CHC022',manufacturerRoll:'9692',collection:'Classic Update',colour:'935 - Frosted Slate',length:0,originalLength:0,width:'12',location:'',status:'Pending',sourceStatus:'CHECK',measure:'TM'},
    {id:2,roll:'CHC022-9716',sourceRoll:'CHC022',manufacturerRoll:'9716',collection:'Classic Update',colour:'935 - Frosted Slate',length:0,originalLength:0,width:'12',location:'',status:'Pending',sourceStatus:'CHECK',measure:'TM'},
    {id:3,roll:'CHC022-2222',sourceRoll:'CHC022',manufacturerRoll:'2222',collection:'CLASSIC CUT',colour:'Frosted Slate',length:140,originalLength:140,width:'12',location:'12C',status:'Active',sourceStatus:'OK',measure:'FULL'}
  ]],
  [EVENTDB,[]]
]);
let fallback=0;
const alerts=[];
const context={
  console,Date,JSON,Math,CARPETDB,EVENTDB,
  load(k){return clone(data.get(k)||[])},
  save(k,v){data.set(k,clone(v));return true},
  carpetRecords(){return clone(data.get(CARPETDB)||[])},
  cleanManufacturerRoll(v){return String(v||'').trim()},
  alert(v){alerts.push(String(v))},
  applySingleOperationImpact(r){fallback++;r.impactApplied=true;return true},
  document:{documentElement:{setAttribute(){}}},
  setInterval(fn){fn();return 1},clearInterval(){},setTimeout(fn){fn();return 1},
  addEventListener(){}
};
context.window=context;
vm.runInNewContext(source,context,{filename:'build126-finalize-pending-carpet-arrival.js'});
const api=context.RUNLUFinalizePendingCHCBuild126;
assert.ok(api);
assert.equal(api.version,'126');

const first={id:200,type:'Carpet Receiving',status:'Completed',inventoryMode:'Stock',roll:'CHC022',manufacturerRoll:'9692',collection:'CLASSIC CUT',colour:'FROSTED SLATE (GREY)935',lot:'P54596',quantity:146+1/12,width:'12',location:'14D',po:'P54596'};
assert.equal(context.applySingleOperationImpact(first),true);
let rows=data.get(CARPETDB),a=rows.find(x=>String(x.id)==='1');
assert.equal(a.roll,'CHC022');
assert.equal(a.cloudRecordId,'CHC022-9692');
assert.equal(a.status,'Active');
assert.equal(a.measure,'FULL');
assert.equal(a.location,'14D');
assert.equal(a.lot,'P54596');
assert.equal(a.sourceOperationId,200);
assert.ok(a.length>146&&a.length<147);
assert.equal(rows.length,3,'finalization must adopt in place, not create a duplicate row');
assert.equal(fallback,0,'pending arrival must be finalized before legacy final validator');

const second={id:201,type:'Carpet Receiving',status:'Completed',inventoryMode:'Stock',roll:'CHC022',manufacturerRoll:'9716',collection:'CLASSIC CUT',colour:'FROSTED SLATE (GREY)935',lot:'P54597',quantity:133.5,width:'12',location:'14D',po:'P54597'};
assert.equal(context.applySingleOperationImpact(second),true,'a second CHC roll in the same workday must finalize independently');
rows=data.get(CARPETDB);const b=rows.find(x=>String(x.id)==='2');
assert.equal(b.roll,'CHC022');
assert.equal(b.cloudRecordId,'CHC022-9716');
assert.equal(b.status,'Active');
assert.equal(b.length,133.5);
assert.equal(b.sourceOperationId,201);
assert.equal(rows.length,3);
assert.equal(fallback,0);

const active={id:202,type:'Carpet Receiving',status:'Completed',inventoryMode:'Stock',roll:'CHC022',manufacturerRoll:'2222',quantity:100,location:'14D'};
assert.equal(context.applySingleOperationImpact(active),true,'non-pending duplicate remains delegated to existing protection');
assert.equal(fallback,1);

const ordinary={id:203,type:'Carpet Receiving',status:'Completed',inventoryMode:'Stock',roll:'RC9999',manufacturerRoll:'9999',quantity:100,location:'1A'};
assert.equal(context.applySingleOperationImpact(ordinary),true);
assert.equal(fallback,2,'ordinary carpet workflow remains unchanged');
assert.equal(alerts.length,0);

console.log('Build126 final pending CHC arrival path: PASS');
