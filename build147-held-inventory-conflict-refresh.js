// RUNLU Warehouse OS Build147 · Held Inventory Conflict-Isolated Refresh
// Preserve stale Inventory queue/conflict evidence, but do not let that evidence pin
// stale device rows in the visible cache after Cloud has already become authoritative.
(() => {
  'use strict';
  if(window.__RUNLU_BUILD147_HELD_INVENTORY_REFRESH__)return;
  window.__RUNLU_BUILD147_HELD_INVENTORY_REFRESH__=true;

  const API='https://ekrnknlawekeoszzkamd.supabase.co';
  const KEY='sb_publishable_Jr12gnQ7UrU6Wv9xz4L1aA_bcTZiGqn';
  const SESSION='runlu_cloud_session_v54';
  const QUEUE='runlu_cloud_master_offline_queue_v680';
  const CONFLICTS='runlu_cloud_master_record_conflicts_v680';
  const VERSIONS='runlu_cloud_master_record_versions_v680';
  const SUMMARY='runlu_cloud_master_summary_v680';
  const LAST_PULL='runlu_build147_last_pull_v1';
  const INV='runlu_inventory_records_v21';
  const SETTINGS='runlu_settings_v20';
  const MANAGED=new Set([
    'runlu_product_master_v21',INV,'runlu_orders_v20','runlu_receiving_v50','runlu_tasks_v50',
    'runlu_special_orders_v51','runlu_operations_log_v52','runlu_carpet_inventory_v52','runlu_cutting_log_v52',
    'runlu_event_history_v52','runlu_tag_print_history_v53','runlu_remnants_v55',SETTINGS
  ]);

  let busy=false;
  const parse=s=>{try{return JSON.parse(s)}catch{return null}};
  const read=k=>parse(localStorage.getItem(k)||'null');
  const text=v=>String(v??'').trim();
  const key=(dataset,id)=>dataset+'::'+id;

  function stableId(dataset,row){
    if(dataset===SETTINGS)return '__document__';
    if(!row||typeof row!=='object')return '';
    if(dataset===INV)return text(row.inventoryId||row.id||row.cloudRecordId);
    return text(row.id||row.cloudRecordId||row.roll||row.operationId);
  }

  function classifyHeldInventory(){
    const q=read(QUEUE),cs=read(CONFLICTS);
    const queueRows=Array.isArray(q)?q:[];
    const conflictRows=Array.isArray(cs)?cs:[];
    const heldQueueIds=new Set(),heldKeys=new Set();
    let changed=false;
    for(const m of queueRows){
      if(m?.datasetKey!==INV||m?.op!=='upsert'||m?.source==='live-save')continue;
      heldQueueIds.add(m.id);
      heldKeys.add(key(INV,m.recordId));
      if(!m.replayHeld){
        m.replayHeld=true;
        m.replayHoldReason='build147-untrusted-inventory-conflict';
        m.replayHeldAt=m.replayHeldAt||new Date().toISOString();
        changed=true;
      }
    }
    if(changed)localStorage.setItem(QUEUE,JSON.stringify(queueRows));
    for(const c of conflictRows){
      if(c?.datasetKey===INV&&heldQueueIds.has(c.queueId))heldKeys.add(key(INV,c.recordId));
    }
    return {queueRows,conflictRows,heldQueueIds,heldKeys};
  }

  function protectedKeys(classified){
    const out=new Set();
    for(const m of classified.queueRows){
      if(!m?.datasetKey||!m?.recordId)continue;
      if(classified.heldQueueIds.has(m.id))continue;
      out.add(key(m.datasetKey,m.recordId));
    }
    for(const c of classified.conflictRows){
      if(!c?.datasetKey||!c?.recordId)continue;
      if(c.datasetKey===INV&&classified.heldQueueIds.has(c.queueId))continue;
      out.add(key(c.datasetKey,c.recordId));
    }
    return out;
  }

  function groupRemote(rows){
    const groups=new Map();MANAGED.forEach(k=>groups.set(k,[]));
    for(const r of rows){
      if(!MANAGED.has(r.dataset_key)||r.deleted_at)continue;
      if(r.dataset_key===SETTINGS)groups.set(SETTINGS,r.payload||{});
      else groups.get(r.dataset_key).push(r.payload||{});
    }
    return groups;
  }

  function mergeDataset(dataset,remoteRows,protectedSet){
    if(dataset===SETTINGS){
      if(protectedSet.has(key(SETTINGS,'__document__')))return;
      if(remoteRows&&typeof remoteRows==='object'&&!Array.isArray(remoteRows))localStorage.setItem(SETTINGS,JSON.stringify(remoteRows));
      return;
    }
    const local=read(dataset),localRows=Array.isArray(local)?local:[];
    const keep=new Map();
    for(const row of localRows){
      const id=stableId(dataset,row);
      if(id&&protectedSet.has(key(dataset,id)))keep.set(id,row);
    }
    const merged=[];
    for(const row of Array.isArray(remoteRows)?remoteRows:[]){
      const id=stableId(dataset,row);
      if(id&&keep.has(id)){merged.push(keep.get(id));keep.delete(id)}
      else merged.push(row);
    }
    keep.forEach(row=>merged.push(row));
    localStorage.setItem(dataset,JSON.stringify(merged));
  }

  function rememberRemote(rows){
    const versions=read(VERSIONS)||{},counts={};
    for(const r of rows){
      versions[key(r.dataset_key,r.record_id)]=Number(r.version||0);
      if(!r.deleted_at)counts[r.dataset_key]=(counts[r.dataset_key]||0)+1;
    }
    localStorage.setItem(VERSIONS,JSON.stringify(versions));
    localStorage.setItem(SUMMARY,JSON.stringify({
      at:new Date().toISOString(),counts,totalActive:Object.values(counts).reduce((a,b)=>a+b,0),
      tombstones:rows.filter(r=>r.deleted_at).length,build147HeldInventoryRefresh:true
    }));
  }

  async function fetchCloudRows(session){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const res=await fetch(API+'/rest/v1/warehouse_records?select=dataset_key,record_id,payload,version,deleted_at,updated_at,origin&order=dataset_key.asc,record_id.asc',{
        method:'GET',cache:'no-store',signal:controller.signal,
        headers:{apikey:KEY,Authorization:'Bearer '+session.access_token,'Cache-Control':'no-cache','Pragma':'no-cache'}
      });
      if(!res.ok)throw new Error('Build147 cloud refresh failed ('+res.status+')');
      const rows=await res.json();return Array.isArray(rows)?rows:[];
    }finally{clearTimeout(timer)}
  }

  function rerender(){
    for(const name of ['renderProducts','renderInventory','renderOperations','renderOperationsDay','renderCarpetInventory','renderDashboard','renderMap','refreshMemory']){
      try{if(typeof window[name]==='function')window[name]()}catch(e){console.warn('[Build147] render',name,e)}
    }
  }

  async function refresh(reason='manual'){
    if(busy||navigator.onLine===false)return false;
    const session=read(SESSION);if(!session?.access_token)return false;
    const classified=classifyHeldInventory();
    if(!classified.heldQueueIds.size)return false;
    busy=true;
    try{
      const rows=await fetchCloudRows(session);
      const protect=protectedKeys(classified),groups=groupRemote(rows);
      MANAGED.forEach(dataset=>mergeDataset(dataset,groups.get(dataset),protect));
      rememberRemote(rows);
      localStorage.setItem(LAST_PULL,JSON.stringify({
        at:new Date().toISOString(),reason,heldInventory:classified.heldQueueIds.size,protectedRecords:protect.size
      }));
      document.documentElement.setAttribute('data-runlu-build147-held-inventory-refresh','ok');
      rerender();
      return true;
    }catch(e){
      console.warn('[Build147] held Inventory refresh',e);
      document.documentElement.setAttribute('data-runlu-build147-held-inventory-refresh','error');
      return false;
    }finally{busy=false}
  }

  window.RUNLUHeldInventoryRefreshBuild147={version:'147',classifyHeldInventory,protectedKeys,refresh};
  setTimeout(()=>refresh('boot'),1800);
  window.addEventListener('pageshow',()=>setTimeout(()=>refresh('pageshow'),350));
  window.addEventListener('focus',()=>setTimeout(()=>refresh('focus'),300));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(()=>refresh('visible'),300)});
})();
