import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const identitySource=fs.readFileSync(new URL('../build072-carpet-identity.js',import.meta.url),'utf8');
const build124Source=fs.readFileSync(new URL('../build124-shared-carpet-physical-identity.js',import.meta.url),'utf8');

// --- Cloud identity regression: shared display code must not collapse physical rolls. ---
{
  const CARPET='runlu_carpet_inventory_v52',QUEUE='runlu_cloud_master_offline_queue_v680';
  const store=new Map();
  const baseSave=function(k,v){store.set(k,JSON.stringify(v));return true};
  baseSave.__build072=true;
  const context={
    console,Date,JSON,Math,
    localStorage:{getItem(k){return store.has(k)?store.get(k):null},setItem(k,v){store.set(k,String(v))}},
    save:baseSave,
    setTimeout(fn){fn();return 1},clearTimeout(){},setInterval(fn){fn();return 1},clearInterval(){},
    document:{readyState:'complete',addEventListener(){}},
    addEventListener(){},alert(){},runluCloudMasterSync(){}
  };
  context.window=context;
  const legacy={id:1,roll:'CHC022',manufacturerRoll:'1111'};
  store.set(CARPET,JSON.stringify([legacy]));
  vm.runInNewContext(identitySource,context,{filename:'build072-carpet-identity.js'});
  const api=context.RUNLUCarpetCloudIdentity;
  assert.ok(api);
  assert.equal(api.recordIdentity({id:9,roll:'RC1234'}),'RC1234','ordinary carpet identity stays Roll #');
  assert.equal(api.recordIdentity(legacy),'CHC022','legacy shared record keeps its existing cloud identity');
  const physical={id:2,roll:'CHC022',physicalRollId:'OP-200-M-9692',cloudRecordId:'CHC022__OP-200-M-9692',manufacturerRoll:'9692'};
  assert.equal(api.recordIdentity(physical),'CHC022__OP-200-M-9692');
  assert.equal(context.save(CARPET,[legacy,physical]),true);
  const queue=JSON.parse(store.get(QUEUE));
  assert.equal(queue.length,1,'adding one physical CHC roll should queue one cloud mutation');
  assert.equal(queue[0].recordId,'CHC022__OP-200-M-9692','new shared physical roll must use composite cloud identity');
  assert.equal(queue[0].payload.roll,'CHC022','warehouse-visible display roll remains CHC022');
}

