// RUNLU Warehouse OS V6.12.25 Build120 · Saved Carpet Receiving completion guard.
// Complements the new-entry guard: a Waiting/In Progress Carpet Receiving record must
// re-verify Roll # against local + live cloud before later completion can apply inventory.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD120_CARPET_COMPLETION_GUARD__)return;
  window.__RUNLU_BUILD120_CARPET_COMPLETION_GUARD__=true;

  const CARPET='runlu_carpet_inventory_v52';
  const norm=v=>String(v??'').trim().toUpperCase().replace(/\s+/g,' ');
  const text=v=>String(v??'').trim();
  let installed=false,busy=false;

  function recordItems(x={}){
    const raw=Array.isArray(x.items)&&x.items.length?x.items:[x];
    return raw.map(i=>({...i,type:i.type||x.type})).filter(i=>i.type==='Carpet Receiving');
  }
  function localHit(roll){
    try{
      const rows=typeof window.carpetRecords==='function'?window.carpetRecords():[];
      return (Array.isArray(rows)?rows:[]).find(r=>norm(r.roll)===norm(roll))||null;
    }catch{return null}
  }
  function label(r={}){
    return [text(r.roll)||'Roll',text(r.collection||r.product),text(r.colour||r.color),text(r.location)?'Rack '+text(r.location):'',text(r.status)].filter(Boolean).join(' · ');
  }
  async function cloudRows(){
    if(typeof window.cloudEnsureSession!=='function'||typeof window.cloudRequest!=='function'||typeof window.cloudHeaders!=='function')throw new Error('Warehouse Cloud is not ready.');
    const s=await window.cloudEnsureSession();if(!s?.access_token)throw new Error('Warehouse Cloud sign-in is required.');
    const path='/rest/v1/warehouse_records?select=record_id,payload,version,deleted_at,updated_at&user_id=eq.'+encodeURIComponent(s.user.id)+'&dataset_key=eq.'+encodeURIComponent(CARPET)+'&deleted_at=is.null&order=record_id.asc&limit=1000';
    const rows=await window.cloudRequest(path,{headers:window.cloudHeaders(s.access_token,false)});
    if(!Array.isArray(rows))throw new Error('Warehouse Cloud carpet lookup returned an invalid result.');
    return rows;
  }
  async function validateRecord(x){
    const items=recordItems(x);if(!items.length)return {ok:true};
    for(const item of items){
      if(!text(item.roll))return {ok:false,reason:'missing-roll',message:'Enter the Carpet Roll # before completing this receiving record.'};
      const hit=localHit(item.roll);
      if(hit)return {ok:false,reason:'local-duplicate',record:hit,message:`Roll ${norm(item.roll)} already exists in Carpet Inventory.\n\n${label(hit)}\n\nCompletion was blocked so inventory was not changed.`};
    }
    let rows;try{rows=await cloudRows()}catch(e){return {ok:false,reason:'cloud-unavailable',message:`Live Warehouse Cloud is required before Carpet Receiving can be completed.\n\n${e?.message||e}\n\nInventory was not changed.`}}
    for(const item of items){
      const hit=rows.find(r=>norm(r.record_id)===norm(item.roll)||norm(r.payload?.roll)===norm(item.roll));
      if(hit){const p={...(hit.payload||{}),roll:hit.payload?.roll||hit.record_id};return {ok:false,reason:'cloud-duplicate',record:p,message:`Roll ${norm(item.roll)} already exists in Warehouse Cloud.\n\n${label(p)}\n\nCompletion was blocked so inventory was not changed.`}}
      const m=norm(item.manufacturerRoll);if(m){const mh=rows.find(r=>norm(r.payload?.manufacturerRoll)===m);if(mh){const p={...(mh.payload||{}),roll:mh.payload?.roll||mh.record_id};return {ok:false,reason:'manufacturer-duplicate',record:p,message:`Manufacturer Roll ${text(item.manufacturerRoll)} already belongs to ${label(p)}.\n\nCompletion was blocked so inventory was not changed.`}}}
    }
    return {ok:true};
  }
  function install(){
    if(installed||typeof window.setOperationStatus!=='function')return false;
    const prior=window.setOperationStatus;
    const wrapped=async function(id,status){
      if(status!=='Completed')return prior.apply(this,arguments);
      let x=null;try{x=(typeof window.operationRecords==='function'?window.operationRecords():[]).find(r=>Number(r.id)===Number(id))}catch(_){}
      if(!x||x.status==='Completed'||!recordItems(x).length)return prior.apply(this,arguments);
      if(busy)return false;busy=true;
      try{
        const v=await validateRecord(x);
        if(!v.ok){alert(v.message||'Carpet Receiving completion was blocked by Roll # identity protection.');return false}
        return prior.apply(this,arguments);
      }finally{busy=false}
    };
    wrapped.__build120=true;wrapped.__original=prior;window.setOperationStatus=wrapped;installed=true;return true;
  }
  function boot(){install();const mo=new MutationObserver(()=>install());mo.observe(document.body,{childList:true,subtree:true})}

  window.RUNLUCarpetReceivingCompletionGuardBuild120={version:'120',recordItems,validateRecord};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
