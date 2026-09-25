// RUNLU Warehouse OS Build148 · Held Inventory Pause Isolation
// Held stale Inventory evidence must not globally freeze read-only Cloud refresh.
// No queue/conflict is deleted and no mutation RPC is called here.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD148_HELD_PAUSE_ISOLATION__)return;
  window.__RUNLU_BUILD148_HELD_PAUSE_ISOLATION__=true;

  const API='https://ekrnknlawekeoszzkamd.supabase.co';
  const KEY='sb_publishable_Jr12gnQ7UrU6Wv9xz4L1aA_bcTZiGqn';
  const SESSION='runlu_cloud_session_v54';
  const QUEUE='runlu_cloud_master_offline_queue_v680';
  const CONFLICTS='runlu_cloud_master_record_conflicts_v680';
  const INV='runlu_inventory_records_v21';
  const LAST='runlu_build148_last_readonly_refresh_v1';
  let busy=false;

  const parse=s=>{try{return JSON.parse(s)}catch{return null}};
  const read=k=>parse(localStorage.getItem(k)||'null');
  const key=(d,id)=>String(d||'')+'::'+String(id||'');

  function classify(){
    const q=read(QUEUE),c=read(CONFLICTS);
    const queue=Array.isArray(q)?q:[],conflicts=Array.isArray(c)?c:[];
    const heldQueueIds=new Set(),heldKeys=new Set();
    for(const m of queue){
      if(m?.datasetKey===INV&&m?.op==='upsert'&&m?.source!=='live-save'&&(m?.replayHeld||m?.blocked)){
        heldQueueIds.add(m.id);heldKeys.add(key(INV,m.recordId));
      }
    }
    const heldConflicts=[],realConflicts=[];
    for(const x of conflicts){
      if(x?.datasetKey===INV&&heldQueueIds.has(x.queueId)){heldConflicts.push(x);heldKeys.add(key(INV,x.recordId))}
      else realConflicts.push(x);
    }
    return {queue,conflicts,heldQueueIds,heldKeys,heldConflicts,realConflicts};
  }

  async function refresh(reason='manual'){
    if(busy||navigator.onLine===false)return false;
    const s=read(SESSION);if(!s?.access_token)return false;
    const x=classify();
    if(!x.heldConflicts.length)return false;
    // Build147 owns the evidence-preserving merge. Calling it directly bypasses
    // Build072's global PAUSED gate without changing Cloud Master state.
    const b147=window.RUNLUHeldInventoryRefreshBuild147;
    if(!b147?.refresh)return false;
    busy=true;
    try{
      const ok=await b147.refresh('build148-'+reason);
      localStorage.setItem(LAST,JSON.stringify({
        at:new Date().toISOString(),reason,heldConflicts:x.heldConflicts.length,
        remainingReviewConflicts:x.realConflicts.length,readonly:true,refreshed:!!ok
      }));
      document.documentElement.setAttribute('data-runlu-build148-held-pause-isolation',ok?'ok':'no-refresh');
      return !!ok;
    }finally{busy=false}
  }

  window.RUNLUHeldPauseIsolationBuild148={version:'148',classify,refresh};
  setTimeout(()=>refresh('boot'),2600);
  window.addEventListener('pageshow',()=>setTimeout(()=>refresh('pageshow'),900));
  window.addEventListener('focus',()=>setTimeout(()=>refresh('focus'),850));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(()=>refresh('visible'),850)});
})();
