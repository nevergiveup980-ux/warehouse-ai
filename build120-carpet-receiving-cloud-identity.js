// RUNLU Warehouse OS V6.12.25 Build120 · Carpet Receiving live identity guard + safe conflict reconciliation.
// Build124 revision: CHC022 / CHC023 are shared display roll codes. Their display Roll # may repeat,
// while Manufacturer Roll # stays unique and each physical roll receives a hidden cloud identity.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD120_CARPET_RECEIVE_GUARD__)return;
  window.__RUNLU_BUILD120_CARPET_RECEIVE_GUARD__=true;

  const CARPET='runlu_carpet_inventory_v52';
  const QUEUE='runlu_cloud_master_offline_queue_v680';
  const CONFLICTS='runlu_cloud_master_record_conflicts_v680';
  const VERSIONS='runlu_cloud_master_record_versions_v680';
  const AUDIT='runlu_build120_conflict_reconcile_audit';
  const SHARED=new Set(['CHC022','CHC023']);
  const norm=v=>String(v??'').trim().toUpperCase().replace(/\s+/g,' ');
  const text=v=>String(v??'').trim();
  const isSharedRoll=v=>SHARED.has(norm(v));
  const parse=s=>{try{return JSON.parse(s)}catch{return null}};
  const read=k=>parse(localStorage.getItem(k)||'null');
  const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
  const key=(dataset,id)=>dataset+'::'+String(id??'');
  let checking=false,reconciling=false,lastRollCheck='',lastRollResult=null;

  function localCarpets(){
    try{if(typeof window.carpetRecords==='function'){const a=window.carpetRecords();if(Array.isArray(a))return a}}catch(_){}
    const a=read(CARPET);return Array.isArray(a)?a:[];
  }
  function carpetLabel(r={}){
    return [text(r.roll)||'Roll',text(r.collection||r.product),text(r.colour||r.color),text(r.manufacturerRoll)?'MFG '+text(r.manufacturerRoll):'',text(r.location)?'Rack '+text(r.location):'',text(r.status)].filter(Boolean).join(' · ');
  }
  function localRollDuplicate(roll){
    const wanted=norm(roll);if(!wanted||isSharedRoll(wanted))return null;
    return localCarpets().find(r=>norm(r.roll)===wanted)||null;
  }
  function localManufacturerDuplicate(manufacturerRoll){
    const wanted=norm(manufacturerRoll);if(!wanted)return null;
    return localCarpets().find(r=>norm(r.manufacturerRoll)===wanted)||null;
  }
  function sessionReady(){return typeof window.cloudEnsureSession==='function'&&typeof window.cloudRequest==='function'&&typeof window.cloudHeaders==='function'}
  async function liveCarpetRows(){
    if(!sessionReady())throw new Error('Warehouse Cloud is not ready.');
    const s=await window.cloudEnsureSession();if(!s?.access_token)throw new Error('Warehouse Cloud sign-in is required.');
    const path='/rest/v1/warehouse_records?select=record_id,payload,version,deleted_at,updated_at&user_id=eq.'+encodeURIComponent(s.user.id)+'&dataset_key=eq.'+encodeURIComponent(CARPET)+'&deleted_at=is.null&order=record_id.asc&limit=1000';
    const rows=await window.cloudRequest(path,{headers:window.cloudHeaders(s.access_token,false)});
    if(!Array.isArray(rows))throw new Error('Warehouse Cloud carpet lookup returned an invalid result.');
    return rows;
  }
  function rowPayload(row={}){
    const p=row.payload&&typeof row.payload==='object'?clone(row.payload):{};
    if(!text(p.roll))p.roll=text(row.record_id);
    p._cloudRecordId=text(row.record_id);p._cloudVersion=Number(row.version||0);p._cloudUpdatedAt=row.updated_at||'';
    return p;
  }
  async function lookupRoll(roll,{force=false}={}){
    const wanted=norm(roll);if(!wanted)return {status:'empty'};
    if(isSharedRoll(wanted))return {status:'shared',source:'policy',roll:wanted};
    const local=localRollDuplicate(wanted);if(local)return {status:'duplicate',source:'device',record:local};
    if(!force&&wanted===lastRollCheck&&lastRollResult)return lastRollResult;
    const rows=await liveCarpetRows(),hit=rows.find(r=>norm(r.record_id)===wanted||norm(r.payload?.roll)===wanted);
    const result=hit?{status:'duplicate',source:'cloud',record:rowPayload(hit)}:{status:'unique',source:'cloud'};
    lastRollCheck=wanted;lastRollResult=result;return result;
  }
  function receivingItemsFromForm(){
    const items=[];
    try{if(typeof operationItemsDraft!=='undefined'&&Array.isArray(operationItemsDraft))items.push(...operationItemsDraft.map(clone))}catch(_){}
    try{if(typeof window.operationItemFromForm==='function'){const cur=window.operationItemFromForm(true);if(cur)items.push(cur)}}catch(_){}
    if(!items.length){
      const type=document.getElementById('operationLineType')?.value||document.getElementById('operationType')?.value||'';
      const roll=document.getElementById('operationRoll')?.value||'';
      if(type||roll)items.push({type,roll,manufacturerRoll:document.getElementById('operationManufacturerRoll')?.value||''});
    }
    return items.filter(x=>text(x.type)==='Carpet Receiving');
  }
  function duplicateInsideBatch(items){
    const rolls=new Set(),mfrs=new Set();
    for(const item of items){
      const r=norm(item.roll);if(r&&!isSharedRoll(r)){if(rolls.has(r))return {kind:'roll',item};rolls.add(r)}
      const m=norm(item.manufacturerRoll);if(m){if(mfrs.has(m))return {kind:'manufacturer',item};mfrs.add(m)}
    }
    return null;
  }
  function duplicateMessage(roll,result){
    const r=result?.record||{};
    return `Roll ${norm(roll)} already exists in Carpet Inventory.\n\n${carpetLabel(r)}\n\nThis new Carpet Receiving entry was NOT applied. Use the existing roll or enter a different Roll #.`;
  }
  function manufacturerMessage(mfr,record={}){
    return `Manufacturer Roll ${text(mfr)} already belongs to ${carpetLabel(record)}.\n\nThe receiving record was NOT applied.`;
  }
  function setRollHint(message,state=''){
    const input=document.getElementById('operationRoll');if(!input)return;
    let hint=document.getElementById('build120RollIdentityHint');
    if(!hint){hint=document.createElement('div');hint.id='build120RollIdentityHint';hint.className='meta';input.insertAdjacentElement('afterend',hint)}
    hint.textContent=message||'';hint.style.fontWeight=message?'800':'';
    hint.style.color=state==='bad'?'#a52232':state==='good'?'#176b40':state==='shared'?'#244da0':'#6f7785';
    input.style.borderColor=state==='bad'?'#d94a57':state==='good'?'#2f9d62':state==='shared'?'#4f7ee8':'';
  }
  async function checkCurrentRoll({announce=false}={}){
    const type=document.getElementById('operationLineType')?.value||document.getElementById('operationType')?.value||'';
    const roll=document.getElementById('operationRoll')?.value||'';
    if(type!=='Carpet Receiving'||!text(roll)){setRollHint('');return {status:'skip'}}
    if(isSharedRoll(roll)){
      const mfr=document.getElementById('operationManufacturerRoll')?.value||'';
      const localM=localManufacturerDuplicate(mfr);
      if(localM){const result={status:'manufacturer-duplicate',source:'device',record:localM};setRollHint(`⚠ ${norm(roll)} is shared, but Manufacturer Roll ${text(mfr)} already exists — ${carpetLabel(localM)}`,'bad');if(announce)alert(manufacturerMessage(mfr,localM));return result}
      if(mfr){
        try{
          const rows=await liveCarpetRows(),hit=rows.find(r=>norm(r.payload?.manufacturerRoll)===norm(mfr));
          if(hit){const p=rowPayload(hit),result={status:'manufacturer-duplicate',source:'cloud',record:p};setRollHint(`⚠ ${norm(roll)} is shared, but Manufacturer Roll ${text(mfr)} already exists — ${carpetLabel(p)}`,'bad');if(announce)alert(manufacturerMessage(mfr,p));return result}
        }catch(e){setRollHint(`${norm(roll)} is a shared roll code. Manufacturer Roll uniqueness will be verified before completion.`,'shared');return {status:'shared-unverified',error:e?.message||String(e)}}
      }
      setRollHint(`✓ ${norm(roll)} is a shared roll code — multiple physical rolls are allowed. Manufacturer Roll # remains unique.`,'shared');
      return {status:'shared'};
    }
    const local=localRollDuplicate(roll);
    if(local){const result={status:'duplicate',source:'device',record:local};setRollHint(`⚠ Roll ${norm(roll)} already exists — ${carpetLabel(local)}`,'bad');if(announce)alert(duplicateMessage(roll,result));return result}
    setRollHint('Checking Roll # against live Warehouse Cloud…');
    try{
      const result=await lookupRoll(roll,{force:true});
      if(result.status==='duplicate'){setRollHint(`⚠ Roll ${norm(roll)} already exists — ${carpetLabel(result.record)}`,'bad');if(announce)alert(duplicateMessage(roll,result));}
      else setRollHint(`✓ Roll ${norm(roll)} is available in live Warehouse Cloud`,'good');
      return result;
    }catch(e){setRollHint('Cloud uniqueness check unavailable — completed receiving is blocked until Cloud ✓','bad');if(announce)alert('Cannot verify this new Roll # against Warehouse Cloud.\n\n'+(e?.message||e)+'\n\nThe receiving record was NOT applied. You may keep it as a draft and try again when Cloud ✓ is available.');return {status:'unverified',error:e?.message||String(e)}}
  }
  async function validateReceivingBeforeMutation(){
    const items=receivingItemsFromForm();if(!items.length)return {ok:true};
    const repeated=duplicateInsideBatch(items);
    if(repeated){
      if(repeated.kind==='manufacturer')alert(`Manufacturer Roll ${text(repeated.item.manufacturerRoll)} appears more than once in this receiving batch. Remove the duplicate line before saving.`);
      else alert(`Roll ${norm(repeated.item.roll)} appears more than once in this receiving batch. Remove the duplicate line before saving.`);
      return {ok:false,reason:repeated.kind==='manufacturer'?'batch-manufacturer-duplicate':'batch-duplicate'};
    }
    for(const item of items){
      if(!text(item.roll)){alert('Enter the Carpet Roll # before receiving stock.');return {ok:false,reason:'missing-roll'}}
      const local=localRollDuplicate(item.roll);if(local){alert(duplicateMessage(item.roll,{record:local,source:'device'}));return {ok:false,reason:'local-duplicate',record:local}}
      const localM=localManufacturerDuplicate(item.manufacturerRoll);if(localM){alert(manufacturerMessage(item.manufacturerRoll,localM));return {ok:false,reason:'local-manufacturer-duplicate',record:localM}}
    }
    let cloudRows;
    try{cloudRows=await liveCarpetRows()}catch(e){
      const completed=(document.getElementById('operationStatus')?.value||'')==='Completed';
      if(completed){alert('Live Warehouse Cloud is required to verify a new Carpet Roll # before Completed receiving can change inventory.\n\n'+(e?.message||e)+'\n\nNothing was applied. Keep the work as a draft or retry when Cloud ✓ is available.');return {ok:false,reason:'cloud-unavailable'}}
      return {ok:true,warning:'cloud-unavailable-draft'};
    }
    const remote=cloudRows.map(rowPayload);
    for(const item of items){
      if(!isSharedRoll(item.roll)){
        const hit=remote.find(r=>norm(r.roll)===norm(item.roll)||norm(r._cloudRecordId)===norm(item.roll));
        if(hit){setRollHint(`⚠ Roll ${norm(item.roll)} already exists — ${carpetLabel(hit)}`,'bad');alert(duplicateMessage(item.roll,{record:hit,source:'cloud'}));return {ok:false,reason:'cloud-duplicate',record:hit}}
      }
      const m=norm(item.manufacturerRoll);if(m){const mHit=remote.find(r=>norm(r.manufacturerRoll)===m);if(mHit){alert(manufacturerMessage(item.manufacturerRoll,mHit));return {ok:false,reason:'manufacturer-duplicate',record:mHit}}}
    }
    return {ok:true};
  }

  function canonical(v){
    if(Array.isArray(v))return v.map(canonical);
    if(v&&typeof v==='object'){
      const out={};for(const k of Object.keys(v).sort()){
        if(['_cloudUpdatedAt','_cloudRecordId','_cloudVersion','updatedAt','lastUpdatedAt','updated','reconciledAt'].includes(k))continue;
        const value=v[k];if(value===undefined)continue;out[k]=canonical(value);
      }return out;
    }return v;
  }
  function sameBusinessPayload(a,b){try{return JSON.stringify(canonical(a))===JSON.stringify(canonical(b))}catch{return false}}
  function updateVersion(dataset,id,version){const map=read(VERSIONS)||{};map[key(dataset,id)]=Number(version||0);write(VERSIONS,map)}
  async function fetchAllCloudRows(){
    if(!sessionReady())throw new Error('Warehouse Cloud is not ready.');
    const s=await window.cloudEnsureSession();if(!s?.access_token)throw new Error('Warehouse Cloud sign-in is required.');
    const path='/rest/v1/warehouse_records?select=dataset_key,record_id,payload,version,deleted_at,updated_at&user_id=eq.'+encodeURIComponent(s.user.id)+'&order=dataset_key.asc,record_id.asc';
    const rows=await window.cloudRequest(path,{headers:window.cloudHeaders(s.access_token,false)});
    if(!Array.isArray(rows))throw new Error('Conflict verification returned an invalid cloud record list.');return rows;
  }
  async function reconcileNoopConflicts(reason='automatic'){
    if(reconciling)return {status:'busy'};
    let cs=read(CONFLICTS),q=read(QUEUE);if(!Array.isArray(cs)||!cs.length)return {status:'clean',removed:0,remaining:0};if(!Array.isArray(q))q=[];
    reconciling=true;
    try{
      const rows=await fetchAllCloudRows(),remote=new Map(rows.map(r=>[key(r.dataset_key,r.record_id),r]));
      const removedIds=new Set(),kept=[];
      for(const c of cs){
        const m=q.find(x=>x.id===c.queueId),r=remote.get(key(c.datasetKey,c.recordId));
        let resolved=false;
        if(m&&r){
          if(m.op==='delete'&&r.deleted_at)resolved=true;
          else if(m.op==='upsert'&&!r.deleted_at&&sameBusinessPayload(m.payload,r.payload))resolved=true;
        }
        if(resolved){removedIds.add(c.queueId);updateVersion(c.datasetKey,c.recordId,r.version)}else kept.push(c);
      }
      if(removedIds.size){q=q.filter(m=>!removedIds.has(m.id));write(QUEUE,q);write(CONFLICTS,kept)}
      const audit={at:new Date().toISOString(),reason,checked:cs.length,removed:removedIds.size,remaining:kept.length};write(AUDIT,audit);
      try{window.renderCloudStatus?.();window.runluCloudMasterRender?.();}catch(_){}
      if(removedIds.size&&!kept.length)try{setTimeout(()=>window.runluCloudMasterSync?.({silent:true}),100)}catch(_){}
      return {status:'ok',removed:removedIds.size,remaining:kept.length};
    }catch(e){return {status:'error',error:e?.message||String(e),remaining:Array.isArray(cs)?cs.length:0}}
    finally{reconciling=false}
  }

  function installSaveGuard(){
    if(typeof window.saveOperation!=='function'||window.saveOperation.__build120)return false;
    const prior=window.saveOperation;
    const wrapped=async function(){if(checking)return false;checking=true;try{const v=await validateReceivingBeforeMutation();if(!v.ok)return false;return prior.apply(this,arguments)}finally{checking=false}};
    wrapped.__build120=true;wrapped.__build124SharedRollPolicy=true;wrapped.__original=prior;window.saveOperation=wrapped;return true;
  }
  function installAddLineGuard(){
    if(typeof window.addOperationItem!=='function'||window.addOperationItem.__build120)return false;
    const prior=window.addOperationItem;
    const wrapped=async function(){
      const type=document.getElementById('operationLineType')?.value||document.getElementById('operationType')?.value||'';
      if(type==='Carpet Receiving'){
        const r=await checkCurrentRoll({announce:true});if(['duplicate','unverified','manufacturer-duplicate'].includes(r.status))return false;
      }
      return prior.apply(this,arguments);
    };
    wrapped.__build120=true;wrapped.__build124SharedRollPolicy=true;wrapped.__original=prior;window.addOperationItem=wrapped;return true;
  }
  function bindRollField(){
    const input=document.getElementById('operationRoll');if(!input||input.dataset.build120Bound==='1')return;
    input.dataset.build120Bound='1';let timer=null;
    input.addEventListener('input',()=>{lastRollCheck='';lastRollResult=null;setRollHint('');clearTimeout(timer);timer=setTimeout(()=>checkCurrentRoll({announce:false}),550)});
    input.addEventListener('blur',()=>checkCurrentRoll({announce:false}));
    const mfr=document.getElementById('operationManufacturerRoll');if(mfr&&mfr.dataset.build124SharedBound!=='1'){
      mfr.dataset.build124SharedBound='1';mfr.addEventListener('blur',()=>{const r=document.getElementById('operationRoll')?.value||'';if(isSharedRoll(r))checkCurrentRoll({announce:false})});
    }
  }
  function boot(){
    installSaveGuard();installAddLineGuard();bindRollField();
    const mo=new MutationObserver(()=>{installSaveGuard();installAddLineGuard();bindRollField()});mo.observe(document.body,{childList:true,subtree:true});
    [1200,3500].forEach(ms=>setTimeout(()=>reconcileNoopConflicts('boot'),ms));
    window.addEventListener('focus',()=>setTimeout(()=>reconcileNoopConflicts('focus'),250));
    window.addEventListener('online',()=>setTimeout(()=>reconcileNoopConflicts('online'),350));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(()=>reconcileNoopConflicts('visible'),250)});
  }

  window.RUNLUCarpetReceivingGuardBuild120={version:'120',revision:'124',sharedRolls:[...SHARED],isSharedRoll,lookupRoll,validateReceivingBeforeMutation,checkCurrentRoll,sameBusinessPayload,canonical,reconcileNoopConflicts,get lastResult(){return lastRollResult}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
