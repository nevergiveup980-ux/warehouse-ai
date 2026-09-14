// RUNLU Warehouse OS V6.12.29 Build124 · Shared CHC physical-roll identity.
// CHC022 / CHC023 are business display roll codes used on multiple physical rolls.
// Receiving keeps the familiar display code while assigning a hidden physical/cloud identity.
// Destructive transfer work must resolve the exact physical record when a shared code is used.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD124_SHARED_CARPET_IDENTITY__)return;
  window.__RUNLU_BUILD124_SHARED_CARPET_IDENTITY__=true;

  const BUILD='124';
  const SHARED=new Set(['CHC022','CHC023']);
  const norm=v=>String(v??'').trim().toUpperCase().replace(/\s+/g,' ');
  const text=v=>String(v??'').trim();
  const safe=v=>text(v).toUpperCase().replace(/[^A-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'');
  const isSharedRoll=v=>SHARED.has(norm(v));

  function physicalIdFor(r={}){
    const op=safe(r.id)||Date.now().toString(36).toUpperCase();
    const mfr=safe(r.manufacturerRoll);
    return `OP-${op}${mfr?'-M-'+mfr:''}`;
  }
  function cloudIdFor(roll,physicalId){return `${norm(roll)}__${safe(physicalId)}`}
  function exactSharedRecord(records,r={}){
    const rows=(Array.isArray(records)?records:[]).filter(x=>norm(x?.roll)===norm(r.roll));
    if(!rows.length)return null;
    if(text(r.carpetRecordId))return rows.find(x=>String(x.id)===String(r.carpetRecordId))||null;
    return rows.length===1?rows[0]:null;
  }
  function finishImpact(r,result){
    try{
      const events=load(EVENTDB),exists=events.some(e=>String(e.operationId)===String(r.id)&&String(e.type)===String(r.type));
      if(!exists){events.unshift({id:Date.now()+Math.random(),operationId:r.id,time:new Date().toISOString(),type:r.type,reference:r.po||r.roll||r.product,result});save(EVENTDB,events)}
    }catch(e){console.warn('[Build124] event log',e)}
    r.impactApplied=true;r.impactResult=result;r.appliedAt=new Date().toISOString();return true;
  }
  function sharedReceive(r){
    try{
      const err=validateOperationForImpact(r);if(err){alert(err);return false}
      const a=carpetRecords();
      const already=a.find(x=>norm(x.roll)===norm(r.roll)&&String(x.sourceOperationId||'')===String(r.id));
      if(already){
        const result=`Shared carpet roll ${norm(r.roll)} already linked to this receiving operation: ${feetLabel(already.length)} · ${already.collection||'Carpet'} · ${already.colour||''} · Rack ${already.location||'Receiving'}`;
        return finishImpact(r,result);
      }
      r.manufacturerRoll=cleanManufacturerRoll(r.manufacturerRoll);
      if(r.manufacturerRoll){
        const hit=a.find(x=>norm(x.manufacturerRoll)===norm(r.manufacturerRoll));
        if(hit)throw new Error(`Manufacturer Roll ${r.manufacturerRoll} already belongs to ${hit.roll||'another carpet roll'} at ${hit.location||'an existing location'}.`);
      }
      const now=new Date().toISOString(),physicalRollId=physicalIdFor(r),cloudRecordId=cloudIdFor(r.roll,physicalRollId);
      if(a.some(x=>text(x.cloudRecordId)===cloudRecordId))throw new Error(`Physical roll identity ${cloudRecordId} already exists. Re-open the receiving record instead of creating it again.`);
      const received={
        id:Date.now()+Math.random(),roll:norm(r.roll),physicalRollId,cloudRecordId,sharedRollCode:true,
        manufacturerRoll:r.manufacturerRoll||'',lot:r.lot||'',collection:r.collection||r.product,colour:r.colour,
        length:r.quantity,originalLength:r.quantity,width:r.width||'',location:r.location||'Receiving',measure:'FULL',
        status:r.quantity<3?'Used Up':'Active',tmRequired:false,warehouseScope:'warehouse',transferredOut:false,
        po:r.po,supplier:r.supplier||'',sqYd:Number(r.sqYd||0),weightLb:Number(r.weightLb||0),sourceOperationId:r.id,
        createdAt:now,updatedAt:now
      };
      a.unshift(received);
      if(!save(CARPETDB,a))throw new Error(`Shared Roll ${r.roll} could not be saved to Carpet Inventory.`);
      const verified=load(CARPETDB).some(x=>text(x.physicalRollId)===physicalRollId&&String(x.sourceOperationId||'')===String(r.id));
      if(!verified)throw new Error(`Shared Roll ${r.roll} failed physical-roll post-save verification. The operation was not linked.`);
      return finishImpact(r,`Carpet roll received and verified: ${norm(r.roll)} · ${r.quantity} ft · physical ${physicalRollId} · measure FULL`);
    }catch(e){alert('Linked update stopped: '+(e?.message||e));return false}
  }
  function sharedTransfer(r){
    try{
      const err=validateOperationForImpact(r);if(err){alert(err);return false}
      const a=carpetRecords(),matches=a.filter(x=>norm(x.roll)===norm(r.roll)),source=exactSharedRecord(a,r);
      if(!source){
        if(matches.length>1)throw new Error(`Roll ${norm(r.roll)} represents ${matches.length} physical rolls. Choose the exact roll from the Carpet Roll to Transfer picker before completing this transfer.`);
        throw new Error('Carpet roll not found in Carpet Inventory.');
      }
      const before=Number(source.length||0),route=String(r.transferRoute||'Warehouse → Store'),routeParts=carpetTransferParts(route),destination=r.toLocation||routeParts.to||'Store',external=normKey(routeParts.from)==='warehouse'&&normKey(routeParts.to)!=='warehouse'&&carpetExternalDestination(destination),incoming=normKey(routeParts.to)==='warehouse',pieces=Array.isArray(r.transferPieces)?r.transferPieces.map(Number).filter(v=>v>0):[],cut=r.transferMode==='Cut Pieces Before Transfer'&&pieces.length,requested=cut?pieces.reduce((x,y)=>x+y,0):Number(r.quantity||0),actual=cut?Number((requested+pieces.length*0.25).toFixed(4)):requested,whole=!cut&&(!!r.transferWholeRoll||Math.abs(requested-before)<0.011);
      if(!(requested>0))throw new Error(cut?'Enter at least one valid piece length.':'Enter a transfer length greater than zero.');
      if(actual>before+0.011)throw new Error(`This transfer requires ${feetLabel(actual)} including cutting allowance, but the selected physical roll has ${feetLabel(before)}.`);
      let result='';
      if(whole){
        if(external)markCarpetExternal(source,destination,route);else if(incoming||normKey(routeParts.to)==='warehouse')markCarpetWarehouse(source,destination);else{source.location=destination;source.status=Number(source.length||0)<3?'Used Up':'Active';source.warehouseScope='warehouse';source.transferredOut=false;source.updatedAt=new Date().toISOString()}
        save(CARPETDB,a);result=`Whole Roll ${source.roll} [${source.physicalRollId||source.id}] moved: ${feetLabel(before)} · ${r.location||routeParts.from||'Warehouse'} → ${destination} · status ${source.status}`;
      }else{
        source.length=Number((before-actual).toFixed(4));source.measure='CAL';source.tmRequired=source.length<=50&&source.length>=3;source.status=source.length<3?'Used Up':'Active';source.warehouseScope='warehouse';source.transferredOut=false;source.updatedAt=new Date().toISOString();
        const now=new Date().toISOString(),created=[];
        for(const len of (cut?pieces:[requested])){
          const childRoll=nextCarpetChildRoll(source.roll,a),child={id:Date.now()+Math.random(),roll:childRoll,sourceRoll:source.roll,parentRoll:source.roll,parentPhysicalRollId:source.physicalRollId||'',manufacturerRoll:source.manufacturerRoll||'',lot:source.lot||'',collection:source.collection,colour:source.colour,length:len,originalLength:len,width:source.width||'12',location:destination,measure:'TM',status:len<3?'Used Up':'Active',tmRequired:false,po:r.po||'',customer:r.customer||'',supplier:source.supplier||'',relationType:cut?'CUT AND TRANSFER':'INVENTORY TRANSFER',transferRoute:route,sourceOperationId:r.id,createdAt:now,updatedAt:now};
          if(external)markCarpetExternal(child,destination,route);a.unshift(child);created.push(`${childRoll} ${feetLabel(len)} · ${child.status}`);
        }
        save(CARPETDB,a);result=cut?`${pieces.length} cut piece(s) transferred from ${source.roll} [${source.physicalRollId||source.id}] to ${destination}: ${created.join(', ')}; selected source ${feetLabel(before)} → ${feetLabel(source.length)} including ${pieces.length} × 3″ allowance`:`${feetLabel(requested)} transferred from ${source.roll} [${source.physicalRollId||source.id}] to ${destination} as ${created[0]}; selected source ${feetLabel(before)} → ${feetLabel(source.length)}`;
      }
      updateLinkedOrder(r,'Ready');return finishImpact(r,result);
    }catch(e){alert('Linked update stopped: '+(e?.message||e));return false}
  }

  function installImpact(){
    const prior=window.applySingleOperationImpact;if(typeof prior!=='function'||prior.__build124SharedCarpet)return false;
    const wrapped=function(r){
      if(r&&r.type==='Carpet Receiving'&&r.inventoryMode==='Stock'&&r.status==='Completed'&&!r.impactApplied&&isSharedRoll(r.roll))return sharedReceive(r);
      if(r&&r.type==='Inventory Transfer'&&r.inventoryMode==='Stock'&&r.status==='Completed'&&!r.impactApplied&&isSharedRoll(r.roll))return sharedTransfer(r);
      return prior.apply(this,arguments);
    };
    wrapped.__build124SharedCarpet=true;wrapped.__build093=!!prior.__build093;wrapped.__original=prior;window.applySingleOperationImpact=wrapped;return true;
  }
  function installTransferPicker(){
    const prior=window.operationCarpetTransferChanged;if(typeof prior!=='function'||prior.__build124SharedCarpet)return false;
    const wrapped=function(){
      const out=prior.apply(this,arguments),id=document.getElementById('operationCarpetTransfer')?.value||'',roll=document.getElementById('operationRoll');
      if(roll&&id)roll.dataset.carpetRecordId=String(id);return out;
    };
    wrapped.__build124SharedCarpet=true;wrapped.__original=prior;window.operationCarpetTransferChanged=wrapped;return true;
  }
  function installManifestGuard(){
    const prior=window.manifestIssues;if(typeof prior!=='function'||prior.__build124SharedCarpet)return false;
    const wrapped=function(row,index){
      const issues=prior.apply(this,arguments);if(!isSharedRoll(row?.roll)||!Array.isArray(issues))return issues;
      // The display code may repeat. Manufacturer Roll # and all other row checks remain unchanged.
      return issues.filter(x=>!['Duplicate RC roll inside this manifest.','This RC roll already exists in Carpet Inventory.'].includes(String(x?.text||'')));
    };
    wrapped.__build124SharedCarpet=true;wrapped.__original=prior;window.manifestIssues=wrapped;return true;
  }
  function install(){installImpact();installTransferPicker();installManifestGuard();document.documentElement.setAttribute('data-runlu-shared-carpet-identity',BUILD)}
  install();let tries=0;const timer=setInterval(()=>{install();if(++tries>120)clearInterval(timer)},100);
  window.addEventListener('pageshow',()=>setTimeout(install,30));

  window.RUNLUSharedCarpetIdentityBuild124={version:BUILD,sharedRolls:[...SHARED],isSharedRoll,physicalIdFor,cloudIdFor,exactSharedRecord};
})();
