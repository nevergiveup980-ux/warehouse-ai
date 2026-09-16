import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../build136-carpet-raw-write-authority.js',import.meta.url),'utf8');
const version=JSON.parse(fs.readFileSync(new URL('../version.json',import.meta.url),'utf8'));
const cycles=Math.max(1000,Number(process.env.RUNLU_STABILITY_CYCLES||20000));
const reportPath='warehouse-stability-burnin-build136-report.json';
const CARPET='runlu_carpet_inventory_v52',CUT='runlu_cutting_log_v52',EVENT='runlu_event_history_v52';

function storage(){
  const m=new Map();
  return {
    getItem:k=>m.has(String(k))?m.get(String(k)):null,
    setItem:(k,v)=>m.set(String(k),String(v)),
    removeItem:k=>m.delete(String(k)),
    seed:(k,v)=>m.set(String(k),JSON.stringify(v)),
    json:k=>JSON.parse(m.get(String(k))||'[]')
  };
}
const round4=n=>Number(Number(n).toFixed(4));
const feetLabel=n=>{
  let inches=Math.round(Number(n||0)*12);if(inches<0)inches=0;
  const f=Math.floor(inches/12),i=inches%12;return i?`${f}'${i}\"`:`${f}'`;
};

function boot(){
  const localStorage=storage(),attrs=new Map();
  const box={
    console:{log(){},info(){},warn(){},error(){},debug(){}},
    localStorage,JSON,Math,Number,String,Array,Object,Boolean,Date,Map,Set,Promise,Error,RegExp,
    document:{readyState:'complete',visibilityState:'visible',documentElement:{setAttribute(k,v){attrs.set(k,String(v))}},addEventListener(){}},
    setTimeout(){return 1},setInterval(){return 1},clearTimeout(){},clearInterval(){},alert(){},
    feetLabel,
    carpetActualCutLength(r){return round4(Number(r.requestedQuantity??r.quantity??0)+(Number(r.numberOfCuts||1)*3)/12)},
    carpetCutConsumptionPlan(r,before){
      const planned=box.carpetActualCutLength(r);if(planned>Number(before)+1e-9)return {consumed:planned,remaining:Number(before),useFullRoll:false};
      const raw=round4(Number(before)-planned),useFullRoll=raw>=0&&raw<3;
      return {consumed:useFullRoll?Number(before):planned,remaining:useFullRoll?0:raw,useFullRoll};
    },
    updateLinkedOrder(){return true},
    save(k,v){localStorage.setItem(k,JSON.stringify(v));return true},
    __visibleCanonicalId:''
  };
  box.window=box;box.window.addEventListener=()=>{};
  box.carpetRecords=()=>{
    const rows=localStorage.json(CARPET);
    if(box.__visibleCanonicalId)return rows.filter(r=>String(r.id)===String(box.__visibleCanonicalId)).map(r=>({...r}));
    return rows.filter(r=>r.operationallyHidden!==true&&String(r.status||'').toUpperCase()!=='ARCHIVED DUPLICATE'&&String(r.warehouseScope||'').toUpperCase()!=='EXTERNAL'&&r.transferredOut!==true).map(r=>({...r}));
  };
  vm.createContext(box,{name:'RUNLU Stability Burn-in Build136'});
  vm.runInContext(source,box,{filename:'build136-carpet-raw-write-authority.js',timeout:1500});
  assert.ok(box.RUNLUCarpetRawWriteAuthorityBuild136,'Build136 engineering API missing');
  return {box,localStorage,attrs,api:box.RUNLUCarpetRawWriteAuthorityBuild136};
}

function seedRoll(e,{roll='RC2246',id=2246001,length=132+7/12,original=132+7/12,mfr='7607',lot='986568',location='3D',measure='FULL',status='Active',duplicate=false,staleId=2246999}={}){
  const canonical={id,roll,manufacturerRoll:mfr,collection:'Gentle Guardian',colour:'712 - Cozy Beige',length,originalLength:original,width:'12',location,measure,status,lot,warehouseScope:'warehouse',transferredOut:false,updatedAt:'2026-09-16T16:00:00Z'};
  const rows=[canonical];
  if(duplicate)rows.push({id:staleId,roll,manufacturerRoll:mfr,collection:canonical.collection,colour:canonical.colour,length:0,originalLength:original,width:'12',location,measure,status,lot,warehouseScope:'warehouse',transferredOut:false,updatedAt:'2026-09-16T15:00:00Z'});
  e.localStorage.seed(CARPET,rows);e.localStorage.seed(CUT,[]);e.localStorage.seed(EVENT,[]);e.box.__visibleCanonicalId=String(id);
  return {canonical,staleId};
}