// --- Inventory mutation regression: receive and transfer exact shared physical rolls. ---
{
  const CARPETDB='runlu_carpet_inventory_v52',EVENTDB='runlu_event_history_v52';
  const data=new Map([
    [CARPETDB,[{id:1,roll:'CHC022',manufacturerRoll:'1111',collection:'CLASSIC CUT',colour:'FROSTED SLATE',length:120,originalLength:120,width:'12',location:'12C',status:'Active',warehouseScope:'warehouse',transferredOut:false}]],
    [EVENTDB,[]]
  ]);
  const clone=v=>JSON.parse(JSON.stringify(v));
  const alerts=[];
  let fallbackCalls=0,linkedOrders=0;
  const fields={
    operationCarpetTransfer:{value:''},
    operationRoll:{value:'',dataset:{}}
  };
  const context={
    console,Date,JSON,Math,
    CARPETDB,EVENTDB,
    load(k){return clone(data.get(k)||[])},
    save(k,v){data.set(k,clone(v));return true},
    carpetRecords(){return clone(data.get(CARPETDB)||[])},
    validateOperationForImpact(){return ''},
    cleanManufacturerRoll(v){return String(v||'').trim()},
    feetLabel(v){return `${Number(v)} ft`},
    normKey(v){return String(v||'').trim().toLowerCase()},
    carpetTransferParts(route){const p=String(route||'').split('→').map(x=>x.trim());return {from:p[0]||'',to:p[1]||''}},
    carpetExternalDestination(dest){return String(dest||'').toLowerCase()!=='warehouse'},
    markCarpetExternal(r,destination,route){r.location=destination;r.status='Transferred Out';r.warehouseScope='external';r.transferredOut=true;r.transferRoute=route;r.updatedAt=new Date().toISOString()},
    markCarpetWarehouse(r,destination){r.location=destination;r.status='Active';r.warehouseScope='warehouse';r.transferredOut=false;r.updatedAt=new Date().toISOString()},
    nextCarpetChildRoll(source,rows){let i=1,c;const used=new Set(rows.map(r=>String(r.roll).toUpperCase()));do{c=`${source}-${i++}`}while(used.has(c.toUpperCase()));return c},
    updateLinkedOrder(){linkedOrders++},
    alert(v){alerts.push(String(v))},
    applySingleOperationImpact(r){fallbackCalls++;if(r?.impactApplied)return true;r.impactApplied=true;return true},
    operationCarpetTransferChanged(){return true},
    manifestIssues(){return [
      {blocking:true,text:'Duplicate RC roll inside this manifest.'},
      {blocking:true,text:'This RC roll already exists in Carpet Inventory.'},
      {blocking:true,text:'Duplicate manufacturer roll inside this manifest.'}
    ]},
    document:{documentElement:{setAttribute(){}},getElementById(id){return fields[id]||null}},
    setInterval(fn){fn();return 1},clearInterval(){},setTimeout(fn){fn();return 1},
    addEventListener(){}
  };
  context.window=context;
  vm.runInNewContext(build124Source,context,{filename:'build124-shared-carpet-physical-identity.js'});
  const api=context.RUNLUSharedCarpetIdentityBuild124;
  assert.ok(api);
  assert.equal(api.isSharedRoll('chc022'),true);
  assert.equal(api.isSharedRoll('CHC023'),true);

  const receiving={id:200,type:'Carpet Receiving',status:'Completed',inventoryMode:'Stock',roll:'CHC022',manufacturerRoll:'9692',collection:'CLASSIC CUT',colour:'FROSTED SLATE (GREY)935',quantity:146+1/12,width:'12',location:'14D',po:'P54596',supplier:'TEST'};
  assert.equal(context.applySingleOperationImpact(receiving),true,'shared CHC receiving should be applied');
  let carpets=data.get(CARPETDB);
  let shared=carpets.filter(r=>r.roll==='CHC022');
  assert.equal(shared.length,2,'two physical rolls may share CHC022');
  const newPhysical=shared.find(r=>r.manufacturerRoll==='9692');
  assert.ok(newPhysical?.physicalRollId,'new shared roll gets hidden physical ID');
  assert.match(newPhysical.cloudRecordId,/^CHC022__OP-200-M-9692$/);
  assert.equal(newPhysical.roll,'CHC022');
  assert.equal(newPhysical.location,'14D');
  assert.equal(fallbackCalls,0,'shared receiving bypasses old duplicate-roll receiving branch');

  const duplicateOperation={...receiving,impactApplied:false,impactResult:'',appliedAt:''};
  assert.equal(context.applySingleOperationImpact(duplicateOperation),true,'same receiving operation is idempotent');
  assert.equal(data.get(CARPETDB).filter(r=>r.roll==='CHC022').length,2,'idempotent retry must not create a third physical roll');

  const duplicateManufacturer={...receiving,id:201,impactApplied:false,manufacturerRoll:'1111'};
  assert.equal(context.applySingleOperationImpact(duplicateManufacturer),false,'manufacturer Roll # remains unique');
  assert.match(alerts.at(-1),/Manufacturer Roll 1111 already belongs/);

  // Shared transfers must never guess which CHC022 physical roll to change.
  const ambiguous={id:300,type:'Inventory Transfer',status:'Completed',inventoryMode:'Stock',roll:'CHC022',quantity:10,transferRoute:'Warehouse → Store',toLocation:'Store',transferMode:'Existing / Whole Roll',transferWholeRoll:false};
  assert.equal(context.applySingleOperationImpact(ambiguous),false,'ambiguous shared transfer must be blocked');
  assert.match(alerts.at(-1),/represents 2 physical rolls/);

  const exact={...ambiguous,id:301,carpetRecordId:String(newPhysical.id),quantity:newPhysical.length,transferWholeRoll:true};
  assert.equal(context.applySingleOperationImpact(exact),true,'exact shared physical transfer should succeed');
  carpets=data.get(CARPETDB);shared=carpets.filter(r=>r.roll==='CHC022');
  const moved=shared.find(r=>String(r.id)===String(newPhysical.id));
  const untouched=shared.find(r=>String(r.id)==='1');
  assert.equal(moved.location,'Store');
  assert.equal(moved.transferredOut,true);
  assert.equal(untouched.location,'12C','other CHC022 physical roll must remain untouched');
  assert.equal(linkedOrders,1);

  // Picker handoff records the exact physical id on the operation item.
  fields.operationCarpetTransfer.value=String(untouched.id);fields.operationRoll.value='CHC022';
  context.operationCarpetTransferChanged();
  assert.equal(fields.operationRoll.dataset.carpetRecordId,String(untouched.id));

  // Multi-page manifest may repeat shared display code, but manufacturer duplicate remains blocking.
  const issues=context.manifestIssues({roll:'CHC022'},0);
  assert.deepEqual(issues.map(x=>x.text),['Duplicate manufacturer roll inside this manifest.']);
}

console.log('Build124 shared carpet physical identity + exact targeting: PASS');
