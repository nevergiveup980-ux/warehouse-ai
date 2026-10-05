/* RUNLU V8 Pilot — compatibility adapter, Phase 1.
   Read model only: canonical UUID remains the cloud identity; V6 receives a stable numeric UI id.
   Do not use this adapter as a write contract. */
(function(){
  'use strict';
  const LOCATIONS={"05aad46f-e475-466e-a673-b1751eddf474":"7B","06502271-379c-46c4-a953-0310eb14eed7":"2C","0c182f8a-4da7-44ad-9e0e-474b2f020187":"13D","0f0367ec-f3c0-413c-b621-6526b3ede3bd":"2A","217b0379-7a8c-4326-b77b-a608d0ef003d":"6C","279098fb-ac6d-4792-8616-1ed2872901ff":"13C","319f6ce4-5be7-46ee-8f75-08a937e2e55f":"6A","40e8569d-e07c-4743-bfd9-a3679aa87994":"13A","4b7e858d-08bc-48f8-9f49-78ff3cf99a21":"5B","4fb7fb02-6171-4417-9497-933d49d409fa":"3D","52aa4320-5332-4eec-b7a2-e7aff749bd62":"7C","5e9b81e4-0058-4f0c-87da-554c9b9d0e53":"14D","71345e89-6921-4b5f-a686-44f7917c6286":"2B","7c891cc0-7b27-480a-94ce-baef3dd1103c":"6B","91657dc7-c8d8-47c6-beed-2221cfcf33b7":"4D","95a4ac83-06d1-4377-b38e-4645ed550fab":"12D","9880171b-a9c1-4017-997a-f0bce7697cd4":"5C","a75880fa-3b9a-415b-9dca-6befa496ca80":"3B","c1c4e18f-4a69-45a8-ad91-28390f68e2c7":"14C","c638b4d2-9c7f-47c1-9a6a-a82ae3741902":"12C","c6d4387c-c841-410f-9e0f-6e978d64bd3b":"4C","c98feee9-17cc-431b-9ce4-a84951ddbe5e":"3C","cb58ff15-6baf-4ac7-8762-4640c2744c86":"4A","cda184d8-73ef-4db2-8f82-da8823ec27f6":"6D","cee9769b-442f-4530-8dff-0fa1f032d608":"3A","e841c63b-dadc-4153-ada4-15a7ba60920c":"5A","ea4ea498-1f97-456a-b817-3a6ceba25a93":"7A","f896fb8a-914f-4e21-ab40-074121ad3b76":"4B","fa604122-59a4-4d8c-aa5f-433f7f322ccb":"14A"};

  // Canonical stock rows carry locationId; the V6 views read location.
  const STOCK_LOCATIONS={
  "2431d395-b14a-4df9-b130-4da3d2bdc5a4": "10A",
  "41c33124-169e-4e95-ae95-f00dbf51385b": "10B",
  "0a55d487-bfc4-4408-97e2-579ad0dfeffa": "11A",
  "787d0da4-d5cb-48fc-8b90-2a4e8896cc3d": "12",
  "c0585610-7d12-4667-9f2c-6b7279cb18fd": "13",
  "9e0e2a0a-e3d6-409c-854d-e30a8984ed92": "14",
  "5dda4c7a-f1bc-4a8f-9e21-aaee2e85f63b": "15A",
  "e9f72fe4-67a8-4f1f-a0af-6c488a2d4a89": "15C",
  "c13cb3db-42ef-4391-8ad8-1c907a9900d7": "2",
  "db8b8231-8422-4258-831d-6ab93e87f7e2": "27C",
  "5f46ccf4-0c87-4952-8e6b-31d64bb379f4": "29A",
  "2ead4d8f-0511-44e0-9ed5-76c80e9ceb07": "29B",
  "36eaf5ad-7784-4693-86b2-a34daa7db861": "3",
  "1c4fee8f-0696-4398-bef5-339aa20aa8e5": "30B",
  "246ae91c-08f2-4ca0-8f4c-c467b6e07094": "30C",
  "09f3d93f-a58c-4556-97bc-c056c4f7fc98": "30D",
  "5c21ef92-7b41-4f52-9c44-b87bf099bf7f": "31A",
  "cf97b85f-e1d2-4196-80c1-399b9e25d622": "31B",
  "1b054ad2-b1e6-48f5-b564-dd277b3e18d6": "31C",
  "f22fc54d-cbf3-4bd1-8537-0aa610befc52": "32A",
  "40d9225c-2aee-4087-9c13-ac94231813ec": "35",
  "b0d50607-443c-4bf6-970d-b755b0e22e5c": "35A",
  "b237f348-9039-46bb-89ce-419cfdf8a53c": "35C",
  "8afb3131-0eba-4bb6-b7c3-d50613cfe728": "4",
  "18916eff-1254-4449-949b-93680516ca70": "8B & Corner Bin",
  "9889384d-726b-4e5e-8552-4a1be998dd09": "9",
  "cf5c4106-57f2-48e9-b242-8c87fe52a878": "CL2",
  "22ac8873-335f-4c65-b639-91f974c5ebed": "CL3",
  "ba08f564-1d5d-468c-94ab-4c7287a32805": "CL4",
  "3b4f00bf-908a-475b-a895-5a4bc3eb41fb": "CL4F",
  "04d5f095-e39e-427f-9e92-73604d3c082f": "CL5",
  "137208ed-d2c9-420e-9cac-40e203b29538": "CL6",
  "7b06b58b-a8b6-4272-b70f-b98c57e3171d": "CL7",
  "88d68d96-74dc-4184-8c32-562901156aa6": "CR2",
  "379194ed-ffcd-4cb7-b015-b33ba2fc1cc0": "CR3",
  "6b099dee-236d-4250-a7e4-299627a93191": "CR5",
  "09cfdc0e-18be-40b2-adf9-fd665e6ba982": "Corner",
  "55027a45-2911-4e1e-8582-79d24f4b09d1": "LOC-M2",
  "0a9bf8c1-c7bc-4b3f-a76e-6820188a62d8": "LOC-M3",
  "2d745989-9a1e-4a9a-afab-044b950e387a": "M1",
  "d1b1a68a-0b22-499a-a7b8-a3483aa0528b": "M3",
  "fd39b964-40be-49ac-81ec-ecb06cb1eb1a": "M4",
  "e0f52725-65d2-40eb-88e8-927e71ced445": "M6",
  "6c9b1cb1-ed18-4be0-97bb-bb38c2564a29": "M7B",
  "6e8b0615-c24e-46d7-bda6-a8ddaaa7c9bf": "M7F",
  "3c29414d-92d3-4bcf-aaf4-2e501b4ffb35": "M8",
  "c02986e4-f241-4dd9-92df-4e9c91c0ce48": "OW",
  "ddcbcd63-14f3-470d-aae7-fe6041c5fac7": "Receiving",
  "2da61845-2550-4332-9740-16baa8f487f1": "Receiving / Put-away Pending",
  "22859df6-f7c7-4849-bd2a-b43692a252e1": "SPL-6-7",
  "1c91f118-be1b-43e6-9058-5913e32a1876": "SPL-8-9",
  "30b1d3a5-54ee-4563-b628-5af40a599b6d": "SPR1",
  "cb588dd8-9e3d-4050-abda-273c3f5b98ea": "Store samples"
};
  window.RUNLU_V8_ADAPT_INVENTORY=function(raw){
    if(!raw||Object.prototype.hasOwnProperty.call(raw,'location'))return raw;
    const location=STOCK_LOCATIONS[String(raw.locationId||'')]||LOCATIONS[String(raw.locationId||'')];
    if(!location)return raw;
    const view={...raw};
    // A display-only value must not become a cloud mutation during an unrelated save.
    Object.defineProperty(view,'location',{
      configurable:true,enumerable:false,get(){return location},
      set(value){Object.defineProperty(this,'location',{value,writable:true,configurable:true,enumerable:true})}
    });
    return view;
  };

  const PRODUCT_CANONICAL_LINKS={
    "PRD-0001":"0044555a-e24d-4d16-b97f-b67ad25e78c5",
    "PRD-0002":"ee6d79e6-b2dc-4d42-89af-2e36e1f824df",
    "PRD-0003":"9aa1fa71-5091-4985-9443-00ab3ccf35b6",
    "PRD-0004":"94fcfce8-641e-414f-8949-298bec32cd8e",
    "PRD-0005":"5b68cd23-e452-4982-b168-e691686db93f",
    "PRD-0006":"324feb6b-1320-4d96-95c5-8222905a308a",
    "PRD-0007":"d00ffbed-feac-4807-9e1e-82869a9321ea",
    "PRD-0008":"1a0fb9ce-6375-4cd9-8eac-d7293b0700bd",
    "PRD-0009":"eae776e5-6bf7-499c-807b-7643771dfde7"
  };
  const PRODUCT_FALLBACKS={
    "028ddb01-52af-44d3-bd7a-9c8957f39665":{id:"028ddb01-52af-44d3-bd7a-9c8957f39665",name:"Heather Choice",color:"Green",sku:"HEATHER-CHOICE",category:"Underlay",coverageUnit:"Roll",_v8Canonical:true},
    "2e121f61-d462-49ae-9f49-640078fbc411":{id:"2e121f61-d462-49ae-9f49-640078fbc411",name:"Cloud 9 Spill Blocker",color:"",sku:"48075-25-D",category:"Spill Blocker",coverageUnit:"Roll",_v8Canonical:true},
    "66da1b91-42b5-4d18-979a-04b704ed2857":{id:"66da1b91-42b5-4d18-979a-04b704ed2857",name:"Platinum",color:"Green",sku:"PLATINUM-STOCK",category:"Underlay",coverageUnit:"Roll",_v8Canonical:true}
  };

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
  window.RUNLU_V8_CANONICAL_PRODUCT_ID=function(masterId){
    const key=String(masterId||'');
    return PRODUCT_CANONICAL_LINKS[key]||key;
  };
  window.RUNLU_V8_RESOLVE_PRODUCT=function(masterId,masters){
    const key=String(masterId||''),list=Array.isArray(masters)?masters:(typeof load==='function'&&typeof PMDB!=='undefined'?(load(PMDB)||[]):[]);
    let p=list.find(x=>String(x?.id||x?.masterId||'')===key);
    if(p)return p;
    const canonical=PRODUCT_CANONICAL_LINKS[key];
    if(canonical){
      p=list.find(x=>String(x?.id||x?.masterId||'')===canonical);
      if(p)return {...p,_v8AliasFrom:key,_v8CanonicalId:canonical};
    }
    return PRODUCT_FALLBACKS[key]?{...PRODUCT_FALLBACKS[key]}:null;
  };
  function inventoryBusinessKey(r){
    return [r?.id,r?.masterId,Number(r?.quantity||0),String(r?.unit||'').toUpperCase(),String(r?.location||''),String(r?.locationType||''),String(r?.lotNumber||''),String(r?.poNumber||'')].join('|');
  }
  window.RUNLU_V8_IS_SHADOW_DUPLICATE=function(record){
    if(!record||typeof load!=='function'||typeof INVDB==='undefined')return false;
    const cloudId=String(record._cloudRecordId||'');
    if(!cloudId||/^INV-/i.test(cloudId))return false;
    const key=inventoryBusinessKey(record);
    try{
      return (load(INVDB)||[]).some(x=>String(x?._cloudRecordId||x?.inventoryId||'').match(/^INV-/i)&&inventoryBusinessKey(x)===key);
    }catch{return false}
  };
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
  window.RUNLU_V8_INSTALL=function(){
    if(window.RUNLU_V8_COMPAT?.installed)return true;
    if(typeof carpetRecords!=='function'||typeof recordSyncId!=='function'||typeof load!=='function')return false;
    const baseCarpetRecords=carpetRecords,baseRecordSyncId=recordSyncId;
    carpetRecords=function(){
      const rows=load(CARPETDB)||[],seen=new Set();
      return rows.map(RUNLU_V8_ADAPT_CARPET).map(x=>{
        if(seen.has(x.id))console.error('V8 UI identity collision',x.canonicalId);
        seen.add(x.id);return x;
      });
    };
    recordSyncId=function(x,i=0){
      return String(x?.canonicalId??x?._cloudRecordId??x?.inventoryId??x?.id??x?.legacyKey??x?.roll??x?.poNumber??('row-'+i));
    };
    window.RUNLU_V8_COMPAT={phase:'read-model-2',installed:true,locationCount:Object.keys(LOCATIONS).length,uiId,baseCarpetRecords,baseRecordSyncId};
    return true;
  };

  window.RUNLU_V8_CARPET_HEALTH=function(){
    const raw=load(CARPETDB)||[],adapted=raw.map(RUNLU_V8_ADAPT_CARPET),ids=new Set(),collisions=[];
    let canonical=0,location=0,version=0,remaining=0;
    for(const x of adapted){
      if(x.canonicalId)canonical++;
      if(x.location&&x.location!=='UNASSIGNED')location++;
      if(Number(x._cloudVersion||0)>0)version++;
      if(Number.isFinite(Number(x.length)))remaining++;
      if(ids.has(x.id))collisions.push({id:x.id,canonicalId:x.canonicalId,roll:x.roll});
      ids.add(x.id);
    }
    const report={checkedAt:new Date().toISOString(),raw:raw.length,adapted:adapted.length,canonical,location,version,remaining,uiIdUnique:ids.size,collisions,ok:raw.length===adapted.length&&canonical===raw.length&&location===raw.length&&version===raw.length&&remaining===raw.length&&collisions.length===0};
    try{sessionStorage.setItem('runlu_v8_carpet_health',JSON.stringify(report))}catch{}
    if(!report.ok)console.warn('[V8 Pilot] carpet read-model health',report);else console.info('[V8 Pilot] carpet read-model health OK',report);
    return report;
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
    if(r.status!=='committed')throw new Error('Cut rejected: '+String(r.code||r.status||'invalid response'));
    if(!Number.isSafeInteger(remaining)||!Number.isSafeInteger(version))throw new Error('Incomplete cut result');
    const expectedRemaining=Math.round(plan.remainingFeet*192);
    if(Number.isFinite(remaining)&&remaining!==expectedRemaining)throw new Error('V8 cut result balance mismatch');
    if(Number.isFinite(version)&&version!==plan.expectedVersion+1)throw new Error('V8 cut result version mismatch');
    return true;
  };

  if(typeof carpetRecords==='function'&&typeof recordSyncId==='function')RUNLU_V8_INSTALL();
})();