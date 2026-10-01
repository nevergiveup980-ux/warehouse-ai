/* RUNLU V8 Pilot — compatibility adapter, Phase 1.
   Read model only: canonical UUID remains the cloud identity; V6 receives a stable numeric UI id.
   Do not use this adapter as a write contract. */
(function(){
  'use strict';
  const LOCATIONS={"05aad46f-e475-466e-a673-b1751eddf474":"7B","06502271-379c-46c4-a953-0310eb14eed7":"2C","0c182f8a-4da7-44ad-9e0e-474b2f020187":"13D","0f0367ec-f3c0-413c-b621-6526b3ede3bd":"2A","217b0379-7a8c-4326-b77b-a608d0ef003d":"6C","279098fb-ac6d-4792-8616-1ed2872901ff":"13C","319f6ce4-5be7-46ee-8f75-08a937e2e55f":"6A","40e8569d-e07c-4743-bfd9-a3679aa87994":"13A","4b7e858d-08bc-48f8-9f49-78ff3cf99a21":"5B","4fb7fb02-6171-4417-9497-933d49d409fa":"3D","52aa4320-5332-4eec-b7a2-e7aff749bd62":"7C","5e9b81e4-0058-4f0c-87da-554c9b9d0e53":"14D","71345e89-6921-4b5f-a686-44f7917c6286":"2B","7c891cc0-7b27-480a-94ce-baef3dd1103c":"6B","91657dc7-c8d8-47c6-beed-2221cfcf33b7":"4D","95a4ac83-06d1-4377-b38e-4645ed550fab":"12D","9880171b-a9c1-4017-997a-f0bce7697cd4":"5C","a75880fa-3b9a-415b-9dca-6befa496ca80":"3B","c1c4e18f-4a69-45a8-ad91-28390f68e2c7":"14C","c638b4d2-9c7f-47c1-9a6a-a82ae3741902":"12C","c6d4387c-c841-410f-9e0f-6e978d64bd3b":"4C","c98feee9-17cc-431b-9ce4-a84951ddbe5e":"3C","cb58ff15-6baf-4ac7-8762-4640c2744c86":"4A","cda184d8-73ef-4db2-8f82-da8823ec27f6":"6D","cee9769b-442f-4530-8dff-0fa1f032d608":"3A","e841c63b-dadc-4153-ada4-15a7ba60920c":"5A","ea4ea498-1f97-456a-b817-3a6ceba25a93":"7A","f896fb8a-914f-4e21-ab40-074121ad3b76":"4B","fa604122-59a4-4d8c-aa5f-433f7f322ccb":"14A"};
  function uiId(value){
    const s=String(value||''); let h=2166136261;
    for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
    return (h>>>0)||1;
  }
  function feetFromSixteenths(v){
    const n=Number(v); return Number.isFinite(n)&&n>=0?n/192:0;
  }
  function lifecycleStatus(x,length){
    const s=String(x.lifecycleStatus||x.lifecycle||x.status||'').toUpperCase();
    if(s==='ACTIVE') return length<3?'Used Up':'Active';
    if(s==='CONSUMED'||s==='USED UP'||s==='USED_UP') return 'Used Up';
    if(s==='ARCHIVED') return 'Archived';
    return x.status||'Check';
  }
  function productMap(){
    const out=new Map();
    try{for(const p of load(PMDB)||[])out.set(String(p.id||p.masterId||''),p)}catch{}
    return out;
  }
  window.RUNLU_V8_ADAPT_CARPET=function(raw){
    const products=productMap(), canonicalId=String(raw?.canonicalId||raw?.id||'');
    const p=products.get(String(raw?.masterId||''))||{};
    const length=(raw?.length!==undefined&&raw?.length!==null)?Number(raw.length):feetFromSixteenths(raw?.remainingSixteenths);
    const originalLength=(raw?.originalLength!==undefined&&raw?.originalLength!==null)?Number(raw.originalLength):feetFromSixteenths(raw?.originalSixteenths);
    return {...raw,
      canonicalId,
      id:uiId(canonicalId),
      roll:raw?.roll||raw?.rollNumber||'',
      rollNumber:raw?.rollNumber||raw?.roll||'',
      length,
      originalLength,
      location:raw?.location||LOCATIONS[String(raw?.locationId||'')]||'UNASSIGNED',
      measure:raw?.measure||raw?.measureStatus||'—',
      status:lifecycleStatus(raw,length),
      collection:raw?.collection||p.name||'Unnamed carpet',
      colour:raw?.colour||raw?.color||p.colour||p.color||'',
      sku:raw?.sku||p.sku||''
    };
  };
  carpetRecords=function(){
    const rows=load(CARPETDB)||[], seen=new Set();
    return rows.map(RUNLU_V8_ADAPT_CARPET).map(x=>{
      if(seen.has(x.id)) console.error('V8 UI identity collision',x.canonicalId);
      seen.add(x.id); return x;
    });
  };
  const baseRecordSyncId=recordSyncId;
  recordSyncId=function(x,i=0){
    return String(x?.canonicalId??x?.inventoryId??x?.id??x?.legacyKey??x?.roll??x?.poNumber??('row-'+i));
  };

  window.RUNLU_V8_CUT_PLAN=function(roll,requestedFeet,numberOfCuts){
    const requested=Number(requestedFeet||0),cuts=Math.max(1,Math.floor(Number(numberOfCuts||1))),before=Number(roll?.length||0);
    if(!roll?.canonicalId)throw new Error('Canonical roll identity missing');
    if(!(Number(roll?._cloudVersion||0)>0))throw new Error('Cloud version missing');
    if(!(requested>0))throw new Error('Cut length must be greater than zero');
    const planned=Number((requested+cuts*0.25).toFixed(4));
    if(planned>before+0.0001)throw new Error('Insufficient carpet balance');
    const deduct=(before-planned>=0&&before-planned<3)?before:planned;
    return {rollId:roll.canonicalId,expectedVersion:Number(roll._cloudVersion),requestedFeet:requested,numberOfCuts:cuts,allowanceInches:cuts*3,deductFeet:deduct,deductSixteenths:Math.round(deduct*192),beforeFeet:before,remainingFeet:Number((before-deduct).toFixed(4))};
  };


  window.RUNLU_V8_BUILD_CUT_COMMAND=function(roll,requestedFeet,numberOfCuts,meta){
    const plan=RUNLU_V8_CUT_PLAN(roll,requestedFeet,numberOfCuts),m=meta||{};
    return {commandId:(crypto.randomUUID?crypto.randomUUID():'cmd-'+Date.now()),rollId:plan.rollId,expectedVersion:plan.expectedVersion,deductSixteenths:plan.deductSixteenths,payload:{source:'RUNLU_V8_PILOT',rollNumber:String(roll.roll||roll.rollNumber||''),requestedFeet:plan.requestedFeet,numberOfCuts:plan.numberOfCuts,allowanceInches:plan.allowanceInches,deductFeet:plan.deductFeet,operationId:String(m.operationId||''),po:String(m.po||''),customer:String(m.customer||''),notes:String(m.notes||'')}};
  };
  window.RUNLU_V8_VALIDATE_CUT_RESULT=function(plan,result){
    const r=result||{},remaining=Number(r.remaining_sixteenths??r.remainingSixteenths),version=Number(r.new_version??r.newVersion);
    const expectedRemaining=Math.round(plan.remainingFeet*192);
    if(Number.isFinite(remaining)&&remaining!==expectedRemaining)throw new Error('V8 cut result balance mismatch');
    if(Number.isFinite(version)&&version!==plan.expectedVersion+1)throw new Error('V8 cut result version mismatch');
    return true;
  };

  window.RUNLU_V8_COMPAT={phase:'read-model-1',locationCount:Object.keys(LOCATIONS).length,uiId,baseRecordSyncId};
})();