function op({roll='RC2246',recordId=2246001,id=181644,requested=121.5,cuts=7}={}){
  return {id,date:'2026-09-16',time:'11:00',status:'Completed',type:'Carpet Cutting',inventoryMode:'Stock',roll,carpetRecordId:recordId,requestedQuantity:requested,quantity:requested,numberOfCuts:cuts,allowanceInches:cuts*3,po:'181644',customer:'LAB',operator:'LAB',collection:'Gentle Guardian',colour:'712 - Cozy Beige'};
}

const checks=[];
function check(name,fn){
  try{const detail=fn()||{};checks.push({name,pass:true,...detail})}
  catch(err){checks.push({name,pass:false,error:err?.stack||err?.message||String(err)})}
}

check('RC2246 exact reproduction: displayed 132\'7\" cannot execute against stale 0\' row',()=>{
  const e=boot();seedRoll(e,{duplicate:true});
  const r=op({recordId:2246999});
  assert.equal(e.api.applyCarpetCutRaw(r),true);
  const rows=e.localStorage.json(CARPET),live=rows.find(x=>String(x.id)==='2246001'),stale=rows.find(x=>String(x.id)==='2246999'),cuts=e.localStorage.json(CUT);
  assert.equal(rows.length,2,'cut must not create a third carpet record');
  assert.ok(Math.abs(live.length-(9+4/12))<0.0002,`expected 9'4\"; got ${live.length}`);
  assert.equal(stale.length,0,'stale backup row must not be mutated into the work row');
  assert.equal(cuts.length,1);assert.equal(String(cuts[0].carpetRecordId),'2246001');
  assert.ok(Math.abs(cuts[0].beforeLength-(132+7/12))<0.0002);assert.ok(Math.abs(cuts[0].remainingLength-(9+4/12))<0.0002);
  assert.equal(String(r.carpetRecordId),'2246001','operation must relink to canonical raw record');
  return {before:"132'7\"",requested:"121'6\"",cuts:7,allowance:'21\"',remaining:"9'4\""};
});

check('Cloud refresh invariant repairs Active FULL 0 length from Original Size',()=>{
  const e=boot();seedRoll(e,{length:0,original:88+5/12,id:3001,roll:'RC3001'});
  const n=e.api.repairCanonicalFullBalances('lab-cloud-refresh');
  assert.equal(n,1);const row=e.localStorage.json(CARPET)[0];assert.ok(Math.abs(row.length-(88+5/12))<0.0002);assert.equal(row.balanceRecoveryReason,'full-original-opening-balance');
  return {recovered:feetLabel(row.length)};
});

check('Newest Cutting History balance outranks Original Size after refresh',()=>{
  const e=boot();seedRoll(e,{length:0,original:140.25,id:3101,roll:'RC3101'});
  e.localStorage.seed(CUT,[{id:1,carpetRecordId:3101,roll:'RC3101',date:'2026-09-14',time:'10:00',remainingLength:76.25,createdAt:'2026-09-14T10:00:00Z'}]);
  const n=e.api.repairCanonicalFullBalances('lab-history-refresh');
  assert.equal(n,1);const row=e.localStorage.json(CARPET)[0];assert.equal(row.length,76.25);assert.equal(row.measure,'CAL');assert.equal(row.balanceRecoveryReason,'latest-cut-balance');
  return {recovered:feetLabel(row.length)};
});

check('Ambiguous physical identities fail closed',()=>{
  const e=boot();
  e.localStorage.seed(CARPET,[
    {id:1,roll:'RCX1',manufacturerRoll:'MFG-A',length:50,originalLength:50,measure:'FULL',status:'Active',warehouseScope:'warehouse'},
    {id:2,roll:'RCX1',manufacturerRoll:'MFG-B',length:55,originalLength:55,measure:'FULL',status:'Active',warehouseScope:'warehouse'}
  ]);e.box.__visibleCanonicalId='';
  assert.throws(()=>e.api.resolveRawTarget(e.localStorage.json(CARPET),{roll:'RCX1'}),/more than one active manufacturer-roll identity|conflicting physical identities/);
  return {safeReject:true};
});

