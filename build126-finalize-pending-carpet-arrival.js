// RUNLU Warehouse OS V6.12.31 Build126 · Finalize Pending CHC arrivals.
// Build125 correctly recognizes legacy zero-length Pending CHC022/CHC023 placeholders,
// but the legacy final stock-impact validator can still reject the same Manufacturer Roll.
// This layer performs the already-validated final in-place adoption before that legacy guard.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD126_FINALIZE_PENDING_CHC__)return;
  window.__RUNLU_BUILD126_FINALIZE_PENDING_CHC__=true;

  const BUILD='126';
  const SHARED=new Set(['CHC022','CHC023']);
  const norm=v=>String(v??'').trim().toUpperCase().replace(/\s+/g,' ');
  const text=v=>String(v??'').trim();
  const safe=v=>text(v).toUpperCase().replace(/[^A-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'');
  const isSharedRoll=v=>SHARED.has(norm(v));

  function rows(){
    try{const a=typeof window.carpetRecords==='function'?window.carpetRecords():[];return Array.isArray(a)?a:[]}catch{return []}
  }
  function isPendingPlaceholder(item={},record={}){
    const code=norm(item.roll),mfr=norm(item.manufacturerRoll);if(!isSharedRoll(code)||!mfr||norm(record.manufacturerRoll)!==mfr)return false;
    const rr=norm(record.roll||record._cloudRecordId),source=norm(record.sourceRoll);
    const family=source===code||rr===`${code}-${mfr}`||rr.startsWith(code+'-');
    const state=new Set([norm(record.status),norm(record.sourceStatus)]);
    const pending=[...state].some(v=>['PENDING','CHECK','WAITING','INCOMING'].includes(v));
    return family&&Number(record.length||0)<=0&&pending&&!text(record.sourceOperationId);
  }
  function findPending(r,list=rows()){
    return list.find(x=>norm(x.manufacturerRoll)===norm(r.manufacturerRoll)&&isPendingPlaceholder(r,x))||null;
  }
  function finishImpact(r,result){
    try{
      const events=load(EVENTDB),exists=events.some(e=>String(e.operationId)===String(r.id)&&String(e.type)===String(r.type)&&String(e.reference||'')===String(r.po||r.roll||r.product||''));
      if(!exists){events.unshift({id:Date.now()+Math.random(),operationId:r.id,time:new Date().toISOString(),type:r.type,reference:r.po||r.roll||r.product,result});save(EVENTDB,events)}
    }catch(e){console.warn('[Build126] event log',e)}
    r.impactApplied=true;r.impactResult=result;r.appliedAt=new Date().toISOString();return true;
  }
  function validateFinal(r,target,list){
    if(!r||r.type!=='Carpet Receiving')return 'Invalid carpet receiving record.';
    if(!isSharedRoll(r.roll))return 'This finalizer only handles CHC022 / CHC023 shared roll codes.';
    if(!text(r.manufacturerRoll))return 'Manufacturer Roll # is required.';
    if(!(Number(r.quantity||0)>0))return 'Enter a carpet length greater than zero.';
    if(!text(r.location))return 'Put-away location is required.';
    if(!target)return 'The matching Pending arrival placeholder is no longer available. Refresh and try again.';
    const activeDuplicate=list.find(x=>String(x.id)!==String(target.id)&&norm(x.manufacturerRoll)===norm(r.manufacturerRoll)&&!isPendingPlaceholder(r,x));
    if(activeDuplicate)return `Manufacturer Roll ${text(r.manufacturerRoll)} is already active on ${activeDuplicate.roll||'another carpet record'}${activeDuplicate.location?` at ${activeDuplicate.location}`:''}.`;
    return '';
  }
  function finalize(r,target){
    try{
      const list=rows(),actual=list.find(x=>String(x.id)===String(target.id))||findPending(r,list),err=validateFinal(r,actual,list);if(err)throw new Error(err);
      const now=new Date().toISOString(),oldCloudId=text(actual.cloudRecordId||actual._cloudRecordId||actual.roll),physicalRollId=text(actual.physicalRollId)||`LEGACY-${safe(oldCloudId||`${norm(r.roll)}-${r.manufacturerRoll}`)}`,cloudRecordId=oldCloudId||`${norm(r.roll)}__${physicalRollId}`;
      Object.assign(actual,{
        roll:norm(r.roll),sourceRoll:norm(r.roll),physicalRollId,cloudRecordId,sharedRollCode:true,
        manufacturerRoll:typeof cleanManufacturerRoll==='function'?cleanManufacturerRoll(r.manufacturerRoll):text(r.manufacturerRoll),
        lot:r.lot||actual.lot||'',collection:r.collection||r.product||actual.collection||'Carpet',colour:r.colour||actual.colour||'',
        length:Number(r.quantity||0),originalLength:Number(r.quantity||0),width:r.width||actual.width||'12',location:r.location,
        measure:'FULL',status:Number(r.quantity||0)<3?'Used Up':'Active',tmRequired:false,warehouseScope:'warehouse',transferredOut:false,
        po:r.po||actual.po||'',supplier:r.supplier||actual.supplier||'',sqYd:Number(r.sqYd||actual.sqYd||0),weightLb:Number(r.weightLb||actual.weightLb||0),
        sourceStatus:'RECEIVED',sourceOperationId:r.id,arrivalPlaceholderId:oldCloudId,arrivalPlaceholderAdoptedAt:now,receivedAt:now,updatedAt:now,reviewNote:''
      });
      if(!actual.createdAt)actual.createdAt=now;
      if(!save(CARPETDB,list))throw new Error(`Pending placeholder ${oldCloudId||r.manufacturerRoll} could not be updated.`);
      const verified=load(CARPETDB).some(x=>String(x.id)===String(actual.id)&&String(x.sourceOperationId||'')===String(r.id)&&norm(x.roll)===norm(r.roll)&&Number(x.length||0)>0&&norm(x.manufacturerRoll)===norm(r.manufacturerRoll));
      if(!verified)throw new Error('Pending arrival finalization failed post-save verification. Inventory was not confirmed.');
      return finishImpact(r,`Pending CHC arrival finalized: ${norm(r.roll)} · MFG ${text(r.manufacturerRoll)} · ${Number(r.quantity||0)} ft · Rack ${r.location} · FULL`);
    }catch(e){alert('Linked update stopped: '+(e?.message||e));return false}
  }
  function install(){
    const current=window.applySingleOperationImpact;if(typeof current!=='function'||current.__build126)return false;
    const wrapped=function(r){
      if(r&&r.type==='Carpet Receiving'&&r.inventoryMode==='Stock'&&r.status==='Completed'&&!r.impactApplied&&isSharedRoll(r.roll)&&text(r.manufacturerRoll)){
        const hit=findPending(r);if(hit)return finalize(r,hit);
      }
      return current.apply(this,arguments);
    };
    wrapped.__build126=true;wrapped.__original=current;window.applySingleOperationImpact=wrapped;
    document.documentElement.setAttribute('data-runlu-finalize-pending-chc',BUILD);return true;
  }

  install();let tries=0;const timer=setInterval(()=>{if(install()||++tries>120)clearInterval(timer)},100);
  window.addEventListener('pageshow',()=>setTimeout(install,30));
  window.RUNLUFinalizePendingCHCBuild126={version:BUILD,isSharedRoll,isPendingPlaceholder,findPending,validateFinal,finalize};
})();
