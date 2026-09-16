// RUNLU Warehouse OS V6.12.48 Build143 · Pending Work Overlay Recovery
// Cloud Master is authoritative for synchronized records, but a cloud pull must never make
// this device's still-pending mutations disappear from the working UI. Build072 rebuilds
// local datasets from cloud after each pull; during quota/conflict recovery that could hide
// work which was already captured in the preserved offline queue. This layer overlays the
// latest pending mutation back onto the local work cache after every sync, without resolving
// conflicts, changing the cloud, or resurrecting an explicit pending delete.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD143_PENDING_OVERLAY_RECOVERY__)return;
  window.__RUNLU_BUILD143_PENDING_OVERLAY_RECOVERY__=true;

  const VERSION='6.12.48',BUILD='143';
  const QUEUE='runlu_cloud_master_offline_queue_v680';
  const WORK_DATASETS=new Set([
    'runlu_operations_log_v52',
    'runlu_orders_v20',
    'runlu_receiving_v50',
    'runlu_special_orders_v51',
    'runlu_cutting_log_v52'
  ]);

  const parse=(s,fallback)=>{try{const v=JSON.parse(s||'');return v??fallback}catch{return fallback}};
  const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').trim();
  const parseMs=v=>{const n=new Date(v||0).getTime();return Number.isFinite(n)?n:0};
  const rowMs=r=>Math.max(parseMs(r?.lastUpdatedAt),parseMs(r?.updatedAt),parseMs(r?.updated),parseMs(r?.completedAt),parseMs(r?.receivedAt),parseMs(r?.createdAt),parseMs(r?.created),parseMs(r?.date));

  function stableId(dataset,row){
    if(!row||typeof row!=='object')return '';
    if(dataset==='runlu_inventory_records_v21')return text(row.inventoryId||row.id||row.cloudRecordId);
    return text(row.id||row.cloudRecordId||row.roll||row.operationId);
  }
  function latestPendingByDataset(){
    const q=parse(localStorage.getItem(QUEUE),[]),out=new Map();
    if(!Array.isArray(q))return out;
    // Queue order is chronological. A blocked mutation can be followed by a newer mutation
    // for the same record, so the last queue item for that dataset/record is the local intent.
    for(const m of q){
      if(!m||!WORK_DATASETS.has(String(m.datasetKey||''))||!text(m.recordId))continue;
      if(!out.has(m.datasetKey))out.set(m.datasetKey,new Map());
      out.get(m.datasetKey).set(String(m.recordId),m);
    }
    return out;
  }
  function sortRows(dataset,rows){
    if(dataset==='runlu_operations_log_v52'||dataset==='runlu_receiving_v50'||dataset==='runlu_special_orders_v51'||dataset==='runlu_cutting_log_v52'){
      return rows.sort((a,b)=>rowMs(b)-rowMs(a));
    }
    return rows;
  }
  function ensureHeadroom(){
    try{window.RUNLUMobileCacheDrainBuild142?.reclaimIfNeeded?.()}catch(_){}
    try{window.RUNLUCloudStorageRecoveryBuild141?.ensureHeadroom?.()}catch(_){}
  }
  function writeDataset(dataset,rows){
    ensureHeadroom();
    const encoded=JSON.stringify(rows);
    try{localStorage.setItem(dataset,encoded);return true}catch(e){
      ensureHeadroom();
      try{localStorage.setItem(dataset,encoded);return true}catch(_){return false}
    }
  }

  function overlayPendingWork({render=true}={}){
    const groups=latestPendingByDataset();
    let restored=0,updated=0,removed=0,failed=0,datasets=0;
    for(const [dataset,pending] of groups){
      const raw=parse(localStorage.getItem(dataset),[]);
      if(!Array.isArray(raw))continue;
      const rows=raw.map(clone),index=new Map();
      rows.forEach((r,i)=>{const id=stableId(dataset,r);if(id)index.set(id,i)});
      let changed=false;
      for(const [recordId,m] of pending){
        const idx=index.has(recordId)?index.get(recordId):-1;
        if(m.op==='delete'){
          if(idx>=0){rows.splice(idx,1);removed++;changed=true;
            index.clear();rows.forEach((r,i)=>{const id=stableId(dataset,r);if(id)index.set(id,i)});
          }
          continue;
        }
        if(m.op!=='upsert'||!m.payload||typeof m.payload!=='object')continue;
        const payload=clone(m.payload);
        const payloadId=stableId(dataset,payload)||recordId;
        if(idx>=0){
          const current=rows[idx];
          if(JSON.stringify(current)!==JSON.stringify(payload)){rows[idx]=payload;updated++;changed=true;index.set(payloadId,idx)}
        }else{
          rows.push(payload);restored++;changed=true;index.set(payloadId,rows.length-1);
        }
      }
      if(changed){
        datasets++;
        if(!writeDataset(dataset,sortRows(dataset,rows))){failed++;continue}
      }
    }
    const total=restored+updated+removed;
    if(total){
      document.documentElement?.setAttribute('data-runlu-pending-work-overlay',String(total));
      if(render){
        try{window.renderOperations?.();window.renderDashboard?.();window.renderInventory?.()}catch(e){console.warn('[Build143] render after pending overlay',e)}
      }
    }
    return {restored,updated,removed,failed,datasets,total};
  }

  function installSyncOverlay(){
    const current=window.runluCloudMasterSync;
    if(typeof current!=='function')return false;
    if(current.__build143PendingOverlay)return true;
    const wrapped=async function(){
      const result=await current.apply(this,arguments);
      // Whether sync succeeded or paused on a conflict, the still-pending queue is the
      // device's unsynchronized work and must remain visible locally.
      overlayPendingWork({render:true});
      return result;
    };
    wrapped.__build143PendingOverlay=true;
    wrapped.__original=current;
    window.runluCloudMasterSync=wrapped;
    return true;
  }

  function paint(){
    const hv=document.getElementById('headerVersion');if(hv)hv.textContent='V'+VERSION;
    document.documentElement?.setAttribute('data-runlu-build',BUILD);
    document.documentElement?.setAttribute('data-runlu-pending-overlay-recovery',BUILD);
  }
  function boot(){
    overlayPendingWork({render:true});installSyncOverlay();paint();
    // Older compatibility layers finish settling during startup. Re-assert the sync wrapper
    // and recover pending work a few times, then rely on the wrapper/focus handlers.
    let n=0;const timer=setInterval(()=>{
      installSyncOverlay();
      if(n%4===0)overlayPendingWork({render:false});
      paint();if(++n>=40)clearInterval(timer);
    },250);
    window.addEventListener('focus',()=>setTimeout(()=>{overlayPendingWork({render:true});installSyncOverlay();paint()},60));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(()=>{overlayPendingWork({render:true});installSyncOverlay();paint()},60)});
  }

  window.RUNLUPendingOverlayRecoveryBuild143={version:VERSION,build:BUILD,stableId,latestPendingByDataset,overlayPendingWork,installSyncOverlay};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