check('Insufficient stock rejects without inventory/cut mutation',()=>{
  const e=boot();seedRoll(e,{id:3201,roll:'RC3201',length:10,original:10});const before=JSON.stringify(e.localStorage.json(CARPET));
  assert.throws(()=>e.api.applyCarpetCutRaw(op({roll:'RC3201',recordId:3201,requested:10,cuts:1})),/Not enough carpet remaining/);
  assert.equal(JSON.stringify(e.localStorage.json(CARPET)),before);assert.equal(e.localStorage.json(CUT).length,0);
  return {safeReject:true};
});

let rng=0x1362246;
const rand=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296};
let stressFailure=null,duplicateScenarios=0,repairScenarios=0,tailFinishes=0;
const e=boot();
for(let i=0;i<cycles;i++){
  try{
    const roll=`RC${700000+i}`,id=700000+i,staleId=1700000+i,mfr=`MFG-${1000+(i%113)}`;
    const inches=Math.floor(rand()*12),start=round4(45+Math.floor(rand()*155)+inches/12);
    const cuts=1+Math.floor(rand()*8),allow=cuts*0.25;
    const closeTail=rand()<0.12;
    let requested;
    if(closeTail){requested=round4(Math.max(0.5,start-allow-(0.2+rand()*2.5)));tailFinishes++}
    else requested=round4(Math.max(0.5,Math.min(start-allow-3.2,1+rand()*Math.min(70,start/2))));
    if(requested<=0||requested+allow>start){requested=round4(Math.max(0.5,start-allow-3.5))}
    const duplicate=rand()<0.55;if(duplicate)duplicateScenarios++;
    const needsRepair=rand()<0.20;if(needsRepair)repairScenarios++;
    seedRoll(e,{roll,id,length:needsRepair?0:start,original:start,mfr,duplicate,staleId});
    if(needsRepair){const n=e.api.repairCanonicalFullBalances('burn-in');assert.equal(n,1)}
    const selectedId=duplicate&&rand()<0.70?staleId:id;
    const beforeRows=e.localStorage.json(CARPET),beforeCount=beforeRows.length;
    const r=op({roll,recordId:selectedId,id:9000000+i,requested,cuts});
    assert.equal(e.api.applyCarpetCutRaw(r),true);
    const after=e.localStorage.json(CARPET),logs=e.localStorage.json(CUT);
    assert.equal(after.length,beforeCount,'record count changed during cut');
    const live=after.find(x=>String(x.id)===String(id));assert.ok(live,'canonical row missing');assert.ok(live.length>=0,'negative carpet balance');
    const planned=round4(requested+allow),raw=round4(start-planned),expected=raw>=0&&raw<3?0:raw;
    assert.ok(Math.abs(live.length-expected)<0.0003,`cycle ${i}: ${live.length} != ${expected}`);
    assert.equal(logs.length,1,`cycle ${i}: wrong cut log count`);assert.equal(String(logs[0].carpetRecordId),String(id));
    assert.ok(Math.abs(logs[0].beforeLength-start)<0.0003);assert.ok(Math.abs(logs[0].remainingLength-expected)<0.0003);
    assert.equal(String(r.carpetRecordId),String(id));
    if(duplicate){const stale=after.find(x=>String(x.id)===String(staleId));assert.ok(stale);assert.equal(stale.length,0,'stale row mutated')}
  }catch(err){stressFailure={cycle:i,error:err?.stack||err?.message||String(err)};break}
}

const pass=checks.every(x=>x.pass)&&!stressFailure;
const report={
  suite:'RUNLU Warehouse Stability Burn-in Build136',runtime:`${version.version} Build${version.build}`,
  generatedAt:new Date().toISOString(),cyclesRequested:cycles,cyclesCompleted:stressFailure?stressFailure.cycle:cycles,
  duplicateScenarios,repairScenarios,tailFinishes,checks,stressFailure,pass
};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(!pass)process.exit(1);
